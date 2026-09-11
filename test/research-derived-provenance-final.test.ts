import { it, expect } from 'vitest'
import { derivedFixture, source } from './helpers/research-derived-fixture'
import { createRequire } from 'node:module'
const { act }=createRequire(import.meta.url)('react')

it('locates a summary source in the unobscured canvas without jumping to its own message',async()=>{
 const f=await derivedFixture()
 try{
  const button=f.host.querySelector('[data-research-reference-node-id="source-0"]')
  expect(button).not.toBeNull()
  await act(async()=>button!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
  expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['source-0'])
  expect(f.workspace.getSnapshot().pendingMessageJump).toBeNull()
  expect(f.workspace.getSnapshot().viewport).toEqual({x:264,y:240,scale:1})
 }finally{await f.cleanup()}
})
it('lists frozen titles for multiple sources and reports a deleted source without changing the snapshot',async()=>{
 const f=await derivedFixture('generated-summary',2)
 try{
  await act(async()=>f.workspace.updateArtifactContent('source-0','新的正文不替换冻结内容'))
  const trigger=f.host.querySelector('[data-research-derived-sources] button')
  expect(trigger).not.toBeNull()
  await act(async()=>trigger!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
  const menu=f.browser.document.querySelector('[data-research-source-menu]')
  expect(menu?.textContent).toContain('冻结材料0')
  expect(menu?.textContent).toContain('冻结材料1')
  expect(menu?.textContent).not.toContain('新的正文')
  await act(async()=>f.workspace.removeNodes(['source-1']))
  const frozen=JSON.stringify(f.workspace.getSnapshot().artifacts.find((n:any)=>n.id==='derived').generationSources)
  await act(async()=>menu!.querySelector('[data-research-reference-node-id="source-1"]')!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
  expect(f.statuses).toContain('组件已删除或不可用')
  expect(JSON.stringify(f.workspace.getSnapshot().artifacts.find((n:any)=>n.id==='derived').generationSources)).toBe(frozen)
 }finally{await f.cleanup()}
})
it('retains source navigation in a read-only board and closes expanded reading before focusing',async()=>{
 const f=await derivedFixture('generated-mind-map',1,{excerpt:'# 中心主题\n- 真实分支'})
 try{
  f.setReadOnly();const frozen=JSON.stringify(f.workspace.getSnapshot().artifacts)
  await act(async()=>f.host.querySelector('[data-research-container-expand]')!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
  expect(f.host.querySelector('dialog')!.hasAttribute('open')).toBe(true)
  const reference=f.host.querySelector('[data-research-reference-node-id="source-0"]')
  expect(reference).not.toBeNull()
  await act(async()=>reference!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
  expect(f.host.querySelector('dialog')!.hasAttribute('open')).toBe(false)
  expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['source-0'])
  expect(JSON.stringify(f.workspace.getSnapshot().artifacts)).toBe(frozen)
 }finally{await f.cleanup()}
})
it('turns selection-created provenance titles into source links without enabling refresh',async()=>{
 const f=await derivedFixture('generated-container',2)
 try{
  await act(async()=>f.host.querySelector('[data-research-container-more]')!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
  const provenance=Array.from(f.host.querySelectorAll('button')).find(b=>b.textContent==='查看创建来源')
  expect(provenance).not.toBeUndefined()
  await act(async()=>provenance!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
  const link=f.host.querySelector('[data-research-create-provenance] [data-research-reference-node-id="source-1"]')
  expect(link).not.toBeNull()
  await act(async()=>link!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
  expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual(['source-1'])
  expect(f.host.querySelector('[data-research-container-refresh]')).toBeNull()
 }finally{await f.cleanup()}
})

it('reapplies source navigation without duplicating handlers or source UI',async()=>{
 const {patchFigmaFinalCanvas}=await import('../scripts/lib/figma-canvas-client.mjs');const {createHash}=await import('node:crypto');
 const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
 expect(hash(patchFigmaFinalCanvas(source))).toBe(hash(source));
})
