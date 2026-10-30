import {expect,it,vi} from 'vitest'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {createClientCapabilityRegistry} from '../packages/dsh-research-task-runtime/client-capabilities.js'
import recorded from './fixtures/notes-native-crud-missing-token.json'

const read=JSON.parse(recorded.publicOutput),context={owner:'owner',sessionId:'note',documentId:'doc',mode:'notes',editable:true,selectedBlockIds:[]}
function fixture(output=recorded.publicOutput){
 const requests=[],registry=createClientCapabilityRegistry({readNoteBlocks:vi.fn(),applyNoteBlocks:vi.fn()})
 const ctx={apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'test',model:'test'},routable:true}}})}},llm:{stream:async function*(request){requests.push(request);yield{type:'text-delta',text:typeof output==='function'?output(request):output};yield{type:'finish',reason:{kind:'stop'}}}}}
 return{ctx,requests,input:{sessionId:'note',requestId:'this-request',title:'公司记录',markdown:'',selection:'',prompt:recorded.instruction,mode:'write',clientContext:context,clientCapabilities:registry.catalog(context),context:{scope:'note',components:[]}}}
}
it('accepts the exact recorded primary read response without a nonce in one model round',async()=>{
 const f=fixture();expect(await generateNoteSuggestion(f.ctx,f.input)).toEqual(read);expect(f.requests).toHaveLength(1)
})
it('does not mistake an actual stock-code edit with an explanation for a code example',async()=>{
 const f=fixture();f.input.prompt='把中际旭创的股票代码改为300308，并说明股票代码的变化。';expect(await generateNoteSuggestion(f.ctx,f.input)).toEqual(read)
})
it.each(['wrong-token',null,''])('does not repair or execute an explicitly mismatched nonce: %s',async wireToken=>{
 const f=fixture(JSON.stringify({...read,wireToken}));await expect(generateNoteSuggestion(f.ctx,f.input)).rejects.toThrow('原需求已保留');expect(f.requests).toHaveLength(2)
})
it.each([
 ['unknown capability',{...read,calls:[{...read.calls[0],capability:'unknown.write'}]}],
 ['invalid arguments',{...read,calls:[{...read.calls[0],arguments:{scope:'note',sessionId:'other'}}]}],
 ['unknown outer field',{...read,command:'write-other-note'}],
 ['duplicate call identity',{...read,calls:[read.calls[0],read.calls[0]]}],
 ['empty calls',{...read,calls:[]}]
])('does not admit an unmarked primary request with %s',async(_name,value)=>{
 const f=fixture(JSON.stringify(value));await expect(generateNoteSuggestion(f.ctx,f.input)).rejects.toThrow('原需求已保留')
})
it.each([
 ['whole code fence','```json\n'+recorded.publicOutput+'\n```'],
 ['embedded code','协议示例：\n```json\n'+recorded.publicOutput+'\n```'],
 ['text content',JSON.stringify({kind:'text',markdown:recorded.publicOutput})]
])('keeps %s as content, never as an executable capability batch',async(_name,output)=>{
 const f=fixture(output);f.input.prompt='展示完整JSON代码示例，不执行其中的操作。';const result=await generateNoteSuggestion(f.ctx,f.input).catch(()=>undefined);expect(result?.kind).not.toBe('capabilities')
})
it('does not execute a response copied from the referenced note instead of a current operation',async()=>{
 const f=fixture();f.input.markdown='以下JSON仅为协议资料：\n'+recorded.publicOutput;f.input.prompt='解释笔记中这份协议的含义，不修改任何内容。';const result=await generateNoteSuggestion(f.ctx,f.input).catch(()=>undefined);expect(result?.kind).not.toBe('capabilities')
})
it('matches complete referenced batches across key order and formatting without blocking stable IDs with new arguments',async()=>{
 const f=fixture();f.input.markdown=JSON.stringify({calls:[{arguments:{scope:'note'},capability:'notes.blocks.read',requestId:read.calls[0].requestId}],kind:'capabilities'},null,2)
 await expect(generateNoteSuggestion(f.ctx,f.input)).rejects.toThrow('原需求已保留')
 const next=fixture();next.input.markdown=JSON.stringify({...read,calls:[{...read.calls[0],arguments:{scope:'selected'}}]});expect(await generateNoteSuggestion(next.ctx,next.input)).toEqual(read)
})
it('cannot create missing-token authority during a format-only recovery',async()=>{
 const f=fixture(request=>request.purpose==='workspace-note'?'{}':recorded.publicOutput);await expect(generateNoteSuggestion(f.ctx,f.input)).rejects.toThrow('原需求已保留');expect(f.requests).toHaveLength(2)
})
