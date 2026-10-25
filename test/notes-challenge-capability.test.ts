import {expect,it,vi} from 'vitest'
import * as Y from 'yjs'
import {createClientCapabilityRegistry,createCapabilityExecutor,capabilityReceiptText,noteCapabilityReceiptMessage} from '../packages/dsh-research-task-runtime/client-capabilities.js'
import {createNoteCapabilityActions} from '../src/preload/notes/client-capability-actions'
import {NotesCapabilityBridge} from '../src/main/notes/capability-bridge'
const context={owner:'alice',sessionId:'note',documentId:'doc',mode:'notes' as const,editable:true,selectedBlockIds:[]}
const action='notes.challenge.configure'
const config={level:3,commentsExpanded:true,phase:'paused'}
function fixture(options:any={}){
 const doc=new Y.Doc(),prefs=doc.getMap('note-challenge'),effects:any[]=[],saved:any[]=[]
 const blocks=[{id:'p',type:'paragraph',content:[{type:'text',text:'正文与已有评论都要保留',styles:{bold:true}}]}]
 let current=true,phase=options.phase??'paused',handle:any
 const read=()=>({level:prefs.get('level')??0,commentsExpanded:prefs.get('marginExpanded')!==false,phase})
 const configure=vi.fn((args:any)=>doc.transact(()=>{if(args.level!==undefined)prefs.set('level',args.level);if(args.commentsExpanded!==undefined)prefs.set('marginExpanded',args.commentsExpanded)}))
 const snapshot=()=>({title:'笔记',blocks,yjs:Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')})
 handle=createNoteCapabilityActions({editor:{document:blocks},snapshot,current:()=>current,generationId:()=> 'g',documentId:'doc',selectedBlockIds:()=>[],challenge:()=>({configure,getConfiguration:read}),reportEffect:async(_id:string,effect:any)=>{effects.push(structuredClone(effect));if(options.cancelAt===effect.state)await handle({requestId:'configure',cancel:true})},persist:async()=>{if(options.failSave)throw Error('保存冲突');saved.push(snapshot());if(options.cancelAt==='persist')await handle({requestId:'configure',cancel:true})},exportNote:async()=>({}),settle:async()=>{}} as any)
 const call=(args:any={level:3,commentsExpanded:true},extra:any={})=>handle({requestId:'configure',generationId:'g',context,action,args,...extra})
 return{call,configure,read,effects,saved,blocks,doc,hide:()=>{current=false}}
}
it('exposes one bounded note-only write capability and rejects invalid settings before effects',async()=>{
 const handler=vi.fn(async()=>({status:'succeeded' as const})),registry=createClientCapabilityRegistry({configureChallenge:handler} as any)
 expect(registry.catalog(context).find(item=>item.id===action)?.available).toBe(true)
 for(const c of [{...context,editable:false},{...context,mode:'research' as const},{...context,owner:''}])expect(registry.catalog(c).find(item=>item.id===action)?.available).toBe(false)
 const executor=createCapabilityExecutor(registry,()=>context)
 for(const args of [{},{level:'3'},{level:1.5},{level:5},{commentsExpanded:'true'},{level:3,sessionId:'other'}])expect((await executor.execute({requestId:JSON.stringify(args),capability:action,arguments:args} as any,context)).status).toBe('failed')
 expect(handler).not.toHaveBeenCalled()
})
it('saves and reads back Yjs settings while leaving text intact and reporting queued review honestly',async()=>{
 const f=fixture(),before=JSON.stringify(f.blocks),result=await f.call()
 expect(result).toMatchObject({status:'succeeded',effect:{kind:'challenge',state:'saved',settings:{level:3,commentsExpanded:true},phase:'paused'}})
 expect(f.effects.map(effect=>effect.state)).toEqual(['applied','saved']);expect(f.saved).toHaveLength(1)
 const restored=new Y.Doc();Y.applyUpdate(restored,Buffer.from(f.saved[0].yjs,'base64'));expect(restored.getMap('note-challenge').toJSON()).toEqual({level:3,marginExpanded:true})
 expect(JSON.stringify(f.blocks)).toBe(before);expect(result.message).toContain('等待');expect(result.message).not.toContain('校验已完成')
 expect(capabilityReceiptText([{...result,capability:action}],'en')).toContain('AI Copilot settings: Completed. Settings saved')
 expect(noteCapabilityReceiptMessage({...result,message:result.message+'磁盘中文详情'},'en')).toContain('磁盘中文详情')
})
it.each(['applied','persist'])('retains the actual configuration effect when cancelled at %s',async cancelAt=>{
 const f=fixture({cancelAt}),result=await f.call()
 expect(result).toMatchObject({status:'cancelled',effect:{kind:'challenge',state:cancelAt==='applied'?'applied':'saved'}})
 expect(f.read()).toEqual(config);expect(f.saved).toHaveLength(cancelAt==='applied'?0:1)
})
it('keeps an applied effect on save failure and rejects stale context before mutation',async()=>{
 const f=fixture({failSave:true}),result=await f.call();expect(result).toMatchObject({status:'failed',effect:{kind:'challenge',state:'applied'}});expect(result.message).toContain('保存冲突');expect(result.message).not.toContain('设置已保存')
 const stale=fixture();stale.hide();await expect(stale.call()).rejects.toThrow('会话已变化');expect(stale.configure).not.toHaveBeenCalled()
})
it.each([['idle','当前没有运行中的校验'],['failed','最近一次校验未完成'],['waiting','等待调度'],['paused','等待调度'],['running','正在运行'],['limited','等待用量恢复']])('reports the actual %s phase and round-trips fixed configuration chrome across locales',async(phase,detail)=>{
 const f=fixture({phase}),receipt=await f.call()
 expect(receipt.message).toContain(detail);expect(receipt.message).not.toContain('校验已完成')
 if(phase==='idle'||phase==='failed')expect(receipt.message).not.toContain('等待调度')
 const english=noteCapabilityReceiptMessage({...receipt,capability:action},'en')!
 expect(english).not.toMatch(/[\u4e00-\u9fff]/u)
 expect(noteCapabilityReceiptMessage({...receipt,message:english},'zh')).toBe(receipt.message)
})
it('reports off as disabled and stores canonical receipt copy regardless of renderer locale',async()=>{
 vi.stubGlobal('document',{documentElement:{dataset:{odysseyLocale:'en'}}})
 try{const f=fixture(),receipt=await f.call({level:0,commentsExpanded:false});expect(receipt.message).toContain('AI随航已关闭');expect(receipt.message).not.toContain('等待调度');expect(receipt.message).not.toContain('Settings saved')}finally{vi.unstubAllGlobals()}
})
it('leaves malformed restored configuration receipts literal instead of crashing or inventing success',()=>{
 for(const effect of [{kind:'challenge'},{kind:'challenge',state:'saved',phase:'idle',settings:{}},{kind:'challenge',state:'saved',phase:'completed',settings:{level:3,commentsExpanded:true}},{kind:'challenge',state:'unexpected',phase:'idle',settings:{level:3,commentsExpanded:true}}])expect(noteCapabilityReceiptMessage({status:'failed',message:'历史原始详情',effect} as any,'en')).toBe('历史原始详情')
})
it('journals configuration checkpoints through the host bridge without accepting foreign settings or regressing saved state',async()=>{
 const sent:any[]=[],bridge=new NotesCapabilityBridge(value=>sent.push(value)),controller=new AbortController()
 const pending=bridge.request(action as any,{level:3},context,'g',controller.signal,()=>!controller.signal.aborted),requestId=sent[0].requestId,effect={kind:'challenge',state:'saved',settings:{level:3,commentsExpanded:true},phase:'paused'}
 expect(bridge.respond({requestId,sessionId:'other',effect},'alice')).toEqual({ok:false})
 expect(bridge.respond({requestId,sessionId:'note',effect},'bob')).toEqual({ok:false})
 expect(bridge.respond({requestId,sessionId:'note',effect},'alice')).toEqual({ok:true})
 expect(bridge.respond({requestId,sessionId:'note',effect:{...effect,state:'applied'}},'alice')).toEqual({ok:false})
 expect(bridge.respond({requestId,sessionId:'note',effect:{...effect,settings:{level:4,commentsExpanded:true}}},'alice')).toEqual({ok:false})
 controller.abort();bridge.respond({requestId,sessionId:'note',result:{status:'succeeded'}},'alice')
 expect(await pending).toMatchObject({status:'cancelled',effect,message:expect.stringContaining('设置已保存')});bridge.dispose()
})
