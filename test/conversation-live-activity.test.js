import {it,expect} from 'vitest'
import {readFile} from 'node:fs/promises'
import {conversationLiveActivity,patchConversationLiveActivity,stripConversationLiveActivity} from '../scripts/lib/conversation-live-activity.mjs'
const tool=(name,done=false,turn=2)=>({kind:'tool-call',location:{turn:{turn}},data:{root:done?{kind:'tool-call',call:{name}}:{name}}})
const activity=(nodes=[],rest={})=>conversationLiveActivity({running:true,runningTurn:2,order:nodes.map((_,i)=>i),nodeStore:new Map(nodes.map((n,i)=>[i,n])),labelForNode:n=>'Working: '+n.data.root.name,...rest})
it('installs one reversible activity footer on both native conversation hosts',async()=>{
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),base=stripConversationLiveActivity(source),next=patchConversationLiveActivity(base)
 expect(patchConversationLiveActivity(next)).toBe(next);expect(stripConversationLiveActivity(next)).toBe(base)
 expect(next.match(/react.createElement\(ConversationLiveActivity,/g)).toHaveLength(2)
 expect(()=>stripConversationLiveActivity(next.replace('flex:0 0 12px','flex:0 0 10px'))).toThrow(/drifted/)
})
it('shows immediate preparation and never mistakes old completed tools for current work',()=>{
 expect(activity()).toEqual({kind:'thinking',label:'正在思考…'})
 expect(activity([tool('read',true),tool('bash',false,1)])).toEqual({kind:'thinking',label:'正在思考…'})
 expect(activity([tool('read',false)])).toMatchObject({kind:'tool',label:'Working: read',parallelCount:1})
 expect(activity([tool('read'),tool('bash')])).toMatchObject({kind:'tool',parallelCount:2})
})
it('publishes only phase labels while private reasoning and credentials stay in their original owner',()=>{
 const node={kind:'assistant-step',location:{turn:{turn:2}},data:{status:'streaming',blocks:[{kind:'reasoning',text:'secret Bearer xxx'}]}}
 expect(activity([node])).toMatchObject({kind:'thinking'});node.data.blocks.push({kind:'text',text:'The real answer'})
 expect(activity([node])).toEqual({kind:'reply',label:'正在整理回复…'})
 expect(JSON.stringify(activity([node]))).not.toMatch(/secret|Bearer|real answer/)
})
it('names explicit input waits, compaction and retries without a false running tool label',()=>{
 expect(activity([tool('request_user_input')])).toEqual({kind:'waiting',label:'等待你的回答'})
 expect(activity([tool('request_permissions')],{english:true})).toEqual({kind:'waiting',label:'Waiting for your approval'})
 expect(activity([{kind:'compaction',location:{turn:{turn:2}},data:{running:true}}])).toMatchObject({kind:'compaction'})
 expect(activity([{kind:'model-retry',location:{turn:{turn:2}}}],{english:true})).toEqual({kind:'retry',label:'Retrying connection…'})
})
it('hides at termination, failure, session loading and for queued messages alone',()=>{
 for(const rest of [{running:false},{openState:'error'},{openState:'loading'}])expect(activity([tool('read')],rest)).toBeNull()
 expect(activity([],{running:false,flow:[{kind:'pending-steering'}]})).toBeNull()
})
it('retains honest note and canvas activity when those owners run without a parent turn',()=>{
 expect(activity([],{running:false,noteRows:[{phase:'generating',stage:'writing'}]})).toEqual({kind:'note',label:'正在写入笔记…'})
 expect(activity([],{running:false,noteRows:[{phase:'completed'}]})).toBeNull()
 expect(activity([],{running:false,canvasTasks:[{state:'waiting'}],english:true})).toEqual({kind:'canvas',label:'Waiting for canvas updates…'})
 expect(activity([],{running:false,canvasTasks:[{state:'paused'}]})).toBeNull()
})
