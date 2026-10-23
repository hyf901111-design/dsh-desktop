import {describe,it,expect} from 'vitest'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
import {createMarketFixture} from './fixtures/equity-research-market.fixture.mjs'
import {validatePacket,calculatePacket} from '../skills/ework-equity-research/scripts/lib/index.mjs'
async function run(change=()=>{}){const f=await createMarketFixture();change(f);const root=await mkdtemp(join(tmpdir(),'equity-v5-market-'));try{await writeFile(join(root,'market.txt'),f.text);const v=await validatePacket(f.packet,{root});return {p:f.packet,v,c:calculatePacket(f.packet,v)}}finally{await rm(root,{recursive:true,force:true})}}
describe('V5 one-year prices and latest four disclosed quarters',()=>{
 it('derives same-window normalized prices and distinguishes percentage points from relative return',async()=>{const {p,v,c}=await run();expect(v.ok).toBe(true);expect(c.ok).toBe(true);expect(c.market.status).toBe('calculated');expect(c.market.rows).toHaveLength(p.market.rows.length);expect(c.market.rows[0].stockNormalized100).toBe('100');expect(Number(c.market.stockReturn)).toBeCloseTo(261/101,12);expect(Number(c.market.benchmarkReturn)).toBeCloseTo(522/1002,12);expect(Number(c.market.excessPercentagePoints)).toBeCloseTo((261/101-522/1002)*100,10);expect(c.market.coverage.fullYear).toBe(true);expect(c.market.monthly.length).toBeGreaterThanOrEqual(12)})
 it('requires exact source binding and a real one-year common trading calendar',async()=>{for(const mutate of [f=>f.packet.market.rows.splice(20,1),f=>f.packet.market.rows.reverse(),f=>f.packet.market.rows[1].date=f.packet.market.rows[0].date,f=>f.packet.market.rows[0].stockRef='missing',f=>f.packet.market.priceBasis='total-return',f=>f.packet.market.rows[0].manualPrice='99']){const {c}=await run(mutate);expect(c.ok).toBe(false);expect(c.market?.status).not.toBe('calculated')}})
 it('rejects intraday, wrong-security, stale-end and incomplete calendar claims',async()=>{for(const mutate of [f=>f.packet.facts[0].marketSession='intraday',f=>f.packet.facts[0].securityId='OTHER',f=>f.packet.market.valuationAsOf='2026-10-21',f=>f.packet.market.completeness.expectedDates.pop()]){const {c}=await run(mutate);expect(c.ok).toBe(false)}})
 it('produces four consecutive actual quarters with same-quarter YoY',async()=>{const {c}=await run();expect(c.quarterly.status).toBe('calculated');expect(c.quarterly.quarters.map(q=>q.period)).toEqual(['2025Q3','2025Q4','2026Q1','2026Q2']);expect(c.quarterly.quarters[0].revenue).toBe('1400');expect(c.quarterly.quarters[0].revenueYoY).toBe('0.4')})
 it('does not accept cumulative quarter, gap, wrong prior quarter or unverified disclosure search',async()=>{for(const mutate of [f=>f.packet.facts.find(x=>x.id==='q2025Q3-revenue').periodBasis='cumulative',f=>f.packet.quarterly.quarters.splice(1,1),f=>f.packet.quarterly.quarters[0].priorRevenueRef='q2025Q1-revenue',f=>f.packet.quarterly.disclosureSearch.refs=['missing']]){const {c}=await run(mutate);expect(c.ok).toBe(false);expect(c.quarterly?.status).not.toBe('calculated')}})
 it('derives Q2/Q3/Q4 only from verified cumulative adjacent cutoffs, keeping ordinary difference strict',async()=>{const f=await createMarketFixture();f.packet.market=undefined;f.packet.quarterly=undefined;f.fact('rQ1','revenue','2026Q1','100',{periodBasis:'cumulative'});f.fact('rH1','revenue','2026H1','230');f.fact('r9m','revenue','2026Q3','360',{periodBasis:'cumulative'});f.fact('rFY','revenue','FY2026','510');f.packet.asOf='2027-04-01';f.packet.valuationAsOf=f.packet.asOf;f.packet.financialAsOf='2026-12-31';f.packet.calculations=[{id:'q2',op:'quarterFromCumulative',inputs:['rH1','rQ1']},{id:'q3',op:'quarterFromCumulative',inputs:['r9m','rH1']},{id:'q4',op:'quarterFromCumulative',inputs:['rFY','r9m']}];f.text=f.lines.join('\n')+'\n';f.packet.sources[0].sha256=createHash('sha256').update(f.text).digest('hex');const root=await mkdtemp(join(tmpdir(),'v5-quarter-'));try{await writeFile(join(root,'market.txt'),f.text);const v=await validatePacket(f.packet,{root}),c=calculatePacket(f.packet,v);expect(c.ok).toBe(true);expect(c.calculations.map(x=>[x.period,x.metric,x.value])).toEqual([['2026Q2','revenue','130'],['2026Q3','revenue','130'],['2026Q4','revenue','150']]);f.packet.calculations[0].op='difference';const v2=await validatePacket(f.packet,{root});expect(calculatePacket(f.packet,v2).diagnostics.map(d=>d.code)).toContain('CALC_PERIOD')}finally{await rm(root,{recursive:true,force:true})}})
})

function rewriteSource(f,from,to){
 f.text=f.text.replaceAll(from,to)
 for(const x of f.packet.facts)x.evidence.quote=x.evidence.quote.replaceAll(from,to)
 for(const o of f.packet.observations)o.quote=o.quote.replaceAll(from,to)
 f.packet.sources[0].sha256=createHash('sha256').update(f.text).digest('hex')
}
it('does not hide missing days by removing them from both row and expected-date declarations',async()=>{
 const {c}=await run(f=>{f.packet.market.rows.splice(20,20);f.packet.market.completeness.expectedDates.splice(20,20)})
 expect(c.market.status).toBe('blocked');expect(c.diagnostics.map(x=>x.code)).toContain('MARKET_CALENDAR')
})
it('resolves raw versus adjusted prices from the selected original basis, including a legal unadjusted label',async()=>{
 const raw=await run(f=>rewriteSource(f,'收盘价','未复权收盘价'));expect(raw.v.ok).toBe(true);expect(raw.c.market.status).toBe('calculated')
 const adjusted=await run(f=>rewriteSource(f,'收盘价','前复权收盘价'));expect(adjusted.v.ok).toBe(true);expect(adjusted.c.market.status).toBe('blocked');expect(adjusted.c.diagnostics.map(x=>x.code)).toContain('MARKET_BASIS')
})
it('rejects an original cumulative metric relabelled as standalone while allowing cumulative neighbouring columns',async()=>{
 const bad=await run(f=>rewriteSource(f,'营业收入','营业收入（本年累计）'));expect(bad.v.ok).toBe(true);expect(bad.c.quarterly.status).toBe('blocked')
 const good=await run(f=>{const x=f.packet.facts.find(x=>x.id==='q2025Q3-revenue'),old=x.evidence.quote,newQuote=old.replace('指标\t2025Q3','指标\t2025Q3\t2025Q3 本年累计').replace('营业收入\t1400','营业收入\t1400\t9000');f.text=f.text.replace(old,newQuote);x.evidence.quote=newQuote;f.packet.sources[0].sha256=createHash('sha256').update(f.text).digest('hex')})
 expect(good.v.ok).toBe(true);expect(good.c.quarterly.status).toBe('calculated')
})
it('requires real close timestamps and prevents author facts from shadowing model result tokens',async()=>{
 const malformed=await run(f=>f.packet.facts[0].asOf=f.packet.market.rows[0].date+'NOTATIME');expect(malformed.c.market.status).toBe('blocked')
 const shadow=await run(f=>f.packet.facts[0].id='market.stockReturn');expect(shadow.v.diagnostics.map(x=>x.code)).toContain('FACT_SCHEMA')
})
it('rejects unknown v2 calculation metadata instead of laundering a quarterly period basis',async()=>{
 const {c}=await run(f=>f.packet.calculations=[{id:'bad-cumulative',op:'sum',inputs:['q2025Q3-revenue','q2025Q3-revenue'],periodBasis:'cumulative'}])
 expect(c.diagnostics.map(x=>x.code)).toContain('CALC_SCHEMA')
})
