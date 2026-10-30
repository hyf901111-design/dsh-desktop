import {expect,it,vi} from 'vitest'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {createClientCapabilityRegistry,createCapabilityExecutor} from '../packages/dsh-research-task-runtime/client-capabilities.js'
import {runClientCapabilityLoop} from '../packages/dsh-research-task-runtime/client-capability-loop.js'
function fixture(outputs){
 const requests=[],context={owner:'owner',sessionId:'native-note',documentId:'doc',mode:'notes',editable:true,selectedBlockIds:[]},seen=[]
 const registry=createClientCapabilityRegistry({readNoteBlocks:async()=>{seen.push('read');return{status:'succeeded',data:{revision:'actual-read',blocks:[{block:{id:'anchor',type:'paragraph',content:[]},index:0}]}}},applyNoteBlocks:async args=>{seen.push(args);return{status:'succeeded',effect:{kind:'native-blocks',state:'saved',actionId:'owned',changedBlockIds:['table'],revision:'saved'}}}})
 const ctx={agents:{get:id=>id==='native-note'?{id,session:{events:[]}}:undefined},tools:{schemas:()=>[]},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'provider',model:'model'},routable:true}}})}},llm:{stream:async function*(request){requests.push(request);const result=outputs.shift(),wireToken=/wireToken=([a-f0-9-]+)/.exec(request.system)?.[1];yield{type:'text-delta',text:JSON.stringify(result.kind==='capabilities'?{...result,wireToken}:result)};yield{type:'finish',reason:{kind:'stop'}}}}}
 return{ctx,context,seen,requests,registry,input:{sessionId:'native-note',requestId:'request',title:'note',markdown:'',selection:'',prompt:'在这里插入可编辑表格并保留现有内容',mode:'write',entryPoint:'inline',insertionAnchor:{documentId:'doc',blockId:'anchor',position:{}},clientContext:context,clientCapabilities:registry.catalog(context),context:{scope:'note',components:[]}}}
}
it('does not treat a native read receipt as completion of an inline writing request',async()=>{
 const f=fixture([{kind:'conversation',markdown:''},{kind:'conversation',markdown:''}])
 await expect(generateNoteSuggestion(f.ctx,{...f.input,clientReceipts:[{requestId:'read',capability:'notes.blocks.read',status:'succeeded',data:{revision:'actual-read',blocks:[]}}]})).rejects.toThrow()
})
it('plans native read then apply through the existing capability loop without creating a child',async()=>{
 const f=fixture([{kind:'capabilities',calls:[{requestId:'read',capability:'notes.blocks.read',arguments:{scope:'note'}}]},{kind:'capabilities',calls:[{requestId:'apply',capability:'notes.blocks.apply',arguments:{revision:'actual-read',operations:[{op:'insert',anchor:{blockId:'anchor',placement:'before'},blocks:[{type:'table',content:{type:'tableContent',rows:[{cells:['','']}],headerRows:0}}]}]}}]},{kind:'conversation',markdown:''}]),executor=createCapabilityExecutor(f.registry,()=>f.context)
 const result=await runClientCapabilityLoop({preserveRemainingReply:true,generate:receipts=>generateNoteSuggestion(f.ctx,{...f.input,clientReceipts:receipts}),execute:call=>executor.execute(call,f.context)})
 expect(f.seen).toEqual(['read',expect.objectContaining({revision:'actual-read'})]);expect(result.capabilityReceipts.map(row=>row.capability)).toEqual(['notes.blocks.read','notes.blocks.apply']);expect(result.requiresReply).not.toBe(true)
 expect(f.requests[0].system).toContain('普通可编辑正文、表格、列表和代码优先使用 notes.blocks.read');expect(f.requests).toHaveLength(3)
})
