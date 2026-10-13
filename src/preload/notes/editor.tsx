import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { BlockNoteSchema, defaultBlockSpecs, createUserStore } from '@blocknote/core'
import { zh } from '@blocknote/core/locales'
import { SideMenuExtension } from '@blocknote/core/extensions'
import { CommentsExtension, DefaultThreadStoreAuth } from '@blocknote/core/comments'
import { withCollaboration, YjsThreadStore } from '@blocknote/core/yjs'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote, useBlockNoteEditor, createReactBlockSpec, FormattingToolbar, FormattingToolbarController, BlockTypeSelect, BasicTextStyleButton, ColorStyleButton, CreateLinkButton, AddCommentButton, TextAlignButton, SideMenuController, SideMenu, DragHandleButton, useExtensionState, SuggestionMenuController } from '@blocknote/react'
import * as Y from 'yjs'
import { noteOutline, noteText, restoreNoteDraft, noteSuggestionPreview, noteComponentRequest, type NoteSuggestionPreview, type NoteContent, type NoteLoad, type NotesBridge, type NoteAiResult } from '../../shared/workspace-notes'
import { NotesOutline } from './outline'
import { NoteAiSelection } from './selection'
import { replaceNoteSelection } from './replace-selection'
import { SuggestionPanel } from './suggestion-panel'
import { NoteMenuIcon } from './menu-icon'
import { NativeSlashMenu } from './native-slash-menu'
import { recordSidebarSessionUse } from '../../../scripts/lib/sidebar-session-recency.mjs'

type Props = { sessionId: string; bridge: NotesBridge; dark: boolean; navigate(view: string): void }
type ComposerAdmission = {draft:string;draftRev:number;imageIds:string[]}
const Context = createContext<{ bridge: NotesBridge; sessionId: string; dark: boolean; navigate(view: string): void; editor?: any } | null>(null)
const encode = (doc: Y.Doc) => { const bytes = Y.encodeStateAsUpdate(doc); let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s) }
const plain = (content: NoteContent) => content.title + '\n\n' + content.blocks.map(b => noteText(b.content) || (b.type === 'research' ? '[研究组件]' : '')).join('\n\n')

function ResearchBlock({ block }: any) {
  const context = useContext(Context)!, [html, setHtml] = useState(''), [error, setError] = useState('')
  const node = useMemo(() => { try { return JSON.parse(block.props.payload) } catch { return {} } }, [block.props.payload])
  const [height, setHeight] = useState(Number.isFinite(node.height)?Math.max(120,node.height-80):320), frame = useRef<HTMLIFrameElement>(null), intrinsic=useRef(false)
  useEffect(() => {
    let live = true; setError(''); setHtml('');intrinsic.current=false
    if (!node.containerSpec) { setError(node.generationError || (node.generationStatus === 'running' ? '正在创建组件，已保留正文中的位置…' : node.generationStatus === 'interrupted' ? '创建已停止，可重新描述需求。' : '组件尚未提供内容。')); return }
    context.bridge.request('render', { sessionId: context.sessionId, spec: node.containerSpec, dark:context.dark }).then((result: any) => { if (live) { setHtml(result.document || result.html); if (!result.html) setError('此组件保留在笔记中，可在研究中查看。') } }).catch((e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [block.props.payload, context.bridge, context.sessionId])
  useEffect(() => {
    const receive = (e: MessageEvent) => { if (e.source !== frame.current?.contentWindow || !Number.isFinite(e.data?.height))return;if(e.data.type==='sherlock-workbench-content-size')intrinsic.current=true;else if(intrinsic.current||!['ework-note-height','sherlock-content-size'].includes(e.data.type))return;setHeight(Math.min(2400,Math.max(120,e.data.height))) }
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive)
  }, [])
  useEffect(()=>{frame.current?.contentWindow?.postMessage({type:'sherlock-theme',colorScheme:context.dark?'dark':'light'},'*')},[context.dark,html])
  const doc=html

  return <section className="en-research" contentEditable={false} data-note-research-block={block.id}>
    <header className="en-research-header"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true"><path d="M3 4a6 6 0 1 1-1 6M3 1v4H0M8 4v4l3 2"/></svg><strong>{node.title||'研究组件'}</strong>{context.editor?.getBlock(block.id) ? <button aria-label="移除笔记中的组件" title="移除组件" onClick={()=>context.editor.removeBlocks([block.id])}>×</button> : null}</header>
    {html ? <iframe ref={frame} title={node.title || '研究组件'} sandbox="allow-scripts" srcDoc={doc} onLoad={()=>frame.current?.contentWindow?.postMessage({type:'sherlock-theme',colorScheme:context.dark?'dark':'light'},'*')} style={{ height }} /> : <div className="en-component-empty"><strong>{node.title || '研究组件'}</strong><p>{error || '正在读取组件…'}</p></div>}
    <div className="en-source"><span>{node.refreshError ? '刷新失败 · 已保留上次内容' : node.sourceText || (node.containerSpec ? '研究组件 · 已保留来源内容' : '未绑定数据源 · 未刷新')}</span><button onClick={() => context.navigate('research')}>↗ 前往研究</button></div>
  </section>
}
const researchSpec = createReactBlockSpec({ type: 'research', propSchema: { payload: { default: '' } }, content: 'none' }, { render: ResearchBlock, toExternalHTML: ({ block }: any) => <div data-ework-note-research={block.props.payload}>研究组件</div>, parse: (element: HTMLElement) => element.hasAttribute('data-ework-note-research') ? { payload: element.getAttribute('data-ework-note-research')! } : undefined })()
const schema = BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, research: researchSpec } })
function MarkdownPreview({ markdown, dark }: { markdown: string; dark: boolean }) {
  const editor = useCreateBlockNote({ dictionary: zh })
  useEffect(() => { editor.replaceBlocks(editor.document, editor.tryParseMarkdownToBlocks(markdown)) }, [editor, markdown])
  return <BlockNoteView editor={editor} theme={dark ? 'dark' : 'light'} editable={false} formattingToolbar={false} sideMenu={false} slashMenu={false} />
}

function BlockMenu(props: any) {
  const editor: any = useBlockNoteEditor(), block = useExtensionState(SideMenuExtension, {selector: state => state?.block}), [open, setOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null), anchor=useRef<HTMLDivElement>(null),[position,setPosition]=useState<React.CSSProperties>()
  useEffect(() => { if (!open) return; const dismiss = (e: Event) => { if (!menu.current?.contains(e.target as Node)&&!anchor.current?.contains(e.target as Node)) setOpen(false) }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') {setOpen(false);anchor.current?.querySelector<HTMLButtonElement>('button')?.focus()} }; document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', key); return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', key) } }, [open])
  useLayoutEffect(()=>{
    if(!open)return
    const update=()=>{if(!menu.current||!anchor.current)return;const rect=anchor.current.getBoundingClientRect(),height=menu.current.scrollHeight+2,width=menu.current.offsetWidth,below=window.innerHeight-rect.bottom-12,above=rect.top-12,down=below>=height||below>=above,available=Math.max(40,down?below:above);setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-width-8)),top:down?rect.bottom+4:Math.max(8,rect.top-4-Math.min(height,available)),maxHeight:available})}
    update();window.addEventListener('resize',update);window.addEventListener('scroll',update,true)
    return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true)}
  },[open,block?.id])
  useEffect(()=>{const extension=editor.getExtension(SideMenuExtension);if(open)extension?.freezeMenu();return()=>extension?.unfreezeMenu()},[editor,open])
  if (!block) return null
  const change = (type: string, p: any = {}) => { editor.updateBlock(block, { type, props: p }); setOpen(false); editor.focus() }
  const duplicate = () => { const { id, ...copy } = block; editor.insertBlocks([copy], block, 'after'); setOpen(false) }
  return <div className="en-side" ref={anchor}><button className="en-block-trigger" title="段落操作" aria-label="段落操作" aria-expanded={open} onMouseDown={e => e.preventDefault()} onClick={() => setOpen(!open)}>T</button><SideMenu {...props}><DragHandleButton {...props} /></SideMenu>
    {open ? createPortal(<div ref={menu} className="en-block-menu" role="menu" style={{...position,visibility:position?'visible':'hidden'}}><div className="en-block-types">{[['正文', 'paragraph', 0], ['H1', 'heading', 1], ['H2', 'heading', 2], ['H3', 'heading', 3], ['H4', 'heading', 4]].map(([label, type, level]) => <button role="menuitem" key={label} onClick={() => change(String(type), level ? { level } : {})}><NoteMenuIcon kind={String(type)}/>{label}</button>)}</div>
      {([['无序列表', 'bulletListItem'], ['有序列表', 'numberedListItem'], ['待办列表', 'checkListItem'], ['代码块', 'codeBlock'], ['引用', 'quote'], ['分隔线', 'divider']] as const).map(([label, type]) => <button role="menuitem" key={type} onClick={() => change(type)}><NoteMenuIcon kind={type}/>{label}</button>)}
      <hr /><div className="en-block-types en-block-align">{[['左对齐', 'left'], ['居中', 'center'], ['右对齐', 'right']].map(([label, textAlignment]) => <button key={label} onClick={() => change(block.type, { textAlignment })}><NoteMenuIcon kind={String(textAlignment)}/>{label}</button>)}</div>
      <button onClick={() => { editor.setTextCursorPosition(block, 'start'); editor.nestBlock(); setOpen(false) }}><NoteMenuIcon kind="indent"/>增加缩进</button><button onClick={() => { editor.setTextCursorPosition(block, 'start'); editor.unnestBlock(); setOpen(false) }}><NoteMenuIcon kind="outdent"/>减少缩进</button><hr />
      <button onClick={duplicate}><NoteMenuIcon kind="copy"/>复制段落</button><button onClick={() => { editor.insertBlocks([{ type: 'paragraph' }], block, 'after'); setOpen(false) }}><NoteMenuIcon kind="add"/>在下方添加</button><button className="en-danger" onClick={() => { editor.removeBlocks([block]); setOpen(false) }}><NoteMenuIcon kind="delete"/>删除段落</button>
    </div>,document.body) : null}</div>
}

export function NotesApp(props: Props) {
  const [loaded, setLoaded] = useState<NoteLoad>(), [loadError, setLoadError] = useState(''), [recovery, setRecovery] = useState(false), [loadVersion, setLoadVersion] = useState(0), [recovering, setRecovering] = useState(false)
  const refresh = () => { setLoadError(''); props.bridge.request('load', { sessionId: props.sessionId }).then((value: NoteLoad) => { setLoaded(value); setRecovery(!!value.draft); setLoadVersion(v => v + 1) }).catch((e: Error) => setLoadError(e.message)) }
  const resolveRecovery = async (restore: boolean) => {
    if (!loaded?.draft || recovering) return
    setRecovering(true)
    try {
      if (restore) setLoaded(await restoreNoteDraft(props.bridge, props.sessionId, loaded))
      else { await props.bridge.request('discard', { sessionId: props.sessionId, clientId: loaded.draft.clientId }); setLoaded({ saved: loaded.saved }) }
      setRecovery(false); setLoadVersion(v => v + 1)
    } catch (e) { setLoadError((e as Error).message) }
    finally { setRecovering(false) }
  }
  useEffect(() => { let live = true; props.bridge.request('load', { sessionId: props.sessionId }).then((value: NoteLoad) => { if (live) { setLoaded(value); setRecovery(!!value.draft) } }).catch((e: Error) => live && setLoadError(e.message)); return () => { live = false } }, [props.sessionId, props.bridge])
  return <div className="en-shell">
    {loadError ? <div className="en-load-error"><p>{loadError}</p><button onClick={refresh}>重新读取</button></div> : !loaded ? <div className="en-load-error">正在打开笔记…</div> : <NotesEditor key={props.sessionId + ':' + loadVersion} {...props} initial={loaded.saved} recovery={recovery ? loaded.draft : undefined} recovering={recovering} onRecovery={resolveRecovery} onReload={refresh} />}
  </div>
}

function NotesEditor(props: Props & { initial: NoteContent & { revision: number }; recovery?: NoteLoad['draft']; recovering: boolean; onRecovery(restore: boolean): void; onReload(): void }) {
  const [title, setTitle] = useState(props.initial.title), [status, setStatus] = useState(props.recovery ? '发现本地草稿' : '已保存'), [error, setError] = useState(''), [outline, setOutline] = useState<any[]>([]), [active, setActive] = useState(''), [preview, setPreview] = useState<NoteSuggestionPreview & {nativeComposer?:ComposerAdmission;requestId:string}>(), [compare, setCompare] = useState(false)
  const client = useRef((props.initial as any).clientId || crypto.randomUUID()), revision = useRef(props.initial.revision), titleRef = useRef(title), scroll = useRef<HTMLDivElement>(null), saveTimer = useRef<ReturnType<typeof setTimeout>>(), saveQueue = useRef(Promise.resolve()), disposed = useRef(false), request = useRef(''), epoch = useRef(0), selection = useRef({ text: '', from: 0, to: 0, cursor: '' }), lastWritten = useRef(''), latest = useRef<NoteContent>(props.initial)
  titleRef.current = title
  const doc = useMemo(() => { const value = new Y.Doc(); if (props.initial.yjs) Y.applyUpdate(value, Uint8Array.from(atob(props.initial.yjs), c => c.charCodeAt(0))); return value }, [])
  const users = useMemo(() => createUserStore(async ids => ids.map(id => ({ id, username: '我', avatarUrl: '' }))), [])
  const editor: any = useCreateBlockNote(withCollaboration({ schema, dictionary: zh, dropCursor:{width:1,color:'var(--en-drag-ink)'}, initialContent: props.initial.blocks.length ? props.initial.blocks as any : undefined, collaboration: { fragment: doc.getXmlFragment('note'), user: { name: '我', color: '#94b2ff' } }, extensions: [NoteAiSelection(), CommentsExtension({ threadStore: new YjsThreadStore('local', doc.getMap('threads'), new DefaultThreadStoreAuth('local', 'editor')), resolveUsers: users, confirmBeforeDiscard: false })] } as any))
  const pinnedSelection = useRef<(typeof selection.current) & { fingerprint: string }>()
  const [assistantVisible,setAssistantVisible]=useState(false),[writing,setWriting]=useState(false),anchorVersion=useRef(0)
  const assistantHost=useMemo(()=>{const host=document.createElement('div');host.className='en-inline-assistant';host.contentEditable='false';return host},[])
  const paintSelection = (range: {from:number;to:number}) => {const version=++anchorVersion.current;setAssistantVisible(true);editor.getExtension(NoteAiSelection)?.highlight(range,assistantHost,()=>queueMicrotask(()=>{if(!disposed.current&&anchorVersion.current===version){setAssistantVisible(false);}}))}
  const clearSelection = () => { if(!pinnedSelection.current&&!assistantVisible)return;anchorVersion.current++;pinnedSelection.current = undefined; selection.current={...selection.current,text:'',from:0,to:0};setAssistantVisible(false); editor.getExtension(NoteAiSelection)?.highlight() }
  const engagement = useRef({started:false,target:'',sent:undefined as string|undefined,busy:false,timer:undefined as ReturnType<typeof setTimeout>|undefined})
  const persistEngagement = async () => {
    const state=engagement.current;if(!state.started||state.busy||state.sent===state.target)return;state.busy=true;const title=state.target
    try { await props.bridge.request('engage',{sessionId:props.sessionId,title});state.sent=title }
    catch(e){if(!disposed.current)setError((e as Error).message)}
    finally{state.busy=false;if(state.target!==title)void persistEngagement()}
  }
  const engage = () => {
    recordSidebarSessionUse(props.sessionId)
    document.dispatchEvent(new CustomEvent('sherlock:notes-edited',{detail:{sessionId:props.sessionId}}))
    const state=engagement.current;state.started=true;state.target=titleRef.current;clearTimeout(state.timer)
    if(state.sent===undefined)void persistEngagement();else state.timer=setTimeout(()=>void persistEngagement(),300)
  }
  const snapshot = (): NoteContent => ({ title: titleRef.current, blocks: editor.document, yjs: encode(doc) })
  const save = () => {
    clearTimeout(saveTimer.current)
    saveQueue.current = saveQueue.current.then(async () => {
      const content = snapshot(), fingerprint = JSON.stringify(content)
      if (fingerprint === lastWritten.current) return
      try {
        const result = await props.bridge.request('save', { sessionId: props.sessionId, revision: revision.current, content, clientId: client.current })
        if (result.status === 'conflict') { setStatus('保存冲突'); setError('已有较新保存版本，你的修改已保留为本地草稿。请重新打开笔记并对比。'); return }
        revision.current = result.saved.revision; lastWritten.current = fingerprint
        if (!disposed.current) { setStatus(JSON.stringify(snapshot()) === fingerprint ? '已保存' : '保存中…'); setError('') }
      } catch (e) { if (!disposed.current) { setStatus('保存失败 · 本地草稿'); setError((e as Error).message) } }
    })
  }
  const changed = () => {
    engage()
    const content = snapshot(); latest.current = content; setOutline(noteOutline(content.blocks)); setStatus('保存中…')
    void props.bridge.draft({ sessionId: props.sessionId, clientId: client.current, revision: revision.current, content }).catch((e: Error) => { if (!disposed.current) { setStatus('草稿保存失败'); setError(e.message) } })
    clearTimeout(saveTimer.current); saveTimer.current = setTimeout(save, 750)
  }
  useEffect(() => {
    lastWritten.current = JSON.stringify(snapshot()); setOutline(noteOutline(editor.document))
    const off = editor.onChange(changed), offSelection = editor.onSelectionChange(() => { const tiptap = editor._tiptapEditor, range = tiptap.state.selection; selection.current = { text: editor.getSelectedText(), from: range.from, to: range.to, cursor: editor.getTextCursorPosition().block.id } })
    const commentChanged = () => changed(); doc.getMap('threads').observeDeep(commentChanged)
    const flush = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() } }
    window.addEventListener('keydown', flush)
    return () => { disposed.current = true; epoch.current++; clearTimeout(saveTimer.current); clearTimeout(engagement.current.timer);void persistEngagement(); off(); offSelection(); doc.getMap('threads').unobserveDeep(commentChanged); window.removeEventListener('keydown', flush); if (request.current) { publishTask(request.current,'stopped'); void props.bridge.request('stop', { sessionId: props.sessionId, requestId: request.current }) }; save() }
  }, [])
  const locate = (id: string) => { const element = scroll.current?.querySelector<HTMLElement>('[data-id="' + CSS.escape(id) + '"]'); if (element) { element.scrollIntoView({ block: 'start', behavior: 'smooth' }); setActive(id) } }
  const track = () => { const top = scroll.current?.getBoundingClientRect().top ?? 0; let current = outline[0]?.id; for (const h of outline) { const el = scroll.current?.querySelector('[data-id="' + CSS.escape(h.id) + '"]'); if (el && el.getBoundingClientRect().top <= top + 140) current = h.id } setActive(current || '') }
  const paste = async (event?: React.ClipboardEvent) => {
    if (props.recovery) return
    if (event) { if (!event.clipboardData.getData('text/html').includes('sherlock-research-clipboard')) return; event.preventDefault() }
    try { const result = await props.bridge.request('clipboard', { sessionId: props.sessionId }); if (result.kind === 'components') { event?.preventDefault(); editor.insertBlocks(result.nodes.map((node: any) => ({ type: 'research', props: { payload: JSON.stringify(node) } })), editor.getTextCursorPosition().block, 'after'); editor.focus() } } catch (e) { setError((e as Error).message) }
  }
  const publishComposer = (value: {running?: boolean;ready?: boolean}) => document.dispatchEvent(new CustomEvent('sherlock:notes-composer-state',{detail:{sessionId:props.sessionId,ready:!props.recovery,running:!!request.current,...value}}))
  const setNativeDraft = (text?: string, focus=false) => document.dispatchEvent(new CustomEvent('sherlock:notes-composer-draft',{detail:{sessionId:props.sessionId,...text===undefined?{}:{text,clearImages:text===''},focus}}))
  const commitNativeDraft = (admission?:ComposerAdmission) => document.dispatchEvent(new CustomEvent('sherlock:notes-composer-commit',{detail:{sessionId:props.sessionId,admission}}))
  const publishTask = (requestId:string,phase:string,value:Record<string,unknown>={}) => {document.dispatchEvent(new CustomEvent('sherlock:notes-task-state',{detail:{sessionId:props.sessionId,requestId,phase,...value}}));if(['accepted','discarded'].includes(phase))void props.bridge.request('conversation-state',{sessionId:props.sessionId,requestId,phase}).catch(()=>{})}
  const lastRequest=useRef<{prompt:string;images:any[];admission?:ComposerAdmission;captured:typeof selection.current;fingerprint:string}>()
  const generatingBlock = useRef('')
  const generate = async (prompt: string, images: any[] = [], admission?:ComposerAdmission, retry?:typeof lastRequest.current) => {
    if ((!prompt.trim() && !images.length) || request.current || props.recovery) return
    const attempt = ++epoch.current, captured = { ...(retry?.captured || pinnedSelection.current || selection.current) }, fingerprint = retry?.fingerprint || pinnedSelection.current?.fingerprint || JSON.stringify(editor.document), requestId = crypto.randomUUID()
    if(!retry&&pinnedSelection.current){const range=editor.getExtension(NoteAiSelection)?.currentRange();Object.assign(captured,range?{...range,text:editor._tiptapEditor.state.doc.textBetween(range.from,range.to,'\n')}:{from:0,to:0,text:''})}
    const component = noteComponentRequest(prompt)
    engage()
    lastRequest.current={prompt,images,admission,captured,fingerprint}
    publishTask(requestId,'preparing',{prompt,operation:component?'component':captured.text?'rewrite':'write'})
    if(!component&&captured.text)paintSelection(captured)
    request.current = requestId;setWriting(true); publishComposer({running:true}); setError(''); setPreview(undefined)
    let pending = ''
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document)
      if (component) {
        const reference = captured.cursor ? editor.getBlock(captured.cursor) : editor.getTextCursorPosition().block
        const created = editor.insertBlocks([{ type: 'research', props: { payload: JSON.stringify({ id: requestId, title: '正在创建研究组件', kind: 'generated-container', generationStatus: 'running', generationDetail: prompt, sourceText: '未绑定数据源 · 未刷新' }) } }], reference || editor.getTextCursorPosition().block, 'after')
        pending = created[0].id; generatingBlock.current = pending
        requestAnimationFrame(() => locate(pending))
      }
      publishTask(requestId,'generating')
      const result: NoteAiResult = await props.bridge.request('generate', { sessionId: props.sessionId, requestId, title, markdown, selection: captured.text, prompt, images, mode: component ? 'component' : 'write' })
      if (disposed.current || epoch.current !== attempt) return
      if (component && result.kind === 'component' && editor.getBlock(pending)) {
        publishTask(requestId,'accepted',{result}); editor.updateBlock(pending, { props: { payload: JSON.stringify(result.node) } }); commitNativeDraft(admission); changed(); requestAnimationFrame(() => locate(pending))
      } else {
        if (pending && editor.getBlock(pending)) editor.removeBlocks([pending])
        if(result.kind==='conversation') {
          publishTask(requestId,'replied',{result}); commitNativeDraft(admission)
          const range=editor.getExtension(NoteAiSelection)?.currentRange()
          if(captured.text&&range)pinnedSelection.current={...captured,...range,text:editor._tiptapEditor.state.doc.textBetween(range.from,range.to,'\n'),fingerprint:JSON.stringify(editor.document)}
          else if(captured.text)clearSelection()
        }
        else { publishTask(requestId,'ready',{result}); setPreview({requestId,...noteSuggestionPreview(result, { ...captured, fingerprint, cursor: captured.cursor || editor.getTextCursorPosition().block.id }),nativeComposer:admission}) }
      }
    } catch (e) {
      if (!disposed.current && epoch.current === attempt) {
        const message = (e as Error).name === 'AbortError' ? '生成已停止，可调整需求后重试。' : (e as Error).message
        if (pending && editor.getBlock(pending)) editor.updateBlock(pending, { props: { payload: JSON.stringify({ id: requestId, title: '研究组件', kind: 'generated-container', generationStatus: 'failed', generationError: message, sourceText: '未绑定数据源 · 未刷新' }) } })
        publishTask(requestId,'failed',{error:message}); setError(message)
      }
    } finally { if (!disposed.current && epoch.current === attempt) {setWriting(false); publishComposer({running:false}); request.current = ''; generatingBlock.current = '' } }
  }
  const stop = () => { epoch.current++; const id = request.current; request.current = '';setWriting(false); publishComposer({running:false}); if (id) publishTask(id,'stopped'); if (id) void props.bridge.request('stop', { sessionId: props.sessionId, requestId: id }); if (generatingBlock.current && editor.getBlock(generatingBlock.current)) editor.updateBlock(generatingBlock.current, { props: { payload: JSON.stringify({ title: '研究组件', kind: 'generated-container', generationStatus: 'interrupted', sourceText: '未绑定数据源 · 未刷新' }) } }); generatingBlock.current = ''; setError('生成已停止，笔记内容已保留。') }
  const apply = async (replace: boolean) => {
    if (!preview) return
    editor.focus()
    const blocks = preview.result.kind === 'component' ? [{ type: 'research', props: { payload: JSON.stringify(preview.result.node) } }] : editor.tryParseMarkdownToBlocks(preview.result.markdown)
    const range=editor.getExtension(NoteAiSelection)?.currentRange()
    if(replace&&preview.result.kind==='text'&&range)replaceNoteSelection(editor,range,blocks,preview.result.markdown)
    else { const reference = editor.getBlock(preview.cursor) || editor.getTextCursorPosition().block; editor.insertBlocks(blocks, reference, 'after') }
    setError('')
    publishTask(preview.requestId,'accepted'); if(preview.nativeComposer)commitNativeDraft(preview.nativeComposer); setPreview(undefined); clearSelection(); changed()
  }
  const discardPreview=()=>{if(preview)publishTask(preview.requestId,'discarded');setPreview(undefined);clearSelection()}
  const regenerate=()=>{const previous=lastRequest.current;if(!previous||request.current)return;if(preview)publishTask(preview.requestId,'discarded');const range=editor.getExtension(NoteAiSelection)?.currentRange();void generate(previous.prompt,previous.images,previous.admission,{...previous,captured:{...previous.captured,...(range||{from:0,to:0}),text:range?editor._tiptapEditor.state.doc.textBetween(range.from,range.to,'\n'):''}})}
  const commands = useRef({generate,stop,exportNote:(_format?:string)=>{}});commands.current={generate,stop,exportNote:(format?:string)=>{void exportNote(format)}}
  useEffect(()=>{
    const progress=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.sessionId===props.sessionId&&value.requestId===request.current)publishTask(value.requestId,'generating',{stage:value.stage,reasoning:value.reasoning,outputChars:value.outputChars,...value.seq===undefined?{}:{seq:value.seq,startedAt:value.startedAt}})}
    document.addEventListener('sherlock:notes-generation-progress',progress)
    const submit=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.sessionId!==props.sessionId||props.recovery)return;document.dispatchEvent(new CustomEvent('sherlock:notes-submit-accepted',{detail:{sessionId:props.sessionId,submissionId:detail.submissionId}}));void commands.current.generate(detail.prompt,detail.images,detail.admission)}
    const exportRequested=(event:Event)=>{if((event as CustomEvent).detail?.sessionId===props.sessionId)commands.current.exportNote((event as CustomEvent).detail.format)}
    document.addEventListener('sherlock:notes-export',exportRequested)
    const cancel=(event:Event)=>{if((event as CustomEvent).detail?.sessionId===props.sessionId)commands.current.stop()}
    const sessionError=(event:Event)=>{if((event as CustomEvent).detail?.sessionId===props.sessionId)setError((event as CustomEvent).detail.message)}
    const state=(event:Event)=>{if((event as CustomEvent).detail?.sessionId===props.sessionId)publishComposer({})}
    document.addEventListener('sherlock:notes-submit',submit);document.addEventListener('sherlock:notes-stop',cancel);document.addEventListener('sherlock:notes-session-error',sessionError);document.addEventListener('sherlock:notes-composer-request-state',state);publishComposer({running:false})
    return()=>{document.removeEventListener('sherlock:notes-generation-progress',progress);document.removeEventListener('sherlock:notes-export',exportRequested);document.removeEventListener('sherlock:notes-submit',submit);document.removeEventListener('sherlock:notes-stop',cancel);document.removeEventListener('sherlock:notes-session-error',sessionError);document.removeEventListener('sherlock:notes-composer-request-state',state);publishComposer({ready:false,running:false})}
  },[props.sessionId,props.recovery])
  const exportNote = async (format='md') => {try{await props.bridge.request('export',{sessionId:props.sessionId,format,content:snapshot()})}catch(e){setError((e as Error).message)}}
  const ctx = useMemo(() => ({ bridge: props.bridge, sessionId: props.sessionId, dark: props.dark, navigate: props.navigate, editor }), [props.bridge, props.sessionId, props.dark, props.navigate, editor])
  const slashMenu = useMemo(() => (menuProps:any) => <NativeSlashMenu {...menuProps} bridge={props.bridge} sessionId={props.sessionId} dark={props.dark} />,[props.bridge,props.sessionId,props.dark])
  const suggestion=<>{writing ? <div className="en-ai-loading" role="status" aria-live="polite"><span className="en-ai-spinner" aria-hidden="true"/><span>正在生成内容…</span><button onClick={stop}>停止</button></div> : null}{error ? <div className="en-error" role="alert"><span>{error}</span>{status === '保存冲突' ? <button onClick={async () => { try { await props.bridge.draft({ sessionId: props.sessionId, clientId: client.current, revision: revision.current, content: snapshot() }); props.onReload() } catch (e) { setError((e as Error).message) } }}>重新读取并对比</button> : null}<button onClick={() => setError('')} aria-label="关闭提示">×</button></div> : null}
      {preview ? <SuggestionPanel resizable={!assistantVisible} header={<><strong>{preview.result.kind === 'component' ? '创建的研究组件' : '内容预览'}</strong><button aria-label="放弃建议" onClick={discardPreview}>×</button></>} footer={<>{preview.selectedText && preview.result.kind === 'text' && editor.getExtension(NoteAiSelection)?.currentRange() ? <button onClick={() => apply(true)}>替换所选</button> : null}<button onClick={() => apply(false)}>{preview.result.kind === 'component' ? '写入正文' : '插入到下方'}</button><button onClick={regenerate}>重新撰写</button><button onClick={discardPreview}>放弃</button></>}>
        {preview.result.kind === 'text' ? <MarkdownPreview markdown={preview.result.markdown} dark={props.dark} /> : <ResearchBlock block={{ id: 'preview', props: { payload: JSON.stringify(preview.result.node) } }} />}
      </SuggestionPanel> : null}</>
  return <Context.Provider value={ctx}><div className="en-body">
    <NotesOutline headings={outline} active={active} onLocate={locate} />
    <main className="en-main"><div className="en-document-scroll" ref={scroll} onScroll={track} onPasteCapture={paste} onPointerDownCapture={e=>{if(!request.current&&!preview&&!(e.target as HTMLElement).closest('.en-inline-assistant')&&(e.target as HTMLElement).closest('.bn-editor,.en-title'))clearSelection()}}>
      <div className="en-document">
        {props.recovery ? <div className="en-recovery"><strong>发现未保存的本地草稿</strong><span>上次编辑内容已保留，可对比后恢复。</span><div><button onClick={() => setCompare(true)}>对比草稿</button><button disabled={props.recovering} onClick={() => props.onRecovery(true)}>{props.recovering ? '正在保存…' : '恢复草稿'}</button><button disabled={props.recovering} onClick={() => props.onRecovery(false)}>保留已保存版本</button></div></div> : null}
        <input className="en-title" aria-label="笔记标题" placeholder="无标题文档" value={title} readOnly={!!props.recovery} maxLength={1000} onChange={e => { titleRef.current = e.target.value; setTitle(e.target.value); changed() }} />
        <BlockNoteView editor={editor} editable={!props.recovery} theme={props.dark ? 'dark' : 'light'} formattingToolbar={false} sideMenu={false} slashMenu={false}>
          <SuggestionMenuController triggerCharacter="/" suggestionMenuComponent={slashMenu} portalElement={document.body} floatingUIOptions={{useFloatingOptions:{strategy:'fixed'},elementProps:{className:'en-note-menu-layer',style:{zIndex:110}}}} />
          <FormattingToolbarController formattingToolbar={() => <FormattingToolbar><BlockTypeSelect items={[{ name: '正文', type: 'paragraph', icon: () => <span>T</span> }, ...[1, 2, 3, 4].map(level => ({ name: '标题 ' + level, type: 'heading', props: { level }, icon: () => <span>H{level}</span> }))]} /><TextAlignButton textAlignment="left" /><BasicTextStyleButton basicTextStyle="bold" /><BasicTextStyleButton basicTextStyle="italic" /><BasicTextStyleButton basicTextStyle="underline" /><BasicTextStyleButton basicTextStyle="strike" /><CreateLinkButton /><BasicTextStyleButton basicTextStyle="code" /><ColorStyleButton /><AddCommentButton /><button className="en-ai-format" onMouseDown={e => e.preventDefault()} onClick={() => { const range=editor._tiptapEditor.state.selection;const captured={text:editor.getSelectedText(),from:range.from,to:range.to,cursor:editor.getTextCursorPosition().block.id,fingerprint:JSON.stringify(editor.document)};if(!captured.text)return;pinnedSelection.current=captured;setPreview(undefined);setError('');paintSelection(captured);setNativeDraft('改写选中文字，保留原意并让表达更清晰。', true) }}>✧ AI 改写</button></FormattingToolbar>} />
          <SideMenuController sideMenu={BlockMenu} floatingUIOptions={{useFloatingOptions:{middleware:[{name:'ework-first-line',fn:({elements,rects,y}:any)=>{const reference=(elements.reference.contextElement||elements.reference) as HTMLElement,inline=reference.querySelector<HTMLElement>('.bn-inline-content'),content=inline||reference.querySelector<HTMLElement>('.bn-block-content')||reference;const box=content.getBoundingClientRect(),base=reference.getBoundingClientRect(),line=parseFloat(getComputedStyle(content).lineHeight)||28;return{y:y+box.top-base.top+line/2-rects.floating.height/2}}}]}}} />
        </BlockNoteView>
      </div>
    </div>
    {assistantVisible ? createPortal(suggestion,assistantHost) : <div className="en-composer-area">{suggestion}</div>}</main>
    {compare && props.recovery ? <div className="en-dialog-backdrop" onClick={() => setCompare(false)}><section role="dialog" aria-modal="true" aria-label="本地草稿对比" className="en-compare" onClick={e => e.stopPropagation()}><header><strong>本地草稿对比</strong><button onClick={() => setCompare(false)}>关闭</button></header><div><section><h3>已保存版本</h3><pre>{plain(props.initial)}</pre></section><section><h3>本地草稿</h3><pre>{plain(props.recovery)}</pre></section></div><footer><button disabled={props.recovering} onClick={() => props.onRecovery(true)}>{props.recovering ? '正在保存…' : '恢复草稿'}</button><button onClick={() => setCompare(false)}>稍后处理</button></footer></section></div> : null}
  </div></Context.Provider>
}
