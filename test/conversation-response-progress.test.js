import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {expect,it} from 'vitest'
const require=createRequire(import.meta.url),{conversationResponseProgress,conversationResponseElapsed,patchConversationResponseProgress,stripConversationResponseProgress}=require('../scripts/lib/conversation-response-progress.mjs'),{stripConversationSubmission}=require('../scripts/lib/conversation-submission.mjs')
it('distinguishes an unknown historical duration from a genuine zero or subsecond settlement',()=>{
 const clock={running:false,startTime:null,endTime:2000,now:9000,anchor:9000}
 expect(conversationResponseElapsed(clock)).toBeNull()
 expect(conversationResponseElapsed({...clock,startTime:1000,endTime:null})).toBeNull()
 expect(conversationResponseElapsed({...clock,startTime:2000})).toBe(0)
 expect(conversationResponseElapsed({...clock,startTime:1500})).toBe(500)
 expect(conversationResponseElapsed({...clock,startTime:2500})).toBeNull()
 expect(conversationResponseElapsed({...clock,startTime:NaN})).toBeNull()
 expect(conversationResponseElapsed({...clock,startTime:1000,endTime:Infinity})).toBeNull()
})
it('keeps running preparation and durable turn clocks independent from an inactive mount',()=>{
 const clock={running:true,startTime:null,endTime:null,now:10000,anchor:7000}
 expect(conversationResponseElapsed(clock)).toBe(3000)
 expect(conversationResponseElapsed({...clock,startTime:5000})).toBe(5000)
 expect(conversationResponseElapsed({...clock,running:false})).toBeNull()
 expect(conversationResponseElapsed({...clock,startTime:5000,endTime:9000})).toBe(4000)
 expect(conversationResponseElapsed({...clock,startTime:5000,endTime:9000,now:50000,anchor:50000})).toBe(4000)
})
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
 expect(()=>patchConversationResponseProgress(once+'\n/* ework:conversation-response-progress:v3 */')).toThrow(/duplicate/)
 expect(()=>stripConversationResponseProgress(once.replace('responseTiming.visible :','responseTiming.wrong :'))).toThrow(/anchor drifted/)
 expect(()=>patchConversationResponseProgress(once.replace('/* ework:conversation-response-progress:v3 */','/* ework:conversation-response-progress:v99 */'))).toThrow(/Unknown/)
 expect(()=>patchConversationResponseProgress(source+'\nconst responseClockRunning=true;')).toThrow(/Orphan/)
 expect(()=>stripConversationResponseProgress(once+'\neworkResponseProgressByTurn;')).toThrow(/Orphan/)
})

it('upgrades only the exact old progress definition while preserving timer transform inverses',async()=>{
 const old=stripConversationSubmission(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')),base=stripConversationResponseProgress(old),next=patchConversationResponseProgress(old)
 expect(stripConversationResponseProgress(next)).toBe(base)
 expect(next).toContain('/* ework:conversation-response-progress:v3 */')
 expect(next).not.toContain('/* ework:conversation-response-progress:v2 */')
 expect(next).not.toContain('/* ework:conversation-response-progress:v1 */')
 if(old.includes('/* ework:conversation-response-progress:v1 */'))expect(()=>patchConversationResponseProgress(old.replace('const first=new Set(),result=new Map()','const first=new Set(),result=new WeakMap()'))).toThrow(/definition drifted/)
 if(old.includes('/* ework:conversation-response-progress:v2 */'))expect(()=>patchConversationResponseProgress(old.replace('const first=new Set(),result=new Map()','const first=new Set(),result=new WeakMap()'))).toThrow(/definition drifted/)
})
