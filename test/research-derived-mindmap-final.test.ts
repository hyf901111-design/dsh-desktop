import { it, expect } from 'vitest'
import { derivedFixture } from './helpers/research-derived-fixture'
import { createRequire } from 'node:module'
const {act}=createRequire(import.meta.url)('react')
const content='# 市场观察\n- 趋势与成交\n- 行业与资金\n- 风险与依据'
it.each(['light','dark'])('renders the %s derived hierarchy with neutral nodes instead of export colors',async(theme)=>{
 const f=await derivedFixture('generated-mind-map',1,{excerpt:content})
 try{
  f.browser.document.body.toggleAttribute('data-ds-dark-theme',theme==='dark')
  const nodes=Array.from(f.host.querySelectorAll('[data-research-mind-map-node]'))
  expect(nodes).toHaveLength(4)
  for(const node of nodes){const style=f.browser.getComputedStyle(node);expect(theme==='dark'?['rgb(52, 53, 56)','#343538']:['rgb(244, 245, 247)','#f4f5f7']).toContain(style.backgroundColor);expect(style.color).not.toBe('rgb(255, 255, 255)')}
  expect(f.host.querySelector('[data-research-mind-map-edges]')).not.toBeNull()
  expect(f.browser.getComputedStyle(f.host.querySelector('[data-research-derived-sources]')!).display).not.toBe('none')
 }finally{await f.cleanup()}
})
it('keeps original source line editing and full reader tree after a closed summary',async()=>{
 const source='# 核心主题\n'+Array.from({length:30},(_,i)=>'- 原始分支'+i).join('\n')
 const f=await derivedFixture('generated-mind-map',1,{excerpt:source,width:320,height:220})
 try{
  expect(f.host.querySelectorAll('[data-research-mind-map-node]').length).toBeLessThan(31)
  await act(async()=>f.host.querySelector('[data-research-container-expand]')!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
  expect(f.host.querySelectorAll('[data-research-mind-map-node]')).toHaveLength(31)
  const branch=Array.from(f.host.querySelectorAll('[data-research-mind-map-node]')).find(x=>x.textContent==='原始分支29')!
  await act(async()=>branch.dispatchEvent(new f.browser.MouseEvent('dblclick',{bubbles:true})))
  const editor=f.host.querySelector('textarea')!
  editor.value='保存最后一行'
  await act(async()=>editor.dispatchEvent(new f.browser.KeyboardEvent('keydown',{key:'Enter',bubbles:true})))
  expect(f.workspace.getSnapshot().artifacts.find((n:any)=>n.id==='derived').excerpt).toBe(source.replace('原始分支29','保存最后一行'))
  expect(f.workspace.getSnapshot().artifacts.find((n:any)=>n.id==='derived')).toMatchObject({width:320,height:220,sizeMode:'manual'})
 }finally{await f.cleanup()}
})
