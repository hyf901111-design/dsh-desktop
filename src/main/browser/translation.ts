import type {WebContents,WebFrameMain} from 'electron'
import {randomUUID} from 'node:crypto'
import {createTranslationSurface} from './translation-surface'

export type BrowserTranslationSelection={provider:string;model:string;reasoningEffort?:string}
export type BrowserTranslationStatus={state:'idle'|'translating'|'translated'|'partial'|'error';completed:number;total:number;canRestore:boolean;error?:string;coverage?:{frames:number;skippedFrames:number;conflicts:number;limited:boolean}}
export type BrowserTranslationTarget={tabId:string;url:string;title:string;webContents:WebContents}
type Frame={frame?:WebFrameMain;key:string;documentId:string;url:string;main:boolean;canRestore:boolean;initialized?:boolean;records?:number;sourceChars?:number}
type Transaction={target:BrowserTranslationTarget;status:BrowserTranslationStatus;frames:Frame[];generation:number;job?:string;controller?:AbortController;revoke?:Promise<unknown>;navigate:(...args:any[])=>void;destroy:()=>void}
type Fragment={id:string;text:string;group:Group;index:number}
type Group={source:string;fragments:Fragment[];answers:string[];refs:{frame:Frame;id:string;before:string;prefix:string;suffix:string}[]}
const idle=():BrowserTranslationStatus=>({state:'idle',completed:0,total:0,canRestore:false})
const safeSelection=(value:BrowserTranslationSelection|undefined)=>{
 if(value===undefined)return undefined
 if(!value||typeof value.provider!=='string'||typeof value.model!=='string'||!value.provider||!value.model||value.provider.length>256||value.model.length>256||value.reasoningEffort!==undefined&&(typeof value.reasoningEffort!=='string'||value.reasoningEffort.length>256))throw Error('当前模型选择无效。')
 return{provider:value.provider,model:value.model,...(value.reasoningEffort?{reasoningEffort:value.reasoningEffort}:{})}
}
function bounded<T>(promise:Promise<T>,signal?:AbortSignal,milliseconds=5000):Promise<T>{
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)},abort=()=>{cleanup();reject(signal?.reason??Error('翻译已取消。'))}
  const timer=setTimeout(()=>{cleanup();reject(Error('网页响应超时。'))},milliseconds)
  signal?.addEventListener('abort',abort,{once:true});promise.then(value=>{cleanup();resolve(value)},error=>{cleanup();reject(error)});if(signal?.aborted)abort()
 })
}
const object=(value:any)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
function metadata(value:any,frame:Frame){
 if(!object(value)||value.documentId!==frame.documentId||typeof value.canRestore!=='boolean'||!Number.isSafeInteger(value.records)||value.records<0||value.records>10000||!Number.isSafeInteger(value.sourceChars)||value.sourceChars<0||value.sourceChars>1000000)throw Error('网页翻译状态无效。')
 frame.canRestore=value.canRestore;frame.records=value.records;frame.sourceChars=value.sourceChars;return value
}
async function readResponse(response:Response,signal:AbortSignal){
 const reader=response.body?.getReader();if(!reader)throw Error('翻译结果为空。')
 let bytes=0;const chunks:Uint8Array[]=[]
 try{while(true){const part=await bounded(reader.read(),signal,3000);if(part.done)break;bytes+=part.value.byteLength;if(bytes>100000)throw Error('翻译结果过长。');chunks.push(part.value)}return Buffer.concat(chunks).toString('utf8')}
 finally{void reader.cancel().catch(()=>{})}
}
/** No screenshot, chat session, credentials or persistence is used by this
 * manager. Native recovery remains available even when its JS channel stalls. */
export function createBrowserTranslationManager(options:{runtimeUrl?:()=>string|undefined;onChange?:(tabId:string,status:BrowserTranslationStatus)=>void}){
 const transactions=new Map<string,Transaction>();let disposed=false
 const publish=(tx:Transaction,patch:Partial<BrowserTranslationStatus>)=>{tx.status={...tx.status,...patch};options.onChange?.(tx.target.tabId,{...tx.status})}
 const execute=(tx:Transaction,frame:Frame,args:any,signal?:AbortSignal,install=false)=>{
  const wc=tx.target.webContents
  if(wc.isDestroyed()||frame.frame&&(frame.frame.isDestroyed()||frame.frame.detached))return Promise.reject(Error('网页已关闭。'))
  const key=JSON.stringify(frame.key),request=JSON.stringify({...args,documentId:frame.documentId,generation:tx.generation}),code=`(async()=>{${install&&!frame.initialized?`globalThis[${key}] ??= (${createTranslationSurface.toString()})(${JSON.stringify(frame.documentId)});`:''}if(typeof globalThis[${key}]!=='function')return '{"documentChanged":true}';const value=await globalThis[${key}](${request});const json=JSON.stringify(value);if(typeof json!=='string'||json.length>6100000)throw Error('网页翻译状态过大。');return json})()`
  const pending=frame.main?wc.executeJavaScriptInIsolatedWorld(997,[{code}]):frame.frame!.executeJavaScript(code)
  // A dispatched write can take effect even if its acknowledgement is lost.
  // Keep the restore affordance conservatively until a renderer summary settles it.
  if(args.op==='apply')frame.canRestore=true
  return bounded(pending,signal).then(value=>{if(typeof value!=='string'||value.length>6100000)throw Error('网页翻译状态无效。');const parsed=JSON.parse(value);if(parsed?.documentChanged===true){frame.canRestore=false;throw Object.assign(Error('网页文档已变化。'),{code:'DOCUMENT_CHANGED'})}const result=metadata(parsed,frame);if(args.op==='begin')frame.initialized=true;return result})
 }
 const revoke=(tx:Transaction,discard=false)=>{
  const job=tx.job;tx.generation++;tx.job=undefined
  // Queue revocation in each renderer BEFORE aborting provider requests. A late
  // apply has both this token gate and its absolute document/job deadline.
  const pending=tx.frames.map(frame=>execute(tx,frame,{op:'cancel',job,discard}).catch(()=>undefined))
  tx.revoke=Promise.allSettled(pending);tx.controller?.abort(Error('翻译已取消。'));tx.controller=undefined
  return tx.revoke
 }
 const remove=(tabId:string)=>{const tx=transactions.get(tabId);if(!tx)return;revoke(tx,true);tx.target.webContents.off('did-start-navigation',tx.navigate);tx.target.webContents.off('destroyed',tx.destroy);transactions.delete(tabId)}
 const stateFor=(target:BrowserTranslationTarget)=>{
  let tx=transactions.get(target.tabId)
  if(tx&&tx.target.webContents!==target.webContents){remove(target.tabId);tx=undefined}
  if(!tx){
   tx={target:{...target},status:idle(),frames:[],generation:0,navigate:()=>{},destroy:()=>{remove(target.tabId)}}
   const current=tx
   tx.navigate=(_event:any,_url:string,inPlace:boolean,isMain:boolean)=>{if(isMain){revoke(current,!inPlace);if(!inPlace){current.frames=[];publish(current,idle())}else publish(current,{state:current.status.canRestore?'partial':'idle',error:current.status.canRestore?'网页地址已变化，已停止翻译；可还原已修改文字。':undefined})}}
   target.webContents.on('did-start-navigation',tx.navigate);target.webContents.once('destroyed',tx.destroy);transactions.set(target.tabId,tx)
  }
  tx.target={...target};return tx
 }
 const cancel=(tabId:string,{discard=false}:{discard?:boolean}={})=>{
  const tx=transactions.get(tabId);if(!tx)return
  const pending=revoke(tx,discard),generation=tx.generation
  if(discard){tx.frames=[];publish(tx,idle())}
  else if(tx.status.state==='translating'){
   const update=()=>{const canRestore=tx.frames.some(frame=>frame.canRestore);publish(tx,{state:canRestore?'partial':'idle',canRestore,error:canRestore?'翻译已停止，可还原已修改文字。':undefined})}
   update();void pending.then(()=>{if(tx.generation===generation)update()})
  }
 }
 const restore=async(tabId:string):Promise<BrowserTranslationStatus>=>{
  const tx=transactions.get(tabId);if(!tx)return idle()
  const pending=revoke(tx),generation=tx.generation;await pending
  if(tx.generation!==generation)return{...tx.status}
  let conflicts=0,failed=0
  for(const frame of tx.frames){if(tx.generation!==generation)break;try{const result=await execute(tx,frame,{op:'restore'});if(!Number.isSafeInteger(result.conflicts)||result.conflicts<0||result.conflicts>10000)throw Error('无效还原结果');conflicts+=result.conflicts}catch{failed++}}
  if(tx.generation!==generation)return{...tx.status}
  const canRestore=tx.frames.some(frame=>frame.canRestore)
  publish(tx,{...idle(),state:conflicts||failed?'partial':'idle',canRestore,error:conflicts||failed?'已还原可安全恢复的文字；网站更新或不可访问内容未覆盖。':undefined})
  return{...tx.status}
 }
 const start=async(target:BrowserTranslationTarget,input:{selection?:BrowserTranslationSelection;sessionId?:string}={}):Promise<BrowserTranslationStatus>=>{
  if(disposed)throw Error('翻译管理器已关闭。')
  const selection=safeSelection(input.selection),tx=stateFor(target)
  const pendingRevoke=revoke(tx),requestedGeneration=tx.generation;await pendingRevoke
  if(tx.generation!==requestedGeneration||disposed)return{...tx.status}
  if(target.webContents.isDestroyed()||target.webContents.getURL()!==target.url||target.webContents.isLoadingMainFrame()||!/^https?:\/\//i.test(target.url)){publish(tx,{state:'error',error:'请等待网页载入后重试。'});return{...tx.status}}
  const controller=new AbortController(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]),generation=tx.generation,job=randomUUID(),expires=Date.now()+120000
  tx.controller=controller;tx.job=job
  const check=()=>{signal.throwIfAborted();if(tx.generation!==generation||tx.job!==job||target.webContents.isDestroyed()||target.webContents.getURL()!==target.url)throw Error('当前网页已变化。')}
  const coverage={frames:0,skippedFrames:0,conflicts:0,limited:false},groups=new Map<string,Group>(),seen=new Set<string>(),cache=new Map<string,string>();let sequence=0,knownChars=0
  const canRestore=()=>tx.frames.some(frame=>frame.canRestore)
  publish(tx,{state:'translating',completed:0,total:0,canRestore:canRestore(),error:undefined,coverage:{...coverage}})
  const publishProgress=(added=0)=>{check();publish(tx,{completed:tx.status.completed+added,canRestore:canRestore(),coverage:{...coverage}})}
  const frames=()=>{
   const all=target.webContents.mainFrame?.framesInSubtree??[]
   const current=all.length?all:[undefined]
   coverage.skippedFrames=Math.max(coverage.skippedFrames,Math.max(0,current.length-32));coverage.limited||=current.length>32
   return current.slice(0,32)
  }
  const ensureFrames=async()=>{
   for(const frame of frames()){
    check();const main=!frame||frame===target.webContents.mainFrame,url=frame?.url??target.url
    if(!main&&!/^(https?:|about:(blank|srcdoc))/i.test(url)){coverage.skippedFrames++;continue}
    let owned=tx.frames.find(value=>value.main===main&&(main||value.frame===frame)&&value.url===url)
    if(!owned){if(tx.frames.length>=32){coverage.skippedFrames++;coverage.limited=true;continue}owned={frame,key:'__ewBrowserTranslation_'+randomUUID().replaceAll('-',''),documentId:randomUUID(),url,main,canRestore:false};tx.frames.push(owned)}
    try{await execute(tx,owned,{op:'begin',job,expires},signal,true)}catch(error){
     check()
     if((error as any)?.code==='DOCUMENT_CHANGED'){
      // A same-URL iframe reload is still a new document. Never reuse old
      // record IDs or silently reinstall an old restoration identity there.
      tx.frames.splice(tx.frames.indexOf(owned),1)
      owned={frame,key:'__ewBrowserTranslation_'+randomUUID().replaceAll('-',''),documentId:randomUUID(),url,main,canRestore:false};tx.frames.push(owned)
      try{await execute(tx,owned,{op:'begin',job,expires},signal,true)}catch{check();coverage.skippedFrames++}
     }else coverage.skippedFrames++
    }
   }
   coverage.frames=tx.frames.length
  }
  const requestBatch=async(batch:Fragment[])=>{
   check();const base=options.runtimeUrl?.();if(!base)throw Error('翻译服务尚未就绪。')
   const url=new URL('/sherlock/browser/translate',base),items=batch.map(({id,text})=>({id,text}))
   const response=await bounded(fetch(url,{method:'POST',headers:{'content-type':'application/json',origin:url.origin},body:JSON.stringify({target:'zh-CN',...(selection?{selection}:{}),...(input.sessionId?{sessionId:input.sessionId}:{}),items}),signal:AbortSignal.any([signal,AbortSignal.timeout(47000)])}),signal,48000)
   check();if(!response.ok)throw Error('当前模型翻译未完成。')
   const contentLength=Number(response.headers.get('content-length'));if(contentLength>100000)throw Error('翻译结果过长。')
   const text=await bounded(readResponse(response,signal),signal,3000);check();if(text.length>64000)throw Error('翻译结果过长。')
   const value=JSON.parse(text);if(!object(value)||Object.keys(value).some(key=>key!=='items')||!Array.isArray(value.items)||value.items.length!==items.length)throw Error('翻译结果格式无效。')
   const answers=new Map<string,string>()
   for(const item of value.items){const expected=items.find(expected=>expected.id===item.id);if(!object(item)||Object.keys(item).some(key=>!['id','text'].includes(key))||!expected||answers.has(item.id)||typeof item.text!=='string'||!item.text.trim()||item.text.length>Math.min(12000,Math.max(256,expected.text.length*6+128))||item.text.includes('\0'))throw Error('翻译结果格式无效。');answers.set(item.id,item.text)}
   for(const fragment of batch){fragment.group.answers[fragment.index]=answers.get(fragment.id)!}
   const ready=[...new Set(batch.map(fragment=>fragment.group))].filter(group=>group.answers.filter(value=>value!==undefined).length===group.fragments.length)
   const values=ready.map(group=>({group,text:group.answers.join('')}));for(const {group,text}of values)cache.set(group.source,text)
   await applyGroups(values)
  }
  const applyGroups=async(values:{group:Group;text:string}[])=>{
   const byFrame=new Map<Frame,{id:string;text:string}[]>()
   for(const {group,text}of values)for(const ref of group.refs){const items=byFrame.get(ref.frame)??[];items.push({id:ref.id,text:ref.prefix+text+ref.suffix});byFrame.set(ref.frame,items)}
   for(const [frame,items]of byFrame){
    let offset=0
    while(offset<items.length){
     const batch:{id:string;text:string}[]=[];let chars=0
     while(offset<items.length&&batch.length<100&&(!batch.length||chars+items[offset]!.text.length<=100000)){const item=items[offset++]!;batch.push(item);chars+=item.text.length}
     check();const result=await execute(tx,frame,{op:'apply',job,items:batch},signal);check();if(!Number.isSafeInteger(result.changed)||!Number.isSafeInteger(result.conflicts)||result.changed<0||result.conflicts<0||result.changed+result.conflicts!==batch.length)throw Error('网页翻译状态无效。');coverage.conflicts+=result.conflicts;publishProgress(result.changed)
    }
   }
   for(const {group}of values)group.refs=[]
  }
  try{
   await ensureFrames()
   for(let pass=0;pass<4;pass++){
    check();let added=0,visited=0
    for(const frame of tx.frames){
     check();let scan:any
     if(visited>=50000){coverage.limited=true;break}
     const storedRecords=tx.frames.reduce((sum,frame)=>sum+(frame.records??0),0),storedChars=tx.frames.reduce((sum,frame)=>sum+(frame.sourceChars??0),0)
     try{scan=await execute(tx,frame,{op:'scan',job,remainingRecords:10000-storedRecords,remainingChars:1000000-storedChars,remainingVisits:50000-visited},signal)}catch{check();coverage.skippedFrames++;continue}
     if(!Array.isArray(scan.items)||scan.items.length>10000||typeof scan.truncated!=='boolean')throw Error('网页文字快照无效。')
     if(!Number.isSafeInteger(scan.visited)||scan.visited<0||scan.visited>50001)throw Error('网页文字快照无效。');visited+=scan.visited
     coverage.limited||=scan.truncated
     if(!Number.isSafeInteger(scan.conflicts)||scan.conflicts<0||scan.conflicts>10000||!Number.isSafeInteger(scan.frameElements)||scan.frameElements<0||scan.frameElements>50000)throw Error('网页文字快照无效。')
     coverage.conflicts=Math.max(coverage.conflicts,scan.conflicts)
     if(!target.webContents.mainFrame&&scan.frameElements>0)coverage.skippedFrames=Math.max(coverage.skippedFrames,scan.frameElements)
     const frameIds=new Set<string>()
     for(const item of scan.items){
      if(!object(item)||Object.keys(item).some(key=>!['id','text','viewport'].includes(key))||typeof item.id!=='string'||!/^r[1-9]\d*$/.test(item.id)||frameIds.has(item.id)||typeof item.text!=='string'||!item.text.trim()||item.text.length>1000000||typeof item.viewport!=='boolean')throw Error('网页文字快照无效。')
      frameIds.add(item.id)
      const key=frame.documentId+':'+item.id;if(seen.has(key))continue
      if(seen.size>=10000||knownChars+item.text.length>1000000){coverage.limited=true;break}
      seen.add(key);knownChars+=item.text.length;added++
      const text=item.text.trim(),prefix=item.text.slice(0,item.text.indexOf(text)),suffix=item.text.slice(prefix.length+text.length)
      let group=groups.get(text)
      if(!group){group={source:text,fragments:[],answers:[],refs:[]};groups.set(text,group)
       for(let offset=0;offset<text.length;offset+=2000){let part=text.slice(offset,offset+2000);if(/[\uD800-\uDBFF]$/.test(part)&&offset+2000<text.length)part=part.slice(0,-1);if(part.length!==Math.min(2000,text.length-offset))offset--;const fragment={id:'s'+ ++sequence,text:part,group,index:group.fragments.length};group.fragments.push(fragment)}
      }
      group.refs.push({frame,id:item.id,before:item.text,prefix,suffix})
     }
    }
    publish(tx,{total:seen.size,coverage:{...coverage}})
    if(!added)break
    const pending:Fragment[]=[],cachedGroups:{group:Group;text:string}[]=[]
    for(const group of groups.values())if(group.refs.length){const cached=cache.get(group.source);if(cached!==undefined)cachedGroups.push({group,text:cached});else pending.push(...group.fragments.filter(fragment=>group!.answers[fragment.index]===undefined))}
    await applyGroups(cachedGroups)
    const batches:Fragment[][]=[];let batch:Fragment[]=[],length=0
    for(const fragment of pending){if(batch.length&&(batch.length>=48||length+fragment.text.length>4000)){batches.push(batch);batch=[];length=0}batch.push(fragment);length+=fragment.text.length}if(batch.length)batches.push(batch)
    let next=0;await Promise.all(Array.from({length:Math.min(2,batches.length)},async()=>{while(next<batches.length){const batch=batches[next++]!;await requestBatch(batch)}}))
    if(pass===3)coverage.limited=true
    if(pass<3)await ensureFrames()
   }
   check();const partial=coverage.limited||coverage.skippedFrames>0||coverage.conflicts>0||tx.status.completed<tx.status.total
   publish(tx,{state:partial?'partial':'translated',canRestore:canRestore(),coverage:{...coverage},error:partial?'已翻译可处理的文字；部分框架、动态更新或超预算内容未覆盖。':undefined})
  }catch{
   if(tx.generation===generation&&tx.job===job){const pending=revoke(tx),cancelledGeneration=tx.generation;await pending;if(tx.generation===cancelledGeneration)publish(tx,{state:canRestore()?'partial':'error',canRestore:canRestore(),error:'翻译未全部完成；已修改的文字可还原，请检查当前模型或重试。',coverage:{...coverage}})}
  }finally{if(tx.job===job){tx.job=undefined;tx.controller=undefined}}
  return{...tx.status}
 }
 return{start,restore,cancel,status:(tabId:string)=>({...transactions.get(tabId)?.status??idle()}),dispose:()=>{disposed=true;for(const tabId of [...transactions.keys()])remove(tabId)}}
}
