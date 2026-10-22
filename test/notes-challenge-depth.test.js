import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { generateNoteChallenge } from '../packages/dsh-research-task-runtime/notes-challenge-runtime.js'

const block=(id,text)=>({id,type:'paragraph',text})
const request={sessionId:'qa-depth',requestId:'qa-depth-request',action:'review',level:4,title:'活动方案',blocks:[block('a','请提胶材料。只按收入评判活动的价值。')],changedIds:['a']}
const typo={quote:'提胶',category:'typo',basis:'note',message:'应为提交。',evidence:[]}
const question={quote:'只按收入评判活动的价值',category:'question',basis:'note',questionType:'implication',message:'是否应考虑低收入参与者的收获与可及性？',evidence:[]}
const basic=(payload,issues=[])=>({reviews:payload.targets.map(target=>({reviewKey:target.reviewKey,issues}))})
const viewpoint=(payload,issues=[])=>({dimension:'viewpoint',reviews:payload.targets.map(target=>({reviewKey:target.reviewKey,assessment:issues.length?'questions':'not-applicable',issues}))})
function provider(respond){
 const calls=[]
 const ctx={apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{routable:true,current:{provider:'qa',model:'qa'}}}})}},llm:{
  resolveModelInfo:async()=>({reasoning:{efforts:[{id:'medium'},{id:'low'}]}}),
  stream:async function*(options){
   const payload=JSON.parse(options.messages[0].content[0].text)
   calls.push({payload,options,at:Date.now()})
   const value=await respond(payload,options)
   yield{type:'text-delta',index:0,text:JSON.stringify(value)}
   yield{type:'finish',reason:{kind:'stop'}}
  }
 }}
 return{ctx,calls}
}
beforeEach(()=>vi.spyOn(console,'warn').mockImplementation(()=>{}))
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks()})

it('requires the separate viewpoint receipt even after valid empty primary and omission reviews',async()=>{
 const f=provider(payload=>basic(payload)),result=await generateNoteChallenge(f.ctx,request)
 expect(f.calls.map(call=>call.payload.dimension??'primary')).toEqual(['primary','omissions','viewpoint'])
 expect(result.coveredBlockIds).toEqual(['a'])
 expect(result.completeBlockIds).toEqual([])
 expect(result.checks).toContainEqual(expect.objectContaining({status:'partial',detail:expect.stringContaining('观点拓展')}))
})

it('allows explicitly assessed descriptive content without manufacturing a question',async()=>{
 const f=provider(payload=>payload.dimension==='viewpoint'?viewpoint(payload):basic(payload))
 const result=await generateNoteChallenge(f.ctx,{...request,blocks:[block('a','今天整理材料，周五提交确认后的版本。')]})
 expect(result.issues).toEqual([])
 expect(result.completeBlockIds).toEqual(['a'])
 expect(result.checks.filter(check=>check.detail.includes('观点拓展'))).toEqual([expect.objectContaining({status:'completed'})])
})

for(const [name,invalid] of [
 ['wrong dimension',payload=>({...viewpoint(payload),dimension:'omissions'})],
 ['missing assessment',payload=>({dimension:'viewpoint',reviews:basic(payload).reviews})],
 ['questions without questions',payload=>({dimension:'viewpoint',reviews:[{reviewKey:payload.targets[0].reviewKey,assessment:'questions',issues:[]}]})],
 ['not-applicable with a question',payload=>({dimension:'viewpoint',reviews:[{reviewKey:payload.targets[0].reviewKey,assessment:'not-applicable',issues:[question]}]})],
 ['duplicate target',payload=>{const value=viewpoint(payload);value.reviews.push(value.reviews[0]);return value}],
 ['foreign target',payload=>({dimension:'viewpoint',reviews:[{reviewKey:'foreign',assessment:'not-applicable',issues:[]}]})],
 ['legacy block ID',payload=>({dimension:'viewpoint',reviews:[{blockId:payload.targets[0].id,assessment:'not-applicable',issues:[]}]})],
 ['unrecognized receipt field',payload=>({...viewpoint(payload),complete:true})]
])it('keeps validated corrections but refuses tier completion for '+name,async()=>{
 const f=provider(payload=>payload.dimension==='viewpoint'?invalid(payload):basic(payload,payload.audit?[]:[typo]))
 const result=await generateNoteChallenge(f.ctx,request)
 expect(result.issues).toEqual([expect.objectContaining({category:'typo',quote:'提胶'})])
 expect(result.completeBlockIds).toEqual([])
 expect(f.calls).toHaveLength(3)
 expect(result.checks).toContainEqual(expect.objectContaining({status:'partial',detail:expect.stringContaining('观点拓展')}))
})

it('does not complete a partially acknowledged viewpoint batch',async()=>{
 const f=provider(payload=>payload.dimension==='viewpoint'?{...viewpoint(payload),reviews:viewpoint(payload).reviews.slice(0,1)}:basic(payload))
 const result=await generateNoteChallenge(f.ctx,{...request,blocks:[block('a','今天整理材料。'),block('b','明天确认版本。')],changedIds:['a','b']})
 expect(result.coveredBlockIds).toEqual(['a','b'])
 expect(result.completeBlockIds).toEqual(['a'])
 expect(result.checks).toContainEqual(expect.objectContaining({status:'partial',detail:expect.stringContaining('观点拓展实际完成1/2')}))
})

it('validates viewpoint type, source and exact anchor independently and logs no note content',async()=>{
 const invalidAnchor={...question,quote:'PRIVATE-UNKNOWN-QUOTE',message:'PRIVATE-MESSAGE'}
 const factualQuestion={...question,category:'uncertain',basis:'general-knowledge',message:'冰点是否错误？'}
 const f=provider(payload=>payload.dimension==='viewpoint'?viewpoint(payload,[question,invalidAnchor,factualQuestion]):basic(payload))
 const result=await generateNoteChallenge(f.ctx,request)
 expect(result.issues).toEqual([{blockId:'a',quote:question.quote,category:'question',message:question.message,evidence:[]}])
 expect(result.completeBlockIds).toEqual([])
 const logs=vi.mocked(console.warn).mock.calls.map(([text])=>JSON.parse(text)),phases=logs.filter(log=>log.event==='notes-challenge-phase-candidates')
 expect(phases.map(log=>log.phase)).toEqual(['primary','omissions','viewpoint'])
 expect(phases[2]).toMatchObject({candidates:3,accepted:1,retained:1,filtered:2,rejected:{anchor:1,dimension:1}})
 for(const secret of ['PRIVATE-',request.requestId,request.sessionId,request.blocks[0].text,question.message])expect(JSON.stringify(logs)).not.toContain(secret)
})

it('does not treat a missing question type or fabricated evidence as a completed viewpoint review',async()=>{
 for(const candidate of [{...question,questionType:undefined},{...question,questionType:'fact-check'},{...question,evidence:[{kind:'note',label:'依据',blockId:'a',quote:'正文没有的材料'}]}]){
  const f=provider(payload=>payload.dimension==='viewpoint'?viewpoint(payload,[candidate]):basic(payload))
  const result=await generateNoteChallenge(f.ctx,request)
  expect(result.issues).toEqual([])
  expect(result.completeBlockIds).toEqual([])
 }
})

it('reserves omission and viewpoint execution within sixty seconds when the primary ignores cancellation',async()=>{
 vi.useFakeTimers()
 const startedAt=Date.now(),f=provider(async payload=>{
  if(!payload.audit)await new Promise(resolve=>setTimeout(resolve,55000))
  else await new Promise(resolve=>setTimeout(resolve,payload.dimension==='omissions'?14000:8000))
  return payload.dimension==='viewpoint'?viewpoint(payload,[question]):basic(payload,payload.audit?[typo]:[])
 })
 const blocks=Array.from({length:6},(_,index)=>block('b'+index,request.blocks[0].text))
 let finishedAt
 const pending=generateNoteChallenge(f.ctx,{...request,blocks,changedIds:blocks.map(item=>item.id)}).then(result=>{finishedAt=Date.now();return result})
 await vi.advanceTimersByTimeAsync(60000)
 const result=await pending
 expect(f.calls.map(call=>call.payload.dimension??'primary')).toEqual(['primary','omissions','viewpoint'])
 expect(f.calls[0].options.signal.aborted).toBe(true)
 expect(f.calls[1].at-startedAt).toBeLessThan(45000)
 expect(finishedAt-startedAt).toBeLessThan(60000)
 expect(result.issues.filter(issue=>issue.category==='typo')).toHaveLength(6)
 expect(result.issues.filter(issue=>issue.category==='question')).toHaveLength(6)
 expect(result.completeBlockIds).toEqual([])
 expect(result.checks).toContainEqual(expect.objectContaining({status:'partial',detail:expect.stringContaining('主检查阶段未完成')}))
})

it('reserves viewpoint time even when the omission provider never settles',async()=>{
 vi.useFakeTimers()
 const startedAt=Date.now(),f=provider(async payload=>{
  if(payload.dimension==='omissions')await new Promise(()=>{})
  return payload.dimension==='viewpoint'?viewpoint(payload,[question]):basic(payload,[typo])
 })
 const pending=generateNoteChallenge(f.ctx,request)
 await vi.advanceTimersByTimeAsync(30000)
 const result=await pending
 expect(f.calls.map(call=>call.payload.dimension??'primary')).toEqual(['primary','omissions','viewpoint'])
 expect(f.calls[2].at-startedAt).toBeLessThan(30000)
 expect(result.issues.map(issue=>issue.category)).toEqual(['typo','question'])
 expect(result.completeBlockIds).toEqual([])
})

it('stops late viewpoint output at the same bounded request deadline',async()=>{
 vi.useFakeTimers()
 const startedAt=Date.now(),f=provider(async payload=>{
  if(payload.dimension==='viewpoint')await new Promise(resolve=>setTimeout(resolve,60000))
  return payload.dimension==='viewpoint'?viewpoint(payload,[question]):basic(payload,[typo])
 })
 let finishedAt
 const pending=generateNoteChallenge(f.ctx,request).then(result=>{finishedAt=Date.now();return result})
 await vi.advanceTimersByTimeAsync(60000)
 const result=await pending
 expect(finishedAt-startedAt).toBeLessThan(30000)
 expect(result.issues.map(issue=>issue.category)).toEqual(['typo'])
 expect(result.completeBlockIds).toEqual([])
})

it('retains completed batches when a later primary batch exhausts its reserved time',async()=>{
 vi.useFakeTimers()
 let primaryCalls=0
 const f=provider(async payload=>{
  if(!payload.audit&&++primaryCalls===2)await new Promise(()=>{})
  return payload.dimension==='viewpoint'?viewpoint(payload):basic(payload,payload.audit?[]:[typo])
 })
 const blocks=Array.from({length:24},(_,index)=>block('b'+index,request.blocks[0].text))
 const pending=generateNoteChallenge(f.ctx,{...request,blocks,changedIds:blocks.map(item=>item.id)})
 await vi.advanceTimersByTimeAsync(60000)
 const result=await pending
 expect(result.issues).toHaveLength(12)
 expect(result.coveredBlockIds).toEqual(blocks.map(item=>item.id))
 expect(result.completeBlockIds).toEqual(blocks.slice(0,12).map(item=>item.id))
 expect(result.checks).toContainEqual(expect.objectContaining({status:'partial',detail:expect.stringContaining('主检查阶段未完成')}))
})

it('includes model routing and model-info latency in the outer sixty-second securities deadline',async()=>{
 vi.useFakeTimers()
 const f=provider(payload=>payload.dimension==='viewpoint'?viewpoint(payload):basic(payload))
 f.ctx.apiProxy.sessions.models=async()=>{await new Promise(resolve=>setTimeout(resolve,40000));return{result:{ok:true,value:{routable:true,current:{provider:'qa',model:'qa'}}}}}
 f.ctx.llm.resolveModelInfo=async()=>{await new Promise(resolve=>setTimeout(resolve,15000));return{reasoning:{efforts:[{id:'medium'}]}}}
 const startedAt=Date.now()
 let finishedAt
 const pending=generateNoteChallenge(f.ctx,{...request,blocks:[block('a','600519.SH 报告基准日20261020。预计2026年EPS76元。')]}).then(result=>{finishedAt=Date.now();return result})
 await vi.advanceTimersByTimeAsync(60000)
 const result=await pending
 expect(finishedAt-startedAt).toBeLessThan(60000)
 expect(f.calls.map(call=>call.payload.dimension??'primary')).toEqual(['primary','omissions','viewpoint'])
 expect(result.checks).toContainEqual(expect.objectContaining({kind:'consensus',status:'unavailable'}))
})

it('aborts an uncooperative securities model lookup at sixty seconds without starting review calls',async()=>{
 vi.useFakeTimers()
 const f=provider(payload=>basic(payload))
 f.ctx.apiProxy.sessions.models=async()=>new Promise(()=>{})
 const startedAt=Date.now()
 const observed=generateNoteChallenge(f.ctx,{...request,blocks:[block('a','600519.SH 报告基准日20261020。预计2026年EPS76元。')]}).then(result=>({result}),error=>({error,at:Date.now()}))
 await vi.advanceTimersByTimeAsync(60001)
 const result=await observed
 expect(result.error.message).toMatch(/超时/)
 expect(result.at-startedAt).toBe(60000)
 expect(f.calls).toEqual([])
})
