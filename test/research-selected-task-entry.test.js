import {expect,it,vi} from 'vitest'
import {ResearchTaskRuntime,validateResearchTaskStart} from '../packages/dsh-research-task-runtime/index.js'

// Selected-source tasks deliberately forbid prompt. Exercise the same runtime
// entry as the HTTP/board tool, rather than bypassing validation with a mock task.
it.each(['summary','mind-map'])('completes a legal %s request without a container prompt',async kind=>{
 const request={parentSessionId:'p',canvasNodeId:'n',kind,...(kind==='mind-map'?{detail:'brief'}:{}),sources:[{id:'s',type:'artifact',title:'已选材料',text:'原文证据：现金流增加20%。'}]}
 expect(validateResearchTaskStart(request)).not.toHaveProperty('prompt')
 const start=vi.fn(async()=>({childSessionId:'child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:'# 核对结果\n现金流增加20%。'}]}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}}})
 try{
  const receipt=await runtime.start(request)
  await expect(runtime.tasks.get(receipt.taskId).runPromise).resolves.toBeUndefined()
  expect(start).toHaveBeenCalledOnce()
  expect(start.mock.calls[0][0].prompt).toContain('现金流增加20%')
  expect(runtime.inspect({parentSessionId:'p',taskId:receipt.taskId})).toMatchObject({state:'completed',finalOutput:'# 核对结果\n现金流增加20%。'})
 }finally{await runtime.dispose()}
})
