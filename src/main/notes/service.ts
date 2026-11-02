import { randomUUID, createHash } from 'node:crypto'
import {nativeBlankTableIntent} from '../../shared/notes-native-intent'
import {createClientCapabilityHost} from '../../../packages/dsh-research-task-runtime/client-capability-host.js'
import type {ClientCapabilityContext,CapabilityReceipt} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import {runClientCapabilityLoop} from '../../../packages/dsh-research-task-runtime/client-capability-loop.js'
import {capabilityReceiptText} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import {NotesCapabilityBridge} from './capability-bridge'
import {createNoteDataRevisionHandler} from './data-revisions'
import {createNoteCapabilityHandlers} from './capability-handlers'
import {createNoteCapabilityExecutor} from './capability-operation-identity'
import {NotesDocumentCapabilityAdapter,type NoteDocumentAdapter} from './document-capability-adapter'
import { NotesStore } from './store'
import { registerTrustedMainWindowHandler } from '../ipc-trust'
import type { TrustedWindow } from '../ipc-trust'
import type { ResearchCanvasClipboard } from '../state/research-canvas-clipboard'
import { harnessRpc } from '../scheduled/task-runner'
import { parseResearchContainerSpec } from '../../../packages/dsh-research-task-runtime/artifact-validator.js'
import { renderCartesianChart } from '../../../packages/dsh-research-task-runtime/cartesian-chart-artifact.js'
import { renderMarketArtifact } from '../../../packages/dsh-research-task-runtime/market-artifact.js'
import { readNoteGenerationStream } from './stream'
import { saveNoteExport } from './export'
import { captureNoteComponentSnapshots } from './component-snapshot'
import { buildResearchHtmlPreview } from '../../../packages/dsh-research-task-runtime/html-artifact.js'
import type { NotesNativeMenu } from '../../shared/notes-menu'
import type { NoteFiles } from './files'
import type { ComponentLibraryStore } from '../state/component-library'
import { findNoteComponent, noteLibraryItems, noteLibraryNode, noteLibrarySpec } from './component-library'
import {prepareNoteReferences} from './reference-context'
import type {ResearchContextSource} from '../state/research-context-bridge'
import { pickNoteFiles } from './file-picker'
import {createNoteComponentActions} from './component-actions'
import type {ResearchCanvasExportDependencies} from '../state/research-canvas-export'

export function installNotesService(options: {
  ipcMain: any; getWindow(): TrustedWindow | undefined; root: string; owner(): string; onDocumentAdapter?(adapter:NoteDocumentAdapter):void;
  runtimeUrl(): string | undefined; clipboard(): ResearchCanvasClipboard | undefined; canRead(sessionId: string): boolean; canWrite?(sessionId:string):boolean; canvasAvailable?(sessionId:string):boolean; inspectCanvas?(sessionId:string,signal:AbortSignal,args?:{ids?:string[]}):Promise<unknown>; resetZoom?():Promise<void>;windowAction?(action:string,args:any):Promise<unknown>; nativeMenu?: NotesNativeMenu; files?:NoteFiles; library?():ComponentLibraryStore|undefined;captureSources?(sessionId:string,sources:ResearchContextSource[]):{captureId:string;totalSources:number};componentData?:{request(sessionId:string,args:any,control?:{signal?:AbortSignal;guardId?:string}):Promise<any>;visible(sessionId:string,active:boolean):void;reply(value:any):void}
  exportFiles?:Pick<ResearchCanvasExportDependencies,'showSaveDialog'|'writeFile'>;
}): () => void {
  const store = new NotesStore(options.root), active = new Map<string, AbortController>(), rpc = harnessRpc(options.runtimeUrl)
  const capabilityBridge=new NotesCapabilityBridge(value=>{const window=options.getWindow();if(!window||window.isDestroyed())throw Error('笔记窗口不可用。');(window.webContents as any).send('notes:capability-action',value)})
  const documentAdapter=new NotesDocumentCapabilityAdapter({owner:options.owner,window:options.getWindow,canRead:options.canRead,canWrite:sessionId=>options.canWrite?.(sessionId)??true,bridge:capabilityBridge,componentData:!!options.componentData,notify:value=>{const window=options.getWindow();if(window&&!window.isDestroyed())(window.webContents as any).send('notes:capability-action',value)},prepare:(context,sessionId,signal,current)=>prepareNoteReferences(context,{sessionId,owner:options.owner(),files:options.files,captureSources:options.captureSources,signal,current})})
  options.onDocumentAdapter?.(documentAdapter)
  const componentActions=createNoteComponentActions({store,owner:options.owner,canRead:options.canRead,canWrite:sessionId=>options.canWrite?.(sessionId)??true,getWindow:options.getWindow,documentIdentity:sessionId=>documentAdapter.identity(sessionId),clipboard:options.clipboard,library:options.library,exportFiles:options.exportFiles})
  const dataJobs=new Map<string,{owner:string;sessionId:string;controller:AbortController}>()
  const capabilityResults=new Map<string,{fingerprint:string;result:any}>()
  const generations=new Map<string,{owner:string;sessionId:string;cardLocal:boolean}>()
  const challenges=new Map<string,{owner:string;sessionId:string;controller:AbortController}>()
  registerTrustedMainWindowHandler(options.ipcMain, 'notes:request', options.getWindow, async (_event, method: string, input: any) => {
    if (!input || typeof input.sessionId !== 'string' || input.sessionId.length > 256 || !options.canRead(input.sessionId)) throw Error('笔记会话不可用。')
    const owner = options.owner(), session = input.sessionId
    if (method !== 'load' && method !== 'conversation-load' && method !== 'stop' && input.owner !== owner) throw Error('账号已变化，请重新打开笔记。')
    switch (method) {
      case 'component-menu-capabilities':
      case 'component-copy':
      case 'component-library-save':
      case 'component-export': return componentActions(method,input)
      case 'capability-reply': return capabilityBridge.respond(input,owner)
      case 'capability-ready': return {...documentAdapter.ready(input,owner),editable:options.canWrite?.(session)!==false}
      case 'library-list': if(!options.library?.())throw Error('组件库暂不可用，请稍后重试。');return noteLibraryItems(options.library()!)
      case 'library-read': if(!options.library?.())throw Error('组件库暂不可用，请稍后重试。');return noteLibraryNode(options.library()!,input.id,owner)
      case 'component-ready': return {ready:findNoteComponent(store.load(owner,session).saved.blocks,input.nodeId)?.containerSpec?.type==='calendar-tool'}
      case 'component-render': {if(!noteLibrarySpec(input.spec))throw Error('组件内容格式无效。');return {ok:true}}
      case 'reply-render': {if(typeof input.text!=='string'||!input.text.trim()||input.text.length>100000)throw Error('回复内容不可用。');return {ok:true}}
      case 'file-pick': return pickNoteFiles(input.kind,options.getWindow(),()=>options.owner()===owner&&options.canRead(session),input.locale)
      case 'file-admit': if(!options.files)throw Error('文件服务尚未就绪。');return options.files.admit(owner,session,input)
      case 'file-bind': if(!options.files)throw Error('文件服务尚未就绪。');return options.files.bind(owner,session,input)
      case 'file-media': if(!options.files)throw Error('文件服务尚未就绪。');return options.files.media(owner,session,input)
      case 'file-revoke': return {ok:options.files?.revoke(owner,session,input.nodeId)??false}
      case 'file-reveal': if(!options.files)throw Error('文件服务尚未就绪。');return options.files.reveal(owner,session,input)
      case 'menu-sync': if (!options.nativeMenu) throw Error('原生菜单不可用。'); options.nativeMenu.sync(input,owner); return {ok:true}
      case 'menu-close': options.nativeMenu?.close(input.menuId); return {ok:true}
      case 'load': return { ...store.load(owner, session), owner }
      case 'save': return store.save(owner, session, input.revision, input.content, input.clientId)
      case 'draft': store.draft(owner, session, input.clientId, input.revision, input.content); return { ok: true }
      case 'discard': store.discardDraft(owner, session, input.clientId); return { ok: true }
      case 'component-data-reply': options.componentData?.reply(input);return {ok:true}
      case 'component-data-visible': if(typeof input.active!=='boolean')throw Error('组件可见状态无效。');options.componentData?.visible(session,input.active);return {ok:true}
      case 'component-data-capability-cancel': {const job=dataJobs.get(input.executionId);if(job?.owner===owner&&job.sessionId===session)job.controller.abort();return {ok:true}}
      case 'component-data-capability': {
        const execution=capabilityBridge.dataExecution(input.executionId,owner,session)
        if(!execution||!options.componentData||options.canWrite?.(session)===false)throw Error('组件数据操作已过期或不可用。')
        if(Object.keys(input).some(key=>!['owner','sessionId','executionId','nodeId','action','revision','settings'].includes(key))||!['inspect','configure','refresh'].includes(input.action))throw Error('组件数据能力参数无效。')
        if(input.action==='inspect'?(input.revision!==undefined||input.settings!==undefined):!Number.isInteger(input.revision)||input.revision<1||input.action==='refresh'&&input.settings!==undefined||input.action==='configure'&&(!input.settings||!Object.keys(input.settings).length||Object.keys(input.settings).some(key=>!['enabled','intervalMinutes'].includes(key))||input.settings.enabled!==undefined&&typeof input.settings.enabled!=='boolean'||input.settings.intervalMinutes!==undefined&&(!Number.isInteger(input.settings.intervalMinutes)||input.settings.intervalMinutes<0||input.settings.intervalMinutes>10080)))throw Error('组件数据能力参数无效。')
        const ids=execution.context.selectedBlockIds
        const find=(blocks:any[]):any=>{for(const block of blocks){if(block.id===ids[0])return block;const nested=find(block.children??[]);if(nested)return nested}}
        const block=ids.length===1?find(store.load(owner,session).saved.blocks):undefined
        let node:any;try{node=block?.type==='research'?JSON.parse(block.props.payload):undefined}catch{}
        if(!node||typeof node.id!=='string'||!node.id||node.id.length>256||node.id!==input.nodeId||node.containerSpec?.type==='financial-widget')throw Error('所选笔记组件不可用，请重新选择。')
        if(dataJobs.has(input.executionId))throw Error('组件数据操作正在执行，请等待回执。')
        const controller=new AbortController(),job={owner,sessionId:session,controller};dataJobs.set(input.executionId,job)
        try{return await options.componentData.request(session,{action:input.action,nodeId:node.id,...input.revision===undefined?{}:{revision:input.revision},...input.settings===undefined?{}:{settings:input.settings}},{signal:AbortSignal.any([execution.signal,controller.signal,AbortSignal.timeout(90000)]),guardId:input.executionId})}
        finally{if(dataJobs.get(input.executionId)===job)dataJobs.delete(input.executionId)}
      }
      case 'component-data-status': {
        if(!options.componentData)throw Error('组件数据刷新服务暂不可用。')
        return {owner,rows:await options.componentData.request(session,{action:'list'})}
      }
      case 'component-data': {
        if(!options.componentData)throw Error('组件数据刷新服务暂不可用。')
        const node=findNoteComponent(store.load(owner,session).saved.blocks,input.nodeId)
        if(!node)throw Error('笔记组件尚未保存或已移除，请稍后重试。')
        if(input.action==='bind-generated'&&JSON.stringify(node.containerSpec)!==JSON.stringify(input.initialSpec))throw Error('笔记组件内容已变化，请重新生成或绑定。')
        return options.componentData.request(session,{action:input.action,nodeId:input.nodeId,recipe:input.recipe,initialSpec:input.initialSpec,settings:input.settings})
      }
      case 'component-snapshots': {
        const window=options.getWindow(),key='note-snapshot:'+randomUUID(),controller=new AbortController();active.set(key,controller)
        try{return await captureNoteComponentSnapshots(window,input,()=>options.owner()===owner&&options.canRead(session)&&options.getWindow()===window&&(!input.executionId||capabilityBridge.allowed(input.executionId,owner,session)),controller.signal)}finally{active.delete(key)}
      }
      case 'export': return saveNoteExport(input,()=>options.owner()===owner&&options.canRead(session)&&(!input.executionId||capabilityBridge.allowed(input.executionId,owner,session)),(path,state)=>{if(input.executionId)capabilityBridge.exportEffect(input.executionId,owner,session,{state,path})})
      case 'conversation-load':
      case 'conversation-state': {
        const base=options.runtimeUrl();if(!base)return {rows:[],owner,pending:true}
        const url=new URL('/sherlock/notes/session',base),response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',origin:url.origin},signal:AbortSignal.timeout(10000),body:JSON.stringify({sessionId:session,action:method,requestId:input.requestId,phase:input.phase})})
        const result=await response.json();if(!response.ok)throw Error(result.error||'会话记录暂不可用。');if(options.owner()!==owner)throw Error('账号已变化');return {...result,owner}
      }
      case 'engage': {
        const base = options.runtimeUrl(); if (!base) throw Error('会话服务尚未就绪，请稍后重试。')
        const url = new URL('/sherlock/notes/session', base)
        const response = await fetch(url, {method:'POST',headers:{'content-type':'application/json',origin:url.origin},signal:AbortSignal.timeout(10000),body:JSON.stringify({sessionId:session,title:input.title,locale:input.locale})})
        const result = await response.json()
        if (!response.ok) throw Error(result.error || '笔记会话暂未保存，请重试。')
        if (options.owner() !== owner) throw Error('账号已变化，请重新打开笔记。')
        return result
      }
      case 'models': return rpc('session.models', { sessionId: session })
      case 'model': return rpc('session.selectModel', { sessionId: session, provider: input.provider, model: input.model })
      case 'clipboard': return options.clipboard()?.read() ?? { kind: 'empty' }
      case 'stop': {const job=generations.get(input.requestId);if(job?.owner===owner&&job.sessionId===session)active.get(input.requestId)?.abort();return {ok:true}}
      case 'challenge-stop': {const job=challenges.get(input.requestId);if(job?.owner===owner&&job.sessionId===session)job.controller.abort();return {ok:true}}
      case 'challenge': {
        if(typeof input.requestId!=='string'||!input.requestId||input.requestId.length>128||!['review','optimize','reply'].includes(input.action))throw Error('挑战请求无效。')
        const base=options.runtimeUrl();if(!base)throw Error('检查服务尚未就绪。')
        // A user action replaces an automatic review in this note. A different
        // note/account cannot cancel or receive its results.
        for(const job of challenges.values())if(job.owner===owner&&job.sessionId===session)job.controller.abort()
        if(challenges.has(input.requestId)||challenges.size>=4)throw Error('请等待当前检查结束。')
        const controller=new AbortController(),job={owner,sessionId:session,controller};challenges.set(input.requestId,job)
        try{
          const url=new URL('/sherlock/notes/challenge',base)
          const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',origin:url.origin},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(65000)]),body:JSON.stringify({sessionId:session,requestId:input.requestId,action:input.action,level:input.level,title:input.title,blocks:input.blocks,...input.changedIds===undefined?{}:{changedIds:input.changedIds},...input.action==='review'&&input.existingAnchors!==undefined?{existingAnchors:input.existingAnchors}:{},...input.thread===undefined?{}:{thread:input.thread}})})
          const result=await response.json()
          if(!response.ok)throw Error(typeof result.error==='string'?result.error:'本轮检查未完成。')
          if(controller.signal.aborted||options.owner()!==owner||!options.canRead(session))throw Error('笔记状态已变化，本轮结果未应用。')
          return result
        }finally{if(challenges.get(input.requestId)===job)challenges.delete(input.requestId)}
      }
      case 'render': {
        const spec = parseResearchContainerSpec(input.spec)
        if (!spec) throw Error('研究组件格式无效。')
        let html = ''
        if (spec.type === 'html') html = spec.html
        else if (spec.type === 'chart') html = renderCartesianChart({ ...spec, note: '来源：当前笔记或复制的研究内容' })?.html ?? ''
        else if (spec.type === 'table') html = spec.rows.length ? renderMarketArtifact({ ...spec, type: 'market', variant: 'table', asOf: '来源：当前笔记或复制的研究内容' })?.html ?? '' : '<p>表格尚无数据行。</p>'
        else if (spec.type === 'markdown') html = '<article style="white-space:pre-wrap;line-height:1.8">' + String(spec.content ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)) + '</article>'
        return { html, document:html?buildResearchHtmlPreview(html,spec.title,input.dark?'dark':'light',{workbench:true}):'',title:spec.title }
      }
      case 'native-table': {
        const dimensions=typeof input.prompt==='string'&&nativeBlankTableIntent(input.prompt)
        if(Object.keys(input).some(key=>!['owner','sessionId','requestId','documentId','prompt','anchorId','title','entryPoint'].includes(key))||input.entryPoint!==undefined&&input.entryPoint!=='composer'||!dimensions||input.prompt.length>8000||typeof input.requestId!=='string'||!input.requestId||input.requestId.length>128||typeof input.documentId!=='string'||input.documentId.length>128||typeof input.anchorId!=='string'||!input.anchorId||input.anchorId.length>256||typeof input.title!=='string'||input.title.length>1000||options.canWrite?.(session)===false||documentAdapter.identity(session)!==input.documentId)throw Error('原生笔记请求已过期或不可编辑。')
        const cacheKey=JSON.stringify([owner,session,'native-table',input.requestId]),fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex'),cached=capabilityResults.get(cacheKey)
        if(cached){if(cached.fingerprint!==fingerprint)throw Error('请求标识已用于不同原生操作。');return cached.result}
        if(capabilityResults.size>=512)throw Error('本次客户端会话的操作回执已满，请重新启动客户端。')
        if(active.has(input.requestId)||[...generations.entries()].some(([id,job])=>!job.cardLocal&&!active.get(id)?.signal.aborted))throw Error('请等待当前笔记操作结束。')
        const base=options.runtimeUrl();if(!base)throw Error('笔记会话服务尚未就绪。')
        const controller=new AbortController(),window=options.getWindow(),job={owner,sessionId:session,cardLocal:false}
        active.set(input.requestId,controller);generations.set(input.requestId,job)
        const current=()=>!controller.signal.aborted&&active.get(input.requestId)===controller&&options.owner()===owner&&options.getWindow()===window&&!!window&&!window.isDestroyed()&&options.canRead(session)&&options.canWrite?.(session)!==false&&documentAdapter.identity(session)===input.documentId
        const context:ClientCapabilityContext={owner,sessionId:session,documentId:input.documentId,mode:'notes',editable:true,selectedBlockIds:[],selectedParagraphIds:[],selectedNativeBlockIds:[]}
        const history=async(action:string,value:any)=>{
          if(options.owner()!==owner||!options.canRead(session))throw Error('账号或笔记会话已变化。')
          const url=new URL('/sherlock/notes/session',base),response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',origin:url.origin},signal:AbortSignal.timeout(10000),body:JSON.stringify({sessionId:session,requestId:input.requestId,action,...value})}),result=await response.json()
          if(!response.ok)throw Error(result.error||'原生笔记会话暂未保存。');return result
        }
        let begun=false,receipt:any
        try{
          const admission=await history('conversation-native-begin',{prompt:input.prompt,title:input.title,...input.entryPoint==='composer'?{previewOnly:true}:{}});begun=true
          if(admission.row&&!['ready','failed','stopped','accepted','discarded'].includes(admission.row.phase))throw Error('原生笔记准备尚未完成，本次未执行，请重试。')
          if(admission.row){const row=admission.row,receipt=row.result?.capabilityReceipts?.[0]??{status:'cancelled',requestId:input.requestId,capability:'notes.blocks.apply',message:'本次原生笔记请求已结束，原内容已保留。'},result={receipt,result:row.result??{kind:'conversation',markdown:receipt.message,capabilityReceipts:[receipt]},phase:row.phase};capabilityResults.set(cacheKey,{fingerprint,result});return result}
          if(!current())throw Error('本次原生笔记操作已取消。')
          const read=await capabilityBridge.request('notes.blocks.read',{scope:'note'},context,input.requestId,controller.signal,current)
          if(!current()||read?.status!=='succeeded'||!read.data?.blocks?.some((row:any)=>row.block.id===input.anchorId))throw Error('原插入位置已变化，笔记内容已保留。')
          const {rows,columns}=dimensions
          const table={type:'table',content:{type:'tableContent',headerRows:0,rows:Array.from({length:rows},()=>({cells:Array.from({length:columns},()=> '')}))}}
          receipt=await capabilityBridge.request('notes.blocks.apply',{revision:read.data.revision,operations:[{op:'insert',anchor:{blockId:input.anchorId,placement:input.entryPoint==='composer'?'after':'before'},consumeEmpty:true,blocks:[table]}]},context,input.requestId,controller.signal,current,input.entryPoint==='composer')
          // Saved is accepted only through this request's bridge and an actual
          // NotesStore checkpoint containing its native table, never a UI flag.
          if(receipt?.effect?.state==='saved'){
            const flatten=(blocks:any[]):any[]=>blocks.flatMap(block=>[block,...flatten(block.children??[])]),saved=flatten(store.load(owner,session).saved.blocks)
            if(!saved.some(block=>receipt.effect.changedBlockIds.includes(block.id)&&!read.data.blocks.some((row:any)=>row.block.id===block.id)&&receipt.effect.changedBlockIds.every((id:string)=>id===block.id||id===input.anchorId)&&block.type==='table'&&block.content?.rows?.length===rows&&block.content.rows.every((row:any)=>row.cells?.length===columns)))receipt={status:'failed',message:'本次表格保存尚未确认，已保留当前笔记。'}
          }
          if(!current())receipt={...receipt,status:'cancelled'}
          receipt={...receipt,requestId:input.requestId,capability:'notes.blocks.apply'}
          const phase=receipt.status==='succeeded'?'ready':receipt.status==='cancelled'?'stopped':'failed'
          let recorded=await history('conversation-native-end',{phase,receipt})
          if(!current()&&recorded.phase==='ready'){receipt={...receipt,status:'cancelled'};recorded=await history('conversation-native-end',{phase:'stopped',receipt})}
          const result={receipt,result:recorded.result,phase:recorded.phase};capabilityResults.set(cacheKey,{fingerprint,result});return result
        }catch(error){
          receipt={...receipt,status:current()?'failed':'cancelled',requestId:input.requestId,capability:'notes.blocks.apply',message:(error as Error).message}
          const phase=receipt.status==='cancelled'?'stopped':'failed'
          if(begun){const recorded=await history('conversation-native-end',{phase,receipt});const result={receipt,result:recorded.result,phase:recorded.phase};capabilityResults.set(cacheKey,{fingerprint,result});return result}
          throw error
        }finally{if(active.get(input.requestId)===controller)active.delete(input.requestId);if(generations.get(input.requestId)===job)generations.delete(input.requestId)}
      }
      case 'generate': {
        for(const job of challenges.values())if(job.owner===owner&&job.sessionId===session)job.controller.abort()
        const cardLocal=input.mode==='component'&&input.entryPoint==='component'
        if(input.entryPoint==='inline'&&(!input.insertionAnchor||typeof input.insertionAnchor.documentId!=='string'||!input.insertionAnchor.documentId||input.insertionAnchor.documentId.length>128||!input.insertionAnchor.position||typeof input.insertionAnchor.position!=='object'||Array.isArray(input.insertionAnchor.position)||JSON.stringify(input.insertionAnchor).length>4096||input.insertionAnchor.documentId!==input.capabilityContext?.documentId||typeof input.insertionAnchor.blockId!=='string'||!input.insertionAnchor.blockId||input.insertionAnchor.blockId.length>256))throw Error('笔记插入位置无效，请在空白行重新启用 AI。')
        const cacheKey=JSON.stringify([owner,session,input.requestId]),fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex'),cached=capabilityResults.get(cacheKey)
        if(cached){if(cached.fingerprint!==fingerprint)throw Error('请求标识已用于不同生成请求。');return cached.result}
        if(capabilityResults.size>=512)throw Error('本次客户端会话的操作回执已满，请重新启动客户端。')
        if (typeof input.requestId !== 'string' || !input.requestId || input.requestId.length > 128 || active.has(input.requestId) || [...generations.entries()].filter(([id,job])=>job.cardLocal===cardLocal&&!active.get(id)?.signal.aborted).length >= (cardLocal?3:1)) throw Error('请等待当前笔记生成完成。')
        const base = options.runtimeUrl(); if (!base) throw Error('模型服务尚未就绪，请稍后重试。')
        const url = new URL('/sherlock/notes/generate', base), controller = new AbortController()
        active.set(input.requestId, controller)
        generations.set(input.requestId,{owner,sessionId:session,cardLocal})
        try {
          const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(input.capabilityContext?600000:input.mode==='component'?245000:125000)])
          const context=await prepareNoteReferences(input.context,{sessionId:session,owner,files:options.files,captureSources:options.captureSources,signal,current:()=>options.owner()===owner&&options.canRead(session)})
          const binding=input.capabilityContext
          const clientContext:ClientCapabilityContext|undefined=!cardLocal&&input.mode!=='component'&&binding&&typeof binding.documentId==='string'&&binding.documentId.length<=128&&Array.isArray(binding.selectedBlockIds)&&binding.selectedBlockIds.length<=1000&&binding.selectedBlockIds.every((id:any)=>typeof id==='string'&&id.length<=256)&&(binding.selectedParagraphIds===undefined||Array.isArray(binding.selectedParagraphIds)&&binding.selectedParagraphIds.length<=1000&&binding.selectedParagraphIds.every((id:any)=>typeof id==='string'&&id.length>0&&id.length<=256))&&(binding.selectedNativeBlockIds===undefined||Array.isArray(binding.selectedNativeBlockIds)&&binding.selectedNativeBlockIds.length<=1000&&binding.selectedNativeBlockIds.every((id:any)=>typeof id==='string'&&id.length>0&&id.length<=256))?{owner,sessionId:session,documentId:binding.documentId,mode:'notes',editable:options.canWrite?.(session)??true,selectedBlockIds:binding.selectedBlockIds,selectedParagraphIds:binding.selectedParagraphIds??[],selectedNativeBlockIds:[...(binding.selectedNativeBlockIds??[])]}:undefined
          const generationWindow=options.getWindow()
          const current=()=>!!generationWindow&&!generationWindow.isDestroyed()&&options.getWindow()===generationWindow&&options.owner()===owner&&options.canRead(session)&&active.get(input.requestId)===controller&&!signal.aborted
          const renderer=(action:'context'|'notes.export'|'notes.components.style'|'notes.components.layout'|'notes.components.create'|'notes.blocks.align'|'notes.blocks.read'|'notes.blocks.apply'|'notes.blocks.undo'|'notes.components.inspect'|'notes.components.apply'|'notes.challenge.configure'|'notes.components.data',args:any)=>capabilityBridge.request(action,args,clientContext!,input.requestId,signal,current,input.entryPoint==='composer')
          const componentData=createNoteDataRevisionHandler(clientContext?.selectedBlockIds[0],args=>renderer('notes.components.data',args))
          const host=createClientCapabilityHost({current:()=>current()?clientContext:undefined,...options.windowAction?{window:async(action,args)=>{await renderer('context',{});if(!current())throw Error('当前会话已变化。');return options.windowAction!(action,args)}}:{},handlers:{
            ...createNoteCapabilityHandlers({context:clientContext,renderer,canWrite:()=>options.canWrite?.(session)!==false,componentData:options.componentData?componentData:undefined,requestContext:{images:input.images??[],context:input.context,title:input.title,markdown:input.markdown,selection:input.selection},sourceInstruction:input.prompt}),
            ...options.inspectCanvas&&(options.canvasAvailable?.(session)??true)?{inspectCanvas:async(args:any)=>{await renderer('context',{});const data=await options.inspectCanvas!(session,signal,args);return {status:'succeeded' as const,data}}}:{},
            ...options.resetZoom?{resetZoom:async()=>{await renderer('context',{});if(!current())throw Error('当前会话已变化。');await options.resetZoom!();return{status:'succeeded' as const}}}:{}
          }})
          const {registry}=host,executor=createNoteCapabilityExecutor(host,()=>current()?clientContext:undefined),receipts:CapabilityReceipt[]=[]
          // Read once through the same visible-editor lease before asking the model.
          // This revision is usable by native apply; it grants no new write authority.
          let documentSnapshot:Record<string,unknown>|undefined
          const referenceScope=input.context?.scope??'note'
          if(binding?.nativeSnapshot===1&&clientContext&&referenceScope!=='none'&&(referenceScope==='note'||clientContext.selectedNativeBlockIds?.length)){
            const scope=referenceScope==='selection'?'selected':'note'
            const snapshot=await executor.execute({requestId:'host-snapshot-'+randomUUID(),capability:'notes.blocks.read',arguments:{scope}},clientContext,signal)
            signal.throwIfAborted();if(!current())throw Error('笔记会话已变化，请重新生成。')
            if(snapshot.status!=='succeeded')throw Error(snapshot.message||'当前笔记快照暂不可用，原文已保留。')
            if(snapshot.status==='succeeded'&&snapshot.data&&JSON.stringify(snapshot.data).length<=500000)documentSnapshot={...snapshot.data as Record<string,unknown>,documentId:clientContext.documentId,scope}
          }
          const generateResult=async(clientReceipts:CapabilityReceipt[],textOnly=false)=>{
            const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: url.origin }, signal, body: JSON.stringify({ sessionId: session, requestId:input.requestId,title: input.title, markdown: input.markdown, selection: input.selection, context,prompt: input.prompt, images: input.images, mode: input.mode,...input.entryPoint==='inline'?{insertionAnchor:input.insertionAnchor}:{},...cardLocal&&typeof input.sourceInstruction==='string'&&input.sourceInstruction.length<=8000?{sourceInstruction:input.sourceInstruction}:{},...input.entryPoint===undefined?{}:{entryPoint:input.entryPoint},...input.targetBlockId===undefined?{}:{targetBlockId:input.targetBlockId},...clientContext?{clientCapabilities:textOnly?[]:registry.catalog(clientContext),clientContext,clientReceipts,...documentSnapshot?{documentSnapshot}:{}}:{},...textOnly?{completionMode:'text-only'}:{},stream:true }) })
            if (!response.ok) {const result=await response.json();throw Error(result.error || '笔记生成失败，请重试。')}
            return readNoteGenerationStream(response,progress=>{
              if(options.owner()!==owner||!options.canRead(session)){controller.abort();return}
              ;(_event.sender as {send(channel:string,value:unknown):void}).send('notes:progress',{sessionId:session,requestId:input.requestId,owner,...progress})
            })
          }
          let result=await runClientCapabilityLoop({signal,preserveRemainingReply:true,execute:call=>executor.execute(call,clientContext!,signal),onReceipts:items=>{
            receipts.push(...items)
            // Only validated host receipts may become visible action progress.
            // Read results stay in the model context, outside the conversation UI.
            if(options.owner()===owner&&options.canRead(session)&&generationWindow&&!generationWindow.isDestroyed()){
              const capabilityProgress=receipts.map(({requestId,capability,status,message,path,effect})=>({requestId,capability,status,...message===undefined?{}:{message},...path===undefined?{}:{path},...effect===undefined?{}:{effect}}))
              ;(_event.sender as {send(channel:string,value:unknown):void}).send('notes:progress',{sessionId:session,requestId:input.requestId,owner,capabilityProgress})
            }
          },generate:generateResult})
          const retainResult=async()=>{
            if(receipts.length){
              capabilityResults.set(cacheKey,{fingerprint,result})
              if(options.owner()===owner&&options.canRead(session)){
                const receiptUrl=new URL('/sherlock/notes/session',base)
                const recorded=await fetch(receiptUrl,{method:'POST',headers:{'content-type':'application/json',origin:receiptUrl.origin},signal:AbortSignal.timeout(10000),body:JSON.stringify({sessionId:session,action:'conversation-capabilities',requestId:input.requestId,...result?.kind==='conversation'&&result.requiresReply===true?{remainingReply:{markdown:result.markdown}}:{},receipts})}).catch(()=>undefined)
                if(!recorded?.ok)result.markdown=result.kind==='conversation'?result.markdown+'\n操作回执暂未写入会话历史。':result.markdown
              }
            }
          }
          if(input.entryPoint==='inline'&&result?.kind==='conversation'&&receipts.some(receipt=>receipt.capability==='notes.components.create'&&['failed','unavailable'].includes(receipt.status))){
            // Once a real action has settled, even a failed text continuation
            // must not make an identical delivery execute that action again.
            capabilityResults.set(cacheKey,{fingerprint,result})
            try{
              const assertFallbackCurrent=()=>{signal.throwIfAborted();if(!current()||options.canWrite?.(session)===false)throw Error('笔记状态已变化，本次文字未插入。')}
              const checkAnchor=async()=>{assertFallbackCurrent();const value=await renderer('context',{});if(value?.status!=='succeeded')throw Error('笔记插入位置已变化。');assertFallbackCurrent()}
              await checkAnchor()
              const fallback=await generateResult(receipts,true)
              await checkAnchor()
              if(fallback?.kind!=='conversation'||fallback.requiresReply!==true){
                if(fallback?.kind!=='text'||fallback.textFallback!==true||typeof fallback.markdown!=='string'||!fallback.markdown.trim()||fallback.markdown.length>100000)throw Error('本次没有取得完整可用正文，原需求已保留。')
                result={kind:'text',markdown:fallback.markdown,textFallback:true,...['before-components','after-components'].includes(fallback.inlineOrder)?{inlineOrder:fallback.inlineOrder}:{},capabilityReceipts:receipts,capabilitySummary:capabilityReceiptText(receipts)}
              }
            }catch(error){await retainResult();throw error}
          }
          await retainResult()
          if (options.owner() !== owner) throw Error('账号已变化，请重新生成。')
          return result
        } finally {
          // A cancelled snapshot-backed request ID is terminal too. Replaying
          // the transport must not start a fresh edit after the user's Stop.
          if(input.capabilityContext?.nativeSnapshot===1&&controller.signal.aborted&&!capabilityResults.has(cacheKey))capabilityResults.set(cacheKey,{fingerprint,result:{kind:'conversation',markdown:'生成已停止。',requiresReply:true}})
          if(input.capabilityContext&&options.owner()===owner){
            const endUrl=new URL('/sherlock/notes/session',base)
            await fetch(endUrl,{method:'POST',headers:{'content-type':'application/json',origin:endUrl.origin},signal:AbortSignal.timeout(3000),body:JSON.stringify({sessionId:session,action:'conversation-capabilities-end',requestId:input.requestId})}).catch(()=>{})
          }
          active.delete(input.requestId);generations.delete(input.requestId)
        }
      }
      default: throw Error('不支持的笔记操作。')
    }
  })
  return () => { documentAdapter.dispose();capabilityBridge.dispose();for(const job of dataJobs.values())job.controller.abort();dataJobs.clear();options.nativeMenu?.close(); active.forEach(c => c.abort()); active.clear();generations.clear();for(const job of challenges.values())job.controller.abort();challenges.clear(); options.ipcMain.removeHandler('notes:request') }
}
