import {NOTE_ENGLISH,noteUiText,noteChallengeCheckText} from '../../packages/dsh-research-task-runtime/notes-locale.js'
const notesChallengeLocale={text:noteUiText,check:noteChallengeCheckText}

/** The DOM event boundary accepts the same finite data model as notes-challenge.ts. */
export function normalizeNotesChallengeEvent(input, type) {
  try {
    let budget = 120000, nodes = 0
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
    const text = (value, limit, optional = false) => {
      if (optional && value === undefined) return undefined
      if (typeof value !== 'string' || value.length > limit || (!optional && !value.trim())) throw Error('text')
      budget -= value.length
      if (budget < 0) throw Error('budget')
      return value
    }
    const data = (value, depth = 0) => {
      if (++nodes > 2048 || depth > 5) throw Error('data budget')
      if (value === null || typeof value === 'boolean') return value
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string') return text(value, 12000, true)
      if (Array.isArray(value)) { if (value.length > 64) throw Error('array'); return value.map(item => data(item, depth + 1)) }
      if (!record(value)) throw Error('data')
      const keys = Object.keys(value)
      if (keys.length > 64) throw Error('keys')
      const result = Object.create(null)
      for (const key of keys) { text(key, 160); if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('key'); result[key] = data(value[key], depth + 1) }
      return result
    }
    const list = (value, limit, parse) => { if (!Array.isArray(value) || value.length > limit) throw Error('list'); return value.map(parse) }
    const evidence = value => {
      if (!record(value) || !['note', 'consensus'].includes(value.kind)) throw Error('evidence')
      const result = {kind:value.kind, label:text(value.label, 500)}
      if (value.blockId !== undefined) result.blockId = text(value.blockId, 256)
      if (value.quote !== undefined) result.quote = text(value.quote, 12000)
      if (value.data !== undefined) { if (!record(value.data)) throw Error('data'); result.data = data(value.data) }
      if (!result.quote && (!result.data || !Object.keys(result.data).length)) throw Error('empty evidence')
      return result
    }
    const check = value => {
      if (!record(value) || !['completed', 'unavailable', 'skipped', 'partial'].includes(value.status)) throw Error('check')
      return {kind:text(value.kind, 160),status:value.status,detail:text(value.detail, 4000)}
    }
    if (!record(input)) return null
    const result = {sessionId:text(input.sessionId, 256)}
    if (type === 'open') {
      if (input.threadId !== undefined) result.threadId = text(input.threadId, 256)
      if (input.quote !== undefined) result.quote = text(input.quote, 12000, true)
      result.evidence = list(input.evidence, 32, evidence)
      if (!result.evidence.length) return null
      result.checks = input.checks === undefined ? [] : list(input.checks, 32, check)
    } else if (type === 'state') {
      if (!Number.isInteger(input.level) || input.level < 0 || input.level > 4) return null
      const coverage = input.coverage
      if (!record(coverage) || !Number.isSafeInteger(coverage.checked) || !Number.isSafeInteger(coverage.total) || coverage.checked < 0 || coverage.checked > coverage.total || coverage.total > 100000) return null
      result.level = input.level; result.coverage = {checked:coverage.checked,total:coverage.total}
      result.checks = list(input.checks, 32, check)
      result.issues = list(input.issues, 64, value => {
        if (!record(value) || !['typo','grammar','contradiction','logic','fact','research','question','uncertain'].includes(value.category)) throw Error('issue')
        return {threadId:text(value.threadId,256),quote:text(value.quote,12000),category:value.category,message:text(value.message,4000),evidence:list(value.evidence,32,evidence)}
      })
    } else return null
    return result
  } catch { return null }
}

/** No note content enters persistent tab metadata. Reset clears even retained store references. */
export function createNotesChallengeSidebar({service, sessions, document, window, render}) {
  const stores = new Map(), opened = new Set()
  const title=()=>notesChallengeLocale.text('挑战',document.documentElement.dataset.odysseyLocale)
  let disposed = false
  const current = sessionId => !disposed && sessions.list.getSnapshot().current === sessionId && !!sessions.list.getSnapshot().byId[sessionId] && document.querySelector('[data-ework-notes-session]')?.getAttribute('data-ework-notes-session') === sessionId
  const storeFor = sessionId => {
    if (!stores.has(sessionId)) {
      let snapshot = null
      const listeners = new Set()
      stores.set(sessionId, {getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},set:value=>{snapshot=value;for(const fn of listeners)fn()}})
    }
    return stores.get(sessionId)
  }
  const controller = {
    storeFor,
    locate(blockId, quote, sessionId) {
      if (!current(sessionId)) return
      const snapshot = stores.get(sessionId)?.getSnapshot()
      if (!snapshot?.evidence.some(item=>item.kind==='note' && item.blockId===blockId && item.quote===quote)) return
      document.dispatchEvent(new window.CustomEvent('sherlock:notes-challenge-locate',{detail:{sessionId,blockId,...(quote?{quote}:{})}}))
    },
    recheck(sessionId) { if (current(sessionId) && stores.get(sessionId)?.getSnapshot()) document.dispatchEvent(new window.CustomEvent('sherlock:notes-challenge-recheck',{detail:{sessionId}})) },
    async openSource(url, sessionId) {
      if (!current(sessionId)) return false
      const snapshot = stores.get(sessionId)?.getSnapshot()
      const live = () => current(sessionId) && stores.get(sessionId)?.getSnapshot() === snapshot
      try {
        const parsed = new URL(url)
        if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) return false
        const open = window.dshDesktop?.conversationBrowser?.openSource
        if (typeof open !== 'function') return false
        await open({sessionId,url:parsed.href}); return live() ? true : null
      } catch { return live() ? false : null }
    },
    dispose() {
      if (disposed) return
      reset(); disposed = true; stores.clear()
      document.removeEventListener('sherlock:notes-challenge-open',open)
      document.removeEventListener('sherlock:notes-challenge-state',state)
      document.removeEventListener('sherlock:notes-reset',reset)
      localeObserver?.disconnect()
      unregister?.()
    }
  }
  const open = event => {
    const value = normalizeNotesChallengeEvent(event.detail,'open')
    if (!value || !current(value.sessionId)) return
    // Only user-opened tabs own snapshots, bounding background event retention.
    if (!stores.has(value.sessionId) && stores.size >= 8) {
      const oldest = stores.keys().next().value
      stores.get(oldest).set(null);stores.delete(oldest);opened.delete(oldest)
      service.closeTab?.('notes-challenge:'+oldest,{sessionId:oldest})
    }
    storeFor(value.sessionId).set(value);opened.add(value.sessionId)
    const scope = {sessionId:value.sessionId}
    service.openTab({id:'notes-challenge:'+value.sessionId,type:'sherlock-notes-challenge',title:title(),meta:{sherlockPanel:'right'}},scope)
    service.setPanelState({open:true},scope)
  }
  const state = event => {
    const value = normalizeNotesChallengeEvent(event.detail,'state')
    if (!value || !current(value.sessionId) || !opened.has(value.sessionId)) return
    const store = stores.get(value.sessionId), previous = store?.getSnapshot()
    if (!previous) return
    const issue = value.issues.find(item=>previous.threadId ? item.threadId===previous.threadId : item.quote===previous.quote)
    store.set({...value,threadId:previous.threadId,quote:issue?.quote ?? previous.quote,evidence:issue?.evidence ?? []})
  }
  const reset = () => {
    for (const [sessionId,store] of stores) {store.set(null);if(opened.has(sessionId))service.closeTab?.('notes-challenge:'+sessionId,{sessionId})}
    opened.clear()
  }
  const unregister = service.registerTab({id:'sherlock-notes-challenge',title,hidden:true,single:false,component:props=>render?.({...props,controller}) ?? null,onClose:(_tab,scope)=>{opened.delete(scope.sessionId);stores.get(scope.sessionId)?.set(null)}})
  const localeObserver=typeof window.MutationObserver==='function'?new window.MutationObserver(()=>{for(const sessionId of opened)service.updateTab?.('notes-challenge:'+sessionId,{title:title()},{sessionId})}):undefined
  localeObserver?.observe(document.documentElement,{attributes:true,attributeFilter:['data-odyssey-locale']})
  document.addEventListener('sherlock:notes-challenge-open',open)
  document.addEventListener('sherlock:notes-challenge-state',state)
  document.addEventListener('sherlock:notes-reset',reset)
  return controller
}

export function NotesChallengeTab({scope,controller,react:runtime}) {
  const h=runtime.createElement
  const [,localeChanged]=runtime.useState(0),t=notesChallengeLocale.text
  runtime.useEffect(()=>{const document=globalThis.document;if(!document||typeof MutationObserver!=='function')return;const observer=new MutationObserver(()=>localeChanged(value=>value+1));observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-odyssey-locale']});return()=>observer.disconnect()},[])
  const store=runtime.useMemo(()=>controller.storeFor(scope.sessionId),[controller,scope.sessionId])
  const snapshot=runtime.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot)
  const [error,setError]=runtime.useState('')
  runtime.useEffect(()=>setError(''),[scope.sessionId,snapshot])
  const linkText=(value,key)=> {
    const parts=String(value).split(/(https?:\/\/[^\s<>"']+)/g)
    return parts.map((part,index)=>/^https?:\/\//.test(part)?h('a',{key:key+index,href:part,style:{color:'inherit',textDecoration:'underline'},onClick:event=>{event.preventDefault();controller.openSource(part,scope.sessionId).then(ok=>{if(ok===false)setError(t('来源页面打开失败，请稍后重试。'))})}},part):part)
  }
  const box={margin:0,padding:'10px 0',borderBottom:'1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22))'}
  const label={margin:'0 0 8px',fontSize:12,fontWeight:600}
  if(!snapshot || snapshot.sessionId!==scope.sessionId)return h('div',{'data-notes-challenge-panel':'',style:{padding:16},children:t('尚无可查看的挑战依据。')})
  const incomplete=snapshot.checks.filter(check=>['partial','unavailable'].includes(check.status))
  const status={completed:t('已完成'),unavailable:t('不可用'),skipped:t('已跳过'),partial:t('部分完成')}
  return h('section',{'data-notes-challenge-panel':'','aria-label':t('挑战依据'),style:{height:'100%',boxSizing:'border-box',minHeight:0,overflow:'auto',padding:'8px 16px 20px',color:'inherit',fontSize:13,lineHeight:1.65,overflowWrap:'anywhere'}},
    snapshot.quote&&h('section',{style:box},h('h3',{style:label},t('原文')),h('blockquote',{style:{margin:0,paddingLeft:10,borderLeft:'2px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35))',whiteSpace:'pre-wrap'}},snapshot.quote)),
    h('section',{style:box},h('h3',{style:label},t('依据')),snapshot.evidence.length?snapshot.evidence.map((item,index)=>h('article',{key:index,style:{marginBottom:index<snapshot.evidence.length-1?16:0}},h('h4',{style:{...label,fontWeight:500}},item.label),
      item.quote&&h('p',{style:{margin:'4px 0',whiteSpace:'pre-wrap'}},linkText(item.quote,'quote')),
      item.kind==='note'&&item.blockId&&h('button',{type:'button',onClick:()=>controller.locate(item.blockId,item.quote,scope.sessionId),style:{font:'inherit',color:'inherit',cursor:'pointer',padding:'3px 8px',border:'1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3))',borderRadius:4,background:'transparent'}},t('定位原文')),
      item.data&&h('dl',{style:{display:'grid',gridTemplateColumns:'minmax(64px,1fr) minmax(0,2fr)',gap:'5px 12px',margin:'8px 0 0'}},Object.entries(item.data).map(([key,value])=>h(runtime.Fragment,{key},h('dt',{style:{opacity:.65}},key),h('dd',{style:{margin:0,whiteSpace:'pre-wrap'}},linkText(typeof value==='object'?JSON.stringify(value,null,2):String(value),key)))))))
      :h('p',{style:{margin:0,opacity:.65}},t('当前问题已无可查看依据。'))),
    h('section',{style:box},h('h3',{style:label},t('检查覆盖')),h('p',{style:{margin:0}},snapshot.coverage?t('{checked} / {total} 段').replace('{checked}',()=>String(snapshot.coverage.checked)).replace('{total}',()=>String(snapshot.coverage.total)):t('本次未提供覆盖统计')),
      snapshot.checks.map((check,index)=>h('div',{key:index,style:{marginTop:8}},h('span',{style:{opacity:.65}},(globalThis.document?.documentElement?.dataset?.odysseyLocale==='en'?t(({review:'正文检查',coverage:'段落覆盖',consensus:'一致预期比较'})[check.kind]||check.kind):check.kind)+' · '+status[check.status]),h('p',{style:{margin:0,whiteSpace:'pre-wrap'}},linkText(notesChallengeLocale.check(check.detail),'check'+index))))),
    incomplete.length>0&&h('section',{style:box},h('h3',{style:label},t('未完成项')),incomplete.map((check,index)=>h('p',{key:index,style:{margin:'4px 0',whiteSpace:'pre-wrap'}},notesChallengeLocale.check(check.detail)))),
    h('button',{type:'button',onClick:()=>controller.recheck(scope.sessionId),style:{marginTop:12,font:'inherit',color:'inherit',background:'transparent',border:'1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3))',borderRadius:4,padding:'4px 10px',cursor:'pointer'}},t('重新检查')),
    error&&h('p',{role:'alert',style:{margin:'8px 0'}},error))
}

export function patchNotesChallengeClient(source) {
  const start='/* EWORK_NOTES_CHALLENGE_CLIENT_BEGIN */',end='/* EWORK_NOTES_CHALLENGE_CLIENT_END */'
  const helpers=`${start}\n/* ework:notes-challenge-client:v1 */\nconst notesChallengeLocale=(()=>{const NOTE_ENGLISH=${JSON.stringify(NOTE_ENGLISH)};${noteUiText.toString()}\n${noteChallengeCheckText.toString()}\nreturn {text:noteUiText,check:noteChallengeCheckText}})();\n${normalizeNotesChallengeEvent.toString()}\n${createNotesChallengeSidebar.toString()}\n${NotesChallengeTab.toString()}\n${end}\n`
  const exact=(before,after)=>{if(source.split(before).length!==2)throw Error('Notes challenge anchor missing or ambiguous: '+before.slice(0,75));source=source.replace(before,after)}
  if(source.includes(start)) {
    const a=source.indexOf(start),b=source.indexOf(end,a)
    if(b<0 || source.indexOf(start,a+1)>=0)throw Error('Notes challenge definitions anchor missing or ambiguous')
    source=source.slice(0,a)+helpers+source.slice(b+end.length).replace(/^\n/,'')
  } else {
    // Small isolated header fixtures do not contain the sidebar coordinator.
    if(!source.includes('class ResearchSidebarCoordinator {'))return source
    exact('class ResearchSidebarCoordinator {',helpers+'class ResearchSidebarCoordinator {')
  }
  const registration='/* ework:notes-challenge-registration:v1 */\nconst notesChallengeSidebar=createNotesChallengeSidebar({service,sessions,document,window,render:props=>react_jsx_runtime.jsx(NotesChallengeTab,{...props,react})});\n'
  if(!source.includes(registration))exact('const unregisterGenerated=service.registerTab(',registration+'const unregisterGenerated=service.registerTab(')
  if(!source.includes('notesChallengeSidebar.dispose();'))exact('unregisterGenerated?.();','notesChallengeSidebar.dispose();unregisterGenerated?.();')
  return source
}
