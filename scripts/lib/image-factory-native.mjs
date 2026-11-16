import { imageGenerationCalls } from './image-generation-client.mjs'
import { imageFactoryPrompt, readImageFactoryContext, stripImageFactoryContext } from '../../packages/dsh-research-task-runtime/image-factory-context.js'

/** Connect the current canvas to native admission, without owning a message list or a composer. */
export function installImageFactoryContext({ sessions, getInput, getPending, send, doc = document, win = window, encodePrompt = imageFactoryPrompt }) {
  const jobs = new Map(), listeners = new Set()
  let state = { current: false, busy: false }
  let galleryDraft
  const isActive = () => doc.body.dataset.workspaceSurface === 'image-factory'
  const currentId = () => sessions.list.getSnapshot().current
  const nativeInput = () => currentId() ? getInput(currentId()) : getPending()?.shell
  const signal = (name, detail) => doc.dispatchEvent(new win.CustomEvent('sherlock:image-factory-' + name, { detail }))
  const stateChange = event => {
    state = { current: event.detail?.current === true, busy: event.detail?.busy === true }
    for (const listener of listeners) listener()
  }
  const focus = () => win.requestAnimationFrame(() => doc.querySelector('#odyssey-right-workspace-panel textarea:not([disabled])')?.focus({ preventScroll: true }))
  const finish = id => {
    const job = jobs.get(id)
    if (job) { win.clearTimeout(job.timer); win.clearTimeout(job.idle); job.unsubscribe?.(); jobs.delete(id) }
    signal('settled', { id })
  }
  function fill(prompt, gallery = false) {
    const shell = nativeInput()
    if (!shell || shell.disposed || !isActive() || state.busy || typeof prompt !== 'string' || !prompt.trim()) return false
    const draft = shell.snapshot.draft
    if (!gallery && draft.trim()) { focus(); return true }
    const original = galleryDraft?.shell === shell && draft === galleryDraft.combined ? galleryDraft.original : draft
    const combined = original.trim() ? original.trimEnd() + '\n\n' + prompt : prompt
    if (combined.length > 3600) { shell.notify('error', '添加示例后超出 3600 字，请先缩短当前描述。'); return false }
    galleryDraft = gallery ? { shell, original, combined } : undefined
    shell.setDraft(combined)
    focus()
    return true
  }
  const usePrompt = event => { if (!state.current && fill(event.detail?.prompt, true)) event.preventDefault() }
  function request(id, sessionId, prompt, uploaded, region) {
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
      signal('prepare', { id, sessionId, prompt, uploaded, region })
    })
  }
  async function prepare(sessionId, content, region = false) {
    if (!isActive() || currentId() !== sessionId) return { content }
    const text = content.filter(part => part.type === 'text').map(part => part.text).join('\n')
    if (!text.trim()) return { content }
    if (!region && /^\/[a-z][a-z0-9_-]*(?:\s|$)/i.test(text.trim())) return { content }
    const id = win.crypto.randomUUID()
    try {
      const response = await request(id, sessionId, text, content.some(part => part.type === 'image'), region)
      if (!isActive() || currentId() !== sessionId) throw Error('当前会话或画布已切换，草稿已保留。')
      if (region && response.operation !== 'region') throw Error('选区已变化，请重新框选。')
      const { operation, size, width, height, title, reference } = response
      const next = [...content]
      const index = next.findLastIndex(part => part.type === 'text')
      next[index] = { type: 'text', text: encodePrompt(next[index].text, { id, operation, size, width, height, title, internalReference: !!reference }) }
      if (reference) next.push({ type: 'image', data: reference.data, mediaType: reference.mediaType, name: '当前画布' })
      jobs.set(id, { id, sessionId, timer: win.setTimeout(() => finish(id), 615000) })
      return { content: next, id }
    } catch (error) { finish(id); throw error }
  }
  function watch(session, job) {
    const observe = () => {
      if (jobs.get(job.id) !== job || job.delivering) return
      const { chat, running } = session.getSnapshot()
      if (!chat) return
      const nodes = chat.order.slice(-150).map(key => chat.nodes.get(key)).filter(Boolean)
      const delivered = imageGenerationCalls(nodes, running).find(call => call.state === 'completed' && call.factory?.id === job.id)
      if (delivered) {
        job.delivering = true
        void session.readAttachment(delivered.image.attachmentId).then(result => {
          if (jobs.get(job.id) !== job) return
          if (!result.ok) throw Error(result.error.message)
          const bytes = Uint8Array.from(result.value.data)
          const url = URL.createObjectURL(new Blob([bytes], { type: result.value.attachment.mediaType }))
          signal('deliver', { id: job.id, sessionId: job.sessionId, url, revoke: true })
          finish(job.id)
        }).catch(() => finish(job.id))
        return
      }
      win.clearTimeout(job.idle)
      job.admitted ||= nodes.some(row => row.kind === 'user' && row.data?.content?.some(part =>
        part.type === 'text' && readImageFactoryContext(part.text)?.id === job.id))
      if (job.admitted && !running) job.idle = win.setTimeout(() => { if (!job.delivering) finish(job.id) }, 1500)
    }
    job.unsubscribe = session.subscribe(observe)
    observe()
  }
  async function prompt(session, content, mode, region = false) {
    const next = await prepare(session.sessionId, content, region)
    try {
      if (next.id) watch(session, jobs.get(next.id))
      const result = await session.prompt(next.content, mode)
      if (!result.ok && next.id) finish(next.id)
      return result
    } catch (error) { if (next.id) finish(next.id); throw error }
  }
  async function submitComment(event) {
    const { id, prompt: text } = event.detail ?? {}
    if (!isActive() || typeof id !== 'string' || typeof text !== 'string' || !text.trim() || text.length > 3600) return
    event.preventDefault()
    const reply = error => signal('comment-result', { id, error })
    const submit = async sessionId => {
      if (!isActive() || currentId() !== sessionId) throw Error('当前会话或画布已切换。')
      const session = sessions.binding(sessionId)?.session
      const snapshot = session?.getSnapshot()
      if (!session || !snapshot || snapshot.running || snapshot.queue?.length || snapshot.subagent) throw Error('请等当前对话处理完成后再提交。')
      const result = await send(session, [{ type: 'text', text: text.trim() }], 'queue', true)
      if (!result?.ok) throw Error(result?.error?.message || '修改意见发送失败，请重试。')
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
  const reset = () => { for (const id of jobs.keys()) finish(id); galleryDraft = undefined }
  const events = { state: stateChange, 'use-prompt': usePrompt, comment: submitComment, 'focus-chat': focus, reset }
  for (const [name, handler] of Object.entries(events)) doc.addEventListener('sherlock:image-factory-' + name, handler)
  signal('request-state', {})
  return {
    prompt, fill, focus, action: kind => signal('action', { kind }),
    getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    dispose() {
      reset()
      for (const [name, handler] of Object.entries(events)) doc.removeEventListener('sherlock:image-factory-' + name, handler)
      listeners.clear()
    },
  }
}

function imageFactoryDisplayContent(content) {
  if (!Array.isArray(content)) return content
  const context = content.map(part => part.type === 'text' ? readImageFactoryContext(part.text) : undefined).find(Boolean)
  if (!context) return content
  const internal = context.internalReference ? content.findLastIndex(part => part.type === 'image') : -1
  return content.filter((_, index) => index !== internal).map(part =>
    part.type === 'text' ? { ...part, text: stripImageFactoryContext(part.text) } : part)
}

function EWorkImageFactoryWelcome() {
  const app = eworkImageFactory
  const state = react.useSyncExternalStore(app?.subscribe ?? (() => () => {}), app?.getSnapshot ?? (() => imageFactoryEmpty), () => imageFactoryEmpty)
  const en = react.useSyncExternalStore(subscribeEWorkModeLocale, eworkModeLocale, eworkModeLocale) === 'en'
  const labels = en ? ['Create an image or poster', 'Describe the image you want, add a reference, or select an area to edit on the canvas.', 'Make an event poster', 'Import an image']
    : ['开始做图', '描述想做的图片、附加参考图，或在画布上框选要修改的位置。画面比例可以直接写在描述里。', '制作活动海报', '导入图片']
  const prompt = en ? 'Create a Weekend Coffee Market poster for November 21–22. Use a warm brown palette and cream typography.' :
    '做一张「周末咖啡市集」海报，活动为 11 月 21–22 日。用暖棕色和奶油白标题，右下放一杯咖啡。'
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
${imageFactoryDisplayContent.toString()}
${EWorkImageFactoryWelcome.toString()}
`
