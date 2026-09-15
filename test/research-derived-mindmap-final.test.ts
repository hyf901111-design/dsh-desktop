import { it, expect } from 'vitest'
import { derivedFixture } from './helpers/research-derived-fixture'
import { createRequire } from 'node:module'
const {act}=createRequire(import.meta.url)('react')
const content='# 市场观察\n- 趋势与成交\n- 行业与资金\n- 风险与依据'
it.each(['light','dark'])('renders the %s derived hierarchy with blue rectangular hierarchy on a white canvas',async(theme)=>{
 const f=await derivedFixture('generated-mind-map',1,{excerpt:content})
 try{
  f.browser.document.body.toggleAttribute('data-ds-dark-theme',theme==='dark')
  const nodes=Array.from(f.host.querySelectorAll('[data-research-mind-map-node]'))
  expect(nodes).toHaveLength(4)
  for(const node of nodes){const style=f.browser.getComputedStyle(node);const depth=node.getAttribute('data-research-mind-map-depth');expect(style.backgroundColor).toBe(depth==='0'?'#00549e':depth==='1'?'#0088bd':'#1ab3d5');expect(['#fff','rgb(255, 255, 255)']).toContain(style.color);expect(style.borderRadius).toBe('0px')}
  expect(f.host.querySelector('[data-research-mind-map-edges]')).not.toBeNull()
  expect(f.host.querySelector('[data-research-derived-sources]')).not.toBeNull()
 }finally{await f.cleanup()}
})
it('keeps original source line editing and full reader tree after a closed summary',async()=>{
 const source='# 核心主题\n'+Array.from({length:30},(_,i)=>'- 原始分支'+i).join('\n')
 const f=await derivedFixture('generated-mind-map',1,{excerpt:source,width:320,height:220})
 try{
  expect(f.host.querySelectorAll('[data-research-mind-map-node]').length).toBeGreaterThan(0)
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
