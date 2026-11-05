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
.odyssey-image-generation-stage{position:relative;aspect-ratio:var(--image-ratio,1);overflow:hidden;border-radius:18px;isolation:isolate;background:#ececf1;display:grid;place-items:center;border:1px solid color-mix(in srgb,currentColor 7%,transparent)}
.odyssey-image-generation[data-state=running] .odyssey-image-generation-stage:before,.odyssey-image-generation[data-state=running] .odyssey-image-generation-stage:after{content:'';position:absolute;inset:-45%;pointer-events:none;z-index:-1;will-change:transform;filter:blur(26px)}
.odyssey-image-generation[data-state=running] .odyssey-image-generation-stage:before{background:conic-gradient(from 30deg,#e9d9eb,#c6dbea,#e8e3f3,#f1ddd7,#e9d9eb);animation:odyssey-image-flow 9s linear infinite}
.odyssey-image-generation[data-state=running] .odyssey-image-generation-stage:after{background:radial-gradient(ellipse at 35% 30%,#ffffffaa,transparent 55%),radial-gradient(ellipse at 70% 70%,#cdbde7bb,transparent 50%);animation:odyssey-image-drift 6s ease-in-out infinite alternate}
.odyssey-image-generation-status{display:flex;align-items:center;gap:8px;position:absolute;left:18px;bottom:18px;max-width:calc(100% - 36px);padding:8px 12px;border-radius:20px;background:#ffffffb3;backdrop-filter:blur(12px);color:#4b4759;font:500 13px/20px var(--odyssey-font-ui,system-ui,sans-serif)}
.odyssey-image-generation-status svg{width:16px;height:16px;flex:none}.odyssey-image-generation[data-state=running] .odyssey-image-generation-status svg{animation:odyssey-image-pulse 2.6s ease-in-out infinite}
.odyssey-image-generation figcaption{margin:8px 2px 0;font:400 12px/18px var(--odyssey-font-ui,system-ui,sans-serif);color:var(--dsw-alias-label-tertiary,#777)}
.odyssey-image-generation[data-state=failed] .odyssey-image-generation-stage,.odyssey-image-generation[data-state=cancelled] .odyssey-image-generation-stage,.odyssey-image-generation[data-state=interrupted] .odyssey-image-generation-stage{background:var(--dsw-alias-bg-l1,#f4f4f6)}
.odyssey-image-generation-result{border-radius:18px;overflow:hidden;max-width:100%}
.odyssey-image-generation-result img{display:block;max-width:100%;height:auto}
body[data-ds-dark-theme] .odyssey-image-generation-stage{background:#2b2a35}
body[data-ds-dark-theme] .odyssey-image-generation[data-state=running] .odyssey-image-generation-stage:before{background:conic-gradient(from 30deg,#49394f,#324a60,#4b4264,#5a3c44,#49394f)}
body[data-ds-dark-theme] .odyssey-image-generation[data-state=running] .odyssey-image-generation-stage:after{opacity:.25}
body[data-ds-dark-theme] .odyssey-image-generation-status{background:#25232dbb;color:#eee8f5}
@keyframes odyssey-image-flow{from{transform:rotate(0deg) scale(1)}to{transform:rotate(360deg) scale(1)}}
@keyframes odyssey-image-drift{from{transform:translate(-7%,-4%) scale(.9)}to{transform:translate(7%,4%) scale(1.1)}}
@keyframes odyssey-image-pulse{0%,100%{opacity:.55}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){.odyssey-image-generation *,.odyssey-image-generation-stage:before,.odyssey-image-generation-stage:after{animation:none!important;will-change:auto!important}}
`

function ImageGenerationOutputs({nodes,running,loadImage,t}){
 const calls=imageGenerationCalls(nodes,running)
 if(!calls.length)return null
 const jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs,en=document.documentElement.dataset.odysseyLocale==='en'
 const labels=en?{running:'Creating your image',completed:'Image ready · Click to view or download',cancelled:'Image generation cancelled',failed:'Image generation failed',interrupted:'Image generation interrupted'}:{running:'正在生成图片',completed:'图片已生成 · 点击查看或下载',cancelled:'已取消生成',failed:'图片生成失败',interrupted:'图片生成已中断'}
 return jsx('div',{className:'odyssey-image-generations',children:calls.map(call=>jsxs('figure',{className:'odyssey-image-generation','data-state':call.state,'data-image-call-id':call.id,style:{'--image-ratio':call.ratio},'aria-label':labels[call.state],children:[
  call.state==='completed'?jsx('div',{className:'odyssey-image-generation-result',children:jsx(_deepseek_ai_dsh_client_ui_attachment.ImageGallery,{images:[{attachment:call.image}],load:loadImage??(()=>Promise.reject(new Error(t('image.serviceUnavailable')))),align:'start',labels:messageImageLabels(t)})}):jsx('div',{className:'odyssey-image-generation-stage','aria-busy':call.state==='running',children:jsxs('div',{className:'odyssey-image-generation-status',role:'status','aria-live':'polite',children:[jsx('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true,children:jsx('path',{d:'m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z'})}),labels[call.state]]})}),
  jsx('figcaption',{children:call.state==='running'?(en?'The result will appear here when ready':'完成后，图片会直接显示在这里'):labels[call.state]})
 ]},call.id))})
}

export function patchImageGenerationClient(source){
 const marker='/* ODYSSEY_CONVERSATION_IMAGE_GENERATION_V1 */'
 if(source.includes(marker))return source
 const replace=(before,after)=>{if(source.split(before).length!==2)throw Error('Image generation client anchor drifted: '+before.slice(0,90));source=source.replace(before,()=>after)}
 const functions=`${marker}\n${imageGenerationCalls.toString()}\n${ImageGenerationOutputs.toString()}\nif(typeof document!=='undefined'&&!document.getElementById('odyssey-image-generation-style')){const style=document.createElement('style');style.id='odyssey-image-generation-style';style.textContent=${JSON.stringify(IMAGE_GENERATION_CSS)};document.head.append(style)}\n`
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
