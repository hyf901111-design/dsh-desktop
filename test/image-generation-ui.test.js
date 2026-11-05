import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {JSDOM} from 'jsdom'
import * as react from 'react'
import * as jsx from 'react/jsx-runtime'
import * as dom from 'react-dom'
import {createRoot} from 'react-dom/client'
import {buildSync} from 'esbuild'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const {patchImageGenerationClient,IMAGE_GENERATION_CSS}=createRequire(import.meta.url)('../scripts/lib/image-generation-client.mjs')
const nativeCode=buildSync({stdin:{resolveDir:process.cwd(),contents:"export {ImageGallery} from '@deepseek-ai/dsh-client-ui-attachment';export {Menu} from '@deepseek-ai/dsh-client-ui-primitives'"},bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react/jsx-runtime']}).outputFiles[0].text
const native={exports:{}}
new Function('require','module','exports',nativeCode)(createRequire(import.meta.url),native,native.exports)
const {ImageGallery,Menu}=native.exports
const patched=patchImageGenerationClient(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
const start=patched.indexOf('/* ODYSSEY_CONVERSATION_IMAGE_GENERATION_V4 */'),end=patched.indexOf('function ToolImageOutputs(',start)
const labels={open:'查看原图',openNamed:name=>name,image:'图片',loading:'载入中',loadFailed:'重试',lightbox:{dialog:'原图预览',close:'关闭原图预览'}}
const {ImageGenerationOutputs,mountImageContextMenu}=new Function('react_jsx_runtime','_deepseek_ai_dsh_client_ui_attachment','messageImageLabels',patched.slice(start,end)+';return {ImageGenerationOutputs,mountImageContextMenu}')(jsx,{ImageGallery},()=>labels)
const image={attachmentId:'image',mediaType:'image/png',name:'原图.png',width:1024,height:1024,bytes:64}
const pending={name:'image_generate',callId:'one',argsRaw:'{}'}
const done={kind:'tool-result',call:{name:'image_generate'},callId:'one',content:[{type:'text',text:JSON.stringify({kind:'odyssey-image-generation',ok:true,image})},{type:'image',attachment:image}]}
let root,host,disposeMenu
let page
globalThis.IS_REACT_ACT_ENVIRONMENT=true
beforeEach(()=>{
 page=new JSDOM('<html><body></body></html>',{url:'http://localhost'})
 for(const name of ['window','document','HTMLElement','HTMLImageElement','Node','MouseEvent','KeyboardEvent'])vi.stubGlobal(name,name==='window'?page.window:name==='document'?page.window.document:page.window[name])
 Object.defineProperties(HTMLImageElement.prototype,{complete:{get:()=>true},naturalWidth:{get:()=>1},naturalHeight:{get:()=>1}})
 window.dshDesktop={imageAction:vi.fn(async()=>({ok:true}))}
 disposeMenu=mountImageContextMenu({jsx:jsx.jsx,Menu,createRoot,createPortal:dom.createPortal})
})
beforeEach(()=>{const style=document.createElement('style');style.textContent=IMAGE_GENERATION_CSS;document.head.append(style)})
afterEach(async()=>{await react.act(()=>{disposeMenu?.();root?.unmount()});root=undefined;host?.remove();page.window.close();vi.unstubAllGlobals()})
const render=async data=>{
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
 const load=vi.fn(async()=> 'blob:http://localhost/original')
 await react.act(()=>root.render(jsx.jsx(ImageGenerationOutputs,{nodes:[{kind:'tool-call',data:{root:data}}],running:true,loadImage:load,t:v=>v})))
 return load
}
const fire=async(el,type,props={})=>react.act(()=>el.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,...props})))
it('omits redundant captions and renders the live field plus solid breathing star',async()=>{
 await render(pending)
 expect(host.querySelector('figcaption')).toBeNull()
 expect(host.textContent).toBe('正在生成图片')
 expect(host.querySelector('canvas[data-odyssey-image-flow]')).not.toBeNull()
 expect(host.querySelector('svg').getAttribute('fill')).toBe('currentColor')
 await react.act(()=>root.render(jsx.jsx(ImageGenerationOutputs,{nodes:[{kind:'tool-call',data:{root:{...done,isError:true}}}],running:false,t:v=>v})))
 expect(host.querySelector('canvas')).toBeNull()
})
it('keeps image context-menu anchors out of page flow so opening a menu cannot add a viewport scrollbar',async()=>{
 await render(done)
 const inFlowExtras=()=>[...document.body.children].filter(el=>el!==host&&el.getAttribute('role')!=='menu'&&!['fixed','absolute'].includes(window.getComputedStyle(el).position))
 expect(inFlowExtras()).toEqual([])
 await fire(host.querySelector('img'),'contextmenu',{clientX:20,clientY:30})
 expect(document.querySelector('[role=menu]')).not.toBeNull()
 expect(inFlowExtras()).toEqual([])
 await react.act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})))
 expect(document.querySelector('[role=menu]')).toBeNull()
 expect(inFlowExtras()).toEqual([])
})
it('uses the shared menu for thumbnails and lightboxes, keeps Escape local, and acts on original bytes',async()=>{
 const original=new Uint8Array([1,2,3]),action=window.dshDesktop.imageAction
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(original,{headers:{'Content-Type':'image/png'}})))
 await render(done)
 const options=()=>[...document.querySelectorAll('[role=menuitem]')].map(el=>el.textContent)
 await fire(host.querySelector('img'),'contextmenu',{clientX:20,clientY:30})
 expect(options()).toEqual(['复制图片','下载图片'])
 await fire(document.querySelector('[data-odyssey-image-action=copy]').closest('button'),'click')
 expect(action).toHaveBeenLastCalledWith({action:'copy',name:'原图.png',data:original})
 await fire(host.querySelector('button[data-variant=single]'),'click')
 let dialog=document.querySelector('[role=dialog]')
 expect(dialog).not.toBeNull()
 await fire(dialog.querySelector('img'),'contextmenu',{clientX:50,clientY:60})
 expect(options()).toEqual(['复制图片','下载图片'])
 expect(dialog.querySelector('[role=menu]')).not.toBeNull()
 await react.act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})))
 expect(document.querySelector('[role=menu]')).toBeNull();expect(document.querySelector('[role=dialog]')).not.toBeNull()
 await fire(dialog.querySelector('img'),'contextmenu')
 await fire(document.querySelector('[data-odyssey-image-action=download]').closest('button'),'click')
 expect(action).toHaveBeenLastCalledWith({action:'download',name:'原图.png',data:original})
 expect(fetch).toHaveBeenLastCalledWith('blob:http://localhost/original')
})
it('shows the same actions on ordinary gallery images and copies the image that was right-clicked',async()=>{
 document.documentElement.lang='en'
 const first=new Uint8Array([1,2,3]),second=new Uint8Array([4,5,6])
 vi.stubGlobal('fetch',vi.fn(async src=>new Response(src.endsWith('/first')?first:second,{headers:{'Content-Type':'image/png'}})))
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
 const images=[{attachment:{...image,attachmentId:'first',name:'First.png'}},{attachment:{...image,attachmentId:'second',name:'Second.png'}}]
 await react.act(()=>root.render(jsx.jsx(ImageGallery,{images,labels,load:async file=>'blob:http://localhost/'+file.attachmentId})))
 const thumbnails=host.querySelectorAll('img')
 await fire(thumbnails[0],'contextmenu',{clientX:20,clientY:30})
 await fire(thumbnails[1],'contextmenu',{clientX:40,clientY:50})
 expect([...document.querySelectorAll('[role=menuitem]')].map(el=>el.textContent)).toEqual(['Copy Image','Download Image'])
 await fire(document.querySelector('[data-odyssey-image-action=copy]').closest('button'),'click')
 expect(window.dshDesktop.imageAction).toHaveBeenCalledExactlyOnceWith({action:'copy',name:'Second.png',data:second})
 expect(document.querySelector('[role=menu]')).toBeNull()
})
