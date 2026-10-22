import {randomUUID} from 'node:crypto'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {BrowserWindow,type WebFrameMain} from 'electron'
import type {TrustedWindow} from '../ipc-trust'
import {researchComponentTypographyCss} from '../../../packages/dsh-research-task-runtime/html-artifact.js'
import {MARKET_REGULAR_FONT_CSS} from '../../../packages/dsh-research-task-runtime/market-font.js'
import {freezeNoteSnapshotElement,restoreNoteSnapshotFrameNames,type FrozenNoteComponent,type NoteComponentSnapshot} from '../../shared/note-component-snapshot'

const capturing=new WeakSet<object>()
let partitionBusy=false
const MAX_COMPONENTS=128,MAX_TOTAL_BYTES=64*1024*1024,MAX_PNG_BYTES=8*1024*1024,MAX_TOTAL_PNG_BYTES=32*1024*1024
/** Fixed code runs only in the actual main window. Callers cannot nominate a URL, frame or HTML source. */
async function freezeRoots(blockIds:string[],sessionId:string,prefix:string,freeze:typeof freezeNoteSnapshotElement){
 const state={cancelled:false};Object.defineProperty(window,prefix,{value:state,configurable:true})
 try{
 const scope=[...document.querySelectorAll<HTMLElement>('[data-note-source-session]')].find(element=>element.dataset.noteSourceSession===sessionId)
 if(!scope)throw Error('笔记会话已变化，请重新打开笔记后导出。')
 const sources:Array<FrozenNoteComponent&{blockId:string}>=[]
 for(const [index,blockId] of blockIds.entries()){
  const block=[...scope.querySelectorAll<HTMLElement>('.bn-block-outer[data-id]')].find(element=>element.dataset.id===blockId)
  const element=block?.querySelector<HTMLElement>('.en-research')
  if(!element)throw Error('笔记组件预览尚未就绪，请等待载入完成后重试。')
  if(state.cancelled)throw Error('组件快照已取消，笔记内容已保留。')
  sources.push({blockId,...await freeze(element,prefix+'-'+index,undefined,()=>state.cancelled)})
  if(sources.reduce((total,source)=>total+source.html.length,0)>64*1024*1024)throw Error('组件快照总量过大，请分批导出。')
 }
 return sources
 }finally{delete (window as any)[prefix]}
}
async function freezeFrame(prefix:string,viewport:{width:number;height:number},freeze:typeof freezeNoteSnapshotElement){
 const state={cancelled:false};Object.defineProperty(window,prefix,{value:state,configurable:true})
 try{return await freeze(document.body,prefix,viewport,()=>state.cancelled)}finally{delete (window as any)[prefix]}
}
function installSnapshotIdentity(key:string,prefix:string){
 const pending=new Promise<string|null>(resolve=>{
  const finish=(name:string|null)=>{clearTimeout(timer);window.removeEventListener('message',receive);resolve(name)}
  const receive=(event:MessageEvent)=>{if(event.source===window.parent&&event.data?.key===key&&typeof event.data?.__sherlockNoteSnapshotFrame==='string'&&event.data.__sherlockNoteSnapshotFrame.startsWith(prefix))finish(event.data.__sherlockNoteSnapshotFrame)}
  const timer=setTimeout(()=>finish(null),4500)
  window.addEventListener('message',receive)
 })
 Object.defineProperty(window,key,{value:pending,configurable:true})
 return true
}
function dispatchSnapshotIdentities(key:string,prefix:string){
 for(const frame of document.querySelectorAll<HTMLIFrameElement>('iframe[data-note-snapshot-frame-owner]')){
  if(frame.getAttribute('data-note-snapshot-frame-owner')?.startsWith(prefix))frame.contentWindow?.postMessage({key,__sherlockNoteSnapshotFrame:frame.name},'*')
 }
}
/** CSP blocks all document scripts; this fixed main-owned barrier waits for actual layout fonts and paint. */
async function waitForSnapshotPaint(){
 document.body.getBoundingClientRect()
 await document.fonts.ready
 await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))
 return true
}
function snapshotDocument(html:string,width:number,height:number){
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><style>${researchComponentTypographyCss('html').split('@layer sherlock-component-typography')[0]}${MARKET_REGULAR_FONT_CSS}html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}*{animation:none!important;transition:none!important}::selection{background:transparent}</style></head><body>${html}</body></html>`
}
export async function captureNoteComponentSnapshots(window:TrustedWindow|undefined,input:{sessionId:string;blockIds:string[]},current:()=>boolean,signal?:AbortSignal):Promise<NoteComponentSnapshot[]>{
 if(!Array.isArray(input.blockIds)||input.blockIds.length>MAX_COMPONENTS||input.blockIds.some(id=>typeof id!=='string'||!id||id.length>256)||new Set(input.blockIds).size!==input.blockIds.length)throw Error('笔记组件列表无效或过多，请分批导出。')
 const check=()=>{if(signal?.aborted)throw Error('组件快照已取消，笔记内容已保留。');if(!window||window.isDestroyed()||!current())throw Error('账号或会话已变化，请重新打开笔记后导出。')}
 check();if(!input.blockIds.length)return []
 if(capturing.has(window!)||partitionBusy)throw Error('正在准备笔记导出，请等待当前操作完成。')
 capturing.add(window!);partitionBusy=true
 const root=window!.webContents.mainFrame as WebFrameMain,prefix='note-export-'+randomUUID(),touched=new Map<WebFrameMain,Set<string>>(),states=new Map<WebFrameMain,Set<string>>(),pendingFreezes=new Set<Promise<unknown>>()
 let hidden:BrowserWindow|undefined,temporary:string|undefined,totalBytes=0,totalPngBytes=0
 const execute=async<T>(frame:WebFrameMain,code:string,timeout=10000,mutates=false):Promise<T>=>{
  check();let timer:ReturnType<typeof setTimeout>|undefined,guard:ReturnType<typeof setInterval>|undefined
  const aborted=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('组件快照准备超时，请重新载入预览后重试。')),timeout);guard=setInterval(()=>{try{check()}catch(error){reject(error)}},25)})
  try{
   const pending=frame.executeJavaScript(code)
   if(mutates){pendingFreezes.add(pending);void pending.then(()=>pendingFreezes.delete(pending),()=>pendingFreezes.delete(pending))}
   const result=await Promise.race([pending,aborted]);check();return result as T
  }finally{clearTimeout(timer);clearInterval(guard)}
 }
 const mark=(frame:WebFrameMain,key:string)=>{if(!touched.has(frame))touched.set(frame,new Set());touched.get(frame)!.add(key)}
 const frameMaps=new Map<WebFrameMain,Map<string,WebFrameMain>>()
 const framesFor=async(parent:WebFrameMain)=>{
  if(frameMaps.has(parent))return frameMaps.get(parent)!
  const children=parent.frames,identityKey='__noteSnapshotIdentity'+randomUUID().replaceAll('-','')
  if(children.length>128)throw Error('组件子页面过多，请分批导出。')
  const installed=await Promise.allSettled(children.map(child=>execute(child,`(${installSnapshotIdentity.toString()})(${JSON.stringify(identityKey)},${JSON.stringify(prefix)})`,1500)));check()
  const available=children.filter((_child,index)=>installed[index]?.status==='fulfilled')
  await execute(parent,`(${dispatchSnapshotIdentities.toString()})(${JSON.stringify(identityKey)},${JSON.stringify(prefix)})`)
  const names=await Promise.allSettled(available.map(child=>execute<string|null>(child,`(async()=>{try{return await window[${JSON.stringify(identityKey)}]}finally{delete window[${JSON.stringify(identityKey)}]}})()`,1500)));check()
  const map=new Map<string,WebFrameMain>();names.forEach((result,index)=>{if(result.status==='fulfilled'&&result.value)map.set(result.value,available[index]!)});frameMaps.set(parent,map);return map
 }
 const resolveFrames=async(source:FrozenNoteComponent,parent:WebFrameMain,key:string,depth=0):Promise<string>=>{
  if(depth>5)throw Error('组件子页面层级过深，暂不能导出快照。')
  let html=source.html
  for(const [index,reference] of source.frames.entries()){
   check()
   const frame=(await framesFor(parent)).get(reference.name)
   if(!frame)throw Error('组件子页面尚未就绪，请等待载入完成后重试。')
   const frameKey=key+'-'+index;mark(frame,frameKey);states.set(frame,new Set([frameKey]))
   const frozen=await execute<FrozenNoteComponent>(frame,`(${freezeFrame.toString()})(${JSON.stringify(frameKey)},${JSON.stringify({width:reference.width,height:reference.height})},${freezeNoteSnapshotElement.toString()})`,10000,true)
   html=html.replace(`<!--note-snapshot:${reference.name}-->`,await resolveFrames(frozen,frame,frameKey,depth+1))
  }
  totalBytes+=Buffer.byteLength(html,'utf8');if(totalBytes>MAX_TOTAL_BYTES)throw Error('组件快照总量过大，请缩小预览或分批导出。')
  return html
 }
 try{
  states.set(root,new Set([prefix]))
  for(let index=0;index<input.blockIds.length;index++)mark(root,prefix+'-'+index)
  const sources=await execute<Array<FrozenNoteComponent&{blockId:string}>>(root,`(${freezeRoots.toString()})(${JSON.stringify(input.blockIds)},${JSON.stringify(input.sessionId)},${JSON.stringify(prefix)},${freezeNoteSnapshotElement.toString()})`,10000,true)
  if(!Array.isArray(sources)||sources.length!==input.blockIds.length)throw Error('笔记组件快照不完整，请重试。')
  hidden=new BrowserWindow({show:false,width:800,height:600,useContentSize:true,paintWhenInitiallyHidden:true,webPreferences:{javascript:true,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,partition:'sherlock-note-snapshot'}})
  temporary=await mkdtemp(join(tmpdir(),'sherlock-note-snapshot-'));check()
  const snapshotPath=join(temporary,'snapshot.html'),snapshotUrl=pathToFileURL(snapshotPath).href
  hidden.webContents.setWindowOpenHandler(()=>({action:'deny'}));hidden.webContents.on('will-navigate',event=>event.preventDefault())
  hidden.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:details.url!==snapshotUrl&&!details.url.startsWith('data:')}))
  const snapshots:NoteComponentSnapshot[]=[]
  for(const [index,source] of sources.entries()){
   check()
   if(source.blockId!==input.blockIds[index]||!Number.isInteger(source.width)||!Number.isInteger(source.height)||source.width<1||source.height<1||source.width>2200||source.height>3000)throw Error('组件快照尺寸无效。')
   const html=await resolveFrames(source,root,prefix+'-'+index)
   hidden.setContentSize(source.width,source.height)
   await writeFile(snapshotPath,snapshotDocument(html,source.width,source.height),{mode:0o600});check()
   try{await hidden.loadFile(snapshotPath)}catch{throw Error('组件快照准备失败，请重新载入预览后重试。')}
   check()
   let fontTimer:ReturnType<typeof setTimeout>|undefined
   try{await Promise.race([hidden.webContents.executeJavaScript(`(${waitForSnapshotPaint.toString()})()`),new Promise<never>((_resolve,reject)=>{fontTimer=setTimeout(()=>reject(Error('组件字体尚未载入完成，请稍后重新导出。')),10000)})])}finally{clearTimeout(fontTimer)}
   check()
   let image=await hidden.webContents.capturePage({x:0,y:0,width:source.width,height:source.height})
   check();if(image.isEmpty())throw Error('组件快照为空，请等待预览完成后重试。')
   let png=image.toPNG()
   if(png.byteLength>=24&&png.readUInt32BE(16)>1600){image=image.resize({width:1600,quality:'best'});png=image.toPNG()}
   while(png.byteLength>MAX_PNG_BYTES&&png.readUInt32BE(16)>400){image=image.resize({width:Math.floor(png.readUInt32BE(16)*.8),quality:'best'});png=image.toPNG()}
   totalPngBytes+=png.byteLength
   if(totalPngBytes>MAX_TOTAL_PNG_BYTES)throw Error('笔记组件快照总量超过 32 MB，请分批导出。')
   if(png.byteLength>MAX_PNG_BYTES||png.byteLength<24||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('组件快照图像无效或过大。')
   snapshots.push({blockId:source.blockId,dataUrl:'data:image/png;base64,'+png.toString('base64'),width:png.readUInt32BE(16),height:png.readUInt32BE(20)})
  }
  return snapshots
 }finally{
  if(hidden&&!hidden.isDestroyed()){hidden.webContents.session.webRequest.onBeforeRequest(null);await hidden.webContents.session.clearCache?.().catch(()=>{});hidden.destroy()}
  if(temporary)await rm(temporary,{recursive:true,force:true})
  const cleanSources=async()=>{
   for(const [frame,keys] of touched)try{
    const code=`(()=>{for(const key of ${JSON.stringify([...(states.get(frame)||[])])}){const state=window[key];if(state)state.cancelled=true}for(const key of ${JSON.stringify([...keys])})(${restoreNoteSnapshotFrameNames.toString()})(document,key)})()`
    await Promise.race([frame.executeJavaScript(code),new Promise(resolve=>setTimeout(resolve,500))])
   }catch{}
  }
  await cleanSources()
  const unlock=()=>{capturing.delete(window!);partitionBusy=false}
  if(pendingFreezes.size)void Promise.allSettled([...pendingFreezes]).then(async()=>{await cleanSources();unlock()})
  else unlock()
 }
}
