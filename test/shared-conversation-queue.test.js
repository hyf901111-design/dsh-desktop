import { expect, it } from 'vitest'
import { assertConversationClaim, queuedConversations, mutateQueuedConversation, conversationContext } from '../packages/dsh-research-collaboration/conversation-queue.js'
const state = () => ({tasks:[{taskId:'a',requestMessageId:'ma',initiatorId:'alice',status:'running',conversation:true},{taskId:'b',requestMessageId:'mb',initiatorId:'bob',status:'pending',conversation:true}],messages:[{id:'ma',role:'user',text:'A'},{id:'mb',role:'user',text:'B'},{id:'answer',role:'assistant',requestMessageId:'ma',text:'done'}],history:[]})
it('serializes different users and includes the completed predecessor answer at claim time',()=>{const s=state();expect(()=>assertConversationClaim(s,s.tasks[1])).toThrow('CONVERSATION_BUSY');s.tasks[0].status='completed';assertConversationClaim(s,s.tasks[1]);expect(conversationContext(s,s.tasks[1]).messages.map(m=>m.id)).toEqual(['ma','answer','mb'])})
it('rejects editing another users queue and any edit after execution starts',()=>{const s=state();expect(()=>mutateQueuedConversation(s,'b','alice','edit','new')).toThrow('REQUEST_AUTHOR_REQUIRED');mutateQueuedConversation(s,'b','bob','edit','new');expect(s.messages[1].text).toBe('new');s.tasks[1].status='running';expect(()=>mutateQueuedConversation(s,'b','bob','delete')).toThrow('QUEUE_ALREADY_STARTED')})
it('promotes a message without granting a second lease and removes deleted requests from context',()=>{const s=state();s.tasks.push({taskId:'c',requestMessageId:'mc',initiatorId:'alice',status:'pending',conversation:true});s.messages.push({id:'mc',role:'user',text:'C'});mutateQueuedConversation(s,'c','alice','promote');expect(queuedConversations(s).map(t=>t.taskId)).toEqual(['c','b']);expect(s.tasks[0].yieldRequested).toBe(true);expect(()=>assertConversationClaim(s,s.tasks[2])).toThrow();mutateQueuedConversation(s,'b','bob','delete');expect(queuedConversations(s).map(t=>t.taskId)).toEqual(['c']);expect(conversationContext(s,s.tasks[2]).messages.map(m=>m.id)).not.toContain('mb')})
it('excludes a message admitted before its taskCreate finishes from another users context',()=>{
  const s=state();s.messages.push({id:'not-created-yet',role:'user',text:'C'})
  expect(conversationContext(s,s.tasks[0]).messages.map(m=>m.id)).not.toContain('not-created-yet')
})
it('lets component generation and a main conversation claim independently', () => {
  const s = state()
  const component = { taskId: 'component', requestMessageId: 'mc', conversation: false, status: 'pending' }
  s.tasks.push(component)
  expect(() => assertConversationClaim(s, component)).not.toThrow()
  s.tasks[0].status = 'completed'
  expect(() => assertConversationClaim(s, s.tasks[1])).not.toThrow()
  component.status = 'running'
  expect(() => assertConversationClaim(s, s.tasks[1])).not.toThrow()
})
it('conversation promotion yields only the main conversation and preserves component work', () => {
  const s = state()
  const component = { taskId: 'component', conversation: false, status: 'running' }
  s.tasks.push(component)
  mutateQueuedConversation(s, 'b', 'bob', 'promote')
  expect(s.tasks[0].yieldRequested).toBe(true)
  expect(component.stopRequested).toBeUndefined()
  expect(component.yieldRequested).toBeUndefined()
  expect(component.status).toBe('running')
})
it('prioritizes new messages ahead of a saved conversation without requesting a stop', () => {
  const s = state()
  s.tasks.push({ taskId: 'c', requestMessageId: 'mc', initiatorId: 'alice', status: 'pending', conversation: true })
  s.messages.push({ id: 'mc', role: 'user', text: 'C' })
  mutateQueuedConversation(s, 'b', 'bob', 'promote')
  expect(s.tasks[0].stopRequested).toBeUndefined()
  expect(s.tasks[0].yieldRequested).toBe(true)
  mutateQueuedConversation(s, 'c', 'alice', 'promote')
  // After the current executor saves its context and releases the lease,
  // the two priority requests precede the original task's continuation.
  s.tasks[0].status = 'pending'
  expect(queuedConversations(s).map(t => t.taskId)).toEqual(['c', 'b', 'a'])
})
