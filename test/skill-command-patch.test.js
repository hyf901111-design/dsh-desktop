import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext,Script} from 'node:vm'
import {expect,it,vi} from 'vitest'
import {patchSkillCommandPopup,patchSkillCommandLabels} from '../scripts/lib/skill-command-menu.mjs'
const require=createRequire(import.meta.url)
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
