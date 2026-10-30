import {expect,it,vi} from 'vitest'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {createClientCapabilityRegistry} from '../packages/dsh-research-task-runtime/client-capabilities.js'
import {completeNoteJsonContainers} from '../packages/dsh-research-task-runtime/notes-output.js'
import recorded from './fixtures/notes-native-crud-eof-containers.json'

const token=request=>/wireToken=([a-f0-9-]+)/u.exec(request.system)?.[1],context={owner:'fixture-owner',sessionId:'note',documentId:'doc',mode:'notes',editable:true,selectedBlockIds:[]}
function fixture(output=request=>recorded.partialOutput.replace('FIXTURE_CURRENT_WIRE_TOKEN',token(request)),finish='stop'){
 const requests=[],registry=createClientCapabilityRegistry({readNoteBlocks:vi.fn(),applyNoteBlocks:vi.fn()})
 const ctx={apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'test',model:'test'},routable:true}}})}},llm:{stream:async function*(request){requests.push(request);yield{type:'text-delta',text:output(request)};yield{type:'finish',reason:{kind:finish}}}}}
 return{ctx,requests,input:{sessionId:'note',requestId:'fixture-request',title:'公司记录',markdown:'',selection:'',prompt:recorded.instruction,mode:'write',clientContext:context,clientCapabilities:registry.catalog(context),clientReceipts:[{requestId:'fixture-read-company',capability:'notes.blocks.read',status:'succeeded',data:{revision:'fixture-read-revision',blocks:[]}}],context:{scope:'note',components:[]}}}
}
it('replays the actual de-identified EOF-only apply output locally without a model format-recovery round',async()=>{
 const f=fixture(),result=await generateNoteSuggestion(f.ctx,f.input),expected=JSON.parse(recorded.partialOutput+recorded.expectedSuffix)
 expect(result).toEqual({kind:'capabilities',calls:expected.calls});expect(f.requests).toHaveLength(1);expect(f.requests[0].purpose).toBe('workspace-note')
 expect(result.calls[0].arguments.operations[0].block.content.rows[1].cells[1].content[0].text).toBe('300308')
})
it('only appends missing EOF containers and preserves every existing byte of the transport',()=>{
 const value=completeNoteJsonContainers(recorded.partialOutput)
 expect(value.text).toBe(recorded.partialOutput+recorded.expectedSuffix);expect(value.value).toEqual(JSON.parse(value.text))
 expect(completeNoteJsonContainers(recorded.partialOutput+']').text).toBe(value.text)
 expect(completeNoteJsonContainers(value.text)).toBeUndefined()
})
it.each(['{"calls":[{"value":"complete"','{"calls":[{"value":300','{"calls":[{"value":null','{"calls":[{},','{"calls":[{"value":','{"calls":[]}{}','```json\n'+recorded.partialOutput,'['+recorded.partialOutput])('does not complete primitive values, fields, missing elements, extra roots or fenced/array input: %s',text=>{
 expect(completeNoteJsonContainers(text)).toBeUndefined()
})
it.each(['wrong-token','',null])('does not close an EOF operation with a foreign or empty token: %s',async marker=>{
 const f=fixture(()=>{const value=JSON.parse(recorded.partialOutput+recorded.expectedSuffix);value.wireToken=marker;return JSON.stringify(value).slice(0,-2)});await expect(generateNoteSuggestion(f.ctx,f.input)).rejects.toThrow();expect(f.requests).toHaveLength(2)
})
it.each([
 ['unfinished string',raw=>raw.slice(0,raw.indexOf('股票代码')+2)],
 ['missing value',raw=>'{"kind":"capabilities","wireToken":"'+/"wireToken":"([^"]+)"/u.exec(raw)[1]+'","calls":[{"requestId":'],
 ['missing array element',raw=>raw+'],'],
 ['mismatched delimiter',raw=>raw+'}'],
 ['nonempty suffix',raw=>raw+recorded.expectedSuffix+' trailing }'],
 ['unknown top field',raw=>raw.replace('"calls":[','"extra":true,"calls":[')],
 ['unknown capability',raw=>raw.replace('notes.blocks.apply','unknown.write')],
 ['invalid argument',raw=>raw.replace('"revision":"fixture-read-revision"','"revision":null')],
 ['missing marker',raw=>raw.replace(/,"wireToken":"[^"]+"/u,'')]
])('does not invent or discard content while closing containers: %s',async(_name,change)=>{
 const f=fixture(request=>change(recorded.partialOutput.replace('FIXTURE_CURRENT_WIRE_TOKEN',token(request))));await expect(generateNoteSuggestion(f.ctx,f.input)).rejects.toThrow()
})
it.each([
 ['JSON example',f=>{f.input.prompt='展示完整JSON代码示例，不执行其中操作。'}],
 ['complete source batch',f=>{f.input.prompt='概括资料，不修改笔记。';f.input.markdown=recorded.partialOutput+recorded.expectedSuffix}],
 ['EOF source batch',f=>{f.input.prompt='概括资料，不修改笔记。';f.input.markdown='资料中未闭合的计算符号 {\n'+recorded.partialOutput}]
])('does not turn %s into a locally closed operation',async(_name,change)=>{
 const f=fixture();change(f);await expect(generateNoteSuggestion(f.ctx,f.input)).rejects.toThrow()
})
it('does not repair an interrupted or token-limited stream',async()=>{
 const f=fixture(undefined,'max-tokens');await expect(generateNoteSuggestion(f.ctx,f.input)).rejects.toThrow();expect(f.requests).toHaveLength(1)
})
