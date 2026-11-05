import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {JSDOM} from 'jsdom'
import * as react from 'react'
import * as jsx from 'react/jsx-runtime'
import * as dom from 'react-dom'
import {createRoot} from 'react-dom/client'
import {buildSync} from 'esbuild'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const {patchImageGenerationClient}=createRequire(import.meta.url)('../scripts/lib/image-generation-client.mjs')
const nativeCode=buildSync({stdin:{resolveDir:process.cwd(),contents:"export {ImageGallery} from '@deepseek-ai/dsh-client-ui-attachment';export {Menu} from '@deepseek-ai/dsh-client-ui-primitives'"},bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react/jsx-runtime']}).outputFiles[0].text
const native={exports:{}}
new Function('require','module','exports',nativeCode)(createRequire(import.meta.url),native,native.exports)
const {ImageGallery,Menu}=native.exports
const patched=patchImageGenerationClient(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
const start=patched.indexOf('/* ODYSSEY_CONVERSATION_IMAGE_GENERATION_V2 */'),end=patched.indexOf('function ToolImageOutputs(',start)
const {ImageGenerationOutputs}=new Function('react','react_jsx_runtime','react_dom','_deepseek_ai_dsh_client_ui_attachment','_deepseek_ai_dsh_client_ui_primitives','messageImageLabels',patched.slice(start,end)+';return {ImageGenerationOutputs}')(react,jsx,dom,{ImageGallery},{Menu},()=>({open:'查看原图',openNamed:()=> '查看原图',image:'图片',loading:'载入中',loadFailed:'重试',lightbox:{dialog:'原图预览',close:'关闭原图预览'}}))
const image={attachmentId:'image',mediaType:'image/png',name:'原图.png',width:1024,height:1024,bytes:64}
const pending={name:'image_generate',callId:'one',argsRaw:'{}'}
const done={kind:'tool-result',call:{name:'image_generate'},callId:'one',content:[{type:'text',text:JSON.stringify({kind:'odyssey-image-generation',ok:true,image})},{type:'image',attachment:image}]}
let root,host
let page
globalThis.IS_REACT_ACT_ENVIRONMENT=true
beforeEach(()=>{page=new JSDOM('<html><body></body></html>',{url:'http://localhost'});for(const name of ['window','document','HTMLElement','Node','MouseEvent','KeyboardEvent'])vi.stubGlobal(name,name==='window'?page.window:name==='document'?page.window.document:page.window[name])})
afterEach(async()=>{if(root)await react.act(()=>root.unmount());host?.remove();page.window.close();vi.unstubAllGlobals()})
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
it('uses the shared menu for thumbnails and lightboxes, keeps Escape local, and acts on original bytes',async()=>{
 const original=new Uint8Array([1,2,3]),action=vi.fn(async()=>({ok:true}))
 window.dshDesktop={imageAction:action}
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,blob:async()=>({type:'image/png',size:3,arrayBuffer:async()=>original.buffer})})))
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
