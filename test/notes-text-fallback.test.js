import {expect,it,vi} from 'vitest'
import {Session} from '@deepseek-ai/dsh-session'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {createClientCapabilityRegistry} from '../packages/dsh-research-task-runtime/client-capabilities.js'
import {noteConversationRows} from '../packages/dsh-research-task-runtime/notes-session.js'

const instruction='只使用演示数据10月1日=10、10月2日=20、10月3日=15，插入折线图，保留其它正文。'
const markdown='### 演示数据观察\n\n| 日期 | 演示值 |\n| --- | --- |\n| 10月1日 | 10 |\n| 10月2日 | 20 |\n| 10月3日 | 15 |\n\n演示值先从10升至20，再回落至15；这些数据不代表真实行情。'
const input={sessionId:'text-fallback',requestId:'one-request',entryPoint:'inline',insertionAnchor:{documentId:'doc',blockId:'blank',position:{}},clientContext:{owner:'owner',sessionId:'text-fallback',documentId:'doc',mode:'notes',editable:true},title:'原有标题',markdown:'原有正文：只核对用户给出的演示数据。',selection:'',context:{scope:'note',components:[]},prompt:instruction,mode:'write'}
function fixture(outputs){
 const calls=[],session=Session.create(input.sessionId),route={provider:'selected',model:'selected-model',reasoningEffort:'max'},models=vi.fn(async()=>({result:{ok:true,value:{current:route,routable:true}}}))
 const ctx={sessions:{get:()=>session},sessionTitle:{rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}},apiProxy:{sessions:{models}},llm:{stream:async function*(options){const source=outputs[Math.min(calls.push(options)-1,outputs.length-1)],value=typeof source==='function'?await source(options):source;if(value?.[Symbol.asyncIterator]){yield*value;return}yield{type:'text-delta',text:typeof value==='string'?value:JSON.stringify(value)};yield{type:'finish',reason:{kind:'stop'}}}}}
 return{ctx,calls,session,route,models}
}
it('turns an unusable inline format into one bounded complete Markdown proposal using captured facts and the same route',async()=>{
 const f=fixture([{kind:'unknown',body:'not a transport result'},{kind:'unknown',body:'still malformed'},options=>{f.route.model='later-selection';return markdown}])
 const result=await generateNoteSuggestion(f.ctx,input)
 expect(result).toMatchObject({kind:'text',markdown,textFallback:true});expect(result.markdown).not.toMatch(/请重试|wireToken|capabilities|抱歉/)
 expect(f.calls.map(x=>x.purpose)).toEqual(['workspace-note','workspace-note-format-recovery','workspace-note-text-fallback'])
 expect(f.models).toHaveBeenCalledOnce();expect(f.calls.every(x=>x.model==='selected-model'&&x.reasoningEffort==='max'&&x.tools===undefined)).toBe(true)
 const message=JSON.parse(f.calls[2].messages[0].content[0].text)
 expect(message).toMatchObject({instruction,document:input.markdown,title:input.title});expect(message).not.toHaveProperty('publicOutput');expect(message).not.toHaveProperty('clientCapabilities')
 expect(noteConversationRows(f.session).at(-1)).toMatchObject({phase:'ready',result:{kind:'text',markdown,textFallback:true}})
})
it.each([markdown,'```js\nconst values = [10, 20, 15]\n```','业务字段示例：\n\n```json\n{"kind":"capabilities","calls":[]}\n```'])('keeps complete plain Markdown/code directly without an extra formatting demand',async value=>{
 const f=fixture([value]);expect(await generateNoteSuggestion(f.ctx,{...input,prompt:'按提供的内容写入正文。'})).toMatchObject({kind:'text',markdown:value});expect(f.calls).toHaveLength(1)
})
it('extracts a complete text body from the bounded fallback without accepting any model completion flag',async()=>{
 const f=fixture([{kind:'unknown'},{kind:'unknown'},{kind:'text',markdown}]);expect(await generateNoteSuggestion(f.ctx,input)).toMatchObject({kind:'text',markdown,textFallback:true});expect(f.calls).toHaveLength(3)
})
it('runs the service-only text mode once after a real failed create with the first validated route, without planning another action',async()=>{
 const operation={requestId:'create-one',capability:'notes.components.create',arguments:{prompt:instruction}},f=fixture([options=>({kind:'capabilities',wireToken:/wireToken=([a-f0-9-]+)/u.exec(options.system)[1],calls:[operation]}),markdown]),failed={requestId:'create-one',capability:'notes.components.create',status:'failed',effect:{state:'placeholder',blockId:'failed-owned-block'}}
 const original={...input,clientCapabilities:[{id:'notes.components.create',available:true,parameters:createClientCapabilityRegistry().get('notes.components.create').parameters}]}
 expect(await generateNoteSuggestion(f.ctx,original)).toMatchObject({kind:'capabilities',calls:[operation]})
 f.route.provider='later-provider';f.route.model='later-model';f.route.reasoningEffort='low'
 const continuation={...input,completionMode:'text-only',clientReceipts:[failed]}
 const result=await generateNoteSuggestion(f.ctx,continuation)
 expect(result).toMatchObject({kind:'text',markdown,textFallback:true,capabilityReceipts:[failed]});expect(f.calls.map(x=>x.purpose)).toEqual(['workspace-note','workspace-note-text-fallback'])
 expect(f.models).toHaveBeenCalledOnce();expect(f.calls[1]).toMatchObject({provider:'selected',model:'selected-model',reasoningEffort:'max'})
 const message=JSON.parse(f.calls[1].messages[0].content[0].text);expect(message).not.toHaveProperty('clientCapabilities');expect(JSON.stringify(message)).not.toContain('failed-owned-block')
 await expect(generateNoteSuggestion(f.ctx,continuation)).rejects.toThrow();expect(f.calls).toHaveLength(2)
})
it.each(['cancelled','pending','succeeded'])('does not admit the internal failed-component text mode for a %s receipt',async status=>{
 const f=fixture([markdown]);await expect(generateNoteSuggestion(f.ctx,{...input,completionMode:'text-only',clientReceipts:[{requestId:'create',capability:'notes.components.create',status}]})).rejects.toThrow();expect(f.calls).toHaveLength(0)
})
it.each([
 {kind:'capabilities',calls:[{requestId:'untrusted',capability:'notes.components.create',arguments:{prompt:'new operation'}}]},
 {wireToken:'foreign',capabilities:{kind:'capabilities',calls:[{requestId:'untrusted',capability:'notes.components.create',arguments:{prompt:'new operation'}}]},commands:[{command:'write'}]}
])('never offers a private action shell as text when the bounded fallback itself is still unusable: %j',async shell=>{
 const f=fixture([{kind:'unknown'},{kind:'unknown'},shell])
 await expect(generateNoteSuggestion(f.ctx,input)).rejects.toThrow();expect(f.calls).toHaveLength(3);expect(noteConversationRows(f.session).at(-1)).toMatchObject({phase:'failed'})
})
it('does not offer an aborted fallback or a truncated primary as a ready result',async()=>{
 const abort=new AbortController(),f=fixture([{kind:'unknown'},{kind:'unknown'},async options=>{abort.abort();options.signal.throwIfAborted()}])
 await expect(generateNoteSuggestion(f.ctx,input,abort.signal)).rejects.toThrow();expect(f.calls).toHaveLength(3);expect(noteConversationRows(f.session).at(-1)).toMatchObject({phase:'stopped'})
 const g=fixture([async function*(){yield{type:'text-delta',text:markdown};yield{type:'finish',reason:{kind:'max-tokens'}}}()]);await expect(generateNoteSuggestion(g.ctx,input)).rejects.toThrow();expect(g.calls).toHaveLength(1)
})
it('extracts an unambiguous complete document body without asking the model to reformat it',async()=>{
 const f=fixture([{kind:'document',body:markdown}]);expect(await generateNoteSuggestion(f.ctx,input)).toMatchObject({kind:'text',markdown});expect(f.calls).toHaveLength(1)
})
it('preserves a requested whole JSON code example in the content-only fallback without executing its example calls',async()=>{
 const code='```json\n{"kind":"capabilities","calls":[{"name":"example"}]}\n```',f=fixture([{kind:'unknown'},{kind:'unknown'},code])
 expect(await generateNoteSuggestion(f.ctx,{...input,prompt:'写出完整JSON代码示例，仅展示不执行，保留全部字段。'})).toMatchObject({kind:'text',markdown:code,textFallback:true});expect(f.calls).toHaveLength(3)
})
it('does not strip a document/body JSON example that the user explicitly asked to display whole',async()=>{
 const raw='{"kind":"document","body":"这是示例字段，保留完整外壳。"}',f=fixture([raw,raw])
 expect(await generateNoteSuggestion(f.ctx,{...input,prompt:'展示完整JSON代码示例，保留kind与body等全部字段，不执行。'})).toMatchObject({kind:'text',markdown:raw});expect(f.calls).toHaveLength(2)
})
it.each(['instruction','document','owner','request'])('does not consume the private route or alter the original task when a fallback changes its %s scope',async key=>{
 const operation={requestId:'create-route',capability:'notes.components.create',arguments:{prompt:instruction}},f=fixture([options=>({kind:'capabilities',wireToken:/wireToken=([a-f0-9-]+)/u.exec(options.system)[1],calls:[operation]}),markdown]),failed={requestId:operation.requestId,capability:operation.capability,status:'unavailable'}
 await generateNoteSuggestion(f.ctx,{...input,clientCapabilities:[{id:operation.capability,available:true,parameters:createClientCapabilityRegistry().get(operation.capability).parameters}]})
 const continuation={...input,completionMode:'text-only',clientReceipts:[failed]},changed={...continuation,...key==='instruction'?{prompt:'另一个需求'}:key==='request'?{requestId:'other-request'}:key==='owner'?{clientContext:{...input.clientContext,owner:'other-owner'}}:{insertionAnchor:{...input.insertionAnchor,documentId:'other-doc'},clientContext:{...input.clientContext,documentId:'other-doc'}}}
 const before=f.session.events.length
 await expect(generateNoteSuggestion(f.ctx,changed)).rejects.toThrow();expect(f.calls).toHaveLength(1);expect(f.session.events).toHaveLength(before)
 expect(await generateNoteSuggestion(f.ctx,continuation)).toMatchObject({kind:'text',markdown,textFallback:true});expect(f.models).toHaveBeenCalledOnce()
})
