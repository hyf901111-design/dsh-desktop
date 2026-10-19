import {it,expect} from 'vitest'
import {JSDOM} from 'jsdom'
import {renderPriceVolume} from '../packages/dsh-research-task-runtime/market-price-volume.js'

const sample={layoutProfile:'openterminal',labels:Array.from({length:20},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`),prices:Array.from({length:20},(_,i)=>4+i/100),volumes:Array.from({length:20},(_,i)=>i===3?null:i*100),priceUnit:'CNY',volumeUnit:'手'}

it('uses a compact chart with an always available record pane, without duplicate full-range controls',()=>{
 const r=renderPriceVolume(sample),dom=new JSDOM(r.body+'<script>'+r.script+'</script>',{runScripts:'dangerously'}),d=dom.window.document
 try{
  expect(d.querySelector('.ot-price-volume-layout')).not.toBeNull()
  expect(d.querySelector('.ot-price-volume-records details')).toBeNull()
  expect(d.querySelectorAll('.ot-price-volume-records tbody tr')).toHaveLength(20)
  expect(d.querySelectorAll('[data-price-volume-range]')).toHaveLength(1)
  expect(d.querySelector('.ot-price-volume-records tbody tr').textContent).toContain('2026-10-20')
  const row=d.querySelector('[data-price-volume-index="3"]');row.click()
  expect(d.querySelector('svg').dataset.selectedIndex).toBe('3')
  expect(row.getAttribute('aria-selected')).toBe('true')
  expect(d.querySelector('.price-volume-readout').textContent).toContain('成交量 —')
  d.querySelector('svg').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true}))
  expect(d.querySelector('[data-price-volume-index="19"]').getAttribute('aria-selected')).toBe('true')
  expect(d.querySelectorAll('.price-volume-line')[0].getAttribute('points').split(' ')).toHaveLength(20)
  expect(d.querySelectorAll('.price-volume-bar')).toHaveLength(19)
 }finally{dom.window.close()}
})

it('keeps existing non-profile price-volume components and their complete expandable records intact',()=>{
 const r=renderPriceVolume({...sample,layoutProfile:undefined}),dom=new JSDOM(r.body)
 expect(dom.window.document.querySelector('.ot-price-volume-layout')).toBeNull()
 expect(dom.window.document.querySelectorAll('details tbody tr')).toHaveLength(20)
 expect(dom.window.document.querySelector('details').open).toBe(true)
 dom.window.close()
})

it('upgrades saved OpenTerminal cards without moving their existing controls or losing records',()=>{
 const r=renderPriceVolume({...sample,layoutProfile:undefined})
 const dom=new JSDOM('<body data-layout-profile="openterminal">'+r.body+'<script>'+r.script+'</script></body>',{runScripts:'dangerously'}),d=dom.window.document
 try{
  expect([...d.querySelector('.price-volume').children].map(el=>el.tagName)).toEqual(['DIV','DIV','svg','DIV','DETAILS'])
  expect(d.querySelector('.ot-price-volume-legacy')).not.toBeNull()
  expect(d.querySelector('details').open).toBe(true)
  expect(d.querySelectorAll('[data-price-volume-index]')).toHaveLength(20)
  expect([...d.querySelectorAll('[data-price-volume-range]')].filter(el=>!el.hidden)).toHaveLength(1)
  d.querySelector('[data-price-volume-index="0"]').click()
  expect(d.querySelector('svg').dataset.selectedIndex).toBe('0')
 }finally{dom.window.close()}
})
