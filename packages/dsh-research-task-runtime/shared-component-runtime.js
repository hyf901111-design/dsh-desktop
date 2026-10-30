// Serialized into the opaque generated HTML sandbox before its own scripts.
export function sharedComponentRuntime(semantic) {
  let config, state, revision = 0, token = '', host = false, connected = false, readOnly = true, local = false
  let waiting = false, proposal, pending = [], lastTick = Date.now(), stopped = false
  let localAck=false,localProposal,localSaved
  const uuid = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('')
  const peerId = uuid(), listeners = new Set(), outgoing = new Map()
  let inputSequence = 0, lastResponse = Date.now()
  const clone = value => JSON.parse(JSON.stringify(value))
  const valid = (value, max = 65536) => { try { const text = JSON.stringify(value); return text !== undefined && new TextEncoder().encode(text).length <= max } catch { return false } }
  const post = message => parent.postMessage({ type: 'sherlock-component-send', message: { ...message, peerId } }, '*')
  const status = () => ({ connected, readOnly, isHost: host, userId: identity, revision,...localAck?{saving:!!localProposal}:{} })
  let identity = ''
  function paint() {
    if (!config) return
    config.render(clone(state), status())
    for (const listener of listeners) listener(clone(state), status())
  }
  if(semantic)semantic.restoreShared=paint
  function operationError(message) {
    // Retain the interactive view and last valid state. Generated exception
    // text can contain source data, so only show a fixed host message.
    let notice = document.querySelector('[data-sherlock-operation-error]')
    if (!notice && document.body) {
      notice = document.createElement('div')
      notice.setAttribute('data-sherlock-operation-error', '')
      notice.setAttribute('role', 'alert')
      notice.style.cssText = 'padding:8px 12px;border-bottom:1px solid var(--sherlock-border);color:var(--sherlock-text);background:var(--sherlock-surface-muted);font:12px/18px var(--sherlock-font-sans)'
      document.body.prepend(notice)
    }
    if (notice) notice.textContent = message
    try { config?.onStatus?.({ ...status(), error: message }) } catch {}
    window.dispatchEvent(new CustomEvent('sherlock-shared-status', { detail: { ...status(), error: message } }))
    return false
  }
  function clearOperationError() { document.querySelector('[data-sherlock-operation-error]')?.remove() }
  function localUpdate(next) {
    const previous = state, previousRevision = revision
    try {
      if (!valid(next)) throw Error('Invalid component state')
      state = clone(next); revision++
      // A reducer can return JSON which the component cannot render. Persist
      // only after rendering succeeds, otherwise reopening poisons the frame.
      paint()
    } catch {
      state = previous; revision = previousRevision
      try { paint() } catch {}
      return operationError('本次操作未完成，已保留之前的内容。可重试或重新生成组件。')
    }
    clearOperationError()
    if(localAck){
      waiting=true;localProposal={commitId:uuid(),state:clone(state),revision,startedAt:Date.now()}
      post({op:'localCommit',commitId:localProposal.commitId,state:clone(state),revision})
    }else post({ op: 'localCommit', state: clone(state), revision })
    return true
  }
  function rejectLocal(){
    if(!localProposal)return
    state=clone(localSaved?localSaved.state:config.initialState);revision=localSaved?.revision??0
    localProposal=undefined;waiting=false;pending=[]
    try{paint()}catch{}
    operationError('本次交互未保存，已恢复上次保存状态。请重试。')
  }
  function fail(message) {
    waiting = false; proposal = undefined; host = false; connected = false; pending = []
    try { paint() } catch {}
    config?.onStatus?.({ ...status(), error: message })
    window.dispatchEvent(new CustomEvent('sherlock-shared-status', { detail: { ...status(), error: message } }))
  }
  function commit(next, ack) {
    if (!valid(next)) { fail('组件状态过大或不是有效的 JSON'); return }
    waiting = true; proposal = { state: clone(next), revision: revision + 1, ack }
    post({ op: 'commit', token, ...proposal })
  }
  function run(tick = false) {
    if (!config || !connected || !host || waiting || stopped) return
    try {
      let next = clone(state), ack = []
      for (const input of pending) {
        next = config.reduce(next, clone(input.payload), { userId: input.userId })
        ack.push(input.id)
      }
      pending = []
      if (tick && config.tick && config.tickMs) {
        const now = Date.now(), dtMs = Math.min(1000, Math.max(0, now - lastTick)); lastTick = now
        next = config.tick(next, { dtMs, now })
      }
      if (!ack.length && JSON.stringify(next) === JSON.stringify(state)) return
      if (local) return localUpdate(next)
      if (ack.length || JSON.stringify(next) !== JSON.stringify(state)) commit(next, ack)
    } catch (error) {
      pending = []
      if (local) return operationError('本次操作未完成，已保留之前的内容。可重试或重新生成组件。')
      fail('组件状态更新失败：' + String(error.message).slice(0, 160))
    }
  }
  const handle = Object.freeze({
    getState: () => clone(state),
    getStatus: status,
    dispatch(action) {
      // Restoring old native events must never create a fresh shared revision.
      // The journal runtime repaints the authoritative shared snapshot afterwards.
      if(semantic?.replaying||document.documentElement.hasAttribute('data-sherlock-interaction-replaying'))return false
      if (!connected || readOnly || stopped) return false
      if (!valid(action, 4096)) return false
      const payload=clone(action)
      let admitted=result=>result
      if(semantic?.current){
        const current=semantic.current,activation=semantic.activation
        semantic.events.add(current)
        if(activation?.target===current.target){
          // Checkbox activation emits click, input and change synchronously.
          // Consume their original click and admit the same action only once,
          // while retaining distinct actions (or repeated calls in one handler).
          semantic.events.add(activation.event)
          const key=JSON.stringify(payload,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value),previous=activation.actions.get(key)
          if(previous&&previous!==current)return true
          admitted=result=>{if(result===true&&!previous&&activation.actions.size<32)activation.actions.set(key,current);return result}
        }
      }
      if(local&&localAck&&waiting&&pending.length>=32)return operationError('交互保存繁忙，请等待当前操作保存后重试。')
      const inputId = uuid()
      if (local) { pending.push({ id: inputId, payload, userId: identity }); return admitted(localAck&&waiting?true:run() === true) }
      else {
        if (outgoing.size >= 32) return false
        const message = { op: 'input', inputId, sequence: ++inputSequence, payload }
        outgoing.set(message.sequence, message); post(message)
      }
      return admitted(true)
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    dispose() { stopped = true; connected = false; host = false; clearInterval(heartbeat); clearInterval(ticker); post({ op: 'leave' }); listeners.clear() }
  })
  Object.defineProperty(window, 'sherlockShared', { value: Object.freeze({
    inspect() { return config ? {state:clone(state),...status()} : null },
    register(options) {
      if (config) throw Error('每个组件只能注册一个共享状态容器')
      if (!options || typeof options.reduce !== 'function' || typeof options.render !== 'function' || !valid(options.initialState)) throw Error('无效的共享状态配置')
      document.documentElement.setAttribute('data-sherlock-shared-state', '1')
      config = options; state = clone(options.initialState)
      if (options.tickMs !== undefined && (!Number.isFinite(options.tickMs) || options.tickMs < 100)) throw Error('tickMs 最小为 100ms')
      paint(); post({ op: 'join' }); return handle
    }
  }), writable: false, configurable: false })
  addEventListener('message', event => {
    if (event.source !== parent || !config || stopped) return
    const data = event.data
    if (data?.type === 'sherlock-component-context') {
      identity = data.userId || 'local'
      readOnly = data.readOnly !== false
      if (!data.shared) {
        localAck=data.localAck===true
        if(semantic)semantic.notes=localAck
        localSaved=data.saved&&Number.isSafeInteger(data.saved.revision)&&valid(data.saved.state)?data.saved:undefined
        if(localAck&&readOnly&&localProposal)rejectLocal()
        const previous = state
        const restoring = (!local||localAck&&!localProposal) && data.saved && Number.isSafeInteger(data.saved.revision) && valid(data.saved.state)
        if (restoring) { state=clone(data.saved.state);revision=data.saved.revision }
        else if(localAck&&!localProposal&&local&&!data.saved){state=clone(config.initialState);revision=0}
        local = true; connected = true; host = !readOnly
        if(localAck&&localProposal)return
        try { paint() } catch {
          state = previous
          try { paint() } catch {}
          operationError(restoring ? '先前交互记录暂时无法恢复，正在显示初始内容。原记录仍保留，可重新生成组件。' : '本次操作未完成，已保留之前的内容。可重试或重新生成组件。')
        }
        return
      }
      local = false
      if (!data.online) { fail('连接中断，组件同步已暂停'); return }
      return
    }
    if (data?.type !== 'sherlock-component-receive') return
    const m = data.message
    if (m?.peerId !== peerId) return
    if(localAck&&local&&m.kind==='local-commit'){
      if(!localProposal||m.commitId!==localProposal.commitId)return
      if(m.ok!==true||m.revision!==localProposal.revision||!valid(m.state)||JSON.stringify(m.state)!==JSON.stringify(localProposal.state)){rejectLocal();return}
      localSaved={state:clone(m.state),revision:m.revision};localProposal=undefined;waiting=false;clearOperationError();paint();run();return
    }
    lastResponse = Date.now()
    if (Number.isSafeInteger(m.accepted)) for (const seq of outgoing.keys()) if (seq <= m.accepted) outgoing.delete(seq)
    if (m.kind === 'receipt') return
    if (m.kind === 'error') { fail(m.error || '组件同步暂不可用'); return }
    if (m.kind === 'snapshot') {
      if (m.token === token && m.revision < revision) return
      const changedHost = token !== m.token
      token = m.token; host = m.isHost === true; readOnly = m.readOnly !== false; connected = true
      if (changedHost) { waiting = false; proposal = undefined; pending = []; lastTick = Date.now() }
      if (waiting && m.revision >= proposal.revision) { waiting = false; proposal = undefined }
      revision = m.revision
      state = clone(m.state === null && revision === 0 ? config.initialState : m.state)
      paint(); config.onStatus?.(status())
      if (host && revision === 0 && !waiting) commit(state, [])
      else run()
    } else if (m.kind === 'inputs' && m.token === token && host && connected) {
      // The service resends unacknowledged actions on join/takeover. Do not
      // apply actions already included in our one outstanding proposal twice.
      pending = m.inputs.filter(i => !proposal?.ack.includes(i.id))
      run()
    }
  })
  const heartbeat = setInterval(() => {
    if (!config || stopped) return
    if(local){if(localAck&&localProposal&&Date.now()-localProposal.startedAt>15000)rejectLocal();return}
    if (connected && Date.now()-lastResponse>15000) fail('连接中断，组件同步已暂停')
    // Resend the SAME revision after a lost acknowledgment, never advance it.
    if (waiting && proposal) post({ op: 'commit', token, ...proposal })
    post({ op: 'join' })
    if (!readOnly) for (const message of outgoing.values()) post(message)
  }, 5000)
  const ticker = setInterval(() => {
    if (config?.tick && Date.now() - lastTick >= (config.tickMs || 100)) run(true)
  }, 25)
  addEventListener('pagehide', () => handle.dispose(), { once: true })
}
