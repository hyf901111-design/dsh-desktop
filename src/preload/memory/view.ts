import { noteUiText as localize } from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import type {
  MemoryBridge,
  MemoryCommand,
  MemoryInput,
  MemoryRecord,
  MemorySnapshot,
  MemorySource
} from '../../shared/memory'
import { memoryStyles } from './style'

type Draft = { base: MemoryRecord; title: string; content: string; pending: boolean; error?: string }

type Selection = {
  content?: string
  title?: string
  source?: MemorySource
  sessionId?: string
}

/** Adds one ordinary settings section without replacing the native settings tree. */
export function mountMemoryUi(document: Document, bridge: MemoryBridge) {
  const t = (value: string) => localize(value, document.documentElement.dataset.odysseyLocale)
  const win = document.defaultView!
  const style = document.createElement('style')
  style.dataset.memoryStyle = ''
  style.textContent = memoryStyles
  document.head.append(style)
  let disposed = false,
    identityEpoch = 0,
    readSequence = 0,
    pendingOpen = false
  let data: MemorySnapshot | undefined,
    root: HTMLElement | undefined,
    page: HTMLElement | undefined
  let sessionOverride: string | undefined,
    explicitSession = false
  let settingPending: { key: string; value?: boolean } | undefined,
    directoryPending = false,
    refreshPending = false
  let notice = '',
    noticeError = false,
    selectionQueue = Promise.resolve()
  let toast: HTMLElement | undefined, toastTimer: number | undefined
  // Keep private drafts outside the DOM so notifications and settings reopen cannot erase typing.
  const drafts = new Map<string, Draft>()
  const deleting = new Set<string>()
  const changing = new Set<string>()
  const filters = { query: '', kind: '', scope: '', status: '' }
  const expanded = new Set<string>()
  let newDraft: { input: MemoryInput; pending: boolean; error?: string } | undefined
  const kinds = { preference: '偏好', background: '背景', decision: '决定', progress: '进展' }
  const statuses = { active: '已启用', candidate: '待确认', disabled: '已停用', superseded: '已被替代' }

  let deleteDialog: HTMLDialogElement | undefined,
    deleteTarget: MemoryRecord | undefined,
    renderDeleteDialog: (() => void) | undefined
  const navs = new Set<HTMLElement>()
  const currentSession = () =>
    explicitSession
      ? sessionOverride
      : document.documentElement.dataset.srbSelectedSession || undefined
  const current = (epoch: number) => !disposed && epoch === identityEpoch
  const node = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    className?: string
  ): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag)
    if (text !== undefined) element.textContent = text
    if (className) element.className = className
    return element
  }
  const button = (label: string, click: () => void, className = '') => {
    const element = node('button', label, className)
    element.type = 'button'
    element.onclick = click
    return element
  }
  const icon = (kind: 'memory' | 'folder' | 'arrow') => {
    const element = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    )
    element.setAttribute('viewBox', '0 0 24 24')
    element.setAttribute('aria-hidden', 'true')
    element.setAttribute('fill', 'none')
    element.setAttribute('stroke', 'currentColor')
    element.setAttribute('stroke-width', '1.5')
    element.setAttribute('stroke-linecap', 'round')
    element.setAttribute('stroke-linejoin', 'round')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute(
      'd',
      kind === 'folder'
        ? 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'
        : kind === 'arrow'
          ? 'm9 6 6 6-6 6'
          : 'M8 4a3 3 0 0 0-5 2v2a3 3 0 0 0 0 6v3a4 4 0 0 0 8 0V6a3 3 0 0 0-3-2Zm8 0a3 3 0 0 1 5 2v2a3 3 0 0 1 0 6v3a4 4 0 0 1-8 0V6a3 3 0 0 1 3-2ZM4 8h3m-4 6h4m13-6h-3m4 6h-4'
    )
    element.append(path)
    return element
  }
  const date = (time: number) =>
    new Intl.DateTimeFormat(document.documentElement.dataset.odysseyLocale==='en'?'en-US':'zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(time)

  function setNotice(text = '', error = false) {
    notice = text
    noticeError = error
    const element = page?.querySelector<HTMLElement>('[data-memory-notice]')
    if (element) {
      element.textContent = text
      element.role = error ? 'alert' : 'status'
      element.hidden = !text
    }
  }
  function clearToast() {
    if (toastTimer !== undefined) win.clearTimeout(toastTimer)
    toastTimer = undefined
    toast?.remove()
    toast = undefined
  }
  function showToast(text: string, error = false) {
    clearToast()
    toast = node('div', text, 'ew-memory-toast')
    toast.dataset.memoryToast = ''
    toast.role = error ? 'alert' : 'status'
    toast.setAttribute('aria-live', 'polite')
    document.body.append(toast)
    toastTimer = win.setTimeout(clearToast, 5000)
  }
  function accept(next: MemorySnapshot, epoch: number) {
    if (!current(epoch)) return false
    if (data && data.owner !== next.owner) {
      resetIdentity()
      return false
    }
    if (data && next.revision < data.revision) return false
    const session =
      next.session ??
      (data?.session?.id === currentSession() ? data?.session : undefined)
    data = { ...next, session }
    return true
  }
  async function load() {
    if (disposed || !page?.isConnected) return
    if (settingPending !== undefined) {
      refreshPending = true
      return
    }
    const epoch = identityEpoch,
      sequence = ++readSequence,
      sessionId = currentSession()
    try {
      const next = await bridge.request({ type: 'snapshot', sessionId })
      if (
        !current(epoch) ||
        sequence !== readSequence ||
        currentSession() !== sessionId
      )
        return
      if (accept(next, epoch)) {
        setNotice()
        render()
      }
    } catch {
      if (!current(epoch) || sequence !== readSequence) return
      setNotice(t("记忆暂不可用，原有数据会保留。请稍后重试。"), true)
      render()
    }
  }
  async function changeSetting(command: MemoryCommand, key: string, value?: boolean) {
    if (disposed || settingPending !== undefined) return
    const epoch = identityEpoch
    ++readSequence
    settingPending = { key, value }
    setNotice()
    render()
    try {
      const next = await bridge.request(command)
      if (!current(epoch)) return
      accept(next, epoch)
    } catch {
      if (!current(epoch)) return
      setNotice(t("修改记忆设置未完成，已恢复之前的设置。请稍后重试。"), true)
    } finally {
      if (current(epoch)) {
        settingPending = undefined
        render()
        if (refreshPending) {
          refreshPending = false
          void load()
        }
      }
    }
  }
  async function openDirectory() {
    if (disposed || directoryPending || !bridge.openDirectory) return
    const epoch = identityEpoch
    directoryPending = true
    setNotice()
    render()
    try {
      await bridge.openDirectory()
    } catch {
      if (current(epoch)) setNotice(t("记忆目录暂时无法打开，请稍后重试。"), true)
    } finally {
      if (current(epoch)) {
        directoryPending = false
        render()
      }
    }
  }
  async function saveDraft(id: string, draft: Draft) {
    if (draft.pending || deleting.has(id) || changing.has(id) || !data) return
    const title = draft.title.trim(), content = draft.content.trim()
    if (!title || !content || title.length > 120 || content.length > 600) {
      draft.error = '标题需为 1–120 字，内容需为 1–600 字。'
      render()
      return
    }
    const epoch = identityEpoch, owner = data.owner, base = draft.base
    const sent = { title: draft.title, content: draft.content }
    draft.pending = true
    draft.error = undefined
    render()
    try {
      const next = await bridge.request({ type: 'save', id, expectedRevision: base.revision, input: {
        title, content, kind: base.kind, scope: base.scope,
        ...(base.projectId ? { projectId: base.projectId } : {}),
        pinned: base.pinned,
        ...(base.expiresAt !== undefined ? { expiresAt: base.expiresAt } : {})
      } })
      if (!current(epoch) || drafts.get(id) !== draft) return
      if (next.owner !== owner) { resetIdentity(); return }
      const saved = next.rows.find(row => row.id === id)
      if (!saved) throw Error('missing memory')
      accept(next, epoch)
      // A successful response only clears the exact text that was sent. Later typing survives.
      if (draft.title === sent.title && draft.content === sent.content) drafts.delete(id)
      else draft.base = saved
      if (next.document?.error) setNotice(t('记忆.md 暂未写入，原内容仍会保留。请稍后重试。'), true)
    } catch {
      if (current(epoch) && drafts.get(id) === draft) {
        draft.error = '保存未完成，草稿已保留。记忆可能已在其他位置更新，请取消编辑后查看最新内容。'
        void load()
      }
    } finally {
      if (current(epoch) && drafts.get(id) === draft) draft.pending = false
      if (current(epoch)) render()
    }
  }
  async function changeRowStatus(row: MemoryRecord, explicitAction?: 'ignore') {
    const action = explicitAction ?? (row.status === 'active' ? 'disable' : row.status === 'disabled' ? 'enable' : row.status === 'candidate' ? 'accept' : undefined)
    if (!action || !data || changing.has(row.id) || deleting.has(row.id) || drafts.get(row.id)?.pending || action === 'accept' && row.scope === 'project' && !row.projectId) return
    const epoch = identityEpoch, owner = data.owner, draft = drafts.get(row.id)
    changing.add(row.id)
    setNotice()
    render()
    try {
      const next = await bridge.request({ type: 'action', ids: [row.id], action, expectedRevisions: { [row.id]: row.revision } })
      if (!current(epoch)) return
      if (next.owner !== owner) { resetIdentity(); return }
      if (accept(next, epoch)) {
        const saved = next.rows.find(value => value.id === row.id)
        // A local status-only change advances the revision without replacing
        // typed text or hiding a conflict from an earlier background update.
        if (saved && draft && drafts.get(row.id) === draft && draft.base.revision === row.revision) draft.base = saved
        if (next.document?.error) setNotice(t('记忆.md 暂未写入，原内容仍会保留。请稍后重试。'), true)
      }
    } catch {
      if (current(epoch)) {
        await load()
        if (current(epoch)) setNotice(t('修改未完成，记忆和草稿已保留。请刷新后重试。'), true)
      }
    } finally {
      if (current(epoch)) { changing.delete(row.id); render() }
    }
  }
  function closeDeleteDialog(restoreFocus = true) {
    const dialog = deleteDialog, id = deleteTarget?.id
    deleteDialog = undefined
    deleteTarget = undefined
    renderDeleteDialog = undefined
    dialog?.close()
    dialog?.remove()
    if (restoreFocus) [...page?.querySelectorAll<HTMLElement>('[data-memory-row]') ?? []].find(row => row.dataset.memoryRow === id)?.querySelector<HTMLButtonElement>('[data-memory-delete]')?.focus({ preventScroll: true })
  }
  function requestDelete(row: MemoryRecord) {
    if (!data || deleting.has(row.id) || changing.has(row.id) || drafts.get(row.id)?.pending) return
    closeDeleteDialog(false)
    const epoch = identityEpoch, owner = data.owner
    const dialog = node('dialog', undefined, 'ew-memory-delete-dialog')
    dialog.dataset.memoryDeleteDialog = ''
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-labelledby', 'ew-memory-delete-title')
    dialog.setAttribute('aria-describedby', 'ew-memory-delete-description')
    deleteDialog = dialog
    deleteTarget = row
    renderDeleteDialog = () => {
      const heading = node('header'), title = node('h2', t('删除这条记忆？'))
      title.id = 'ew-memory-delete-title'
      const close = button('×', () => closeDeleteDialog(), 'ew-memory-dialog-close')
      close.setAttribute('aria-label', t('关闭'))
      heading.append(title, close)
      const description = node('div')
      description.id = 'ew-memory-delete-description'
      description.append(node('strong', row.title), node('p', t('删除后，这条记忆将不再用于后续对话。')))
      const draft = drafts.get(row.id)
      if (draft && (draft.title !== draft.base.title || draft.content !== draft.base.content)) description.append(node('p', t('这条记忆有未保存的修改。确认删除后，这些修改也会丢弃。'), 'ew-memory-conflict'))
      const actions = node('footer', undefined, 'ew-memory-actions')
      const cancel = button(t('取消'), () => closeDeleteDialog())
      cancel.setAttribute('aria-label', t('取消删除'))
      cancel.setAttribute('autofocus', '')
      const confirm = button(t('确认删除'), () => {
        if (deleteDialog !== dialog || !current(epoch) || data?.owner !== owner) return
        closeDeleteDialog(false)
        void deleteRow(row)
      }, 'ew-memory-confirm-delete')
      actions.append(cancel, confirm)
      dialog.replaceChildren(heading, description, actions)
      if (dialog.open) cancel.focus()
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); closeDeleteDialog() })
    dialog.addEventListener('close', () => { if (deleteDialog === dialog) closeDeleteDialog() })
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation() })
    renderDeleteDialog()
    document.body.append(dialog)
    dialog.showModal()
    dialog.querySelector<HTMLButtonElement>('[autofocus]')?.focus()
  }
  async function deleteRow(row: MemoryRecord) {
    if (deleting.has(row.id) || !data) return
    const epoch = identityEpoch, owner = data.owner
    deleting.add(row.id)
    render()
    try {
      const next = await bridge.request({ type: 'action', ids: [row.id], action: 'delete', expectedRevisions: { [row.id]: row.revision } })
      if (!current(epoch)) return
      if (next.owner !== owner) { resetIdentity(); return }
      if (accept(next, epoch)) { drafts.delete(row.id); setNotice() }
    } catch {
      if (current(epoch)) setNotice(t('删除未完成，原有记忆会保留。请刷新后重试。'), true)
    } finally {
      if (current(epoch)) { deleting.delete(row.id); render() }
    }
  }
  function renderRow(row: MemoryRecord, latest?: MemoryRecord) {
    const item = node('article', undefined, 'ew-memory-record')
    item.dataset.memoryRow = row.id
    item.setAttribute('aria-label', row.title)
    const draft = drafts.get(row.id)
    const heading = node('header', undefined, 'ew-memory-record-heading')
    const title = node('h3', row.title), label = node('label', undefined, 'ew-memory-record-switch')
    const toggle = node('input')
    toggle.type = 'checkbox'; toggle.role = 'switch'; toggle.dataset.memoryToggle = row.id
    toggle.setAttribute('aria-label', t('启用此记忆'))
    toggle.checked = row.status === 'active'
    toggle.disabled = !latest || row.status === 'superseded' || row.status === 'candidate' && row.scope === 'project' && !row.projectId || changing.has(row.id) || deleting.has(row.id) || draft?.pending === true
    label.title = t(row.status === 'superseded' ? '已被替代的记忆不能重新启用。' : row.status === 'candidate' && row.scope === 'project' && !row.projectId ? '此记忆尚未关联项目，暂不能启用。' : row.status === 'candidate' ? '启用后将确认这条记忆。' : '启用此记忆')
    toggle.onchange = () => void changeRowStatus(row)
    label.append(toggle); heading.append(title, label); item.append(heading)
    const remove = button(t('删除'), () => requestDelete(row), 'ew-memory-delete')
    remove.dataset.memoryDelete = row.id
    remove.disabled = !latest || deleting.has(row.id) || changing.has(row.id) || draft?.pending === true
    const meta = node('p', undefined, 'ew-memory-meta')
    const scope = row.scope === 'global' ? t('全局') : data?.projects.find(project => project.id === row.projectId)?.name || t('项目')
    const state = t({ active: '已启用', candidate: '待确认', disabled: '已停用', superseded: '已被替代' }[row.status])
    meta.textContent = `${scope} · ${t(kinds[row.kind])} · ${state} · ${date(row.updatedAt)}`
    if (draft) {
      item.dataset.memoryEditor = row.id
      const titleLabel = node('label', t('记忆标题'), 'ew-memory-field')
      const title = node('input')
      title.type = 'text'; title.maxLength = 120; title.value = draft.title
      title.dataset.memoryField = 'title'; title.setAttribute('aria-label', t('记忆标题'))
      const contentLabel = node('label', t('记忆内容'), 'ew-memory-field')
      const content = node('textarea')
      content.maxLength = 600; content.rows = 5; content.value = draft.content
      content.dataset.memoryField = 'content'; content.setAttribute('aria-label', t('记忆内容'))
      const actions = node('div', undefined, 'ew-memory-actions')
      const save = button(draft.pending ? t('正在保存…') : t('保存'), () => void saveDraft(row.id, draft), 'ew-memory-save')
      save.disabled = draft.pending || deleting.has(row.id) || changing.has(row.id)
      const cancel = button(t('取消'), () => { drafts.delete(row.id); render() })
      cancel.disabled = draft.pending || deleting.has(row.id) || changing.has(row.id)
      title.disabled = content.disabled = deleting.has(row.id)
      const changed = () => {
        draft.title = title.value; draft.content = content.value
        save.disabled = draft.pending || deleting.has(row.id) || changing.has(row.id) || !title.value.trim() || !content.value.trim() || title.value.length > 120 || content.value.length > 600
      }
      title.oninput = content.oninput = changed
      changed()
      titleLabel.append(title); contentLabel.append(content)
      item.append(meta, titleLabel, contentLabel)
      if (!latest || latest.revision !== draft.base.revision) {
        const conflict = node('p', t(latest ? '此记忆已在其他位置更新，草稿已保留。取消编辑可查看最新内容。' : '此记忆已在其他位置删除，草稿已保留。取消编辑可关闭草稿。'), 'ew-memory-conflict')
        conflict.role = 'status'; item.append(conflict)
      }
      if (draft.error) { const error = node('p', t(draft.error), 'ew-memory-conflict'); error.role = 'alert'; item.append(error) }
      actions.append(remove, save, cancel); item.append(actions)
    } else {
      const text = node('p', row.content, 'ew-memory-record-text')
      const actions = node('div', undefined, 'ew-memory-actions')
      const edit = button(t('编辑'), () => {
        drafts.set(row.id, { base: row, title: row.title, content: row.content, pending: false })
        render()
        const editor = [...page!.querySelectorAll<HTMLElement>('[data-memory-editor]')].find(element => element.dataset.memoryEditor === row.id)
        editor?.querySelector<HTMLInputElement>('[data-memory-field=title]')?.focus()
      })
      edit.disabled = deleting.has(row.id) || changing.has(row.id)
      actions.append(edit, remove)
      if(row.status==='candidate'){
        const adopt=button(t('采用'),()=>void changeRowStatus(row));adopt.disabled=toggle.disabled
        const ignore=button(t('忽略'),()=>void changeRowStatus(row,'ignore'));ignore.disabled=changing.has(row.id)
        actions.prepend(adopt,ignore)
      }
      if(row.sources.some(source=>source.sessionId||source.noteId)&&bridge.openSource) actions.prepend(button(t('查看来源'),()=>void openSource(row)))
      item.append(meta, text, actions)
      const details=node('details',undefined,'ew-memory-details');details.open=expanded.has(row.id)
      details.append(node('summary',t('来源与使用记录')))
      details.ontoggle=()=>{if(!details.isConnected)return;if(details.open)expanded.add(row.id);else expanded.delete(row.id)}
      for(const source of row.sources){const line=node('p');line.append(node('strong',source.title),node('span',` · ${date(source.createdAt)}`),node('p',source.excerpt));details.append(line)}
      if(!row.sources.length)details.append(node('p',t('手动保存的记忆。')))
      if(row.manualLocked)details.append(node('p',t('已手动确认，自动整理不会覆盖。')))
      if(row.lastUsedAt)details.append(node('p',`${t('最近使用')}：${date(row.lastUsedAt)}`))
      const usage=data?.usages.find(value=>value.entries.some(entry=>entry.id===row.id))
      if(usage)details.append(node('p',usage.entries.find(entry=>entry.id===row.id)?.reason??''))
      item.append(details)
    }
    return item
  }
  function settingRow(title:string,description:string,value:boolean,change:(value:boolean)=>void){
    const label=node('label',undefined,'ew-memory-switch-row'),copy=node('span',undefined,'ew-memory-row-copy'),toggle=node('input')
    copy.append(node('strong',t(title)),node('small',t(description)))
    toggle.type='checkbox';toggle.role='switch';toggle.setAttribute('aria-label',t(title));toggle.checked=value;toggle.disabled=settingPending!==undefined
    toggle.onchange=()=>change(toggle.checked);label.append(copy,toggle);return label
  }
  function selectControl(label:string,options:string[][],value:string,change:(value:string)=>void){
    const select=node('select');select.setAttribute('aria-label',t(label))
    for(const [key,title] of options){const option=node('option',t(title!));option.value=key!;select.append(option)}
    select.value=value;select.onchange=()=>change(select.value);return select
  }
  async function openSource(row:MemoryRecord){
    const epoch=identityEpoch,owner=data?.owner
    try{
      const next=await bridge.request({type:'source',id:row.id})
      if(!current(epoch))return
      if(next.owner!==owner){resetIdentity();return}
      if(next.source)await bridge.openSource?.(next.source)
      else setNotice(t('来源已不可用。'),true)
    }catch{if(current(epoch))setNotice(t('来源暂时无法打开。'),true)}
  }
  async function saveNew(draft:NonNullable<typeof newDraft>){
    if(draft.pending||!data)return
    const epoch=identityEpoch,owner=data.owner
    if(!draft.input.title.trim()||!draft.input.content.trim()){draft.error='请填写标题和内容。';render();return}
    draft.pending=true;draft.error=undefined;render()
    try{
      const next=await bridge.request({type:'save',input:structuredClone(draft.input)})
      if(!current(epoch))return
      if(next.owner!==owner){resetIdentity();return}
      if(accept(next,epoch)) {newDraft=undefined;Object.assign(filters,{query:'',kind:'',scope:'',status:''})}
    }catch{if(current(epoch)&&newDraft===draft)draft.error='保存未完成，输入已保留。'}
    finally{if(current(epoch)){draft.pending=false;render()}}
  }
  function renderNewDraft(draft:NonNullable<typeof newDraft>){
    const form=node('section',undefined,'ew-memory-record');form.dataset.memoryNew='';form.dataset.memoryEditor='new'
    form.append(node('h3',t('新增记忆')))
    for(const key of ['title','content'] as const){
      const label=node('label',t(key==='title'?'记忆标题':'记忆内容'),'ew-memory-field'),field=key==='title'?node('input'):node('textarea')
      field.value=draft.input[key];field.maxLength=key==='title'?120:600;field.dataset.memoryField=key;field.setAttribute('aria-label',label.textContent!);field.disabled=draft.pending
      field.oninput=()=>{draft.input[key]=field.value};label.append(field);form.append(label)
    }
    const category=selectControl('记忆分类',Object.entries(kinds),draft.input.kind,value=>{draft.input.kind=value as MemoryInput['kind']}),scope=selectControl('记忆范围',[['global','全局'],...data!.projects.map(p=>[p.id,p.name])],draft.input.projectId??'global',value=>{draft.input.scope=value==='global'?'global':'project';draft.input.projectId=value==='global'?undefined:value})
    category.disabled=scope.disabled=draft.pending
    form.append(category,scope)
    if(draft.error){const error=node('p',t(draft.error),'ew-memory-conflict');error.role='alert';form.append(error)}
    const actions=node('div',undefined,'ew-memory-actions'),save=button(t('保存新记忆'),()=>void saveNew(draft)),cancel=button(t('取消新增'),()=>{newDraft=undefined;render()})
    save.disabled=cancel.disabled=draft.pending;actions.append(save,cancel);form.append(actions);return form
  }
  function render() {
    if (!page?.isConnected) return
    const active = page.contains(document.activeElement) ? document.activeElement as HTMLInputElement | HTMLTextAreaElement : undefined
    const focused = active?.getAttribute('aria-label')
    const focusedRowId = active?.closest<HTMLElement>('[data-memory-row]')?.dataset.memoryRow
    const editorId = active?.closest<HTMLElement>('[data-memory-editor]')?.dataset.memoryEditor
    const field = active?.dataset.memoryField
    const selection = field ? [active?.selectionStart ?? 0, active?.selectionEnd ?? 0] as const : undefined
    const scrollTop = page.scrollTop
    page.replaceChildren()
    const content = node('div', undefined, 'ew-memory-content'),
      heading = node('header', undefined, 'ew-memory-heading')
    heading.append(
      node('h1', t("记忆")),
      node('p', t("记住你的偏好，让新对话接得上。"))
    )
    content.append(heading)
    const status = node('div', undefined, 'ew-memory-notice')
    status.dataset.memoryNotice = ''
    status.setAttribute('aria-live', 'polite')
    content.append(status)
    page.append(content)
    setNotice(notice, noticeError)
    if (!data) {
      content.append(
        node(
          'p',
          noticeError ? t("已保存的记忆会保留。") : t("正在读取记忆…"),
          'ew-memory-muted'
        )
      )
      if (noticeError)
        content.append(button(t("重试"), () => void load(), 'ew-memory-retry'))
      return
    }
    const settings = node('section', undefined, 'ew-memory-controls')
    for(const [key,title,description] of [
      ['use','使用已保存的记忆','在私人对话中使用有依据的记忆；关闭后仍可管理。'],
      ['auto','自动保存记忆','从私人对话提炼长期偏好与项目事实，不确定内容待你确认。'],
      ['semantic','本地语义检索','支持中文改写检索；关闭后只查关键词，仍会核对依据。']
    ] as const){
      const value=data.settings[key]!==false
      settings.append(settingRow(title,description,settingPending?.key===key?settingPending.value===true:value,checked=>void changeSetting({type:'settings',[key]:checked},key,checked)))
    }
    if(data.session)settings.append(settingRow('本对话停用记忆','仅影响当前对话，不读取或自动保存记忆。',settingPending?.key==='session'?settingPending.value===true:data.session.disabled,disabled=>void changeSetting({type:'session',sessionId:data!.session!.id,disabled},'session',disabled)))
    const privacy=node('p',t('记忆与语义检索保存在本机。使用前由当前会话模型核对依据；若模型在云端，会发送问题和候选记忆。无依据或核对失败时不使用记忆。'),'ew-memory-privacy')
    const retrieval=node('div',undefined,'ew-memory-index')
    const retrievalText=node('span',t(data.retrieval?.message??'本地语义检索按需加载。'))
    retrievalText.role='status';retrievalText.dataset.memoryRetrieval=''
    const rebuild=button(t('重建索引'),()=>void changeSetting({type:'rebuild-index'},'rebuild'))
    rebuild.disabled=settingPending!==undefined
    retrieval.append(retrievalText,rebuild);settings.append(privacy,retrieval)
    const storage = data.document
    const directory = button(
      '',
      () => void openDirectory(),
      'ew-memory-directory-row'
    )
    directory.dataset.memoryDirectory = ''
    directory.setAttribute('aria-label', t("打开记忆存储目录"))
    directory.disabled =
      directoryPending || !bridge.openDirectory || !storage?.directory
    const folder = icon('folder')
    folder.classList.add('ew-memory-folder')
    const location = node('span', undefined, 'ew-memory-row-copy')
    location.append(
      node('strong', storage?.file.split(/[\\/]/).at(-1) || t("记忆.md")),
      node(
        'small',
        storage?.directory || t("存储目录信息暂不可用"),
        'ew-memory-path'
      )
    )
    const action = node('span', t("打开目录"), 'ew-memory-directory-action')
    action.append(icon('arrow'))
    directory.append(folder, location, action)
    settings.append(directory,node('p',t('记忆.md 是可读、可编辑的明文副本。可复制备份，编辑保存后会同步；请勿在共享目录存放私人记忆。'),'ew-memory-privacy'))
    if (storage?.error) {
      const error = node('p', storage.error, 'ew-memory-document-error')
      error.dataset.memoryDocumentError = ''
      error.role = 'alert'
      settings.append(error)
    }
    content.append(settings)
    const list = node('section', undefined, 'ew-memory-list')
    list.dataset.memoryList = ''
    list.setAttribute('aria-label', t('已保存的记忆'))
    const toolbar=node('header',undefined,'ew-memory-toolbar')
    toolbar.append(node('h2', t('已保存的记忆')),button(t('新增记忆'),()=>{if(!newDraft)newDraft={input:{title:'',content:'',kind:'preference',scope:'global'},pending:false};render();page?.querySelector<HTMLInputElement>('[data-memory-new] input')?.focus()}))
    list.append(toolbar)
    const filterBar=node('div',undefined,'ew-memory-filters'),search=node('input')
    search.type='search';search.value=filters.query;search.placeholder=t('搜索记忆');search.setAttribute('aria-label',t('搜索记忆'));search.dataset.memoryField='search'
    search.oninput=()=>{filters.query=search.value;render()}
    filterBar.append(search,
      selectControl('记忆分类',[['','全部分类'],...Object.entries(kinds)],filters.kind,value=>{filters.kind=value;render()}),
      selectControl('记忆范围',[['','全部范围'],['global','全局'],...data.projects.map(p=>[p.id,p.name])],filters.scope,value=>{filters.scope=value;render()}),
      selectControl('记忆状态',[['','全部状态'],...Object.entries(statuses)],filters.status,value=>{filters.status=value;render()}))
    list.append(filterBar)
    if(newDraft)list.append(renderNewDraft(newDraft))
    const query=filters.query.trim().normalize('NFKC').toLowerCase()
    const rows = data.rows.filter(row=>drafts.has(row.id)||((!query||(row.title+' '+row.content).normalize('NFKC').toLowerCase().includes(query))&&(!filters.kind||row.kind===filters.kind)&&(!filters.status||row.status===filters.status)&&(!filters.scope||(filters.scope==='global'?row.scope==='global':row.projectId===filters.scope))))
    // A record deleted elsewhere may still have a private draft the user needs to copy or cancel.
    for (const [id, draft] of drafts) if (!rows.some(row => row.id === id)) rows.push(draft.base)
    if (!rows.length) list.append(node('p', t(data.rows.length?'没有符合筛选条件的记忆。':'还没有保存记忆。'), 'ew-memory-empty'))
    for (const row of rows) list.append(renderRow(row, data.rows.find(latest => latest.id === row.id)))
    content.append(list)
    if (editorId && field) {
      const restored = [...page.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-memory-field]')].find(element => element.closest<HTMLElement>('[data-memory-editor]')?.dataset.memoryEditor === editorId && element.dataset.memoryField === field)
      restored?.focus({ preventScroll: true })
      if (selection) restored?.setSelectionRange(selection[0], selection[1])
    } else if (focused) {
      const restored=[...page.querySelectorAll<HTMLElement>('[aria-label]')]
        .find((element) => element.getAttribute('aria-label') === focused && (!focusedRowId || element.closest<HTMLElement>('[data-memory-row]')?.dataset.memoryRow === focusedRowId))
      restored?.focus({ preventScroll: true })
      if(selection&&restored?.tagName==='INPUT'&&['text','search'].includes((restored as HTMLInputElement).type))(restored as HTMLInputElement).setSelectionRange(selection[0],selection[1])
    }
    page.scrollTop = scrollTop
  }

  function hide() {
    closeDeleteDialog(false)
    root?.removeAttribute('data-memory-active')
    root?.querySelector('[data-memory-nav]')?.removeAttribute('aria-current')
    page?.remove()
    page = undefined
  }
  function activate(panel: HTMLElement) {
    root = panel
    pendingOpen = false
    panel.removeAttribute('data-account-active')
    panel.querySelector('.sherlock-account-page')?.remove()
    panel.querySelector('[data-account-nav]')?.removeAttribute('aria-current')
    panel.setAttribute('data-memory-active', 'true')
    panel
      .querySelector('[data-memory-nav]')
      ?.setAttribute('aria-current', 'page')
    if (!page?.isConnected) {
      page = node('section', undefined, 'ew-memory-page')
      page.dataset.memoryPage = ''
      page.setAttribute('aria-label', t("记忆设置"))
      panel.querySelector('.VOzbGW_content')?.append(page)
    }
    render()
    void load()
  }
  function open() {
    if (disposed) return
    const panel = document.querySelector<HTMLElement>('.VOzbGW_panel')
    if (panel) activate(panel)
    else {
      pendingOpen = true
      document.querySelector<HTMLButtonElement>('.VOzbGW_trigger')?.click()
    }
  }
  let renderedLocale = document.documentElement.dataset.odysseyLocale
  function reconcile() {
    if (renderedLocale !== document.documentElement.dataset.odysseyLocale) {
      renderedLocale = document.documentElement.dataset.odysseyLocale
      for (const nav of navs) { nav.setAttribute('aria-label', t('记忆')); nav.querySelector('span')!.textContent=t('记忆') }
      if (page) {page.setAttribute('aria-label',t('记忆设置'));render();renderDeleteDialog?.()}
    }
    if (disposed) return
    for (const nav of navs) if (!nav.isConnected) navs.delete(nav)
    if (root && !root.isConnected) root = undefined
    if (page && !page.isConnected) page = undefined
    for (const panel of document.querySelectorAll<HTMLElement>(
      '.VOzbGW_panel'
    )) {
      const list = panel.querySelector('.VOzbGW_navList')
      if (!list || panel.querySelector('[data-memory-nav]')) continue
      const nav = button('', () => activate(panel), 'VOzbGW_navCell')
      nav.dataset.memoryNav = ''
      nav.setAttribute('aria-label', t("记忆"))
      const mark = icon('memory')
      mark.classList.add('VOzbGW_navIcon')
      nav.append(mark, node('span', t("记忆"), 'VOzbGW_navLabel'))
      const previous = list.querySelector('[data-settings-section-id="models"]') ?? list.querySelector('[data-account-nav]')
      if (previous) previous.after(nav)
      else list.append(nav)
      navs.add(nav)
    }
    if (root?.hasAttribute('data-account-active')) hide()
    if (pendingOpen) {
      const panel = document.querySelector<HTMLElement>('.VOzbGW_panel')
      if (panel) activate(panel)
    }
  }
  function resetIdentity() {
    if (disposed) return
    identityEpoch++
    readSequence++
    data = undefined
    drafts.clear()
    newDraft=undefined;expanded.clear();Object.assign(filters,{query:'',kind:'',scope:'',status:''})
    deleting.clear()
    changing.clear()
    closeDeleteDialog(false)
    settingPending = undefined
    directoryPending = false
    refreshPending = false
    notice = ''
    noticeError = false
    selectionQueue = Promise.resolve()
    clearToast()
    explicitSession = false
    sessionOverride = undefined
    render()
    void load()
  }
  function onNavClick(event: Event) {
    const target = event.target as Element | null
    if (
      !target?.closest('[data-memory-nav]') &&
      target?.closest(
        'nav [data-settings-section-id],nav [data-account-nav],.sherlock-settings-back,.VOzbGW_close'
      )
    )
      hide()
  }
  function onSidebarSelection() {
    explicitSession = false
    sessionOverride = undefined
    readSequence++
    if (page?.isConnected) void load()
  }
  function onSession(event: Event) {
    const value = (event as CustomEvent<{ sessionId?: string }>).detail
    explicitSession = true
    sessionOverride = value?.sessionId
    readSequence++
    if (page?.isConnected) void load()
  }
  function onOpen(event: Event) {
    const value = (event as CustomEvent<{ sessionId?: string }>).detail
    if (value?.sessionId) {
      explicitSession = true
      sessionOverride = value.sessionId
    }
    open()
  }
  function onSelection(event: Event) {
    const value = (event as CustomEvent<Selection>).detail
    if (typeof value?.content !== 'string' || !value.content.trim()) return
    const content = value.content.trim()
    if (content.length > 600) {
      showToast(t("所选内容超过 600 字，请选择较短的一段再记住。"), true)
      return
    }
    const epoch = identityEpoch,
      sessionId =
        value.sessionId || value.source?.sessionId || currentSession(),
      source = value.source
    // The queue captures the original identity and session, even if the visible
    // conversation changes while the native context menu is being handled.
    selectionQueue = selectionQueue.then(async () => {
      if (!current(epoch)) return
      try {
        let context = data
        if (!context || (sessionId && context.session?.id !== sessionId))
          context = await bridge.request({ type: 'snapshot', sessionId })
        if (!current(epoch)) return
        if (data && context.owner !== data.owner) return
        const projectId =
          context.session?.id === sessionId
            ? context.session?.projectId
            : undefined
        const input: MemoryInput = {
          title: (value.title?.trim() || source?.title || t("选区记忆")).slice(
            0,
            120
          ),
          content,
          kind: projectId ? 'background' : 'preference',
          scope: projectId ? 'project' : 'global',
          projectId,
          source
        }
        const next = await bridge.request({ type: 'save', input })
        if (!current(epoch)) return
        if (next.owner !== context.owner) return
        if (accept(next, epoch)) render()
        if (next.document?.error)
          showToast(t("记忆.md 暂未写入，原内容仍会保留。请稍后重试。"), true)
        else if (!next.document)
          showToast(t("记忆已保存，存储文件状态暂不可用。"), true)
        else showToast(t("已保存到记忆.md"))
      } catch {
        if (current(epoch))
          showToast(t("记忆保存未完成，原内容仍会保留。请稍后重试。"), true)
      }
    })
  }
  document.addEventListener('click', onNavClick, true)
  document.addEventListener('sherlock-sidebar-selection', onSidebarSelection)
  document.addEventListener('sherlock:memory-session', onSession)
  document.addEventListener('sherlock:memory-open', onOpen)
  document.addEventListener('sherlock:memory-save-selection', onSelection)
  const observer = new win.MutationObserver(reconcile)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-account-active','data-odyssey-locale']
  })
  const unsubscribe = bridge.subscribe?.(() => {
    if (page?.isConnected) void load()
  })
  reconcile()
  function dispose() {
    if (disposed) return
    disposed = true
    identityEpoch++
    readSequence++
    observer.disconnect()
    unsubscribe?.()
    hide()
    clearToast()
    style.remove()
    data = undefined
    drafts.clear()
    newDraft=undefined;expanded.clear();Object.assign(filters,{query:'',kind:'',scope:'',status:''})
    deleting.clear()
    changing.clear()
    for (const nav of navs) nav.remove()
    navs.clear()
    document.removeEventListener('click', onNavClick, true)
    document.removeEventListener(
      'sherlock-sidebar-selection',
      onSidebarSelection
    )
    document.removeEventListener('sherlock:memory-session', onSession)
    document.removeEventListener('sherlock:memory-open', onOpen)
    document.removeEventListener('sherlock:memory-save-selection', onSelection)
  }
  return { resetIdentity, dispose }
}
