import {expect,it,vi} from 'vitest'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'
import {createClientCapabilityRegistry,createCapabilityExecutor} from '../packages/dsh-research-task-runtime/client-capabilities.js'

const clientContext={owner:'owner',sessionId:'session',documentId:'document',mode:'notes',editable:true,selectedBlockIds:['component']}
const input={sessionId:'session',requestId:'request',title:'用户标题',markdown:'用户原文：在当前笔记末尾创建并保存。',selection:'',mode:'write',context:{scope:'note',components:[]},clientContext}
const registry=()=>createClientCapabilityRegistry({readNoteBlocks:vi.fn(),applyNoteBlocks:vi.fn(),undoNoteBlocks:vi.fn(),createComponent:vi.fn(),inspectNoteComponent:vi.fn(),applyNoteComponent:vi.fn()})
async function request(entryPoint,prompt,reply={kind:'text',markdown:'完整结果'},overrides={}){
 const requests=[]
 const ctx={apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'provider',model:'model'},routable:true}}})}},llm:{stream:async function*(options){requests.push(options);const value=typeof reply==='function'?reply(options):reply;yield{type:'text-delta',text:typeof value==='string'?value:JSON.stringify(value)};yield{type:'finish',reason:{kind:'stop'}}}}}
 const catalog=registry().catalog(clientContext)
 const result=await generateNoteSuggestion(ctx,{...input,...overrides,entryPoint,prompt,clientCapabilities:catalog,...entryPoint==='inline'?{insertionAnchor:{documentId:'document',blockId:'anchor',position:{}}}:{}})
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

it.each(['inline','composer'])('uses current native-table facts ahead of intact stale history in one real %s request',async entryPoint=>{
 const {Session}=await import('@deepseek-ai/dsh-session')
 const session=Session.create('session'),history='此前创建了8×8表格，首行“项目”，右下角“末格”。'
 session.append('user/message',{id:'old-table-request',role:'user',source:{kind:'user'},content:[{type:'text',text:history}]},{surfaceOp:'append'})
 const rows=Array.from({length:9},(_,i)=>Array.from({length:11},(_,j)=>i===1&&j===0?'项目':i===8&&j===7?'末格':''))
 // Markdown's synthetic empty header does not belong to the native data rows.
 const line=cells=>'| '+cells.join(' | ')+' |'
 const document=[line(Array(11).fill('')),line(Array(11).fill('---')),...rows.map(line)].join('\n'),selection='项目'
 const block={id:'table',type:'table',content:{type:'tableContent',headerRows:0,rows:rows.map(cells=>({cells}))}}
 const clientReceipts=[{requestId:'current-read',capability:'notes.blocks.read',status:'succeeded',message:'已读取本轮表格',data:{revision:'current',blocks:[{block}]}}]
 const read=vi.fn(),catalog=createClientCapabilityRegistry({readNoteBlocks:read}).catalog(clientContext),requests=[]
 const reply=entryPoint==='inline'?{kind:'text',markdown:'本轮表格有九个数据行和十一列。'}:{kind:'conversation',markdown:'当前表格有九个数据行和十一列。'}
 const ctx={sessions:{get:()=>session},sessionTitle:{rename:(s,title)=>{s.append('session/title',{title,source:{kind:'user'}});return{title}}},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'provider',model:'model'},routable:true}}})}},llm:{stream:async function*(options){requests.push(options);yield{type:'text-delta',text:JSON.stringify(reply)};yield{type:'finish',reason:{kind:'stop'}}}}}
 const result=await generateNoteSuggestion(ctx,{...input,entryPoint,markdown:document,selection,prompt:entryPoint==='inline'?'在此处总结当前表格。':'核对当前表格，只回答，不改笔记。',clientCapabilities:catalog,clientReceipts,...entryPoint==='inline'?{insertionAnchor:{documentId:'document',blockId:'anchor',position:{}}}:{}})
 expect(result.kind).toBe(reply.kind)
 expect(requests).toHaveLength(1)
 const sent=JSON.parse(requests[0].messages[0].content[0].text)
 expect(sent.document).toBe(document);expect(sent.selection).toBe(selection);expect(sent.clientReceipts).toEqual(clientReceipts)
 expect(sent.conversation.find(row=>row.role==='user').text).toBe(history)
 expect(requests[0].system.split('本轮事实优先').length-1).toBe(1)
 expect(requests[0].system).toContain('优先于conversation中的旧尺寸、数值和单元格位置')
 expect(requests[0].system).toContain('Markdown可能自动补空表头')
 expect(requests[0].system).toContain('可用notes.blocks.read核对真实结构')
 expect(requests[0].system).toContain('资料已足够时直接处理，不为重复确认额外读取')
 expect(read).not.toHaveBeenCalled()
})


it.each(['inline','composer'])('keeps rewrite defaults conditional on the current authorized %s style request',async entryPoint=>{
 const prompt='把选中段落的口语风格改为严谨、专业的研究笔记书面语，并按需要改成标题与列表。'
 const {options,result,requests}=await request(entryPoint,prompt,{kind:'text',markdown:'## 经营观察\n- 收入增长仍需结合现金转化核对。'},{selection:'这公司涨得真猛，估值肯定没问题。',context:{scope:'selection',components:[]}})
 expect(requests).toHaveLength(1);expect(result.kind).toBe('text')
 expect(JSON.parse(options.messages[0].content[0].text).instruction).toBe(prompt)
 expect(options.system).toContain('默认保留原有文字风格与结构')
 expect(options.system).toContain('当前instruction明确要求改变风格、结构或格式时，按该要求生成')
 expect(options.system).toContain('仍只处理已授权选区，不扩大修改范围，不补造事实或引用')
 expect(options.system).not.toContain('保留原有文字风格，不额外添加标题、引用或段落缩进')
 expect(options.system).toContain('scope 为 selection 时只针对这些选区或组件')
})
it('retains restrained default rewriting and the original user demand without broadening scope',async()=>{
 const prompt='润色选中段落，让表达清楚一些。'
 const {options,requests}=await request('composer',prompt,{kind:'text',markdown:'收入增长仍需结合现金转化核对。'},{selection:'收入涨了但现金还要看看。',context:{scope:'selection',components:[]}})
 expect(requests).toHaveLength(1)
 expect(options.system).toContain('不添加用户未要求的标题、引用或段落缩进')
 expect(JSON.parse(options.messages[0].content[0].text).selection).toBe('收入涨了但现金还要看看。')
 expect(JSON.parse(options.messages[0].content[0].text).instruction).toBe(prompt)
})


it('limits explicit sidebar QA to currently available read capabilities and omits writing contracts',async()=>{
 const {options,result}=await request('composer','只解释这段代码，不修改笔记。',{kind:'conversation',markdown:'空列表返回 None。'})
 const sent=JSON.parse(options.messages[0].content[0].text)
 expect(result.kind).toBe('conversation')
 expect(sent.clientCapabilities.map(capability=>capability.id)).toEqual(['notes.blocks.read','notes.components.inspect','canvas.inspect'])
 expect(options.system).not.toContain('创建研究组件时格式')
 expect(options.system).not.toContain('notes.components.create')
 expect(options.system).not.toContain('notes.blocks.apply')
 expect(options.system).not.toContain('正文与真实组件混合需求')
 expect(options.system).toContain('不生成正文候选、组件或待确认事务')
})
it.each(['component','write-capability'])('does not forward a valid %s envelope for an explicitly read-only question',async mode=>{
 const {requests,result}=await request('composer','只解释这张图表，不修改笔记，不生成新内容。',options=>{
  if(options.purpose==='workspace-note-format-recovery')return {kind:'conversation',markdown:'甲和乙分别为1和2，仅用于演示。'}
  const wireToken=/wireToken=([a-f0-9-]+)/u.exec(options.system)[1]
  return mode==='component'?{kind:'component',wireToken,artifact:{version:1,type:'chart',variant:'line',title:'示例',labels:['甲','乙'],series:[{name:'演示',values:[1,2]}]}}:{kind:'capabilities',wireToken,calls:[{requestId:'unexpected',capability:'notes.components.create',arguments:{prompt:'创建示例图表'}}]}
 })
 expect(requests).toHaveLength(2)
 expect(requests[1].purpose).toBe('workspace-note-format-recovery')
 expect(result).toEqual({kind:'conversation',markdown:'甲和乙分别为1和2，仅用于演示。'})
 expect(requests[1].system).not.toContain('notes.components.create')
 expect(requests[1].system).toContain('不请求任何能力')
})
it('does not surface an unsupported write claim or internal envelope after a readonly recovery',async()=>{
 const {requests,result}=await request('composer','只解释内容，不修改笔记。',()=>({kind:'conversation',markdown:'已将以下内容写入笔记。'}))
 expect(requests).toHaveLength(2)
 expect(result).toEqual({kind:'conversation',markdown:'本轮尚未形成可用答复，笔记内容未修改。'})
})

it('retains a useful plain readonly answer from the single controlled recovery',async()=>{
 const {requests,result}=await request('composer','解释这张图，只回答，不修改笔记。',options=>options.purpose==='workspace-note-format-recovery'?'甲和乙分别为1和2。':{kind:'component',wireToken:/wireToken=([a-f0-9-]+)/u.exec(options.system)[1],artifact:{version:1,type:'chart',variant:'line',title:'示例',labels:['甲','乙'],series:[{name:'演示',values:[1,2]}]}})
 expect(requests).toHaveLength(2);expect(result).toEqual({kind:'conversation',markdown:'甲和乙分别为1和2。'})
})
