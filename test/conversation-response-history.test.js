import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {conversationResponseHistory:fold,patchConversationResponseHistory:patch,stripConversationResponseHistory:strip}=require('../scripts/lib/conversation-response-history.mjs')
const text=(key,turn)=>({key,kind:'assistant-step',location:{turn:{turn}},data:{blocks:[{kind:'text',text:key}]}})
it('does not move progress across a steering message or another human turn',()=>{
 const nodes=new Map(['a','b','c','d'].map(key=>[key,text(key,key==='d'?2:1)]));nodes.set('steer',{kind:'steering',location:{turn:{turn:1}}})
 const flow=[{kind:'node',key:'a'},{kind:'execution',key:'e1',turn:1,nodeKeys:['tool1']},{kind:'node',key:'b'},{kind:'node',key:'steer'},{kind:'execution',key:'e2',turn:1,nodeKeys:['tool2']},{kind:'node',key:'c'},{kind:'node',key:'d'}]
 const result=fold(flow,nodes,null)
 expect(result.map(row=>row.key)).toEqual(['e1','b','steer','e2','c','d'])
 expect(result[0].nodeKeys).toEqual(['a','tool1'])
 expect(result[3].nodeKeys).toEqual(['tool2'])
 expect(flow[1].nodeKeys).toEqual(['tool1'])
})
it('keeps latest running reply and active work outside the historical disclosure',()=>{
 const nodes=new Map(['a','b'].map(key=>[key,text(key,1)])),flow=[{kind:'node',key:'a'},{kind:'execution',key:'e1',turn:1,nodeKeys:['tool1']},{kind:'node',key:'b'},{kind:'execution',key:'e2',turn:1,nodeKeys:['tool2'],running:true}]
 expect(fold(flow,nodes,1)).toEqual([{...flow[1],nodeKeys:['a','tool1'],running:false,responseHistory:true},flow[2],flow[3]])
})
it('installs and reverses the exact history layer without accepting altered patch bytes',()=>{
 const raw=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),base=strip(raw),next=patch(base)
 expect(strip(next)).toBe(base);expect(patch(next)).toBe(next)
 expect(()=>strip(next.replace('gap:14px;margin:16px','gap:18px;margin:16px'))).toThrow(/drifted/)
 expect(()=>strip(next+'\n/* ework:conversation-response-history:v1 */')).toThrow(/drifted/)
})
