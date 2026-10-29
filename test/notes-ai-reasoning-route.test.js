import {expect,it,vi} from 'vitest'
import {generateNoteSuggestion} from '../packages/dsh-research-task-runtime/notes-ai.js'

const input={sessionId:'reasoning-route',requestId:'selected-effort',entryPoint:'inline',insertionAnchor:{documentId:'doc',blockId:'blank',position:{}},clientContext:{documentId:'doc'},title:'笔记',markdown:'',selection:'',prompt:'这一段文字',mode:'write'}

for(const recovery of [false,true]){
 it.each(['low','high','max',undefined])('uses the exact selected effort %s and keeps its request snapshot, recovery='+recovery,async effort=>{
  const current={provider:'selected-provider',model:'selected-model',...effort===undefined?{}:{reasoningEffort:effort}},calls=[],models=vi.fn(async()=>({result:{ok:true,value:{current,routable:true}}}))
  const ctx={apiProxy:{sessions:{models}},llm:{stream:async function*(options){
   calls.push(options)
   // A later selection must affect only a later request, including when this
   // request needs its one existing format recovery.
   current.provider='later-provider';current.model='later-model';current.reasoningEffort=effort==='low'?'max':'low'
   yield{type:'text-delta',text:recovery&&calls.length===1?'{"kind":"unknown"}':'{"kind":"text","markdown":"按本轮已选配置生成的正文"}'}
   yield{type:'finish',reason:{kind:'stop'}}
  }}}
  expect(await generateNoteSuggestion(ctx,input)).toEqual({kind:'text',markdown:'按本轮已选配置生成的正文'})
  expect(models).toHaveBeenCalledOnce();expect(calls).toHaveLength(recovery?2:1)
  for(const options of calls){
   expect(options).toMatchObject({provider:'selected-provider',model:'selected-model'});expect(options).not.toHaveProperty('effort')
   if(effort===undefined)expect(options).not.toHaveProperty('reasoningEffort');else expect(options.reasoningEffort).toBe(effort)
  }
  expect(calls.map(options=>options.purpose)).toEqual(recovery?['workspace-note','workspace-note-format-recovery']:['workspace-note'])
 })
}

it('does not treat an unrelated effort alias as a selected reasoningEffort',async()=>{
 let seen
 const ctx={apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'selected',model:'selected',effort:'max'},routable:true}}})}},llm:{stream:async function*(options){seen=options;yield{type:'text-delta',text:'{"kind":"text","markdown":"正常正文"}'};yield{type:'finish',reason:{kind:'stop'}}}}}
 await generateNoteSuggestion(ctx,input);expect(seen).not.toHaveProperty('reasoningEffort');expect(seen).not.toHaveProperty('effort')
})
