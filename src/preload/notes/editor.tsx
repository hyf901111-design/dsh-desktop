import {createNoteInlineProposals,NoteInlineProposalHighlights,type NoteInlineProposal} from './inline-ai-proposals'
import {createNoteHtmlInteraction} from './html-interaction'
import {noteGenerationError} from '../../shared/workspace-notes'
import { noteUiText as t } from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import {capabilityReceiptText} from '../../../packages/dsh-research-task-runtime/client-capability-receipts.js'
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { BlockNoteSchema, defaultBlockSpecs, createUserStore } from '@blocknote/core'
import { en, zh } from '@blocknote/core/locales'
import {useNoteUiLocale,notePlaceholderCss} from './locale'
import { SideMenuExtension, filterSuggestionItems } from '@blocknote/core/extensions'
import { CommentsExtension, DefaultThreadStoreAuth } from '@blocknote/core/comments'
import { withCollaboration, YjsThreadStore } from '@blocknote/core/yjs'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote, useBlockNoteEditor, createReactBlockSpec, FormattingToolbar, FormattingToolbarController, BlockTypeSelect, BasicTextStyleButton, ColorStyleButton, CreateLinkButton, AddCommentButton, TextAlignButton, SideMenuController, SideMenu, DragHandleButton, useComponentsContext, useExtensionState, useEditorState, getDefaultReactSlashMenuItems, SuggestionMenuController, FloatingComposerController } from '@blocknote/react'
import * as Y from 'yjs'
import { noteOutline, noteText, restoreNoteDraft, noteSuggestionPreview, noteComponentRequest, type NoteSuggestionPreview, type NoteContent, type NoteLoad, type NotesBridge, type NoteAiResult, type NoteInsertionAnchor } from '../../shared/workspace-notes'
import { NotesOutline } from './outline'
import { NoteAiSelection } from './selection'
import { replaceNoteSelection, noteRangeHasOnlyText } from './replace-selection'
import { SuggestionPanel } from './suggestion-panel'
import { NoteMenuIcon } from './menu-icon'
import { NativeComponentBlock, NoteGenerationBlock } from './native-component-block'
import {NoteCreationBlock} from './creation-block'
import {useNoteComponentSize,NoteComponentResizeHandles} from './component-size'
import {useNoteComponentInteraction} from './component-interaction'
import { NativeSlashMenu } from './native-slash-menu'
import { noteFileCandidates, NOTE_FILE_DRAG_TYPE, type NoteFileNode } from '../../shared/note-files'
import { recordSidebarSessionUse } from '../../../scripts/lib/sidebar-session-recency.mjs'
import {useNoteDragAndDrop} from './drag-and-drop'
import {useNoteReplyInsertion} from './reply-insertion'
import {withNoteIndentSpecs,changeNoteIndent} from './paragraph-indent'
import {changeNoteAlignment,selectedNoteParagraphIds} from './block-alignment'
import {changeNoteList,type NoteListType} from './paragraph-style'
import {useNoteReferenceContext,type NoteReferenceContext} from './reference-context'
import {noteMessageReferences} from '../../../packages/dsh-research-task-runtime/notes-message-references.js'
import {exportNoteWithSnapshots} from './component-snapshots'
import {createNoteCapabilityActions,noteCapabilityFingerprint,noteResearchBlocks} from './client-capability-actions'
import {useNotePresentation} from './component-presentation'
import {NotePresentationControls} from './component-presentation-controls'
import {createNoteComponentDataActions} from './component-data-actions'
import {createNoteDataCapability} from './data-capability'
import {createNoteDataRefreshGuard} from './data-refresh-guard'
import {createExternalNoteCapabilityLease} from './external-capability-lease'
import {InlineNoteFileBlock,noteFilePresentation} from './file-inline'
import {useInlineComponentGeneration} from './use-inline-component-generation'
import {useNoteChallenge,CHALLENGE_USER} from './challenge-controller'
import {challengeDocumentBlocks} from './challenge-scheduler'
import {restoreChallengeReviewState} from './challenge-review-state'
import {noteEditorVisible} from './editor-visibility'
import {beginNoteGuideSelection,type NoteGuideSelection} from './guide-selection'
import {ChallengeToolbar,ChallengeComments,ManualNoteThreads} from './challenge-ui'
import {NoteReplacementPopover,NoteReplacementHighlights} from './replacement-review'
import {noteInlineAiTrigger,captureNoteInlineAnchor,noteInlineAnchorBlock,noteInlineBlockIdentity,insertNoteInlineBlocks} from './inline-ai'
import {NoteInlineAiComposer,NoteAiProcessing,type NoteInlineAiDraft} from './inline-ai-composer'
import {noteEditFingerprint,noteEditTimestamp,noteHasSavedContent,noteEditDate} from './edit-date'

/** A local guide receives only document operations for its own isolated NotesApp. */
export type NotesGuideEditorApi = {
  snapshot(): NoteContent
  flush(): Promise<void>
  reviewReady(): Promise<boolean>
  setDocument(title:string,blocks:any[]):void
  appendBlock(block:any):void
  updateText(blockId:string,text:string):void
  prepareNative():()=>boolean
  typeSlash():void
  selectParagraph(blockId:string,expectedText:string):void
  beginParagraphSelection(blockId:string,expectedText:string):NoteGuideSelection
}
export type NotesGuideBinding = {native?:{runId:string};ready(api:NotesGuideEditorApi):void;dispose?(api:NotesGuideEditorApi):void}
export type NotesSaveBinding = {ready(flush:()=>Promise<void>):void;dispose?(flush:()=>Promise<void>):void}
type Props = { sessionId: string; bridge: NotesBridge; dark: boolean; active?:boolean; activityId?:string; navigate(view: string): void;guide?:NotesGuideBinding;saveBinding?:NotesSaveBinding }
type ComposerAdmission = {draft:string;draftRev:number;imageIds:string[];submissionId?:number;occurrences?:unknown[]}
const Context = createContext<{ bridge: NotesBridge; sessionId: string; dark: boolean; navigate(view: string): void; editor?: any; importing?:Set<string> } | null>(null)
const encode = (doc: Y.Doc) => { const bytes = Y.encodeStateAsUpdate(doc); let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s) }
const plain = (content: NoteContent) => content.title + '\n\n' + content.blocks.map(b => noteText(b.content) || (b.type === 'research' ? t('研究组件') : '')).join('\n\n')
function createNoteDocument(content:NoteContent&{updatedAt?:number}){
  const doc=new Y.Doc();if(content.yjs)Y.applyUpdate(doc,Uint8Array.from(atob(content.yjs),c=>c.charCodeAt(0)))
  const metadata=doc.getMap('note-metadata'),legacyDate=noteHasSavedContent(content)?noteEditTimestamp(content.updatedAt):undefined
  const seeded=!noteEditTimestamp(metadata.get('editedAt'))&&!!legacyDate
  // Seed a known legacy date before the save baseline, without dirtying an opened note.
  if(seeded)metadata.set('editedAt',legacyDate!)
  return{doc,seeded}
}
class NoteThreadStoreAuth extends DefaultThreadStoreAuth {
  override canAddReaction(): boolean { return false }
}

function AiRewriteButton({onRewrite}:{onRewrite():void}){
 const editor:any=useBlockNoteEditor(),valid=useEditorState({editor,selector:({editor}:any)=>editor.isEditable&&noteRangeHasOnlyText(editor._tiptapEditor.state.doc,editor._tiptapEditor.state.selection)})
 return valid?<button className="en-ai-format" aria-label={t("AI 改写")} onMouseDown={e=>e.preventDefault()} onClick={onRewrite}><NoteMenuIcon kind="sparkles"/><span>{t("AI 改写")}</span></button>:null
}
function NoteFormattingToolbar({children}:{children:React.ReactNode}){
 const editor:any=useBlockNoteEditor(),componentSelected=useEditorState({editor,selector:({editor}:any)=>{
  const {doc,selection}=editor._tiptapEditor.state
  if(selection.empty)return false
  let selected=false
  doc.nodesBetween(selection.from,selection.to,(node:any)=>{
   if(node.type.name==='research'||node.type.name==='attachment'){selected=true;return false}
   return !selected
  })
  return selected
 }})
 return componentSelected?null:<FormattingToolbar>{children}</FormattingToolbar>
}
function NoteListButtons(){
 const Components=useComponentsContext()!
 const editor:any=useBlockNoteEditor(),selection=useEditorState({editor,selector:({editor}:any)=>({valid:editor.isEditable&&noteRangeHasOnlyText(editor._tiptapEditor.state.doc,editor._tiptapEditor.state.selection),blocks:editor.getSelection()?.blocks||[]})})
 if(!selection.valid)return null
 return <>{([[t("无序列表"),'bulletListItem'],[t("有序列表"),'numberedListItem'],[t("待办列表"),'checkListItem']] as const).map(([label,type])=><Components.FormattingToolbar.Button key={type} className="bn-button" label={label} mainTooltip={label} isSelected={selection.blocks.length>0&&selection.blocks.every((block:any)=>block.type===type)} onClick={()=>changeNoteList(editor,type)} icon={<NoteMenuIcon kind={type}/>}/>)}</>
}
function ResearchBlock({block}:any){
 const context=useContext(Context)!,node=useMemo(()=>{try{return JSON.parse(block.props.payload)}catch{return {}}},[block.props.payload])
 return (context as any).isGeneratingComponent?.(block.id)&&node.generationTaskId&&['queued','running','retrying'].includes(node.generationStatus)?<NoteGenerationBlock block={block} node={node} context={context}/>:node.noteDraft?<NoteCreationBlock block={block} node={node} context={context}/>:node.noteLibrary||node.noteDataBound?<NativeComponentBlock block={block} node={node} context={context}/>:<ResearchSnapshotBlock block={block}/>
}
function ResearchSnapshotBlock({ block }: any) {
  const interaction=useNoteComponentInteraction()
  const context = useContext(Context)!, [html, setHtml] = useState(''), [error, setError] = useState('')
  const node = useMemo(() => { try { return JSON.parse(block.props.payload) } catch { return {} } }, [block.props.payload])
  useNotePresentation(interaction.root,node,context.dark)
  const [height, setHeight] = useState(Number.isFinite(node.height)?Math.max(120,node.height-80):320), frame = useRef<HTMLIFrameElement>(null), intrinsic=useRef(false)
  const size=useNoteComponentSize({block,node,editor:context.editor,root:interaction.root,naturalHeight:height}),renderKey=JSON.stringify(node.containerSpec)
  useEffect(() => {
    let live = true; setError(''); setHtml('');intrinsic.current=false
    if (!node.containerSpec) { setError(node.generationError || (node.generationStatus === 'running' ? t("正在创建组件，已保留正文中的位置…") : node.generationStatus === 'interrupted' ? t("创建已停止，可重新描述需求。") : t("组件尚未提供内容。"))); return }
    context.bridge.request('render', { sessionId: context.sessionId, spec: node.containerSpec, dark:context.dark }).then((result: any) => { if (live) { setHtml(result.document || result.html); if (!result.html) setError(t("此组件保留在笔记中，可在研究中查看。")) } }).catch((e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [renderKey,node.generationError,node.generationStatus, context.bridge, context.sessionId])
  useEffect(() => {
    const receive = (e: MessageEvent) => { if (e.source !== frame.current?.contentWindow || !Number.isFinite(e.data?.height))return;if(e.data.type==='sherlock-workbench-content-size')intrinsic.current=true;else if(intrinsic.current||!['ework-note-height','sherlock-content-size'].includes(e.data.type))return;setHeight(Math.min(2400,Math.max(120,e.data.height))) }
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive)
  }, [])
  useEffect(()=>{frame.current?.contentWindow?.postMessage({type:'sherlock-theme',colorScheme:context.dark?'dark':'light'},'*')},[context.dark,html])
  const doc=html

  return <section className="en-research" ref={interaction.root as React.RefObject<HTMLElement>} style={size.style} contentEditable={false} data-note-research-block={block.id} data-selected={interaction.selected||undefined} data-resizing={size.resizing||undefined}>
    <header className="en-research-header" draggable={!!context.editor?.isEditable}><strong>{node.title||t("研究组件")}</strong>{context.editor?.getBlock(block.id)?<button className="en-component-close" aria-label={t("移除笔记中的组件")} title={t("移除组件")} onClick={()=>context.editor.removeBlocks([block.id])}><NoteMenuIcon kind="close"/></button>:null}</header>
    {html?<div className="en-research-view"><iframe ref={frame} title={node.title||t("研究组件")} sandbox="allow-scripts" srcDoc={doc} onLoad={()=>frame.current?.contentWindow?.postMessage({type:'sherlock-theme',colorScheme:context.dark?'dark':'light'},'*')} style={{height:size.height}}/>{!interaction.selected?<button className="en-component-scroll-guard" aria-label={t("选中组件并操作内容")} onClick={interaction.select}/>:null}</div>:<div className="en-component-empty"><strong>{node.title||t("研究组件")}</strong><p>{t(error)||t("正在读取组件…")}</p></div>}
    {error&&html?<div className="en-component-error" role="alert">{error}</div>:null}
    {interaction.selected&&context.editor?.isEditable?<><NotePresentationControls editor={context.editor} block={block} node={node}/><NoteComponentResizeHandles size={size}/></>:null}
  </section>
}
const componentAlignment={default:'left',values:['left','center','right'] as const}
const researchSpec = createReactBlockSpec({ type: 'research', propSchema: { payload: { default: '' },textAlignment:componentAlignment }, content: 'none' }, { render: ResearchBlock, toExternalHTML: ({ block }: any) => <div data-ework-note-research={block.props.payload} data-text-alignment={block.props.textAlignment}>{t("研究组件")}</div>, parse: (element: HTMLElement) => element.hasAttribute('data-ework-note-research') ? { payload: element.getAttribute('data-ework-note-research')!,textAlignment:element.getAttribute('data-text-alignment') as any||'left' } : undefined })()
function FileBlock({block}:any){
  const context=useContext(Context)!,node=useMemo(()=>{try{const value=JSON.parse(block.props.payload) as NoteFileNode;return value.importStatus==='importing'&&!context.importing?.has(value.id)?{...value,importStatus:'failed' as const,error:t("上次文件导入已中断，请重新插入文件。")}:value}catch{return {id:block.id,name:t("文件"),importStatus:'failed',error:t("文件记录暂不可用。")} as NoteFileNode}},[block.props.payload])
  const presentation=noteFilePresentation(node)
  return presentation==='media'||presentation==='file'||node.importStatus&&node.noteDisplay==='inline'&&presentation!=='component'?<InlineNoteFileBlock block={block} node={node} context={context}/>:<ComponentFileBlock block={block} inline={presentation==='document'}/>
}
function ComponentFileBlock({block,inline:requestedInline=false}:any){
  const interaction=useNoteComponentInteraction()
  const context=useContext(Context)!,host=useRef<HTMLDivElement>(null),instance=useRef(crypto.randomUUID()),[height,setHeight]=useState(520),[bound,setBound]=useState<string>(),[fileError,setFileError]=useState('')
  const node=useMemo(()=>{try{const value=JSON.parse(block.props.payload) as NoteFileNode;return value.importStatus==='importing'&&!context.importing?.has(value.id)?{...value,importStatus:'failed' as const,error:t("上次文件导入已中断，请重新拖入文件。")}:value}catch{return {id:block.id,name:t("文件"),importStatus:'failed',error:t("文件记录暂不可用。")} as NoteFileNode}},[block.props.payload])
  const inline=requestedInline&&!/\.pptx$/i.test(node.name)
  const size=useNoteComponentSize({block,node,editor:context.editor,root:interaction.root,naturalHeight:height})
  const remove=()=>{if(!context.editor?.isEditable)return;if(node.importStatus)void context.bridge.request('file-revoke',{sessionId:context.sessionId,nodeId:node.id}).catch(()=>{});context.editor.removeBlocks([block.id])}
  useEffect(()=>{let live=true;setBound(undefined);setFileError('');if(!node.importStatus)void context.bridge.request('file-bind',{sessionId:context.sessionId,nodeId:node.id,authorizationId:node.authorizationId}).then(value=>{if(live)setBound(value.previewSessionId)}).catch(e=>{if(live)setFileError(e.message)});return()=>{live=false}},[context.sessionId,node.id,node.authorizationId,node.importStatus])
  useEffect(()=>{
    const publish=()=>{if(host.current&&!node.importStatus&&bound)document.dispatchEvent(new CustomEvent('sherlock:notes-file-view',{detail:{instanceId:instance.current,hostId:host.current.id,sessionId:context.sessionId,headerId:'en-file-header-'+instance.current,dark:context.dark,readOnly:!context.editor?.isEditable,inline,node:{...node,height:size.height,previewSessionId:bound}}}))}
    const action=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.instanceId!==instance.current||value.sessionId!==context.sessionId)return
      if(value.action==='remove')remove()
      else if(value.action==='rename'&&context.editor?.isEditable&&typeof value.name==='string'&&value.name.trim().length<=512)context.editor.updateBlock(block.id,{props:{payload:JSON.stringify({...node,displayName:value.name.trim()||node.name})}})
      else if(value.action==='reveal')void context.bridge.request('file-reveal',{sessionId:context.sessionId,nodeId:node.id,authorizationId:node.authorizationId}).catch(e=>setFileError(e.message))
      else if(value.action==='reference'){interaction.select();document.dispatchEvent(new CustomEvent('sherlock:notes-composer-draft',{detail:{sessionId:context.sessionId,focus:true}}))}
      else if(value.action==='size'&&Number.isFinite(value.height))setHeight(old=>{const next=Math.min(800,Math.max(180,Math.round(value.height)));return Math.abs(next-old)>2?next:old})
    }
    publish();document.addEventListener('sherlock:notes-files-sync-request',publish);document.addEventListener('sherlock:notes-file-action',action)
    return()=>{document.removeEventListener('sherlock:notes-files-sync-request',publish);document.removeEventListener('sherlock:notes-file-action',action)}
  },[node,size.height,context.sessionId,context.dark,bound,inline])
  useEffect(()=>()=>{document.dispatchEvent(new CustomEvent('sherlock:notes-file-view',{detail:{instanceId:instance.current,remove:true}}))},[])
  if(node.importStatus)return <section className="en-research en-note-file en-file-import" contentEditable={false}><header className="en-research-header"><strong>{node.name}</strong>{context.editor?.isEditable?<button aria-label={t("移除笔记中的文件")} onClick={remove}>×</button>:null}</header><div className="en-component-empty" role={node.importStatus==='failed'?'alert':'status'}>{t(node.error||'')||t("正在导入文件…")}</div></section>
  return <section className={'en-research en-note-file'+(inline?' en-inline-file en-inline-document':'')} ref={interaction.root as React.RefObject<HTMLElement>} style={size.style} contentEditable={false} data-note-research-block={block.id} data-note-session={context.sessionId} data-research-node-id={node.id} data-selected={interaction.selected||undefined} data-resizing={size.resizing||undefined}>
    <div id={'en-file-header-'+instance.current} className="en-file-header" draggable={!!context.editor?.isEditable}><header className={inline?'en-inline-document-caption en-file-header-fallback':'en-research-header en-file-header-fallback'}><strong>{node.displayName||node.name}</strong></header></div>
    <div ref={host} id={'en-file-'+instance.current} className="en-file-host" data-note-file={node.id} data-note-session={context.sessionId} style={{height:inline&&fileError?'auto':size.height}}><div className="en-file-fallback" role={fileError?'alert':'status'}>{t(fileError)||t("正在读取文件预览…")}</div>{!inline&&!interaction.selected?<button className="en-component-scroll-guard" aria-label={t("选中文件并操作预览")} onClick={interaction.select}/>:null}</div>
    {fileError?<div className="en-component-error" role="alert">{fileError}</div>:null}
    {interaction.selected&&context.editor?.isEditable?<NoteComponentResizeHandles size={size}/>:null}
  </section>
}
const fileSpec=createReactBlockSpec({type:'attachment',propSchema:{payload:{default:''},textAlignment:componentAlignment},content:'none'},{render:FileBlock,toExternalHTML:({block}:any)=><div data-ework-note-file={block.props.payload} data-text-alignment={block.props.textAlignment}>{t("文件")}</div>,parse:(element:HTMLElement)=>element.hasAttribute('data-ework-note-file')?{payload:element.getAttribute('data-ework-note-file')!,textAlignment:element.getAttribute('data-text-alignment') as any||'left'}:undefined})()
const schema = BlockNoteSchema.create({ blockSpecs: { ...withNoteIndentSpecs(defaultBlockSpecs), research: researchSpec,attachment:fileSpec } })
function MarkdownPreview({ markdown, dark }: { markdown: string; dark: boolean }) {
  const editor = useCreateBlockNote({ dictionary: {...(document.documentElement.dataset.odysseyLocale==='en'?en:zh)} })
  useEffect(() => { editor.replaceBlocks(editor.document, editor.tryParseMarkdownToBlocks(markdown)) }, [editor, markdown])
  return <BlockNoteView key={document.documentElement.dataset.odysseyLocale} editor={editor} theme={dark ? 'dark' : 'light'} editable={false} formattingToolbar={false} sideMenu={false} slashMenu={false} />
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
  useEffect(()=>{if(!open)return;const extension=editor.getExtension(SideMenuExtension);extension?.freezeMenu();return()=>{if(editor._tiptapEditor.view?.state)extension?.unfreezeMenu()}},[editor,open])
  if (!block) return null
  const change = (type: string, p: any = {}) => { if(['bulletListItem','numberedListItem','checkListItem'].includes(type)&&Object.keys(p).length===0)changeNoteList(editor,type as NoteListType,block.id);else editor.updateBlock(block, { type, props: p }); setOpen(false); editor.focus() }
  const duplicate = () => { const { id, ...copy } = block; editor.insertBlocks([copy], block, 'after'); setOpen(false) }
  return <div className="en-side" ref={anchor}><button className="en-block-trigger" title={t("段落操作")} aria-label={t("段落操作")} aria-expanded={open} onMouseDown={e => e.preventDefault()} onClick={() => setOpen(!open)}><NoteMenuIcon kind="paragraph"/></button><SideMenu {...props}><DragHandleButton {...props} /></SideMenu>
    {open ? createPortal(<div ref={menu} className="en-block-menu" role="menu" style={{...position,visibility:position?'visible':'hidden'}}><div className="en-block-types">{[[t("正文"), 'paragraph', 0], ['H1', 'heading', 1], ['H2', 'heading', 2], ['H3', 'heading', 3], ['H4', 'heading', 4]].map(([label, type, level]) => <button role="menuitem" key={label} title={String(label)} aria-label={String(label)} onClick={() => change(String(type), level ? { level } : {})}>{type==='paragraph'?<NoteMenuIcon kind="paragraph"/>:label}</button>)}</div>
      <div className="en-block-formats">{([[t("无序列表"), 'bulletListItem'], [t("有序列表"), 'numberedListItem'], [t("待办列表"), 'checkListItem'], [t("代码块"), 'codeBlock'], [t("引用"), 'quote'], [t("分隔线"), 'divider']] as const).map(([label, type]) => <button role="menuitem" key={type} title={label} aria-label={label} onClick={() => change(type)}><NoteMenuIcon kind={type}/></button>)}</div>
      <hr /><div className="en-block-types en-block-align">{[[t("左对齐"), 'left'], [t("居中"), 'center'], [t("右对齐"), 'right']].map(([label, textAlignment]) => <button key={label} onClick={() => {changeNoteAlignment(editor,[block.id],textAlignment as 'left'|'center'|'right');setOpen(false);editor.focus()}}><NoteMenuIcon kind={String(textAlignment)}/>{label}</button>)}</div>
      <button onClick={() => { changeNoteIndent(editor,block.id,1); setOpen(false) }}><NoteMenuIcon kind="indent"/>{t("增加缩进")}</button><button onClick={() => { changeNoteIndent(editor,block.id,-1); setOpen(false) }}><NoteMenuIcon kind="outdent"/>{t("减少缩进")}</button><hr />
      <button onClick={duplicate}><NoteMenuIcon kind="copy"/>{t("复制段落")}</button><button onClick={() => { editor.insertBlocks([{ type: 'paragraph' }], block, 'after'); setOpen(false) }}><NoteMenuIcon kind="add"/>{t("在下方添加")}</button><button className="en-danger" onClick={() => { editor.removeBlocks([block]); setOpen(false) }}><NoteMenuIcon kind="delete"/>{t("删除段落")}</button>
    </div>,document.body) : null}</div>
}

export function NotesApp(props: Props) {
  useNoteUiLocale()
  const [loaded, setLoaded] = useState<NoteLoad>(), [loadError, setLoadError] = useState(''), [recovery, setRecovery] = useState(false), [loadVersion, setLoadVersion] = useState(0), [recovering, setRecovering] = useState(false)
  const refresh = () => { setLoadError(''); props.bridge.request('load', { sessionId: props.sessionId }).then((value: NoteLoad) => { setLoaded(value); setRecovery(!!value.draft); setLoadVersion(v => v + 1) }).catch((e: Error) => setLoadError(e.message)) }
  const resolveRecovery = async (restore: boolean) => {
    if (!loaded?.draft || recovering) return
    setRecovering(true)
    try {
      if (restore) {
        const {doc,seeded}=createNoteDocument(loaded.draft)
        try{
          const draft=seeded?{...loaded.draft,yjs:encode(doc)}:loaded.draft
          // Keep the migrated recovery record equivalent to the restored save, so it is cleared normally.
          if(seeded)await props.bridge.draft({sessionId:props.sessionId,clientId:draft.clientId,revision:draft.baseRevision,content:{title:draft.title,blocks:draft.blocks,yjs:draft.yjs}})
          setLoaded(await restoreNoteDraft(props.bridge,props.sessionId,{...loaded,draft}))
        }finally{doc.destroy()}
      }
      else { await props.bridge.request('discard', { sessionId: props.sessionId, clientId: loaded.draft.clientId }); setLoaded({ saved: loaded.saved }) }
      setRecovery(false); setLoadVersion(v => v + 1)
    } catch (e) { setLoadError((e as Error).message) }
    finally { setRecovering(false) }
  }
  useEffect(() => { let live = true; props.bridge.request('load', { sessionId: props.sessionId }).then((value: NoteLoad) => { if (live) { setLoaded(value); setRecovery(!!value.draft) } }).catch((e: Error) => live && setLoadError(e.message)); return () => { live = false } }, [props.sessionId, props.bridge])
  return <div className="en-shell"><style>{notePlaceholderCss(document.documentElement.dataset.odysseyLocale)}</style>
    {loadError ? <div className="en-load-error"><p>{t(loadError)}</p><button onClick={refresh}>{t("重新读取")}</button></div> : !loaded ? <div className="en-load-error">{t("正在打开笔记…")}</div> : <NotesEditor key={props.sessionId + ':' + loadVersion} {...props} initial={loaded.saved} recovery={recovery ? loaded.draft : undefined} recovering={recovering} onRecovery={resolveRecovery} onReload={refresh} />}
  </div>
}

function NotesEditor(props: Props & { initial: NoteLoad['saved']; recovery?: NoteLoad['draft']; recovering: boolean; onRecovery(restore: boolean): void; onReload(): void }) {
  const [title, setTitle] = useState(props.initial.title), [status, setStatus] = useState(props.recovery ? '发现本地草稿' : '已保存'), [error, setError] = useState(''), [outline, setOutline] = useState<any[]>([]), [active, setActive] = useState(''), [preview, setPreview] = useState<NoteSuggestionPreview & {requestId:string}>(), [compare, setCompare] = useState(false)
  const client = useRef((props.initial as any).clientId || crypto.randomUUID()), revision = useRef(props.initial.revision), titleRef = useRef(title), scroll = useRef<HTMLDivElement>(null), saveTimer = useRef<ReturnType<typeof setTimeout>>(), saveQueue = useRef(Promise.resolve()), disposed = useRef(false), request = useRef(''), epoch = useRef(0), selection = useRef({ text: '', from: 0, to: 0, cursor: '' }), lastWritten = useRef(''), latest = useRef<NoteContent>(props.initial)
  titleRef.current = title
  const foreground=useRef(props.active!==false);foreground.current=props.active!==false
  const editorActive=()=>foreground.current&&noteEditorVisible(scroll.current)
  const doc = useMemo(() => createNoteDocument(props.initial).doc, [])
  const [editedAt,setEditedAt]=useState(()=>noteEditTimestamp(doc.getMap('note-metadata').get('editedAt'))),editFingerprint=useRef('')
  const users = useMemo(() => createUserStore(async ids => ids.map(id => ({ id, username: id===CHALLENGE_USER?t('AI评论员'):t('我'), avatarUrl: '' }))), [])
  useEffect(()=>{users.setUser({id:CHALLENGE_USER,username:t('AI评论员'),avatarUrl:''})},[users,document.documentElement.dataset.odysseyLocale])
  const editor: any = useCreateBlockNote(withCollaboration({ schema, dictionary: {...(document.documentElement.dataset.odysseyLocale==='en'?en:zh)}, dropCursor:{width:1,color:'var(--en-drag-ink)'}, initialContent: props.initial.blocks.length ? props.initial.blocks as any : undefined, collaboration: { fragment: doc.getXmlFragment('note'), user: { name: t('我'), color: '#94b2ff' } }, extensions: [NoteAiSelection(), NoteReplacementHighlights(),NoteInlineProposalHighlights(), CommentsExtension({ threadStore: new YjsThreadStore('local', doc.getMap('threads'), new NoteThreadStoreAuth('local', 'editor')), resolveUsers: users, confirmBeforeDiscard: false })] } as any))
  editor.dictionary = document.documentElement.dataset.odysseyLocale==='en'?en:zh
  const pinnedSelection = useRef<(typeof selection.current) & { fingerprint: string }>()
  const references=useNoteReferenceContext(editor,props.sessionId,scroll,!!props.recovery||props.active===false)
  const [assistantVisible,setAssistantVisible]=useState(false),[writing,setWriting]=useState(false),anchorVersion=useRef(0)
  const [inlineDraft,setInlineDraft]=useState<NoteInlineAiDraft>(),inlineDraftRef=useRef<NoteInlineAiDraft>(),inlinePrompt=useRef(''),inlineRequest=useRef<{requestId:string;anchor:NoteInsertionAnchor}>(),composing=useRef(false)
  // The inline demand and component fields own their IME lifecycle. A removed
  // textarea may never emit compositionend; it must not latch the body guard.
  const startBodyComposition=(event:React.CompositionEvent)=>{
    const target=event.target as HTMLElement
    if(target.isContentEditable&&target.closest('.bn-editor')&&!target.closest('input,textarea,button,select,[contenteditable="false"]'))composing.current=true
  }
  inlineDraftRef.current=inlineDraft
  const reviewedProposal=useRef<string>(),reviewActions=useRef<{show(value:NoteInlineProposal):void;confirm(id:string):void}>(),automaticSettlements=useRef<Promise<unknown>>(Promise.resolve()),settlementTask=useRef<Promise<unknown>>(Promise.resolve())
  const capabilityFingerprint=useRef(''),capabilityCards=useRef(new Map<string,string>()),capabilityReservations=useRef(new Map<string,string>())
  const inlineCreations=useRef(new Map<string,{blockId:string;identity:string}>())
  const [proposalVersion,setProposalVersion]=useState(0),proposalRestore=useRef(false),settlingProposal=useRef('')
  const proposals=useMemo(()=>createNoteInlineProposals({editor,doc,onChange:()=>setProposalVersion(value=>value+1)}),[editor,doc])
  const aiActionEditor=useMemo(()=>proposals.proxy(()=>!!inlineRequest.current&&inlineRequest.current.requestId===request.current),[proposals])
  const componentOwned=(id:any)=>typeof id==='string'&&!!inlineRequest.current&&[...capabilityCards.current.values()].includes(id)
  const aiComponentEditor=useMemo(()=>proposals.proxy((_method,args)=>componentOwned(typeof args[0]==='string'?args[0]:args[0]?.id)),[proposals])
  const inlineComponentNode=(block:any)=>{try{return JSON.parse(block?.props?.payload)}catch{return {}}}
  const unfinishedInlineComponent=(block:any)=>{if(block?.type!=='research')return false;const node=inlineComponentNode(block);return !node.containerSpec||!!node.noteDraft||['draft','queued','running','retrying','failed','cancelled','interrupted'].includes(node.generationStatus)}
  const inlineProposalState=(value:NoteInlineProposal)=>{
    const failed=value.changes.filter(change=>change.after?.type==='research'&&(unfinishedInlineComponent(change.after)||unfinishedInlineComponent(editor.getBlock(change.id))))
    const failures=new Set(failed.map(change=>change.id)),changes=value.changes.filter(change=>!failures.has(change.id)),shown=changes.filter(change=>change.after),components=shown.filter(change=>change.after?.type==='research').length,text=shown.length-components
    const error=value.error||failed.map(change=>inlineComponentNode(editor.getBlock(change.id)||change.after).generationError||inlineComponentNode(change.after).generationError).filter(Boolean).join('；').slice(0,1000)||t('组件生成未返回有效内容，请重试。')
    const summary=failed.length?(value.resultKind==='text-fallback'?value.summary:shown.length?'已保留'+[text?text+'项内容':'',components?components+'个组件':''].filter(Boolean).join('、')+'，部分未完成':error):value.summary
    return{failed,changes,shown,summary,error,onlyFailed:failed.length>0&&!shown.length}
  }
  const finishInlineProposal=(id:string,partial=false,summary='',kind?:string,error?:string)=>{
    const current=proposals.list().find(value=>value.id===id),state=current&&inlineProposalState(current)
    if(state?.failed.length){partial=true;if(kind!=='text-fallback')summary=state.summary;error=error||state.error}
    if(partial&&!error)error=t('本次操作未完成，内容已保留。')
    const value=proposals.finish(id,partial,summary,kind)
    if(value&&error){proposals.setError(id,error);value.error=error}
    return value
  }
  const showProposal=(value:NoteInlineProposal,busy=false)=>{
    const state=inlineProposalState(value)
    if(!busy&&value.state==='ready'&&state.onlyFailed){reviewedProposal.current=undefined;inlinePrompt.current=value.prompt;setInlineDraft(previous=>previous&&(previous.review?.id===value.id||inlineRequest.current?.requestId===value.id)?{...previous,prompt:value.prompt,review:undefined,error:state.error,reply:undefined}:{anchor:{...value.anchor,documentId:client.current},prompt:value.prompt,error:state.error});return}
    const owned=new Set((busy?value.changes:state.changes).filter(change=>change.after).map(change=>change.id)),ids=editor.document.filter((block:any)=>owned.has(block.id)).map((block:any)=>block.id),anchor=ids[0]||[value.anchor?.blockId,...value.changes.flatMap(change=>[change.next,change.previous])].find(id=>id&&editor.getBlock(id))||editor.document[0]?.id
    if(!anchor)return
    reviewedProposal.current=value.id
    const review={id:value.id,summary:state.summary,blockIds:ids,anchorBlockId:anchor,anchorIsResult:!!ids[0],busy:busy||!!settlingProposal.current,canUndo:editor.isEditable&&proposals.canUndo(value.id)},error=busy?undefined:state.failed.length?state.error:value.error
    setInlineDraft(previous=>previous&&(previous.review?.id===value.id||inlineRequest.current?.requestId===value.id)?{...previous,review,error,reply:undefined}:{anchor:{...value.anchor,documentId:client.current},prompt:value.prompt,review,error})
  }
  useEffect(()=>{
    const values=proposals.list(),ready=values.filter(value=>value.state==='ready')
    editor.getExtension(NoteInlineProposalHighlights)?.setProposals(ready.map(value=>({id:value.id,blockIds:inlineProposalState(value).shown.map(change=>change.id)})))
    if(!proposalRestore.current){proposalRestore.current=true;if(ready.length)showProposal(ready.at(-1)!)}
    const current=inlineDraftRef.current?.review,live=inlineRequest.current?.requestId,value=values.find(item=>item.id===(live||current?.id))
    if(value&&(value.state==='ready'||value.changes.some(change=>change.after)))showProposal(value,value.state==='running'||settlingProposal.current===value.id)
  },[proposalVersion,proposals,editor])
  useEffect(()=>{
    let gesture:{blockId:string;proposalId?:string;from?:string;documentId:string;epoch:number}|undefined
    const frames=new Set<number>()
    const hit=(event:Event)=>{
      const path=event.composedPath().filter(node=>node instanceof Element) as HTMLElement[],outer=path.find(node=>node.matches('.bn-block-outer[data-id]'))
      if(!outer||!scroll.current?.contains(outer)||!outer.closest('.bn-editor')||!path.some(node=>node.matches('.bn-block-content')))return
      const control=path.slice(0,path.indexOf(outer)).find(node=>node.matches('button,input,textarea,select,a,summary,label,[role="button"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="checkbox"],[role="radio"],[role="switch"],[role="slider"],[role="spinbutton"],[role="combobox"],[role="textbox"],[role="tab"],[role="option"],[role="separator"]'))
      if(control&&!control.matches('button.en-component-scroll-guard'))return
      return{blockId:outer.dataset.id!,proposalId:path.find(node=>node.hasAttribute('data-en-inline-proposal-id'))?.dataset.enInlineProposalId}
    }
    const down=(event:PointerEvent)=>{gesture=undefined;if(event.button!==0||event.isPrimary===false)return;const target=hit(event);if(target)gesture={...target,from:inlineDraftRef.current?.review?.id||(!inlineDraftRef.current?reviewedProposal.current:undefined),documentId:client.current,epoch:epoch.current}}
    const cancel=()=>{gesture=undefined}
    const click=(event:MouseEvent)=>{
      const target=hit(event),previous=gesture;gesture=undefined
      if(!target||!previous||event.button!==0||event.detail===0||target.blockId!==previous.blockId||previous.documentId!==client.current||previous.epoch!==epoch.current||request.current||inlineDraftRef.current&&!inlineDraftRef.current.review&&inlineDraftRef.current.prompt.trim())return
      // A native empty-paragraph click can precede ProseMirror's selectionchange.
      // Adopt that exact browser selection before review decorations dispatch.
      const view=editor._tiptapEditor.view,native=view.dom.ownerDocument.getSelection()
      if((previous.from||target.proposalId)&&editor.isEditable&&native?.anchorNode&&native.focusNode&&view.dom.contains(native.anchorNode)&&view.dom.contains(native.focusNode)&&view.dom.contains(view.dom.ownerDocument.activeElement)&&native.focusNode.parentElement?.closest('.bn-block-outer')?.getAttribute('data-id')===target.blockId){
        try{const from=view.posAtDOM(native.anchorNode,native.anchorOffset),to=view.posAtDOM(native.focusNode,native.focusOffset);if(view.state.doc.resolve(from).parent.inlineContent&&view.state.doc.resolve(to).parent.inlineContent&&(view.state.selection.anchor!==from||view.state.selection.head!==to))editor._tiptapEditor.commands.setTextSelection({from,to})}catch{}
      }
      const frame=requestAnimationFrame(()=>{
        frames.delete(frame)
        if(disposed.current||!editorActive()||previous.documentId!==client.current||previous.epoch!==epoch.current||request.current)return
        const next=target.proposalId&&proposals.list().find(value=>value.id===target.proposalId)
        if(next)reviewActions.current?.show(next)
        if(previous.from&&previous.from!==target.proposalId&&(next||!target.proposalId&&editor.getBlock(target.blockId)?.type==='paragraph'))reviewActions.current?.confirm(previous.from)
      });frames.add(frame)
    }
    document.addEventListener('pointerdown',down,true);document.addEventListener('pointercancel',cancel,true);document.addEventListener('click',click)
    return()=>{document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointercancel',cancel,true);document.removeEventListener('click',click);for(const frame of frames)cancelAnimationFrame(frame);proposals.dispose()}
  },[proposals,editor])
  const dataRefreshGuard=useRef(createNoteDataRefreshGuard())
  const externalCapabilities=useRef<ReturnType<typeof createExternalNoteCapabilityLease>>()
  const [externalBusy,setExternalBusy]=useState(false)
  const challengeController=useRef<ReturnType<typeof useNoteChallenge>>()
  const noteDataCapability=useRef<ReturnType<typeof createNoteDataCapability>>()
  const challengeScheduleSync=useRef<()=>void>()
  const importing=useRef(new Set<string>()),exportPending=useRef(false),[exporting,setExporting]=useState(false)
  const assistantHost=useMemo(()=>{const host=document.createElement('div');host.className='en-inline-assistant';host.contentEditable='false';return host},[])
  const paintSelection = (range: {from:number;to:number}) => {const version=++anchorVersion.current;setAssistantVisible(true);editor.getExtension(NoteAiSelection)?.highlight(range,assistantHost,()=>queueMicrotask(()=>{if(!disposed.current&&anchorVersion.current===version){setAssistantVisible(false);}}))}
  const clearSelection = (preserveComponents=false) => { references.clear(preserveComponents);if(!pinnedSelection.current&&!assistantVisible)return;anchorVersion.current++;pinnedSelection.current = undefined; selection.current={...selection.current,text:'',from:0,to:0};setAssistantVisible(false); editor.getExtension(NoteAiSelection)?.highlight() }
  useEffect(()=>{
    const componentSelected=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.sessionId!==props.sessionId||!value.references.some((item:any)=>item.type!=='text'))return;anchorVersion.current++;pinnedSelection.current=undefined;setAssistantVisible(false);if(editor.getExtension(NoteAiSelection)?.currentRange())editor.getExtension(NoteAiSelection).highlight()}
    document.addEventListener('sherlock:notes-reference-state',componentSelected);return()=>document.removeEventListener('sherlock:notes-reference-state',componentSelected)
  },[editor,props.sessionId])
  const engagement = useRef({started:false,target:'',sent:undefined as string|undefined,busy:false,timer:undefined as ReturnType<typeof setTimeout>|undefined})
  const persistEngagement = async () => {
    const state=engagement.current;if(!state.started||state.busy||state.sent===state.target)return;state.busy=true;const title=state.target
    try { await props.bridge.request('engage',{sessionId:props.sessionId,title,locale:document.documentElement.dataset.odysseyLocale});state.sent=title }
    catch(e){if(!disposed.current)setError((e as Error).message)}
    finally{state.busy=false;if(state.target!==title)void persistEngagement()}
  }
  const engage = () => {
    if(props.guide)return
    recordSidebarSessionUse(props.sessionId)
    document.dispatchEvent(new CustomEvent('sherlock:notes-edited',{detail:{sessionId:props.sessionId}}))
    const state=engagement.current;state.started=true;state.target=titleRef.current;clearTimeout(state.timer)
    if(state.sent===undefined)void persistEngagement();else state.timer=setTimeout(()=>void persistEngagement(),300)
  }
  const snapshot = (): NoteContent => ({ title: titleRef.current, blocks: editor.document, yjs: encode(doc) })
  const save = () => {
    clearTimeout(saveTimer.current)
    saveQueue.current = saveQueue.current.then(async () => {
      if(props.guide&&disposed.current)return
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
  // Queue settlement alone is not persistence: save() keeps conflict/error UI local.
  const persistConfirmed = async () => {
    save();await saveQueue.current
    if(lastWritten.current!==JSON.stringify(snapshot()))throw Error('笔记尚未保存，较新内容已保留为草稿。')
  }
  useEffect(()=>{
    if(!props.saveBinding)return
    const flush=()=>persistConfirmed();props.saveBinding.ready(flush)
    return()=>props.saveBinding?.dispose?.(flush)
  },[props.saveBinding])
  const htmlAccess=useRef<{active():boolean;persist():Promise<void>}>({active:()=>false,persist:async()=>{}})
  htmlAccess.current={active:()=>!disposed.current&&!props.recovery&&editorActive(),persist:persistConfirmed}
  const htmlInteractions=useMemo(()=>createNoteHtmlInteraction({editor,current:()=>htmlAccess.current.active(),persist:()=>htmlAccess.current.persist(),captureWrite:proposals.captureHtmlInteraction}),[editor,proposals])
  const systemMutation=useRef(false)
  const updateSystemComponent=(blockId:string,node:Record<string,any>,value?:any)=>{
    const ticket=value?.method==='apply'?dataRefreshGuard.current.before(snapshot(),blockId,node.id):undefined
    systemMutation.current=true
    try{
      editor.transact((tr:any)=>{tr.setMeta('addToHistory',false);editor.updateBlock(blockId,{props:{payload:JSON.stringify(node)}})})
      if(ticket)dataRefreshGuard.current.applied(request.current||externalCapabilities.current?.generationId()||'',ticket,snapshot(),value.guardId)
    }
    finally{queueMicrotask(()=>{systemMutation.current=false})}
  }
  const changed = () => {
    const fingerprint=noteEditFingerprint(titleRef.current,editor.document)
    if(fingerprint!==editFingerprint.current){
      editFingerprint.current=fingerprint
      if(!systemMutation.current){const timestamp=Date.now();doc.getMap('note-metadata').set('editedAt',timestamp);setEditedAt(timestamp)}
    }
    if(!systemMutation.current)engage()
    const content = snapshot(); latest.current = content; setOutline(noteOutline(content.blocks)); setStatus('保存中…')
    void props.bridge.draft({ sessionId: props.sessionId, clientId: client.current, revision: revision.current, content }).catch((e: Error) => { if (!disposed.current) { setStatus('草稿保存失败'); setError(e.message) } })
    clearTimeout(saveTimer.current); saveTimer.current = setTimeout(save, 750)
  }
  useEffect(() => {
    editFingerprint.current=noteEditFingerprint(titleRef.current,editor.document)
    lastWritten.current = JSON.stringify(snapshot()); setOutline(noteOutline(editor.document))
    const off = editor.onChange(changed), offSelection = editor.onSelectionChange(() => { const tiptap = editor._tiptapEditor, range = tiptap.state.selection; selection.current = { text: editor.getSelectedText(), from: range.from, to: range.to, cursor: editor.getTextCursorPosition().block.id } })
    const commentChanged = () => changed(); doc.getMap('threads').observeDeep(commentChanged)
    const flush = (e: KeyboardEvent) => { if (editorActive()&&(e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() } }
    window.addEventListener('keydown', flush)
    return () => { disposed.current = true; epoch.current++; clearTimeout(saveTimer.current); clearTimeout(engagement.current.timer);if(!props.guide)void persistEngagement(); off(); offSelection(); doc.getMap('threads').unobserveDeep(commentChanged); window.removeEventListener('keydown', flush); if (!props.guide&&request.current) { rollbackNativeDraft(lastRequest.current?.admission); publishTask(request.current,'stopped'); void props.bridge.request('stop', { sessionId: props.sessionId, requestId: request.current }) }; if(!props.guide)save() }
  }, [])
  useEffect(()=>{
    if(props.guide)return
    let live=true
    const isVisible=()=>editorActive()&&document.visibilityState!=='hidden'
    const handle=createNoteComponentDataActions({sessionId:props.sessionId,editor,current:()=>live&&!disposed.current&&!props.recovery&&isVisible(),update:updateSystemComponent,authorize:value=>{if(value.guardId!==undefined&&!noteDataCapability.current)throw Error('组件数据操作已过期或不可用。');noteDataCapability.current?.authorize(value)},onApplied:(value,id)=>noteDataCapability.current?.onApplied(value,id)})
    const receive=(event:Event)=>{void handle((event as CustomEvent).detail).then(reply=>{if(live&&reply)return props.bridge.request('component-data-reply',reply)}).catch(()=>{})}
    const visible=()=>{if(live&&!props.recovery)void props.bridge.request('component-data-visible',{sessionId:props.sessionId,active:isVisible()}).catch(()=>{})}
    document.addEventListener('sherlock:notes-component-data-action',receive);document.addEventListener('visibilitychange',visible);document.addEventListener('sherlock:workspace-surface-change',visible);visible()
    const timer=setInterval(visible,10000)
    return()=>{live=false;clearInterval(timer);document.removeEventListener('sherlock:notes-component-data-action',receive);document.removeEventListener('visibilitychange',visible);document.removeEventListener('sherlock:workspace-surface-change',visible);void props.bridge.request('component-data-visible',{sessionId:props.sessionId,active:false}).catch(()=>{})}
  },[editor,props.sessionId,props.recovery,props.bridge,props.active])
  useEffect(()=>{
    if(props.guide)return
    let live=true
    const dataCapability=createNoteDataCapability({editor:aiActionEditor,refreshGuard:dataRefreshGuard.current,selected:()=>{const captured=references.capture();return captured.scope==='selection'?captured.components.filter(item=>item.type==='research').map(item=>item.blockId):[]},request:(method,args)=>props.bridge.request(method,{sessionId:props.sessionId,...args}),persist:persistConfirmed,report:(requestId,effect)=>props.bridge.request('capability-reply',{sessionId:props.sessionId,requestId,effect})})
    noteDataCapability.current=dataCapability
    const sharedActions={
      editor:aiActionEditor,snapshot,documentId:client.current,
      challenge:()=>challengeController.current,dataCapability,
      refreshGuard:dataRefreshGuard.current,
      selectedBlockIds:()=>{
        const captured=references.capture()
        return captured.scope==='selection'?captured.components.filter(item=>item.type==='research').map(item=>item.blockId):[]
      },
      selectedParagraphIds:()=>selectedNoteParagraphIds(editor,references.capture(false).range),
      createComponent:async(args:any,current:()=>boolean,requestId:string,report:(effect:any)=>Promise<void>)=>{
        if(!current())throw Error('笔记会话已变化。')
        const inline=inlineRequest.current?.requestId===request.current?inlineRequest.current:undefined
        if(inline)noteInlineAnchorBlock(editor,inline.anchor,client.current)
        const retry=inline?proposals.list().flatMap(value=>{
          if(value.id===inline.requestId||value.state!=='ready'||value.prompt.trim()!==lastRequest.current?.prompt.trim()||value.anchor?.blockId!==inline.anchor.blockId)return []
          try{noteInlineAnchorBlock(editor,{...value.anchor,documentId:client.current},client.current)}catch{return []}
          return inlineProposalState(value).failed.filter(change=>{const node=inlineComponentNode(editor.getBlock(change.id));return node.noteDraft==='smart'&&!node.containerSpec&&!capabilityReservations.current.has(change.id)&&![...capabilityCards.current.values()].includes(change.id)&&!inlineComponents.isGenerating(change.id)&&proposals.canUndoBlock(value.id,change.id)}).map(change=>({value,block:editor.getBlock(change.id)}))
        })[0]:undefined
        const block={type:'research',props:{payload:JSON.stringify({
          id:'note-component-'+crypto.randomUUID(),kind:'generated-container',title:t('智能组件'),
          noteDraft:'smart',containerPrompt:args.prompt,generationStatus:'draft'
        })}}
        const created=retry?.block||(inline?proposals.run(()=>insertNoteInlineBlocks(editor,inline.anchor,client.current,[block])):editor.insertBlocks([block],editor.document.at(-1),'after'))[0]
        if(inline){const identity=noteInlineBlockIdentity(editor,created.id);if(!identity)throw Error(t('本次组件位置尚未就绪，原需求已保留。'));inlineCreations.current.set(created.id,{blockId:created.id,identity})}
        capabilityReservations.current.set(created.id,requestId)
        try{
          await report({state:'placeholder',blockId:created.id})
          if(!current())return {status:'cancelled',blockId:created.id}
          if(inline&&!proposals.canUndoBlock(retry?.value.id||inline.requestId,created.id))throw Error(t('组件已变化，较新内容已保留。'))
          capabilityCards.current.set(requestId,created.id)
          const checkpoint=retry&&proposals.list().find(value=>value.id===retry.value.id)
          if(checkpoint){const changes=checkpoint.changes.filter(change=>change.id!==created.id);if(changes.length)proposals.restore({...checkpoint,changes});else proposals.confirm(checkpoint.id)}
          const completion=inlineComponents.startAndWait(created.id,args.prompt,args.requestContext,state=>report({state,blockId:created.id}),inline?()=>{if(!current()||inlineRequest.current!==inline)return false;try{noteInlineAnchorBlock(editor,inline.anchor,client.current);return true}catch{return false}}:undefined)
          if(checkpoint&&!inlineComponents.isGenerating(created.id)&&!proposals.has(created.id))proposals.restore(checkpoint)
          return await completion
        }
        finally{capabilityCards.current.delete(requestId);if(capabilityReservations.current.get(created.id)===requestId)capabilityReservations.current.delete(created.id)}
      },
      cancelComponent:(requestId:string)=>{
        const blockId=capabilityCards.current.get(requestId)
        if(blockId)inlineComponents.stop(blockId)
        for(const [id,owner]of capabilityReservations.current)if(owner===requestId)capabilityReservations.current.delete(id)
      },
      reportEffect:(requestId:string,effect:any)=>props.bridge.request('capability-reply',{sessionId:props.sessionId,requestId,effect}),
      persist:persistConfirmed,
      exportNote:(args:any,current:()=>boolean)=>exportNoteWithSnapshots({snapshot,bridge:props.bridge,sessionId:props.sessionId,...args,locale:document.documentElement.dataset.odysseyLocale,current}),
      settle:()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))
    }
    const current=()=>live&&!disposed.current&&!props.recovery&&editor.isEditable&&editorActive()
    const handler=createNoteCapabilityActions({...sharedActions,initialFingerprint:()=>capabilityFingerprint.current,generationId:()=>request.current,current,anchoredCreate:(generationId:string)=>{const inline=inlineRequest.current;if(!inline||inline.requestId!==generationId)return false;noteInlineAnchorBlock(editor,inline.anchor,client.current);return true}})
    const external=createExternalNoteCapabilityLease({sessionId:props.sessionId,documentId:client.current,current,busy:()=>!!request.current||exportPending.current||!!importing.current.size||noteResearchBlocks(editor.document).some(block=>inlineComponents.isGenerating(block.id)&&![...capabilityCards.current.values()].includes(block.id)),snapshot,
      capture:async()=>{const context=references.capture(),range=context.range;return{selectedBlockIds:sharedActions.selectedBlockIds(),selectedParagraphIds:sharedActions.selectedParagraphIds(),requestContext:{images:[],title:titleRef.current,markdown:context.scope==='note'?await editor.blocksToMarkdownLossy(editor.document):'',selection:range?.text||'',context:{scope:context.scope,components:context.components}}}},
      begin:id=>dataRefreshGuard.current.begin(id,snapshot()),
      create:lease=>createNoteCapabilityActions({...sharedActions,...lease}),
      retaining:value=>{setExternalBusy(value);publishComposer({running:value||!!request.current});document.dispatchEvent(new CustomEvent('sherlock:notes-capability-activity',{detail:{sessionId:props.sessionId,instanceId:props.activityId,retaining:value}}))}
    })
    externalCapabilities.current=external
    const ready=()=>{void props.bridge.request('capability-ready',{sessionId:props.sessionId,documentId:client.current,active:current()}).catch(()=>{})}
    const receive=(event:Event)=>{
      const input=(event as CustomEvent).detail
      if(input?.sessionId!==props.sessionId)return
      const externalInput=input.release||input.action==='context.acquire'||input.generationId?.startsWith('harness:')||external.owns(input.requestId)
      void (externalInput?external.handle(input):handler(input)).then(result=>{
        if(!input.cancel&&!input.release)return props.bridge.request('capability-reply',{sessionId:props.sessionId,requestId:input.requestId,result})
      }).catch(error=>props.bridge.request('capability-reply',{sessionId:props.sessionId,requestId:input.requestId,error:error.message}).catch(()=>{}))
    }
    document.addEventListener('sherlock:notes-capability-action',receive)
    document.addEventListener('sherlock:workspace-surface-change',ready);document.addEventListener('visibilitychange',ready);ready();const timer=setInterval(ready,10000)
    return()=>{live=false;clearInterval(timer);external.dispose();externalCapabilities.current=undefined;handler.dispose();noteDataCapability.current=undefined;document.removeEventListener('sherlock:notes-capability-action',receive);document.removeEventListener('sherlock:workspace-surface-change',ready);document.removeEventListener('visibilitychange',ready);void props.bridge.request('capability-ready',{sessionId:props.sessionId,documentId:client.current,active:false}).catch(()=>{})}
  },[editor,props.sessionId,props.recovery,props.bridge])
  const locate = (id: string) => { const element = scroll.current?.querySelector<HTMLElement>('[data-id="' + CSS.escape(id) + '"]'); if (element) { element.scrollIntoView({ block: 'start', behavior: 'smooth' }); setActive(id) } }
  const track = () => { const top = scroll.current?.getBoundingClientRect().top ?? 0; let current = outline[0]?.id; for (const h of outline) { const el = scroll.current?.querySelector('[data-id="' + CSS.escape(h.id) + '"]'); if (el && el.getBoundingClientRect().top <= top + 140) current = h.id } setActive(current || '') }
  const paste = async (event?: React.ClipboardEvent) => {
    if (props.recovery||!editorActive()) return
    if (event) { if (!event.clipboardData.getData('text/html').includes('sherlock-research-clipboard')) return; event.preventDefault() }
    try { const result = await props.bridge.request('clipboard', { sessionId: props.sessionId }); if (result.kind === 'components') { event?.preventDefault(); editor.insertBlocks(result.nodes.map((node: any) => ({ type: 'research', props: { payload: JSON.stringify({...node,id:'note-component-'+crypto.randomUUID()}) } })), editor.getTextCursorPosition().block, 'after'); editor.focus() } } catch (e) { setError((e as Error).message) }
  }
  const [fileDrag,setFileDrag]=useState(false)
  const ownsFiles=(event:React.DragEvent|DragEvent)=>editorActive()&&!props.recovery&&Array.from(event.dataTransfer!.types).some(type=>type==='Files'||type===NOTE_FILE_DRAG_TYPE)
  const dropFiles=async(event:DragEvent)=>{
    setFileDrag(false);if(!ownsFiles(event))return
    event.preventDefault();event.stopPropagation()
    const files=noteFileCandidates(event.dataTransfer!,props.sessionId,file=>props.bridge.filePath?.(file)||'')
    if(!files.length){setError(t("请从访达或当前会话的文件区拖入文件。"));return}
    const target=(event.target as HTMLElement).closest('.bn-block-outer[data-id]') as HTMLElement|null
    const reference=target&&editor.getBlock(target.dataset.id)?editor.getBlock(target.dataset.id):editor.document.at(-1)
    const placement=target&&event.clientY<target.getBoundingClientRect().top+target.getBoundingClientRect().height/2?'before':'after'
    await importFiles(files,reference,placement)
  }
  const importFiles=async(files:Array<{name:string;path?:string;relativePath?:string}>,reference:any,placement:'before'|'after',noteDisplay?:'inline')=>{
    const reservations=files.map(file=>({id:'note-file-'+crypto.randomUUID(),type:'attachment',props:{payload:JSON.stringify({name:file.name,importStatus:'importing',source:'computer',...(noteDisplay?{noteDisplay}:{})})}}))
    for(const block of reservations)block.props.payload=JSON.stringify({...JSON.parse(block.props.payload),id:block.id})
    for(const block of reservations)importing.current.add(block.id)
    const undo=editor._tiptapEditor.state.plugins.find((plugin:any)=>plugin.key.startsWith('y-undo'))?.getState(editor._tiptapEditor.state)?.undoManager
    undo?.stopCapturing();editor.insertBlocks(reservations,reference,placement);undo?.stopCapturing();setError('')
    for(let i=0;i<files.length;i++){
      const block=reservations[i]!,file=files[i]!
      if(disposed.current||!editor.getBlock(block.id)){importing.current.delete(block.id);continue}
      try{
        const node=await props.bridge.request('file-admit',{sessionId:props.sessionId,nodeId:block.id,...file})
        if(disposed.current||!editor.getBlock(block.id)){void props.bridge.request('file-revoke',{sessionId:props.sessionId,nodeId:block.id}).catch(()=>{});continue}
        importing.current.delete(block.id);editor.transact((tr:any)=>{tr.setMeta('addToHistory',false);editor.updateBlock(block.id,{props:{payload:JSON.stringify({...node,...(noteDisplay?{noteDisplay}:{})})}})})
      }catch(e){if(!disposed.current&&editor.getBlock(block.id))editor.transact((tr:any)=>{tr.setMeta('addToHistory',false);editor.updateBlock(block.id,{props:{payload:JSON.stringify({id:block.id,name:file.name,source:'computer',importStatus:'failed',error:(e as Error).message,...(noteDisplay?{noteDisplay}:{})})}})})}
      finally{importing.current.delete(block.id)}
    }
  }
  useNoteDragAndDrop({editor,root:scroll,sessionId:props.sessionId,clientId:client.current,readOnly:!!props.recovery||props.active===false,dropFiles,finish:()=>setFileDrag(false)})
  useNoteReplyInsertion({editor,sessionId:props.sessionId,root:scroll,readOnly:!!props.recovery||props.active===false})
  const nativeCurrent=()=>!props.guide||!!props.guide.native&&document.documentElement.dataset.homeGuidePointerRun===props.guide.native.runId
  const publishComposer = (value: {running?: boolean;ready?: boolean}) => {if(nativeCurrent()&&editorActive())document.dispatchEvent(new CustomEvent('sherlock:notes-composer-state',{detail:{sessionId:props.sessionId,ready:!props.recovery,running:!!request.current||!!externalCapabilities.current?.pending(),...value}}))}
  const setNativeDraft = (text?: string, focus=false) => {if(nativeCurrent())document.dispatchEvent(new CustomEvent('sherlock:notes-composer-draft',{detail:{sessionId:props.sessionId,...text===undefined?{}:{text,clearImages:text===''},focus}}))}
  const commitNativeDraft = (admission?:ComposerAdmission) => {if(nativeCurrent())document.dispatchEvent(new CustomEvent('sherlock:notes-composer-commit',{detail:{sessionId:props.sessionId,admission}}))}
  const rollbackNativeDraft = (admission?:ComposerAdmission) => {if(nativeCurrent())document.dispatchEvent(new CustomEvent('sherlock:notes-composer-rollback',{detail:{sessionId:props.sessionId,admission}}))}
  const publishTask = (requestId:string,phase:string,value:Record<string,unknown>={}) => {if(!nativeCurrent())return;document.dispatchEvent(new CustomEvent('sherlock:notes-task-state',{detail:{sessionId:props.sessionId,requestId,phase,...value}}));if(['accepted','discarded'].includes(phase))void props.bridge.request('conversation-state',{sessionId:props.sessionId,requestId,phase}).catch(()=>{})}
  const lastRequest=useRef<{prompt:string;images:any[];admission?:ComposerAdmission;captured:typeof selection.current;fingerprint:string;context:NoteReferenceContext;draftBlockId?:string}>()
  const generatingBlock = useRef('')
  const activeGeneration=useRef<{requestId:string;blockId:string;expected:string}>()
  const currentGeneration=(active=activeGeneration.current)=>{
    if(!active)return
    const block=editor.getBlock(active.blockId);if(!block)return
    try{const latest=JSON.parse(block.props.payload),expected=JSON.parse(active.expected)
      // Component size is independent of the generated content and remains editable.
      if(JSON.stringify({...latest,noteSize:undefined})!==JSON.stringify({...expected,noteSize:undefined}))return
      active.expected=block.props.payload;return block
    }catch{return}
  }
  const generate = async (prompt: string, images: any[] = [], admission?:ComposerAdmission, retry?:typeof lastRequest.current, targetDraft?:string, inlineTarget?:NoteInsertionAnchor) => {
    if ((!prompt.trim() && !images.length) || request.current || externalCapabilities.current?.pending() || props.recovery||!editorActive()||!nativeCurrent()) return
    if(inlineTarget)noteInlineAnchorBlock(editor,inlineTarget,client.current)
    externalCapabilities.current?.revoke()
    const draftBlockId=targetDraft||retry?.draftBlockId
    const draftBlock=draftBlockId?editor.getBlock(draftBlockId):undefined
    if(draftBlockId&&(!draftBlock||JSON.parse(draftBlock.props.payload).noteDraft!=='smart'))return
    const context:NoteReferenceContext=draftBlockId?{scope:'none',components:[]}:inlineTarget?{...references.capture(),range:undefined}:retry?.context||references.capture()
    const attempt = ++epoch.current, captured = { ...(retry?.captured || context.range || {...selection.current,text:'',from:0,to:0}) }, fingerprint = retry?.fingerprint || (context.range?pinnedSelection.current?.fingerprint:undefined) || JSON.stringify(editor.document), requestId = crypto.randomUUID()
    if(!retry&&context.range&&pinnedSelection.current){const range=editor.getExtension(NoteAiSelection)?.currentRange();Object.assign(captured,range?{...range,text:editor._tiptapEditor.state.doc.textBetween(range.from,range.to,'\n')}:{from:0,to:0,text:''})}
    if(inlineTarget)Object.assign(captured,{text:'',from:0,to:0,cursor:inlineTarget.blockId})
    const targetPayloads=new Map(context.components.map(item=>[item.blockId,editor.getBlock(item.blockId)?.props.payload]))
    const component = !!draftBlockId
    const selectedResearch=context.scope==='selection'?context.components.filter(item=>item.type==='research'):[]
    const targetBlockId=component&&selectedResearch.length===1&&/(修改|改为|改成|调整|更新|替换|重做|重绘|重新生成|重新制作)/u.test(prompt)?selectedResearch[0]?.blockId:undefined
    engage()
    lastRequest.current={prompt,images,admission,captured,fingerprint,context,draftBlockId}
    publishTask(requestId,'preparing',{prompt,references:noteMessageReferences(context,captured.text),operation:component?'component':captured.text?'rewrite':'write'})
    if(!component&&captured.text)paintSelection(captured)
    if(inlineTarget){inlineCreations.current.clear();inlineRequest.current={requestId,anchor:inlineTarget};setInlineDraft(value=>value?{...value,error:undefined,reply:undefined}:value)}
    request.current = requestId;setWriting(true); publishComposer({running:true}); setError(''); setPreview(undefined)
    let pending = ''
    try {
      const markdown = context.scope==='note'?await editor.blocksToMarkdownLossy(editor.document):''
      if(draftBlockId){
        pending=draftBlockId;generatingBlock.current=pending
        const node=JSON.parse(draftBlock.props.payload);const draftPayload=JSON.stringify({...node,containerPrompt:prompt,generationStatus:'running',generationError:undefined,generationTaskId:requestId,generationStartedAt:Date.now(),generationEvents:[],generationPartialText:''});editor.updateBlock(pending,{props:{payload:draftPayload}})
      }else if (component&&!targetBlockId) {
        const reference = captured.cursor ? editor.getBlock(captured.cursor) : editor.getTextCursorPosition().block
        const created = editor.insertBlocks([{ type: 'research', props: { payload: JSON.stringify({ id: 'note-component-'+requestId, title: t("智能组件"), kind: 'generated-container', noteLibrary:true,noteDraft:'smart',containerPrompt:prompt,generationStatus: 'running',generationTaskId:requestId,generationStartedAt:Date.now(),generationEvents:[],generationPartialText:'', generationDetail: prompt, sourceText: t("正在生成组件") }) } }], reference || editor.getTextCursorPosition().block, 'after')
        pending = created[0].id; generatingBlock.current = pending
        requestAnimationFrame(() => locate(pending))
      }
      if(pending)activeGeneration.current={requestId,blockId:pending,expected:editor.getBlock(pending).props.payload}
      publishTask(requestId,'generating')
      capabilityFingerprint.current=noteCapabilityFingerprint(snapshot())
      dataRefreshGuard.current.begin(requestId,snapshot())
      if(inlineTarget)proposals.begin(requestId,prompt,inlineTarget)
      const result: NoteAiResult = await props.bridge.request('generate', { sessionId: props.sessionId, requestId, capabilityContext:{documentId:client.current,selectedParagraphIds:context.range?selectedNoteParagraphIds(editor,captured):[],selectedBlockIds:context.scope==='selection'?context.components.filter(item=>item.type==='research').map(item=>item.blockId):[]}, ...inlineTarget?{entryPoint:'inline',insertionAnchor:inlineTarget}:{}, title:context.scope==='note'?title:'', markdown, selection: captured.text, context:{scope:context.scope,components:context.components}, prompt, images, ...targetBlockId?{targetBlockId}:{},mode: component ? 'component' : 'write' })
      if (disposed.current || epoch.current !== attempt||!nativeCurrent()||inlineTarget&&(!editorActive()||inlineRequest.current?.requestId!==requestId)) return
      if(inlineTarget)noteInlineAnchorBlock(editor,inlineTarget,client.current)
      if(pending&&!currentGeneration())throw Error(t("组件已变化，较新内容已保留。"))
      // Legacy component results still honor explicit creation after the generic
      // conversation loop has completed; they never bypass capability planning.
      if(!inlineTarget&&!pending&&result.kind==='component'&&!result.targetBlockId&&noteComponentRequest(prompt)){
        const reference=captured.cursor?editor.getBlock(captured.cursor):editor.getTextCursorPosition().block
        pending=editor.insertBlocks([{type:'research',props:{payload:JSON.stringify({...result.node,id:'note-component-'+requestId})}}],reference||editor.getTextCursorPosition().block,'after')[0].id
      }
      let completedBlock='',inlineCompletion:undefined|{partial:boolean;summary:string;kind:string;error?:string}
      if(result.kind==='component'&&result.targetBlockId){
        const current=editor.getBlock(result.targetBlockId)
        if(context.scope!=='selection'||!context.components.some(item=>item.blockId===result.targetBlockId&&item.type==='research'))throw Error(t("组件不在当前引用范围内，请重新选择。"))
        if(!current||current.props.payload!==targetPayloads.get(result.targetBlockId))throw Error(t("组件已变化，请重新选择后修改，较新内容已保留。"))
        const original=JSON.parse(current.props.payload)
        if(pending&&editor.getBlock(pending))editor.removeBlocks([pending])
        const updated={...original,...result.node,id:original.id.startsWith('note-component-')?original.id:'note-component-'+crypto.randomUUID(),noteSize:original.noteSize};delete updated.noteReply;delete updated.excerpt
        if(inlineTarget)proposals.run(()=>editor.updateBlock(current.id,{props:{payload:JSON.stringify(updated)}}));else editor.updateBlock(current.id,{props:{payload:JSON.stringify(updated)}})
        completedBlock=current.id;publishTask(requestId,inlineTarget?'ready':'accepted',{result});changed();requestAnimationFrame(()=>locate(current.id))
        if(inlineTarget)inlineCompletion={partial:false,summary:'',kind:'component'}
      }else if(inlineTarget){
        if(result.kind==='conversation'){
          const proposal=proposals.list().find(value=>value.id===requestId),state=proposal&&inlineProposalState(proposal),changes=state?.changes.length||0
          const external=result.capabilityReceipts?.some(receipt=>receipt.status==='succeeded'&&(receipt.path||receipt.effect&&('path'in receipt.effect||'kind'in receipt.effect&&(receipt.effect.kind==='challenge'||receipt.effect.kind==='data'))||receipt.capability?.startsWith('ui.')))
          const partial=!!result.requiresReply||!!state?.failed.length||!!result.capabilityReceipts?.some(receipt=>receipt.status!=='succeeded')
          const summary=state?.failed.length?state.summary:changes?(partial?'本次操作未完成，内容已保留':''):external?result.capabilitySummary?.split('\n').slice(0,2).join('；')||'':''
          inlineCompletion={partial,summary,kind:result.kind,error:state?.failed.length?state.error:!changes&&!external?result.capabilitySummary||'尚未生成可插入内容，原需求已保留，可重试。':undefined}
          publishTask(requestId,'replied',{result})
        }else{
          const blocks=result.kind==='component'?[{type:'research',props:{payload:JSON.stringify({...result.node,id:'note-component-'+requestId})}}]:editor.tryParseMarkdownToBlocks(result.markdown)
          const textFallback=result.kind==='text'&&'textFallback'in result&&result.textFallback===true
          let before:{blockId:string;identity:string}|undefined
          if(result.kind==='text'&&result.inlineOrder){
            const receipts=result.capabilityReceipts?.filter(receipt=>receipt.capability==='notes.components.create'&&receipt.status==='succeeded')||[]
            if(receipts.length){
              const proposal=proposals.list().find(value=>value.id===requestId),contains=(block:any,id:string):boolean=>!!block&&(block.id===id||block.children?.some((child:any)=>contains(child,id)))
              const owned=receipts.map(receipt=>{
                const effect=receipt.effect,blockId=effect&&'blockId'in effect?effect.blockId:undefined,position=inlineCreations.current.get(blockId||'')
                const change=position&&proposal?.changes.find(change=>contains(change.after,position.blockId))
                if(!position||position.blockId!==blockId||!effect||!['applied','saved'].includes(effect.state)||noteInlineBlockIdentity(editor,position.blockId)!==position.identity||!change||!proposals.canUndoBlock(requestId,change.id)||unfinishedInlineComponent(editor.getBlock(position.blockId)))throw Error(t('本次组件已变化，原需求已保留，请重新生成正文。'))
                return position
              })
              if(result.inlineOrder==='before-components'){
                before=noteResearchBlocks(editor.document).map(block=>owned.find(position=>position.blockId===block.id)).find(Boolean)
                if(!before)throw Error(t('本次组件位置已变化，原需求已保留。'))
              }
            }
          }
          if(textFallback&&blocks.length&&proposals.active()===requestId){
            // Only this request's unchanged failed creations may disappear.
            // Receipt IDs differ across the Main bridge; block identity and the
            // proposal journal, never a model call ID, establish ownership.
            const proposal=proposals.list().find(value=>value.id===requestId)
            const failed=new Set(result.capabilityReceipts?.flatMap(receipt=>{
              const effect=receipt.effect,blockId=effect&&'blockId'in effect?effect.blockId:undefined
              return receipt.capability==='notes.components.create'&&['failed','unavailable'].includes(receipt.status)&&effect?.state==='placeholder'&&typeof blockId==='string'&&(!receipt.blockId||receipt.blockId===blockId)?[blockId]:[]
            })||[])
            const removable=proposal?.changes.filter(change=>{
              const position=inlineCreations.current.get(change.id),block=editor.getBlock(change.id),node=inlineComponentNode(block)
              return change.before===null&&change.after?.type==='research'&&block?.type==='research'&&failed.has(change.id)&&position?.blockId===change.id&&noteInlineBlockIdentity(editor,change.id)===position.identity&&node.noteDraft==='smart'&&!node.containerSpec&&node.generationStatus==='failed'&&!inlineComponents.isGenerating(change.id)&&proposals.canUndoBlock(requestId,change.id)
            }).map(change=>change.id)||[]
            if(removable.length)proposals.run(()=>editor.removeBlocks(removable))
          }
          const inserted=proposals.run(()=>insertNoteInlineBlocks(editor,inlineTarget,client.current,blocks,true,before))
          if(result.kind==='component')completedBlock=inserted[0]?.id||''
          const proposal=textFallback?proposals.list().find(value=>value.id===requestId):undefined,state=proposal&&inlineProposalState(proposal)
          const failure=textFallback&&result.capabilityReceipts?.find(receipt=>receipt.capability==='notes.components.create'&&['failed','unavailable'].includes(receipt.status))
          const completed=textFallback&&result.capabilityReceipts?.some(receipt=>{const effect=receipt.effect,blockId=effect&&'blockId'in effect?effect.blockId:undefined;return receipt.capability==='notes.components.create'&&receipt.status==='succeeded'&&!!blockId&&state?.shown.some(change=>change.id===blockId&&change.after?.type==='research'&&editor.getBlock(blockId)?.type==='research')})
          // A safely resolved prose-only fallback follows normal review. Keep
          // failed receipts in the result/history; unresolved or mixed work stays partial.
          const fallbackError=failure&&(state?.failed.length||completed)?(proposal?.error||(state?.failed.length?state.error:failure.message?.slice(0,1000))||t('组件未生成，已保留文字结果')):undefined
          publishTask(requestId,'ready',{result});inlineCompletion={partial:false,summary:textFallback?'已生成文字'+(failure||state?.failed.length?'，'+(completed?'部分组件':'组件')+'未生成':'')+(state?.failed.length?'；原组件内容已保留':''):'',kind:textFallback?'text-fallback':result.kind,error:fallbackError};changed()
        }
      }else if(draftBlockId&&result.kind==='conversation'){
        const previous=JSON.parse(editor.getBlock(pending).props.payload);editor.updateBlock(pending,{props:{payload:JSON.stringify({...previous,generationStatus:'draft',generationDetail:result.markdown})}});publishTask(requestId,'replied',{result})
      }else if (pending && result.kind === 'component' && editor.getBlock(pending)) {
        publishTask(requestId,'accepted',{result}); const previous=JSON.parse(editor.getBlock(pending).props.payload); editor.updateBlock(pending, { props: { payload: JSON.stringify({...result.node,id:previous.id,noteLibrary:true,noteSize:previous.noteSize}) } }); completedBlock=pending;changed(); requestAnimationFrame(() => locate(pending))
      } else {
        if(draftBlockId)throw Error(t("组件生成未返回有效内容，请重试。"))
        if (pending && editor.getBlock(pending)) editor.removeBlocks([pending])
        if(result.kind==='conversation') {
          publishTask(requestId,'replied',{result})
          const range=editor.getExtension(NoteAiSelection)?.currentRange()
          if(captured.text&&range)pinnedSelection.current={...captured,...range,text:editor._tiptapEditor.state.doc.textBetween(range.from,range.to,'\n'),fingerprint:JSON.stringify(editor.document)}
          else if(captured.text)clearSelection()
        }
        else { publishTask(requestId,'ready',{result}); setPreview({requestId,...noteSuggestionPreview(result, { ...captured, fingerprint, cursor: captured.cursor || editor.getTextCursorPosition().block.id })}) }
      }
      if(completedBlock&&result.kind==='component'&&result.sourceResult?.status==='verified'){
        // Persist the generated block before binding the same research refresh engine to it.
        const payload=editor.getBlock(completedBlock)?.props.payload
        save();await saveQueue.current
        if(!disposed.current&&epoch.current===attempt&&editor.getBlock(completedBlock)?.props.payload===payload){
          const node=JSON.parse(payload)
          try{
            const binding=await props.bridge.request('component-data',{sessionId:props.sessionId,action:'bind-generated',nodeId:node.id,recipe:result.sourceResult.recipe,initialSpec:node.containerSpec})
            if(!disposed.current&&epoch.current===attempt&&editor.getBlock(completedBlock)?.props.payload===payload){const update=()=>updateSystemComponent(completedBlock,{...node,noteDataBound:true,sourceText:binding.enabled===false?t("已绑定数据源 · 手动刷新"):t("已绑定数据源 · 可见时自动刷新")});if(inlineTarget)proposals.run(update);else update()}
          }catch(error){
            if(!disposed.current&&epoch.current===attempt&&editor.getBlock(completedBlock)?.props.payload===payload){const update=()=>updateSystemComponent(completedBlock,{...node,noteDataBound:false,sourceText:t("已验证数据来源 · 当前为快照，自动刷新未启用")});if(inlineTarget)proposals.run(update);else update();setError((error as Error).message)}
          }
        }
      }
      if(inlineTarget&&inlineCompletion&&!disposed.current&&epoch.current===attempt&&nativeCurrent()&&editorActive()&&inlineRequest.current?.requestId===requestId){const value=finishInlineProposal(requestId,inlineCompletion.partial,inlineCompletion.summary,inlineCompletion.kind,inlineCompletion.error);if(value)showProposal(value);else setInlineDraft(draft=>draft?{...draft,review:undefined,error:inlineCompletion!.error||'尚未生成可插入内容，原需求已保留，可重试。'}:draft);if(value&&!inlineProposalState(value).failed.length)inlinePrompt.current='';changed()}
      commitNativeDraft(admission)
    } catch (e) {
      if (!disposed.current && epoch.current === attempt) {
        const message = (e as Error).name === 'AbortError' ? t("生成已停止，可调整需求后重试。") : noteGenerationError(e)
        if (pending && currentGeneration()) editor.updateBlock(pending, { props: { payload: JSON.stringify({...JSON.parse(editor.getBlock(pending).props.payload),generationStatus:'failed',generationError:message}) } })
        rollbackNativeDraft(admission); publishTask(requestId,'failed',{error:message}); if(inlineTarget){const value=finishInlineProposal(requestId,true,'',undefined,message);if(value){showProposal(value);changed()}else setInlineDraft(draft=>draft?{...draft,review:undefined,error:message}:draft)}else setError(message)
      }
    } finally { if (!disposed.current && epoch.current === attempt) {setWriting(false); request.current = '';inlineRequest.current=undefined; publishComposer({running:false}); generatingBlock.current = '';activeGeneration.current=undefined;challengeScheduleSync.current?.() } }
  }
  const stop = () => { for(const blockId of capabilityCards.current.values())inlineComponents.stop(blockId);capabilityReservations.current.clear();inlineCreations.current.clear();inlineRequest.current=undefined;externalCapabilities.current?.revoke();epoch.current++; const id = request.current; request.current = '';setWriting(false); publishComposer({running:false}); if (id) { rollbackNativeDraft(lastRequest.current?.admission); publishTask(id,'stopped') }; if (id) void props.bridge.request('stop', { sessionId: props.sessionId, requestId: id }); if (generatingBlock.current && currentGeneration()) editor.updateBlock(generatingBlock.current, { props: { payload: JSON.stringify({...JSON.parse(editor.getBlock(generatingBlock.current).props.payload),generationStatus:'interrupted',generationError:t("生成已停止，可调整需求后重试。")}) } }); generatingBlock.current = '';activeGeneration.current=undefined; setError(t("生成已停止，笔记内容已保留。"));challengeScheduleSync.current?.() }
  const stopInlineAi=()=>{const id=inlineRequest.current?.requestId;if(id){stop();const value=finishInlineProposal(id,true);if(value){showProposal(value);changed()}}setError('')}
  const cancelInlineAi=()=>{const draft=inlineDraftRef.current;if(draft)inlinePrompt.current=draft.review&&!draft.error?'':draft.prompt;if(inlineRequest.current)stopInlineAi();setInlineDraft(undefined);setError('');if(editorActive()&&draft&&editor.getBlock(draft.anchor.blockId)){editor.focus();editor.setTextCursorPosition(draft.anchor.blockId,'start')}}
  const submitInlineAi=()=>{const draft=inlineDraftRef.current;if(!draft||draft.review||request.current||settlingProposal.current||externalCapabilities.current?.pending())return;inlinePrompt.current=draft.prompt;try{noteInlineAnchorBlock(editor,draft.anchor,client.current);void generate(draft.prompt,[],undefined,undefined,undefined,draft.anchor)}catch(error){setInlineDraft(value=>value?{...value,error:(error as Error).message}:value)}}
  const inlineCommands=useRef({cancel:cancelInlineAi});inlineCommands.current={cancel:cancelInlineAi}
  useEffect(()=>{if(props.active===false)inlineCommands.current.cancel()},[props.active])
  const inlineComponents=useInlineComponentGeneration({sessionId:props.sessionId,bridge:props.bridge,editor:aiComponentEditor,current:()=>!disposed.current&&!props.recovery&&editorActive(),persist:persistConfirmed,changed,update:(id,patch)=>componentOwned(id)?proposals.run(()=>updateSystemComponent(id,patch)):updateSystemComponent(id,patch)})
  const settleInlineProposal=(undo:boolean,boundId?:string,passive=false)=>{
   const run=async()=>{
    const id=boundId||inlineDraftRef.current?.review?.id,value=id&&proposals.list().find(item=>item.id===id)
    if(!value||!editorActive()||!editor.isEditable||!nativeCurrent()||props.recovery||request.current||settlingProposal.current)return
    const state=inlineProposalState(value)
    if(passive&&(value.state!=='ready'||!value.resultKind||value.error||state.failed.length||!state.shown.some(change=>!!editor.getBlock(change.id))||externalCapabilities.current?.pending()))return
    settlingProposal.current=value.id;proposals.setError(value.id,'');if(!passive)showProposal({...value,error:''},true);else setInlineDraft(draft=>draft?.review?.id===value.id?{...draft,review:{...draft.review,busy:true}}:draft);let restore=value
    const persist=async()=>{try{await persistConfirmed()}catch(error){if(!passive||disposed.current||!editorActive()||!nativeCurrent())throw error;await persistConfirmed()}}
    try{
      if(undo){const result=proposals.undo(value.id);changed();await persist();if(!result.complete)return}
      restore=proposals.list().find(item=>item.id===value.id)||value;proposals.confirm(value.id);changed();await persist()
      if(reviewedProposal.current===value.id){if(inlineDraftRef.current?.review?.id===value.id)inlinePrompt.current=undo?value.prompt:'';reviewedProposal.current=undefined}
      setInlineDraft(draft=>draft?.review?.id===value.id?undefined:draft)
      if(value.resultKind==='text'||value.resultKind==='text-fallback'||value.resultKind==='component')publishTask(value.id,undo?'discarded':'accepted')
    }catch(error){if(!proposals.list().some(item=>item.id===value.id))proposals.restore(restore);proposals.setError(value.id,(error as Error).message);changed();setInlineDraft(draft=>draft?.review?.id===value.id?{...draft,error:(error as Error).message}:draft)}finally{settlingProposal.current='';setInlineDraft(draft=>draft?.review?{...draft,review:{...draft.review,busy:proposals.list().find(item=>item.id===draft.review!.id)?.state==='running',canUndo:editor.isEditable&&proposals.canUndo(draft.review.id)}}:draft)}
   }
   const result=run();settlementTask.current=result;return result
  }
  reviewActions.current={show:showProposal,confirm:id=>{automaticSettlements.current=automaticSettlements.current.catch(()=>{}).then(async()=>{await settlementTask.current.catch(()=>{});if(!disposed.current)await settleInlineProposal(false,id,true)}).catch(error=>{if(!disposed.current&&editorActive())setError((error as Error).message)})}}
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key!=='Escape'||event.defaultPrevented||event.isComposing||request.current||!inlineDraftRef.current?.review||!scroll.current?.contains(event.target as Node))return;event.preventDefault();setInlineDraft(undefined)};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape)},[])
  const apply = async (replace: boolean) => {
    if (!preview||!nativeCurrent()) return
    if(props.guide?.native&&JSON.stringify(editor.document)!==preview.fingerprint){setError(t('笔记已变化，请重新生成建议，较新内容已保留。'));return}
    editor.focus()
    const blocks = preview.result.kind === 'component' ? [{ type: 'research', props: { payload: JSON.stringify(preview.result.node) } }] : editor.tryParseMarkdownToBlocks(preview.result.markdown)
    const range=editor.getExtension(NoteAiSelection)?.currentRange()
    if(replace&&range&&!noteRangeHasOnlyText(editor._tiptapEditor.state.doc,range)){setError(t("请只选择正文文字进行改写。"));return}
    if(replace&&preview.result.kind==='text'&&range)replaceNoteSelection(editor,range,blocks,preview.result.markdown)
    else { const reference = editor.getBlock(preview.cursor) || editor.getTextCursorPosition().block; editor.insertBlocks(blocks, reference, 'after') }
    setError('')
    publishTask(preview.requestId,'accepted'); setPreview(undefined); clearSelection(); changed()
  }
  const discardPreview=()=>{if(preview)publishTask(preview.requestId,'discarded');setPreview(undefined);clearSelection()}
  const regenerate=()=>{const previous=lastRequest.current;if(!previous||request.current)return;if(preview)publishTask(preview.requestId,'discarded');const range=editor.getExtension(NoteAiSelection)?.currentRange();void generate(previous.prompt,previous.images,previous.admission,{...previous,captured:{...previous.captured,...(range||{from:0,to:0}),text:range?editor._tiptapEditor.state.doc.textBetween(range.from,range.to,'\n'):''}})}
  const commands = useRef({generate,stop,exportNote:(_format?:string)=>{}});commands.current={generate,stop,exportNote:(format?:string)=>{void exportNote(format)}}
  useEffect(()=>{
    if(props.guide&&!props.guide.native)return
    const progress=(event:Event)=>{
      const value=(event as CustomEvent).detail
      if(value?.sessionId!==props.sessionId||value.requestId!==request.current)return
      publishTask(value.requestId,'generating',{
        ...value.stage===undefined?{}:{stage:value.stage},
        ...value.reasoning===undefined?{}:{reasoning:value.reasoning},
        ...value.outputChars===undefined?{}:{outputChars:value.outputChars},
        ...value.capabilityProgress===undefined?{}:{capabilityProgress:value.capabilityProgress},
        ...value.seq===undefined?{}:{seq:value.seq,startedAt:value.startedAt}
      })
      const active=activeGeneration.current,task=value.componentTask
      if(!active||active.requestId!==value.requestId||!task||!currentGeneration(active))return
      const node=JSON.parse(active.expected),next={...node,generationTaskId:task.generationTaskId||node.generationTaskId,generationChildSessionId:task.childSessionId||node.generationChildSessionId,generationStartedAt:task.generationStartedAt||node.generationStartedAt,generationEvents:task.generationEvents||node.generationEvents,generationPartialText:task.generationPartialText??node.generationPartialText,generationStatus:'running'}
      updateSystemComponent(active.blockId,next);active.expected=JSON.stringify(next)
    }
    document.addEventListener('sherlock:notes-generation-progress',progress)
    const submit=(event:Event)=>{const detail=(event as CustomEvent).detail;if(!nativeCurrent()||!editorActive()||detail?.sessionId!==props.sessionId||props.recovery||request.current||externalCapabilities.current?.pending()||(!detail.prompt?.trim()&&!detail.images?.length))return;document.dispatchEvent(new CustomEvent('sherlock:notes-submit-accepted',{detail:{sessionId:props.sessionId,submissionId:detail.submissionId}}));void commands.current.generate(detail.prompt,detail.images,detail.admission)}
    const exportRequested=(event:Event)=>{if(editorActive()&&(event as CustomEvent).detail?.sessionId===props.sessionId)commands.current.exportNote((event as CustomEvent).detail.format)}
    document.addEventListener('sherlock:notes-export',exportRequested)
    const cancel=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.sessionId===props.sessionId&&(detail.requestId===undefined||!!request.current&&detail.requestId===request.current))commands.current.stop()}
    const sessionError=(event:Event)=>{if((event as CustomEvent).detail?.sessionId===props.sessionId)setError((event as CustomEvent).detail.message)}
    const state=(event:Event)=>{if((event as CustomEvent).detail?.sessionId===props.sessionId)publishComposer({})}
    document.addEventListener('sherlock:notes-submit',submit);document.addEventListener('sherlock:notes-stop',cancel);document.addEventListener('sherlock:notes-session-error',sessionError);document.addEventListener('sherlock:notes-composer-request-state',state);publishComposer({running:false})
    return()=>{document.removeEventListener('sherlock:notes-generation-progress',progress);document.removeEventListener('sherlock:notes-export',exportRequested);document.removeEventListener('sherlock:notes-submit',submit);document.removeEventListener('sherlock:notes-stop',cancel);document.removeEventListener('sherlock:notes-session-error',sessionError);document.removeEventListener('sherlock:notes-composer-request-state',state);publishComposer({ready:false,running:false})}
  },[props.sessionId,props.recovery,props.active])
  const exportNote = async (format='md') => {
    if(exportPending.current||externalCapabilities.current?.pending()||disposed.current)return
    exportPending.current=true;setExporting(true);setError('')
    try{await exportNoteWithSnapshots({snapshot,bridge:props.bridge,sessionId:props.sessionId,format,locale:document.documentElement.dataset.odysseyLocale,current:()=>!disposed.current})}
    catch(e){if(!disposed.current)setError((e as Error).message)}
    finally{exportPending.current=false;if(!disposed.current)setExporting(false)}
  }
  const ctx = useMemo(() => ({ bridge: props.bridge, sessionId: props.sessionId, dark: props.dark, navigate: props.navigate, editor,persistComponentActions:()=>persistConfirmed(),commitHtmlInteraction:htmlInteractions.commit,importing:importing.current,isGeneratingComponent:(id:string)=>inlineComponents.isGenerating(id)||generatingBlock.current===id&&!!currentGeneration(),generateComponent:inlineComponents.start,stopGeneration:(id:string)=>{const local=inlineComponents.stop(id);if(local.ok)return local;if(generatingBlock.current!==id)return {ok:false};commands.current.stop();return {ok:true}} }), [props.bridge, props.sessionId, props.dark, props.navigate, editor,writing,inlineComponents.version])
  const slashItems = useMemo(()=>async (query:string)=>{
    const order=['paragraph','heading','heading_2','heading_3','heading_4','numbered_list','bullet_list','check_list','code_block','quote','divider','toggle_list']
    const pick=async(kind:string)=>{
      const reference=editor.getTextCursorPosition().block
      try{const result=await props.bridge.request('file-pick',{sessionId:props.sessionId,kind,locale:document.documentElement.dataset.odysseyLocale});if(disposed.current||!editor.isEditable||!editor.getBlock(reference.id)||!result.files?.length)return
        const current=editor.getBlock(reference.id);await importFiles(result.files,current,current.type==='paragraph'&&!noteText(current.content).trim()?'before':'after','inline');editor.focus()
      }catch(e){if(!disposed.current)setError((e as Error).message)}
    }
    const draft=(kind:'smart'|'link')=>{if(!editor.isEditable)return;const reference=editor.getTextCursorPosition().block
      const node={id:'note-component-'+crypto.randomUUID(),kind:'generated-container',title:kind==='smart'?t("智能组件"):t("添加链接"),noteDraft:kind,containerPrompt:'',generationStatus:'draft'}
      const created=editor.insertBlocks([{type:'research',props:{payload:JSON.stringify(node)}}],reference,reference.type==='paragraph'&&!noteText(reference.content).trim()?'before':'after');requestAnimationFrame(()=>{const input=scroll.current?.querySelector<HTMLTextAreaElement>('[data-id="'+CSS.escape(created[0].id)+'"] textarea');input?.closest('.en-research')?.scrollIntoView({block:'nearest'});input?.focus({preventScroll:true})})
    }
    const creation=[{key:'smart_component',iconKey:'sparkles',title:t("智能组件"),group:t("插入"),aliases:['智能','生成','组件','smart','ai'],onItemClick:()=>draft('smart')},{key:'link_component',iconKey:'link',title:t("链接"),group:t("插入"),aliases:['链接','网页','link','url'],onItemClick:()=>draft('link')}]
    const defaults=getDefaultReactSlashMenuItems(editor).filter((item:any)=>item.key!=='emoji').map((item:any)=>['image','video','audio','file'].includes(item.key)?{...item,onItemClick:()=>pick(item.key)}:item).sort((a:any,b:any)=>(order.indexOf(a.key)<0?100:order.indexOf(a.key))-(order.indexOf(b.key)<0?100:order.indexOf(b.key)))
    const library:any={key:'library',title:t("组件库"),group:t("插入"),aliases:['组件','研究','library'],onItemClick:()=>{}}
    // Load on each opening/query so research-side renames and additions stay current.
    try{
      const items=await props.bridge.request('library-list',{sessionId:props.sessionId})
      library.children=items.map((item:any)=>({key:item.id,title:item.id.startsWith('builtin-')?t(item.title):item.title,group:t(item.group),iconKey:item.icon,onItemClick:async()=>{
        const reference=editor.getTextCursorPosition().block
        try{
          const node=await props.bridge.request('library-read',{sessionId:props.sessionId,id:item.id})
          if(disposed.current||!editor.isEditable||!editor.getBlock(reference.id))return
          const current=editor.getBlock(reference.id),block={type:'research',props:{payload:JSON.stringify(node)}}
          const undo=editor._tiptapEditor.state.plugins.find((plugin:any)=>plugin.key.startsWith('y-undo'))?.getState(editor._tiptapEditor.state)?.undoManager
          undo?.stopCapturing()
          editor.insertBlocks([block],reference.id,current.type==='paragraph'&&!noteText(current.content).trim()?'before':'after')
          undo?.stopCapturing();editor.focus()
        }catch(e){if(!disposed.current)setError((e as Error).message)}
      }}))
    }catch(e){library.children=[{key:'library_retry',title:t("组件库暂不可用，重新打开重试"),group:t("组件库"),onItemClick:()=>setError((e as Error).message)}]}
    const fileIndex=defaults.findIndex((item:any)=>item.key==='file')
    const choices=fileIndex<0?[...defaults,...creation]:[...defaults.slice(0,fileIndex+1),...creation,...defaults.slice(fileIndex+1)]
    return filterSuggestionItems([...choices,library],query)
  }, [editor,props.bridge,props.sessionId,document.documentElement.dataset.odysseyLocale])
  const [challengeMarginAvailable,setChallengeMarginAvailable]=useState(false)
  const challenge=useNoteChallenge({editor,doc,bridge:props.bridge,sessionId:props.sessionId,title,scroll,busy:writing||externalBusy,isBusy:()=>!!request.current||!!externalCapabilities.current?.pending(),recovery:!!props.recovery,active:props.active,activityId:props.activityId,replacementSettleMs:props.guide?0:undefined,persist:changed,persistConfirmed})
  challengeController.current=challenge
  challengeScheduleSync.current=challenge.syncScheduling
  // The guide is an explicit prop, never a global event channel that can control a user's editor.
  useEffect(()=>{
    if(!props.guide)return
    let live=true
    const assert=()=>{if(!live||disposed.current||!editorActive())throw new DOMException('演示编辑器已关闭。','AbortError')}
    const api:NotesGuideEditorApi={
      snapshot:()=>{assert();return structuredClone(snapshot())},
      reviewReady:async()=>{assert();const blocks=challengeDocumentBlocks(editor.document),level=challenge.getConfiguration().level
        const restored=await restoreChallengeReviewState(doc.getMap('note-challenge-results').get('state'),titleRef.current,blocks,level)
        return restored.covered.size===blocks.length&&[...restored.covered.values()].every(value=>value.complete)
      },
      // Capture before unmount: queued persistence must not read a destroyed Y.Doc.
      flush:()=>{if(!live||disposed.current)throw new DOMException('演示编辑器已关闭。','AbortError');clearTimeout(saveTimer.current);const content=structuredClone(snapshot()),fingerprint=JSON.stringify(content)
        const pending=saveQueue.current.then(async()=>{
          if(lastWritten.current===fingerprint)return
          const result=await props.bridge.request('save',{sessionId:props.sessionId,revision:revision.current,content,clientId:client.current})
          if(result.status!=='saved')throw Error('笔记尚未保存，较新内容已保留为草稿。')
          revision.current=result.saved.revision;lastWritten.current=fingerprint
        })
        saveQueue.current=pending.catch(()=>{});return pending
      },
      setDocument:(nextTitle,blocks)=>{assert();titleRef.current=nextTitle;setTitle(nextTitle);editor.replaceBlocks(editor.document,blocks);changed()},
      appendBlock:block=>{assert();editor.insertBlocks([block],editor.document.at(-1),'after')},
      updateText:(blockId,text)=>{assert();if(!editor.getBlock(blockId))throw Error('演示段落已变化。');editor.updateBlock(blockId,{content:text})},
      prepareNative:()=>{assert();if(!props.guide?.native||!nativeCurrent())throw new DOMException('演示编辑器已关闭。','AbortError');clearSelection();const last=editor.document.at(-1);if(last)editor.setTextCursorPosition(last.id,'end');const state=editor._tiptapEditor.state,doc=state.doc,from=state.selection.from,to=state.selection.to;return()=>{assert();const current=editor._tiptapEditor.state;return!!props.guide?.native&&nativeCurrent()&&editor.document.at(-1)?.id===last?.id&&current.doc===doc&&current.selection.empty&&current.selection.$from.parentOffset===current.selection.$from.parent.content.size&&current.selection.from===from&&current.selection.to===to}},
      typeSlash:()=>{
        assert();if(!props.guide?.native||!nativeCurrent())throw new DOMException('演示编辑器已关闭。','AbortError')
        const last=editor.document.at(-1),view=editor._tiptapEditor.view,{selection}=view.state
        if(!editor.isEditable||view.composing||last?.type!=='paragraph'||noteText(last.content)!==''||last.children?.length||editor.getTextCursorPosition().block.id!==last.id||!selection.empty||selection.$from.parent.type.name!=='paragraph'||selection.$from.parent.content.size!==0||selection.$from.parentOffset!==0)throw Error('演示插入行已变化。')
        // Use the same PM text-input hook as a physical slash. Plain block
        // updates cannot activate the original SuggestionMenu extension.
        if(!view.someProp('handleTextInput',(handler:any)=>handler(view,selection.from,selection.to,'/')))throw Error('斜杠命令未启动，请重新播放。')
      },
      beginParagraphSelection:(blockId,expectedText)=>{
        const current=()=>{assert();if(!props.guide?.native||!nativeCurrent())throw new DOMException('演示编辑器已关闭。','AbortError')}
        current();const block=editor.getBlock(blockId),element=scroll.current?.querySelector<HTMLElement>('[data-id="'+CSS.escape(blockId)+'"] .bn-inline-content')
        if(!block||block.type!=='paragraph'||!expectedText.trim()||noteText(block.content)!==expectedText||!element)throw Error('演示段落已变化。')
        return beginNoteGuideSelection(editor,element,expectedText,current)
      },
      selectParagraph:(blockId,expectedText)=>{
        assert();if(!props.guide?.native||!nativeCurrent())throw new DOMException('演示编辑器已关闭。','AbortError')
        const block=editor.getBlock(blockId)
        if(!block||block.type!=='paragraph'||!expectedText.trim()||noteText(block.content)!==expectedText)throw Error('演示段落已变化。')
        editor.focus();editor.setTextCursorPosition(blockId,'start')
        const from=editor._tiptapEditor.state.selection.from,to=from+expectedText.length
        if(!noteRangeHasOnlyText(editor._tiptapEditor.state.doc,{from,to})||editor._tiptapEditor.state.doc.textBetween(from,to,'\n')!==expectedText)throw Error('演示段落已变化。')
        editor._tiptapEditor.commands.setTextSelection({from,to})
      }
    }
    props.guide.ready(api)
    return()=>{live=false;props.guide?.dispose?.(api);doc.destroy()}
  },[editor,props.guide])
  const editedDate=editedAt?noteEditDate(editedAt,document.documentElement.dataset.odysseyLocale):undefined
  const slashMenu = useMemo(() => (menuProps:any) => <NativeSlashMenu {...menuProps} bridge={props.bridge} sessionId={props.sessionId} dark={props.dark} />,[props.bridge,props.sessionId,props.dark])
  const suggestion=<>{exporting?<div className="en-ai-loading" role="status" aria-live="polite"><span className="en-ai-spinner" aria-hidden="true"/><span>{t("准备组件快照与导出文件…")}</span></div>:null}{writing&&!inlineDraft ? <NoteAiProcessing stop={stop}/> : null}{error ? <div className="en-error" role="alert"><span>{t(error)}</span>{status === '保存冲突' ? <button onClick={async () => { try { await props.bridge.draft({ sessionId: props.sessionId, clientId: client.current, revision: revision.current, content: snapshot() }); props.onReload() } catch (e) { setError((e as Error).message) } }}>{t("重新读取并对比")}</button> : null}<button onClick={() => setError('')} aria-label={t("关闭提示")}>×</button></div> : null}
      {preview ? <SuggestionPanel header={<><strong>{preview.result.kind === 'component' ? t("创建的研究组件") : t("内容预览")}</strong><button aria-label={t("放弃建议")} onClick={discardPreview}>×</button></>} footer={<>{preview.selectedText && preview.result.kind === 'text' && editor.getExtension(NoteAiSelection)?.currentRange() && noteRangeHasOnlyText(editor._tiptapEditor.state.doc,editor.getExtension(NoteAiSelection).currentRange()) ? <button onClick={() => apply(true)}>{t("替换所选")}</button> : null}<button onClick={() => apply(false)}>{t("添加至正文")}</button><button onClick={regenerate}>{t("重新撰写")}</button><button onClick={discardPreview}>{t("放弃")}</button></>}>
        {preview.result.capabilitySummary||preview.result.capabilityReceipts?.length?<div className="en-capability-receipts" role="status">{preview.result.capabilityReceipts?.length?capabilityReceiptText(preview.result.capabilityReceipts,document.documentElement.dataset.odysseyLocale):preview.result.capabilitySummary}</div>:null}
        {preview.result.kind === 'text' ? <MarkdownPreview markdown={preview.result.markdown} dark={props.dark} /> : <ResearchBlock block={{ id: 'preview', props: { payload: JSON.stringify(preview.result.node) } }} />}
      </SuggestionPanel> : null}</>
  return <Context.Provider value={ctx}><div className="en-body" data-note-source-session={props.sessionId} data-note-source-revision={revision.current}>
    <NotesOutline headings={outline} active={active} onLocate={locate} />
    {props.active!==false?<ChallengeToolbar controller={challenge} sessionId={props.sessionId} dark={props.dark} marginAvailable={challengeMarginAvailable} disabled={!!props.recovery}/>:null}
    <main className="en-main"><div className="en-document-scroll" data-note-file-drop-owner="" data-file-drag={fileDrag||undefined} ref={scroll} onCompositionStartCapture={startBodyComposition} onCompositionEndCapture={()=>{composing.current=false}} onKeyDownCapture={event=>{const target=event.target as HTMLElement;if(composing.current||props.recovery||request.current||settlingProposal.current||!editorActive()||!target.isContentEditable||target.closest('input,textarea,button,select,[contenteditable="false"]')||!target.closest('.bn-editor'))return;const blockId=noteInlineAiTrigger(editor,event.nativeEvent);if(!blockId)return;event.preventDefault();event.stopPropagation();clearSelection(true);setPreview(undefined);setInlineDraft({anchor:captureNoteInlineAnchor(editor,client.current,blockId),prompt:inlinePrompt.current})}} onDragOverCapture={event=>{if(ownsFiles(event)){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='copy';setFileDrag(true)}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setFileDrag(false)}} onScroll={track} onPasteCapture={paste} onPointerDownCapture={e=>{if(!request.current&&!preview&&!(e.target as HTMLElement).closest('.en-inline-assistant,.en-research')&&(e.target as HTMLElement).closest('.bn-editor,.en-title'))clearSelection()}}>
      <div className="en-document" data-note-document-id={client.current}>
        {props.recovery ? <div className="en-recovery"><strong>{t("发现未保存的本地草稿")}</strong><span>{t("上次编辑内容已保留，可对比后恢复。")}</span><div><button onClick={() => setCompare(true)}>{t("对比草稿")}</button><button disabled={props.recovering} onClick={() => props.onRecovery(true)}>{props.recovering ? t("正在保存…") : t("恢复草稿")}</button><button disabled={props.recovering} onClick={() => props.onRecovery(false)}>{t("保留已保存版本")}</button></div></div> : null}
        <input className="en-title" aria-label={t("笔记标题")} placeholder={t("无标题文档")} value={title} readOnly={!!props.recovery||props.active===false} maxLength={1000} onChange={e => { titleRef.current = e.target.value; setTitle(e.target.value); changed() }} />
        {editedDate?<time className="en-edit-date" dateTime={editedDate.calendar}>{editedDate.label}</time>:null}
        <BlockNoteView key={document.documentElement.dataset.odysseyLocale} editor={editor} editable={!props.recovery&&props.active!==false} theme={props.dark ? 'dark' : 'light'} formattingToolbar={false} sideMenu={false} slashMenu={false} comments={false}>
          <FloatingComposerController/><ManualNoteThreads/>
          <SuggestionMenuController getItems={slashItems} triggerCharacter="/" suggestionMenuComponent={slashMenu} portalElement={document.body} floatingUIOptions={{useFloatingOptions:{strategy:'fixed'},elementProps:{className:'en-note-menu-layer',style:{zIndex:110}}}} />
          <FormattingToolbarController formattingToolbar={() => <NoteFormattingToolbar><BlockTypeSelect items={[{ name: t("正文"), type: 'paragraph', icon: () => <NoteMenuIcon kind="paragraph"/> }, ...[1, 2, 3, 4].map(level => ({ name: t("标题 ") + level, type: 'heading', props: { level }, icon: () => <span>H{level}</span> }))]} /><TextAlignButton textAlignment="left" /><NoteListButtons/><BasicTextStyleButton basicTextStyle="bold" /><BasicTextStyleButton basicTextStyle="italic" /><BasicTextStyleButton basicTextStyle="underline" /><BasicTextStyleButton basicTextStyle="strike" /><CreateLinkButton /><BasicTextStyleButton basicTextStyle="code" /><ColorStyleButton /><AddCommentButton /><AiRewriteButton onRewrite={() => { const range=editor._tiptapEditor.state.selection;const captured={text:editor.getSelectedText(),from:range.from,to:range.to,cursor:editor.getTextCursorPosition().block.id,fingerprint:JSON.stringify(editor.document)};if(!captured.text||!noteRangeHasOnlyText(editor._tiptapEditor.state.doc,captured))return;pinnedSelection.current=captured;setPreview(undefined);setError('');paintSelection(captured);setNativeDraft(t("改写选中文字，保留原意并让表达更清晰。"), true) }}/></NoteFormattingToolbar>} />
          <SideMenuController sideMenu={BlockMenu} floatingUIOptions={{useFloatingOptions:{middleware:[{name:'ework-first-line',fn:({elements,rects,y}:any)=>{const reference=(elements.reference.contextElement||elements.reference) as HTMLElement,inline=reference.querySelector<HTMLElement>('.bn-inline-content'),content=inline||reference.querySelector<HTMLElement>('.bn-block-content')||reference;const base=reference.getBoundingClientRect(),component=reference.querySelector<HTMLElement>('.en-research,.en-note-file');if(component)return{y:y+component.getBoundingClientRect().top-base.top};const box=content.getBoundingClientRect(),line=parseFloat(getComputedStyle(content).lineHeight)||28;return{y:y+box.top-base.top+line/2-rects.floating.height/2}}}]}}} />
        </BlockNoteView>
        {inlineDraft?<NoteInlineAiComposer draft={inlineDraft} editor={editor} scroll={scroll} running={writing&&!!inlineRequest.current} disabled={!!request.current&&!inlineRequest.current||externalBusy||!editor.isEditable||!!props.recovery} onChange={prompt=>{inlinePrompt.current=prompt;setInlineDraft(value=>value?{...value,prompt,error:undefined,reply:undefined}:value)}} onSubmit={submitInlineAi} onConfirm={()=>settleInlineProposal(false)} onUndo={()=>settleInlineProposal(true)} onCancel={cancelInlineAi} onStop={stopInlineAi}/>:null}
      </div>
    </div>
    <NoteReplacementPopover controller={challenge.replacementReviews} scroll={scroll}/>
    <ChallengeComments controller={challenge} editor={editor} scroll={scroll} onMarginAvailableChange={setChallengeMarginAvailable}/>
    {assistantVisible ? createPortal(suggestion,assistantHost) : <div className="en-composer-area">{suggestion}</div>}</main>
    {compare && props.recovery ? <div className="en-dialog-backdrop" onClick={() => setCompare(false)}><section role="dialog" aria-modal="true" aria-label={t("本地草稿对比")} className="en-compare" onClick={e => e.stopPropagation()}><header><strong>{t("本地草稿对比")}</strong><button onClick={() => setCompare(false)}>{t("关闭")}</button></header><div><section><h3>{t("已保存版本")}</h3><pre>{plain(props.initial)}</pre></section><section><h3>{t("本地草稿")}</h3><pre>{plain(props.recovery)}</pre></section></div><footer><button disabled={props.recovering} onClick={() => props.onRecovery(true)}>{props.recovering ? t("正在保存…") : t("恢复草稿")}</button><button onClick={() => setCompare(false)}>{t("稍后处理")}</button></footer></section></div> : null}
  </div></Context.Provider>
}
