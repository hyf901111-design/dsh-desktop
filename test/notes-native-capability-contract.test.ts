import {expect,it} from 'vitest'
import {createRequire} from 'node:module'
import {Session} from '@deepseek-ai/dsh-session'
import {createClientCapabilityHost} from '../packages/dsh-research-task-runtime/client-capability-host.js'
import {createNoteCapabilityHandlers} from '../src/main/notes/capability-handlers'
import type {ClientCapabilityContext} from '../packages/dsh-research-task-runtime/client-capabilities.js'
const {generateNoteSuggestion}=createRequire(import.meta.url)('../packages/dsh-research-task-runtime/notes-ai.js')

const context:ClientCapabilityContext={owner:'alice',sessionId:'current-note',documentId:'visible-editor',mode:'notes',editable:true,selectedBlockIds:[],selectedParagraphIds:['paragraph-one']}
const anchor={blockId:'paragraph-one',placement:'after'}
const operations=[
 {op:'insert',blocks:[{type:'table',content:{type:'tableContent',rows:[{cells:['','']}]}},{type:'paragraph',content:'新正文'}],anchor,consumeEmpty:true},
 {op:'update',blockId:'paragraph-two',block:{type:'bulletListItem',content:'更新的清单'}},
 {op:'move',blockIds:['paragraph-two'],anchor},
 {op:'remove',blockIds:['paragraph-three']}
]

function fixture(){
 let current:ClientCapabilityContext|undefined=context,writable=true
 const actions:Array<{action:string;args:any}>=[]
 const handlers=createNoteCapabilityHandlers({context,canWrite:()=>writable,requestContext:{},sourceInstruction:'编辑当前笔记',renderer:async(action,args)=>{
  actions.push({action,args})
  if(action==='notes.blocks.read')return {status:'succeeded',data:{revision:'snapshot-1',blocks:[{id:'paragraph-one',type:'paragraph',content:'保留正文'}]}}
  return {status:'succeeded',effect:{kind:'native-blocks',state:'saved',actionId:'native-action-one',changedBlockIds:['paragraph-two'],revision:'snapshot-2'}} as any
 }})
 const host=createClientCapabilityHost({current:()=>current,handlers})
 let sequence=0
 const execute=(capability:string,args:any,signal?:AbortSignal)=>host.executor.execute({requestId:'native-contract-'+(++sequence),capability,arguments:args} as any,context,signal)
 return {host,actions,execute,readOnly:()=>{writable=false},changeDocument:()=>{current={...context,documentId:'other-editor'}}}
}

it('exposes native reads in a read-only visible note while native writes require edit permission',()=>{
 const f=fixture(),ids=['notes.blocks.read','notes.blocks.apply','notes.blocks.undo']
 expect(f.host.registry.catalog(context).filter(entry=>ids.includes(entry.id)&&entry.available).map(entry=>entry.id)).toEqual(ids)
 expect(f.host.registry.catalog({...context,editable:false}).filter(entry=>ids.includes(entry.id)&&entry.available).map(entry=>entry.id)).toEqual(['notes.blocks.read'])
 expect(f.host.registry.catalog({...context,mode:'conversation'}).filter(entry=>ids.includes(entry.id)&&entry.available)).toEqual([])
})

it('routes native read, mixed apply and exact undo through the shared Notes handler and host receipts',async()=>{
 const f=fixture()
 expect(await f.execute('notes.blocks.read',{scope:'selected',ids:['paragraph-one']})).toMatchObject({status:'succeeded',data:{revision:'snapshot-1',blocks:[{id:'paragraph-one',content:'保留正文'}]}})
 const call:any={requestId:'same-native-action',capability:'notes.blocks.apply',arguments:{revision:'snapshot-1',operations}}
 expect(await f.host.executor.execute(call,context)).toMatchObject({status:'succeeded',effect:{kind:'native-blocks',state:'saved',actionId:'native-action-one',changedBlockIds:['paragraph-two'],revision:'snapshot-2'}})
 await f.host.executor.execute(call,context)
 expect(await f.execute('notes.blocks.undo',{revision:'snapshot-2',actionId:'native-action-one'})).toMatchObject({status:'succeeded',effect:{kind:'native-blocks',state:'saved'}})
 expect(f.actions).toEqual([
  {action:'notes.blocks.read',args:{scope:'selected',ids:['paragraph-one']}},
  {action:'notes.blocks.apply',args:{revision:'snapshot-1',operations,sourceInstruction:'编辑当前笔记'}},
  {action:'notes.blocks.undo',args:{revision:'snapshot-2',actionId:'native-action-one'}}
 ])
})

it.each([
 ['notes.blocks.read',{}],
 ['notes.blocks.read',{scope:'other'}],
 ['notes.blocks.read',{scope:'note',sessionId:'another-note'}],
 ['notes.blocks.read',{scope:'note',ids:['']}],
 ['notes.blocks.read',{scope:'note',ids:['same','same']}],
 ['notes.blocks.apply',{revision:'snapshot-1',operations,sourceInstruction:'model-cannot-override-human'}],
 ['notes.blocks.apply',{revision:'',operations}],
 ['notes.blocks.apply',{revision:'snapshot-1',operations:[]}],
 ['notes.blocks.apply',{revision:'snapshot-1',operations:[{op:'insert',blocks:[{type:'paragraph'}],anchor:{...anchor,sessionId:'another-note'}}]}],
 ['notes.blocks.apply',{revision:'snapshot-1',operations:[{op:'insert',blocks:[],anchor}]}],
 ['notes.blocks.apply',{revision:'snapshot-1',operations:[{op:'insert',blocks:[{type:'paragraph',html:'<script>not a block field</script>'}],anchor}]}],
 ['notes.blocks.apply',{revision:'snapshot-1',operations:[{op:'update',blockId:'paragraph-two',block:{}}]}],
 ['notes.blocks.apply',{revision:'snapshot-1',operations:[{op:'update',blockId:'paragraph-two',block:{id:'replace-identity',content:'new'}}]}],
 ['notes.blocks.apply',{revision:'snapshot-1',operations:[{op:'move',blockIds:[],anchor}]}],
 ['notes.blocks.apply',{revision:'snapshot-1',operations:[{op:'remove',blockIds:['same','same']}]}],
 ['notes.blocks.apply',{revision:'snapshot-1',operations:[{op:'replace',blockIds:['paragraph-two']}]}],
 ['notes.blocks.undo',{revision:'snapshot-2',actionId:''}],
 ['notes.blocks.undo',{revision:'snapshot-2',actionId:'a',scope:'note'}]
])('rejects malformed %s calls before the renderer receives a mutation',async(capability,args)=>{
 const f=fixture()
 expect(await f.execute(capability as string,args)).toMatchObject({status:'failed'})
 expect(f.actions).toEqual([])
})

it('allows bounded native content beyond the small action limit and rejects oversized batches',async()=>{
 const f=fixture(),args=(size:number)=>({revision:'snapshot-1',operations:[{op:'insert',blocks:[{type:'paragraph',content:'文'.repeat(size)}],anchor}]})
 expect(await f.execute('notes.blocks.apply',args(20000))).toMatchObject({status:'succeeded'})
 expect(await f.execute('notes.blocks.apply',args(500000))).toMatchObject({status:'failed'})
 expect(await f.execute('notes.blocks.apply',args(1500000))).toMatchObject({status:'failed'})
 expect(f.actions).toHaveLength(1)
})

it('rechecks current write permission after catalog capture without blocking native reads',async()=>{
 const f=fixture();f.readOnly()
 expect(await f.execute('notes.blocks.read',{scope:'note'})).toMatchObject({status:'succeeded'})
 expect(await f.execute('notes.blocks.apply',{revision:'snapshot-1',operations})).toMatchObject({status:'failed'})
 expect(await f.execute('notes.blocks.undo',{revision:'snapshot-2',actionId:'a'})).toMatchObject({status:'failed'})
 expect(f.actions.map(value=>value.action)).toEqual(['notes.blocks.read'])
})

it('does not dispatch native operations after document identity changes or caller cancellation',async()=>{
 const changed=fixture();changed.changeDocument()
 expect(await changed.execute('notes.blocks.read',{scope:'note'})).toMatchObject({status:'unavailable'})
 const cancelled=fixture(),controller=new AbortController();controller.abort()
 expect(await cancelled.execute('notes.blocks.apply',{revision:'snapshot-1',operations},controller.signal)).toMatchObject({status:'cancelled'})
 expect(changed.actions).toEqual([]);expect(cancelled.actions).toEqual([])
})

it('keeps component creation and editing schemas separate from native block batches',async()=>{
 const f=fixture()
 expect(await f.execute('notes.components.create',{prompt:'a component',operations})).toMatchObject({status:'failed'})
 expect(await f.execute('notes.components.apply',{blockId:'paragraph-two',revision:'snapshot-1',operations})).toMatchObject({status:'unavailable'})
 expect(f.actions).toEqual([])
})

it.each([false,true])('guides actual Notes generation toward native edits while retaining the existing operation wire format (inline=%s)',async inline=>{
 const session=Session.create('native-plan' as Parameters<typeof Session.create>[0]),seen:any[]=[],calls=[{requestId:'read-native-plan',capability:'notes.blocks.read',arguments:{scope:'note'}}]
 const ctx:any={sessions:{get:()=>session},sessionTitle:{rename:(value:any,title:string)=>{value.append('session/title',{title,source:{kind:'user'}});return{title}}},apiProxy:{sessions:{models:async()=>({result:{ok:true,value:{current:{provider:'test',model:'test'},routable:true}}})}},llm:{stream:async function*(request:any){
  seen.push(request)
  yield {type:'text-delta',text:JSON.stringify({kind:'capabilities',calls,wireToken:/wireToken=([a-f0-9-]+)/.exec(request.system)![1]})}
  yield {type:'finish',reason:{kind:'stop'}}
 }}}
 const f=fixture(),input:any={sessionId:session.id,requestId:'native-plan',title:'笔记',markdown:'现有正文',selection:'',prompt:'先把现有内容整理为可编辑表格和清单，再给出说明与交互行情组件。',mode:'write',clientContext:context,clientCapabilities:f.host.registry.catalog(context),context:{scope:'note',components:[]},...inline?{entryPoint:'inline',insertionAnchor:{documentId:context.documentId,blockId:'paragraph-one',position:{}}}:{}}
 expect(await generateNoteSuggestion(ctx,input)).toEqual({kind:'capabilities',calls})
 expect(seen).toHaveLength(1)
 expect(seen[0].system).toMatch(/普通[^。]*正文[^。]*表格[^。]*列表[^。]*代码[^。]*优先[^。]*notes\.blocks\.read[^。]*notes\.blocks\.apply/)
 expect(seen[0].system).toMatch(/(?:只有|仅)[^。]*交互[^。]*行情[^。]*特殊视觉[^。]*notes\.components\.create/)
 expect(seen[0].system).toContain('inlineOrder=before-components或after-components')
 expect(seen[0].system).toContain('wireToken=')
 const payload=JSON.parse(seen[0].messages[0].content[0].text)
 expect(payload.instruction).toBe('先把现有内容整理为可编辑表格和清单，再给出说明与交互行情组件。')
 expect(payload.clientCapabilities.find((entry:any)=>entry.id==='notes.blocks.apply')).toMatchObject({available:true})
})
