/** These functions are deliberately self contained: main injects their fixed source into trusted frames. */
export type NoteComponentSnapshot = {blockId:string;dataUrl:string;width:number;height:number}
export type FrozenNoteComponent = {html:string;width:number;height:number;frames:Array<{name:string;width:number;height:number}>}
export async function freezeNoteSnapshotElement(element:Element,prefix:string,viewport?:{width:number;height:number},cancelled?:()=>boolean):Promise<FrozenNoteComponent>{
 const leases:Array<{release():void}>=[],check=()=>{if(cancelled?.())throw Error('组件快照已取消，笔记内容已保留。')}
 try{
 check()
 for(const host of [element,...element.querySelectorAll('*')]){const prepare=(host as any).__sherlockPrepareNoteSnapshot;if(typeof prepare==='function'){leases.push(await prepare());check()}}
 const doc=element.ownerDocument,win=doc.defaultView!
 // The shared workbench protocol owns this marker until its finite palette
 // transitions finish. Freeze source computed styles only after that barrier,
 // never wait for arbitrary chart/decoration animations or guess CSS duration.
 const themeRoot=doc.documentElement
 if(themeRoot.hasAttribute('data-workbench-style')||themeRoot.hasAttribute('data-workbench-transition')){
  const deadline=Date.now()+1200,stable=()=>{check();if(Date.now()>deadline)throw Error('组件主题尚未稳定，请稍后重新导出。')}
  const paint=()=>new Promise<void>((resolve,reject)=>{
   let frame=0
   const finish=(error?:unknown)=>{win.clearInterval(timer);win.cancelAnimationFrame(frame);error?reject(error):resolve()}
   const timer=win.setInterval(()=>{try{stable()}catch(error){finish(error)}},16)
   frame=win.requestAnimationFrame(()=>{try{stable();finish()}catch(error){finish(error)}})
  })
  do{
   while(themeRoot.hasAttribute('data-workbench-transition')){stable();await new Promise(resolve=>win.setTimeout(resolve,16))}
   await paint();await paint();stable()
  }while(themeRoot.hasAttribute('data-workbench-transition'))
 }
 const box=element.getBoundingClientRect(),width=Math.ceil(viewport?.width||box.width),height=Math.ceil(viewport?.height||box.height)
 if(!width||!height||width>2200||height>3000)throw Error('组件尺寸暂不适合导出，请调整组件大小后重试。')
 for(const host of element.querySelectorAll('.en-native-component-host,.en-file-host')){
  if(!host.children.length||host.matches('.en-file-host:not([data-note-file-rendered])'))throw Error('组件预览尚未就绪，请等待载入完成后重试。')
 }
 if(!element.textContent?.trim()&&!element.querySelector('canvas,img,svg,iframe,audio,video,[data-slide-index]'))throw Error('组件预览尚未就绪，请等待载入完成后重试。')
 const frames:FrozenNoteComponent['frames']=[],properties=('display position top right bottom left z-index box-sizing width height min-width max-width min-height max-height margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left border-top border-right border-bottom border-left border-radius border-collapse border-spacing background-color background-image background-size background-position background-repeat color opacity overflow overflow-x overflow-y font-family font-size font-weight font-style font-variant font-feature-settings line-height letter-spacing word-spacing text-align text-indent text-transform text-decoration white-space word-break overflow-wrap text-overflow vertical-align list-style-type list-style-position flex flex-direction flex-wrap flex-grow flex-shrink flex-basis align-items align-content align-self justify-content justify-items justify-self gap row-gap column-gap order grid-template-columns grid-template-rows grid-column grid-row grid-auto-flow grid-auto-columns grid-auto-rows transform transform-origin object-fit object-position aspect-ratio fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-opacity clip-path filter visibility box-shadow outline').split(' ')
 let nodes=0
 const omitted='.en-component-resize,.en-component-scroll-guard,.sherlock-ppt-selection,.sherlock-ppt-format,[data-pptx-handle],[data-note-export-omit]'
 const imageData=(image:HTMLImageElement)=>{
  if(!image.complete||!image.naturalWidth||!image.naturalHeight)throw Error('组件图片尚未载入，请等待预览完成后重试。')
  const source=image.currentSrc||image.src
  if(/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(source))return source
  try{const canvas=doc.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;if(canvas.width*canvas.height>20000000)throw Error();const context=canvas.getContext('2d');if(!context)throw Error();context.drawImage(image,0,0);return canvas.toDataURL('image/png')}catch{throw Error('组件图片无法离线冻结，请重新载入预览后重试。')}
 }
 const freezeUrls=(value:string)=>value.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi,(_all,_quote,url:string)=>{
  if(url.startsWith('#')||/^data:image\//i.test(url))return `url("${url.replace(/"/g,'%22')}")`
  try{const target=new URL(url,doc.baseURI),base=new URL(doc.URL);if(target.hash&&target.origin===base.origin&&target.pathname===base.pathname&&target.search===base.search)return `url("${target.hash}")`}catch{}
  const loaded=[...doc.querySelectorAll<HTMLImageElement>('img')].find(image=>(image.currentSrc||image.src)===url)
  if(!loaded)throw Error('组件含有无法冻结的图片资源，请等待完整预览后重试。')
  return `url("${imageData(loaded)}")`
 })
 const applyStyle=(target:Element,style:CSSStyleDeclaration)=>{
  const output=(target as HTMLElement).style
  for(const key of properties){let value=style.getPropertyValue(key);if(!value)continue;if(value.includes('url('))value=freezeUrls(value);output.setProperty(key,value)}
  output.setProperty('animation','none');output.setProperty('transition','none');output.setProperty('caret-color','transparent')
 }
 const copy=async(source:Node,clip:{left:number;top:number;right:number;bottom:number}):Promise<Node|null>=>{
  check()
  if(++nodes>16000)throw Error('组件内容过大，请缩小当前预览后重试。')
  if(source.nodeType===3)return doc.createTextNode(source.textContent||'')
  if(source.nodeType!==1)return null
  const input=source as Element,tag=input.tagName.toLowerCase()
  if(['script','style','link','meta','base','object','embed'].includes(tag)){
   if(['object','embed'].includes(tag))throw Error('此组件预览暂不支持离线快照。')
   return null
  }
  if(input.matches(omitted))return null
  const computed=win.getComputedStyle(input)
  if(computed.display==='none'||computed.visibility==='hidden'||computed.visibility==='collapse')return null
  const bounds=input.getBoundingClientRect(),outside=input!==element&&bounds.width>0&&bounds.height>0&&(bounds.right<=clip.left||bounds.left>=clip.right||bounds.bottom<=clip.top||bounds.top>=clip.bottom)
  const nextClip={...clip}
  if(/^(auto|scroll|hidden|clip)$/.test(computed.overflowX||computed.overflow)&&bounds.width){nextClip.left=Math.max(clip.left,bounds.left);nextClip.right=Math.min(clip.right,bounds.right)}
  if(/^(auto|scroll|hidden|clip)$/.test(computed.overflowY||computed.overflow)&&bounds.height){nextClip.top=Math.max(clip.top,bounds.top);nextClip.bottom=Math.min(clip.bottom,bounds.bottom)}
  if(!outside){
   if(input.matches('[data-research-offscreen-placeholder]'))throw Error('组件预览已暂停，请打开组件并等候载入后导出。')
   if(input.matches('canvas[data-research-pdf-preview]:not([data-research-pdf-rendered-page]),canvas[aria-label^="PDF 第"]:not([data-pdf-rendered])'))throw Error('PDF 当前页尚未绘制，请等待预览完成后重试。')
   if(input.matches('[data-slide-index]')&&!input.firstElementChild?.firstElementChild)throw Error('PPT 当前页预览已暂停，请打开组件并等候载入后导出。')
  }
  let output:Element
  if(outside){output=doc.createElement('div')}
  else if(tag==='audio'||tag==='video'){
   const media=input as HTMLMediaElement,clock=(seconds:number)=>Number.isFinite(seconds)?Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0'):'--:--'
   output=doc.createElement('div')
   if(tag==='video'){
    const video=input as HTMLVideoElement
    if(video.readyState>=2&&video.videoWidth&&video.videoHeight){
     const canvas=doc.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight
     try{const context=canvas.getContext('2d');if(!context)throw Error();context.drawImage(video,0,0);const image=doc.createElement('img');image.src=canvas.toDataURL('image/png');image.style.cssText='width:100%;height:calc(100% - 32px);object-fit:contain';output.append(image)}catch{throw Error('视频当前帧无法离线冻结，请重新载入预览后重试。')}
    }else{const empty=doc.createElement('div');empty.textContent='▶ 视频预览尚未载入';empty.style.cssText='display:grid;place-items:center;min-height:100px;background:#20242a;color:white';output.append(empty)}
   }
   const controls=doc.createElement('div');controls.textContent=(media.paused?'▶ ':'Ⅱ ')+clock(media.currentTime)+' / '+clock(media.duration);controls.style.cssText='box-sizing:border-box;display:flex;align-items:center;height:32px;padding:0 12px;background:#eceff1;color:#20242a;font:12px system-ui';output.append(controls)
  }
  else if(tag==='canvas'){
   const canvas=input as HTMLCanvasElement;if(!canvas.width||!canvas.height)throw Error('组件画布尚未绘制，请等待预览完成后重试。')
   output=doc.createElement('img');try{output.setAttribute('src',canvas.toDataURL('image/png'))}catch{throw Error('组件画布无法离线冻结，请重新载入预览后重试。')}
  }else if(tag==='iframe'){
   const frame=input as HTMLIFrameElement,name=prefix+'-'+frames.length,frameBox=frame.getBoundingClientRect()
   frames.push({name,width:Math.ceil(frameBox.width||frame.clientWidth||300),height:Math.ceil(frameBox.height||frame.clientHeight||150)})
   frame.setAttribute('data-note-snapshot-frame-owner',prefix);frame.setAttribute('data-note-snapshot-previous-name',frame.getAttribute('name')??'');frame.name=name
   output=doc.createElement('div');output.append(doc.createComment('note-snapshot:'+name))
  }else{
   output=['textarea','body','html'].includes(tag)?doc.createElement('div'):doc.createElementNS(input.namespaceURI||'http://www.w3.org/1999/xhtml',input.tagName)
   for(const attribute of [...input.attributes]){
    const name=attribute.name.toLowerCase()
    if(name.startsWith('on')||['style','src','srcset','srcdoc','href','xlink:href','action','formaction','contenteditable','draggable','autofocus','loading','name'].includes(name))continue
    output.setAttribute(attribute.name,attribute.value)
   }
   if(tag==='img')output.setAttribute('src',imageData(input as HTMLImageElement))
   if(input.namespaceURI==='http://www.w3.org/2000/svg'&&['use','image'].includes(tag)){
    const href=input.getAttribute('href')||input.getAttribute('xlink:href')||''
    if(href&&!href.startsWith('#')&&!/^data:image\//i.test(href))throw Error('组件 SVG 含有无法冻结的外部资源。')
    if(href)output.setAttribute('href',href)
   }
   if(tag==='input'){output.setAttribute('value',(input as HTMLInputElement).value);if((input as HTMLInputElement).checked)output.setAttribute('checked','');else output.removeAttribute('checked')}
   if(tag==='textarea')output.textContent=(input as HTMLTextAreaElement).value
   if(tag==='option'){if((input as HTMLOptionElement).selected)output.setAttribute('selected','');else output.removeAttribute('selected')}
   if(tag!=='textarea')for(const child of [...input.childNodes]){const cloned=await copy(child,nextClip);if(cloned)output.append(cloned)}
  }
  applyStyle(output,computed)
  if(tag==='canvas'){(output as HTMLElement).style.width=computed.width;(output as HTMLElement).style.height=computed.height}
  if(input===element){const style=(output as HTMLElement).style;style.outline='none';style.boxShadow='none';if(!viewport){style.margin='0';style.transform='none';style.width=width+'px';style.height=height+'px'}else if(win.scrollX||win.scrollY)style.transform=`translate(${-win.scrollX}px, ${-win.scrollY}px)`;style.maxWidth='none';style.maxHeight='none'}
  const sx=(input as HTMLElement).scrollLeft||0,sy=(input as HTMLElement).scrollTop||0
  if((sx||sy)&&!output.children.length&&output.textContent){const text=doc.createElement('span');text.style.cssText='display:block;white-space:inherit';text.textContent=output.textContent;output.replaceChildren(text)}
  if(tag==='textarea')(output as HTMLElement).style.whiteSpace=computed.whiteSpace||'pre-wrap'
  if(sx||sy)for(const child of [...output.children]){const style=(child as HTMLElement).style;if(style.display==='inline')style.display='inline-block';style.transform=`translate(${-sx}px, ${-sy}px) ${style.transform==='none'?'':style.transform}`.trim()}
  return output
 }
 const clip=viewport?{left:0,top:0,right:width,bottom:height}:{left:box.left,top:box.top,right:box.left+width,bottom:box.top+height}
 const clone=await copy(element,clip) as Element
 const html=`<div style="position:relative;width:${width}px;height:${height}px;overflow:hidden">${clone.outerHTML}</div>`
 if(html.length>24*1024*1024)throw Error('组件快照内容过大，请缩小预览后重试。')
 return {html,width,height,frames}
 }finally{for(const lease of leases.reverse())lease.release()}
}
export function restoreNoteSnapshotFrameNames(doc:Document,prefix:string):void{
 for(const frame of doc.querySelectorAll<HTMLIFrameElement>('iframe[data-note-snapshot-frame-owner]')){
  if(frame.getAttribute('data-note-snapshot-frame-owner')!==prefix)continue
  const previous=frame.getAttribute('data-note-snapshot-previous-name')||''
  if(previous)frame.name=previous;else frame.removeAttribute('name')
  frame.removeAttribute('data-note-snapshot-frame-owner');frame.removeAttribute('data-note-snapshot-previous-name')
 }
}
