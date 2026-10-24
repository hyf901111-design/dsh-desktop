import {beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {builtinModules} from 'node:module'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import {wrapSandboxPreload} from '../scripts/lib/sandbox-preload.mjs'
import {patchPreloadEmojiCustomElements} from '../scripts/lib/preload-custom-elements.mjs'
let bundled
beforeAll(async()=>{
 bundled=await build({entryPoints:['src/preload/index.ts'],bundle:true,write:false,format:'cjs',platform:'browser',conditions:['browser','import','style'],mainFields:['browser','module','main'],external:['electron',...builtinModules,...builtinModules.map(name=>'node:'+name)],metafile:true,logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.svg':'dataurl','.png':'dataurl','.jpg':'dataurl','.woff':'dataurl','.woff2':'dataurl','.css':'text'},plugins:[
  {name:'production-preload-assets',setup(b){b.onResolve({filter:/\?(?:raw|inline|url)(?:&|$)/},async args=>{const specifier=args.path.split('?')[0],resolved=await b.resolve(specifier,{resolveDir:args.resolveDir,kind:args.kind});if(resolved.errors.length)return {errors:resolved.errors};return{path:resolved.path,namespace:/\?raw(?:&|$)/.test(args.path)||specifier.endsWith('.css')?'preload-text':'preload-dataurl'}});b.onLoad({filter:/.*/,namespace:'preload-text'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));b.onLoad({filter:/.*/,namespace:'preload-dataurl'},async args=>({contents:await readFile(args.path),loader:'dataurl'}))}},
  {name:'production-preload-custom-elements',setup(b){b.onLoad({filter:/emoji-mart[\/]dist[\/](?:main|module|browser)\.js$/},async args=>{const text=await readFile(args.path,'utf8');return {contents:patchPreloadEmojiCustomElements(text,args.path)??text,loader:'js'}})}}
 ]})
},20000)
it('keeps every Node-only module out of the actual sandbox preload import graph',()=>{
 const imports=Object.values(bundled.metafile.inputs).flatMap(file=>file.imports).filter(item=>item.external&&(item.path.startsWith('node:')||builtinModules.includes(item.path))).map(item=>item.path)
 expect([...new Set(imports)]).toEqual([])
 expect(Object.keys(bundled.metafile.inputs).filter(file=>/free-data-skill\.js|component-source-tools\.js|conversation-component-contract\.js|node_modules\/ajv\//.test(file))).toEqual([])
})
it('evaluates the bundled production preload with sandbox-restricted require and exposes the real bridges before DOM ready',async()=>{
 const window=new Window({url:'https://sherlock.local/'}),exposed=new Map(),requests=[]
 Object.defineProperty(window.document,'readyState',{configurable:true,get:()=> 'loading'})
 const ipcRenderer={on:()=>{},removeListener:()=>{},invoke:async()=>undefined,send:()=>{},sendSync:()=>null}
 const electron={ipcRenderer,contextBridge:{exposeInMainWorld:(name,value)=>exposed.set(name,value)},webUtils:{getPathForFile:()=>''},webFrame:{getZoomFactor:()=>1,setZoomFactor:()=>{}}}
 Object.assign(window,{process:{isMainFrame:true,platform:'darwin',argv:[],versions:{electron:'sandbox-fixture'}},module:{exports:{}},exports:{},require:name=>{requests.push(name);if(name==='electron')return electron;throw Error('Sandbox blocked require: '+name)},Buffer,TextEncoder,TextDecoder})
 try{
  // The same smoke can validate Root's real packaged out/preload/index.cjs after rebuilding.
  const source=process.env.SHERLOCK_TEST_PRELOAD_ARTIFACT?await readFile(process.env.SHERLOCK_TEST_PRELOAD_ARTIFACT,'utf8'):bundled.outputFiles[0].text
  expect(()=>runInNewContext(wrapSandboxPreload(source),window,{timeout:15000})).not.toThrow()
  expect(requests).toEqual(['electron'])
  expect(exposed.get('dshDesktop')?.conversationComponents?.read).toBeTypeOf('function')
  expect(exposed.get('dshDesktop')?.clientCapabilities?.bind).toBeTypeOf('function')
  expect(exposed.get('dshDesktop')?.financialWidget?.request).toBeTypeOf('function')
 }finally{await window.happyDOM.abort()}
},20000)
