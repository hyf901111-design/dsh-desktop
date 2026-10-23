#!/usr/bin/env node
/** Replay the real frontend patch entry twice over an in-memory filesystem overlay.
 * Dependency files and the running app are never written. */
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {SourceTextModule,SyntheticModule,createContext,Script} from 'node:vm'

const overlay=new Map(),key=path=>resolve(path instanceof URL?fileURLToPath(path):String(path)),actualRead=fs.readFileSync
const read=(path,encoding)=>{const value=overlay.get(key(path));return value===undefined?actualRead(path,encoding):typeof encoding==='string'||encoding?.encoding?value:Buffer.from(value)}
const write=(path,value)=>{overlay.set(key(path),Buffer.isBuffer(value)?value.toString('utf8'):String(value))}
// Overlay paths have their own logical identity even when installed dependencies
// are symlinked; all writes still terminate in the map above.
const virtualFs={...fs,readFileSync:read,writeFileSync:write},virtualPromises={...fsp,readFile:async(path,encoding)=>read(path,encoding),writeFile:async(path,value)=>write(path,value),realpath:async path=>key(path)}
async function replay(){
 const cache=new Map(),context=createContext({console,process,Buffer,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask})
 const moduleFor=async(url)=>{
  if(cache.has(url))return cache.get(url)
  if(url.startsWith('file:')){
   const module=new SourceTextModule(actualRead(new URL(url),'utf8'),{context,identifier:url,initializeImportMeta:meta=>{meta.url=url}});cache.set(url,module);return module
  }
  const value=url==='node:fs'?virtualFs:url==='node:fs/promises'?virtualPromises:await import(url),names=[...new Set(['default',...Object.keys(value)])]
  const module=new SyntheticModule(names,function(){for(const name of names)this.setExport(name,name==='default'?value.default??value:value[name])},{context,identifier:url});cache.set(url,module);return module
 }
 const entry=await moduleFor(pathToFileURL(resolve('scripts/patch-web-frontend-loading.mjs')).href)
 await entry.link(async(specifier,parent)=>{
  if(specifier.startsWith('.'))return moduleFor(new URL(specifier,parent.identifier).href)
  if(specifier.startsWith('node:'))return moduleFor(specifier)
  const resolved=createRequire(parent.identifier).resolve(specifier)
  // Package dependencies are read through their normal module API; only project
  // source needs VM linking so imports of node:fs stay on the write-free overlay.
  const url=pathToFileURL(resolved).href
  if(!cache.has(url)){const value=await import(url),names=Object.keys(value);const module=new SyntheticModule(names,function(){for(const name of names)this.setExport(name,value[name])},{context,identifier:url});cache.set(url,module)}
  return cache.get(url)
 })
 await entry.evaluate()
}
await replay()
const conversation=resolve('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js'),first=overlay.get(conversation)
if(!first)throw Error('Real frontend entry did not patch the conversation asset')
await replay()
const second=overlay.get(conversation)
const region=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);if(a<0||b<0)throw Error('Protected frontend region is missing: '+start);return source.slice(a,b)}
for(const[start,end]of [['/* ework:assistant-reveal:v1 */','const AssistantMarkdown ='],['el.addEventListener("scroll", onScroll, { passive: true });','}, []);']])if(region(first,start,end)!==region(second,start,end))throw Error('Real frontend replay changed a protected reply region: '+start)
new Script(second)
for(const required of ['if(el.dataset?.conversationReading)return;','el.scrollTop = assistantRevealScrollTop(el) ?? el.scrollHeight;','if(atBottomRef.current)callback()','revealRoute:"progress"','react.useLayoutEffect(()=>()=>eworkAssistantRevealLedger.suspend(useSession)'])if(!second.includes(required))throw Error('Patch replay lost guard or live wiring: '+required)
if((second.match(/const stopAnchoring=anchorConversationDisclosures\(local,/g)||[]).length!==1)throw Error('Disclosure anchoring was duplicated')
console.log(JSON.stringify({passes:2,virtualWrites:overlay.size,conversationBytes:Buffer.byteLength(second),conversationByteIdentical:first===second,protectedReplyRegionsStable:true,guardsPreserved:true,syntaxValid:true,dependencyWrites:0}))
