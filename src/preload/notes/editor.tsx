import React, { useEffect, useMemo, useRef, useState, createContext, useContext } from 'react'
import { BlockNoteSchema, defaultBlockSpecs, createUserStore } from '@blocknote/core'
import { zh } from '@blocknote/core/locales'
import { CommentsExtension, DefaultThreadStoreAuth } from '@blocknote/core/comments'
import { withCollaboration, YjsThreadStore } from '@blocknote/core/yjs'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote, useBlockNoteEditor, createReactBlockSpec, FormattingToolbar, FormattingToolbarController, BlockTypeSelect, BasicTextStyleButton, ColorStyleButton, CreateLinkButton, AddCommentButton, TextAlignButton, SideMenuController, SideMenu, DragHandleButton } from '@blocknote/react'
import * as Y from 'yjs'
import { noteOutline, noteText, canApplySuggestion, restoreNoteDraft, noteSuggestionPreview, type NoteSuggestionPreview, type NoteContent, type NoteLoad, type NotesBridge, type NoteAiResult } from '../../shared/workspace-notes'
import attachment from '../../../build/notes/attachment.svg?inline'
import permission from '../../../build/notes/permission.svg?inline'
import sendCircle from '../../../build/notes/send-circle.svg?inline'
import slashIcon from '../../../build/notes/slash.svg?inline'
import collapse from '../../../build/notes/toc-collapse.svg?inline'

type Props = { sessionId: string; bridge: NotesBridge; dark: boolean; navigate(view: string): void; nativeControl(kind: string): void }
const Context = createContext<{ bridge: NotesBridge; sessionId: string; dark: boolean; navigate(view: string): void } | null>(null)
const encode = (doc: Y.Doc) => { const bytes = Y.encodeStateAsUpdate(doc); let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s) }
const plain = (content: NoteContent) => content.title + '\n\n' + content.blocks.map(b => noteText(b.content) || (b.type === 'research' ? '[研究组件]' : '')).join('\n\n')

function ResearchBlock({ block }: any) {
  const context = useContext(Context)!, [html, setHtml] = useState(''), [error, setError] = useState('')
  const node = useMemo(() => { try { return JSON.parse(block.props.payload) } catch { return {} } }, [block.props.payload])
  const [height, setHeight] = useState(420), frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    let live = true; setError(''); setHtml('')
    if (!node.containerSpec) { setError(node.generationError || (node.generationStatus === 'running' ? '正在创建组件，已保留正文中的位置…' : node.generationStatus === 'interrupted' ? '创建已停止，可重新描述需求。' : '组件尚未提供内容。')); return }
    context.bridge.request('render', { sessionId: context.sessionId, spec: node.containerSpec }).then((result: any) => { if (live) { setHtml(result.html); if (!result.html) setError('此组件保留在笔记中，可在研究中查看。') } }).catch((e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [block.props.payload, context.bridge, context.sessionId])
  useEffect(() => {
    const receive = (e: MessageEvent) => { if (e.source === frame.current?.contentWindow && e.data?.type === 'ework-note-height' && Number.isFinite(e.data.height)) setHeight(Math.min(2400, Math.max(120, e.data.height))) }
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive)
  }, [])
  const doc = useMemo(() => {
    const foreground = context.dark ? '#e5e5e5' : '#252525', background = context.dark ? '#131316' : '#ffffff'
    const palette = context.dark ? ['#7aaffe', '#ffbd69', '#b29ae3', '#ebd875', '#4bd3a3', '#ff7380', '#79c8e5', '#dfa4c3'] : ['#477ef3', '#b78122', '#8356b7', '#bd8420', '#008368', '#bc3545', '#0076a8', '#a85a81']
    return '<!doctype html><html data-sherlock-theme="' + (context.dark ? 'dark' : 'light') + '"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\';"><style>:root{--sherlock-font-sans:system-ui;--sherlock-text:' + foreground + ';--sherlock-control-text:' + foreground + ';--sherlock-surface:' + background + ';--sherlock-muted:' + (context.dark ? '#9da5b2' : '#7d8490') + ';--sherlock-border:' + (context.dark ? '#303138' : '#e7e8eb') + ';--sherlock-surface-muted:' + (context.dark ? '#24242a' : '#f1f2f4') + ';' + palette.map((color, i) => '--sherlock-chart-' + (i + 1) + ':' + color).join(';') + '}html,body{margin:0;background:' + background + ';color:' + foreground + ';font:14px/1.8 system-ui}body{padding:0!important}svg{max-width:100%}table{max-width:100%}</style>' + html + '<script>new ResizeObserver(()=>parent.postMessage({type:"ework-note-height",height:document.documentElement.scrollHeight},"*")).observe(document.body);<\/script></html>'
  }, [html, context.dark])
  return <section className="en-research" contentEditable={false} data-note-research-block={block.id}>
    {html ? <iframe ref={frame} title={node.title || '研究组件'} sandbox="allow-scripts" srcDoc={doc} style={{ height }} /> : <div className="en-component-empty"><strong>{node.title || '研究组件'}</strong><p>{error || '正在读取组件…'}</p></div>}
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
  const editor: any = useBlockNoteEditor(), block = props.block, [open, setOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!open) return; const dismiss = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setOpen(false) }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }; document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', key); return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', key) } }, [open])
  const change = (type: string, p: any = {}) => { editor.updateBlock(block, { type, props: p }); setOpen(false); editor.focus() }
  const duplicate = () => { const { id, ...copy } = block; editor.insertBlocks([copy], block, 'after'); setOpen(false) }
  return <div className="en-side" ref={menu}><button className="en-block-trigger" title="段落操作" aria-label="段落操作" aria-expanded={open} onMouseDown={e => e.preventDefault()} onClick={() => setOpen(!open)}>T</button><SideMenu {...props}><DragHandleButton {...props} /></SideMenu>
    {open ? <div className="en-block-menu" role="menu"><div className="en-block-types">{[['正文', 'paragraph', 0], ['H1', 'heading', 1], ['H2', 'heading', 2], ['H3', 'heading', 3], ['H4', 'heading', 4]].map(([label, type, level]) => <button role="menuitem" key={label} onClick={() => change(String(type), level ? { level } : {})}>{label}</button>)}</div>
      {([['无序列表', 'bulletListItem'], ['有序列表', 'numberedListItem'], ['待办列表', 'checkListItem'], ['代码块', 'codeBlock'], ['引用', 'quote'], ['分隔线', 'divider']] as const).map(([label, type]) => <button role="menuitem" key={type} onClick={() => change(type)}>{label}</button>)}
      <hr /><div className="en-block-types">{[['左对齐', 'left'], ['居中', 'center'], ['右对齐', 'right']].map(([label, textAlignment]) => <button key={label} onClick={() => change(block.type, { textAlignment })}>{label}</button>)}</div>
      <button onClick={() => { editor.nestBlock(); setOpen(false) }}>增加缩进</button><button onClick={() => { editor.unnestBlock(); setOpen(false) }}>减少缩进</button><hr />
      <button onClick={duplicate}>复制段落</button><button onClick={() => { editor.insertBlocks([{ type: 'paragraph' }], block, 'after'); setOpen(false) }}>在下方添加</button><button className="en-danger" onClick={() => { editor.removeBlocks([block]); setOpen(false) }}>删除段落</button>
    </div> : null}</div>
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
  return <div className="en-shell"><header className="en-tabs"><button onClick={() => props.navigate('new')}>新会话</button>{[['chat', '对话'], ['research', '研究'], ['notes', '笔记'], ['trajectory', '轨迹']].map(([id, label]) => <button key={id} role="tab" aria-selected={id === 'notes'} onClick={() => id !== 'notes' && props.navigate(id!)}>{label}</button>)}</header>
    {loadError ? <div className="en-load-error"><p>{loadError}</p><button onClick={refresh}>重新读取</button></div> : !loaded ? <div className="en-load-error">正在打开笔记…</div> : <NotesEditor key={props.sessionId + ':' + loadVersion} {...props} initial={loaded.saved} recovery={recovery ? loaded.draft : undefined} recovering={recovering} onRecovery={resolveRecovery} onReload={refresh} />}
  </div>
}

function NotesEditor(props: Props & { initial: NoteContent & { revision: number }; recovery?: NoteLoad['draft']; recovering: boolean; onRecovery(restore: boolean): void; onReload(): void }) {
  const [title, setTitle] = useState(props.initial.title), [status, setStatus] = useState(props.recovery ? '发现本地草稿' : '已保存'), [error, setError] = useState(''), [outline, setOutline] = useState<any[]>([]), [toc, setToc] = useState(window.innerWidth > 1200), [active, setActive] = useState(''), [prompt, setPrompt] = useState(''), [generating, setGenerating] = useState(false), [preview, setPreview] = useState<NoteSuggestionPreview>(), [compare, setCompare] = useState(false), [models, setModels] = useState<any>(), [modelOpen, setModelOpen] = useState(false)
  const client = useRef((props.initial as any).clientId || crypto.randomUUID()), revision = useRef(props.initial.revision), titleRef = useRef(title), scroll = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null), saveTimer = useRef<ReturnType<typeof setTimeout>>(), saveQueue = useRef(Promise.resolve()), disposed = useRef(false), request = useRef(''), epoch = useRef(0), selection = useRef({ text: '', from: 0, to: 0, cursor: '' }), lastWritten = useRef(''), latest = useRef<NoteContent>(props.initial)
  titleRef.current = title
  const doc = useMemo(() => { const value = new Y.Doc(); if (props.initial.yjs) Y.applyUpdate(value, Uint8Array.from(atob(props.initial.yjs), c => c.charCodeAt(0))); return value }, [])
  const users = useMemo(() => createUserStore(async ids => ids.map(id => ({ id, username: '我', avatarUrl: '' }))), [])
  const editor: any = useCreateBlockNote(withCollaboration({ schema, dictionary: zh, initialContent: props.initial.blocks.length ? props.initial.blocks as any : undefined, collaboration: { fragment: doc.getXmlFragment('note'), user: { name: '我', color: '#94b2ff' } }, extensions: [CommentsExtension({ threadStore: new YjsThreadStore('local', doc.getMap('threads'), new DefaultThreadStoreAuth('local', 'editor')), resolveUsers: users, confirmBeforeDiscard: false })] } as any))
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
    return () => { disposed.current = true; epoch.current++; clearTimeout(saveTimer.current); off(); offSelection(); doc.getMap('threads').unobserveDeep(commentChanged); window.removeEventListener('keydown', flush); if (request.current) void props.bridge.request('stop', { sessionId: props.sessionId, requestId: request.current }); save() }
  }, [])
  useEffect(() => { let live = true; props.bridge.request('models', { sessionId: props.sessionId }).then(value => live && setModels(value)).catch(() => {}); return () => { live = false } }, [])
  useEffect(() => { const resize = () => { if (window.innerWidth <= 1200) setToc(false) }; window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize) }, [])
  const locate = (id: string) => { const element = scroll.current?.querySelector<HTMLElement>('[data-id="' + CSS.escape(id) + '"]'); if (element) { element.scrollIntoView({ block: 'start', behavior: 'smooth' }); setActive(id) } }
  const track = () => { const top = scroll.current?.getBoundingClientRect().top ?? 0; let current = outline[0]?.id; for (const h of outline) { const el = scroll.current?.querySelector('[data-id="' + CSS.escape(h.id) + '"]'); if (el && el.getBoundingClientRect().top <= top + 140) current = h.id } setActive(current || '') }
  const paste = async (event?: React.ClipboardEvent) => {
    if (props.recovery) return
    if (event) { if (!event.clipboardData.getData('text/html').includes('sherlock-research-clipboard')) return; event.preventDefault() }
    try { const result = await props.bridge.request('clipboard', { sessionId: props.sessionId }); if (result.kind === 'components') { event?.preventDefault(); editor.insertBlocks(result.nodes.map((node: any) => ({ type: 'research', props: { payload: JSON.stringify(node) } })), editor.getTextCursorPosition().block, 'after'); editor.focus() } } catch (e) { setError((e as Error).message) }
  }
  const generatingBlock = useRef('')
  const generate = async () => {
    if (!prompt.trim() || generating || props.recovery) return
    const attempt = ++epoch.current, captured = { ...selection.current }, fingerprint = JSON.stringify(editor.document), requestId = crypto.randomUUID()
    const component = /(?:创建|生成|做|画|添加).*(?:组件|图表|表格|时间线|新闻)/u.test(prompt)
    request.current = requestId; setGenerating(true); setError(''); setPreview(undefined)
    let pending = ''
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document)
      if (component) {
        const reference = captured.cursor ? editor.getBlock(captured.cursor) : editor.getTextCursorPosition().block
        const created = editor.insertBlocks([{ type: 'research', props: { payload: JSON.stringify({ id: requestId, title: '正在创建研究组件', kind: 'generated-container', generationStatus: 'running', generationDetail: prompt, sourceText: '未绑定数据源 · 未刷新' }) } }], reference || editor.getTextCursorPosition().block, 'after')
        pending = created[0].id; generatingBlock.current = pending
        requestAnimationFrame(() => locate(pending))
      }
      const result: NoteAiResult = await props.bridge.request('generate', { sessionId: props.sessionId, requestId, title, markdown, selection: captured.text, prompt, mode: component ? 'component' : 'write' })
      if (disposed.current || epoch.current !== attempt) return
      if (component && result.kind === 'component' && editor.getBlock(pending)) {
        editor.updateBlock(pending, { props: { payload: JSON.stringify(result.node) } }); setPrompt(''); changed(); requestAnimationFrame(() => locate(pending))
      } else {
        if (pending && editor.getBlock(pending)) editor.removeBlocks([pending])
        setPreview(noteSuggestionPreview(result, { ...captured, fingerprint, cursor: captured.cursor || editor.getTextCursorPosition().block.id }))
      }
    } catch (e) {
      if (!disposed.current && epoch.current === attempt) {
        const message = (e as Error).name === 'AbortError' ? '生成已停止，可调整需求后重试。' : (e as Error).message
        if (pending && editor.getBlock(pending)) editor.updateBlock(pending, { props: { payload: JSON.stringify({ id: requestId, title: '研究组件', kind: 'generated-container', generationStatus: 'failed', generationError: message, sourceText: '未绑定数据源 · 未刷新' }) } })
        setError(message)
      }
    } finally { if (!disposed.current && epoch.current === attempt) { setGenerating(false); request.current = ''; generatingBlock.current = '' } }
  }
  const stop = () => { epoch.current++; const id = request.current; request.current = ''; setGenerating(false); if (id) void props.bridge.request('stop', { sessionId: props.sessionId, requestId: id }); if (generatingBlock.current && editor.getBlock(generatingBlock.current)) editor.updateBlock(generatingBlock.current, { props: { payload: JSON.stringify({ title: '研究组件', kind: 'generated-container', generationStatus: 'interrupted', sourceText: '未绑定数据源 · 未刷新' }) } }); generatingBlock.current = ''; setError('生成已停止，笔记内容已保留。') }
  const apply = async (replace: boolean) => {
    if (!preview) return
    if (replace && !canApplySuggestion({ documentId: props.sessionId, fingerprint: preview.fingerprint }, { documentId: props.sessionId, fingerprint: JSON.stringify(editor.document) })) { setError('正文已变化，请重新生成后再替换选区。你仍可将建议插入到下方。'); return }
    editor.focus()
    const blocks = preview.result.kind === 'component' ? [{ type: 'research', props: { payload: JSON.stringify(preview.result.node) } }] : editor.tryParseMarkdownToBlocks(preview.result.markdown)
    if (replace && preview.selectedText && preview.result.kind === 'text') { const html = await editor.blocksToHTMLLossy(blocks); if (JSON.stringify(editor.document) !== preview.fingerprint) { setError('正文已变化，请重新生成后再替换选区。'); return }; const state = editor._tiptapEditor.state; state.plugins.find((p: any) => p.key.startsWith('y-undo'))?.getState(state)?.undoManager?.stopCapturing(); editor._tiptapEditor.commands.setTextSelection({ from: preview.from, to: preview.to }); editor._tiptapEditor.commands.insertContent(html) }
    else { const reference = editor.getBlock(preview.cursor) || editor.getTextCursorPosition().block; editor.insertBlocks(blocks, reference, 'after') }
    setPreview(undefined); setPrompt(''); changed()
  }
  const exportNote = async () => { try { const markdown = '# ' + (title || '无标题文档') + '\n\n' + await editor.blocksToMarkdownLossy(editor.document); const blob = new Blob([markdown], { type: 'text/markdown' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = (title || '无标题文档').replace(/[\\/:*?"<>|]/g, '_') + '.md'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) } catch (e) { setError((e as Error).message) } }
  const ctx = useMemo(() => ({ bridge: props.bridge, sessionId: props.sessionId, dark: props.dark, navigate: props.navigate }), [props.bridge, props.sessionId, props.dark, props.navigate])
  return <Context.Provider value={ctx}><div className="en-body" data-toc-open={toc}>
    <aside className="en-toc"><div className="en-toc-heading"><span>目录</span><button aria-label={toc ? '收起目录' : '展开目录'} title={toc ? '收起目录' : '展开目录'} onClick={() => setToc(!toc)}><img src={collapse} width="16" height="16" /></button></div>{toc ? <nav aria-label="文档目录"><button className="en-toc-title" onClick={() => scroll.current?.scrollTo({ top: 0, behavior: 'smooth' })}>{title || '无标题文档'}</button>{outline.length ? outline.map(h => <button key={h.id} data-active={h.id === active} style={{ paddingLeft: 8 + (h.level - 1) * 16 }} title={h.text} onClick={() => locate(h.id)}>{h.text}</button>) : <p className="en-toc-empty">添加标题后显示目录</p>}</nav> : null}</aside>
    <main className="en-main"><div className="en-document-scroll" ref={scroll} onScroll={track} onPasteCapture={paste}>
      <div className="en-document"><div className="en-document-actions"><span role="status" aria-live="polite">{status}</span><button title="保存笔记" aria-label="保存笔记" onClick={save}>保存</button><button title="导出 Markdown" aria-label="导出 Markdown" onClick={exportNote}>导出</button></div>
        {props.recovery ? <div className="en-recovery"><strong>发现未保存的本地草稿</strong><span>上次编辑内容已保留，可对比后恢复。</span><div><button onClick={() => setCompare(true)}>对比草稿</button><button disabled={props.recovering} onClick={() => props.onRecovery(true)}>{props.recovering ? '正在保存…' : '恢复草稿'}</button><button disabled={props.recovering} onClick={() => props.onRecovery(false)}>保留已保存版本</button></div></div> : null}
        <input className="en-title" aria-label="笔记标题" placeholder="无标题文档" value={title} readOnly={!!props.recovery} maxLength={1000} onChange={e => { titleRef.current = e.target.value; setTitle(e.target.value); changed() }} />
        <BlockNoteView editor={editor} editable={!props.recovery} theme={props.dark ? 'dark' : 'light'} formattingToolbar={false} sideMenu={false}>
          <FormattingToolbarController formattingToolbar={() => <FormattingToolbar><BlockTypeSelect items={[{ name: '正文', type: 'paragraph', icon: () => <span>T</span> }, ...[1, 2, 3, 4].map(level => ({ name: '标题 ' + level, type: 'heading', props: { level }, icon: () => <span>H{level}</span> }))]} /><TextAlignButton textAlignment="left" /><BasicTextStyleButton basicTextStyle="bold" /><BasicTextStyleButton basicTextStyle="italic" /><BasicTextStyleButton basicTextStyle="underline" /><BasicTextStyleButton basicTextStyle="strike" /><CreateLinkButton /><BasicTextStyleButton basicTextStyle="code" /><ColorStyleButton /><AddCommentButton /><button className="en-ai-format" onMouseDown={e => e.preventDefault()} onClick={() => { setPrompt('改写选中文字，保留原意并让表达更清晰。'); input.current?.focus() }}>✧ AI 改写</button></FormattingToolbar>} />
          <SideMenuController sideMenu={BlockMenu} />
        </BlockNoteView>
      </div>
    </div>
    <div className="en-composer-area">{error ? <div className="en-error" role="alert"><span>{error}</span>{status === '保存冲突' ? <button onClick={async () => { try { await props.bridge.draft({ sessionId: props.sessionId, clientId: client.current, revision: revision.current, content: snapshot() }); props.onReload() } catch (e) { setError((e as Error).message) } }}>重新读取并对比</button> : null}<button onClick={() => setError('')} aria-label="关闭提示">×</button></div> : null}
      {preview ? <section className="en-preview" aria-label="AI 修改预览"><header><strong>{preview.result.kind === 'component' ? '创建的研究组件' : '修改预览'}</strong><button aria-label="放弃建议" onClick={() => setPreview(undefined)}>×</button></header><div className="en-preview-content">{preview.result.kind === 'text' ? <MarkdownPreview markdown={preview.result.markdown} dark={props.dark} /> : <ResearchBlock block={{ id: 'preview', props: { payload: JSON.stringify(preview.result.node) } }} />}</div><footer>{preview.selectedText && preview.result.kind === 'text' ? <button onClick={() => apply(true)}>替换所选</button> : null}<button onClick={() => apply(false)}>{preview.result.kind === 'component' ? '写入正文' : '插入到下方'}</button><button onClick={() => { setPreview(undefined); input.current?.focus() }}>继续调整</button><button onClick={() => setPreview(undefined)}>放弃</button></footer></section> : null}
      <div className="en-composer"><textarea ref={input} aria-label="笔记补充与组件创建" placeholder="补充、改写笔记，或描述要创建的组件…" value={prompt} maxLength={8000} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void generate() } }} /><div className="en-composer-controls"><button className="en-chip" aria-label="笔记插入命令" onClick={() => { editor.focus(); editor.openSuggestionMenu('/') }}><img src={slashIcon} width={4.11523} height={20} /></button><button className="en-chip" aria-label="粘贴研究组件" title="粘贴已复制的研究组件" onClick={() => paste()}><img src={attachment} width="16" height="16" /></button><button className="en-permission" onClick={() => props.nativeControl('permission')}><img src={permission} width="16" height="16" />当前会话权限⌄</button><span className="en-control-spacer" /><div className="en-model"><button onClick={() => setModelOpen(!modelOpen)}>{models?.current?.model || '选择模型'}⌄</button>{modelOpen ? <div className="en-model-menu">{(models?.groups || []).flatMap((g: any) => (g.models || []).map((m: any) => <button key={g.id + ':' + m.id} onClick={async () => { try { await props.bridge.request('model', { sessionId: props.sessionId, provider: g.id, model: m.id }); setModels(await props.bridge.request('models', { sessionId: props.sessionId })); setModelOpen(false) } catch (e) { setError((e as Error).message) } }}>{m.name || m.label || m.id}</button>))}</div> : null}</div><button className="en-send" aria-label={generating ? '停止生成' : '生成笔记建议'} disabled={!generating && !prompt.trim()} onClick={() => generating ? stop() : void generate()}>{generating ? <span className="en-stop" /> : <><img src={sendCircle} width="30" height="30" /></>}</button></div></div>
    </div></main>
    {compare && props.recovery ? <div className="en-dialog-backdrop" onClick={() => setCompare(false)}><section role="dialog" aria-modal="true" aria-label="本地草稿对比" className="en-compare" onClick={e => e.stopPropagation()}><header><strong>本地草稿对比</strong><button onClick={() => setCompare(false)}>关闭</button></header><div><section><h3>已保存版本</h3><pre>{plain(props.initial)}</pre></section><section><h3>本地草稿</h3><pre>{plain(props.recovery)}</pre></section></div><footer><button disabled={props.recovering} onClick={() => props.onRecovery(true)}>{props.recovering ? '正在保存…' : '恢复草稿'}</button><button onClick={() => setCompare(false)}>稍后处理</button></footer></section></div> : null}
  </div></Context.Provider>
}
