import {readFileSync} from 'node:fs'
import {expect,it,vi} from 'vitest'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {createClientCapabilityRegistry} from '../packages/dsh-research-task-runtime/client-capabilities.js'
import {runClientCapabilityLoop} from '../packages/dsh-research-task-runtime/client-capability-loop.js'

// Public final from own Native QA request 297235db, with only its per-turn nonce replaced.
const captured=JSON.parse(readFileSync(new URL('./fixtures/notes-native-capabilities-wrapper.json',import.meta.url),'utf8'))
const call=captured.main.capabilities.calls[0],token=options=>/wireToken=([a-f0-9-]+)/u.exec(options.system)?.[1]
const input={sessionId:'native-wrapper',requestId:'native-output',entryPoint:'inline',insertionAnchor:{documentId:'doc',blockId:'blank',position:{}},clientContext:{documentId:'doc'},title:'',markdown:'',selection:'',context:{scope:'none',components:[]},prompt:captured.prompt,mode:'write',clientCapabilities:[{id:'notes.components.create',available:true,parameters:createClientCapabilityRegistry().get('notes.components.create').parameters}]}
function fixture(repair=value=>value){
 let issued;const requests=[]
 const ctx={apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'fixture',model:'fixture',reasoningEffort:'max'},routable:true}}})}},llm:{stream:async function*(options){requests.push(options);let value;if(options.purpose==='workspace-note-format-recovery')value=repair({...captured.recovery,wireToken:issued});else if(JSON.parse(options.messages[0].content[0].text).clientReceipts?.length)value={kind:'conversation',markdown:''};else{issued=token(options);value={...captured.main,wireToken:issued}}yield{type:'text-delta',text:typeof value==='string'?value:JSON.stringify(value)};yield{type:'finish',reason:{kind:'stop'}}}}}
 return{ctx,requests}
}
it('accepts the captured same-nonce recovery wrapper through the original capability loop exactly once',async()=>{
 const f=fixture(),execute=vi.fn(async value=>({requestId:value.requestId,capability:value.capability,status:'succeeded',message:'已创建演示折线图',effect:{state:'saved',blockId:'actual-chart'}}))
 const result=await runClientCapabilityLoop({preserveRemainingReply:true,generate:receipts=>generateNoteSuggestion(f.ctx,{...input,clientReceipts:receipts}),execute})
 expect(execute).toHaveBeenCalledTimes(1);expect(execute).toHaveBeenCalledWith(call)
 expect(result).toMatchObject({kind:'conversation',capabilityReceipts:[{requestId:call.requestId,status:'succeeded'}]})
 expect(f.requests.map(x=>x.purpose)).toEqual(['workspace-note','workspace-note-format-recovery','workspace-note'])
 expect(f.requests[1].tools).toBeUndefined()
})
it.each([
 ['another nonce',value=>({...value,wireToken:'foreign'})],
 ['missing nonce',({wireToken,...value})=>value],
 ['unknown outer command',value=>({...value,commands:[{command:'write'}]})],
 ['unknown batch field',value=>({...value,capabilities:{...value.capabilities,operations:[]}})],
 ['changed arguments',value=>({...value,capabilities:{kind:'capabilities',calls:[{...call,arguments:{prompt:'修改其它已有内容'}}]}})],
 ['new request id',value=>({...value,capabilities:{kind:'capabilities',calls:[{...call,requestId:'new-id'}]}})],
 ['extra call',value=>({...value,capabilities:{kind:'capabilities',calls:[call,{...call,requestId:'extra'}]}})]
])('does not execute a recovered wrapper with %s',async(_name,change)=>{
 const f=fixture(change),execute=vi.fn()
 await expect(runClientCapabilityLoop({preserveRemainingReply:true,generate:receipts=>generateNoteSuggestion(f.ctx,{...input,clientReceipts:receipts}),execute})).rejects.toThrow()
 expect(execute).not.toHaveBeenCalled()
})
it('does not replay the captured batch when its original request already has a receipt',async()=>{
 const f=fixture(),receipt={requestId:call.requestId,capability:call.capability,status:'failed'}
 expect(await generateNoteSuggestion(f.ctx,{...input,clientReceipts:[receipt]})).toMatchObject({kind:'conversation',requiresReply:true,capabilityReceipts:[receipt]})
 expect(f.requests).toHaveLength(1)
})
