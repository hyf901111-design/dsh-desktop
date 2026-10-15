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
  runtimeUrl(): string | undefined; clipboard(): ResearchCanvasClipboard | undefined; canRead(sessionId: string): boolean; nativeMenu?: NotesNativeMenu; files?:NoteFiles; library?():ComponentLibraryStore|undefined;captureSources?(sessionId:string,sources:ResearchContextSource[]):{captureId:string;totalSources:number}
}): () => void {
  const store = new NotesStore(options.root), active = new Map<string, AbortController>(), rpc = harnessRpc(options.runtimeUrl)
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
      case 'file-pick': return pickNoteFiles(input.kind,options.getWindow(),()=>options.owner()===owner&&options.canRead(session))
      case 'file-admit': if(!options.files)throw Error('文件服务尚未就绪。');return options.files.admit(owner,session,input)
      case 'file-bind': if(!options.files)throw Error('文件服务尚未就绪。');return options.files.bind(owner,session,input)
      case 'file-revoke': return {ok:options.files?.revoke(owner,session,input.nodeId)??false}
      case 'file-reveal': if(!options.files)throw Error('文件服务尚未就绪。');return options.files.reveal(owner,session,input)
      case 'menu-sync': if (!options.nativeMenu) throw Error('原生菜单不可用。'); options.nativeMenu.sync(input,owner); return {ok:true}
      case 'menu-close': options.nativeMenu?.close(input.menuId); return {ok:true}
      case 'load': return { ...store.load(owner, session), owner }
      case 'save': return store.save(owner, session, input.revision, input.content, input.clientId)
      case 'draft': store.draft(owner, session, input.clientId, input.revision, input.content); return { ok: true }
      case 'discard': store.discardDraft(owner, session, input.clientId); return { ok: true }
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
        const response = await fetch(url, {method:'POST',headers:{'content-type':'application/json',origin:url.origin},signal:AbortSignal.timeout(10000),body:JSON.stringify({sessionId:session,title:input.title})})
        const result = await response.json()
        if (!response.ok) throw Error(result.error || '笔记会话暂未保存，请重试。')
        if (options.owner() !== owner) throw Error('账号已变化，请重新打开笔记。')
        return result
      }
      case 'models': return rpc('session.models', { sessionId: session })
      case 'model': return rpc('session.selectModel', { sessionId: session, provider: input.provider, model: input.model })
      case 'clipboard': return options.clipboard()?.read() ?? { kind: 'empty' }
      case 'stop': active.get(input.requestId)?.abort(); return { ok: true }
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
        if (typeof input.requestId !== 'string' || input.requestId.length > 128 || active.has(input.requestId) || active.size >= 2) throw Error('请等待当前笔记生成完成。')
        const base = options.runtimeUrl(); if (!base) throw Error('模型服务尚未就绪，请稍后重试。')
        const url = new URL('/sherlock/notes/generate', base), controller = new AbortController()
        active.set(input.requestId, controller)
        try {
          const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(125000)])
          const context=await prepareNoteReferences(input.context,{sessionId:session,owner,files:options.files,captureSources:options.captureSources,signal,current:()=>options.owner()===owner&&options.canRead(session)})
          const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: url.origin }, signal, body: JSON.stringify({ sessionId: session, requestId:input.requestId,title: input.title, markdown: input.markdown, selection: input.selection, context,prompt: input.prompt, images: input.images, mode: input.mode,stream:true }) })
          if (!response.ok) {const result=await response.json();throw Error(result.error || '笔记生成失败，请重试。')}
          const result = await readNoteGenerationStream(response,progress=>{
            if(options.owner()!==owner||!options.canRead(session)){controller.abort();return}
            ;(_event.sender as {send(channel:string,value:unknown):void}).send('notes:progress',{sessionId:session,requestId:input.requestId,owner,...progress})
          })
          if (options.owner() !== owner) throw Error('账号已变化，请重新生成。')
          return result
        } finally { active.delete(input.requestId) }
      }
      default: throw Error('不支持的笔记操作。')
    }
  })
  return () => { options.nativeMenu?.close(); active.forEach(c => c.abort()); active.clear(); options.ipcMain.removeHandler('notes:request') }
}
