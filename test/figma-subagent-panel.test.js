import { readFile } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { patchSubagentPanelRuntime, patchSubagentPanelRenderer, patchSubagentPanelConversation, patchSubagentPanelEntry } from '../scripts/lib/figma-subagent-panel.mjs'
const raw=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
const source=process.env.EWORK_TEST_ORIGINAL?raw:patchSubagentPanelRuntime(raw)
function method(name,next) {
  const start=source.indexOf(name+'('),end=source.indexOf(next,start)
  if(start<0||end<start)return undefined
  return new Function('return ({'+source.slice(start,end)+'})')()[name]
}
function manager() {
  const start=source.indexOf('var SessionManager = class'),end=source.indexOf('\n\t\t//#endregion',start)
  const Class=new Function('Notifier',source.slice(start,end)+'; return SessionManager') (class{notifyNow(){}})
  const value=Object.create(Class.prototype)
  Object.assign(value,{catalogs:new Map([['parent',{parentAvailable:false,entries:[{id:'child',kind:'child',mode:'one-shot'}]}]]),addresses:new Map(),panelCatalogs:new Map(),sessions:new Map([['child',{configureSubagent:vi.fn()}]]),selected:'parent',completedNotifications:new Set(),refreshSubagents:vi.fn(),notifier:{notifyNow:vi.fn()}})
  return value
}
it('retains a healthy direct-parent address without selecting the child and rejects diagnostic or changed modes',()=>{
  const m=manager(),address={parentSessionId:'parent',childSessionId:'child',mode:'one-shot'}
  expect(typeof m.retainSubagentAddress).toBe('function')
  m.retainSubagentAddress(address)
  expect(m.selected).toBe('parent')
  expect(m.sessions.get('child').configureSubagent).toHaveBeenCalledWith(address,false)
  expect(()=>m.retainSubagentAddress({...address,mode:'persistent'})).toThrow()
  expect(()=>m.retainSubagentAddress({...address,childSessionId:'missing'})).toThrow()
  m.selectSubagent(address)
  expect(m.selected).toBe('child') // the existing deliberate global navigation still works
})
it('keeps a real child session alive while panels use it and releases once per lease',()=>{
  const retain=method('retainSubagentPanel','\n\t\t\trootCtx;')
  expect(typeof retain).toBe('function')
  const session={open:vi.fn()},state={panelLeases:new Map(),manager:manager(),projectList:vi.fn(),resolve:()=>({session})}
  const address={parentSessionId:'parent',childSessionId:'child',mode:'one-shot'}
  const one=retain.call(state,address),two=retain.call(state,address)
  expect(state.panelLeases.get('child')).toBe(2)
  expect(state.manager.panelCatalogs.get('parent')).toBe(2)
  expect(state.manager.selected).toBe('parent')
  expect(session.open).toHaveBeenCalledTimes(2)
  one();one();expect(state.panelLeases.get('child')).toBe(1)
  two();expect(state.panelLeases.has('child')).toBe(false)
  expect(state.manager.panelCatalogs.size).toBe(0)
})
it('rolls back a lease when opening fails',()=>{
  const retain=method('retainSubagentPanel','\n\t\t\trootCtx;')
  expect(typeof retain).toBe('function')
  const state={panelLeases:new Map(),manager:manager(),projectList:vi.fn(),resolve:()=>{throw Error('failed')}}
  expect(()=>retain.call(state,{parentSessionId:'parent',childSessionId:'child',mode:'one-shot'})).toThrow('failed')
  expect(state.panelLeases.size).toBe(0)
})
it('scopes outlet content and descendant bindings to the requested eligible session',async()=>{
  const raw=await readFile('node_modules/@deepseek-ai/dsh-client-web-react/lib/index.js','utf8')
  const patched=process.env.EWORK_TEST_ORIGINAL?raw:patchSubagentPanelRenderer(raw)
  const a=patched.indexOf('function SlotOutlet('),b=patched.indexOf('/** Kind dispatch',a)
  const parent={sessionId:'parent'},child={sessionId:'child'},host={subscribe:()=>()=>{},getVersion:()=>0,locale:{},sessions:{provideInfoFor:id=>id==='child'?child:undefined}}
  const jsx=(type,props)=>({type,props}),BindingContext={Provider:'binding-provider'}
  const render=new Function('useHost','useSyncExternalStore','useLocaleRevision','jsx','ANCHOR_STYLE','renderOutletContent','useSessionMaybeProvideInfo','BindingContext',patched.slice(a,b)+';return SlotOutlet')(()=>host,()=>{},()=>{},jsx,{display:'contents'},(_h,_k,_o,_opts,info)=>({sessionId:info.sessionId}),()=>parent,BindingContext)
  const result=render({slotKey:'conversation.subagent.panel',ownerProps:{},opts:{sessionId:'child'}})
  expect(result.props.value).toBe(child)
  expect(result.props.children.props.children.sessionId).toBe('child')
  expect(render({slotKey:'conversation.subagent.panel',opts:{sessionId:'unknown'}})).toBeNull()
  expect(patchSubagentPanelRenderer(patched)).toBe(patched)
})
it('uses the real conversation registration, provides a closable sidebar tab and preserves fallback entry points',async()=>{
  for(const [pkg,file,patch] of [['dsh-client-runtime','client.js',patchSubagentPanelRuntime],['dsh-client-ui-conversation','client.js',patchSubagentPanelConversation],['dsh-client-ui-subagent','client.js',patchSubagentPanelEntry]]){
    const input=await readFile(`node_modules/@deepseek-ai/${pkg}/lib/${file}`,'utf8'),output=patch(input)
    expect(patch(output)).toBe(output)
    expect(()=>new Function(output)).not.toThrow()
  }
  const input=await readFile('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js','utf8'),output=patchSubagentPanelEntry(input,true)
  expect(()=>new Function(output)).not.toThrow()
  expect(patchSubagentPanelEntry(output,true)).toBe(output)
})
