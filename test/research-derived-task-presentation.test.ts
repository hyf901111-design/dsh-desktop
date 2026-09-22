import {it,expect} from 'vitest'
import {createRequire} from 'node:module'
import {derivedFixture} from './helpers/research-derived-fixture'
const {act}=createRequire(import.meta.url)('react')
it('shows real summary state and source count, with process details behind its toolbar action',async()=>{
 const f=await derivedFixture('generated-summary',2,{title:'总结提炼',generationStatus:'running',generationTaskId:'task-summary',width:320,height:220,generationStartedAt:Date.now()-2000,generationEvents:[{taskId:'task-summary',canvasNodeId:'derived',seq:1,type:'tool-started',tool:'资料核对',detail:'正在核对文件中的观点'}]})
 try{
  await act(async()=>expect(f.workspace.applyGenerationInspection('derived',{taskId:'task-summary',canvasNodeId:'derived',state:'running',lastSeq:1,events:[{taskId:'task-summary',canvasNodeId:'derived',seq:1,type:'tool-started',tool:'资料核对',detail:'正在核对文件中的观点'}]})).toBe(true))
  expect(f.host.querySelector('[data-research-derived-title]')?.textContent).toContain('正在提炼关键结论')
  expect(f.host.querySelector('[data-research-generation-sources]')?.textContent).toBe('基于所选 2 个组件')
  expect(f.host.querySelector('[data-research-generation-elapsed]')).not.toBeNull()
  const step=f.host.querySelector('button[aria-label="查看过程"]')
  expect(f.host.querySelector('[data-research-generation-description]')?.textContent).toContain('正在核对文件中的观点')
  await act(async()=>step!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
  expect(f.host.querySelector('[data-research-generation-records]')).not.toBeNull()
  expect(f.host.querySelector('[data-research-generation-row]')?.textContent).toContain('正在核对文件中的观点')
  expect(f.host.querySelector('[data-research-generation-elapsed]')).not.toBeNull()
  expect(f.workspace.getSnapshot().artifacts.find((n:any)=>n.id==='derived')).toMatchObject({width:320,height:220,sizeMode:'manual'})
  await act(async()=>f.host.querySelector('[data-research-generation-cancel]')!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
  expect(f.cancellations).toEqual([{parentSessionId:'text-final',taskId:'task-summary'}])
  expect(f.workspace.getSnapshot().artifacts.find((n:any)=>n.id==='derived').generationStatus).toBe('running')
 }finally{await f.cleanup()}
})
it('only shows completed status after the real inspection, and keeps source provenance',async()=>{
 const f=await derivedFixture('generated-summary',1,{title:'总结提炼',generationStatus:'queued',generationTaskId:'task-1',generationLastSeq:0})
 try{
  expect(f.host.querySelector('[data-research-generation-process] [role=status]')?.textContent).toBe('等待开始')
  await act(async()=>expect(f.workspace.applyGenerationInspection('derived',{taskId:'task-1',canvasNodeId:'derived',state:'completed',lastSeq:1,finalOutput:'# 现金流观察\n\n现金流与库存仍需核对。',events:[]})).toBe(true))
  expect(f.workspace.getSnapshot().artifacts.find((node:any)=>node.id==='derived').generationStatus).toBe('completed')
  expect(f.host.querySelector('[data-research-generation-process]')).toBeNull()
  expect(f.host.querySelector('[data-research-derived-title]')?.textContent).toContain('现金流观察 · 关键结论')
  expect(f.host.querySelector('[data-research-reference-node-id="source-0"]')).not.toBeNull()
 }finally{await f.cleanup()}
})
it('keeps renamed mind-map titles and presents the recorded detail level',async()=>{
 const f=await derivedFixture('generated-mind-map',1,{title:'用户自己命名',excerpt:'# 原始主题\n- 分支',generationDetail:'brief'})
 try{expect(f.host.querySelector('[data-research-derived-title]')?.textContent).toContain('用户自己命名');expect(f.host.querySelector('[data-research-derived-status]')?.textContent).toBe('简要')}finally{await f.cleanup()}
})
it('presents selection creation with source count and static waiting dots without inventing task progress',async()=>{
 const f=await derivedFixture('generated-container',2,{containerSpec:undefined,generationStatus:'queued',title:'基于所选创建'})
 try{
  expect(f.host.querySelector('[data-research-generation-sources]')?.textContent).toBe('来源：2 个组件')
  expect(f.host.querySelector('[data-research-generation-dots]')).not.toBeNull()
  expect(f.host.querySelector('[data-research-generation-process] [role=status]')?.textContent).toBe('等待开始')
  expect(f.host.textContent).not.toContain('正在比较两份资料')
  expect(f.host.querySelector('[data-research-generation-cancel]')).toBeNull()
 }finally{await f.cleanup()}
})
