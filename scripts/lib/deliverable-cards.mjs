import {deliveryModelSource} from './delivery-file-model.mjs'
import {deliveryIconSource} from './delivery-file-icons.mjs'

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
 const kind=/^pdf$/.test(extension)?'pdf':/^(pptx?|odp|key)$/.test(extension)?'presentation':/^(xlsx?|csv|tsv|ods|numbers)$/.test(extension)?'sheet':/^(docx?|odt|pages|rtf|txt|md)$/.test(extension)?'document':/^(html?|svg)$/.test(extension)?'web':/^(png|jpe?g|gif|webp|mp[34]|wav|mov)$/.test(extension)?'media':'file'
 return {extension:extension.length<=16?extension.toUpperCase():'FILE',kind}
}

function DeliveryFileCard({path,openFile,openSystemFile,canOpenSystem,localFiles}) {
 const jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs
 const en=document.documentElement.dataset.odysseyLocale==='en',name=path.split(/[\\/]/).pop(),type=deliveryFileType(path)
 const [menu,setMenu]=react.useState(null),[notice,setNotice]=react.useState(null),[available,setAvailable]=react.useState(undefined),[busy,setBusy]=react.useState(false)
 const card=react.useRef(null),options=react.useRef(null),menuRef=react.useRef(null),alive=react.useRef(true)
 const absolute=/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path)
 const canCheck=localFiles&&absolute&&path.length<=512
 react.useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
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
 const report=(text,error=false)=>{if(alive.current)setNotice({text,error})}
 const dismiss=()=>{setMenu(null);options.current?.focus()}
 const perform=async action=>{
  setMenu(null)
  if(busy)return
  setBusy(true)
  try {
   if(action==='absolute'){const copied=window.dshDesktop?.copyFilePath?(await window.dshDesktop.copyFilePath(path))?.ok===true:await _deliveryIcons.writeClipboard(path);if(copied!==true)throw Error(en?'Unable to copy the path. Please try again.':'路径复制失败，请重试。');report(en?'Path copied':'路径已复制');return}
   if(canCheck&&window.dshDesktop?.researchFilesAvailable){const values=await window.dshDesktop.researchFilesAvailable([path]);if(!alive.current)return;setAvailable(values[0]===true);if(values[0]!==true)throw Error(en?'File moved or not found.':'文件已移动或不存在，请确认后重试。')}
   if(action==='open-side')await openFile(path)
   else if(action==='default-app'){await openSystemFile(path);report(en?'Opened with the default application':'已请求用默认应用打开')}
   else if(action==='finder'){await window.dshDesktop.showItemInFolder(path);report(en?'Shown in file manager':'已在文件管理器中显示')}
  }catch(error){report(error?.message||(en?'Unable to open this file. Please try again.':'文件暂时无法打开，请重试。'),true)}
  finally{if(alive.current)setBusy(false)}
 }
 const items=[
  {id:'open-side',label:en?'Preview in EWork':'在客户端中预览'},
  ...(absolute&&canOpenSystem&&openSystemFile?[{id:'default-app',label:en?'Open with default app':'用默认应用打开'}]:[]),
  ...(localFiles&&absolute&&window.dshDesktop?.showItemInFolder?[{id:'finder',label:en?'Show in file manager':'在文件管理器中显示'}]:[]),
  {id:'absolute',label:en?'Copy path':'复制文件路径'}
 ]
 const showMenu=async()=>{
  if(menu){dismiss();return}
  if(window.dshDesktop?.showFileContextMenu){setMenu('native');try{const selected=await window.dshDesktop.showFileContextMenu(items);if(!alive.current)return;setMenu(null);options.current?.focus();if(items.some(item=>item.id===selected))await perform(selected)}catch{if(alive.current)setMenu('inline')}}
  else setMenu('inline')
 }
 const menuKeys=event=>{
  if(event.key==='Escape'){event.preventDefault();dismiss();return}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return
  event.preventDefault();const buttons=Array.from(menuRef.current?.querySelectorAll('button:not(:disabled)')??[]),at=buttons.indexOf(document.activeElement)
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length
  buttons[next]?.focus()
 }
 return jsxs('div',{className:'ew-delivery-item',children:[jsxs('div',{className:'ew-delivery-card',ref:card,'data-file-path':path,onClick:event=>{if(!event.target.closest('button,[role="menu"]'))void perform('open-side')},children:[
  jsxs('button',{className:'ew-delivery-open',type:'button',title:path,'aria-label':(en?'Open ':'打开 ')+name,'aria-busy':busy||undefined,onClick:()=>perform('open-side'),children:[
   jsx('span',{className:'ew-delivery-icon','data-kind':type.kind,'aria-hidden':true,children:jsx('img',{src:deliveryIconForPath(path),alt:'',draggable:false})}),
   jsxs('span',{className:'ew-delivery-info',children:[jsx('span',{className:'ew-delivery-name',children:name}),jsx('span',{className:'ew-delivery-type',children:type.extension+(available===false?(en?' · File not found':' · 文件不存在'):'')})]})
  ]}),
  jsxs('button',{className:'ew-delivery-options',ref:options,type:'button','aria-label':(en?'Open options: ':'打开方式：')+name,'aria-haspopup':'menu','aria-expanded':menu!==null,disabled:busy,onClick:showMenu,children:[en?'Open with':'打开方式',jsx(_deliveryIcons.IconChevronDownOutline14,{size:14})]}),
  menu==='inline'?jsx('div',{className:'ew-delivery-menu',ref:menuRef,role:'menu','aria-label':en?'Open options':'打开方式',onKeyDown:menuKeys,children:items.map(item=>jsx('button',{type:'button',role:'menuitem',onClick:()=>{dismiss();void perform(item.id)},children:item.label},item.id))}):null
 ]}),notice?jsx('p',{className:'ew-delivery-status',role:notice.error?'alert':'status','data-error':notice.error||undefined,children:notice.text}):null]})
}

function ProducedFiles({matched:paths,openFile,openSystemFile,isLoopback,useHostDescription,text='',cwd}) {
 const jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs,en=document.documentElement.dataset.odysseyLocale==='en'
 const hostCanOpen=useHostDescription(description=>description?.canOpenPath===true)
 const [expanded,setExpanded]=react.useState(false)
 const explicit=new Set(deliveryPathsFromMarkdown(text,cwd)),main=[],auxiliary=[]
 for(const path of paths)(explicit.has(path)||/\.(?:pdf|pptx?|odp|key|docx?|odt|pages|rtf|xlsx?|csv|tsv|ods|numbers|html?|md|txt|zip|7z|png|jpe?g|webp|svg|gif|mp[34]|wav|mov)$/i.test(path)?main:auxiliary).push(path)
 const cards=list=>list.map(path=>jsx(DeliveryFileCard,{path,openFile,openSystemFile,canOpenSystem:isLoopback&&hostCanOpen,localFiles:isLoopback===true},path))
 return jsxs('section',{className:'ew-delivery','aria-label':en?'Delivered files':'交付文件',children:[
  main.length?jsxs(react_jsx_runtime.Fragment,{children:[jsxs('div',{className:'ew-delivery-heading',children:[en?'Delivered files':'交付文件',jsx('span',{className:'ew-delivery-count',children:main.length})]}),jsx('div',{className:'ew-delivery-list',children:cards(main)})]}):null,
  auxiliary.length?jsx('div',{className:'ew-delivery-auxiliary',children:jsxs('details',{onToggle:event=>setExpanded(event.currentTarget.open),children:[jsx('summary',{children:en?'Supporting files ('+auxiliary.length+')':'辅助文件（'+auxiliary.length+'）'}),expanded?jsx('div',{className:'ew-delivery-list',children:cards(auxiliary)}):null]})}):null
 ]})
}

function exact(source,before,after){if(source.split(before).length!==2)throw Error('Delivery cards anchor drifted: '+before.slice(0,90));return source.replace(before,after)}

export function patchDeliverableCards(source){
 const marker='/* ework:delivery-cards:v1 */'
 const runtime=marker+'\nlet _deliveryIcons=require("@deepseek-ai/dsh-client-ui-primitives");\n'+deliveryModelSource+'\n'+deliveryIconSource+'\n'+[deliveryFileType,DeliveryFileCard,ProducedFiles].map(fn=>fn.toString()).join('\n')+'\n'+`if(typeof document!=='undefined'&&!document.getElementById('ework-delivery-cards')){const tag=document.createElement('style');tag.id='ework-delivery-cards';tag.textContent=${JSON.stringify(DELIVERY_CARDS_CSS)};document.head.appendChild(tag);}\n`
 if(source.includes(marker)){
  const start=source.indexOf(marker),end=source.indexOf('\n\t\t//#endregion',start)
  if(end<0||source.indexOf(marker,start+marker.length)!==-1)throw Error('Delivery cards runtime anchor drifted')
  return source.slice(0,start)+runtime+source.slice(end)
 }
 const start=source.indexOf('\t\tfunction ProducedFiles('),end=source.indexOf('\n\t\t//#endregion',start)
 if(start<0||end<0)throw Error('Delivery cards anchor missing: ProducedFiles')
 source=source.slice(0,start)+runtime+source.slice(end)
 source=exact(source,'const paths = producedForClosing(owner.turn.data.get("deliverables"), owner.seq);','if(owner.turn.status!=="closed")return null;\n            const paths = mergeDeliveryPaths(producedForClosing(owner.turn.data.get("deliverables"), owner.seq),owner.text??"",owner.cwd);')
 source=exact(source,'const additions = producedPaths(context.state.calls.get(callId) ?? null).map((path) => ({','const additions = [...producedPaths(context.state.calls.get(callId) ?? null),...verifiedResearchDeliveryPaths(match.event.data.message)].map((path) => ({')
 source=exact(source,'"conversationEvents",\n\t\t\t"connection"','"conversationEvents",\n            "workspaces",\n\t\t\t"connection"')
 source=exact(source,'isLoopback: connection.isLoopback,\n','isLoopback: connection.isLoopback,\n                    openSystemFile: path=>ctx.get("workspaces").openPath(path),\n')
 return source
}

export function patchDeliveryConversation(source){
 const marker='/* ework:delivery-tail-owner:v1 */'
 if(source.includes(marker))return source
 source=exact(source,'function TurnTailNodeView({ node, sessionId, openFile,','function TurnTailNodeView({ node, sessionId, cwd, openFile,')
 return exact(source,'const tail = renderSlotChain("conversation.chat.turnTail", {\n\t\t\t\tturn,','const tail = renderSlotChain("conversation.chat.turnTail", {\n                '+marker+'\n                sessionId, cwd,\n                text: closing ? assistantText(closing.blocks) : "",\n\t\t\t\tturn,')
}
