// @vitest-environment happy-dom
import {it,expect,vi} from 'vitest'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'
import {ResearchMarketNativeTable} from '../scripts/lib/research-market-native-table.mjs'

it('filters and sorts the actual native table while preserving exact values in row details',async()=>{
 const Component=new Function('react','react_jsx_runtime',`return (${ResearchMarketNativeTable.toString()})`)(React,jsx)
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host)
 const data={variant:'table',columns:['交易日','涨跌幅','成交额(亿元)'],rows:[['2026-09-24','-1.6339869281045791%','32.20888135'],['2026-09-23','0.1085069444444614%','29.87237086']].map(row=>row.map(text=>({text,tone:''})))}
 root.render(React.createElement(Component,{data}))
 await vi.waitFor(()=>expect(host.querySelectorAll('tbody tr')).toHaveLength(2))
 expect(host.querySelector('tbody').textContent).toContain('-1.63%32.21')
 expect(host.querySelector('td:nth-child(2)').title).toBe('-1.6339869281045791%')
 host.querySelector('tbody tr').click()
 await vi.waitFor(()=>expect(host.querySelector('[role=status]').textContent).toContain('32.20888135'))
 host.querySelectorAll('th button')[1].click();host.querySelectorAll('th button')[1].click()
 await vi.waitFor(()=>expect(host.querySelector('tbody tr').textContent).toContain('2026-09-23'))
 const input=host.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'09-24');input.dispatchEvent(new Event('input',{bubbles:true}))
 await vi.waitFor(()=>expect(host.querySelectorAll('tbody tr')).toHaveLength(1))
 root.render(React.createElement(Component,{data:structuredClone(data)}))
 await vi.waitFor(()=>expect(host.querySelector('input').value).toBe('09-24'))
 expect(host.querySelector('[role=status]').textContent).toContain('32.20888135')
 root.unmount();host.remove()
})
