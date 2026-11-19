import { imageLayerReferenceCodec, imageLayerReferenceParts, bindImageLayerReferences, isImageLayerPreview, readImageLayerReference, readImageLayerReceipts } from './image-factory-layer-references.mjs'
import { imageGenerationCalls } from './image-generation-client.mjs'
import { imageFactoryPrompt, readImageFactoryContext, stripImageFactoryContext } from '../../packages/dsh-research-task-runtime/image-factory-context.js'
import { createImageFactoryTasks } from './image-factory-tasks.mjs'

/** Connect the current canvas to native admission, without owning a message list or a composer. */
export function installImageFactoryContext({
  sessions, getInput, getPending, send, doc = document, win = window, encodePrompt = imageFactoryPrompt,
  getTaskWorkspace, getDefaultWorkspace, getProjectDraft, hasProjectDraftActivity, getExistingInput = getInput, standaloneDirectory, setTaskView, taskStorage, removeProvisionalReference, isBoardOnly = () => false,
}) {
  const jobs = new Map(), listeners = new Set()
  let canvasState = { current: false, busy: false }, state = { ...canvasState, creating: false }
  let galleryDrafts = new WeakMap(), draftOwner
  const isActive = () => doc.body.dataset.workspaceSurface === 'image-factory'
  const currentId = () => sessions.list.getSnapshot().current
  const canvasScope = () => {
    const id = currentId()
    return id && id !== draftOwner && !isBoardOnly(id) ? id : null
  }
  const pendingCreated = ({ detail }) => {
    // Only the first-message handoff may carry the standalone canvas into a session.
    if (isActive() && typeof detail?.sessionId === 'string') draftOwner = detail.sessionId
  }
  const nativeInput = () => currentId() ? getInput(currentId()) : getPending()?.shell
  const signal = (name, detail) => doc.dispatchEvent(new win.CustomEvent('sherlock:image-factory-' + name, { detail, cancelable: name === 'inspect-tab' }))
  function hasTabActivity(scope) {
    const catalog = sessions.list.getSnapshot()
    const summary = scope !== null && catalog.byId[scope]
    // Only recycle sessions the Host confirms are empty.
    if (scope !== null && (summary?.blank !== true || summary.running)) return true
    if (!signal('inspect-tab', { scope })) return true
    if ([...jobs.values()].some(job => job.sessionId === scope || scope === null && job.draft)) return true
    if (hasProjectDraftActivity?.(scope ?? undefined)) return true
    const pending = scope === null ? getPending() : undefined
    const pendingState = pending?.getSnapshot?.()
    if (pendingState?.busy || pendingState?.activating) return true
    const session = scope === null ? undefined : sessions.binding(scope)?.session?.getSnapshot()
    if (session?.blank === false || session?.running || session?.queue?.length || session?.pending?.length || session?.subagent) return true
    const input = (scope === null ? pending?.shell : getExistingInput(scope))?.snapshot
    return Boolean(input?.draft?.trim() || input?.imageIds?.length || input?.occurrences?.length)
  }
  const tasks = createImageFactoryTasks({ sessions, win, isActive, syncSession, getWorkspace: getTaskWorkspace, getDefaultWorkspace, standaloneDirectory,
    setView: setTaskView, storage: taskStorage, hasTabActivity, isBoardOnly,
    signal(name, detail) {
      if (name === 'task-state') publishState()
      signal(name, detail)
    } })
  function publishState() {
    const creating = tasks.isCreating()
    const current = !creating && canvasState.current
    const busy = creating || canvasState.busy
    if (state.current === current && state.busy === busy && state.creating === creating) return
    state = { current, busy, creating }
    for (const listener of listeners) listener()
  }
  const stateChange = event => {
    canvasState = { current: event.detail?.current === true, busy: event.detail?.busy === true }
    publishState()
    syncLayerPreview()
  }
  const focus = () => win.requestAnimationFrame(() => doc.querySelector('#odyssey-right-workspace-panel textarea:not([disabled])')?.focus({ preventScroll: true }))
  const finish = (id, updateScope = true) => {
    const job = jobs.get(id)
    if (job) { win.clearTimeout(job.timer); win.clearTimeout(job.idle); job.unsubscribe?.(); jobs.delete(id) }
    signal('settled', { id })
    if (job?.draft && updateScope) syncSession()
  }
  function fill(prompt, gallery = false) {
    const shell = getProjectDraft?.()?.shell ?? nativeInput()
    if (!shell || shell.disposed || !isActive() || state.busy || typeof prompt !== 'string' || !prompt.trim()) return false
    const draft = shell.snapshot.draft
    if (!gallery && draft.trim()) { focus(); return true }
    const previous = galleryDrafts.get(shell)
    const original = previous && draft === previous.combined ? previous.original : draft
    const combined = original.trim() ? original.trimEnd() + '\n\n' + prompt : prompt
    if (combined.length > 3600) { shell.notify('error', '添加示例后超出 3600 字，请先缩短当前描述。'); return false }
    if (gallery) galleryDrafts.set(shell, { original, combined })
    else galleryDrafts.delete(shell)
    shell.setDraft(combined)
    focus()
    return true
  }
  const usePrompt = event => { if (!state.current && fill(event.detail?.prompt, true)) event.preventDefault() }
  let pendingLayer
  const composer = () => doc.querySelector('#odyssey-right-workspace-panel textarea')
  function clearLayerPreview(shell = pendingLayer?.shell, occurrenceId = pendingLayer?.occurrenceId) {
    const previous = pendingLayer
    if (!previous || previous.shell !== shell || previous.occurrenceId !== occurrenceId) return
    pendingLayer = undefined
    if (!shell.disposed) return removeProvisionalReference?.(shell, occurrenceId, previous.trailingSpace)
  }
  function syncLayerPreview() {
    if (!pendingLayer) return
    const { reference, shell } = pendingLayer
    if (!isActive() || !state.current || state.busy || canvasScope() !== reference.scope || nativeInput() !== shell || shell.disposed)
      clearLayerPreview()
  }
  const referenceLayer = event => {
    if (!isActive() || !state.current || state.busy || event.detail?.scope !== canvasScope()) return
    const shell = nativeInput(), snapshot = shell?.snapshot
    if (!snapshot || shell.disposed || snapshot.phase !== 'plain' || snapshot.researchContextPreparing) return
    let reference
    try { reference = readImageLayerReference(JSON.stringify(event.detail)) } catch { return }
    if (reference.provisional) return
    const ref = JSON.stringify({ ...reference, provisional: true })
    const input = composer()
    let offset = input?.value.length === snapshot.draft.length ? input.selectionEnd : snapshot.draft.length
    const previous = pendingLayer
    const removed = clearLayerPreview()
    if (removed && previous?.shell === shell && removed.caret < offset) offset -= Math.min(removed.removedLength, offset - removed.caret)
    const before = shell.snapshot
    const beforeLength = before.draft.length
    offset = Math.min(offset, beforeLength)
    if (!shell.insertReference({ source: 'image-factory-layer', ref, label: reference.label, clipboardText: '' },
      { start: offset, end: offset, draftRev: before.draftRev })) return
    const after = shell.snapshot
    const occurrence = after.occurrences.find(item => item.offset === offset && item.ref === ref && isImageLayerPreview(item))
    if (!occurrence) return
    const insertedLength = after.draft.length - beforeLength
    pendingLayer = { reference, shell, occurrenceId: occurrence.occurrenceId, trailingSpace: insertedLength > 1 }
    if (input) win.requestAnimationFrame(() => {
      if (!input.isConnected || shell.snapshot.draftRev !== after.draftRev || input.value.length !== after.draft.length) return
      input.setSelectionRange(offset + insertedLength, offset + insertedLength)
    })
  }
  function confirmLayerPreview(shell) {
    syncLayerPreview()
    const pending = pendingLayer
    if (!pending || pending.shell !== shell) return
    const label = pending.reference.label
    const inserted = shell.updateReferenceOccurrence(pending.occurrenceId, {
      source: 'image-factory-layer', ref: JSON.stringify(pending.reference), label, clipboardText: label,
    })
    if (inserted) pendingLayer = undefined
  }
  const cancelPreview = event => { if (event.key === 'Escape') clearLayerPreview() }
  function request(id, sessionId, scope, prompt, uploaded, operation, layers) {
    return new Promise((resolve, reject) => {
      const cleanup = () => { win.clearTimeout(timer); doc.removeEventListener('sherlock:image-factory-prepared', reply) }
      const reply = event => {
        const data = event.detail
        if (data?.id !== id) return
        cleanup()
        if (data.error) reject(Error(data.error))
        else resolve(data)
      }
      const timer = win.setTimeout(() => { cleanup(); finish(id); reject(Error('图像画布尚未就绪，请重试。')) }, 12000)
      doc.addEventListener('sherlock:image-factory-prepared', reply)
      signal('prepare', { id, sessionId, scope, prompt, uploaded, region: operation === 'region', cutout: operation === 'cutout', layers })
    })
  }
  async function prepare(sessionId, content, action) {
    const { parts, layers, hasInstructions } = bindImageLayerReferences(content)
    const targeted = layers.length > 0
    if (isActive() && tasks.isCreating()) throw Error('正在创建图片任务，输入已保留。')
    if (!isActive() || currentId() !== sessionId || isBoardOnly(sessionId)) {
      if (action || targeted) throw Error('当前会话或画布已切换。')
      return { content }
    }
    if (targeted && !hasInstructions) throw Error('请输入要如何修改引用的图层。')
    content = parts
    const text = content.filter(part => part.type === 'text').map(part => part.text).join('\n')
    if (!text.trim()) return { content }
    if (!action && !targeted && /^\/[a-z][a-z0-9_-]*(?:\s|$)/i.test(text.trim())) return { content }
    const id = action?.id ?? win.crypto.randomUUID()
    const scope = canvasScope()
    if (layers.some(layer => layer.scope !== scope)) throw Error('图层属于另一个画板，请重新选择图层。')
    try {
      const imageCount = content.filter(part => part.type === 'image').length
      const response = await request(id, sessionId, scope, text, imageCount > 0, action?.operation, targeted ? layers : undefined)
      if (!isActive() || currentId() !== sessionId || canvasScope() !== scope) throw Error('当前会话或画布已切换，草稿已保留。')
      if (action && response.operation !== action.operation) throw Error('当前画布已变化，请重试。')
      const { operation, size, width, height, title, reference, editBounds, targetLayers } = response
      if (targeted && (operation !== 'layer' || targetLayers?.length !== layers.length ||
          targetLayers.some((target, index) => target.key !== layers[index].key))) throw Error('引用的图层已变化，请重新选择。')
      if (reference && imageCount > 3) throw Error('编辑当前画布时，最多可再附加三张参考图。')
      const next = [...content]
      const index = next.findLastIndex(part => part.type === 'text')
      const receiptTitle = title.replace(/[\p{Cc}]/gu, ' ').trim().slice(0, 100) || '画布'
      next[index] = { type: 'text', text: encodePrompt(next[index].text, { id, operation, size, width, height,
        title: receiptTitle, internalReference: !!reference, editBounds, targetLayers }) }
      if (reference) next.push({ type: 'image', data: reference.data, mediaType: reference.mediaType, name: targetLayers?.find(layer => layer.kind === 'image')?.label ?? '当前画布' })
      jobs.set(id, { id, sessionId, targetLayers, draft: scope === null, timer: win.setTimeout(() => finish(id), 615000) })
      return { content: next, id }
    } catch (error) { finish(id); throw error }
  }
  const promoteDraft = job => {
    if (job.draft && !job.promotion) {
      job.promotion = adopt(job.sessionId).catch(() => {})
      if (draftOwner === job.sessionId) draftOwner = undefined
      tasks.bindDraft(job.sessionId)
      syncSession()
    }
    return job.promotion
  }
  function watch(session, job) {
    const owns = content => content?.some(part => part.type === 'text' && readImageFactoryContext(part.text)?.id === job.id)
    const observe = () => {
      if (jobs.get(job.id) !== job || job.delivering) return
      const { chat, running, queue } = session.getSnapshot()
      if (!chat) return
      const nodes = chat.order.slice(-150).map(key => chat.nodes.get(key)).filter(Boolean)
      const queued = queue?.some(row => owns(row.content))
      job.wasQueued ||= queued
      const startsTurn = row => row.kind === 'user' || row.kind === 'steering'
      const turnIndex = nodes.findIndex(row => startsTurn(row) && owns(row.data?.content))
      job.admitted ||= turnIndex >= 0
      if (job.admitted) void promoteDraft(job)
      const delivered = imageGenerationCalls(nodes, running).find(call => call.state === 'completed' && call.factory?.id === job.id)
      if (job.targetLayers) {
        job.edits ??= new Map()
        for (const [key, patch] of readImageLayerReceipts(nodes, job.id))
          job.edits.set(key, { ...job.edits.get(key), ...patch })
        job.image ??= delivered
        if (!job.image && !job.imageFailed && turnIndex >= 0 && job.targetLayers.some(layer => layer.kind === 'image')) {
          const nextTurn = nodes.findIndex((row, index) => index > turnIndex && startsTurn(row))
          const turn = nodes.slice(turnIndex + 1, nextTurn === -1 ? undefined : nextTurn)
          job.imageFailed = imageGenerationCalls(turn, running).some(call => call.state === 'failed' || call.state === 'cancelled')
        }
        // Each tool may finish at a different time. Apply the turn's results together
        // once its native admission and model execution have settled.
        if (!queued && (job.admitted ? !running : job.wasQueued)) {
          job.idle ??= win.setTimeout(() => {
            job.idle = undefined
            if (job.delivering || jobs.get(job.id) !== job) return
            const settled = session.getSnapshot()
            if ((job.admitted && settled.running) || settled.queue?.some(row => owns(row.content))) return
            const edits = [...job.edits].map(([key, patch]) => ({ key, patch }))
            const image = job.image
            if (!edits.length && !image && !job.imageFailed) return finish(job.id)
            job.delivering = true
            void (async () => {
              let url
              let imageError = !image && job.imageFailed === true
              try {
                await promoteDraft(job)
                if (image) {
                  try {
                    const result = await session.readAttachment(image.image.attachmentId)
                    if (!result.ok) throw Error(result.error.message)
                    url = URL.createObjectURL(new Blob([Uint8Array.from(result.value.data)], { type: result.value.attachment.mediaType }))
                  } catch { imageError = true }
                }
                if (jobs.get(job.id) !== job) {
                  if (url) URL.revokeObjectURL(url)
                  return
                }
                signal('deliver-layers', { id: job.id, sessionId: job.sessionId, edits, url, imageKey: image?.factory?.layerTarget, imageError })
              } finally { if (jobs.get(job.id) === job) finish(job.id) }
            })().catch(() => {})
          }, 750)
        } else {
          win.clearTimeout(job.idle)
          job.idle = undefined
        }
        return
      }
      if (delivered) {
        job.delivering = true
        void Promise.all([session.readAttachment(delivered.image.attachmentId), promoteDraft(job)]).then(([result]) => {
          if (jobs.get(job.id) !== job) return
          if (!result.ok) throw Error(result.error.message)
          const bytes = Uint8Array.from(result.value.data)
          const url = URL.createObjectURL(new Blob([bytes], { type: result.value.attachment.mediaType }))
          const sessionTitle = sessions.list.getSnapshot().byId?.[job.sessionId]?.title
          signal('deliver', { id: job.id, sessionId: job.sessionId, sessionTitle, url, revoke: true })
          finish(job.id)
        }).catch(() => finish(job.id))
        return
      }
      // The inbox may clear just before its durable turn appears. Allow that handoff,
      // but settle a removed request even while a different turn is still running.
      if (!queued && (job.admitted ? !running : job.wasQueued)) {
        job.idle ??= win.setTimeout(() => { if (!job.delivering) finish(job.id) }, 1500)
      } else {
        win.clearTimeout(job.idle)
        job.idle = undefined
      }
    }
    job.unsubscribe = session.subscribe(observe)
    observe()
  }
  async function prompt(session, content, mode, action) {
    let next
    try { next = await prepare(session.sessionId, content, action) }
    catch (error) {
      if (content.some(part => part.type === 'text' && imageLayerReferenceParts(part.text).length))
        getInput(session.sessionId)?.notify('error', error.message)
      throw error
    }
    try {
      if (next.id) watch(session, jobs.get(next.id))
      const result = await session.prompt(next.content, mode)
      if (!result.ok && next.id) finish(next.id)
      return result
    } catch (error) { if (next.id) finish(next.id); throw error }
  }
  async function submitCanvasAction(event, operation) {
    const { id, prompt: text } = event.detail ?? {}
    if (!isActive() || typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(id) ||
        typeof text !== 'string' || !text.trim() || text.length > 3600) return
    event.preventDefault()
    const reply = error => signal(operation === 'region' ? 'comment-result' : 'cutout-result', { id, error })
    const submit = async sessionId => {
      if (!isActive() || currentId() !== sessionId) throw Error('当前会话或画布已切换。')
      const session = sessions.binding(sessionId)?.session
      const snapshot = session?.getSnapshot()
      if (!session || !snapshot || snapshot.running || snapshot.queue?.length || snapshot.subagent) throw Error('请等当前对话处理完成后再提交。')
      const result = await send(session, [{ type: 'text', text: text.trim() }], 'queue', { id, operation })
      if (!result?.ok) throw Error(result?.error?.message || '图片请求发送失败，请重试。')
    }
    try {
      const sessionId = currentId()
      if (sessionId) await submit(sessionId)
      else {
        const pending = getPending()
        if (!pending) throw Error('对话服务尚未就绪。')
        await pending.submitExternal(submit)
      }
      reply()
    } catch (error) { reply(error.message) }
  }
  function adopt(sessionId) {
    return new Promise((resolve, reject) => {
      const cleanup = () => { win.clearTimeout(timer); doc.removeEventListener('sherlock:image-factory-adopted', reply) }
      const reply = event => {
        if (event.detail?.sessionId !== sessionId) return
        cleanup()
        if (event.detail.error) reject(Error(event.detail.error)); else resolve()
      }
      const timer = win.setTimeout(() => { cleanup(); reject(Error('画布未能绑定到会话，请重试。')) }, 12000)
      doc.addEventListener('sherlock:image-factory-adopted', reply)
      signal('adopt', { sessionId })
    })
  }
  let publishedScope, intendedCanvas
  function syncSession(force = false, reopen, entry = false) {
    const scope = canvasScope()
    const sessionId = tasks.sync(scope, scope !== null && (scope === reopen || scope === intendedCanvas), entry)
    if (!force && sessionId === publishedScope) return
    publishedScope = sessionId
    signal('session', { sessionId })
  }
  const offSession = sessions.list.subscribe?.(() => { syncSession(); syncLayerPreview() })
  const reset = () => {
    for (const id of jobs.keys()) finish(id, false)
    galleryDrafts = new WeakMap()
    clearLayerPreview()
    publishedScope = intendedCanvas = draftOwner = undefined
    tasks.reset()
  }
  const events = { state: stateChange, 'request-session': event => syncSession(true, event.detail?.reopen, event.detail?.entry), 'use-prompt': usePrompt, 'reference-layer': referenceLayer, 'reference-clear': () => clearLayerPreview(),
    comment: event => { void submitCanvasAction(event, 'region') },
    cutout: event => { void submitCanvasAction(event, 'cutout') },
    'focus-chat': focus, reset,
    'canvas-intent': event => { intendedCanvas = event.detail },
    'canvas-intent-ended': event => { if (event.detail === intendedCanvas) intendedCanvas = undefined },
    'project-selected': event => tasks.projectSelected(event.detail),
    'project-changed': event => { if (event.detail?.previous === currentId()) tasks.replaceActive(event.detail.previous, event.detail.next) },
    'task-action': event => {
      const detail = event.detail
      const pending = tasks.action(detail)
      if (detail?.kind !== 'new' || typeof detail.requestId !== 'string' || !/^[a-f0-9-]{36}$/u.test(detail.requestId)) return
      void pending.then(scope => signal('task-created', { requestId: detail.requestId,
        scope: isActive() && canvasScope() === scope ? scope : undefined }))
    }, 'task-title': event => tasks.setTitle(event.detail),
    'request-task-state': () => tasks.publish(true) }
  for (const [name, handler] of Object.entries(events)) doc.addEventListener('sherlock:image-factory-' + name, handler)
  const surfaceChange = event => {
    if (isActive() && event.detail?.back) syncSession(true, undefined, true)
    syncLayerPreview()
  }
  doc.addEventListener('sherlock:workspace-surface-change', surfaceChange)
  doc.addEventListener('keydown', cancelPreview, true)
  win.addEventListener('sherlock:pending-conversation-created', pendingCreated)
  signal('request-state', {})
  syncSession()
  return {
    prompt, fill, focus, confirmLayerPreview, clearLayerPreview, action: kind => { if (!tasks.isCreating()) signal('action', { kind }) },
    getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    dispose() {
      offSession?.()
      doc.removeEventListener('sherlock:workspace-surface-change', surfaceChange)
      doc.removeEventListener('keydown', cancelPreview, true)
      win.removeEventListener('sherlock:pending-conversation-created', pendingCreated)
      reset()
      for (const [name, handler] of Object.entries(events)) doc.removeEventListener('sherlock:image-factory-' + name, handler)
      listeners.clear()
    },
  }
}

function imageFactoryDisplayContent(content, context = imageFactoryContentContext(content)) {
  if (!Array.isArray(content)) return content
  if (!context) return content
  const internal = context.internalReference ? content.findLastIndex(part => part.type === 'image') : -1
  return content.filter((_, index) => index !== internal).map(part =>
    part.type === 'text' ? { ...part, text: stripImageFactoryContext(part.text) + (readImageFactoryContext(part.text)?.targetLayer ? '\n\n〔图层 ' + JSON.stringify(context.targetLayer.label) + '〕' : '') } : part)
}

function imageFactoryContentContext(content) {
  return Array.isArray(content) ? content.map(part => part.type === 'text' ? readImageFactoryContext(part.text) : undefined).find(Boolean) : undefined
}

function imageFactoryQueueRow(row) {
  const context = imageFactoryContentContext(row.content)
  if (!context) return row
  const { text: _original, ...imageFactoryQueueContext } = context
  const visible = imageFactoryDisplayContent(row.content, context)
  const preview = Array.from(visible.map(part => part.type === 'text' ? part.text : '[' + part.type + ']')
    .join(' ').replace(/\s+/g, ' ').trim())
  const text = row.text === null ? null : visible.filter(part => part.type === 'text').map(part => part.text).join('')
  return { ...row, text, preview: preview.slice(0, 200).join('') + (preview.length > 200 ? '…' : ''), imageFactoryQueueContext }
}

function imageFactoryQueueEditContent(row, text, serialize) {
  if (row?.imageFactoryQueueContext && row.text !== null) {
    const context = row.imageFactoryQueueContext
    const label = context.targetLayer && '\n\n〔图层 ' + JSON.stringify(context.targetLayer.label) + '〕'
    const updated = label && text.endsWith(label) ? text.slice(0, -label.length) : text
    return [{ type: 'text', text: imageFactoryPrompt(updated, context) }, ...(row.content ?? []).filter(part => part.type !== 'text')]
  }
  return canvasQueueEditContent(row, text, serialize)
}

function EWorkImageFactoryWelcome() {
  const app = eworkImageFactory
  const state = react.useSyncExternalStore(app?.subscribe ?? (() => () => {}), app?.getSnapshot ?? (() => imageFactoryEmpty), () => imageFactoryEmpty)
  const en = react.useSyncExternalStore(subscribeEWorkModeLocale, eworkModeLocale, eworkModeLocale) === 'en'
  const labels = state.current
    ? (en ? ['Edit the current image', 'Describe a change, add a reference, or select a region on the canvas.', 'Improve this image', 'Replace the image']
      : ['编辑当前图片', '描述想改的内容，可以附上参考图，也可以框选画布上的局部。', '优化这张图片', '换一张图片'])
    : (en ? ['Create an image or poster', 'Describe the picture you want. You can include the aspect ratio or add a reference image.', 'Make an event poster', 'Import an image']
      : ['开始做图', '描述想做的图片，可以直接写出画面比例，也可以附上参考图。', '制作活动海报', '导入图片'])
  const prompt = state.current
    ? (en ? 'Improve the light and contrast of the current image. Keep the composition, existing lettering, and canvas dimensions.'
      : '优化当前图片的亮度与对比度，保留构图、原有文字和画布尺寸。')
    : (en ? 'Create a Weekend Coffee Market poster for November 21–22. Use a warm brown palette and cream typography.'
      : '做一张「周末咖啡市集」海报，活动为 11 月 21–22 日。用暖棕色和奶油白标题，右下放一杯咖啡。')
  const h = react.createElement
  const icon = name => h('i', { className: 'if-symbol', 'data-if-welcome-icon': name, 'aria-hidden': true })
  return h('div', { className: 'ew-sheet-welcome', 'data-mode-welcome': 'image-factory' },
    h('div', { className: 'ew-sheet-welcome-content' }, h('h2', null, labels[0]), h('p', null, labels[1]),
      h('div', { className: 'ew-sheet-welcome-actions' },
        h('button', { type: 'button', disabled: state.busy, onClick: () => app?.fill(prompt) },
          icon(state.current ? 'adjust' : 'spark'), h('span', null, labels[2])),
        h('button', { type: 'button', disabled: state.busy, onClick: () => app?.action('import') },
          icon(state.current ? 'image' : 'upload'), h('span', null, labels[3])))))
}

export const imageFactoryNativeSource = `
const imageFactoryEmpty={current:false,busy:false,creating:false};
let eworkImageFactory;
${readImageFactoryContext.toString()}
${stripImageFactoryContext.toString()}
${imageFactoryPrompt.toString()}
${createImageFactoryTasks.toString()}
${imageLayerReferenceCodec.toString()}
${imageLayerReferenceParts.toString()}
${readImageLayerReference.toString()}
${isImageLayerPreview.toString()}
${bindImageLayerReferences.toString()}
${readImageLayerReceipts.toString()}
${imageFactoryDisplayContent.toString()}
${imageFactoryContentContext.toString()}
${imageFactoryQueueRow.toString()}
${imageFactoryQueueEditContent.toString()}
${EWorkImageFactoryWelcome.toString()}
`
