import {it,expect} from 'vitest'
import {ongoingCanvasRequest,canvasTaskRoutingGuard} from '../packages/dsh-research-task-runtime/canvas-task-routing.js'
const event=(text,kind='user')=>({type:'user/message',data:{id:'m',source:{kind},content:[{type:'text',text}]}})
const agent=text=>({session:{events:[event(text)]}})
it('recognizes ongoing human intent across components rather than game-specific rules',()=>{
 for(const text of ['陪我下棋，我用黑子','陪我填写这些表格','帮我持续监控这个面板','每次我修改数字就自动填写对应内容','keep monitoring this canvas'])expect(ongoingCanvasRequest(agent(text).session)).not.toBeNull()
 for(const text of ['只帮我下一步','不要持续监控','解释这张图','“陪我下棋”是什么意思','> 持续监控这里'])expect(ongoingCanvasRequest(agent(text).session)).toBeNull()
})
it('ignores tool and document context and respects the latest human request',()=>{
 expect(ongoingCanvasRequest({events:[event('陪我下棋','plugin')]})).toBeNull()
 expect(ongoingCanvasRequest({events:[event('陪我填写表格'),event('只操作一次'),event('陪我下棋','tool')]})).toBeNull()
})
it('blocks one-shot writes for ongoing goals and preserves the owning executor and ordinary one-shot actions',()=>{
 const exec={agent:agent('陪我下棋，我用黑子')}
 expect(()=>canvasTaskRoutingGuard(exec,'use',{op:'click'})).toThrow('CONTINUOUS_TASK_REQUIRED')
 expect(()=>canvasTaskRoutingGuard(exec,'use',{op:'observe'})).not.toThrow()
 exec.agent[Symbol.for('sherlock.canvas-task-owned')]=true
 expect(()=>canvasTaskRoutingGuard(exec,'use',{op:'click'})).not.toThrow()
 expect(()=>canvasTaskRoutingGuard({agent:agent('点一下按钮')},'use',{op:'click'})).not.toThrow()
 expect(()=>canvasTaskRoutingGuard({agent:agent('改用新名称')},'use',{op:'input'},[{id:'same'}])).toThrow('steer')
})
