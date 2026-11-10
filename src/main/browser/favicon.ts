import type {WebContents} from 'electron'
import {browserAddress} from './model'

const maxBytes=262144
const inlineFavicon=(value:unknown):value is string=>typeof value==='string'&&value.length<=maxBytes&&Buffer.byteLength(value,'utf8')<=maxBytes&&/^data:image\/(png|jpeg|gif|webp|x-icon|vnd.microsoft.icon|svg\+xml|avif)(?:;(?:charset=[\w-]+|utf8))?(?:;base64)?,/i.test(value)
export function browserFaviconAddress(value:unknown){
 if(typeof value!=='string'||!/^https?:\/\//i.test(value))throw Error('网页图标仅支持 HTTP(S) 资源。')
 return browserAddress(value)
}

// Runs only host-authored image decoding in the owning page's isolated world.
// The image is never attached to the page, and only raster PNG leaves Chromium.
async function rasterizeFavicon(source:string){
 const image=new Image()
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{image.src='';reject(Error('图标解码超时'))},2500);image.onload=()=>{clearTimeout(timer);resolve()};image.onerror=()=>{clearTimeout(timer);reject(Error('图标无效'))};image.src=source})
 const width=image.naturalWidth,height=image.naturalHeight
 if(!width||!height||width>8192||height>8192)throw Error('图标尺寸无效')
 const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32
 const context=canvas.getContext('2d')!;const scale=Math.min(32/width,32/height)
 context.drawImage(image,(32-width*scale)/2,(32-height*scale)/2,width*scale,height*scale)
 return canvas.toDataURL('image/png')
}
function aborted<T>(promise:Promise<T>,signal:AbortSignal){
 signal.throwIfAborted()
 return new Promise<T>((resolve,reject)=>{const cancel=()=>{cleanup();reject(signal.reason??Error('图标读取已取消'))},cleanup=()=>signal.removeEventListener('abort',cancel);signal.addEventListener('abort',cancel,{once:true});promise.then(value=>{cleanup();if(signal.aborted)reject(signal.reason);else resolve(value)},error=>{cleanup();reject(error)});if(signal.aborted)cancel()})
}
export async function readBrowserFavicon(page:WebContents,urls:string[],signal:AbortSignal):Promise<string|undefined>{
 signal.throwIfAborted()
 const candidates=[...new Set(urls)].slice(0,4)
 for(const value of candidates){
  try{
   signal.throwIfAborted();if(page.isDestroyed())return
   let source:string
   if(inlineFavicon(value))source=value
   else{
    const url=browserFaviconAddress(value)
    // Reuse the tab's Chromium cookies/cache, not the desktop shell's session.
    // Redirects cannot turn a public page icon into a privileged/local request.
    const response=await page.session.fetch(url,{cache:'force-cache',credentials:'include',redirect:'error',referrerPolicy:'no-referrer',signal})
    signal.throwIfAborted()
    if(!response.ok||response.redirected||!response.body||Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel().catch(()=>{});continue}
    const chunks:Uint8Array[]=[],reader=response.body.getReader();let length=0
    try{for(;;){const part=await aborted(reader.read(),signal);if(part.done)break;length+=part.value.byteLength;if(length>maxBytes)throw Error('网页图标过大');chunks.push(part.value)}}finally{await reader.cancel().catch(()=>{})}
    signal.throwIfAborted();if(!length||page.isDestroyed())continue
    const type=response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()??'',mime=/^image\/(png|jpeg|gif|webp|x-icon|vnd.microsoft.icon|svg\+xml|avif)$/.test(type)?type:'application/octet-stream'
    source='data:'+mime+';base64,'+Buffer.concat(chunks).toString('base64')
   }
   const result=await aborted(page.executeJavaScriptInIsolatedWorld(997,[{code:`(${rasterizeFavicon.toString()})(${JSON.stringify(source)})`}]),signal)
   signal.throwIfAborted()
   if(typeof result==='string'&&result.length<=32768&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result))return result
  }catch(error){if(signal.aborted)throw signal.reason??error}
 }
}

/** Every request is tied to one document and latest favicon update. No icon is
 * persisted; normal/private tabs retain their own Chromium cache boundaries. */
export function trackBrowserFavicon(page:WebContents,update:(icon?:string)=>void){
 let epoch=0,key='',controller:AbortController|undefined,disposed=false
 const reset=()=>{epoch++;key='';controller?.abort();controller=undefined;update(undefined)}
 const navigate=(_event:unknown,_url:string,inPlace:boolean,isMain:boolean)=>{if(isMain&&!inPlace)reset()}
 const changed=(_event:unknown,values:string[])=>{
  const urls=Array.isArray(values)?values.slice(0,32).filter(value=>{if(inlineFavicon(value))return true;try{browserFaviconAddress(value);return true}catch{return false}}).slice(0,4):[]
  if(!urls.length){reset();return}
  const owner=page.getURL(),nextKey=owner+'\n'+urls.join('\n');if(key===nextKey)return
  controller?.abort();controller=new AbortController();const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(5000)]),revision=++epoch;key=nextKey
  const current=()=>!disposed&&!page.isDestroyed()&&revision===epoch&&page.getURL()===owner
  void readBrowserFavicon(page,urls,signal).then(icon=>{if(current())update(icon)},()=>{if(current())update(undefined)})
 }
 const dispose=()=>{if(disposed)return;disposed=true;epoch++;controller?.abort();page.removeListener('did-start-navigation',navigate);page.removeListener('page-favicon-updated',changed);page.removeListener('destroyed',dispose)}
 page.on('did-start-navigation',navigate);page.on('page-favicon-updated',changed);page.once('destroyed',dispose)
 return dispose
}
