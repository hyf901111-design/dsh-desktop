import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {expect,it} from 'vitest'
import {presentationHostFixture} from './fixtures/home-presentation-host.js'
import {HOME_BOARD_SMART_PATH} from '../packages/dsh-research-task-runtime/home-board-smart-runtime.js'
import {HOME_BOARD_SMART_PROMPT,HOME_BOARD_SMART_ARTIFACT} from '../packages/dsh-research-task-runtime/home-board-smart-contract.js'
it('returns a durable prepared task through the actual private Host route and normal inspector',async()=>{
 const f=await presentationHostFixture(),origin='http://127.0.0.1:'+f.ctx.webServer.port
 try{
  await writeFile(join(f.home,'research-board-directories.json'),JSON.stringify({board:{sessionId:'demo',path:f.cwd,title:'自选行情示例看板'}}))
  const input={sessionId:'demo',runId:'smart-run',canvasNodeId:'smart-node',prompt:HOME_BOARD_SMART_PROMPT},post=()=>fetch(origin+HOME_BOARD_SMART_PATH,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)})
  const response=await post();expect(response.status).toBe(200);const task=await response.json()
  expect(task.state).toBe('completed');expect(JSON.parse(task.finalOutput)).toEqual(HOME_BOARD_SMART_ARTIFACT);expect(task.childSessionId).toBeUndefined()
  const inspect=await fetch(origin+'/sherlock/research-tasks/inspect',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({parentSessionId:'demo',taskId:task.taskId,afterSeq:0})})
  expect(await inspect.json()).toEqual(task);expect((await(await post()).json()).taskId).toBe(task.taskId)
  expect((await f.request(f.api.sessions.models,{sessionId:'demo'})).current).toMatchObject({provider:'outside',model:'normal'})
  expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.dispose()}
},15000)
