import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { patchFigmaFinalCanvas } from '../scripts/lib/figma-canvas-client.mjs'
const requireModule=createRequire(import.meta.url), React=requireModule('react'), {createRoot}=requireModule('react-dom/client')
const source=patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
function handler(node:any,workspace:any) {
  const start=source.indexOf('onExpandGeneration:')+'onExpandGeneration:'.length
  expect(start).toBeGreaterThan('onExpandGeneration:'.length)
  let end=source.indexOf('{',start),depth=1;for(end++;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--}
  return new Function('node','workspace','return '+source.slice(start,end))(node,workspace)
}
function fixture(sizeMode='manual',width=420,height=288) {
  const node:any={id:'test',kind:'generated-container',width,height,sizeMode,title:'本地测试',generationStatus:'running',generationTaskId:'fixture-only',generationEvents:[]}
  let snapshot:any={artifacts:[node],viewport:{x:87,y:-34,scale:.87}}
  const updateNodeGeometry=vi.fn((id:string,geometry:any)=>{snapshot={...snapshot,artifacts:snapshot.artifacts.map((n:any)=>n.id===id?{...n,...geometry}:n)}})
  const workspace={getSnapshot:()=>snapshot,updateNodeGeometry}
  return{node,workspace,expand:handler(node,workspace),replace(next:any){snapshot={...snapshot,artifacts:next?[next]:[]}}}
}
const cleanups:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const done of cleanups.splice(0))await done();vi.unstubAllGlobals()})
it.each([[420,288],[320,220],[900,700]])('preserves manual %s x %s geometry and the canvas viewport', (width,height)=>{
  const f=fixture('manual',width,height),before=JSON.stringify(f.workspace.getSnapshot())
  f.expand();f.expand()
  expect(f.workspace.updateNodeGeometry).not.toHaveBeenCalled();expect(JSON.stringify(f.workspace.getSnapshot())).toBe(before)
})
it('uses the latest workspace state after a manual resize instead of a stale automatic render closure',()=>{
  const f=fixture('auto',320,220);f.replace({...f.node,width:480,height:300,sizeMode:'manual'})
  f.expand();expect(f.workspace.updateNodeGeometry).not.toHaveBeenCalled();expect(f.workspace.getSnapshot().artifacts[0]).toMatchObject({width:480,height:300,sizeMode:'manual'})
})
it.each(['generated-summary','pasted-text','assistant-result'])('keeps manual %s dimensions when the shared callback is used for content upgrades',kind=>{
  const f=fixture();f.node.kind=kind;f.expand();expect(f.workspace.updateNodeGeometry).not.toHaveBeenCalled()
})
it.each([[320,220],[656,220]])('keeps automatic preset growth %s x %s to L and does not repeat it', (width,height)=>{
  const f=fixture('auto',width,height),before=JSON.stringify(f.workspace.getSnapshot().viewport)
  f.expand();f.expand()
  expect(f.workspace.updateNodeGeometry).toHaveBeenCalledExactlyOnceWith('test',{width:656,height:456,sizeMode:'auto'})
  expect(JSON.stringify(f.workspace.getSnapshot().viewport)).toBe(before)
})
it('does not attempt a stale resize after the target is deleted',()=>{const f=fixture('auto',320,220);f.replace(null);f.expand();expect(f.workspace.updateNodeGeometry).not.toHaveBeenCalled()})
it('opens and closes real process details in a manually sized card without mutating task data or dimensions',async()=>{
  const w=new Window({url:'http://localhost/'});vi.stubGlobal('document',w.document);vi.stubGlobal('window',w);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
  const start=source.indexOf('function researchGenerationPresentation('),end=source.indexOf('function isResearchWechatArticleUrl(',start)
  const Process=new Function('react','react_jsx_runtime',source.slice(start,end)+'\nreturn ResearchGenerationProcess')(React,requireModule('react/jsx-runtime'))
  const f=fixture(),before=JSON.stringify(f.workspace.getSnapshot()),host=w.document.createElement('div');w.document.body.append(host);const root=createRoot(host)
  cleanups.push(async()=>{await React.act(async()=>root.unmount());await w.happyDOM.abort()})
  await React.act(async()=>root.render(React.createElement(Process,{node:f.node,onExpand:f.expand})))
  const button=host.querySelector('[data-research-generation-toggle]')!
  expect(button.textContent).toBe('查看过程')
  await React.act(async()=>button.dispatchEvent(new w.MouseEvent('click',{bubbles:true})))
  expect(button.textContent).toBe('收起过程');expect(button.getAttribute('aria-expanded')).toBe('true')
  await React.act(async()=>button.dispatchEvent(new w.MouseEvent('click',{bubbles:true})))
  expect(button.textContent).toBe('查看过程');expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(f.workspace.updateNodeGeometry).not.toHaveBeenCalled();expect(JSON.stringify(f.workspace.getSnapshot())).toBe(before)
})
it('refreshes the old callback and remains idempotent',()=>{expect(patchFigmaFinalCanvas(source)===source).toBe(true);expect(()=>new Function(source)).not.toThrow()})
it('fails closed if a later client changes the expansion callback shape',()=>{
  expect(()=>patchFigmaFinalCanvas(source.replace('onExpandGeneration:(requestedSize="large")=>{const current=','onExpandGeneration:(requestedSize="large")=>{const changed='))).toThrow(/generation expansion callback anchor missing/)
})
