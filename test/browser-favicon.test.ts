import {expect,it} from 'vitest'
import {EventEmitter} from 'node:events'
import {browserFaviconAddress,readBrowserFavicon,trackBrowserFavicon} from '../src/main/browser/favicon'

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
function target(){const requests:any[]=[],results:(string|undefined)[]=[],page=Object.assign(new EventEmitter(),{isDestroyed:()=>false,getURL:()=>url,session:{fetch:async(address:string,options:any)=>{requests.push({address,options});return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}})}},executeJavaScriptInIsolatedWorld:async()=>png});let url='https://article.example/read';return {page,requests,results,setURL:(value:string)=>{url=value}}}

it('uses only page-supplied HTTP(S) icons through the owning Chromium session and returns a bounded PNG',async()=>{
 const {page,requests}=target();expect(await readBrowserFavicon(page as any,['https://cdn.example/icon.svg'],new AbortController().signal)).toBe(png)
 expect(requests[0].address).toBe('https://cdn.example/icon.svg');expect(requests[0].options).toMatchObject({cache:'force-cache',credentials:'include',redirect:'error',referrerPolicy:'no-referrer'})
 for(const value of ['file:///etc/passwd','javascript:alert(1)','data:image/svg+xml,<svg/>','https://user:secret@host.test/icon.png','http://127.0.0.1/internal','http://169.254.169.254/'])expect(()=>browserFaviconAddress(value)).toThrow()
})

it('clears favicon on navigation or an empty favicon update and rejects an older asynchronous page result',async()=>{
 const {page,results,setURL}=target();let finish!:(value:string)=>void
 page.executeJavaScriptInIsolatedWorld=()=>new Promise(resolve=>{finish=resolve})
 const dispose=trackBrowserFavicon(page as any,value=>results.push(value))
 page.emit('page-favicon-updated',{},['https://article.example/icon.png']);await tick()
 setURL('https://next.example/');page.emit('did-start-navigation',{},'https://next.example/',false,true);finish(png);await tick()
 expect(results.at(-1)).toBeUndefined();expect(results).not.toContain(png)
 page.executeJavaScriptInIsolatedWorld=async()=>png;page.emit('page-favicon-updated',{},['https://next.example/icon.png']);await tick();expect(results.at(-1)).toBe(png)
 page.emit('page-favicon-updated',{},[]);expect(results.at(-1)).toBeUndefined();dispose()
})

it('rejects oversize, invalid, cancelled and redirected images without publishing them to the shell',async()=>{
 const {page}=target()
 page.session.fetch=async()=>new Response(new Uint8Array(262145),{headers:{'content-type':'image/png'}})
 expect(await readBrowserFavicon(page as any,['https://article.example/icon.png'],new AbortController().signal)).toBeUndefined()
 page.session.fetch=async()=>Object.defineProperty(new Response(new Uint8Array([1,2,3])), 'redirected',{value:true})
 expect(await readBrowserFavicon(page as any,['https://article.example/icon.png'],new AbortController().signal)).toBeUndefined()
 page.session.fetch=async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});page.executeJavaScriptInIsolatedWorld=async()=>'https://remote.example/icon.png'
 expect(await readBrowserFavicon(page as any,['https://article.example/icon.png'],new AbortController().signal)).toBeUndefined()
 const aborted=new AbortController();aborted.abort();await expect(readBrowserFavicon(page as any,['https://article.example/icon.png'],aborted.signal)).rejects.toThrow()
})

it('rasterizes a page-provided inline icon without any remote fetch',async()=>{
 const {page,requests}=target()
 expect(await readBrowserFavicon(page as any,['data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E'],new AbortController().signal)).toBe(png)
 expect(requests).toEqual([])
})
