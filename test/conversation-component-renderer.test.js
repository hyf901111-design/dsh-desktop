import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {conversationComponentReceiptManifests,conversationComponentReceiptAnchors,conversationComponentRenderFlow,patchConversationComponents,stripConversationComponents} from '../scripts/lib/conversation-components.mjs'
const manifest=(id='component-a',turnId='7')=>({version:1,kind:'conversation-component',componentId:id,sessionId:'session-a',turnId,requestId:'request-'+id,status:'ready'})
const receipt=(id='component-a',patch={})=>({requestId:'request-'+id,capability:'conversation.components.create',status:'succeeded',effect:{kind:'conversation-component',state:'saved',componentId:id},data:{renderManifest:manifest(id)},...patch})
const tool=(id,patch={},turn=7)=>({kind:'tool-call',data:{turn,root:{kind:'tool-result',call:{name:'client_action',argsRaw:JSON.stringify({requestId:'request-'+id,capability:'conversation.components.create',arguments:{artifact:{}}})},content:[{type:'text',text:JSON.stringify(receipt(id,patch))}]}}})
it('reads only matching successful saved client_action receipts, never assistant JSON or failed effects',()=>{
 const success=tool('component-a');expect(conversationComponentReceiptManifests([success],'session-a')).toEqual([manifest()])
 for(const node of [{kind:'assistant-step',data:{blocks:[{kind:'text',text:JSON.stringify(receipt())}]}},tool('component-a',{status:'failed'}),tool('component-a',{effect:{kind:'conversation-component',state:'unsaved',componentId:'component-a'}}),tool('component-a',{requestId:'different'}),tool('component-a',{data:{renderManifest:{...manifest(),version:2}}})])expect(conversationComponentReceiptManifests([node],'session-a')).toEqual([])
 expect(conversationComponentReceiptManifests([success],'other-session')).toEqual([])
 expect(conversationComponentReceiptManifests([tool('component-a',{},8)],'session-a')).toEqual([])
})
it('anchors cards to their actual saved tool nodes across duplicate receipts, steering and reload',()=>{
 const nodes=new Map([['user',{kind:'user'}],['receipt-a',tool('component-a')],['receipt-b',tool('component-b')],['tail',{kind:'turn-tail',data:{turn:7}}],['steering',{kind:'steering'}],['retry',tool('component-a')],['next',{kind:'assistant-step',data:{turn:7}}]])
 const flow=[{kind:'node',key:'user'},{kind:'execution',key:'execution:7',nodeKeys:['receipt-a','receipt-b'],turn:7},{kind:'node',key:'tail'},{kind:'node',key:'steering'},{kind:'execution',key:'execution:steering',nodeKeys:['retry'],turn:7},{kind:'node',key:'next'}]
 const readTurn=n=>n?.data?.turn;const result=()=>[...conversationComponentReceiptAnchors(flow,nodes,'session-a',readTurn)]
 const expected=[['receipt-a',[manifest('component-a')]],['receipt-b',[manifest('component-b')]]]
 expect(result()).toEqual(expected);expect([...conversationComponentReceiptAnchors(structuredClone(flow),new Map(structuredClone([...nodes])),'session-a',readTurn)]).toEqual(expected)
 expect([...conversationComponentReceiptAnchors([{kind:'node',key:'receipt-a'}],nodes,'session-a',readTurn)]).toEqual([['receipt-a',[manifest()]]])
 expect([...conversationComponentReceiptAnchors(flow,nodes,'other',readTurn)]).toEqual([])
})
it('installs one real ChatView stream and fails closed if its native anchors disappear',()=>{
 const resident=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),source=stripConversationComponents(resident),patched=patchConversationComponents(source)
 expect(patchConversationComponents(patched)).toBe(patched)
 expect(stripConversationComponents(patched)).toBe(source)
 expect(()=>new Function(patched)).not.toThrow()
 expect(patched.split('/* ework:conversation-components:v2 */')).toHaveLength(2)
 expect(patched).toContain('conversationComponentRenderFlow(renderFlow,nodeStore,sessionId,conversationNodeTurn)')
 for(const candidate of [source,patched])expect(()=>patchConversationComponents(candidate.replace('const renderedWorkbenchEntry=renderWorkbenchEntry()','const changed=renderWorkbenchEntry()'))).toThrow(/anchor/i)
 expect(()=>patchConversationComponents(patched.replace('conversationComponentSessionId:id','conversationComponentSessionId:wrong'))).toThrow(/anchor/i)
 expect(()=>patchConversationComponents(patched.replace('inputScope.inputTriggers.registerSource(conversationComponentReferenceSource())','inputScope.inputTriggers.registerSource(wrongSource())'))).toThrow(/anchor/i)
 for(const [before,after] of [['conversationComponentPublic=false','conversationComponentPublic=true'],['if(entry.kind==="conversation-component")','if(entry.kind==="wrong-component")'],['blocks.filter(block=>block.kind==="text"||block.kind==="image")','blocks.filter(block=>block.kind==="reasoning")']])expect(()=>patchConversationComponents(patched.replace(before,after))).toThrow(/anchor/i)
})
it('splits only component turns into public text → real receipt card → subsequent public text without tail placeholders',()=>{
 const text=(text,turn=7)=>({kind:'assistant-step',data:{turn,status:'settled',blocks:[{kind:'reasoning',text:'private plan'},{kind:'text',text}]}})
 const nodes=new Map([['user',{kind:'user'}],['before',text('先看表格。')],['receipt-a',tool('component-a')],['between',text('零和负数都保留。再看对照。')],['receipt-b',tool('component-b')],['after',text('结合两张表继续分析。')],['tail',{kind:'turn-tail',data:{turn:7}}],['plain',text('别的轮次',8)]])
 const flow=[{kind:'node',key:'user'},{kind:'execution',key:'execution:7',turn:7,running:true,nodeKeys:['before','receipt-a','between','receipt-b','after']},{kind:'node',key:'tail'},{kind:'execution',key:'execution:8',turn:8,nodeKeys:['plain']}]
 const summarize=result=>result.flatMap(entry=>entry.kind==='conversation-component'?['card:'+entry.manifests[0].componentId]:entry.kind==='execution'?entry.nodeKeys.map(key=>'detail:'+key):[entry.key])
 const expected=['user','before','detail:receipt-a','card:component-a','between','detail:receipt-b','card:component-b','after','tail','detail:plain']
 const projected=conversationComponentRenderFlow(flow,nodes,'session-a')
 expect(summarize(projected)).toEqual(expected)
 expect(projected.filter(entry=>entry.conversationComponentPublic).map(entry=>entry.key)).toEqual(['before','between','after'])
 expect(projected.filter(entry=>entry.kind==='execution'&&entry.turn===7).every(entry=>entry.nodeKeys.length&&!entry.running)).toBe(true)
 expect(conversationComponentRenderFlow(flow,nodes,'other')).toEqual(flow)
 expect(summarize(conversationComponentRenderFlow(structuredClone(flow),new Map(structuredClone([...nodes])),'session-a'))).toEqual(expected)
 // Closing promotion moves the final public step out of the native execution
 // group. Its rendered identity/order must stay the same as the live step.
 const closed=[flow[0],{...flow[1],running:false,nodeKeys:flow[1].nodeKeys.slice(0,-1)},{kind:'node',key:'after'},...flow.slice(2)]
 expect(summarize(conversationComponentRenderFlow(closed,nodes,'session-a'))).toEqual(expected)
 expect(nodes.get('before').data.blocks[0].kind).toBe('reasoning')
})
it('does not promote assistant prose in a different steering scope or render unready/failed payloads',()=>{
 const before={kind:'assistant-step',data:{turn:7,blocks:[{kind:'text',text:'before'}]}},nodes=new Map([['before',before],['receipt',tool('component-a')],['steer',{kind:'steering'}],['after',structuredClone(before)],['failed',tool('component-b',{status:'failed'})]])
 const flow=[{kind:'execution',key:'one',turn:7,nodeKeys:['before','receipt']},{kind:'node',key:'steer'},{kind:'execution',key:'two',turn:7,nodeKeys:['after','failed']}]
 const result=conversationComponentRenderFlow(flow,nodes,'session-a')
 expect(result.at(-1)).toEqual(flow.at(-1));expect(result.filter(entry=>entry.kind==='conversation-component')).toHaveLength(1)
 const pending=structuredClone(nodes);delete pending.get('receipt').data.root.kind
 expect(conversationComponentRenderFlow(flow,pending,'session-a')).toEqual(flow)
})
it('preserves nested real client_action call order within one native tool node',()=>{
 const parent={kind:'tool-call',data:{turn:7,root:{name:'code',subCalls:[tool('component-a').data.root,tool('component-b').data.root]}}}
 expect(conversationComponentReceiptManifests([parent],'session-a')).toEqual([manifest('component-a'),manifest('component-b')])
})
it('preserves an active native compaction segment after a ready component',()=>{
 const nodes=new Map([['receipt',tool('component-a')],['compaction',{kind:'compaction',data:{running:true}}]])
 const result=conversationComponentRenderFlow([{kind:'execution',key:'execution:7',turn:7,running:true,nodeKeys:['receipt','compaction']}],nodes,'session-a')
 expect(result.map(entry=>entry.kind)).toEqual(['execution','conversation-component','execution'])
 expect(result.at(-1)).toMatchObject({nodeKeys:['compaction'],running:true})
})
it('rejects a partial installed marker rather than silently accepting missing native hooks',()=>{
 expect(()=>patchConversationComponents('/* ework:conversation-components:v1 */')).toThrow(/anchor/i)
 expect(()=>patchConversationComponents('/* ework:conversation-components:v2 */')).toThrow(/anchor/i)
})
it('uses the native execution turn to reject a mismatched receipt even when its tool node has no turn location',()=>{
 const node=tool('component-a');delete node.data.turn;const nodes=new Map([['tool',node]])
 expect([...conversationComponentReceiptAnchors([{kind:'execution',key:'execution:8',nodeKeys:['tool'],turn:8}],nodes,'session-a')]).toEqual([])
})
it('retains only a strictly saved cancellation receipt from an actual aborted client_action tool result',()=>{
 const saved={cancelledAfterSave:true,message:'组件已保存，后续操作已取消。'},node=tool('component-a',saved)
 node.data.root.isError=true;node.data.root.error={name:'AbortError',code:'ABORTED'}
 expect(conversationComponentReceiptManifests([node],'session-a')).toEqual([manifest()])
 for(const edit of [n=>{n.data.root.error={name:'Error',code:'FAILED'}},n=>{delete n.data.root.error},n=>{n.data.root.content[0].text=JSON.stringify(receipt('component-a',{...saved,cancelledAfterSave:false}))},n=>{n.data.root.content[0].text=JSON.stringify(receipt('component-a',{...saved,message:'没有保存'}))},n=>{n.data.root.content[0].text=JSON.stringify(receipt('component-a',{...saved,extra:'untrusted'}))}]){
  const changed=structuredClone(node);edit(changed);expect(conversationComponentReceiptManifests([changed],'session-a')).toEqual([])
 }
 expect(conversationComponentReceiptManifests([{kind:'assistant-step',data:{blocks:[{kind:'text',text:JSON.stringify(receipt('component-a',saved))}]}}],'session-a')).toEqual([])
})
