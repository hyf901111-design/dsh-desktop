import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {conversationComponentReceiptManifests,conversationComponentReceiptAnchors,patchConversationComponents} from '../scripts/lib/conversation-components.mjs'
const manifest=(id='component-a',turnId='7')=>({version:1,kind:'conversation-component',componentId:id,sessionId:'session-a',turnId,requestId:'request-'+id,status:'ready'})
const receipt=(id='component-a',patch={})=>({requestId:'request-'+id,capability:'conversation.components.create',status:'succeeded',effect:{kind:'conversation-component',state:'saved',componentId:id},data:{renderManifest:manifest(id)},...patch})
const tool=(id,patch={},turn=7)=>({kind:'tool-call',data:{turn,root:{kind:'tool-result',call:{name:'client_action',argsRaw:JSON.stringify({requestId:'request-'+id,capability:'conversation.components.create',arguments:{artifact:{}}})},content:[{type:'text',text:JSON.stringify(receipt(id,patch))}]}}})
it('reads only matching successful saved client_action receipts, never assistant JSON or failed effects',()=>{
 const success=tool('component-a');expect(conversationComponentReceiptManifests([success],'session-a')).toEqual([manifest()])
 for(const node of [{kind:'assistant-step',data:{blocks:[{kind:'text',text:JSON.stringify(receipt())}]}},tool('component-a',{status:'failed'}),tool('component-a',{effect:{kind:'conversation-component',state:'unsaved',componentId:'component-a'}}),tool('component-a',{requestId:'different'}),tool('component-a',{data:{renderManifest:{...manifest(),version:2}}})])expect(conversationComponentReceiptManifests([node],'session-a')).toEqual([])
 expect(conversationComponentReceiptManifests([success],'other-session')).toEqual([])
 expect(conversationComponentReceiptManifests([tool('component-a',{},8)],'session-a')).toEqual([])
})
it('keeps two cards at their original turn tail across duplicate receipts, steering and reload',()=>{
 const nodes=new Map([['user',{kind:'user'}],['receipt-a',tool('component-a')],['receipt-b',tool('component-b')],['tail',{kind:'turn-tail',data:{turn:7}}],['steering',{kind:'steering'}],['retry',tool('component-a')],['next',{kind:'assistant-step',data:{turn:7}}]])
 const flow=[{kind:'node',key:'user'},{kind:'execution',key:'execution:7',nodeKeys:['receipt-a','receipt-b'],turn:7},{kind:'node',key:'tail'},{kind:'node',key:'steering'},{kind:'execution',key:'execution:steering',nodeKeys:['retry'],turn:7},{kind:'node',key:'next'}]
 const readTurn=n=>n?.data?.turn;const result=()=>[...conversationComponentReceiptAnchors(flow,nodes,'session-a',readTurn)]
 expect(result()).toEqual([['tail',[manifest('component-a'),manifest('component-b')]]]);expect([...conversationComponentReceiptAnchors(structuredClone(flow),new Map(structuredClone([...nodes])),'session-a',readTurn)]).toEqual([['tail',[manifest('component-a'),manifest('component-b')]]])
 expect([...conversationComponentReceiptAnchors([{kind:'node',key:'receipt-a'}],nodes,'session-a',readTurn)]).toEqual([['receipt-a',[manifest()]]])
 expect([...conversationComponentReceiptAnchors(flow,nodes,'other',readTurn)]).toEqual([])
})
it('installs one real ChatView tail and fails closed if its native anchors disappear',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),patched=patchConversationComponents(source)
 expect(patchConversationComponents(patched)).toBe(patched)
 expect(patched.split('/* ework:conversation-components:v1 */')).toHaveLength(2)
 expect(patched).toContain('conversationComponentReceiptAnchors(renderFlow,nodeStore,sessionId,conversationNodeTurn)')
 expect(()=>patchConversationComponents(source.replace('const renderedWorkbenchEntry=renderWorkbenchEntry()','const changed=renderWorkbenchEntry()'))).toThrow(/anchor/i)
})
it('rejects a partial installed marker rather than silently accepting missing native hooks',()=>{
 expect(()=>patchConversationComponents('/* ework:conversation-components:v1 */')).toThrow(/anchor/i)
})
it('uses the native execution turn to reject a mismatched receipt even when its tool node has no turn location',()=>{
 const node=tool('component-a');delete node.data.turn;const nodes=new Map([['tool',node]])
 expect([...conversationComponentReceiptAnchors([{kind:'execution',key:'execution:8',nodeKeys:['tool'],turn:8}],nodes,'session-a')]).toEqual([])
})
