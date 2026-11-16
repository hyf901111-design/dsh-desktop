/** A mode-specific input shell bound to the existing global chat, like the notes input. */
export function installImageFactoryInput({ makeShell, conversation, document: doc = document, window: win = window }) {
  const initial = { messages: [], canSend: true }
  const listeners = new Set()
  let state = initial
  let pending
  const publish = value => {
    state = value
    for (const listener of listeners) listener()
  }
  const action = (kind, attrs) => doc.dispatchEvent(new win.CustomEvent('sherlock:image-factory-action', { detail: { kind, ...attrs } }))
  const request = () => doc.dispatchEvent(new win.Event('sherlock:image-factory-request-state'))
  const focus = () => win.requestAnimationFrame(() => doc.querySelector('#odyssey-right-workspace-panel textarea:not([disabled])')?.focus({ preventScroll: true }))
  const change = event => {
    if (event.detail && Array.isArray(event.detail.messages)) publish(event.detail)
  }
  const clearImages = ids => { for (const id of ids) conversation.releaseDraftImage(id) }
  const reset = () => {
    pending = undefined
    clearImages(shell.snapshot.imageIds)
    shell.pruneImages([])
    shell.setResearchContextPreparing(false)
    shell.setDraft('')
    publish(initial)
  }
  const finish = event => {
    const result = event.detail
    if (!pending || result?.id !== pending.id) return
    const { revision, ids, prompt } = pending
    pending = undefined
    shell.setResearchContextPreparing(false)
    if (result.success) {
      const unchanged = shell.snapshot.draftRev === revision && shell.snapshot.draft === prompt
      shell.commitSend(ids, unchanged ? prompt : null)
      clearImages(ids)
    }
    request()
  }
  function fileData(file) {
    return new Promise((resolve, reject) => {
      const reader = new win.FileReader()
      reader.onerror = () => reject(new Error('参考图无法读取。'))
      reader.onload = () => resolve(String(reader.result).split(',')[1])
      reader.readAsDataURL(file)
    })
  }
  const send = async () => {
    if (pending || state.busy || !state.canSend || doc.body.dataset.workspaceSurface !== 'image-factory') return
    const snapshot = shell.snapshot, prompt = snapshot.draft.trim(), ids = [...snapshot.imageIds]
    if (!prompt) return shell.notify('error', '请输入想生成或修改的画面。')
    if (prompt.length > 3600) return shell.notify('error', '图片描述不能超过 3600 字。')
    if (ids.length && state.region) return shell.notify('error', '请在选区或参考图中保留一项。')
    const job = { id: win.crypto.randomUUID(), revision: snapshot.draftRev, ids, prompt: snapshot.draft }
    pending = job
    shell.setResearchContextPreparing(true)
    try {
      const file = ids.length ? conversation.draftImages(ids)[0]?.file : undefined
      if (ids.length && !file) throw new Error('参考图已失效，请重新添加。')
      const attachment = file && { name: file.name, type: file.type, data: await fileData(file) }
      if (pending !== job || doc.body.dataset.workspaceSurface !== 'image-factory' || shell.snapshot.draftRev !== job.revision) {
        throw new Error('画布或草稿已变化，请重新发送。')
      }
      const event = new win.CustomEvent('sherlock:image-factory-submit', { cancelable: true, detail: { id: job.id, prompt, file: attachment } })
      if (doc.dispatchEvent(event)) throw new Error('图像工厂尚未就绪，请稍后重试。')
    } catch (error) {
      if (pending === job) {
        pending = undefined
        shell.setResearchContextPreparing(false)
        shell.notify('error', error?.message || '图片指令未能发送。')
      }
    }
  }
  const shell = makeShell({ defaultSink: send })
  // A factory message is a canvas command; it must never route to a resident session.
  shell.submit = send
  const addImages = files => {
    if (state.region) return '请先移除框选引用。'
    if (files.length !== 1 || shell.snapshot.imageIds.length) return '一次可添加一张参考图。'
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(files[0].type) || files[0].size > 20 * 1024 * 1024) {
      return '请选择 20 MB 以内的 PNG、JPG 或 WebP 图片。'
    }
    try {
      const images = conversation.createDraftImages(files)
      if (!shell.addImages(images.map(image => image.id))) conversation.releaseDraftImages(images)
      return null
    } catch (error) { return error.message }
  }
  const events = [
    ['sherlock:image-factory-state', change], ['sherlock:image-factory-result', finish],
    ['sherlock:image-factory-reset', reset], ['sherlock:image-factory-focus-chat', focus],
  ]
  for (const [name, listener] of events) doc.addEventListener(name, listener)
  request()
  return {
    shell, addImages, action, focus, conversation,
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    dispose() {
      for (const [name, listener] of events) doc.removeEventListener(name, listener)
      reset()
      shell.dispose()
      listeners.clear()
    },
  }
}

function useImageFactoryChat() {
  return react.useSyncExternalStore(eworkImageFactory?.subscribe ?? (() => () => {}), eworkImageFactory?.getSnapshot ?? (() => imageFactoryEmpty), () => imageFactoryEmpty)
}

function EWorkImageFactoryInput(props) {
  const app = eworkImageFactory, shell = app?.shell
  const state = useImageFactoryChat()
  const input = react.useSyncExternalStore(shell?.state.subscribe ?? (() => () => {}), shell?.state.getSnapshot ?? (() => undefined))
  const notice = react.useSyncExternalStore(shell?.notices.subscribe ?? (() => () => {}), shell?.notices.getSnapshot ?? (() => null))
  if (!shell) return null
  const h = react.createElement
  const en = document.documentElement.dataset.odysseyLocale === 'en'
  return h(InputBar, {
    ...props, sessionId: undefined, variant: 'composer', eworkNotes: false, eworkImageFactory: true, eworkSpreadsheet: false,
    researchCanvasWorkspace: undefined, researchFileReferences: [], researchArtifactReferences: [], eworkNoteContext: undefined,
    disabled: state.canSend === false && !state.busy, blocked: undefined, onRequestWorkspace: undefined, workspacePickerOpen: false,
    keyboard: shell, inputActions: shell.actions,
    useInput: select => { props.useInput(value => value); return select(input) },
    useNotices: select => { props.useNotices(value => value); return select(notice) },
    useLexicon: select => { props.useLexicon(value => value); return select(imageFactoryLexicon) },
    useSession: select => props.useSession(value => select({ ...value, running: !!state.busy, promptError: null, removed: false, subagent: null })),
    addImages: app.addImages, draftImages: ids => app.conversation.draftImages(ids),
    removeImage: id => { app.conversation.releaseDraftImage(id); shell.removeImage(id) },
    stop: () => app.action('cancel'),
    placeholder: state.preview ? (en ? 'Return to editing to continue…' : '返回编辑后可以继续对话…')
      : state.region ? (en ? 'Describe what to change in the selected area…' : '描述怎么修改框选区域…')
        : state.marking ? (en ? 'Select the area to edit on the canvas…' : '在画布上选好要修改的区域…')
          : state.editing ? (en ? 'Apply or cancel your canvas edit…' : '请先应用或取消画布修改…')
            : state.current ? (en ? 'Describe an edit to the image…' : '描述想怎么改这张图…')
              : (en ? 'Describe an image or poster…' : '描述要生成的图片或海报…'),
  })
}

function EWorkImageFactoryConversation({ t }) {
  const state = useImageFactoryChat(), h = react.createElement, app = eworkImageFactory
  const language = react.useSyncExternalStore(subscribeEWorkModeLocale, eworkModeLocale, eworkModeLocale)
  const en = language === 'en'
  const welcome = en ? ['Create an image or poster', 'Describe an image, import a reference, or mark a region on the canvas.', 'Make an event poster', 'Improve an existing image']
    : ['开始做图', '描述要生成的画面、附加参考图，或框选画布上要修改的位置。', '制作活动海报', '优化已有图片']
  function quick(index) {
    if (index === 1 && !state.current) return app?.action('import')
    if (app?.shell.snapshot.draft.trim()) return app.focus()
    app?.shell.setDraft(index === 0
      ? (en ? 'Make a Weekend Coffee Market poster with a cream title and a cup of coffee against a warm brown background. Nov 21–22 at Southbank Warehouse.'
        : '做一张「周末咖啡市集」海报。暖棕色调，右下放一杯咖啡，标题用奶油白。活动为 11 月 21–22 日，地点是南岸仓库。')
      : en ? 'Improve the lighting and contrast, and keep the original composition and text.' : '优化这张图片的光线和对比度，保留原来的构图和文字。')
    app?.focus()
  }
  if (!state.messages.length) return h('div', { className: 'ew-sheet-welcome', 'data-mode-welcome': 'image-factory' },
    h('div', { className: 'ew-sheet-welcome-content' },
      h('h2', null, welcome[0]), h('p', null, welcome[1]),
      h('div', { className: 'ew-sheet-welcome-actions' }, welcome.slice(2).map((label, index) =>
        h('button', { key: label, type: 'button', onClick: () => quick(index) }, label)))))
  const rows = state.messages.map(row => {
    if (row.role === 'user') return h(UserStyleBubble, {
      key: row.id, content: [{ type: 'text', text: row.body }], t,
    })
    const result = row.result
    return h('div', { key: row.id, className: 'Md3f7G_flowItem', role: row.error ? 'alert' : undefined },
      h(AssistantMarkdown, { blocks: [{ kind: 'text', text: row.body }], streaming: false, t }),
      result && h('button', { type: 'button', className: 'ework-image-factory-result', disabled: state.busy,
        'aria-label': en ? 'View image on canvas' : '在画布查看图片',
        onClick: () => app?.action('preview', { version: result.id }) },
        h('img', { className: 'odyssey-image-generation-result', src: result.url, width: result.width, height: result.height, alt: result.label })))
  })
  return h('div', { className: 'Md3f7G_column', 'data-image-factory-conversation': '', role: 'log', 'aria-live': 'polite' }, rows,
    state.busy && h('div', { className: 'Md3f7G_flowItem', role: 'status' },
      en ? 'Processing image…' : '正在处理图片…'))
}

export const imageFactoryNativeSource = `
const imageFactoryEmpty={messages:[],canSend:true},imageFactoryLexicon=new Map();
let eworkImageFactory;
${useImageFactoryChat.toString()}
${EWorkImageFactoryInput.toString()}
${EWorkImageFactoryConversation.toString()}
`
