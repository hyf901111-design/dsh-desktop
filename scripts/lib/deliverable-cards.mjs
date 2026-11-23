import {fileEditorLabel as editorLabel, fileEditorMode as editorModeForName} from '../../src/shared/file-editor.mjs'
import {deliveryModelSource} from './delivery-file-model.mjs'
import {deliveryIconSource} from './delivery-file-icons.mjs'
import {PPTX_ANNOTATION_DELIVERY_SOURCE} from './pptx-annotation-delivery.mjs'

const fileEditorLabel = editorLabel
const fileEditorMode = editorModeForName

export const DELIVERY_CARDS_CSS = `
.ew-delivery{margin-top:16px;min-width:0;color:var(--dsw-alias-label-primary,#202124);font:400 14px/1.5 var(--odyssey-font-ui,system-ui,sans-serif)}
.ew-delivery-heading{display:flex;align-items:center;gap:6px;margin:0 0 8px;font-size:13px;font-weight:550;color:var(--dsw-alias-label-secondary,#666)}
.ew-delivery-count{font-size:12px;font-weight:400;color:var(--dsw-alias-label-tertiary,#888)}
.ew-delivery-list{display:flex;flex-direction:column;gap:6px;min-width:0}
.ew-delivery-card{position:relative;display:flex;align-items:center;gap:10px;min-width:0;padding:9px 12px;border:1px solid var(--dsw-alias-border-l1,#e5e5e8);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);transition:border-color .12s ease;cursor:pointer}
.ew-delivery-card:hover{border-color:color-mix(in srgb,var(--dsw-alias-border-l1,#e5e5e8) 88%,var(--dsw-alias-label-secondary,#666))}
.ew-delivery-open{display:flex;align-items:center;gap:9px;min-width:0;flex:1;padding:0;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}
.ew-delivery-icon{display:flex;align-items:center;justify-content:center;flex:none;width:32px;height:36px;border-radius:7px;background:transparent;color:#7f8794}
.ew-delivery-icon svg{width:25px;height:25px}
.ew-delivery-icon img{display:block;width:24px;height:26px;object-fit:contain}
.ew-delivery-icon[data-kind=pdf]{color:#ef5962}.ew-delivery-icon[data-kind=presentation]{color:#d87941}.ew-delivery-icon[data-kind=sheet]{color:#38946b}.ew-delivery-icon[data-kind=document]{color:#4a7cca}.ew-delivery-icon[data-kind=web]{color:#5c85b6}.ew-delivery-icon[data-kind=media]{color:#9a71c4}
.ew-delivery-info{min-width:0;flex:1}.ew-delivery-name{display:block;min-width:0;font-size:13px;font-weight:550;line-height:1.5;overflow-wrap:anywhere;white-space:normal}
.ew-delivery-type{display:block;margin-top:1px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#83858b)}
.ew-delivery-options{display:flex;align-items:center;justify-content:center;gap:4px;flex:none;min-height:28px;padding:3px 7px;border:1px solid var(--dsw-alias-border-l1,#e5e5e8);border-radius:7px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-secondary,#666);font:400 11px/20px var(--odyssey-font-ui,system-ui,sans-serif);white-space:nowrap;cursor:pointer}
.ew-delivery-options svg{width:14px;height:14px}.ew-delivery :is(button,summary):focus-visible{outline:2px solid #168fff;outline-offset:3px}
.ew-delivery-menu{z-index:20;position:absolute;top:calc(100% - 7px);right:12px;min-width:178px;max-width:calc(100% - 24px);padding:5px;border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);box-shadow:0 5px 18px #0002}
.ew-delivery-menu button{display:block;width:100%;padding:7px 10px;border:0;border-radius:6px;background:transparent;color:inherit;text-align:left;font:400 13px/20px var(--odyssey-font-ui,system-ui,sans-serif);cursor:pointer}
.ew-delivery-menu button:hover,.ew-delivery-menu button:focus{background:var(--dsw-alias-interactive-bg-hover,#f2f3f5)}.ew-delivery-menu button:disabled{opacity:.45;cursor:default}
.ew-delivery-item{min-width:0}.ew-delivery-status{margin:6px 4px 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#777);overflow-wrap:anywhere}.ew-delivery-status[data-error]{color:var(--dsw-alias-state-error-primary,#c54848)}
.ew-delivery-auxiliary{margin-top:10px}.ew-delivery-auxiliary summary{width:fit-content;max-width:100%;padding:4px 0;color:var(--dsw-alias-label-tertiary,#83858b);font-size:12px;cursor:pointer}.ew-delivery-auxiliary .ew-delivery-list{margin-top:8px}.ew-delivery-auxiliary .ew-delivery-card{padding:8px 10px}.ew-delivery-auxiliary .ew-delivery-icon{width:28px;height:32px}.ew-delivery-auxiliary .ew-delivery-name{font-size:13px}
@container (max-width:480px){.ew-delivery-card{gap:7px;padding:8px 10px}.ew-delivery-open{gap:7px}.ew-delivery-icon{width:28px;height:32px}.ew-delivery-options{padding:3px 6px;font-size:11px}.ew-delivery-name{font-size:13px}}
.ew-delivery{container-type:inline-size}
@media(prefers-reduced-motion:reduce){.ew-delivery-card{transition:none}}
`

function deliveryFileType(path) {
 const extension=path.split(/[\\/]/).pop().split('.').pop().toLowerCase()
 const kind=/^pdf$/.test(extension)?'pdf':/^(pptx?|odp|key)$/.test(extension)?'presentation':/^(xlsx?|csv|tsv|ods|numbers)$/.test(extension)?'sheet':/^(docx?|odt|pages|rtf|txt|md|markdown)$/.test(extension)?'document':/^(html?|svg)$/.test(extension)?'web':/^(png|jpe?g|gif|webp|mp[34]|wav|mov)$/.test(extension)?'media':'file'
 return {extension:extension.length<=16?extension.toUpperCase():'FILE',kind}
}

function DeliveryFileCard({path,sessionId,sessionTitle,openFile,openSystemFile,canOpenSystem,localFiles,collect}) {
 const jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs
 const en=document.documentElement.dataset.odysseyLocale==='en',name=path.split(/[\\/]/).pop(),type=deliveryFileType(path)
 const [menu,setMenu]=react.useState(null),[notice,setNotice]=react.useState(null),[available,setAvailable]=react.useState(undefined),[busy,setBusy]=react.useState(false)
 const [collection,setCollection]=react.useState(null)
 const card=react.useRef(null),options=react.useRef(null),menuRef=react.useRef(null),alive=react.useRef(true),latest=react.useRef(null)
 const gate=localFiles&&sessionId&&/\.pptx$/i.test(path)?getPptxAnnotationDeliveryGate(window.sherlockPptAnnotations):null
 const owner=react.useMemo(()=>({abort:new window.AbortController(),busy:false}),[path,sessionId,gate]);latest.current=owner
 const [annotationState,setAnnotationState]=react.useState(null),annotation=annotationState?.owner===owner?annotationState.value:gate?{kind:'checking',status:'pending'}:null
 const current=()=>alive.current&&latest.current===owner&&!owner.abort.signal.aborted
 const absolute=/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path)
 const canCheck=localFiles&&absolute&&path.length<=512
 const editorMode=canCheck&&sessionId&&typeof window.dshDesktop?.openFileInEditor==='function'?fileEditorMode(name):undefined
 const collectFile=canCheck&&sessionId&&window.dshDesktop?.collectKnowledgeFile
 react.useEffect(()=>{
  setCollection(null)
  if(!collect||!collectFile)return
  let active=true
  collectFile(sessionId,path,false,sessionTitle).then(row=>{if(active&&row)setCollection({path,saved:row.saved})}).catch(()=>{})
  return()=>{active=false}
 },[path,sessionId,sessionTitle,collect,collectFile])
 react.useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 react.useEffect(()=>{
  if(owner.abort.signal.aborted)owner.abort=new window.AbortController()
  const controller=owner.abort,owned=()=>current()&&owner.abort===controller
  let timer,refreshing=false;owner.busy=false;setBusy(false);setMenu(null);setNotice(null)
  const visible=()=>{const rect=card.current?.getBoundingClientRect();return !document.hidden&&rect&&rect.bottom>0&&rect.top<window.innerHeight&&rect.right>0&&rect.left<window.innerWidth}
  const refresh=async()=>{if(!gate||!owned()||refreshing)return;refreshing=true;try{const value=await gate.inspect({sendingSessionId:sessionId,path},{signal:controller.signal});if(!owned())return;setAnnotationState({owner,value});if(value.status==='pending'&&visible())timer=window.setTimeout(()=>{if(visible())void refresh()},1000)}catch{}finally{refreshing=false}}
  const wake=()=>{window.clearTimeout(timer);if(visible())void refresh()}
  const reset=()=>{if(!owned())return;gate?.invalidate();controller.abort();window.clearTimeout(timer);setAnnotationState({owner,value:{kind:'unverified',status:'failed',error:en?'The account or conversation changed. Reopen this conversation.':'账户或会话已变化，请重新打开此对话。'}});setBusy(false);setMenu(null)}
  let observer;if(gate){void refresh();document.addEventListener('visibilitychange',wake);window.addEventListener('sherlock:skill-menu-reset',reset);document.addEventListener('sherlock:notes-reset',reset);window.addEventListener('pagehide',reset);if(window.IntersectionObserver){observer=new window.IntersectionObserver(wake);if(card.current)observer.observe(card.current)}}
  return()=>{controller.abort();window.clearTimeout(timer);observer?.disconnect();document.removeEventListener('visibilitychange',wake);window.removeEventListener('sherlock:skill-menu-reset',reset);document.removeEventListener('sherlock:notes-reset',reset);window.removeEventListener('pagehide',reset)}
 },[owner])
 react.useEffect(()=>{
  let current=true;setAvailable(undefined);setNotice(null)
  if(canCheck&&window.dshDesktop?.researchFilesAvailable)window.dshDesktop.researchFilesAvailable([path]).then(values=>{if(current)setAvailable(values[0]===true)}).catch(()=>{})
  return()=>{current=false}
 },[path,canCheck])
 react.useEffect(()=>{
  if(menu!=='inline')return
  menuRef.current?.querySelector('button:not(:disabled)')?.focus()
  const outside=event=>{if(!card.current?.contains(event.target))setMenu(null)}
  document.addEventListener('pointerdown',outside)
  return()=>document.removeEventListener('pointerdown',outside)
 },[menu])
 const report=(text,error=false)=>{if(current())setNotice({owner,text,error})}
 const dismiss=()=>{setMenu(null);options.current?.focus()}
 const perform=async action=>{
  if(!current()||owner.busy)return
  setMenu(null);setNotice(null);const controller=owner.abort,active=()=>current()&&owner.abort===controller,tell=(...args)=>{if(active())report(...args)};owner.busy=true;setBusy(true)
  try {
   if(action==='save-knowledge'){
    const row=await collectFile(sessionId,path,true,sessionTitle)
    if(active()&&row){setCollection({path,saved:row.saved});tell(en?'Saved to Knowledge Base':'已收藏至知识库')}
    return
   }
   if(action==='absolute'){const copied=window.dshDesktop?.copyFilePath?(await window.dshDesktop.copyFilePath(path))?.ok===true:await _deliveryIcons.writeClipboard(path);if(copied!==true)throw Error(en?'Unable to copy the path. Please try again.':'路径复制失败，请重试。');tell(en?'Path copied':'路径已复制');return}
   if(canCheck&&window.dshDesktop?.researchFilesAvailable){const values=await window.dshDesktop.researchFilesAvailable([path]);if(!active())return;setAvailable(values[0]===true);if(values[0]!==true)throw Error(en?'File moved or not found.':'文件已移动或不存在，请确认后重试。')}
   if(gate&&['open-side','default-app'].includes(action)){const value=await gate.inspect({sendingSessionId:sessionId,path},{signal:controller.signal,force:true});if(!active())return;setAnnotationState({owner,value});if(value.kind!=='ordinary'&&value.status!=='success')throw Error(pptxAnnotationDeliveryText(value,en))}
   if(!active())return
   if(action==='open-side')await openFile(path)
   else if(action==='open-editor'&&editorMode)await window.dshDesktop.openFileInEditor(path,sessionId,editorMode)
   else if(action==='default-app')await openSystemFile(path)
   else if(action==='finder')await window.dshDesktop.showItemInFolder(path)
  }catch(error){tell(error?.message||(en?'Unable to open this file. Please try again.':'文件暂时无法打开，请重试。'),true)}
  finally{if(owner.abort===controller){owner.busy=false;if(current())setBusy(false)}}
 }
 const items=[
  ...(collectFile?[{id:'save-knowledge',label:en?'Save to Knowledge Base':'收藏至知识库'}]:[]),
  {id:'open-side',label:en?'Preview in EWork':'在客户端中预览'},
  ...(editorMode?[{id:'open-editor',label:fileEditorLabel(editorMode,en)}]:[]),
  ...(absolute&&canOpenSystem&&openSystemFile?[{id:'default-app',label:en?'Open with default app':'用默认应用打开'}]:[]),
  ...(localFiles&&absolute&&window.dshDesktop?.showItemInFolder?[{id:'finder',label:en?'Show in file manager':'在文件管理器中显示'}]:[]),
  {id:'absolute',label:en?'Copy path':'复制文件路径'}
 ]
 const showMenu=async()=>{
  if(!current())return
  const controller=owner.abort
  if(menu){dismiss();return}
  if(window.dshDesktop?.showFileContextMenu){setMenu('native');try{const selected=await window.dshDesktop.showFileContextMenu(items);if(!current()||owner.abort!==controller)return;setMenu(null);options.current?.focus();if(items.some(item=>item.id===selected))await perform(selected)}catch{if(current()&&owner.abort===controller)setMenu('inline')}}
  else setMenu('inline')
 }
 const menuKeys=event=>{
  if(event.key==='Escape'){event.preventDefault();dismiss();return}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return
  event.preventDefault();const buttons=Array.from(menuRef.current?.querySelectorAll('button:not(:disabled)')??[]),at=buttons.indexOf(document.activeElement)
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length
  buttons[next]?.focus()
 }
 const retry=async()=>{if(!current()||owner.busy||!pptxAnnotationDeliveryCanRetry(window,annotation,sessionId))return;const controller=owner.abort,active=()=>current()&&owner.abort===controller;owner.busy=true;setBusy(true);try{await window[Symbol.for('sherlock:pptx-annotation-input')].retry(annotation.preparedId);if(active())report(en?'A new revision request was initiated. Check its receipt in the conversation; this candidate remains unverified.':'已发起新的修改请求，请留意对话回执；本候选文件仍未通过核验。')}catch(error){if(active())report(error?.message||'重新发送失败，原草稿已保留。',true)}finally{if(owner.abort===controller){owner.busy=false;if(current())setBusy(false)}}}
 const liveNotice=notice?.owner===owner?notice:null,statusText=annotation?.kind==='checking'?(en?'Checking PPT delivery status…':'正在核对 PPT 交付状态…'):pptxAnnotationDeliveryText(annotation,en)
 return jsxs('div',{className:'ew-delivery-item',children:[jsxs('div',{className:'ew-delivery-card',ref:card,'data-file-path':path,'data-annotation-status':annotation&&annotation.kind!=='ordinary'?annotation.status:undefined,onClick:event=>{if(!event.target.closest('button,[role="menu"]'))void perform('open-side')},children:[
  jsxs('button',{className:'ew-delivery-open',type:'button',title:path,'aria-label':(en?'Open ':'打开 ')+name,'aria-busy':busy||undefined,onClick:()=>perform('open-side'),children:[
   jsx('span',{className:'ew-delivery-icon','data-kind':type.kind,'aria-hidden':true,children:jsx('img',{src:deliveryIconForPath(path),alt:'',draggable:false})}),
   jsxs('span',{className:'ew-delivery-info',children:[jsx('span',{className:'ew-delivery-name',children:name}),jsx('span',{className:'ew-delivery-type',children:type.extension+(available===false?(en?' · File not found':' · 文件不存在'):collection?.path===path?(collection.saved?(en?' · Saved':' · 已收藏'):(en?' · In Knowledge Base':' · 已自动收录')):'')})]})
  ]}),
  jsxs('button',{className:'ew-delivery-options',ref:options,type:'button','aria-label':(en?'Open options: ':'打开方式：')+name,'aria-haspopup':'menu','aria-expanded':menu!==null,disabled:busy,onClick:showMenu,children:[en?'Open with':'打开方式',jsx(_deliveryIcons.IconChevronDownOutline14,{size:14})]}),
  menu==='inline'?jsx('div',{className:'ew-delivery-menu',ref:menuRef,role:'menu','aria-label':en?'Open options':'打开方式',onKeyDown:menuKeys,children:items.map(item=>jsx('button',{type:'button',role:'menuitem',onClick:()=>{dismiss();void perform(item.id)},children:item.label},item.id))}):null
 ]}),statusText?jsx('p',{className:'ew-delivery-status',role:annotation.status==='failed'?'alert':'status','data-error':annotation.status==='failed'||undefined,children:statusText}):null,liveNotice?jsx('p',{className:'ew-delivery-status',role:liveNotice.error?'alert':'status','data-error':liveNotice.error||undefined,children:liveNotice.text}):null,pptxAnnotationDeliveryCanRetry(window,annotation,sessionId)?jsx('button',{className:'ew-delivery-options',type:'button',disabled:busy,onClick:retry,children:en?'Resend revision request':'重新发送修改'}):null]})
}

function ProducedFiles({matched:paths,sessionId,getSessionTitle,openFile,openSystemFile,isLoopback,useHostDescription,text='',cwd}) {
 const jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs,en=document.documentElement.dataset.odysseyLocale==='en'
 const hostCanOpen=useHostDescription(description=>description?.canOpenPath===true)
 const sessionTitle=sessionId?getSessionTitle?.(sessionId):undefined
 const [expanded,setExpanded]=react.useState(false)
 const explicit=new Set(deliveryPathsFromFinalText(text,cwd)),main=[],auxiliary=[]
 for(const path of paths)(explicit.has(path)||/\.(?:pdf|pptx?|odp|key|docx?|odt|pages|rtf|xlsx?|csv|tsv|ods|numbers|html?|md|markdown|txt|zip|7z|png|jpe?g|webp|svg|gif|mp[34]|wav|mov)$/i.test(path)?main:auxiliary).push(path)
 const cards=(list,collect=false)=>list.map(path=>jsx(DeliveryFileCard,{path,sessionId,sessionTitle,openFile,openSystemFile,canOpenSystem:isLoopback&&hostCanOpen,localFiles:isLoopback===true,collect},path))
 return jsxs('section',{className:'ew-delivery','aria-label':en?'Delivered files':'交付文件',children:[
  main.length?jsxs(react_jsx_runtime.Fragment,{children:[jsxs('div',{className:'ew-delivery-heading',children:[en?'Delivered files':'交付文件',jsx('span',{className:'ew-delivery-count',children:main.length})]}),jsx('div',{className:'ew-delivery-list',children:cards(main,true)})]}):null,
  auxiliary.length?jsx('div',{className:'ew-delivery-auxiliary',children:jsxs('details',{onToggle:event=>setExpanded(event.currentTarget.open),children:[jsx('summary',{children:en?'Supporting files ('+auxiliary.length+')':'辅助文件（'+auxiliary.length+'）'}),expanded?jsx('div',{className:'ew-delivery-list',children:cards(auxiliary)}):null]})}):null
 ]})
}

function exact(source,before,after){if(source.split(before).length!==2)throw Error('Delivery cards anchor drifted: '+before.slice(0,90));return source.replace(before,after)}

function patchHomeGuideDeliveryAccumulator(source){
 const marker='/* ework:home-guide-delivery-accumulator:v1 */'
 const before='calls.set(String(match.event.data.callId), match.view?.for === "call" ? match.view.view : null);'
 const after=marker+'\n\t\t\t\t\tcalls.set(String(match.event.data.callId), {name:match.event.data.name,view:match.view?.for === "call" ? match.view.view : null});'
 const oldAdditions='const additions = [...producedPaths(context.state.calls.get(callId) ?? null),...verifiedResearchDeliveryPaths(match.event.data.message)].map((path) => ({'
 const previousAdditions='const completedCall = context.state.calls.get(callId);\n\t\t\t\tconst demoPublisher = completedCall?.name === "home_presentation_publish" || completedCall?.name === "home_report_publish";\n\t\t\t\tconst additions = (demoPublisher ? homeGuideDeliveryPaths(match.event.data.message,completedCall.name) : [...producedPaths(completedCall?.view ?? null),...verifiedResearchDeliveryPaths(match.event.data.message)]).map((path) => ({'
 const legacyAdditions=previousAdditions.replace('...verifiedResearchDeliveryPaths(match.event.data.message)]','...verifiedResearchDeliveryPaths(match.event.data.message),...(presentationDelivery(match.event.data.message,completedCall?.name,context.state.turn)?.paths??[])]')
 const newAdditions=legacyAdditions.replace('const demoPublisher', 'const publication = presentationDelivery(match.event.data.message,completedCall?.name,context.state.turn);\n\t\t\t\tconst demoPublisher').replace('...(presentationDelivery(match.event.data.message,completedCall?.name,context.state.turn)?.paths??[])','...(publication?.paths??[])')+'...(publication?.complete && publication.paths.includes(path) && {terminalPresentation:true}),'
 if(source.includes(marker)){
  if(source.includes(previousAdditions))source=exact(source,previousAdditions,newAdditions)
  if(source.includes(legacyAdditions))source=exact(source,legacyAdditions,newAdditions)
  if(source.split(marker).length!==2||source.split(after).length!==2||source.split(newAdditions).length!==2)throw Error('Home guide delivery accumulator anchor drifted')
  return source
 }
 source=exact(source,before,after)
 return exact(source,oldAdditions,newAdditions)
}

function patchPresentationCodeDelivery(source){
 const marker='/* ework:presentation-code-delivery:v1 */'
 const match='if (event.type === "tool/result" && (0, _deepseek_ai_dsh_client_runtime_client.isAppendSurfaceEvent)(event)) return {'
 const update='if (match.event.type !== "tool/result") return context.state;'
 const matchCode=marker+'\n                if(event.type==="tool/code-dispatch"){const publication=presentationCodeDelivery(event);if(publication)return{id:publication.turnId,role:"update"};}\n                '+match
 const legacyUpdate='if(match.event.type==="tool/code-dispatch"){const publication=presentationCodeDelivery(match.event),root=context.state.calls.get(match.event.data.rootCallId);if(!publication||publication.turnId!==String(context.state.turn)||root?.name!=="run_code")return context.state;return{...context.state,produced:[...context.state.produced,...publication.paths.map(path=>({seq:match.event.seq,path}))]};}\n                '+update
 const updateCode=legacyUpdate.replace('{seq:match.event.seq,path}', '{seq:match.event.seq,path,...(publication.complete && {terminalPresentation:true})}')
 // A terminal file result follows the final assistant message. It still belongs
 // to this closed turn. Ordinary mutations retain the assistant sequence cutoff.
 const cutoff='produced.seq > seq || seen.has(produced.path)'
 const terminalCutoff='(produced.seq > seq && !produced.terminalPresentation) || seen.has(produced.path)'
 if(!source.includes(terminalCutoff))source=exact(source,cutoff,terminalCutoff)
 if(source.includes(marker)){
  if(source.includes(legacyUpdate))source=exact(source,legacyUpdate,updateCode)
  if(source.split(marker).length!==2||source.split(matchCode).length!==2||source.split(updateCode).length!==2)throw Error('Presentation delivery code accumulator anchor drifted')
  return source
 }
 return exact(exact(source,match,matchCode),update,updateCode)
}

export function deliveryCardsRuntime(){
 const marker='/* ework:delivery-cards:v1 */'
 const runtime=marker+'\nlet _deliveryIcons=require("@deepseek-ai/dsh-client-ui-primitives");\n'+deliveryModelSource+'\n'+deliveryIconSource+'\n'+PPTX_ANNOTATION_DELIVERY_SOURCE+'\n'+[fileEditorMode,fileEditorLabel,deliveryFileType,DeliveryFileCard,ProducedFiles].map(fn=>fn.toString()).join('\n')+'\n'+`if(typeof document!=='undefined'&&!document.getElementById('ework-delivery-cards')){const tag=document.createElement('style');tag.id='ework-delivery-cards';tag.textContent=${JSON.stringify(DELIVERY_CARDS_CSS)};document.head.appendChild(tag);}\n`
 return runtime
}

export function patchDeliverableCards(source){
 const marker='/* ework:delivery-cards:v1 */'
 const runtime=deliveryCardsRuntime()
 const injectTitle=code=>code.includes('/* ework:delivery-session-title */')?code:exact(code,
  'openSystemFile: path=>ctx.get("workspaces").openPath(path),',
  'openSystemFile: path=>ctx.get("workspaces").openPath(path),\n                    /* ework:delivery-session-title */ getSessionTitle: id=>ctx.get("sessions")?.list.getSnapshot().byId?.[id]?.title,')
 if(source.includes(marker)){
  const start=source.indexOf(marker),end=source.indexOf('\n\t\t//#endregion',start)
  if(end<0||source.indexOf(marker,start+marker.length)!==-1)throw Error('Delivery cards runtime anchor drifted')
  return patchPresentationCodeDelivery(patchHomeGuideDeliveryAccumulator(injectTitle(source.slice(0,start)+runtime+source.slice(end))))
 }
 const start=source.indexOf('\t\tfunction ProducedFiles('),end=source.indexOf('\n\t\t//#endregion',start)
 if(start<0||end<0)throw Error('Delivery cards anchor missing: ProducedFiles')
 source=source.slice(0,start)+runtime+source.slice(end)
 source=exact(source,'const paths = producedForClosing(owner.turn.data.get("deliverables"), owner.seq);','if(owner.turn.status!=="closed")return null;\n            const paths = mergeDeliveryPaths(producedForClosing(owner.turn.data.get("deliverables"), owner.seq),owner.text??"",owner.cwd);')
 source=exact(source,'const additions = producedPaths(context.state.calls.get(callId) ?? null).map((path) => ({','const additions = [...producedPaths(context.state.calls.get(callId) ?? null),...verifiedResearchDeliveryPaths(match.event.data.message)].map((path) => ({')
 source=exact(source,'"conversationEvents",\n\t\t\t"connection"','"conversationEvents",\n            "workspaces",\n\t\t\t"connection"')
 source=exact(source,'isLoopback: connection.isLoopback,\n','isLoopback: connection.isLoopback,\n                    openSystemFile: path=>ctx.get("workspaces").openPath(path),\n')
 return patchPresentationCodeDelivery(patchHomeGuideDeliveryAccumulator(injectTitle(source)))
}

export function patchDeliveryConversation(source){
 const marker='/* ework:delivery-tail-owner:v1 */'
 if(source.includes(marker))return source
 source=exact(source,'function TurnTailNodeView({ node, sessionId, openFile,','function TurnTailNodeView({ node, sessionId, cwd, openFile,')
 return exact(source,'const tail = renderSlotChain("conversation.chat.turnTail", {\n\t\t\t\tturn,','const tail = renderSlotChain("conversation.chat.turnTail", {\n                '+marker+'\n                sessionId, cwd,\n                text: closing ? assistantText(closing.blocks) : "",\n\t\t\t\tturn,')
}
