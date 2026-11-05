import {parse} from '@babel/parser'

const START='/* ework:image-preview-gallery:v1 */',END='/* ework:image-preview-gallery:end */'

function EworkImageLightbox({src,alt,labels,onClose,index=0,total=1,onPrevious,onNext,children,runtime}) {
 const {react,portal}=runtime,h=react.createElement,root=react.useRef(null),close=react.useRef(null),actions=react.useRef(null)
 actions.current={onClose,onPrevious,onNext,index,total}
 const english=document.documentElement.dataset.odysseyLocale==='en'||document.documentElement.lang?.startsWith('en')
 react.useEffect(()=>{
  const opener=document.activeElement
  close.current?.focus({preventScroll:true})
  const keydown=event=>{
   const a=actions.current
   if(event.ctrlKey||event.metaKey||event.altKey)return
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();a.onClose()}
   else if(a.total>1&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){
    event.preventDefault();event.stopImmediatePropagation()
    if(event.key==='ArrowLeft'&&a.index>0)a.onPrevious?.()
    if(event.key==='ArrowRight'&&a.index<a.total-1)a.onNext?.()
   }else if(event.key==='Tab'){
    const buttons=[...root.current.querySelectorAll('button:not(:disabled)')]
    // A navigation button can become disabled (or a retry button disappear)
    // while focused. Recover to an enabled control instead of tabbing behind the modal.
    const current=buttons.indexOf(document.activeElement)
    const next=event.shiftKey?(current<=0?buttons.length-1:current-1):(current+1)%buttons.length
    event.preventDefault();buttons[next]?.focus()
   }
  }
  window.addEventListener('keydown',keydown,true)
  return()=>{window.removeEventListener('keydown',keydown,true);if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true})}
 },[])
 const icon=path=>h('svg',{width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:path}))
 const button=(direction,label,disabled,action,path)=>h('button',{type:'button','data-image-preview-control':direction,'aria-label':label,disabled,onClick:action},icon(path))
 return portal(h('div',{ref:root,'data-image-preview-dialog':'',role:'dialog','aria-modal':true,'aria-label':labels.dialog},
  h('style',null,runtime.css),
  h('div',{'data-image-preview-mask':'','aria-hidden':true,onMouseDown:onClose}),
  h('div',{'data-image-preview-frame':''},
   children??h('img',{'data-image-preview-image':'',src,alt}),
   total>1&&h(react.Fragment,null,
    button('previous',english?'Previous image':'上一张图片',index<=0,onPrevious,'m14 6-6 6 6 6'),
    button('next',english?'Next image':'下一张图片',index>=total-1,onNext,'m10 6 6 6-6 6'))),
  h('button',{ref:close,type:'button','data-image-preview-control':'close','aria-label':labels.close,onClick:onClose},icon('M6 6l12 12M18 6 6 18')),
  total>1&&h('div',{'data-image-preview-counter':'',role:'status','aria-live':'polite','aria-atomic':true},(index+1)+' / '+total)
 ),document.body)
}

function EworkGalleryImage({attachment,load,initialSrc,labels,runtime}) {
 const {react}=runtime,h=react.createElement,[src,setSrc]=react.useState(initialSrc??null),[error,setError]=react.useState(false),[attempt,setAttempt]=react.useState(0)
 react.useEffect(()=>{
  let live=true
  setError(false);setSrc(attempt===0?initialSrc??null:null)
  if(attempt===0&&initialSrc)return
  Promise.resolve().then(()=>load(attachment)).then(url=>{if(live)setSrc(url)}).catch(()=>{if(live)setError(true)})
  return()=>{live=false}
 },[attachment,load,initialSrc,attempt])
 if(error)return h('button',{type:'button','data-image-preview-retry':'',onClick:()=>{setSrc(null);setAttempt(n=>n+1)}},labels.loadFailed)
 return src?h('img',{'data-image-preview-image':'',src,alt:attachment.name??labels.image,onError:()=>setError(true)}):h('div',{'data-image-preview-loading':'',role:'status'},labels.loading)
}

function EworkImageGallery({images,load,align,labels,runtime}) {
 const {react,MessageImage,ImageLightbox}=runtime,h=react.createElement,[selected,setSelected]=react.useState(null)
 const key=(image,index)=>image.attachment.attachmentId+':'+index
 const index=selected?images.findIndex((image,i)=>key(image,i)===selected.key):-1
 const close=react.useCallback(()=>setSelected(null),[])
 react.useEffect(()=>{if(selected&&index<0)close()},[selected,index,close])
 if(images.length===0)return null
 const move=delta=>{const next=index+delta;if(next>=0&&next<images.length)setSelected({key:key(images[next],next)})}
 return h(react.Fragment,null,
  h('div',{className:runtime.gallery,'data-align':align},images.map((image,i)=>h(MessageImage,{...image,load,variant:images.length===1?'single':'tile',labels,key:key(image,i),onOpen:src=>setSelected({key:key(image,i),src})}))),
  index>=0&&h(ImageLightbox,{labels:labels.lightbox,onClose:close,index,total:images.length,onPrevious:()=>move(-1),onNext:()=>move(1)},h(EworkGalleryImage,{key:selected.key,attachment:images[index].attachment,load,initialSrc:selected.src,labels,runtime})))
}

const CSS=`[data-image-preview-dialog]{position:fixed;inset:0;z-index:2147483500;display:flex;align-items:center;justify-content:center;padding:64px 80px;box-sizing:border-box;color:#fff;isolation:isolate}
[data-image-preview-mask]{position:absolute;inset:0;z-index:-1;background:rgba(0,0,0,.68);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
[data-image-preview-frame]{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:calc(100vh - 128px);max-width:1440px;pointer-events:none}
[data-image-preview-frame]>*{pointer-events:auto}
[data-image-preview-image]{display:block;max-width:calc(100% - 112px);max-height:100%;object-fit:contain;border-radius:10px}
[data-image-preview-control]{position:absolute;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:40px;height:40px;min-width:40px;padding:0;line-height:1;border:1px solid rgba(255,255,255,.1);border-radius:50%;background:rgba(60,60,62,.75);color:#fff;cursor:pointer;transition:background .15s,opacity .15s;backdrop-filter:blur(12px)}
[data-image-preview-control]>svg{display:block;flex:none;width:20px;height:20px;pointer-events:none}
[data-image-preview-control]:hover:not(:disabled){background:rgba(100,100,104,.85)}[data-image-preview-control]:disabled{opacity:.3;cursor:default}[data-image-preview-control]:focus-visible,[data-image-preview-retry]:focus-visible{outline:2px solid #72baff;outline-offset:3px}
[data-image-preview-control=close]{top:20px;right:20px}[data-image-preview-control=previous]{left:0;top:calc(50% - 20px)}[data-image-preview-control=next]{right:0;top:calc(50% - 20px)}
[data-image-preview-counter]{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);font:400 13px/24px system-ui;padding:2px 12px;border-radius:14px;background:rgba(35,35,38,.75);color:#fff;font-variant-numeric:tabular-nums}
[data-image-preview-retry],[data-image-preview-loading]{font:400 14px/24px system-ui;color:#fff;background:rgba(35,35,38,.8);border:0;border-radius:8px;padding:12px 20px}
@media(max-width:600px){[data-image-preview-dialog]{padding:64px 16px}[data-image-preview-image]{max-width:calc(100% - 96px)}[data-image-preview-control=close]{top:12px;right:12px}}
@media(prefers-reduced-motion:reduce){[data-image-preview-control]{transition:none}}`

function once(source,before,after){if(source.split(before).length!==2)throw Error('Image gallery anchor drifted: '+before.slice(0,90));return source.replace(before,after)}
function replaceFunction(source,name,replacement){
 const ast=parse(source,{sourceType:'module'}),node=ast.program.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name===name)
 if(!node)throw Error('Image gallery function missing: '+name)
 return source.slice(0,node.start)+replacement+source.slice(node.end)
}
export function patchImagePreviewGallery(source,web=false){
 if(source.includes(START)){
  const a=source.indexOf(START),b=source.indexOf(END,a)
  if(source.split(START).length!==2||b<a)throw Error('Image gallery owner boundary drifted')
  const runtime=source.slice(a,b).match(/const eworkImagePreviewRuntime=([^\n]+);/)
  if(!runtime)throw Error('Image gallery runtime missing')
  return source.slice(0,a)+definition(runtime[1],web)+source.slice(b+END.length)
 }
 const lightbox=web?'Nc':'ImageLightbox',gallery=web?'Im':'ImageGallery',message=web?'Rc':'MessageImage'
 // Fail closed if the frozen frontend renames its native attachment exports.
 if(web&&!source.includes('ImageGallery:Im,ImageLightbox:Nc,MessageImage:Rc'))throw Error('Image gallery frontend exports drifted')
 source=replaceFunction(source,lightbox,`function ${lightbox}(props){return eworkImagePreviewRuntime.react.createElement(EworkImageLightbox,{...props,runtime:eworkImagePreviewRuntime})}`)
 source=replaceFunction(source,gallery,`function ${gallery}(props){return eworkImagePreviewRuntime.react.createElement(EworkImageGallery,{...props,runtime:eworkImagePreviewRuntime})}`)
 if(web){source=once(source,'function Rc({attachment:n,load:r,variant:i,labels:s})','function Rc({attachment:n,load:r,variant:i,labels:s,onOpen:eworkOpen})');source=once(source,'u!==null&&C(!0)','u!==null&&(eworkOpen?eworkOpen(u):C(!0))')}
 else{source=once(source,'function MessageImage({ attachment, load, variant, labels })','function MessageImage({ attachment, load, variant, labels, onOpen })');source=once(source,'if (src !== null) setOpen(true);','if (src !== null) { if(onOpen)onOpen(src);else setOpen(true); }')}
 const runtime=web?'{react:R,portal:ln.createPortal,MessageImage:Rc,ImageLightbox:Nc,gallery:Wo.gallery}':'{react:{createElement:jsxElement,Fragment,useRef,useEffect,useState,useCallback},portal:createPortal,MessageImage,ImageLightbox,gallery:MessageImage_module_css_default.gallery}'
 // Runtime is read only after module initialization; keep function declarations hoisted.
 const at=web?source.indexOf('const $m='):source.indexOf('export { AttachmentRail,')
 if(at<0)throw Error('Image gallery insertion missing')
 return source.slice(0,at)+definition(runtime,web)+source.slice(at)
}
function definition(runtime,web=true){return START+'\n'+(!web?'const jsxElement=(type,props,...children)=>jsx(type,{...props,...(children.length?{children:children.length===1?children[0]:children}:{})});\n':'')+[EworkImageLightbox,EworkGalleryImage,EworkImageGallery].map(fn=>fn.toString()).join('\n')+'\nconst eworkImagePreviewRuntime='+runtime+';\neworkImagePreviewRuntime.css='+JSON.stringify(CSS)+';\n'+END}
