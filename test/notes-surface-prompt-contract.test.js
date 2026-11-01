import {expect,it,vi} from 'vitest'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {createClientCapabilityRegistry,createCapabilityExecutor} from '../packages/dsh-research-task-runtime/client-capabilities.js'

const clientContext={owner:'owner',sessionId:'session',documentId:'document',mode:'notes',editable:true,selectedBlockIds:['component']}
const input={sessionId:'session',requestId:'request',title:'用户标题',markdown:'用户原文：在当前笔记末尾创建并保存。',selection:'',mode:'write',context:{scope:'note',components:[]},clientContext}
const registry=()=>createClientCapabilityRegistry({readNoteBlocks:vi.fn(),applyNoteBlocks:vi.fn(),undoNoteBlocks:vi.fn(),createComponent:vi.fn(),inspectNoteComponent:vi.fn(),applyNoteComponent:vi.fn()})
async function request(entryPoint,prompt,reply={kind:'text',markdown:'完整结果'}){
 const requests=[]
 const ctx={apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'provider',model:'model'},routable:true}}})}},llm:{stream:async function*(options){requests.push(options);yield{type:'text-delta',text:JSON.stringify(reply)};yield{type:'finish',reason:{kind:'stop'}}}}}
 const catalog=registry().catalog(clientContext)
 const result=await generateNoteSuggestion(ctx,{...input,entryPoint,prompt,clientCapabilities:catalog,...entryPoint==='inline'?{insertionAnchor:{documentId:'document',blockId:'anchor',position:{}}}:{}})
 return{result,options:requests[0],requests,catalog}
}

it.each(['写一段文字','在这里插入Python均值函数与说明','在这里画图；缺失真实数据请注明'])('Space receives only its anchored delivery contract: %s',async prompt=>{
 const {result,options,requests,catalog}=await request('inline',prompt)
 expect(result).toEqual({kind:'text',markdown:'完整结果'})
 expect(requests).toHaveLength(1)
 expect(options.system).toContain('本次入口：正文空格')
 expect(options.system).toContain('insertionAnchor')
 expect(options.system).toContain('不要在需求框回复或追问主题')
 expect(options.system).not.toContain('右侧普通总结、解释、核对、讨论均默认conversation')
 expect(options.system).not.toContain('缺失时通过 conversation 说明缺失并询问')
 const sent=JSON.parse(options.messages[0].content[0].text)
 expect(sent.instruction).toBe(prompt)
 expect(sent.document).toBe(input.markdown)
 expect(sent.insertionAnchor.blockId).toBe('anchor')
 expect(sent.clientCapabilities).toEqual(catalog)
 expect(sent.clientCapabilities.find(row=>row.id==='notes.components.create').description).not.toContain('末尾创建')
})

it('sidebar QA keeps conversation-only instructions without Space placement or forced writing',async()=>{
 const {result,options}=await request('composer','解释这个函数为什么对空列表返回None，不修改笔记。',{kind:'conversation',markdown:'空列表会返回None。'})
 expect(result).toEqual({kind:'conversation',markdown:'空列表会返回None。'})
 expect(options.system).toContain('本次入口：右侧对话')
 expect(options.system).toContain('右侧普通总结、解释、核对、讨论均默认conversation')
 expect(options.system).not.toContain('本次入口：正文空格')
 expect(options.system).not.toContain('不要在需求框回复或追问主题')
})

it('explicit sidebar writing requests retain a pending preview contract and unchanged user demand',async()=>{
 const prompt='请先解释这段代码，再在笔记末尾追加一个代码示例，先给我预览。'
 const {result,options,catalog}=await request('composer',prompt)
 expect(result.kind).toBe('text')
 expect(options.system).toContain('pendingPreview')
 expect(options.system).toContain('没有写入或保存')
 expect(options.system).toContain('必须由用户确认后才写入')
 expect(JSON.parse(options.messages[0].content[0].text).instruction).toBe(prompt)
 for(const id of ['notes.blocks.apply','notes.blocks.undo','notes.components.create','notes.components.apply']){
  const description=catalog.find(row=>row.id===id).description
  expect(description).not.toContain('直接应用并保存')
  expect(description).not.toContain('批次并保存')
  expect(description).toContain('回执')
 }
})

it('neutral descriptions do not change external host direct effects, scope validation or idempotency',async()=>{
 const apply=vi.fn(async()=>({status:'succeeded',effect:{kind:'native-blocks',state:'saved',actionId:'action',changedBlockIds:['new'],revision:'next'},message:'已保存'}))
 const host=createClientCapabilityRegistry({applyNoteBlocks:apply})
 const executor=createCapabilityExecutor(host,()=>clientContext)
 const call={requestId:'external',capability:'notes.blocks.apply',arguments:{revision:'revision',operations:[{op:'insert',anchor:{blockId:'anchor',placement:'after'},blocks:[{type:'codeBlock',content:'return None'}]}]}}
 expect(await executor.execute(call,clientContext)).toMatchObject({status:'succeeded',effect:{state:'saved'}})
 expect(await executor.execute(call,clientContext)).toMatchObject({status:'succeeded',effect:{state:'saved'}})
 expect(apply).toHaveBeenCalledTimes(1)
 expect(await executor.execute({...call,arguments:{...call.arguments,revision:'changed'}},clientContext)).toMatchObject({status:'failed'})
 expect(host.catalog(clientContext).find(row=>row.id===call.capability).description).not.toContain('仅准备待确认事务')
 expect(host.catalog({...clientContext,editable:false}).find(row=>row.id===call.capability).available).toBe(false)
})
