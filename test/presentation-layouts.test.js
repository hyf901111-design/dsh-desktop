import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {it, expect} from 'vitest'
import layouts from '../packages/presentation-editor/overlay/efund-layouts.json'
import {applyMaster} from '../packages/presentation-editor/overlay/apply-layout'

it('ships each master with its original preview and usable native slots',()=>{
  expect(layouts.filter(l=>l.group==='v6')).toHaveLength(16)
  expect(layouts.filter(l=>l.group==='master')).toHaveLength(30)
  expect(new Set(layouts.map(l=>l.id)).size).toBe(46)
  for(const layout of layouts){
    const bytes=readFileSync(new URL('../packages/presentation-editor/layout-art/'+layout.art,import.meta.url))
    expect(bytes.toString('ascii',1,4)).toBe('PNG')
    expect(bytes.readUInt32BE(16)).toBe(1280)
    expect(createHash('sha256').update(bytes).digest('hex').slice(0,16)+'.png').toBe(layout.art)
    const slide=applyMaster(layout,'data:image/png;base64,test',{id:'page',elements:[]},960,9/16)
    expect(slide.elements.some(e=>e.odysseyLayoutSlot==='title')).toBe(true)
    expect(slide.elements.map(e=>e.odysseyLayoutSlot)).toEqual(layout.slots.map(s=>s.role))
    expect(slide.elements.every(e=>e.width>0&&e.height>0)).toBe(true)
  }
})

it('takes cover and content typography from the actual PowerPoint master', () => {
  const apply = id => applyMaster(layouts.find(layout => layout.id === id), 'art',
    { id: 'page', elements: [] }, 960, 9 / 16).elements[0]
  const cover = apply('v6-1'), content = apply('v6-4')
  expect(cover.content).toContain('#005096')
  expect(cover.content).toContain('font-size:37.33px')
  expect(content.content).toContain('#FFFFFF')
  expect(content.content).toContain('font-size:30.67px')
  expect(content.inset[0]).toBe(0)
  expect(content.fixedHeight).toBe(true)
})

it('preserves editable content, notes, chart figures and object identities on repeated layout changes',()=>{
  const page={id:'page',remark:'发言要点',elements:[
    {id:'master',type:'image',odysseyMaster:true,lock:true},
    {id:'title',type:'text',content:'<p>经营复盘</p>'},
    {id:'body',type:'text',content:'<p>保留 18%</p>',top:150},
    {id:'chart',type:'chart',data:{series:[[2380,2600,2960]]}},
    {id:'photo',type:'image',left:560,top:150,width:200,height:100}
  ]}
  const layout=layouts.find(l=>l.id==='v6-4')
  const updated=applyMaster(layout,'art',page,1000,9/16,'title')
  expect(updated.id).toBe('page')
  expect(updated.remark).toBe(page.remark)
  expect(updated.elements.map(e=>e.id)).toEqual(['title','body','chart','photo'])
  expect(updated.elements[0].content).toContain('经营复盘')
  expect(updated.elements[2].data).toEqual(page.elements[3].data)
  expect(updated.elements[3]).toEqual(page.elements[4])
  expect(applyMaster(layout,'art',updated,1000,9/16,'title')).toEqual(updated)
})
