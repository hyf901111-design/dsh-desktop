import {parseAttachmentSpec} from '../../packages/dsh-research-task-runtime/attachment-template-contract.js'
export const ATTACHMENT_CSS=`
@layer ework-workbench {
body [data-research-canvas][data-ework-grid] [data-research-node-id] :is([data-research-preview-body],[data-research-artifact-content],.rScV5Q_generatedContainer,.rScV5Q_containerContent):has([data-research-attachment-preset]){padding:0!important}
.ew-attachment{display:flex!important;flex-direction:column!important;gap:12px!important;min-width:0!important;padding:12px 16px 16px!important;color:var(--grid-text)!important;font:400 12px/18px var(--sherlock-font-sans)!important;overflow-wrap:anywhere!important;box-sizing:border-box!important}
.ew-attachment :is(p,strong,button,input){font:inherit!important;color:inherit!important;box-sizing:border-box!important;min-width:0!important;white-space:normal!important;overflow-wrap:anywhere!important}
.ew-attachment p{margin:0!important}.ew-attachment strong{font-weight:700!important}.ew-attachment-toolbar>strong{font-size:16px!important;line-height:24px!important;flex:1!important}
.ew-attachment-toolbar,.ew-attachment-actions{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important;min-width:0!important}
.ew-attachment button{min-height:28px!important;padding:5px 12px!important;border:1px solid transparent!important;border-radius:4px!important;background:var(--grid-menu)!important;cursor:pointer!important;flex-shrink:0!important}
.ew-attachment button:disabled{opacity:.5!important;cursor:default!important}.ew-attachment :is(button,input):focus-visible{outline:2px solid #168fff!important;outline-offset:-2px!important}
.ew-attachment input[type=search]{width:100%!important;height:30px!important;padding:5px 8px!important;border:1px solid var(--grid-border)!important;border-radius:4px!important;background:var(--grid-menu)!important}
.ew-attachment-meta{color:var(--grid-muted)!important;font-size:11px!important;line-height:16.5px!important}.ew-attachment-row{display:flex!important;align-items:flex-start!important;flex-wrap:wrap!important;gap:12px!important;padding:12px 0!important;border-bottom:1px solid var(--grid-border)!important;min-width:0!important}
.ew-attachment-name{flex:1!important;min-width:120px!important}.ew-attachment-name>strong{display:block!important}.ew-attachment-icon{width:36px!important;height:36px!important;box-sizing:border-box!important;flex-shrink:0!important;padding:6px!important;background:var(--grid-menu)!important;border-radius:4px!important;color:var(--grid-muted)!important}
.ew-attachment-grid{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))!important;gap:16px!important;min-width:0!important}.ew-attachment-tile{display:flex!important;flex-direction:column!important;gap:8px!important;min-width:0!important;margin:0!important}
.ew-attachment-thumb{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;aspect-ratio:304/151!important;overflow:hidden!important;padding:0!important;background:var(--grid-menu)!important}.ew-attachment-thumb img{width:100%!important;height:100%!important;object-fit:cover!important}
.ew-attachment-failure{padding:8px!important;color:var(--grid-muted)!important}.ew-attachment dialog{position:fixed!important;inset:0!important;max-width:90vw!important;width:960px!important;max-height:85vh!important;margin:auto!important;padding:16px!important;border:1px solid var(--grid-border)!important;border-radius:8px!important;background:var(--grid-card)!important;color:var(--grid-text)!important;overflow:auto!important}
.ew-attachment dialog::backdrop{background:#0008!important}.ew-attachment-view{display:flex!important;flex-direction:column!important;gap:12px!important}.ew-attachment-full-image{display:block!important;max-width:100%!important;max-height:60vh!important;object-fit:contain!important;margin:auto!important}.ew-attachment-file-preview{position:relative!important;height:55vh!important;min-height:180px!important;overflow:auto!important}.ew-attachment-file-preview>*{height:100%!important;max-width:100%!important}
.ew-attachment progress{width:100%!important;height:6px!important;accent-color:var(--grid-accent,#00a6e9)!important}.ew-attachment [role=alert]{color:var(--grid-text)!important}.ew-attachment-import{display:none!important}
.ew-attachment-webpage{height:100%!important;min-height:240px;padding:0!important;gap:0!important}
.ew-attachment-webpage .ew-attachment-file-preview{height:auto!important;flex:1 1 auto!important;min-height:180px!important}
.ew-attachment-webpage iframe{display:block;width:100%;height:100%;border:0}
.ew-attachment-webpage footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:8px 14px;border-top:1px solid var(--grid-border)}
}
`
export function ResearchAttachmentLocalPreview({item,nodeId,sessionId,visible,officePreview,noteDocument=false,readOnly=false,annotationSource,onNaturalSize,onPageStatus}){
 if(noteDocument&&item.previewEligible===false)return react_jsx_runtime.jsx('p',{children:'此文件暂不支持组件内预览，可在访达中打开原文件。'})
 const node={id:nodeId,authorizationId:item.authorizationId,name:item.name,noteDocument,...(typeof item.path==='string'&&item.path?{path:item.path}:{})},extension=item.name.split('.').pop().toLowerCase(),jsx=react_jsx_runtime.jsx
 if(/^(png|jpe?g|gif|webp|svg|avif|bmp)$/.test(extension))return jsx(ResearchCanvasImagePreview,{node,sessionId,visible,onNaturalSize})
 if(extension==='pdf')return jsx(ResearchCanvasPdfPreview,{node,sessionId,visible,onNaturalSize,onPageStatus})
 if(/^(html?|md|markdown|txt|csv|json|log)$/.test(extension))return extension.startsWith('htm')?jsx(ResearchCanvasHtmlPreview,{node,sessionId,visible}):jsx(ResearchCanvasNativeTextPreview,{node,sessionId,visible,markdown:/^(md|markdown)$/.test(extension)})
 if(/^(docx|xlsx|pptx)$/.test(extension))return jsx(ResearchCanvasOfficePreview,{node,sessionId,visible,kind:extension,service:officePreview,readOnly,annotationSource})
 return jsx('p',{children:noteDocument?'此格式暂不支持组件内预览，可在访达中打开原文件。':'此格式暂不支持组件内预览，请下载原文件。'})
}
export function ResearchAttachmentPreset({node,sessionId,visible=true,officePreview}){
 const spec=node.containerSpec,jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs,key=sessionId+':'+node.id,root=react.useRef(null),dialog=react.useRef(null),picker=react.useRef(null),current=react.useRef(spec)
 current.current=spec
 const [query,setQuery]=react.useState(''),[selected,setSelected]=react.useState(researchAttachmentViews.get(key)??null),[resolved,setResolved]=react.useState({}),[failures,setFailures]=react.useState({}),[notice,setNotice]=react.useState(''),[busy,setBusy]=react.useState(false),[progress,setProgress]=react.useState(null),[retryFiles,setRetryFiles]=react.useState([]),[retryEpoch,setRetryEpoch]=react.useState(0),[reloadUrls,setReloadUrls]=react.useState({}),[reloadFailures,setReloadFailures]=react.useState({}),reload=react.useRef({controller:null,urls:{},active:true})
 react.useSyncExternalStore(sherlockBoardsAdapter?.subscribe??(()=>()=>{}),sherlockBoardsAdapter?.version??(()=>0))
 const readOnly=node.readOnly===true||sherlockShared(sessionId)&&sherlockBoardsAdapter?.getView(sessionId)?.permissions.edit!==true
 const identity=item=>({sessionId,nodeId:node.id+':attachment:'+item.id})
 const reloadAttachments=async ids=>{
  reload.current.controller?.abort();const controller=new AbortController();reload.current.controller=controller
  const images=current.current.type==='gallery'?current.current.items.filter(item=>item.url&&item.permissions?.preview!==false&&(!ids||ids.includes(item.id))):[]
  setRetryEpoch(n=>n+1);setReloadFailures({});setBusy(true);setNotice(images.length?'正在重新载入原图…':'正在重新载入原文件预览…')
  let failed=0;const timer=setTimeout(()=>controller.abort(),15000)
  try{for(const item of images){
   if(controller.signal.aborted||!reload.current.active)break
   try{const response=await window.fetch(item.url,{cache:'reload',credentials:'omit',signal:controller.signal});if(!response.ok)throw Error('原图暂不可用');const blob=await response.blob();if(blob.size>32*1024*1024||!/^image\//i.test(blob.type))throw Error('原图响应不是受支持的图片');if(controller.signal.aborted||!reload.current.active)break;if(!current.current.items.some(next=>next.id===item.id&&next.url===item.url))continue
    const url=window.URL.createObjectURL(blob),previous=reload.current.urls[item.id];reload.current.urls[item.id]=url;setReloadUrls(old=>({...old,[item.id]:url}));setFailures(old=>{const next={...old};delete next[item.id];return next});if(previous)window.URL.revokeObjectURL(previous)
   }catch(error){if(!reload.current.active)break;failed++;setReloadFailures(old=>({...old,[item.id]:(error.name==='AbortError'?'原图重载超时':error.message==='Failed to fetch'?'无法访问原图':error.message)+'；保留上次已载入原图。'}))}
  }
  for(const frame of root.current?.querySelectorAll('[data-research-native-web]')??[])frame.__eworkReloadWeb?.()
  if(reload.current.active){setNotice(failed?'部分原图重载失败；保留上次已载入原图。':images.length?'原图重新载入完成。':'已请求重新载入原文件预览。');setBusy(false)}
  return failed?{error:'部分原图重载失败；保留上次已载入原图。'}:{message:images.length?'原图重新载入完成':'已请求重新载入原文件预览'}
  }finally{clearTimeout(timer)}
 }
 react.useEffect(()=>{const element=root.current;if(!element)return;reload.current.active=true;element.__eworkReloadAttachments=()=>reloadAttachments();return()=>{delete element.__eworkReloadAttachments;reload.current.active=false;reload.current.controller?.abort();for(const url of Object.values(reload.current.urls))window.URL.revokeObjectURL(url)}},[])
 const allowed=(item,action)=>item.permissions?.[action]!==false&&(action!=='remove'||!readOnly)
 const save=next=>researchAttachmentSinks.get(sessionId)?.(node.id,current.current,next)
 const descriptor=async item=>{
  const bridge=window.dshDesktop?.researchPreview
  if(!bridge)throw Error('当前客户端不支持原文件预览。')
  const result=item.authorizationId?await bridge.restore({...identity(item),authorizationId:item.authorizationId}):await bridge.admitSidebarFile({...identity(item),relativePath:item.relativePath})
  if(!result)throw Error('原文件不存在或无权访问。')
  return result
 }
 react.useEffect(()=>{let active=true;const resources=[];setResolved({});setFailures({});const release=(item,d)=>window.dshDesktop?.researchPreview?.release?.({...identity(item),authorizationId:d.authorizationId,capabilityToken:d.capabilityToken});for(const item of spec.items){if(item.url||item.url===null||visible===false||item.permissions?.preview===false)continue;descriptor(item).then(d=>{if(!active){release(item,d);return}resources.push({item,d});setResolved(old=>({...old,[item.id]:d}))}).catch(error=>{if(active)setFailures(old=>({...old,[item.id]:error.message}))})}return()=>{active=false;for(const {item,d} of resources)release(item,d)}},[sessionId,node.id,JSON.stringify(spec.items.map(i=>[i.id,i.url,i.relativePath,i.authorizationId,i.permissions?.preview])),visible,retryEpoch])
 react.useEffect(()=>{if(selected&&spec.items.some(i=>i.id===selected&&i.permissions?.preview!==false)&&visible){dialog.current?.showModal?.()}else dialog.current?.close?.()},[selected,visible,spec.items])
 react.useEffect(()=>()=>{dialog.current?.close?.()},[])
 const choose=id=>{if(id&&!spec.items.some(i=>i.id===id&&allowed(i,'preview')))return;setSelected(id);if(id)researchAttachmentViews.set(key,id);else researchAttachmentViews.delete(key);if(researchAttachmentViews.size>512)researchAttachmentViews.delete(researchAttachmentViews.keys().next().value)}
 const download=async item=>{if(!allowed(item,'download')||busy)return;setBusy(true);setNotice('正在下载原文件…');try{const bridge=window.dshDesktop?.researchCanvasExport;if(!bridge?.save)throw Error('当前客户端不支持原文件下载。');const result=item.url?await bridge.save({kind:'remote-original',suggestedName:item.name.slice(0,160),url:item.url}):await descriptor(item).then(d=>bridge.save({kind:'original',suggestedName:item.name.slice(0,160),...identity(item),authorizationId:d.authorizationId}));setNotice(result.status==='saved'?'原文件已保存':result.status==='cancelled'?'已取消保存':result.message??'原文件下载失败，请重试。')}catch(error){setNotice(error.message)}finally{setBusy(false)}}
 const remove=item=>{if(!allowed(item,'remove'))return;if(save({...spec,items:spec.items.filter(i=>i.id!==item.id)})){window.dshDesktop?.researchLinkFrame?.releaseNative?.(identity(item));setNotice('已从组件移除，原文件仍保留。');if(selected===item.id)choose(null)}else setNotice('附件未移除，请重试。')}
 const importFiles=async input=>{
  if(readOnly||busy||!input?.length)return
  const selectedFiles=Array.from(input);if(spec.items.length+selectedFiles.length>128){setNotice('每个组件最多128个附件。');return}
  setBusy(true);setRetryFiles([]);setProgress({done:0,total:selectedFiles.length});let done=0;const failed=[]
  for(const file of selectedFiles){let admitted,id;try{
   if(spec.type==='gallery'&&!/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file.name))throw Error('请选择图片文件。')
   id=window.crypto.randomUUID();const d=admitted=await window.dshDesktop?.researchPreview?.admitFinderFile?.(file,identity({id}))
   if(!d)throw Error('原文件导入失败。')
   const item={id,name:file.name,authorizationId:d.authorizationId,sizeBytes:file.size,mimeType:d.contentType,...(file.lastModified?{date:new Date(file.lastModified).toISOString()}:{}),...(spec.type==='gallery'?{alt:file.name}:{})}
   if(!save({...current.current,items:[...current.current.items,item]}))throw Error('附件未保存，可能已失去编辑权限。')
   current.current={...current.current,items:[...current.current.items.filter(i=>i.id!==id),item]};done++;setProgress({done,total:selectedFiles.length})
  }catch(error){failed.push(file);setNotice(file.name+'：'+error.message)}finally{if(admitted)window.dshDesktop?.researchPreview?.release?.({...identity({id}),authorizationId:admitted.authorizationId,capabilityToken:admitted.capabilityToken})}}
  setRetryFiles(failed);setProgress(null);setBusy(false);if(!failed.length)setNotice('已导入 '+done+' 个原文件。')
 }
 const imageError=item=>setFailures(old=>({...old,[item.id]:'原图无法加载；未替换成样例。'}))
 const retryPreview=item=>{if(!allowed(item,'preview'))return;if(item.url&&spec.type==='gallery')return reloadAttachments([item.id]);setFailures(old=>{const next={...old};delete next[item.id];return next});if(!item.url)setRetryEpoch(n=>n+1)}
 const imageUrl=item=>allowed(item,'preview')?(reloadUrls[item.id]??item.url??resolved[item.id]?.url):null
 const meta=item=>[item.mimeType??item.name.split('.').pop().toUpperCase(),item.sizeBytes===null||item.sizeBytes===undefined?'大小未知':item.sizeBytes+' 字节',item.date??'日期未提供'].join(' · ')
 const fileIcon=jsx('svg',{className:'ew-attachment-icon',viewBox:'0 0 24 24','aria-hidden':true,children:jsx('path',{d:'M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8',fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinejoin:'round'})})
 const sourceExists=item=>!!(item.url||item.relativePath||item.authorizationId)
 if(spec.presentation==='webpage'){
  const page=spec.items[0],file=resolved[page.id],error=failures[page.id]
  return jsxs('section',{ref:root,className:'ew-attachment ew-attachment-webpage','data-research-attachment-preset':'webpage','data-research-preview-interactive':'',onPointerDown:e=>e.stopPropagation(),children:[
   jsx('style',{children:RESEARCH_ATTACHMENT_CSS}),
   jsx('div',{className:'ew-attachment-file-preview',children:file?jsx(ResearchAttachmentLocalPreview,{item:{...page,authorizationId:file.authorizationId},nodeId:identity(page).nodeId,sessionId,visible}):jsx('p',{role:error?'alert':'status',className:'ew-attachment-failure',children:error??'正在打开项目网页…'})}),
   jsxs('footer',{children:[notice&&jsx('span',{role:'status',children:notice}),error&&jsx('button',{type:'button',onClick:()=>retryPreview(page),children:'重新打开'}),allowed(page,'download')&&jsx('button',{type:'button',disabled:busy||!file,onClick:()=>download(page),children:'下载网页文件'})]})
  ]})
 }
 const previewItem=spec.items.find(i=>i.id===selected),index=spec.items.findIndex(i=>i.id===selected),navigable=spec.items.filter(i=>allowed(i,'preview')&&sourceExists(i)),navigationIndex=navigable.findIndex(i=>i.id===selected),items=spec.items.filter(i=>[i.name,i.description,i.source].some(v=>v?.toLowerCase().includes(query.toLowerCase())))
 const actions=item=>jsxs('div',{className:'ew-attachment-actions',children:[jsx('button',{type:'button',disabled:!allowed(item,'preview')||!sourceExists(item),onClick:()=>choose(item.id),children:'预览'}),jsx('button',{type:'button',disabled:!allowed(item,'download')||!sourceExists(item)||busy,onClick:()=>download(item),children:'下载原文件'}),jsx('button',{type:'button',disabled:!allowed(item,'remove'),onClick:()=>remove(item),children:'移除'})]})
 return jsxs('section',{ref:root,className:'ew-attachment','data-research-attachment-preset':spec.type,'aria-busy':busy,'data-research-preview-interactive':'',onPointerDown:e=>e.stopPropagation(),children:[
  jsx('style',{children:RESEARCH_ATTACHMENT_CSS}),jsxs('div',{className:'ew-attachment-toolbar',children:[jsx('strong',{children:spec.title}),jsx('span',{className:'ew-attachment-meta',children:spec.items.length+(spec.type==='gallery'?' 张':' 个文件')}),jsx('button',{type:'button',disabled:readOnly||busy,onClick:()=>picker.current?.click(),children:spec.type==='gallery'?'导入图片':'导入文件'}),jsx('input',{ref:picker,className:'ew-attachment-import',type:'file',multiple:true,accept:spec.type==='gallery'?'image/*':undefined,onChange:e=>{importFiles(e.currentTarget.files);e.currentTarget.value=''}})]}),
  spec.description&&jsx('p',{children:spec.description}),(spec.source||spec.date||spec.asOf)&&jsx('p',{className:'ew-attachment-meta',children:[spec.source,spec.date,spec.asOf?'数据时点：'+spec.asOf:null].filter(Boolean).join(' · ')}),
  spec.type==='files'&&jsx('input',{type:'search','aria-label':'搜索附件',placeholder:'搜索文件名与说明',value:query,onChange:e=>setQuery(e.currentTarget.value)}),
  !spec.items.length&&jsx('p',{children:spec.type==='gallery'?'尚未提供原图。导入图片后可查看完整原图。':'尚未提供原文件。导入后可预览与下载。'}),
  spec.type==='files'?items.map(item=>jsxs('div',{className:'ew-attachment-row',children:[fileIcon,jsxs('div',{className:'ew-attachment-name',children:[jsx('strong',{children:item.name}),jsx('p',{className:'ew-attachment-meta',children:meta(item)}),item.description&&jsx('p',{children:item.description}),item.source&&jsx('p',{className:'ew-attachment-meta',children:item.source}),failures[item.id]&&jsx('p',{role:'alert',children:failures[item.id]})]}),actions(item)]},item.id)):jsx('div',{className:'ew-attachment-grid',children:items.map(item=>jsxs('figure',{className:'ew-attachment-tile',children:[jsx('button',{className:'ew-attachment-thumb',type:'button',disabled:!allowed(item,'preview')||!sourceExists(item),onClick:()=>choose(item.id),'aria-label':'预览 '+item.name,children:failures[item.id]?jsx('span',{className:'ew-attachment-failure',children:failures[item.id]}):imageUrl(item)?jsx('img',{src:imageUrl(item),alt:item.alt??item.name,onError:()=>imageError(item)},retryEpoch):jsx('span',{className:'ew-attachment-failure',children:!allowed(item,'preview')?'无预览权限':item.url===null?'原图未提供':'正在载入原图…'})}),reloadFailures[item.id]&&jsx('p',{role:'alert',children:reloadFailures[item.id]}),jsx('strong',{children:item.name}),item.description&&jsx('p',{children:item.description}),(item.source||item.date)&&jsx('p',{className:'ew-attachment-meta',children:[item.source,item.date].filter(Boolean).join(' · ')}),actions(item)]},item.id))}),
  progress&&jsxs('div',{role:'status',children:[jsx('p',{children:'正在导入 '+progress.done+' / '+progress.total+' 个文件…'}),jsx('progress',{value:progress.done,max:progress.total,'aria-label':'原文件导入进度'})]}),notice&&jsx('p',{role:'status',children:notice}),retryFiles.length>0&&jsx('button',{type:'button',disabled:readOnly||busy,onClick:()=>importFiles(retryFiles),children:'重试未导入文件'}),
  jsx('dialog',{ref:dialog,onCancel:e=>{e.preventDefault();choose(null)},onClose:()=>{if(selected&&visible)choose(null)},'aria-label':spec.type==='gallery'?'原图预览':'原文件预览',children:previewItem&&jsxs('div',{className:'ew-attachment-view',children:[jsxs('div',{className:'ew-attachment-toolbar',children:[jsx('strong',{children:previewItem.name}),spec.type==='gallery'&&jsx('span',{children:(index+1)+' / '+spec.items.length}),jsx('button',{type:'button',onClick:()=>choose(null),children:'关闭预览'})]}),
   spec.type==='gallery'?failures[previewItem.id]?jsx('p',{role:'alert',children:failures[previewItem.id]}):imageUrl(previewItem)?jsx('img',{className:'ew-attachment-full-image',src:imageUrl(previewItem),alt:previewItem.alt??previewItem.name,onError:()=>imageError(previewItem)},retryEpoch):jsx('p',{children:'原图未提供或正在载入。'}):jsx('div',{className:'ew-attachment-file-preview',children:previewItem.url?jsx(ResearchHybridWebFrame,{node:{id:identity(previewItem).nodeId,url:previewItem.url,title:previewItem.name},sessionId,inDialog:true,visible:visible&&selected!==null}):resolved[previewItem.id]?jsx(ResearchAttachmentLocalPreview,{item:{...previewItem,authorizationId:resolved[previewItem.id].authorizationId},nodeId:identity(previewItem).nodeId,sessionId,visible:visible&&selected!==null,officePreview,readOnly}):jsx('p',{children:failures[previewItem.id]??'原文件正在载入。'})}),
   notice&&jsx('p',{role:'status',children:notice}),reloadFailures[previewItem.id]&&jsx('p',{role:'alert',children:reloadFailures[previewItem.id]}),previewItem.description&&jsx('p',{children:previewItem.description}),previewItem.source&&jsx('p',{className:'ew-attachment-meta',children:previewItem.source}),jsxs('div',{className:'ew-attachment-actions',children:[(failures[previewItem.id]||reloadFailures[previewItem.id])&&jsx('button',{type:'button',disabled:busy,onClick:()=>retryPreview(previewItem),children:'重试预览'}),spec.type==='gallery'&&jsx('button',{type:'button',disabled:navigationIndex<=0,onClick:()=>choose(navigable[navigationIndex-1].id),children:'上一张'}),spec.type==='gallery'&&jsx('button',{type:'button',disabled:navigationIndex<0||navigationIndex>=navigable.length-1,onClick:()=>choose(navigable[navigationIndex+1].id),children:'下一张'}),jsx('button',{type:'button',disabled:!allowed(previewItem,'download')||!sourceExists(previewItem)||busy,onClick:()=>download(previewItem),children:'下载原文件'})]})]})})
 ]})
}
export function patchAttachmentClient(source){
 const start='/* ODYSSEY_ATTACHMENT_PRESET_V1 */',end='/* ODYSSEY_ATTACHMENT_PRESET_END */'
 const definitions=`${start}\nconst researchAttachmentSinks=new Map(),researchAttachmentViews=new Map(),RESEARCH_ATTACHMENT_CSS=${JSON.stringify(ATTACHMENT_CSS)};\nconst researchAttachmentSpec=${parseAttachmentSpec.toString()};\n${ResearchAttachmentLocalPreview.toString()}\n${ResearchAttachmentPreset.toString()}\n${end}`
 if(source.includes(start)){const a=source.indexOf(start),b=source.indexOf(end,a);if(b<0)throw Error('Attachment definitions boundary missing');source=source.slice(0,a)+definitions+source.slice(b+end.length)}
 else{const anchor='function createResearchWorkspaceSession(storage, sessionId) {';if(source.split(anchor).length!==2)throw Error('Attachment host missing');source=source.replace(anchor,definitions+'\n'+anchor)}
 const once=(a,b)=>{if(source.includes(b))return;if(source.split(a).length!==2)throw Error('Attachment anchor missing: '+a.slice(0,90));source=source.replace(a,b)}
 const types=/const RESEARCH_CONTAINER_TYPES = (?:\/\* @__PURE__ \*\/ )?new Set\(\[[^\]]+\]/;if(!source.match(types))throw Error('Attachment native types missing');if(!source.match(types)[0].includes('"files"'))source=source.replace(types,s=>s.replace('new Set([','new Set(["files", "gallery", '))
 if(!source.includes('if (value.type === "files" || value.type === "gallery") return researchAttachmentSpec(value);'))once('if (value.type === "web") {','if (value.type === "files" || value.type === "gallery") return researchAttachmentSpec(value);\n\t\t\tif (value.type === "web") {')
 if(!source.includes("if (['files','gallery'].includes(spec.type)) return [spec.title"))once("if (spec.type === 'html') return researchHtmlText(spec.html) || spec.title;","if (['files','gallery'].includes(spec.type)) return [spec.title,spec.source,spec.date,spec.description,...spec.items.map(i=>[i.name,i.description,i.source,i.date,i.url,i.relativePath].filter(Boolean).join(' · '))].filter(Boolean).join('\\n');\n\t\t\tif (spec.type === 'html') return researchHtmlText(spec.html) || spec.title;")
 source=source.replace('[spec.title,spec.source,spec.date,spec.description,...spec.items.map','[spec.title,spec.source,spec.date,spec.asOf,spec.description,...spec.items.map');
 // One production sink per workspace, including repeated older installations.
 source=source.replace(/researchAttachmentSinks\.set\(sessionId,\(nodeId,expected,spec\)=>\{[^\n]*\}\);\n/g,'')
 once('const htmlFitStates = new Map();',`researchAttachmentSinks.set(sessionId,(nodeId,expected,spec)=>{if(!collaborationCanWrite())return false;const node=snapshot.artifacts.find(n=>n.id===nodeId),next=researchAttachmentSpec(spec);if(node?.kind!=='generated-container'||!['files','gallery'].includes(node.containerSpec?.type)||JSON.stringify(node.containerSpec)!==JSON.stringify(expected)||!next||next.type!==node.containerSpec.type)return false;return commitUpdate({artifacts:snapshot.artifacts.map(n=>n.id===nodeId?{...n,containerSpec:next}:n)},true)!==false;});\nconst htmlFitStates = new Map();`)
 once('if (live.has(node.id)) continue;',`if (live.has(node.id)) continue;\nif(['files','gallery'].includes(node.containerSpec?.type))for(const item of node.containerSpec.items)Promise.resolve(window.dshDesktop?.researchLinkFrame?.releaseNative?.({sessionId,nodeId:node.id+':attachment:'+item.id})).catch(()=>{});`)
 once('const previewNodeIds = snapshot.files.filter((node) => removed.has(node.id) && typeof node.authorizationId === "string").map((node) => node.id);',`for(const node of snapshot.artifacts)if(removed.has(node.id)&&['files','gallery'].includes(node.containerSpec?.type))for(const item of node.containerSpec.items)Promise.resolve(window.dshDesktop?.researchLinkFrame?.releaseNative?.({sessionId,nodeId:node.id+':attachment:'+item.id})).catch(()=>{});\nconst previewNodeIds = snapshot.files.filter((node) => removed.has(node.id) && typeof node.authorizationId === "string").map((node) => node.id);`)
 const body='function ResearchContainerBody({ node, sessionId, visible, onHtmlSize, preserveHeading = false }) {'
 const nextBody=body.replace('visible,','visible, officePreview,')
 once(body,nextBody)
 const oldBranch="if(['files','gallery'].includes(node.containerSpec.type))return react_jsx_runtime.jsx(ResearchAttachmentPreset,{node,sessionId,visible});"
 const branch=oldBranch.replace('{node,sessionId,visible}','{node,sessionId,visible,officePreview}')
 if(source.includes(oldBranch))source=source.replace(oldBranch,branch)
 if(!source.includes(branch))once(nextBody,nextBody+'\n'+branch)
 once('onFrameAction, retryDisabled = false,','onFrameAction, officePreview, retryDisabled = false,')
 once('function ResearchGeneratedContainer({ node, sessionId, visible,','function ResearchGeneratedContainer({ node, sessionId, visible, officePreview,')
 once('ResearchDeferredGeneratedContainer, { previewActive: selected || editingContainerPrompt,','ResearchDeferredGeneratedContainer, { officePreview, previewActive: selected || editingContainerPrompt,')
 once('ResearchContainerContent, { node, sessionId, visible,','ResearchContainerContent, { node, sessionId, visible, officePreview,')
 once('ResearchStableArtifactCard, {\n\t\t\t\t\t\tnode,','ResearchStableArtifactCard, {\n\t\t\t\t\t\tofficePreview, node,')
 return source
}
