import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
import {runInNewContext,Script} from 'node:vm'
import {expect,it,vi} from 'vitest'
import {patchSkillCommandPopup,patchSkillCommandLabels} from '../scripts/lib/skill-command-menu.mjs'
const require=createRequire(import.meta.url)
it('accepts the exact production Node artwork installation and rejects modified or duplicate artwork blocks',()=>{
 const raw=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8')
 const installed=execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{patchSkillCommandPopup}from'./scripts/lib/skill-command-menu.mjs';const once=patchSkillCommandPopup(readFileSync(0,'utf8'));if(patchSkillCommandPopup(once)!==once)throw Error('Node two-pass changed bytes');process.stdout.write(once)"],{input:raw,encoding:'utf8',maxBuffer:8*1024*1024})
 // The existing expanded-menu helper reserializes under Vite; the artwork's
 // byte-exact definition and drift checks must still accept production Node.
 expect(()=>patchSkillCommandPopup(installed)).not.toThrow()
 expect(()=>patchSkillCommandPopup(installed.replace('"data-ework-skill-art": state.command','"data-ework-skill-art": "model"'))).toThrow('drifted')
 expect(()=>patchSkillCommandPopup(installed.replace('function PopupSelectView(', '/* ework:skill-command-artwork:definitions */\nfunction PopupSelectView('))).toThrow()
 expect(()=>new Script(installed)).not.toThrow()
})
function moduleOf(source){
 let descriptor
 runInNewContext(source,{window:{__ModuleLoader__:{load:value=>{descriptor=value}}},AbortController,console,setTimeout,clearTimeout})
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
 return descriptor.factory(id=>id.startsWith('react')?require(id):id==='@deepseek-ai/dsh-client-runtime/client'?{createSnapshotStore:initial=>{let value=initial;return {getSnapshot:()=>value,set:next=>{value=next},subscribe:()=>()=>{}}}}:fake)
}
it('uses the native popup scope to carry the exact slash span and retains model behavior',()=>{
 const source=patchSkillCommandPopup(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8'))
 expect(()=>new Script(source)).not.toThrow();expect(patchSkillCommandPopup(source)).toBe(source)
 const {CommandUiRuntime}=moduleOf(source),open=vi.fn(),scope={}
 const host={scopeFor:()=>scope,popupFor:()=>({open})},session={sessionId:'current'},segment={via:'menu',span:{start:0,end:4,draftRev:9}},ui={kind:'popupSelect'}
 CommandUiRuntime.prototype.openPopup.call(host,'skills',ui,session,segment)
 expect(open).toHaveBeenLastCalledWith('skills',ui,{...session,skillCommandSegment:segment},segment)
 CommandUiRuntime.prototype.openPopup.call(host,'model',ui,session,segment)
 expect(open).toHaveBeenLastCalledWith('model',ui,session,segment)
})
it('settles one skill choice through the real native controller, consumes only the original CAS span and closes',async()=>{
 const {PopupSelectController}=moduleOf(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8'))
 const consume=vi.fn(()=>false),focusComposer=vi.fn(),onSelect=vi.fn(async()=>{})
 const controller=new PopupSelectController({consume,focusComposer}),segment={via:'menu',span:{start:0,end:4,draftRev:2}}
 controller.open('skills',{options:async()=>[{id:'finance',label:'基础金融分析逻辑',detail:'完整研究方法'}],onSelect},{sessionId:'current'},segment)
 for(let i=0;i<5;i++)await Promise.resolve()
 await controller.select(0)
 expect(onSelect).toHaveBeenCalledExactlyOnceWith({id:'finance',label:'基础金融分析逻辑',detail:'完整研究方法'},{sessionId:'current'})
 expect(consume).toHaveBeenCalledExactlyOnceWith(segment)
 expect(controller.state.getSnapshot().open).toBe(false);expect(focusComposer).toHaveBeenCalledOnce()
})
it('keeps both locales and the native source syntactically valid',()=>{
 const source=patchSkillCommandLabels(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8'))
 expect(()=>new Script(source)).not.toThrow();expect(patchSkillCommandLabels(source)).toBe(source)
 expect(source).toContain('"command.skills.name":"技能"');expect(source).toContain('"command.skills.name":"Skills"')
})
it('does not reselect a slash command as catalogs settle, while retaining @ suggestion defaults',()=>{
 const source=patchSkillCommandLabels(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8'))
 const {InputTriggerController}=moduleOf(source)
 for(const trigger of ['/','@']){
  let state={open:true,hit:{trigger},generation:1,groups:[{source:'command',status:'pending',items:[]},{source:'skill',status:'pending',items:[]}],highlight:null}
  const controller=Object.create(InputTriggerController.prototype)
  controller.menu={getSnapshot:()=>state,set:next=>{state=next}};controller.launcher={getSnapshot:()=>null}
  controller.reduce({type:'source-settled',source:'command',generation:1,items:[{name:'compact'},{name:'model'}]})
  expect(state.highlight).toEqual(trigger==='/'?null:{source:'command',index:0})
  controller.reduce({type:'point',highlight:{source:'command',index:1}})
  expect(state.highlight).toEqual({source:'command',index:trigger==='/'?1:0})
  controller.reduce({type:'point',highlight:null})
  controller.reduce({type:'source-settled',source:'skill',generation:1,items:[{name:'finance'}]})
  expect(state.highlight).toEqual(trigger==='/'?null:{source:'command',index:0})
  controller.reduce({type:'source-failed',source:'skill',generation:1})
  expect(state.highlight).toEqual(trigger==='/'?null:{source:'command',index:0})
 }
})
it('retains Enter completion after the user types a slash-command search query',()=>{
 const source=patchSkillCommandLabels(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8'))
 const {InputTriggerController}=moduleOf(source)
 let state={open:true,hit:{trigger:'/',query:'mod'},generation:1,groups:[{source:'command',status:'pending',items:[]}],highlight:null}
 const controller=Object.create(InputTriggerController.prototype)
 controller.menu={getSnapshot:()=>state,set:next=>{state=next}};controller.launcher={getSnapshot:()=>null};controller.pick=vi.fn()
 controller.reduce({type:'source-settled',source:'command',generation:1,items:[{name:'model'}]})
 expect(state.highlight).toEqual({source:'command',index:0})
 expect(controller.arbitrate('enter',false)).toBe('pick-highlighted')
 expect(controller.pick).toHaveBeenCalledExactlyOnceWith('command',0)
})
it('shows the same command-only roster for typed slash and the launcher, including query edits',async()=>{
 const {InputTriggerController}=moduleOf(patchSkillCommandLabels(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')))
 const names=['compact','export','feedback','goal','permission','plan','model','skills']
 const sources=[{name:'command',candidates:async(_session,{query})=>names.filter(name=>name.includes(query)).map(name=>({name}))},{name:'skill',candidates:async()=>[{name:'finance'},{name:'ppt'}]}]
 const controller=new InputTriggerController({sessionId:'current',roster:{sources:()=>sources,all:()=>sources}})
 const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve()}
 const items=()=>controller.menu.getSnapshot().groups.flatMap(group=>group.items.map(item=>item.name))
 controller.toggleSource('command',{trigger:'/',query:'',position:'leading',span:{start:0,end:0,draftRev:1}})
 await settle();expect(items()).toEqual(names)
 controller.track('/',1,{tier:'plain'},2)
 await settle();expect(items()).toEqual(names)
 expect(controller.menu.getSnapshot().groups.map(group=>group.source)).toEqual(['command'])
 expect(controller.menu.getSnapshot().highlight).toBeNull()
 controller.track('/mod',4,{tier:'plain'},3)
 await settle();expect(items()).toEqual(['model'])
 controller.track('/',1,{tier:'plain'},4)
 await settle();expect(items()).toEqual(names)
 controller.track('@',1,{tier:'plain'},5)
 await settle();expect(items()).toEqual([...names,'finance','ppt'])
 controller.track('text /',6,{tier:'plain'},6)
 await settle();expect(items()).toEqual(names)
 controller.dispose()
})
