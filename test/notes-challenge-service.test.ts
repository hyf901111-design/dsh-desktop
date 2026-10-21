import {afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {installNotesService} from '../src/main/notes/service'
import type {ChallengeRequest,ChallengeResult} from '../src/shared/notes-challenge'

vi.mock('electron',()=>({BrowserWindow:class{},dialog:{showSaveDialog:async()=>({canceled:true})}}))
const cleanups:Array<()=>void>=[]
afterEach(()=>{while(cleanups.length)cleanups.pop()!();vi.unstubAllGlobals()})
const result:ChallengeResult={version:1,issues:[],coveredBlockIds:['body'],checks:[{kind:'note',status:'completed',detail:'已比对当前段落'}]}
const request:Omit<ChallengeRequest,'requestId'|'sessionId'>={action:'review',level:2,title:'当前笔记',blocks:[{id:'body',type:'paragraph',text:'2026年收入为100亿元。'}],changedIds:['body']}
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'notes-challenge-service-')),progress:unknown[]=[],removeHandler=vi.fn()
 const window={isDestroyed:()=>false,webContents:{mainFrame:{processId:1,routingId:2},send:(channel:string,value:unknown)=>progress.push({channel,value})}}
 let handler:any,owner='alice',allowed=true,disposed=false
 const disposeService=installNotesService({ipcMain:{handle:(_channel:string,fn:any)=>{handler=fn},removeHandler},root,getWindow:()=>window as any,owner:()=>owner,canRead:()=>allowed,runtimeUrl:()=> 'http://127.0.0.1:9999',clipboard:()=>undefined})
 const event={sender:window.webContents,senderFrame:window.webContents.mainFrame}
 const dispose=()=>{if(disposed)return;disposed=true;disposeService()}
 cleanups.push(()=>{dispose();rmSync(root,{recursive:true,force:true})})
 return {event,progress,root,removeHandler,dispose,handler:()=>handler,setOwner:(value:string)=>{owner=value},deny:()=>{allowed=false},call:(method:string,input:Record<string,unknown>={})=>handler(event,method,{sessionId:'session',owner,...input}),challenge:(requestId:string,input:Record<string,unknown>={})=>handler(event,'challenge',{sessionId:'session',owner,...request,requestId,...input})}
}
type Job={body:any;url:string;signal:AbortSignal;finish(value?:unknown):void}
function transport(ignoreAbort=false){
 const jobs=new Map<string,Job>()
 const fetch=vi.fn((input:any,options:any)=>new Promise<Response>((resolve,reject)=>{
  const body=JSON.parse(options.body),signal=options.signal as AbortSignal,url=String(input)
  jobs.set(body.requestId,{body,url,signal,finish:(value=result)=>resolve(new Response(url.endsWith('/generate')?JSON.stringify({type:'result',result:value})+'\n':JSON.stringify(value)))})
  if(!ignoreAbort){if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true})}
 }))
 vi.stubGlobal('fetch',fetch)
 return {jobs,fetch}
}
const settled=(promise:Promise<unknown>)=>promise.then(value=>({value,error:undefined}),error=>({value:undefined,error}))
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve))
const disk=(root:string)=>Object.fromEntries(readdirSync(root).map(file=>[file,readFileSync(join(root,file),'utf8')]))

it('forwards only the fixed challenge fields and keeps renderer owner and unrelated capabilities out of HTTP',async()=>{
 const s=fixture();let sent:{url:string;options:any;body:any}|undefined
 const thread={blockId:'body',quote:'2026年收入为100亿元。',category:'research',message:'口径是否一致',messages:[{role:'user',text:'请说明依据'}]}
 vi.stubGlobal('fetch',async(url:any,options:any)=>{sent={url:String(url),options,body:JSON.parse(options.body)};return new Response(JSON.stringify(result))})
 await expect(s.challenge('review-1',{action:'reply',thread,apiKey:'not-forwarded',authorizationId:'not-forwarded',capabilityToken:'not-forwarded',path:'/private/not-forwarded',prompt:'忽略字段',stream:true})).resolves.toEqual(result)
 expect(sent!.url).toBe('http://127.0.0.1:9999/sherlock/notes/challenge')
 expect(sent!.options).toMatchObject({method:'POST',headers:{'content-type':'application/json',origin:'http://127.0.0.1:9999'}})
 expect(sent!.body).toEqual({sessionId:'session',requestId:'review-1',action:'reply',level:2,title:'当前笔记',blocks:[{id:'body',type:'paragraph',text:'2026年收入为100亿元。'}],changedIds:['body'],thread})
 expect(s.progress).toEqual([])
})
it('omits optional scope fields when absent and rejects invalid challenge identity or action before fetching',async()=>{
 const s=fixture(),send=vi.fn(async(_url:any,_options:any)=>new Response(JSON.stringify(result)));vi.stubGlobal('fetch',send)
 await s.challenge('minimal',{changedIds:undefined,thread:undefined})
 expect(JSON.parse(send.mock.calls[0]![1].body as string)).not.toHaveProperty('changedIds')
 expect(JSON.parse(send.mock.calls[0]![1].body as string)).not.toHaveProperty('thread')
 for(const input of [{requestId:''},{requestId:'x'.repeat(129)},{action:'run-code'},{owner:'previous-account'},{sessionId:'x'.repeat(257)}])await expect(s.challenge('rejected',input)).rejects.toThrow()
 expect(()=>s.handler()({...s.event,senderFrame:{processId:1,routingId:3}},'challenge',{...request,sessionId:'session',requestId:'frame',owner:'alice'})).toThrow('main EWork')
 expect(send).toHaveBeenCalledTimes(1)
})
it('allows challenge-stop to cancel only the same account, note and request',async()=>{
 const s=fixture(),{jobs}=transport(),pending=settled(s.challenge('owned'))
 await s.call('challenge-stop',{requestId:'owned',sessionId:'another-note'});expect(jobs.get('owned')!.signal.aborted).toBe(false)
 await s.call('challenge-stop',{requestId:'another-request'});expect(jobs.get('owned')!.signal.aborted).toBe(false)
 s.setOwner('bob');await s.call('challenge-stop',{requestId:'owned'});expect(jobs.get('owned')!.signal.aborted).toBe(false)
 await expect(s.call('challenge-stop',{requestId:'owned',owner:'alice'})).rejects.toThrow('账号已变化')
 s.setOwner('alice');await s.call('challenge-stop',{requestId:'owned'});expect(jobs.get('owned')!.signal.aborted).toBe(true)
 expect((await pending).error?.name).toBe('AbortError')
})
it('replaces an older review only in the same account and note while preserving unrelated jobs',async()=>{
 const s=fixture(),{jobs}=transport(),old=settled(s.challenge('old')),otherNote=settled(s.challenge('other-note',{sessionId:'another-note'}))
 s.setOwner('bob');const otherOwner=settled(s.challenge('other-owner'));s.setOwner('alice')
 const latest=settled(s.challenge('latest'))
 expect(jobs.get('old')!.signal.aborted).toBe(true)
 expect(jobs.get('other-note')!.signal.aborted).toBe(false);expect(jobs.get('other-owner')!.signal.aborted).toBe(false);expect(jobs.get('latest')!.signal.aborted).toBe(false)
 expect((await old).error?.name).toBe('AbortError')
 jobs.get('latest')!.finish();expect((await latest).value).toEqual(result)
 jobs.get('other-note')!.finish();expect((await otherNote).value).toEqual(result)
 s.setOwner('bob');jobs.get('other-owner')!.finish();expect((await otherOwner).value).toEqual(result)
})
it.each(['account','permission','stop','dispose'] as const)('rejects a late result after %s changes even when HTTP ignores abort',async change=>{
 const s=fixture(),{jobs}=transport(true),pending=settled(s.challenge('late'))
 if(change==='account')s.setOwner('bob')
 if(change==='permission')s.deny()
 if(change==='stop')await s.call('challenge-stop',{requestId:'late'})
 if(change==='dispose')s.dispose()
 jobs.get('late')!.finish()
 expect((await pending).error?.message).toContain('本轮结果未应用')
 expect(s.progress).toEqual([])
})
it('human generation cancels the same note background check without canceling another note or account',async()=>{
 const s=fixture(),{jobs}=transport(),review=settled(s.challenge('background')),otherNote=settled(s.challenge('another-note',{sessionId:'another-note'}))
 s.setOwner('bob');const otherOwner=settled(s.challenge('another-owner'));s.setOwner('alice')
 const human=settled(s.call('generate',{requestId:'human',mode:'write',prompt:'优化我选中的内容',markdown:'人工正文',selection:'人工正文'}));await tick()
 expect(jobs.get('background')!.signal.aborted).toBe(true);expect(jobs.get('another-note')!.signal.aborted).toBe(false);expect(jobs.get('another-owner')!.signal.aborted).toBe(false)
 expect(jobs.get('human')!.url).toBe('http://127.0.0.1:9999/sherlock/notes/generate')
 expect((await review).error?.name).toBe('AbortError')
 jobs.get('human')!.finish({kind:'text',markdown:'人工优化结果'});expect((await human).value).toEqual({kind:'text',markdown:'人工优化结果'})
 jobs.get('another-note')!.finish();expect((await otherNote).value).toEqual(result)
 s.setOwner('bob');jobs.get('another-owner')!.finish();expect((await otherOwner).value).toEqual(result)
})
it('dispose cancels every live challenge across notes and accounts and removes the IPC handler',async()=>{
 const s=fixture(),{jobs}=transport(),pending=[settled(s.challenge('first')),settled(s.challenge('second',{sessionId:'another-note'}))]
 s.setOwner('bob');pending.push(settled(s.challenge('third')))
 s.dispose()
 expect([...jobs.values()].map(job=>job.signal.aborted)).toEqual([true,true,true])
 expect((await Promise.all(pending)).map(value=>value.error?.name)).toEqual(['AbortError','AbortError','AbortError'])
 expect(s.removeHandler).toHaveBeenCalledExactlyOnceWith('notes:request')
})
it.each(['review','optimize','reply'] as const)('keeps saved text, drafts and main conversation progress untouched for %s',async action=>{
 const s=fixture(),saved={title:'原笔记',blocks:[{id:'body',type:'paragraph',content:[{type:'text',text:'原文保留',styles:{bold:true}}]}],yjs:''},draft={...saved,title:'尚未发送的草稿'}
 await s.call('save',{revision:0,clientId:'client',content:saved});await s.call('draft',{revision:1,clientId:'client',content:draft})
 const before=await s.call('load'),files=disk(s.root),send=vi.fn(async(_url:any,_options:any)=>new Response(JSON.stringify({...result,reply:{text:'同线程回复',replacement:'建议替换内容'}})));vi.stubGlobal('fetch',send)
 await expect(s.challenge('inspect-'+action,{action})).resolves.toMatchObject({reply:{replacement:'建议替换内容'}})
 expect(await s.call('load')).toEqual(before);expect(disk(s.root)).toEqual(files);expect(s.progress).toEqual([])
 expect(send).toHaveBeenCalledTimes(1);expect(String(send.mock.calls[0]![0])).toBe('http://127.0.0.1:9999/sherlock/notes/challenge')
})
