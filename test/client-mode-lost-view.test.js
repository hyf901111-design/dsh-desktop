import { expect, it, vi } from 'vitest'
import { registerConversationComponentsPolicy } from '../packages/dsh-research-task-runtime/conversation-components-policy.js'
import { LOST_VIEW_GUIDANCE, VISIBLE_MODE_CHANGED } from '../packages/dsh-research-task-runtime/client-visible-binding.js'
import denied from './fixtures/presentation-view-lost-events.json'

const user = (id, mode='presentation') => ({id,role:'user',source:{kind:'user',clientMode:mode},content:[{type:'text',text:mode==='image'?'画一幅晨会封面。':'请添加一页演示文稿，然后按页码核对新增页。'}]})
const start = turn => ({type:'turn/start',data:{turn}})
function setup() {
  const human=user('owner'),session={id:'presentation-test',header:{},events:[start(22),{type:'user/message',data:human}]}
  const agent={session},hooks={},capability={name:'client_action',parameters:{type:'object',properties:{}}}
  const receipt={role:'user',source:{kind:'tool',callId:'prior-save'},content:[{type:'tool-result',toolCallId:'prior-save',content:[{type:'text',text:'{"saved":true,"page":5}'}]}]}
  const readWorkspaceReference=vi.fn(async()=>({scope:'slide',mode:'presentation'}))
  registerConversationComponentsPolicy({systemPrompt:{context:()=>()=>{}},tools:{guard:fn=>{hooks.guard=fn;return()=>{}}},on:(name,fn)=>{hooks[name]=fn;return()=>{}}},{readWorkspaceReference})
  const next=()=>hooks['agent/request-context']({agent},async()=>({
    tools:[capability,{name:'client_capabilities'},{name:'image_generate'}],
    messages:[session.events.findLast(e=>e.type==='user/message').data,receipt]}))
  return {session,next,receipt,readWorkspaceReference,guard:()=>hooks.guard({agent,name:'client_action',arguments:{capability:'presentation.inspect'}})}
}
it('closes the visible capability after the actual presentation denial and lets a new turn use its own view',async()=>{
 const s=setup()
 expect((await s.next()).tools.map(x=>x.name)).toEqual(['client_action'])
 s.session.events.push(...denied)
 const closed=await s.next()
 expect(closed.tools).toEqual([])
 expect(closed.system).toContain(LOST_VIEW_GUIDANCE)
 expect(closed.messages.at(-1)).toBe(s.receipt)
 expect(s.guard()).toBe(LOST_VIEW_GUIDANCE)
 expect(s.readWorkspaceReference).toHaveBeenCalledTimes(1)
 s.session.events.push({type:'turn/end',data:{turn:22}},start(23),{type:'user/message',data:user('next','image')})
 expect((await s.next()).tools.map(t=>t.name)).toEqual(['image_generate'])
})
it('scopes delayed results to the same admitted user, turn and real failed capability',async()=>{
 for(const variant of ['changed-human','other-tool','other-turn','unmatched-id','non-error','ordinary-error','quoted-by-user']){
  const s=setup(),[call,result]=structuredClone(denied),block=result.data.message.content[0]
  if(variant==='other-tool')call.data.name='web_fetch'
  if(variant==='other-turn')result.data.turn=20
  if(variant==='unmatched-id')result.data.message.source.callId='different'
  if(variant==='non-error')block.isError=false
  if(variant==='ordinary-error')block.content[0].text='Error: 工作簿版本已变化，请重新读取。'
  s.session.events.push(call)
  if(variant==='changed-human')s.session.events.push({type:'user/message',data:user('replacement')})
  if(variant==='quoted-by-user')s.session.events[1].data.content[0].text+=' '+block.content[0].text
  else s.session.events.push(result)
  expect((await s.next()).tools.map(t=>t.name),variant).toContain('client_action')
 }
 const s=setup(),[call,result]=structuredClone(denied)
 result.data.message.content[0].content[0].text='Error: '+VISIBLE_MODE_CHANGED
 s.session.events.push(call,result)
 expect((await s.next()).tools).toEqual([])
})
