import { imageGenerationCalls } from './image-generation-client.mjs'
import { imageFactoryPrompt, readImageFactoryContext, stripImageFactoryContext } from '../../packages/dsh-research-task-runtime/image-factory-context.js'
import { createImageFactoryTasks } from './image-factory-tasks.mjs'

/** Connect the current canvas to native admission, without owning a message list or a composer. */
export function installImageFactoryContext({
  sessions, getInput, getPending, send, doc = document, win = window, encodePrompt = imageFactoryPrompt,
  getTaskWorkspace, setTaskView, taskStorage, isBoardOnly = () => false,
}) {
  const jobs = new Map(), listeners = new Set()
  let state = { current: false, busy: false }
  let galleryDrafts = new WeakMap()
  const isActive = () => doc.body.dataset.workspaceSurface === 'image-factory'
  const currentId = () => sessions.list.getSnapshot().current
  const canvasScope = () => {
    const { current, byId } = sessions.list.getSnapshot()
    // The native sidebar only shows the currently selected empty session.
    return current && !isBoardOnly(current) && (current.startsWith('image-task-') || byId?.[current]?.blank !== true) ? current : null
  }
  const nativeInput = () => currentId() ? getInput(currentId()) : getPending()?.shell
  const signal = (name, detail) => doc.dispatchEvent(new win.CustomEvent('sherlock:image-factory-' + name, { detail }))
  const tasks = createImageFactoryTasks({ sessions, win, isActive, signal, syncSession, getWorkspace: getTaskWorkspace,
    setView: setTaskView, storage: taskStorage, isBoardOnly })
  const stateChange = event => {
    state = { current: event.detail?.current === true, busy: event.detail?.busy === true }
    for (const listener of listeners) listener()
  }
  const focus = () => win.requestAnimationFrame(() => doc.querySelector('#odyssey-right-workspace-panel textarea:not([disabled])')?.focus({ preventScroll: true }))
  const finish = (id, updateScope = true) => {
    const job = jobs.get(id)
    if (job) { win.clearTimeout(job.timer); win.clearTimeout(job.idle); job.unsubscribe?.(); jobs.delete(id) }
    signal('settled', { id })
    if (job?.draft && updateScope) syncSession()
  }
  function fill(prompt, gallery = false) {
    const shell = nativeInput()
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
  function request(id, sessionId, scope, prompt, uploaded, operation) {
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
      signal('prepare', { id, sessionId, scope, prompt, uploaded, region: operation === 'region', cutout: operation === 'cutout' })
    })
  }
  async function prepare(sessionId, content, action) {
    if (!isActive() || currentId() !== sessionId || isBoardOnly(sessionId)) {
      if (action) throw Error('当前会话或画布已切换。')
      return { content }
    }
    const text = content.filter(part => part.type === 'text').map(part => part.text).join('\n')
    if (!text.trim()) return { content }
    if (!action && /^\/[a-z][a-z0-9_-]*(?:\s|$)/i.test(text.trim())) return { content }
    const id = action?.id ?? win.crypto.randomUUID()
    const scope = canvasScope()
    try {
      const imageCount = content.filter(part => part.type === 'image').length
      const response = await request(id, sessionId, scope, text, imageCount > 0, action?.operation)
      if (!isActive() || currentId() !== sessionId || canvasScope() !== scope) throw Error('当前会话或画布已切换，草稿已保留。')
      if (action && response.operation !== action.operation) throw Error('当前画布已变化，请重试。')
      const { operation, size, width, height, title, reference, editBounds } = response
      if (reference && imageCount > 3) throw Error('编辑当前画布时，最多可再附加三张参考图。')
      const next = [...content]
      const index = next.findLastIndex(part => part.type === 'text')
      const receiptTitle = title.replace(/[\p{Cc}]/gu, ' ').trim().slice(0, 100) || '画布'
      next[index] = { type: 'text', text: encodePrompt(next[index].text, { id, operation, size, width, height,
        title: receiptTitle, internalReference: !!reference, editBounds }) }
      if (reference) next.push({ type: 'image', data: reference.data, mediaType: reference.mediaType, name: '当前画布' })
      jobs.set(id, { id, sessionId, draft: scope === null, timer: win.setTimeout(() => finish(id), 615000) })
      return { content: next, id }
    } catch (error) { finish(id); throw error }
  }
  const promoteDraft = job => {
    if (job.draft && !job.promotion) {
      job.promotion = adopt(job.sessionId).catch(() => {})
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
      const delivered = imageGenerationCalls(nodes, running).find(call => call.state === 'completed' && call.factory?.id === job.id)
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
      const queued = queue?.some(row => owns(row.content))
      job.wasQueued ||= queued
      job.admitted ||= nodes.some(row => (row.kind === 'user' || row.kind === 'steering') && owns(row.data?.content))
      if (job.admitted) void promoteDraft(job)
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
    const next = await prepare(session.sessionId, content, action)
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
  let publishedScope
  function syncSession(force = false) {
    const scope = canvasScope()
    // The list can stop reporting a blank conversation before its admitted user turn is visible.
    const awaitingAdmission = scope !== null && [...jobs.values()].some(job => job.sessionId === scope && job.draft && !job.promotion)
    const sessionId = awaitingAdmission ? null : scope
    tasks.sync(sessionId)
    if (!force && sessionId === publishedScope) return
    publishedScope = sessionId
    signal('session', { sessionId })
  }
  const offSession = sessions.list.subscribe?.(() => syncSession())
  const reset = () => {
    for (const id of jobs.keys()) finish(id, false)
    galleryDrafts = new WeakMap()
    publishedScope = undefined
    tasks.reset()
  }
  const events = { state: stateChange, 'request-session': () => syncSession(true), 'use-prompt': usePrompt,
    comment: event => { void submitCanvasAction(event, 'region') },
    cutout: event => { void submitCanvasAction(event, 'cutout') },
    'focus-chat': focus, reset,
    'task-action': event => { void tasks.action(event.detail) }, 'task-title': event => tasks.setTitle(event.detail),
    'request-task-state': () => tasks.publish(true) }
  for (const [name, handler] of Object.entries(events)) doc.addEventListener('sherlock:image-factory-' + name, handler)
  signal('request-state', {})
  syncSession()
  return {
    prompt, fill, focus, action: kind => signal('action', { kind }),
    getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    dispose() {
      offSession?.()
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
    part.type === 'text' ? { ...part, text: stripImageFactoryContext(part.text) } : part)
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
  if (row?.imageFactoryQueueContext && row.text !== null)
    return [{ type: 'text', text: imageFactoryPrompt(text, row.imageFactoryQueueContext) }]
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
  return h('div', { className: 'ew-sheet-welcome', 'data-mode-welcome': 'image-factory' },
    h('div', { className: 'ew-sheet-welcome-content' }, h('h2', null, labels[0]), h('p', null, labels[1]),
      h('div', { className: 'ew-sheet-welcome-actions' },
        h('button', { type: 'button', disabled: state.busy, onClick: () => app?.fill(prompt) }, labels[2]),
        h('button', { type: 'button', disabled: state.busy, onClick: () => app?.action('import') }, labels[3]))))
}

export const imageFactoryNativeSource = `
const imageFactoryEmpty={current:false,busy:false};
let eworkImageFactory;
${readImageFactoryContext.toString()}
${stripImageFactoryContext.toString()}
${imageFactoryPrompt.toString()}
${createImageFactoryTasks.toString()}
${imageFactoryDisplayContent.toString()}
${imageFactoryContentContext.toString()}
${imageFactoryQueueRow.toString()}
${imageFactoryQueueEditContent.toString()}
${EWorkImageFactoryWelcome.toString()}
`
