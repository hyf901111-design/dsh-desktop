import { readFile } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { patchCanvasTaskNotices } from '../scripts/lib/canvas-task-notices.mjs'

it('canvas rounds do not wake their waiting parent, ordinary subagents still notify', async () => {
  const source = patchCanvasTaskNotices(await readFile('node_modules/@deepseek-ai/dsh-subagent/lib/index.js','utf8'))
  expect(patchCanvasTaskNotices(source)).toBe(source)
  const start=source.indexOf('notifySettlement(activation, terminal) {')
  const end=source.indexOf('\n\t/**',start)
  const Manager=new Function('createUserMessage','settlementSummary','boundContextSummary',`return class {${source.slice(start,end)}}`)(x=>x,()=> 'round ended',x=>x)
  const manager=new Manager(),parent={status:'idle',followup:vi.fn(),steer:vi.fn()},child={}
  manager.ctx={agents:new Map([['parent',parent]]),logger:{warn:vi.fn()}}
  manager.closingTeardownFor=()=>undefined
  manager.sendWaking=(_parent,_message,send)=>send()
  const activation={announced:true,parentSession:'parent',childId:'child',handle:{agent:child}}
  child[Symbol.for('sherlock.canvas-task-owned')]=true
  manager.notifySettlement(activation,{stopReason:'completed',output:[]})
  expect(parent.followup).not.toHaveBeenCalled()
  delete child[Symbol.for('sherlock.canvas-task-owned')]
  manager.notifySettlement(activation,{stopReason:'completed',output:[]})
  expect(parent.followup).toHaveBeenCalledOnce()
})
