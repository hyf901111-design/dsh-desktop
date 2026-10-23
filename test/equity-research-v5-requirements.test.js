import {it,expect} from 'vitest'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {reportCoverage} from '../skills/ework-equity-research/scripts/lib/quality.mjs'
it('does not equate ten supported headings with V5 model, price and quarterly completeness',async()=>{
 const packet=JSON.parse(await readFile(resolve('skills/ework-equity-research/examples/synthetic/packet.json'),'utf8'))
 packet.schemaVersion=2;packet.valuationAsOf=packet.asOf;packet.report.profile='full';packet.report.sections=['business','industry','performance','profitability','balance','cashflow','forecast','valuation','risks','monitoring'].map(kind=>({kind,status:'supported',title:kind,paragraphs:[{text:'基于披露事实。',refs:['revenue25']}]}))
 const coverage=reportCoverage(packet.report,packet,{dcf:null,market:null,quarterly:null})
 expect(coverage.hasGaps).toBe(true)
 expect(coverage.researchRequirements.complete).toBe(false)
 expect(coverage.researchRequirements.missing.map(x=>x.area)).toEqual(expect.arrayContaining(['dcf','market','quarterly']))
})

it('requires model and trend dates, prices and annual/interim revenue to agree',async()=>{
 const mod=await import('../skills/ework-equity-research/scripts/lib/alignment.mjs').catch(()=>null)
 expect(mod?.alignmentDiagnostics).toBeTypeOf('function')
 const packet={dcf:{baseFY:{end:'2025-12-31',revenueRef:'annual'},interim:{end:'2026-06-30',revenueRef:'h1'}},quarterly:{quarters:[{revenueRef:'q3',priorRevenueRef:'p3'},{revenueRef:'q4',priorRevenueRef:'p4'},{revenueRef:'q1',priorRevenueRef:'p1'},{revenueRef:'q2',priorRevenueRef:'p2'}]}}
 const facts=[['annual','FY2025','1000'],['h1','2026H1','500'],['q3','2025Q3','250'],['q4','2025Q4','250'],['q1','2026Q1','250'],['q2','2026Q2','250'],['p1','2025Q1','250'],['p2','2025Q2','250'],['p3','2024Q3','200'],['p4','2024Q4','200']].map(([id,period,normalizedValue])=>({id,period,normalizedValue,normalizedUnit:'CNY',metric:'revenue',scope:'合并',status:'verified'}))
 const c={dcf:{method:'driver-fcff-v2',status:'calculated',valuationAsOf:'2026-10-22',currentPrice:{value:'100'}},market:{status:'calculated',valuationAsOf:'2026-10-22',rows:[{stock:'100'}]},quarterly:{status:'calculated'},calculations:[]}
 expect(mod.alignmentDiagnostics(packet,{facts},c)).toEqual([])
 c.market.rows[0].stock='101';expect(mod.alignmentDiagnostics(packet,{facts},c).map(x=>x.code)).toContain('RESEARCH_ALIGNMENT');c.market.rows[0].stock='100'
 facts[0].normalizedValue='999';expect(mod.alignmentDiagnostics(packet,{facts},c).map(x=>x.path)).toContain('dcf.baseFY.revenueRef')
 facts[0].normalizedValue='1000';facts[1].normalizedValue='499';expect(mod.alignmentDiagnostics(packet,{facts},c).map(x=>x.path)).toContain('dcf.interim.revenueRef')
})
