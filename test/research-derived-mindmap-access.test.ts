import { expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { derivedFixture, source } from './helpers/research-derived-fixture'
const {act}=createRequire(import.meta.url)('react')

it('keeps source navigation available while preventing readonly mind-map editing before an editor opens',async()=>{
 const f=await derivedFixture('generated-mind-map',1,{excerpt:'# 只读主题\n- 原始分支'})
 try{
  f.setReadOnly()
  await act(async()=>f.workspace.updateSelection(['derived'],'replace'))
  const before=JSON.stringify(f.workspace.getSnapshot().artifacts)
  await act(async()=>f.host.querySelector('[data-research-mind-map-node]')!.dispatchEvent(new f.browser.MouseEvent('dblclick',{bubbles:true})))
  expect(f.host.querySelector('[data-research-mind-map-node-input]')).toBeNull()
  expect(f.host.querySelector('[data-research-derived-sources]')?.textContent).not.toContain('双击编辑节点')
  await act(async()=>f.host.querySelector('[data-research-reference-node-id="source-0"]')!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
  expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['source-0'])
  expect(JSON.stringify(f.workspace.getSnapshot().artifacts)).toBe(before)
 }finally{await f.cleanup()}
})
it('retains the real editable path for a private mind-map',async()=>{
 const f=await derivedFixture('generated-mind-map',1,{excerpt:'# 可编辑主题\n- 原始分支'})
 try{
  await act(async()=>f.host.querySelector('[data-research-mind-map-node]')!.dispatchEvent(new f.browser.MouseEvent('dblclick',{bubbles:true})))
  expect(f.host.querySelector('[data-research-mind-map-node-input]')).not.toBeNull()
 }finally{await f.cleanup()}
})
it('budgets the parallel root separately so small manual cards retain a relation and a 196px region fits three short branches',()=>{
 const begin=source.indexOf('function researchMindMapInitialBudget('),end=source.indexOf('\n}',begin)+2
 expect(begin,'production budget helper must be connected to ResearchMindMap').toBeGreaterThan(-1)
 const initial=new Function(source.slice(begin,end)+';return researchMindMapInitialBudget')()
 expect(initial(128)).toBeGreaterThanOrEqual(2)
 expect(initial(196)).toBeGreaterThanOrEqual(4)
 expect(source).toContain('researchMindMapInitialBudget(layout.height)')
})
it('measures initial SVG edges after the parent DOM ref is attached, even when no budget rerender is needed',()=>{
 const begin=source.indexOf('function ResearchMindMapConnections('),end=source.indexOf('function researchMindMapFitTree(',begin)
 const layouts:Array<()=>unknown>=[],effects:Array<()=>unknown>=[];let geometry:any
 const hooks={useState:(initial:any)=>{geometry=initial;return[initial,(update:any)=>{geometry=typeof update==='function'?update(geometry):update}]},useLayoutEffect:(callback:()=>unknown)=>layouts.push(callback),useEffect:(callback:()=>unknown)=>effects.push(callback)}
 const Component=new Function('react','react_jsx_runtime',source.slice(begin,end)+';return ResearchMindMapConnections')(hooks,{jsx:()=>null})
 const ref:any={current:null};Component({rootRef:ref,revision:'initial'})
 for(const effect of layouts)effect()
 const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height})
 const origin={getBoundingClientRect:()=>rect(10,40,30,20)},child={getBoundingClientRect:()=>rect(60,40,30,20)},branch={querySelector:()=>child,parentElement:{closest:()=>null}}
 ref.current={getBoundingClientRect:()=>rect(0,0,100,100),clientWidth:100,clientHeight:100,scrollLeft:0,scrollTop:0,ownerDocument:{defaultView:{}},querySelector:()=>origin,querySelectorAll:(selector:string)=>selector==='[data-research-mind-map-branch]'?[branch]:[origin,child]}
 for(const effect of effects)effect()
 expect(geometry.path).toBe('M40 50H50V50H60')
})
