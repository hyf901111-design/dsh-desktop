import { randomUUID } from 'node:crypto'
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

export function installNotesService(options: {
  ipcMain: any; getWindow(): TrustedWindow | undefined; root: string; owner(): string;
  runtimeUrl(): string | undefined; clipboard(): ResearchCanvasClipboard | undefined; canRead(sessionId: string): boolean; nativeMenu?: NotesNativeMenu; files?:NoteFiles; library?():ComponentLibraryStore|undefined;captureSources?(sessionId:string,sources:ResearchContextSource[]):{captureId:string;totalSources:number};componentData?:{request(sessionId:string,args:any):Promise<any>;visible(sessionId:string,active:boolean):void;reply(value:any):void}
}): () => void {
  const store = new NotesStore(options.root), active = new Map<string, AbortController>(), rpc = harnessRpc(options.runtimeUrl)
  const generations=new Map<string,{owner:string;sessionId:string;cardLocal:boolean}>()
  const challenges=new Map<string,{owner:string;sessionId:string;controller:AbortController}>()
  registerTrustedMainWindowHandler(options.ipcMain, 'notes:request', options.getWindow, async (_event, method: string, input: any) => {
    if (!input || typeof input.sessionId !== 'string' || input.sessionId.length > 256 || !options.canRead(input.sessionId)) throw Error('笔记会话不可用。')
    const owner = options.owner(), session = input.sessionId
    if (method !== 'load' && method !== 'conversation-load' && method !== 'stop' && input.owner !== owner) throw Error('账号已变化，请重新打开笔记。')
    switch (method) {
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
      case 'component-data': {
        if(!options.componentData)throw Error('组件数据刷新服务暂不可用。')
        const node=findNoteComponent(store.load(owner,session).saved.blocks,input.nodeId)
        if(!node)throw Error('笔记组件尚未保存或已移除，请稍后重试。')
        if(input.action==='bind-generated'&&JSON.stringify(node.containerSpec)!==JSON.stringify(input.initialSpec))throw Error('笔记组件内容已变化，请重新生成或绑定。')
        return options.componentData.request(session,{action:input.action,nodeId:input.nodeId,recipe:input.recipe,initialSpec:input.initialSpec,settings:input.settings})
      }
      case 'component-snapshots': {
        const window=options.getWindow(),key='note-snapshot:'+randomUUID(),controller=new AbortController();active.set(key,controller)
        try{return await captureNoteComponentSnapshots(window,input,()=>options.owner()===owner&&options.canRead(session)&&options.getWindow()===window,controller.signal)}finally{active.delete(key)}
      }
      case 'export': return saveNoteExport(input,()=>options.owner()===owner&&options.canRead(session))
      case 'conversation-load':
      case 'conversation-state': {
        const base=options.runtimeUrl();if(!base)return {rows:[],owner}
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
      case 'generate': {
        for(const job of challenges.values())if(job.owner===owner&&job.sessionId===session)job.controller.abort()
        const cardLocal=input.mode==='component'&&input.entryPoint==='component'
        if (typeof input.requestId !== 'string' || !input.requestId || input.requestId.length > 128 || active.has(input.requestId) || [...generations.values()].filter(job=>job.cardLocal===cardLocal).length >= (cardLocal?3:1)) throw Error('请等待当前笔记生成完成。')
        const base = options.runtimeUrl(); if (!base) throw Error('模型服务尚未就绪，请稍后重试。')
        const url = new URL('/sherlock/notes/generate', base), controller = new AbortController()
        active.set(input.requestId, controller)
        generations.set(input.requestId,{owner,sessionId:session,cardLocal})
        try {
          const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(input.mode==='component'?245000:125000)])
          const context=await prepareNoteReferences(input.context,{sessionId:session,owner,files:options.files,captureSources:options.captureSources,signal,current:()=>options.owner()===owner&&options.canRead(session)})
          const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: url.origin }, signal, body: JSON.stringify({ sessionId: session, requestId:input.requestId,title: input.title, markdown: input.markdown, selection: input.selection, context,prompt: input.prompt, images: input.images, mode: input.mode,...input.entryPoint===undefined?{}:{entryPoint:input.entryPoint},...input.targetBlockId===undefined?{}:{targetBlockId:input.targetBlockId},stream:true }) })
          if (!response.ok) {const result=await response.json();throw Error(result.error || '笔记生成失败，请重试。')}
          const result = await readNoteGenerationStream(response,progress=>{
            if(options.owner()!==owner||!options.canRead(session)){controller.abort();return}
            ;(_event.sender as {send(channel:string,value:unknown):void}).send('notes:progress',{sessionId:session,requestId:input.requestId,owner,...progress})
          })
          if (options.owner() !== owner) throw Error('账号已变化，请重新生成。')
          return result
        } finally { active.delete(input.requestId);generations.delete(input.requestId) }
      }
      default: throw Error('不支持的笔记操作。')
    }
  })
  return () => { options.nativeMenu?.close(); active.forEach(c => c.abort()); active.clear();generations.clear();for(const job of challenges.values())job.controller.abort();challenges.clear(); options.ipcMain.removeHandler('notes:request') }
}
