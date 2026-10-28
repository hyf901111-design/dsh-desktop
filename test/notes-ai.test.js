import { expect, it, vi } from 'vitest'
import { generateNoteSuggestion } from '../packages/dsh-research-task-runtime/notes-ai.js'
import {inject} from '../packages/dsh-research-task-runtime/index.js'
function context(text, kind = 'stop') {
  let options, childOptions
  const parent={id:'session',session:{events:[]}},child={id:'note-component-child',session:{id:'note-component-child',events:[]}}
  return { agents:{get:id=>id===parent.id?parent:undefined},tools:{schemas:()=>[]},on:()=>()=>{},subagents:{start:vi.fn(async(_provider,value)=>{childOptions=value;const result=JSON.parse(text);return{id:child.id,localAgent:child,result:Promise.resolve({stopReason:kind==='stop'?'completed':kind,output:[{type:'text',text:JSON.stringify(result.artifact??result)}]}),dispose:async()=>{}}})},apiProxy: { sessions: { models: async () => ({ result: { ok: true, value: { current: { provider: 'session-provider', model: 'session-model' }, routable: true } } }) } }, llm: { stream: async function* (value) { options = value; let output=text;try{const parsed=JSON.parse(text);if(value.purpose==='workspace-note'&&['component','capabilities'].includes(parsed.kind))output=JSON.stringify({...parsed,wireToken:/wireToken=([a-f0-9-]+)/.exec(value.system)[1]})}catch{}yield { type: 'text-delta', text:output }; yield { type: 'finish', reason: { kind } } } }, options: () => options,childOptions:()=>childOptions }
}
const input = { sessionId: 'session', title: '笔记', markdown: '正文资料', selection: '选中文字', prompt: '改写为简洁文字', mode: 'write' }
it('passes the selected component data to the model and excludes the note when opted out',async()=>{
 const ctx=context('{"kind":"conversation","markdown":"说明"}')
 const selected={scope:'selection',components:[{blockId:'chart',title:'收入表',type:'research',content:'甲收入123'}]}
 await generateNoteSuggestion(ctx,{...input,selection:'',markdown:'',context:selected})
 expect(JSON.parse(ctx.options().messages[0].content[0].text).references).toEqual(selected)
 await generateNoteSuggestion(ctx,{...input,context:{scope:'none',components:[]}})
 const sent=JSON.parse(ctx.options().messages[0].content[0].text);expect(sent.document).toBe('');expect(sent.selection).toBe('');expect(sent.title).toBe('')
})
it('permits updates only to an explicitly selected research component',async()=>{
 const ctx=context('{"kind":"component","targetBlockId":"chart","artifact":{"version":1,"type":"table","title":"调整后收入","columns":["项目","收入"],"rows":[["甲",456]]}}')
 const selected={scope:'selection',components:[{blockId:'chart',title:'收入表',type:'research',content:'甲收入123'}]}
 expect(await generateNoteSuggestion(ctx,{...input,context:selected})).toMatchObject({kind:'component',targetBlockId:'chart',node:{containerSpec:{title:'调整后收入'}}})
 await expect(generateNoteSuggestion(ctx,{...input,context:{scope:'note',components:selected.components}})).rejects.toThrow('引用')
})
it('reports actual model reasoning and writing progress while returning the document only in the final result',async()=>{
 const ctx=context(''),seen=[]
 ctx.llm.stream=async function*(){yield{type:'reasoning-delta',index:0,text:'先保留原意，再整理段落。'};yield{type:'text-delta',index:1,text:'{"kind":"text","markdown":"新正文"}'};yield{type:'finish',reason:{kind:'stop'}}}
 expect(await generateNoteSuggestion(ctx,input,undefined,value=>seen.push(value))).toEqual({kind:'text',markdown:'新正文'})
 expect(seen.some(row=>row.reasoning.includes('保留原意'))).toBe(true);expect(seen.at(-1)).toMatchObject({stage:'validating',reasoning:'先保留原意，再整理段落。'})
 expect(seen.every(row=>!('markdown' in row))).toBe(true)
})
it('declares the attachment dependency used by the real notes HTTP handler',()=>{
 expect(inject).toContain('attachments')
})
it('uses the selected session model and returns a preview without writing the document', async () => {
  const ctx = context('{"kind":"text","markdown":"简洁的新内容"}')
  expect(await generateNoteSuggestion(ctx, input)).toEqual({ kind: 'text', markdown: '简洁的新内容' })
  expect(ctx.options()).toMatchObject({ provider: 'session-provider', model: 'session-model' })
  expect(ctx.options().tools).toBeUndefined()
  expect(ctx.subagents.start).not.toHaveBeenCalled()
  expect(ctx.options().messages[0].content[0].text).toContain('选中文字')
})
it('rejects a truncated answer instead of offering it for acceptance', async () => {
  await expect(generateNoteSuggestion(context('{"kind":"text","markdown":"不完整"}', 'max-tokens'), input)).rejects.toThrow()
})
it('validates a created component before returning it', async () => {
  const ctx = context('{"kind":"component","artifact":{"version":1,"type":"table","title":"比较","columns":["项目","结果"],"rows":[["A","待验证"]]}}')
  expect(await generateNoteSuggestion(ctx, { ...input, mode: 'component' })).toMatchObject({ kind: 'component', node: { kind: 'generated-container', containerSpec: { type: 'table', title: '比较' } } })
  await expect(generateNoteSuggestion(context('{"kind":"component","artifact":{"type":"unknown"}}'), input)).rejects.toThrow()
})
it('uses the accepted native chart contract in its prompt and component output', async () => {
  const ctx = context('{"kind":"component","artifact":{"version":1,"type":"chart","title":"趋势","variant":"line","labels":["一月","二月"],"series":[{"name":"收入","values":[10,20]}]}}')
  expect(await generateNoteSuggestion(ctx, { ...input, mode: 'component' })).toMatchObject({ kind: 'component', node: { containerSpec: { variant: 'line' } } })
  expect(ctx.childOptions().prompt.at(-1).text).toContain('labels/series')
  expect(ctx.childOptions().prompt.at(-1).text).not.toContain('chartType')
  expect(ctx.options()).toBeUndefined()
})
it('honors cancellation and refuses missing models', async () => {
  const cancelled = new AbortController(); cancelled.abort()
  await expect(generateNoteSuggestion(context('hello'), input, cancelled.signal)).rejects.toThrow()
  const ctx = context('hello'); ctx.apiProxy.sessions.models = async () => ({ result: { ok: true, value: { current: null, routable: false } } })
  await expect(generateNoteSuggestion(ctx, input)).rejects.toThrow()
})
it('starts a component child with only the authorized note evidence and records its result in the same conversation',async()=>{
 const {Session}=await import('@deepseek-ai/dsh-session'),{noteConversationRows}=await import('../packages/dsh-research-task-runtime/notes-session.js')
 const session=Session.create('session');session.append('user/message',{id:'u',role:'user',source:{kind:'user'},content:[{type:'text',text:'未引用的历史机密'}]},{surfaceOp:'append'})
 const ctx=context('{"kind":"component","artifact":{"version":1,"type":"table","title":"选中资料","columns":["收入"],"rows":[[123]]}}'),seen=[]
 ctx.sessions={get:()=>session};ctx.sessionTitle={rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}}
 await generateNoteSuggestion(ctx,{...input,mode:'component',requestId:'component-child',markdown:'未引用的整篇机密',context:{scope:'selection',components:[{blockId:'selected',type:'research',title:'选中资料',content:'收入123'}]}},undefined,state=>seen.push(state))
 const sent=ctx.childOptions().prompt.at(-1).text
 expect(sent).toContain('收入123');expect(sent).not.toMatch(/未引用的历史机密|未引用的整篇机密/)
 expect(ctx.options()).toBeUndefined();expect(ctx.subagents.start).toHaveBeenCalledOnce()
 expect(noteConversationRows(session)[0]).toMatchObject({requestId:'component-child',phase:'ready',result:{kind:'component'}})
 expect(seen.at(-1)).toMatchObject({seq:seen[0].seq,startedAt:seen[0].startedAt,componentTask:{childSessionId:'note-component-child'}})
})

it('keeps a card-local component child out of parent session events while ordinary writing remains recorded',async()=>{
 const {Session}=await import('@deepseek-ai/dsh-session'),{noteConversationRows}=await import('../packages/dsh-research-task-runtime/notes-session.js')
 const session=Session.create('session'),before=structuredClone(session.events),ctx=context('{"kind":"component","artifact":{"version":1,"type":"markdown","title":"卡片","content":"独立组件内容"}}'),seen=[]
 ctx.sessions={get:()=>session};ctx.sessionTitle={rename:vi.fn((s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}})}
 await generateNoteSuggestion(ctx,{...input,requestId:'silent',mode:'component',entryPoint:'component',context:{scope:'none',components:[]}},undefined,state=>seen.push(state))
 expect(ctx.subagents.start).toHaveBeenCalledOnce();expect(seen.some(state=>state.componentTask?.childSessionId)).toBe(true)
 expect(session.events).toEqual(before);expect(noteConversationRows(session)).toEqual([]);expect(ctx.sessionTitle.rename).not.toHaveBeenCalled();expect(seen.every(state=>state.seq===undefined)).toBe(true)
 ctx.llm.stream=async function*(){yield{type:'text-delta',text:'{"kind":"text","markdown":"普通正文"}'};yield{type:'finish',reason:{kind:'stop'}}}
 await generateNoteSuggestion(ctx,{...input,requestId:'ordinary',entryPoint:'component'})
 expect(noteConversationRows(session)).toMatchObject([{requestId:'ordinary',phase:'ready',result:{markdown:'普通正文'}}])
})
for(const outcome of ['failed','stopped'])it('does not append a parent conversation row when a silent child is '+outcome,async()=>{
 const {Session}=await import('@deepseek-ai/dsh-session'),session=Session.create('session'),ctx=context(''),controller=new AbortController(),before=structuredClone(session.events)
 ctx.sessions={get:()=>session};ctx.sessionTitle={rename:vi.fn((s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}})}
 ctx.subagents.start.mockImplementation(async(_provider,request)=>({id:'silent-child',localAgent:{id:'silent-child',session:{id:'silent-child',events:[]}},result:outcome==='failed'?Promise.resolve({stopReason:'refusal',output:[]}):new Promise(resolve=>request.signal.addEventListener('abort',()=>resolve({stopReason:'aborted',output:[]}),{once:true})),dispose:async()=>{}}))
 const pending=generateNoteSuggestion(ctx,{...input,requestId:'silent-'+outcome,mode:'component',entryPoint:'component',context:{scope:'none',components:[]}},controller.signal)
 const rejected=expect(pending).rejects.toThrow();await vi.waitFor(()=>expect(ctx.subagents.start).toHaveBeenCalledOnce());if(outcome==='stopped')controller.abort();await rejected
 expect(session.events).toEqual(before);expect(ctx.sessionTitle.rename).not.toHaveBeenCalled()
})

it('passes uploaded native image attachments to the actual component child',async()=>{
 const ctx=context('{"kind":"component","artifact":{"version":1,"type":"markdown","title":"图示","content":"图片中的说明"}}')
 ctx.attachments={imageLimits:{maxImagesPerMessage:1,maxImageBytes:16,maxMessageImageBytes:16,mediaTypes:['image/png']},saveImages:async()=>[{attachmentId:'owned-image',mediaType:'image/png',bytes:3,width:1,height:1}]}
 await generateNoteSuggestion(ctx,{...input,mode:'component',images:[{type:'image',mediaType:'image/png',data:'AQID'}]})
 expect(ctx.childOptions().prompt[0]).toMatchObject({type:'image',attachment:{attachmentId:'owned-image'}})
 expect(JSON.stringify(ctx.childOptions().prompt)).not.toContain('AQID')
})
it('reserves the research generation budget only for component mode',async()=>{
 const timeout=vi.spyOn(AbortSignal,'timeout')
 try{
  await generateNoteSuggestion(context('{"kind":"component","artifact":{"version":1,"type":"table","title":"结果","columns":["项目"],"rows":[["A"]]}}'),{...input,mode:'component'})
  expect(timeout.mock.calls[0][0]).toBe(240000)
  timeout.mockClear()
  await generateNoteSuggestion(context('{"kind":"text","markdown":"正文"}'),input)
  expect(timeout.mock.calls[0][0]).toBe(120000)
 }finally{timeout.mockRestore()}
})
it('uses the native attachment store for uploaded images and refuses malformed or oversized images',async()=>{
 const ctx=context('{"kind":"text","markdown":"图片说明"}');let saved
 ctx.attachments={imageLimits:{maxImagesPerMessage:1,maxImageBytes:16,maxMessageImageBytes:16,mediaTypes:['image/png']},saveImages:async inputs=>{saved=inputs;return[{attachmentId:'owned-image',mediaType:'image/png',bytes:3,width:1,height:1}]}}
 await generateNoteSuggestion(ctx,{...input,images:[{type:'image',mediaType:'image/png',data:'AQID'}]});expect(saved[0].data).toEqual(Buffer.from([1,2,3]));expect(ctx.options().messages[0].content[0]).toMatchObject({type:'image',attachment:{attachmentId:'owned-image'}})
 await expect(generateNoteSuggestion(ctx,{...input,images:[{type:'image',mediaType:'image/png',data:'bad!'}]})).rejects.toThrow('格式')
 await expect(generateNoteSuggestion(ctx,{...input,images:[{type:'image',mediaType:'image/png',data:Buffer.alloc(17).toString('base64')}]})).rejects.toThrow('大小')
})

it('uses the shared native conversation as context for note writing and durably records the result',async()=>{
 const {Session}=await import('@deepseek-ai/dsh-session'),{noteConversationRows}=await import('../packages/dsh-research-task-runtime/notes-session.js')
 const session=Session.create('session');session.append('user/message',{id:'u',role:'user',source:{kind:'user'},content:[{type:'text',text:'讨论里的验收目标'}]},{surfaceOp:'append'})
 const ctx=context('{"kind":"text","markdown":"基于讨论的新正文"}');ctx.sessions={get:()=>session};ctx.sessionTitle={rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}}
 await generateNoteSuggestion(ctx,{...input,requestId:'shared-request'});expect(ctx.options().messages[0].content[0].text).toContain('讨论里的验收目标');expect(noteConversationRows(session)[0]).toMatchObject({phase:'ready',prompt:input.prompt,result:{markdown:'基于讨论的新正文'}})
})
it('persists only the explicitly referenced labels for the exact request, including on session replay',async()=>{
 const {Session}=await import('@deepseek-ai/dsh-session'),{noteConversationRows}=await import('../packages/dsh-research-task-runtime/notes-session.js')
 const session=Session.create('session'),ctx=context('{"kind":"conversation","markdown":"已总结"}')
 ctx.sessions={get:()=>session};ctx.sessionTitle={rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}}
 const refs={scope:'selection',components:[{blockId:'chart',type:'research',title:'收入图',content:'不能复制到标签的正文'},{blockId:'pdf',type:'attachment',title:'资料.pdf',content:'仅文件元信息',file:{nodeId:'note-file-secret',authorizationId:'secret-grant'}}]}
 await generateNoteSuggestion(ctx,{...input,requestId:'labels',context:refs,selection:'仅总结这段文字'})
 refs.components[0].title='发送后改名'
 const replay=Session.fromRestore(session.id,structuredClone(session.events),structuredClone(session.header))
 const row=noteConversationRows(replay).find(row=>row.requestId==='labels')
 expect(row.references).toEqual([{blockId:'chart',type:'research',title:'收入图'},{blockId:'pdf',type:'attachment',title:'资料.pdf'},{blockId:'text-selection',type:'text',title:'仅总结这段文字'}])
 expect(JSON.stringify(row.references)).not.toMatch(/secret|正文/)
 await generateNoteSuggestion(ctx,{...input,requestId:'automatic',context:{scope:'note',components:refs.components}})
 await generateNoteSuggestion(ctx,{...input,requestId:'disabled',context:{scope:'none',components:refs.components}})
 expect(noteConversationRows(session).find(row=>row.requestId==='automatic').references).toEqual([])
 expect(noteConversationRows(session).find(row=>row.requestId==='disabled').references).toEqual([])
})

it('routes a clarification as a durable conversation reply instead of a document suggestion',async()=>{
 const {Session}=await import('@deepseek-ai/dsh-session'),{noteConversationRows,sharedNoteConversationContext}=await import('../packages/dsh-research-task-runtime/notes-session.js')
 const session=Session.create('session'),ctx=context('{"kind":"conversation","markdown":"你想写什么主题？大约多少字？"}')
 ctx.sessions={get:()=>session};ctx.sessionTitle={rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}}
 expect(await generateNoteSuggestion(ctx,{...input,requestId:'clarification',title:'',markdown:'',selection:'',prompt:'写一篇文章'})).toEqual({kind:'conversation',markdown:'你想写什么主题？大约多少字？'})
 expect(ctx.options().system).toContain('澄清');expect(ctx.options().system).toContain('"kind":"conversation"')
 expect(noteConversationRows(session)[0]).toMatchObject({phase:'replied',result:{kind:'conversation'}})
 expect(sharedNoteConversationContext(session)[0]).toMatchObject({reply:'你想写什么主题？大约多少字？'})
 await expect(generateNoteSuggestion(context('{"kind":"conversation","markdown":""}'),input)).rejects.toThrow('格式')
})
it('keeps inline writing bound to the provided insertion anchor and refuses malformed or different-document positions',async()=>{
 const ctx=context('{"kind":"text","markdown":"原位新增段落"}'),insertionAnchor={documentId:'opened-doc',blockId:'blank-paragraph',position:{type:{client:1,clock:2},assoc:0}}
 const request={...input,entryPoint:'inline',insertionAnchor,clientContext:{documentId:'opened-doc'}}
 expect(await generateNoteSuggestion(ctx,request)).toEqual({kind:'text',markdown:'原位新增段落'})
 const sent=JSON.parse(ctx.options().messages[0].content[0].text);expect(sent.insertionAnchor).toEqual(insertionAnchor);expect(sent.instruction).toBe('改写为简洁文字')
 await expect(generateNoteSuggestion(ctx,{...request,clientContext:{documentId:'other-doc'}})).rejects.toThrow('插入位置')
 await expect(generateNoteSuggestion(ctx,{...request,insertionAnchor:{...insertionAnchor,position:null}})).rejects.toThrow('插入位置')
})
