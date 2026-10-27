import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {expect,it} from 'vitest'
const require=createRequire(import.meta.url),{conversationResponseProgress,patchConversationResponseProgress,stripConversationResponseProgress}=require('../scripts/lib/conversation-response-progress.mjs'),{stripConversationSubmission}=require('../scripts/lib/conversation-submission.mjs')
it('owns one timer per actual turn while an earlier execution segment stays completed',()=>{
 const first={kind:'execution',key:'a',turn:1,running:false},second={kind:'execution',key:'b',turn:1,running:true},past={kind:'execution',key:'past',turn:0,running:false}
 const flow=[past,{kind:'node',key:'user'},first,{kind:'node',key:'prose'},second]
 expect([...conversationResponseProgress(flow,1)]).toEqual([['past',{visible:true,running:false}],['a',{visible:true,running:true}],['b',{visible:false,running:true}]])
 expect([...conversationResponseProgress(flow,null)]).toEqual([['past',{visible:true,running:false}],['a',{visible:true,running:false}],['b',{visible:false,running:false}]])
 expect(first.running).toBe(false);expect(flow).toHaveLength(5)
})
it('does not merge unowned or standalone Notes and canvas tasks into another response',()=>{
 const flow=[{kind:'note',key:'note:1'},{kind:'canvas-task',key:'canvas:1'},{kind:'execution',key:'unidentified',turn:null,running:true},{kind:'execution',key:'other-unidentified',turn:null,running:false},{kind:'execution',key:'known',turn:3,running:true}]
 expect([...conversationResponseProgress(flow,3)]).toEqual([['unidentified',{visible:true,running:true}],['other-unidentified',{visible:true,running:false}],['known',{visible:true,running:true}]])
})
it('installs twice and precisely strips its real native layer while rejecting duplicate and drifted hooks',async()=>{
 const installed=stripConversationSubmission(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),source=stripConversationResponseProgress(installed),once=patchConversationResponseProgress(installed)
 expect(patchConversationResponseProgress(once)).toBe(once);expect(stripConversationResponseProgress(once)).toBe(source)
 expect(()=>new Function(once)).not.toThrow()
 expect(()=>patchConversationResponseProgress(once+'\n/* ework:conversation-response-progress:v2 */')).toThrow(/duplicate/)
 expect(()=>stripConversationResponseProgress(once.replace('responseTiming.visible :','responseTiming.wrong :'))).toThrow(/anchor drifted/)
 expect(()=>patchConversationResponseProgress(once.replace('/* ework:conversation-response-progress:v2 */','/* ework:conversation-response-progress:v99 */'))).toThrow(/Unknown/)
 expect(()=>patchConversationResponseProgress(source+'\nconst responseClockRunning=true;')).toThrow(/Orphan/)
 expect(()=>stripConversationResponseProgress(once+'\neworkResponseProgressByTurn;')).toThrow(/Orphan/)
})

it('upgrades only the exact old progress definition while preserving timer transform inverses',async()=>{
 const old=stripConversationSubmission(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),base=stripConversationResponseProgress(old),next=patchConversationResponseProgress(old)
 expect(stripConversationResponseProgress(next)).toBe(base)
 expect(next).toContain('/* ework:conversation-response-progress:v2 */')
 expect(next).not.toContain('/* ework:conversation-response-progress:v1 */')
 if(old.includes('/* ework:conversation-response-progress:v1 */'))expect(()=>patchConversationResponseProgress(old.replace('const first=new Set(),result=new Map()','const first=new Set(),result=new WeakMap()'))).toThrow(/definition drifted/)
})
