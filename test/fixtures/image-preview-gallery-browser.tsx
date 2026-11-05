import * as React from 'react'
import * as JSX from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import {createRoot} from 'react-dom/client'
const w=window as any
const ui=w.imagePreviewFactory(React,JSX,ReactDOM)
const root=createRoot(document.getElementById('app')!)
w.imagePreviewHarness=(options:any={})=>{
 const calls:Record<string,number>={},size=options.count??4,english=options.english===true
 document.documentElement.lang=english?'en':'zh'
 const labels={image:'Image',loading:english?'Loading…':'正在载入…',loadFailed:english?'Retry image':'重新载入图片',open:english?'Open image':'放大图片',openNamed:(name:string)=>(english?'Open ':'放大 ')+name,lightbox:{dialog:english?'Image preview':'图片预览',close:english?'Close':'关闭'}}
 const image=(i:number)=>({attachment:{attachmentId:'image-'+i,name:'page-'+(i+1)+'.svg',width:options.sizes?.[i]?.width??960,height:options.sizes?.[i]?.height??540,mediaType:'image/svg+xml'}})
 const load=async(attachment:any)=>{
  const id=attachment.attachmentId,c=calls[id]=(calls[id]??0)+1
  if(c>1&&options.delays?.[id])await new Promise(resolve=>setTimeout(resolve,options.delays[id]))
  if(options.fail===id&&c<=2)throw Error('Unavailable')
  return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+attachment.width+'" height="'+attachment.height+'" viewBox="0 0 960 540" preserveAspectRatio="none"><rect width="960" height="540" fill="'+(id==='image-0'?'#e8eff7':id==='image-1'?'#ccddeb':'#e4e8f1')+'"/><text x="56" y="95" font-family="sans-serif" font-size="40" fill="#005bac">Research · '+attachment.name+'</text><path d="M60 420 220 310 420 350 600 170 900 95" stroke="#005bac" stroke-width="4" fill="none"/></svg>')
 }
 root.render(<main><button id="outside">Other control</button><section aria-label="First group"><ui.ImageGallery images={Array.from({length:size},(_,i)=>image(i))} load={load} labels={labels}/></section><section aria-label="Other group"><ui.ImageGallery images={[image(10),image(11)]} load={load} labels={labels}/></section></main>)
 return calls
}
w.imagePreviewUnmount=()=>root.render(null)
