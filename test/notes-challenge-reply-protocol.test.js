import {afterEach,expect,it,vi} from 'vitest'
import {generateNoteChallenge} from '../packages/dsh-research-task-runtime/notes-challenge-runtime.js'

const source='前句保持。20人报名，15人到场，到场率90%。后句保持。'
const replacement='20人报名，15人到场，到场率75%。'
const input={sessionId:'synthetic-reply',requestId:'synthetic-reply-1',action:'reply',level:2,title:'合成计算',blocks:[{id:'p',type:'paragraph',text:source}],thread:{blockId:'p',quote:'到场率90%',category:'contradiction',message:'15/20=75%。',messages:[{role:'user',text:'直接修改原文，只给正文。'}]}}
function fixture(outputs){
 const calls=[],ctx={apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{routable:true,current:{provider:'synthetic',model:'synthetic'}}}})}},llm:{resolveModelInfo:async()=>({}),stream:async function*(options){calls.push(options);yield{type:'text-delta',index:0,text:outputs[Math.min(calls.length-1,outputs.length-1)]};yield{type:'finish',reason:{kind:'stop'}}}}}
 return{ctx,calls}
}
afterEach(()=>vi.restoreAllMocks())
const valid=JSON.stringify({reply:{text:'计算为75%。',replacement}})

it.each(['{"reply":{}}','{"reply":{"text":"仅说明，未给正文。"}}','{"reply":{"text":9,"replacement":"错误"}}'])('repairs a reply envelope once using the same response contract: %s',async bad=>{
 vi.spyOn(console,'warn').mockImplementation(()=>{})
 const f=fixture([bad,valid]),result=await generateNoteChallenge(f.ctx,input)
 expect(result.reply).toEqual({text:'计算为75%。',replacement});expect(f.calls).toHaveLength(2)
 const payload=JSON.parse(f.calls[0].messages[0].content[0].text)
 expect(payload.responseSchema.properties.reply.required).toEqual(['text','replacement'])
 expect(payload.thread.replacementQuote).toBe('20人报名，15人到场，到场率90%。')
 expect(f.calls[1].system).toContain('reply-envelope');expect(f.calls[1].system).toContain('responseSchema')
 expect(f.calls[0].system).toContain('只给正文');expect(f.calls[0].system).toContain('replacement字段')
 expect(f.calls.every(c=>c.tools===undefined)).toBe(true)
})

it.each(['说明如下：\n```json\n'+valid+'\n```','```json\n'+valid+'\n```\n已完成。','{"reply":{"text":"不完整"}','正文直接写75%。'])('rejects malformed or mixed prose and regenerates without extracting a replacement: %s',async bad=>{
 vi.spyOn(console,'warn').mockImplementation(()=>{})
 const f=fixture([bad,'```json\n'+valid+'\n```']),result=await generateNoteChallenge(f.ctx,input)
 expect(result.reply.replacement).toBe(replacement);expect(f.calls).toHaveLength(2)
 expect(f.calls[1].system).toContain('json-invalid');expect(f.calls[1].system).not.toContain(bad)
})

it('shares the two-attempt allowance across JSON and reply schema errors without publishing plain prose',async()=>{
 vi.spyOn(console,'warn').mockImplementation(()=>{})
 for(const outputs of [['bad JSON','{"reply":{}}'],['{"reply":{}}','bad JSON'],['75%','75%']]){
  const f=fixture(outputs);await expect(generateNoteChallenge(f.ctx,input)).rejects.toThrow(/格式/u);expect(f.calls).toHaveLength(2)
 }
})

it('keeps ordinary discussion separate from rewriting and still sanitizes verified replacement bodies',async()=>{
 const f=fixture([JSON.stringify({reply:{text:'计算说明。',replacement:'不应直接写入。'}})])
 const result=await generateNoteChallenge(f.ctx,{...input,thread:{...input.thread,messages:[{role:'user',text:'请解释计算。'}]}})
 expect(result.reply).toEqual({text:'计算说明。'})
 const dirty=fixture([JSON.stringify({reply:{text:'核对提醒仅留在评论。',replacement:'20人报名，15人到场，到场率75%（待核实）。'}})])
 expect((await generateNoteChallenge(dirty.ctx,input)).reply.replacement).toBe(replacement)
})
