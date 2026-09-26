import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {applyTerminalPresentation,TERMINAL_PRESENTATION_CSS} from '../packages/dsh-research-task-runtime/terminal-presentation.js'
import {renderMarketArtifact} from '../packages/dsh-research-task-runtime/market-artifact.js'
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {refineCandlestickHtml} from '../packages/dsh-research-task-runtime/market-candlestick.js'
import {patchLegacyDashboardPreview} from '../scripts/lib/patch-research-board-client.mjs'
import {researchBentoLayout,researchMarketContentDimensions} from '../packages/dsh-research-task-runtime/bento-layout.js'

it('upgrades the owned presentation once while preserving custom HTML and saved data',()=>{
 const data={version:1,type:'market',variant:'metrics',title:'历史快照',asOf:'2026-09-25',items:[{label:'价格',value:'1.23'}]}
 const source=renderMarketArtifact(data).html
 const next=applyTerminalPresentation(source)
 expect(next).toContain('1.23')
 expect(applyTerminalPresentation(next)).toBe(next)
 expect(applyTerminalPresentation('<html><head></head><body><button>自定义</button></body></html>')).not.toContain('ODYSSEY_TERMINAL')
 const preview=buildResearchHtmlPreview(next,'历史快照','dark')
 expect(preview).toContain('@layer sherlock-terminal;@layer sherlock-component-defaults')
})

it('refreshes already installed preview definitions and saved v2 candle runtime without losing observations',()=>{
 const skeleton="function buildResearchHtmlPreview(html, title = '') {\n  const theme = initialTheme === 'dark' ? 'dark' : 'light';return `<html><body>${html}</body></html>`}"
 const patched=patchLegacyDashboardPreview(skeleton)
 const stale=patched.replace('ODYSSEY_TERMINAL_20260926','OLD_TERMINAL').replace('Math.max(146,canvas.clientHeight)','146')
 expect(patchLegacyDashboardPreview(stale)).toBe(patched)
 const candles=Array.from({length:22},(_,i)=>({date:'2026-09-'+(i+1),open:1,high:2,low:1,close:2,volume:100}))
 const source=renderMarketArtifact({version:1,type:'market',variant:'candlestick',title:'日线',asOf:'模拟',candles}).html
 const upgraded=refineCandlestickHtml(source.replace('Math.max(146,canvas.clientHeight)','146'))
 expect(upgraded).toContain('Math.max(146,canvas.clientHeight)')
 expect(upgraded).toContain(JSON.stringify(candles))
 expect(refineCandlestickHtml(upgraded)).toBe(upgraded)
})

it('sorts mixed numeric units, searches and selects source market rows',()=>{
 const browser=new Window(),d=browser.document
 const spec={version:1,type:'market',variant:'table',title:'规模',asOf:'模拟',columns:['名称','规模'],rows:[['甲','8亿'],['乙','5000万'],['丙','12亿']]}
 d.write(renderMarketArtifact(spec).html)
 browser.eval(d.querySelector('script').textContent)
 d.querySelector('[data-column="1"]').click()
 expect([...d.querySelectorAll('tbody tr')].map(row=>row.querySelector('td').textContent)).toEqual(['乙','甲','丙'])
 const input=d.querySelector('[data-market-search]');input.value='丙';input.dispatchEvent(new browser.Event('input'))
 expect(d.querySelector('[data-market-count]').textContent).toBe('1 / 3 项')
 expect(d.querySelector('.terminal-table-readout').textContent).toContain('12亿')
 expect(d.querySelectorAll('tbody tr')).toHaveLength(3)
 browser.happyDOM.abort()
})

it('keeps workbench rows in a stable two-column matrix and bounds long lists',()=>{
 const nodes=['metrics','candlestick','table','breadth','heatmap','trend'].map((variant,i)=>({id:String(i),kind:'generated-container',generationStatus:'completed',workbenchId:'board',workbenchIndex:i,sizeMode:'auto',containerSpec:{type:'html',html:`<body data-sherlock-market="${variant}" data-sherlock-design="21m-20260923-v1"></body>`}}))
 const result=researchBentoLayout(nodes,{width:900,height:760},new Map(),{fitColumns:true})
 expect(result.nodes.map(node=>node.x)).toEqual([0,668,0,668,0,668])
 for(let i=0;i<result.nodes.length;i+=2)expect(result.nodes[i].y).toBe(result.nodes[i+1].y)
 expect(result.nodes[2].y).toBe(364)
 expect(researchBentoLayout(result.nodes,{width:900,height:760},new Map(),{fitColumns:true})).toEqual(result)
 expect(researchMarketContentDimensions('table',{rows:Array(100).fill(['A',1])}).height).toBe(380)
 expect(TERMINAL_PRESENTATION_CSS).toContain('max-height:calc(100vh - 66px)')
})
