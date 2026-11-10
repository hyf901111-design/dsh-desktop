import {Window} from 'happy-dom'
import {afterEach,expect,it,vi} from 'vitest'
import {BrowserAppView} from '../src/preload/browser/view'
import type {BrowserQuestionState,BrowserQuestionUpdate} from '../src/shared/browser-region'

const cleanup:(()=>Promise<void>)[]=[]
afterEach(async()=>{for(const close of cleanup.splice(0))await close()})
const deferred=<T,>()=>{let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve()}
const questionState=(owner:string|null='owner-A'):BrowserQuestionState=>({ticket:'ticket-A',ownerSessionId:owner,draft:'原有草稿',draftRev:2,imageIds:['existing'],regionImageIds:[],phase:'plain',busy:false,active:true,canSend:true,sequence:0,syncVersion:0})
async function fixture(owner='owner-A'){
 const w=new Window({url:'http://127.0.0.1:59560'}),frames=new Map<number,FrameRequestCallback>();let serial=0,width=900,surface='browser',receive!:(state:any)=>void,questionUpdate!:(value:BrowserQuestionUpdate)=>void
 w.requestAnimationFrame=((fn:FrameRequestCallback)=>{frames.set(++serial,fn);return serial}) as any;w.cancelAnimationFrame=((id:number)=>{frames.delete(id)}) as any
 w.HTMLElement.prototype.getBoundingClientRect=function(){return new w.DOMRect(200,this.matches('[data-browser-viewport]')?100:10,width,this.matches('[data-browser-viewport]')?600:690)}
 const center=w.document.createElement('main');center.className='pI_x6G_centerCol';w.document.body.append(center)
 const tab={id:'tab-A',url:'https://page.example.test/a',title:'A',private:false,pinned:false,muted:false,zoom:1,loading:false,canBack:false,canForward:false}
 const state:any={tabs:[tab,{...tab,id:'tab-B',url:'https://page.example.test/b'}],activeId:tab.id,nativeRegion:true,history:[],closed:[],bookmarks:[],folders:[],downloads:[],settings:{engine:'Google',startup:'restore',bookmarksBar:true,askDownload:false,downloadPath:''}}
 const hooks=new Map<string,(input:any)=>any>(),questionHooks=new Map<string,(owner:string|null,input:any)=>any>();let current=questionState(owner||null)
 const request=vi.fn(async(method:string,input?:any)=>{if(hooks.has(method))return hooks.get(method)!(input);if(method==='snapshot'||method==='select')return structuredClone(state);if(method==='region-start')return{operationId:'operation-A',rect:{x:20,y:30,width:180,height:100},png:'synthetic-png',name:'网页选区.png'};return true})
 const question=vi.fn(async(ownerId:string|null,command:any)=>{if(questionHooks.has(command.kind))return questionHooks.get(command.kind)!(ownerId,command);if(command.kind==='prepare')return structuredClone(current);if(command.kind==='attach')current={...current,imageIds:['existing','region-A'],regionImageIds:['region-A']};if(command.kind==='edit')current={...current,draft:command.draft,draftRev:command.draftRev,sequence:command.sequence,syncVersion:command.syncVersion};return structuredClone(current)})
 const unsubscribe=vi.fn(),translationModel=vi.fn(async(_owner:string|null)=>({provider:'pending-provider',model:'pending-model',reasoningEffort:'high'}))
 const view=new BrowserAppView(w.document as any,{request,question,translationModel,subscribe:(fn:(state:any)=>void)=>{receive=fn;return()=>{}},subscribeQuestion:(fn:(value:BrowserQuestionUpdate)=>void)=>{questionUpdate=fn;return unsubscribe},source:async()=>{}} as any,{register:(_name:string,root:HTMLElement)=>w.document.body.append(root as any),open(){surface='browser'},close(){surface='chat'},current:()=>({surface})} as any)
 await view.open(owner);await flush()
 const frame=async(nextWidth=width)=>{width=nextWidth;const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(serial*16);await flush()}
 const until=async(predicate:()=>boolean)=>{for(let i=0;i<60&&!predicate();i++)await frame();expect(predicate()).toBe(true)}
 const action={action:'ask-ework',tabId:tab.id,url:tab.url,ownerSessionId:owner,contextToken:'context-A'}
 const start=async()=>{const pending=view.contextAction(action);await until(()=>request.mock.calls.some(([method])=>method==='region-question'));await pending}
 cleanup.push(async()=>{view.dispose();await w.happyDOM.abort()})
 return{w,view,state,request,question,translationModel,hooks,questionHooks,frame,until,start,action,unsubscribe,questionUpdate,receive,setCurrent:(s:BrowserQuestionState)=>{current=s},setOwner:(id:string)=>w.document.dispatchEvent(new w.CustomEvent('sherlock:browser-context',{detail:{sessionId:id}}))}
}

it('rejects foreign context identities and carries the authorized token into page operations',async()=>{
 const f=await fixture()
 for(const patch of [{tabId:'tab-B'},{url:'https://other.example/'},{ownerSessionId:'owner-B'},{contextToken:undefined}])await f.view.contextAction({...f.action,...patch,action:'reload'})
 expect(f.request.mock.calls.filter(([method])=>method==='context-authorize')).toHaveLength(0)
 for(const [action,method]of [['save-page','save'],['print','print'],['reload','reload']]){await f.view.contextAction({...f.action,action});expect(f.request).toHaveBeenCalledWith(method,{id:'tab-A',contextToken:'context-A'})}
})
it('uses the pending composer model without creating a session and preserves its public selection',async()=>{
 const f=await fixture('');await f.view.contextAction({...f.action,action:'translate'})
 expect(f.translationModel).toHaveBeenCalledWith(null)
 expect(f.request).toHaveBeenCalledWith('translation-start',{contextToken:'context-A',selection:{provider:'pending-provider',model:'pending-model',reasoningEffort:'high'}})
 expect(f.question).not.toHaveBeenCalled()
})
it('waits for resident preparation, final viewport geometry and its layout acknowledgement before selecting',async()=>{
 const f=await fixture(),prepare=deferred<BrowserQuestionState>(),ack=deferred<boolean>();f.questionHooks.set('prepare',()=>prepare.promise)
 const pending=f.view.contextAction(f.action);await flush();for(let i=0;i<3;i++)await f.frame();expect(f.request.mock.calls.some(([method])=>method==='region-start')).toBe(false)
 prepare.resolve(questionState());await flush()
 for(const width of [820,740,660,600])await f.frame(width)
 f.hooks.set('layout',()=>ack.promise);await f.frame(590);for(let i=0;i<5;i++)await f.frame(590)
 expect(f.request.mock.calls.some(([method])=>method==='region-start')).toBe(false)
 ack.resolve(true);await f.until(()=>f.request.mock.calls.some(([method])=>method==='region-question'));await pending
 const firstCapture=f.request.mock.calls.findIndex(([method])=>method==='region-start'),latestLayout=f.request.mock.calls.slice(0,firstCapture).filter(([method])=>method==='layout').at(-1)
 expect(latestLayout?.[1]).toMatchObject({active:true,visible:true,sessionId:'owner-A',bounds:{width:590}})
 expect(f.question).toHaveBeenCalledWith('owner-A',{kind:'attach',ticket:'ticket-A',png:'synthetic-png',name:'网页选区.png'})
 expect(f.request).toHaveBeenCalledWith('region-question',expect.objectContaining({operationId:'operation-A',rect:{x:20,y:30,width:180,height:100},state:expect.objectContaining({draft:'原有草稿',imageIds:['existing','region-A']})}))
})
it('does not resurrect a question when browser closes during resident preparation',async()=>{
 const f=await fixture(),prepare=deferred<BrowserQuestionState>();f.questionHooks.set('prepare',()=>prepare.promise)
 const pending=f.view.contextAction(f.action);await flush();f.view.close('owner-A');prepare.resolve(questionState());await flush();for(let i=0;i<8;i++)await f.frame();await pending
 expect(f.request.mock.calls.filter(([method])=>method==='region-start')).toEqual([])
 expect(f.question).toHaveBeenCalledWith('owner-A',{kind:'close',ticket:'ticket-A'})
})
it('cancels the old owner question when conversation changes while capture is pending',async()=>{
 const f=await fixture(),capture=deferred<any>();f.hooks.set('region-start',()=>capture.promise)
 const pending=f.view.contextAction(f.action);await f.until(()=>f.request.mock.calls.some(([method])=>method==='region-start'))
 f.setOwner('owner-B');await f.frame();capture.resolve({operationId:'operation-A',rect:{x:20,y:30,width:180,height:100},png:'late-png'});await pending
 expect(f.question.mock.calls.filter(([,command])=>command.kind==='attach')).toEqual([])
 expect(f.request.mock.calls.filter(([method])=>method==='region-question')).toEqual([])
 expect(f.question).toHaveBeenCalledWith('owner-A',{kind:'close',ticket:'ticket-A'})
})
it('routes draft/send/delete only to the operation ticket owner and reports failed send without losing the question',async()=>{
 const f=await fixture();await f.start();const base=f.question.mock.calls.length
 await f.view.regionEvent({kind:'send',operationId:'old-operation'});expect(f.question).toHaveBeenCalledTimes(base)
 await f.view.regionEvent({kind:'draft',operationId:'operation-A',draft:'新增问题',draftRev:3,sequence:4,syncVersion:5})
 expect(f.question).toHaveBeenLastCalledWith('owner-A',{kind:'edit',ticket:'ticket-A',draft:'新增问题',draftRev:3,sequence:4,syncVersion:5})
 f.questionHooks.set('send',()=>{throw Error('合成模型错误')});await f.view.regionEvent({kind:'send',operationId:'operation-A'})
 expect(f.question).toHaveBeenLastCalledWith('owner-A',{kind:'send',ticket:'ticket-A',draftRev:3})
 expect(f.request).toHaveBeenLastCalledWith('region-question',expect.objectContaining({state:expect.objectContaining({draft:'新增问题',error:'合成模型错误',busy:false})}))
 await f.view.regionEvent({kind:'delete',operationId:'operation-A'});expect(f.question).toHaveBeenLastCalledWith('owner-A',{kind:'delete',ticket:'ticket-A'});expect(f.request).toHaveBeenLastCalledWith('region-cancel',{operationId:'operation-A'})
})
it('closes a dismissed question without deleting attachments and releases the subscription on dispose',async()=>{
 const f=await fixture();await f.start();await f.view.regionEvent({kind:'close',operationId:'operation-A'})
 expect(f.question).toHaveBeenLastCalledWith('owner-A',{kind:'close',ticket:'ticket-A'});expect(f.question.mock.calls.some(([,command])=>command.kind==='delete')).toBe(false)
 f.view.dispose();expect(f.unsubscribe).toHaveBeenCalledTimes(1)
})
it('ignores stale subscription tickets and unrelated owners while accepting terminal updates for the exact question',async()=>{
 const f=await fixture();await f.start();f.request.mockClear()
 f.questionUpdate({ticket:'old-ticket',state:{...questionState(),ticket:'old-ticket',draft:'旧操作'}});await flush();expect(f.request).not.toHaveBeenCalled()
 f.questionUpdate({ticket:'ticket-A',state:{...questionState('owner-B'),draft:'其他会话草稿'}});await flush();expect(f.request).not.toHaveBeenCalled()
 f.questionUpdate({ticket:'ticket-A',state:{...questionState(),sent:true,active:false}});await flush();expect(f.request).toHaveBeenCalledWith('region-cancel',{operationId:'operation-A'});expect(f.question).toHaveBeenLastCalledWith('owner-A',{kind:'close',ticket:'ticket-A'})
})
it('preserves the exact pending ticket during busy first-send handoff before the session context event',async()=>{
 const f=await fixture('');await f.start();f.request.mockClear();f.question.mockClear()
 f.questionUpdate({ticket:'ticket-A',state:{...questionState('created-owner'),phase:'submitting',busy:true}});await flush()
 expect(f.question.mock.calls.filter(([,command])=>command.kind==='close')).toEqual([])
 expect(f.request).toHaveBeenCalledWith('region-question',expect.objectContaining({operationId:'operation-A',state:expect.objectContaining({ownerSessionId:'created-owner',busy:true})}))
 f.setOwner('created-owner');await f.frame();await f.view.regionEvent({kind:'send',operationId:'operation-A'})
 expect(f.question).toHaveBeenLastCalledWith('created-owner',{kind:'send',ticket:'ticket-A',draftRev:2})
})
it('cleans up preparation on canceled selection and capture failure without showing a question',async()=>{
 for(const reject of [false,true]){const f=await fixture();f.hooks.set('region-start',()=>{if(reject)throw Error('合成截图失败');return null});const pending=f.view.contextAction(f.action);await f.until(()=>f.request.mock.calls.some(([method])=>method==='region-start'));await pending;expect(f.request.mock.calls.filter(([method])=>method==='region-question')).toEqual([]);expect(f.question).toHaveBeenLastCalledWith('owner-A',{kind:'close',ticket:'ticket-A'});if(reject)expect(f.view.root.textContent).toContain('合成截图失败')}
})
