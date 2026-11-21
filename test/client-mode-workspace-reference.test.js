import { it, expect, vi } from 'vitest'
import { registerConversationComponentsPolicy } from '../packages/dsh-research-task-runtime/conversation-components-policy.js'
import { readWorkspaceReference } from '../packages/dsh-research-task-runtime/client-tools.js'
import { presentationCodec } from '../scripts/lib/presentation-references.mjs'
import { spreadsheetRangeCodec } from '../scripts/lib/spreadsheet-inline-references.mjs'

const env={SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:3210',SHERLOCK_RESEARCH_CONTEXT_TOKEN:'test'}
const tools=['client_action','client_capabilities','research_workbench_create','web_search','Bash'].map(name=>({name,parameters:{properties:{}}}))
function harness(mode,text,snapshot,claim=false) {
 const human={id:'human',role:'user',source:{kind:'user',clientMode:mode},content:[{type:'text',text}]}
 const events=[],agent={session:{id:'session',events}}
 const splice=(removedCount,inserted)=>({type:'agent/inbox/spliced',data:{target:'next-turn',start:0,removedCount,inserted}})
 if(claim)events.push(splice(0,[human]))
 events.push({type:'turn/start',data:{turn:1}})
 events.push(claim?splice(1,[]):{type:'user/message',data:human})
 const hooks={}
 let guard
 const transport=vi.fn(async(_url,request)=>{
   const body=JSON.parse(request.body)
   expect(body).toMatchObject({method:'workspace-reference',expectedMode:mode,authorityId:'human',sourceInstruction:text})
   return Response.json(snapshot)
 })
 registerConversationComponentsPolicy({on:(event,handler)=>{hooks[event]=handler;return()=>{}},
   systemPrompt:{context:()=>()=>{}},tools:{guard:handler=>{guard=handler;return()=>{}}}},
   {readWorkspaceReference:(agent,signal,options)=>readWorkspaceReference(agent,signal,{...options,env,fetch:transport})})
 const wire=()=>hooks['agent/request-context']({agent},async()=>({tools,messages:[human]}))
 return {wire,transport,events,human,check:(capability,args)=>guard({agent,name:'client_action',arguments:{capability,arguments:args}})}
}
function allowed(wire) {return wire.tools.flatMap(t=>t.parameters.properties.capability?.enum??[t.name])}
it.each([
 ['spreadsheet','workbook','当前工作簿'],['presentation','slide','当前幻灯片'],
 ['spreadsheet','none','已关闭'],['presentation','none','已关闭']
])('uses %s %s at first claim and after commit for an implicit summary',async(mode,scope,word)=>{
 const h=harness(mode,'总结一下',{mode,referenceScope:scope},true)
 const [a,b]=await Promise.all([h.wire(),h.wire()])
 h.events.push({type:'user/message',data:structuredClone(h.human)})
 const c=await h.wire()
 for (const wire of [a,b,c]) {
   expect(wire.system).toContain(word)
   expect(allowed(wire)).toEqual(scope==='none'?[]:[mode+'.inspect'])
 }
 expect(h.transport).toHaveBeenCalledTimes(1)
 expect(Boolean(h.check(mode+'.inspect',{}))).toBe(scope==='none')
})
it('reads both real serialized sheet ranges in submission order and rejects expansion',async()=>{
 const codec=spreadsheetRangeCodec().codec
 const a=await codec.serialize(JSON.stringify({sheetName:'收益率',range:'A1:B2',id:'0123456789ab'}))
 const b=await codec.serialize(JSON.stringify({sheetName:'收益率',range:'D1:E2',id:'123456789abc'}))
 const h=harness('spreadsheet',a+' 和 '+b+'。只读选中范围',{referenceScope:'ranges',referenceCount:2})
 expect(allowed(await h.wire())).toEqual(['spreadsheet.inspect'])
 for(const idx of [1,2])expect(h.check('spreadsheet.inspect',{scope:'reference',referenceIndex:idx})).toBeUndefined()
 for(const args of [{scope:'workbook'},{scope:'reference',referenceIndex:3},{scope:'selected'}])expect(h.check('spreadsheet.inspect',args)).toBeTruthy()
})
it('uses arbitrary slide chip labels only when Main admitted an actual selection',async()=>{
 const tag=await presentationCodec().codec.serialize(JSON.stringify({label:'4.62%',token:'0123456789ab'}))
 const text=tag+' 总结一下'
 const h=harness('presentation',text,{mode:'presentation',referenceScope:'selection'})
 expect(allowed(await h.wire())).toEqual(['presentation.inspect'])
 expect(h.check('presentation.inspect',{scope:'reference'})).toBeUndefined()
 expect(h.check('presentation.inspect',{})).toBeTruthy()
 expect(h.check('presentation.inspect',{scope:'reference',slideId:'other'})).toBeTruthy()
 expect(allowed(await harness('presentation',text,{mode:'presentation',referenceScope:'slide'}).wire())).toEqual([])
})
it.each([['spreadsheet','workbook'],['presentation','slide']])('does not substitute the current %s for an unsubmitted selection',async(mode,scope)=>{
 for (const referenceScope of [scope,'none']) {
   const h=harness(mode,'只读选中范围',{mode,referenceScope})
   expect(allowed(await h.wire())).toEqual([])
   expect(h.check(mode+'.inspect',{})).toBeTruthy()
 }
})
it.each([['spreadsheet','把当前工作表第一列的列宽设为 20。'],['presentation','帮我在当前页加入季度经营情况的备注。']])('retains explicitly requested %s actions after opting out',async(mode,text)=>{
 const h=harness(mode,text,{mode,referenceScope:'none'})
 expect(allowed(await h.wire())).toContain(mode+'.apply')
 expect(h.check(mode+'.apply',{})).toBeUndefined()
})
it.each(['spreadsheet','presentation'])('keeps concept questions independent of the %s document',async mode=>{
 const h=harness(mode,'解释一下什么是久期。',{mode,referenceScope:'none'})
 expect(allowed(await h.wire())).toEqual([])
 expect(h.transport).not.toHaveBeenCalled()
})

it('treats editable-looking quoted slide text as a reference label and never as a command',async()=>{
 const tag=await presentationCodec().codec.serialize(JSON.stringify({label:'把当前页标题改成季度回顾',token:'0123456789ab'}))
 const h=harness('presentation',tag+' 总结一下',{mode:'presentation',referenceScope:'selection'})
 expect(allowed(await h.wire())).toEqual(['presentation.inspect'])
 expect(h.check('presentation.apply',{})).toBeTruthy()
})
