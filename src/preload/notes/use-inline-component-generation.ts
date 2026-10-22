import {useEffect,useMemo,useRef,useState} from 'react'
import type {NoteAiResult,NotesBridge} from '../../shared/workspace-notes'

type Options={sessionId:string;bridge:Pick<NotesBridge,'request'>;editor:any;current():boolean;persist():Promise<unknown>;changed?():void;update?(blockId:string,node:Record<string,any>):void;notify?():void}
type GenerationContext={images?:any[];context?:any;title?:string;markdown?:string;selection?:string}
type GenerationEffect=(state:'applied'|'saved')=>Promise<void>
type Job={onEffect?:GenerationEffect;blockId:string;requestId:string;expected:string;controller:AbortController;timer:ReturnType<typeof setTimeout>;phase:'generating'|'binding'}
const withoutSize=(node:any)=>JSON.stringify({...node,noteSize:undefined})
const stopped='生成已停止，可调整需求后重试。'

/** Card jobs own only their block; conversation and composer state stay outside this controller. */
export function createInlineComponentGeneration(options:Options){
 const jobs=new Map<string,Job>(),waiters=new Map<string,(receipt:any)=>void>();let disposed=false
 const active=(job:Job)=>!disposed&&!job.controller.signal.aborted&&jobs.get(job.blockId)===job&&options.current()
 const current=(job:Job)=>{
  if(!active(job))return
  const block=options.editor.getBlock(job.blockId);if(!block)return
  try{const node=JSON.parse(block.props.payload);if(withoutSize(node)!==withoutSize(JSON.parse(job.expected)))return;job.expected=block.props.payload;return {block,node}}catch{return}
 }
 const write=(job:Job,next:Record<string,any>,system=false)=>{
  const latest=current(job);if(!latest||!options.editor.isEditable)return false
  const node={...next,noteSize:latest.node.noteSize},payload=JSON.stringify(node)
  // A BlockNote node view can render synchronously inside updateBlock.
  job.expected=payload
  try{if(system&&options.update)options.update(job.blockId,node);else options.editor.updateBlock(job.blockId,{props:{payload}})}
  catch(error){job.expected=latest.block.props.payload;throw error}
  return true
 }
 const finish=(job:Job,notify=true)=>{
  clearTimeout(job.timer)
  if(jobs.get(job.blockId)===job){jobs.delete(job.blockId);if(notify)options.notify?.()
   const done=waiters.get(job.blockId);if(done){waiters.delete(job.blockId);let node:any;try{node=JSON.parse(options.editor.getBlock(job.blockId)?.props.payload)}catch{}
    done({status:job.controller.signal.aborted?'cancelled':node?.containerSpec&&!['failed','interrupted'].includes(node.generationStatus)?'succeeded':node?.generationStatus==='draft'?'pending':'failed',blockId:job.blockId,message:node?.generationError||node?.generationDetail})}
  }
 }
 const cancel=(job:Job,status?:'interrupted'|'failed',message=stopped,notify=true)=>{
  if(jobs.get(job.blockId)!==job)return
  if(status&&job.phase==='generating'){const latest=current(job);if(latest)write(job,{...latest.node,generationStatus:status,generationError:message})}
  job.controller.abort();finish(job,notify)
  void options.bridge.request('stop',{sessionId:options.sessionId,requestId:job.requestId}).catch(()=>{})
 }
 const run=async(job:Job,prompt:string,source:GenerationContext={})=>{
  try{
   const result:NoteAiResult=await options.bridge.request('generate',{sessionId:options.sessionId,requestId:job.requestId,prompt,images:[],title:'',markdown:'',selection:'',context:{scope:'none',components:[]},...source,mode:'component',entryPoint:'component'})
   if(!active(job))return
   const latest=current(job);if(!latest){cancel(job);return}
   if(result.kind==='conversation'){write(job,{...latest.node,generationStatus:'draft',generationDetail:result.markdown,generationError:undefined});return}
   if(result.kind!=='component'||!result.node?.containerSpec)throw Error('组件生成未返回有效内容，请重试。')
   const node={...result.node,id:latest.node.id,noteLibrary:true,noteSize:latest.node.noteSize}
   if(!write(job,node))return
   job.phase='binding';options.changed?.();await job.onEffect?.('applied');if(!active(job))return
   if(result.sourceResult?.status==='verified'){
    try{
     await options.persist();await job.onEffect?.('saved');const saved=current(job);if(!saved)return
     const binding=await options.bridge.request('component-data',{sessionId:options.sessionId,action:'bind-generated',nodeId:saved.node.id,recipe:result.sourceResult.recipe,initialSpec:saved.node.containerSpec})
     const bound=current(job);if(bound)write(job,{...bound.node,noteDataBound:true,sourceText:binding.enabled===false?'已绑定数据源 · 手动刷新':'已绑定数据源 · 可见时自动刷新'},true)
    }catch(error){const saved=current(job);if(saved)write(job,{...saved.node,noteDataBound:false,sourceText:'已验证数据来源 · 当前为快照，自动刷新未启用',generationError:(error as Error).message},true)}
   }
  }catch(error){
   const latest=current(job)
   if(latest)write(job,{...latest.node,generationStatus:'failed',generationError:(error as Error).name==='AbortError'?stopped:(error as Error).message})
  }finally{finish(job)}
 }
 const api={
  startAndWait:async(blockId:string,prompt:string,source?:GenerationContext,onEffect?:GenerationEffect):Promise<any>=>{
   if(jobs.has(blockId)||waiters.has(blockId))return {status:'failed',message:'此组件正在生成。'}
   let done!:(value:any)=>void;const completion=new Promise(resolve=>{done=resolve});waiters.set(blockId,done)
   const started=api.start(blockId,prompt,source,onEffect);if(!started.ok){waiters.delete(blockId);return {status:'failed',message:started.error}}return completion
  },
  activate:()=>{disposed=false},
  start:(blockId:string,prompt:string,source?:GenerationContext,onEffect?:GenerationEffect):{ok:boolean;error?:string}=>{
   if(disposed||!options.current()||!options.editor.isEditable)return {ok:false,error:'笔记当前不可编辑。'}
   // Deleted or independently replaced cards must not occupy a concurrency slot.
   for(const job of [...jobs.values()])if(!current(job))cancel(job)
   if(jobs.has(blockId))return {ok:false,error:'此组件正在生成。'}
   if(jobs.size>=3)return {ok:false,error:'最多同时创建 3 个组件，请等待其中一个完成。'}
   const block=options.editor.getBlock(blockId);let node:any
   try{node=JSON.parse(block.props.payload)}catch{return {ok:false,error:'组件已移除或记录已变化。'}}
   if(node.noteDraft!=='smart'||!prompt.trim())return {ok:false,error:'请先描述要创建的组件。'}
   const requestId=crypto.randomUUID(),job:Job={blockId,requestId,onEffect,expected:block.props.payload,controller:new AbortController(),phase:'generating',timer:setTimeout(()=>cancel(job,'failed','组件创建超时，可调整需求后重试。'),240000)}
   jobs.set(blockId,job)
   if(!write(job,{...node,containerPrompt:prompt.trim(),generationStatus:'running',generationError:undefined,generationDetail:undefined,generationTaskId:requestId,generationChildSessionId:undefined,generationStartedAt:Date.now(),generationEvents:[],generationPartialText:''})){finish(job);return {ok:false,error:'组件已变化，较新内容已保留。'}}
   options.notify?.();void run(job,prompt.trim(),source);return {ok:true}
  },
  stop:(blockId:string)=>{const job=jobs.get(blockId);if(!job)return {ok:false};cancel(job,'interrupted');return {ok:true}},
  isGenerating:(blockId:string)=>{const job=jobs.get(blockId);return !!job&&!!current(job)},
  progress:(value:any)=>{
   if(value?.sessionId!==options.sessionId||!value.componentTask)return
   const job=[...jobs.values()].find(candidate=>candidate.requestId===value.requestId)
   if(!job||job.phase!=='generating')return
   const latest=current(job);if(!latest){cancel(job);return}
   const task=value.componentTask,node=latest.node
   write(job,{...node,generationTaskId:task.generationTaskId||node.generationTaskId,generationChildSessionId:task.childSessionId||node.generationChildSessionId,generationStartedAt:task.generationStartedAt||node.generationStartedAt,generationEvents:Array.isArray(task.generationEvents)?task.generationEvents.slice(-120):node.generationEvents,generationPartialText:typeof task.generationPartialText==='string'?task.generationPartialText.slice(-12000):node.generationPartialText,generationStatus:'running'},true)
  },
  dispose:()=>{for(const job of [...jobs.values()])cancel(job,undefined,stopped,false);disposed=true}
 }
 return api
}

export function useInlineComponentGeneration(options:Options){
 const latest=useRef(options);latest.current=options
 const [version,setVersion]=useState(0)
 const controller=useMemo(()=>createInlineComponentGeneration({...options,current:()=>latest.current.sessionId===options.sessionId&&latest.current.current(),persist:()=>latest.current.persist(),changed:()=>latest.current.changed?.(),update:(id,node)=>{const value=latest.current;if(value.update)value.update(id,node);else value.editor.updateBlock(id,{props:{payload:JSON.stringify(node)}})},notify:()=>setVersion(value=>value+1)}),[options.sessionId,options.bridge,options.editor])
 useEffect(()=>{
  controller.activate();const progress=(event:Event)=>controller.progress((event as CustomEvent).detail),reset=()=>controller.dispose()
  document.addEventListener('sherlock:notes-generation-progress',progress);document.addEventListener('sherlock:notes-reset',reset)
  return()=>{document.removeEventListener('sherlock:notes-generation-progress',progress);document.removeEventListener('sherlock:notes-reset',reset);controller.dispose()}
 },[controller])
 return {start:controller.start,startAndWait:controller.startAndWait,stop:controller.stop,isGenerating:controller.isGenerating,version}
}
