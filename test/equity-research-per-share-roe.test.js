import {afterEach,describe,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {validatePacket} from '../skills/ework-equity-research/scripts/lib/index.mjs'

const temporary=[]
afterEach(async()=>{await Promise.all(temporary.splice(0).map(root=>rm(root,{recursive:true,force:true})))})
const digest=text=>createHash('sha256').update(text).digest('hex')
const codes=result=>result.diagnostics.map(item=>item.code)
async function fixture(metric,label,{unit,unitText,values,scope='合并'}={}){
 const root=await mkdtemp(join(tmpdir(),'research-share-roe-'));temporary.push(root)
 const roe=metric==='returnOnEquity',periods=metric==='netAssetsPerShare'?['2025-12-31','2026-06-30']:['FY2025','2026H1']
 unit??=roe?'percent':'CNY_per_share';unitText??=roe?'%':'元/股';values??=roe?['20.25','10.25']:['1.20','0.70']
 const text=`范围：${scope}\n指标\t单位\t${periods[0]}\t${periods[1]}\n${label}\t${unitText}\t${values[0]}\t${values[1]}`
 await writeFile(join(root,'source.tsv'),text)
 const fact={id:'reported',metric,period:periods[1],scope,unit,value:values[1],sourceId:'interim',evidence:{quote:text,locator:{lineStart:1,lineEnd:3,valueLine:3,column:4},metricText:label,periodText:periods[1],scopeText:scope,unitText,valueText:values[1]}}
 const packet={schemaVersion:1,synthetic:true,company:{name:'虚构量纲测试公司',ticker:'SYNTHETIC',currency:'CNY'},asOf:'2026-10-23',financialAsOf:'2026-06-30',sources:[{id:'interim',title:'纯虚构逐字段TSV测试',publisher:'测试生成器',kind:'text-snapshot',textFile:'source.tsv',sha256:digest(text),publishedAt:'2026-08-01',accessedAt:'2026-10-23'}],facts:[fact],calculations:[]}
 return{root,packet,fact,text,validate:()=>validatePacket(packet,{root})}
}

describe('strict source-backed EPS, per-share assets and ROE facts',()=>{
 it.each([
  ['basicEarningsPerShare','基本每股收益'],['basicEarningsPerShare','Basic earnings per share'],['basicEarningsPerShare','basicEarningsPerShare'],
  ['dilutedEarningsPerShare','稀释每股收益'],['dilutedEarningsPerShare','Diluted earnings per share'],['dilutedEarningsPerShare','dilutedEarningsPerShare'],
  ['netAssetsPerShare','每股净资产'],['netAssetsPerShare','Net assets per share'],['netAssetsPerShare','netAssetsPerShare'],
 ])('verifies %s via the actual %s TSV label and per-share unit',async(metric,label)=>{
  const f=await fixture(metric,label),result=await f.validate()
  expect(result.ok,result.diagnostics).toBe(true);expect(result.facts[0]).toMatchObject({status:'verified',normalizedValue:'0.7',normalizedUnit:'CNY_per_share'})
  expect(result.sources[0].integrity).toBe('verified')
 })
 it.each(['加权平均净资产收益率','净资产收益率','Return on equity','returnOnEquity'])('verifies the controlled ROE label %s with percentage normalization',async label=>{
  const f=await fixture('returnOnEquity',label),result=await f.validate()
  expect(result.ok,result.diagnostics).toBe(true);expect(result.facts[0]).toMatchObject({status:'verified',normalizedValue:'0.1025',normalizedUnit:'ratio'})
 })
 it('accepts a declared ROE ratio and checks its exact percentage source conversion',async()=>{
  const f=await fixture('returnOnEquity','加权平均净资产收益率');f.fact.unit='ratio';f.fact.value='0.1025'
  expect((await f.validate()).ok).toBe(true)
  const ratio=await fixture('returnOnEquity','净资产收益率',{unit:'ratio',unitText:'比例',values:['0.2025','0.1025']})
  expect((await ratio.validate()).ok).toBe(true)
 })
 it.each([
  ['basicEarningsPerShare','基本每股收益','CNY'],['basicEarningsPerShare','基本每股收益','percent'],
  ['dilutedEarningsPerShare','稀释每股收益','CNY_10K'],['dilutedEarningsPerShare','稀释每股收益','ratio'],
  ['netAssetsPerShare','每股净资产','CNY_100M'],['netAssetsPerShare','每股净资产','shares'],
  ['returnOnEquity','加权平均净资产收益率','CNY'],['returnOnEquity','加权平均净资产收益率','CNY_per_share'],['returnOnEquity','净资产收益率','shares'],
 ])('rejects %s declared using incompatible %s / %s dimensions',async(metric,label,unit)=>{
  const f=await fixture(metric,label);f.fact.unit=unit
  const result=await f.validate();expect(result.ok).toBe(false);expect(codes(result)).toContain('UNIT_MISMATCH')
 })
 it.each([
  ['wrong-period',f=>{f.fact.period='FY2025'},'PERIOD_MISMATCH'],
  ['stale-header',f=>{f.fact.period='FY2025';f.fact.evidence.periodText='FY2025'},'PERIOD_MISMATCH'],
  ['wrong-column',f=>{f.fact.evidence.locator.column=3},'CELL_MISMATCH'],
  ['wrong-scope',f=>{f.fact.scope='母公司';f.fact.evidence.scopeText='母公司'},'SCOPE_MISMATCH'],
  ['wrong-label',f=>{f.fact.metric='dilutedEarningsPerShare'},'METRIC_MISMATCH'],
 ])('preserves TSV period, scope, cell and metric binding: %s',async(_name,mutate,code)=>{
  const f=await fixture('basicEarningsPerShare','基本每股收益');mutate(f)
  const result=await f.validate();expect(result.ok).toBe(false);expect(codes(result)).toContain(code)
 })
 it('verifies a parent-company scope without silently promoting it to consolidated facts',async()=>{
  const f=await fixture('netAssetsPerShare','每股净资产',{scope:'母公司'}),result=await f.validate()
  expect(result.ok,result.diagnostics).toBe(true);expect(result.facts[0].scope).toBe('母公司')
 })
 it('does not accept the unweighted short ROE token embedded in the weighted label',async()=>{
  const f=await fixture('returnOnEquity','加权平均净资产收益率');f.fact.evidence.metricText='净资产收益率'
  const result=await f.validate();expect(result.ok).toBe(false);expect(codes(result)).toContain('METRIC_MISMATCH')
 })
 it('preserves row-unit precedence over a window unit and checks per-share source tokens',async()=>{
  const f=await fixture('basicEarningsPerShare','基本每股收益',{unitText:'元'})
  const text=f.text.replace('范围：合并\n','范围：合并\n单位：元/股\n')
  await writeFile(join(f.root,'source.tsv'),text);f.packet.sources[0].sha256=digest(text)
  f.fact.evidence.quote=text;f.fact.evidence.unitText='元/股';f.fact.evidence.locator={lineStart:1,lineEnd:4,valueLine:4,column:4}
  const result=await f.validate();expect(result.ok).toBe(false);expect(codes(result)).toContain('UNIT_MISMATCH')
 })
 it('keeps valuation multiples unsupported rather than treating them as percentages',async()=>{
  for(const metric of['priceToEarnings','priceToBook']){
   const f=await fixture(metric,'市盈率',{unit:'ratio',unitText:'倍'}),result=await f.validate()
   expect(result.ok).toBe(false);expect(codes(result)).toContain('FACT_SCHEMA')
  }
 })
})
