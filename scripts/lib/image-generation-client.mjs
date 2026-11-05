/** Project native tool lifecycle, including nested code-mode calls, into one image card. */
export function imageGenerationCalls(nodes,running){
 const calls=new Map()
 function visit(root){
  if(!root)return
  if((root.name??root.call?.name)==='image_generate'&&typeof root.callId==='string'){
   let args={};try{args=JSON.parse(root.argsRaw??root.call?.argsRaw??'{}')}catch{}
   let receipt
   for(const block of root.content??[])if(block.type==='text'){try{const value=JSON.parse(block.text);if(value.kind==='odyssey-image-generation'&&value.ok===true)receipt=value}catch{}}
   const image=(root.content??[]).find(block=>block.type==='image'&&block.attachment?.attachmentId===receipt?.image?.attachmentId)?.attachment
   const errorText=(root.content??[]).filter(b=>b.type==='text').map(b=>b.text).join(' ')
   const stopped=root.error?.code==='interrupted'||root.isError&&/已取消|cancelled|canceled/i.test(errorText)
   const state=stopped?'cancelled':root.isError?'failed':image?'completed':'kind'in root?'failed':running?'running':'interrupted'
   const ratio=state==='completed'&&image.width>0&&image.height>0?`${image.width} / ${image.height}`:args.size==='1536x1024'?'3 / 2':args.size==='1024x1536'?'2 / 3':'1 / 1'
   calls.set(root.callId,{id:root.callId,state,ratio,...state==='completed'?{image}:{}})
  }
  for(const child of root.subCalls??[])visit(child)
 }
 for(const node of nodes??[])if(node.kind==='tool-call')visit(node.data?.root)
 return [...calls.values()]
}

export const IMAGE_GENERATION_CSS=`
.odyssey-image-generations{display:flex;flex-direction:column;align-items:flex-start;gap:16px;margin:12px 0 4px;max-width:100%}
.odyssey-image-generation{width:min(440px,100%);margin:0;color:var(--dsw-alias-label-primary,#25272d)}
.odyssey-image-generation-stage{position:relative;aspect-ratio:var(--image-ratio,1);overflow:hidden;border-radius:18px;isolation:isolate;background:#ececec;display:grid;place-items:center;border:1px solid color-mix(in srgb,currentColor 7%,transparent)}
.odyssey-image-generation-stage canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.odyssey-image-generation-status{display:flex;align-items:center;gap:9px;position:absolute;left:20px;bottom:20px;max-width:calc(100% - 40px);color:#424242;font:500 13px/20px var(--odyssey-font-ui,system-ui,sans-serif);text-shadow:0 1px 8px #ffffff66}
.odyssey-image-generation-status svg{width:18px;height:18px;flex:none;transform-origin:center}
.odyssey-image-generation[data-state=running] .odyssey-image-generation-status svg{animation:odyssey-image-breathe 1.8s ease-in-out infinite}
.odyssey-image-generation[data-state=failed] .odyssey-image-generation-stage,.odyssey-image-generation[data-state=cancelled] .odyssey-image-generation-stage,.odyssey-image-generation[data-state=interrupted] .odyssey-image-generation-stage{background:var(--dsw-alias-bg-l1,#f4f4f6)}
.odyssey-image-generation-result{border-radius:18px;overflow:hidden;max-width:100%}
.odyssey-image-generation-result [data-align]{display:block;width:100%}
.odyssey-image-generation-result button[data-variant=single]{width:100%!important;height:auto!important;aspect-ratio:var(--image-ratio,1);max-width:none;max-height:none;border-radius:18px}
.odyssey-image-generation-result img{display:block;width:100%;max-width:100%;height:100%;object-fit:contain}
body[data-ds-dark-theme] .odyssey-image-generation-stage{background:#202020}
body[data-ds-dark-theme] .odyssey-image-generation-status{color:#fff;text-shadow:0 1px 8px #0009}
body [role=menu]:has([data-odyssey-image-action]){z-index:2147483001}
.odyssey-image-action-notice{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483002;padding:10px 16px;border-radius:10px;background:var(--odyssey-menu,#333);color:var(--odyssey-text,#fff);box-shadow:var(--odyssey-menu-shadow);font:400 13px/20px var(--odyssey-font-ui,system-ui,sans-serif);pointer-events:none}
@keyframes odyssey-image-breathe{0%,100%{opacity:.45;transform:scale(.82)}50%{opacity:1;transform:scale(1.08)}}
@media(prefers-reduced-motion:reduce){.odyssey-image-generation-status svg{animation:none!important}}
`

function GeneratedConversationImage({image,loadImage,t}){
 const jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs
 const [menu,setMenu]=react.useState(null),[notice,setNotice]=react.useState(''),busy=react.useRef(false)
 const en=document.documentElement.dataset.odysseyLocale==='en'
 const close=react.useCallback(()=>setMenu(null),[])
 const anchor=react.useCallback(()=>menu?{left:menu.x,right:menu.x,top:menu.y,bottom:menu.y,width:0,height:0}:null,[menu])
 react.useEffect(()=>{
  if(!menu)return
  const escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close()}}
  window.addEventListener('keydown',escape,true)
  return()=>window.removeEventListener('keydown',escape,true)
 },[menu,close])
 react.useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),2800);return()=>clearTimeout(id)},[notice])
 const act=async action=>{
  close();if(busy.current)return;busy.current=true
  try{
   if(!window.dshDesktop?.imageAction||!loadImage)throw Error('unavailable')
   const url=await loadImage(image),response=await fetch(url)
   if(!response.ok)throw Error('unavailable')
   const blob=await response.blob();if(blob.type!=='image/png'||blob.size>20*1024*1024)throw Error('invalid')
   const result=await window.dshDesktop.imageAction({action,name:image.name||'生成图片.png',data:new Uint8Array(await blob.arrayBuffer())})
   if(!result?.ok)throw Error('failed')
   if(!result.cancelled)setNotice(en?(action==='copy'?'Image copied':'Image downloaded'):(action==='copy'?'已复制图片':'已下载图片'))
  }catch{setNotice(en?'Image action failed. Please try again.':'图片操作失败，请重试。')}finally{busy.current=false}
 }
 const icon=path=>jsx('svg',{viewBox:'0 0 24 24',width:16,height:16,fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true,children:jsx('path',{d:path})})
 const items=[{id:'copy',label:jsx('span',{'data-odyssey-image-action':'copy',children:en?'Copy Image':'复制图片'}),icon:icon('M8 8h12v12H8zM4 16V4h12')},{id:'download',label:jsx('span',{'data-odyssey-image-action':'download',children:en?'Download Image':'下载图片'}),icon:icon('M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5')}]
 return jsxs('div',{className:'odyssey-image-generation-result',onContextMenu:event=>{
  if(!event.target?.closest?.('img'))return
  event.preventDefault();event.stopPropagation()
  setMenu({x:event.clientX,y:event.clientY,host:event.target.closest('[aria-modal="true"]')||document.body})
 },children:[jsx(_deepseek_ai_dsh_client_ui_attachment.ImageGallery,{images:[{attachment:image}],load:loadImage??(()=>Promise.reject(new Error(t('image.serviceUnavailable')))),align:'start',labels:messageImageLabels(t)}),
 menu&&react_dom.createPortal(jsx(_deepseek_ai_dsh_client_ui_primitives.Menu,{open:true,anchor:null,items,onSelect:act,onClose:close,portal:true,getAnchorRect:anchor}),menu.host),
 notice&&react_dom.createPortal(jsx('div',{role:'status',className:'odyssey-image-action-notice',children:notice}),document.body)
 ]})
}

function ImageGenerationOutputs({nodes,running,loadImage,t}){
 const calls=imageGenerationCalls(nodes,running)
 if(!calls.length)return null
 const jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs,en=document.documentElement.dataset.odysseyLocale==='en'
 const labels=en?{running:'Creating your image',completed:'Image ready',cancelled:'Image generation cancelled',failed:'Image generation failed',interrupted:'Image generation interrupted'}:{running:'正在生成图片',completed:'图片已生成',cancelled:'已取消生成',failed:'图片生成失败',interrupted:'图片生成已中断'}
 return jsx('div',{className:'odyssey-image-generations',children:calls.map(call=>jsx('figure',{className:'odyssey-image-generation','data-state':call.state,'data-image-call-id':call.id,style:{'--image-ratio':call.ratio},'aria-label':labels[call.state],children:
  call.state==='completed'?jsx(GeneratedConversationImage,{image:call.image,loadImage,t}):jsxs('div',{className:'odyssey-image-generation-stage','aria-busy':call.state==='running',children:[call.state==='running'&&jsx('canvas',{'data-odyssey-image-flow':'','aria-hidden':true}),jsxs('div',{className:'odyssey-image-generation-status',role:'status','aria-live':'polite',children:[jsx('svg',{viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':true,children:jsx('path',{d:'M12 2C13.4 8.3 15.7 10.6 22 12C15.7 13.4 13.4 15.7 12 22C10.6 15.7 8.3 13.4 2 12C8.3 10.6 10.6 8.3 12 2Z'})}),labels[call.state]]})]})
 },call.id))})
}

export function patchImageGenerationClient(source){
 const marker='/* ODYSSEY_CONVERSATION_IMAGE_GENERATION_V2 */'
 if(source.includes(marker))return source
 const replace=(before,after)=>{if(source.split(before).length!==2)throw Error('Image generation client anchor drifted: '+before.slice(0,90));source=source.replace(before,()=>after)}
 const functions=`${marker}\n${imageGenerationCalls.toString()}\n${GeneratedConversationImage.toString()}\n${ImageGenerationOutputs.toString()}\nif(typeof document!=='undefined'&&!document.getElementById('odyssey-image-generation-style')){const style=document.createElement('style');style.id='odyssey-image-generation-style';style.textContent=${JSON.stringify(IMAGE_GENERATION_CSS)};document.head.append(style)}\n`
 const previous=source.indexOf('/* ODYSSEY_CONVERSATION_IMAGE_GENERATION_V1 */')
 if(previous>=0){const end=source.indexOf('function ToolImageOutputs(',previous);if(end<0)throw Error('Image generation V1 boundary drifted');return source.slice(0,previous)+functions+source.slice(end)}
 replace('function ToolImageOutputs(',functions+'function ToolImageOutputs(')
 const call='(0, react_jsx_runtime.jsx)(ToolImageOutputs, { nodes: activityNodes, openFile: seatProps.openFile, loadImage: seatProps.loadImage, t })'
 replace(call,`(0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, {children:[(0, react_jsx_runtime.jsx)(ImageGenerationOutputs, {nodes:activityNodes, running: entry.running, loadImage:seatProps.loadImage, t}),${call}]})`)
 // Native generated images own the new card. Keep screenshots/read_image in
 // the existing gallery, including code-mode context projections.
 const start=source.indexOf('function toolImageOutputs('),end=source.indexOf(marker,start)
 const segment=source.slice(start,end)
 const before='if (root.kind === "tool-result" && !root.isError) collect(root.content, root.call?.argsRaw);'
 if(segment.split(before).length!==2)throw Error('Image generation output collector anchor drifted')
 source=source.slice(0,start)+segment.replace(before,`if ((root.name ?? root.call?.name) === 'image_generate') { for (const block of root.content ?? []) if(block.type === 'image' && block.attachment) linkedImages.add(block.attachment.attachmentId); }
                else ${before}`)+source.slice(end)
 return source
}
