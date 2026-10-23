import {afterEach,describe,expect,it} from 'vitest'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {validatePacket} from '../skills/ework-equity-research/scripts/lib/index.mjs'
import {periodKey} from '../skills/ework-equity-research/scripts/lib/schema.mjs'

const temporary=[],company='示例股份有限公司',sha=bytes=>createHash('sha256').update(bytes).digest('hex')
afterEach(async()=>{await Promise.all(temporary.splice(0).map(path=>rm(path,{recursive:true,force:true})))})
function noteFixture({prior=false,pdf=true}={}){
 const lines=[company+'2026年半年度报告','七、合并财务报表项目注释','说明文字。','53/110',company+'2026年半年度报告','60、现金流量表补充资料','单位：元币种：人民币','补充资料\t本期金额\t上期金额','固定资产折旧、油气资产折耗、生产性生物资产折旧\t10\t8']
 const evidence={quote:lines.slice(4).join('\n'),locator:{lineStart:5,lineEnd:9,valueLine:9,column:prior?3:2,...pdf?{page:54}:{}},metricText:'固定资产折旧、油气资产折耗、生产性生物资产折旧',periodText:prior?'上期金额':'本期金额',scopeText:'合并',unitText:'元',valueText:prior?'8':'10',periodMapping:{kind:'report-current-prior',reportTitleLine:5,reportPeriodText:'2026年半年度报告',headerLine:8,role:prior?'prior':'current'},scopeContext:{quote:lines[1],locator:{lineStart:2,lineEnd:2,...pdf?{page:53}:{}},scopeText:'合并'}}
 const fact={id:'depreciation',metric:'depreciation',period:prior?'2025H1':'2026H1',scope:'合并',unit:'CNY',value:prior?'8':'10',sourceId:'report',evidence}
 return fixture(lines,fact,pdf?[{page:53,lineStart:1,lineEnd:4},{page:54,lineStart:5,lineEnd:9}]:null)
}
function sharesFixture(){
 const lines=[company+'2026年半年度报告','单位：股','\t本次变动前\t本次变动增减（+，-）\t本次变动后','数量\t比例(%)\t发行新股\t送股\t公积金转股\t其他\t小计\t数量\t比例(%)','三、股份总数\t12\t100\t\t\t\t-2\t-2\t10\t100']
 const fact={id:'shares-issued',metric:'shares',period:'2026-06-30',scope:company,unit:'shares',value:'10',sourceId:'report',evidence:{quote:lines.join('\n'),locator:{lineStart:1,lineEnd:5,valueLine:5,column:9,page:22},metricText:'股份总数',periodText:'本次变动后',scopeText:company,unitText:'股',valueText:'10',periodMapping:{kind:'share-capital-period-end',reportTitleLine:1,reportPeriodText:'2026年半年度报告',groupHeaderLine:3,subHeaderLine:4}}}
 const f=fixture(lines,fact,[{page:22,lineStart:1,lineEnd:5}]);f.packet.entityScopes=[company];return f
}
function fixture(lines,fact,pages){
 const packet={schemaVersion:2,synthetic:true,company:{name:company,ticker:'SYNTHETIC',currency:'CNY'},asOf:'2026-10-23',valuationAsOf:'2026-10-22',financialAsOf:'2026-06-30',sources:[{id:'report',title:'合成真实表头形状测试',publisher:company,kind:pages?'pdf-extract':'text-snapshot',textFile:'report.txt',publishedAt:'2026-08-01',accessedAt:'2026-10-23',...pages?{originalFile:'report.pdf',extraction:{method:'synthetic complete page fixture',pages}}:{}}],facts:[fact],calculations:[]}
 return{packet,lines,fact,refresh(){fact.evidence.quote=lines.slice(fact.evidence.locator.lineStart-1,fact.evidence.locator.lineEnd).join('\n')}}
}
async function validate(f){
 const root=await mkdtemp(join(tmpdir(),'fact-context-'));temporary.push(root)
 const text=f.lines.join('\n')+'\n',source=f.packet.sources[0];source.sha256=sha(text);await writeFile(join(root,'report.txt'),text)
 if(source.kind==='pdf-extract'){const bytes=Buffer.from('%PDF-1.4 synthetic original fixture');source.originalSha256=sha(bytes);await writeFile(join(root,'report.pdf'),bytes)}
 return validatePacket(f.packet,{root})
}
const errors=result=>result.diagnostics.filter(d=>d.severity==='error')

describe('real financial report context mappings',()=>{
 it.each([['2025年1—9月','2025Q3'],['2026年1-3月','2026Q1'],['2026年1至6月','2026H1'],['2025年1—12月','FY2025'],['2026年第一季度','2026Q1'],['2026年前三季度','2026Q3'],['2025年前三季度（1-9月）','2025Q3'],['2026年第一季度（1-3月）','2026Q1'],['2026年半年度报告','2026H1'],['2025年年度报告','FY2025'],['2025年中期','2025H1'],['2025年年度','FY2025']])('recognizes original financial period %s',(text,want)=>{expect(periodKey(text)).toBe(want)})
 it('maps a real current/prior header using the original report title, column and remote consolidated notes title',async()=>{const result=await validate(noteFixture());expect(errors(result)).toEqual([]);expect(result.facts[0].status).toBe('verified');expect(result.facts[0].period).toBe('2026H1')})
 it('maps the actual prior header to the same frequency in the preceding year',async()=>{const result=await validate(noteFixture({prior:true}));expect(errors(result)).toEqual([]);expect(result.facts[0].period).toBe('2025H1')})
 it.each([false,true])('maps controlled occurrence/current-prior aliases with prior=%s',async prior=>{const f=noteFixture({prior});f.lines[7]='补充资料\t本期发生额\t上年同期数';f.fact.evidence.periodText=prior?'上年同期数':'本期发生额';f.refresh();const result=await validate(f);expect(errors(result)).toEqual([]);expect(result.facts[0].period).toBe(prior?'2025H1':'2026H1')})
 it('rejects an occurrence alias assigned to the wrong current/prior role',async()=>{const f=noteFixture({prior:true});f.lines[7]='补充资料\t本期发生额\t上年同期数';f.fact.evidence.periodText='上年同期数';f.fact.evidence.periodMapping.role='current';f.refresh();const result=await validate(f);expect(errors(result).map(d=>d.code)).toContain('PERIOD_MAPPING')})
 it('verifies the final share quantity column while preserving the original percent neighbor and issuer scope',async()=>{const result=await validate(sharesFixture());expect(errors(result)).toEqual([]);expect(result.facts[0].normalizedValue).toBe('10');expect(result.facts[0].scope).toBe(company)})
 it.each([
  ['role contradicts literal column',f=>{f.fact.evidence.periodMapping.role='prior'},'PERIOD_MAPPING'],
  ['mapping reads another column',f=>{f.fact.evidence.periodMapping.headerLine=7},'PERIOD_MAPPING'],
  ['invented report period text',f=>{f.fact.evidence.periodMapping.reportPeriodText='2025年半年度报告'},'PERIOD_MAPPING'],
  ['a prose reference used as the report title',f=>{f.lines[4]='请参考2026年半年度报告'},'PERIOD_MAPPING'],
  ['unknown period mapping field',f=>{f.fact.evidence.periodMapping.sourceId='other'},'PERIOD_MAPPING'],
  ['unknown mapping kind',f=>{f.fact.evidence.periodMapping.kind='author-period-override'},'PERIOD_MAPPING'],
  ['scope context rewritten quote',f=>{f.fact.evidence.scopeContext.quote+='已核验'},'SCOPE_CONTEXT'],
  ['scope context from a different source',f=>{f.fact.evidence.scopeContext.sourceId='other'},'SCOPE_CONTEXT'],
  ['scope context claims a wrong PDF page',f=>{f.fact.evidence.scopeContext.locator.page=52},'SCOPE_CONTEXT_PAGE'],
  ['scope context jumps an omitted PDF page',f=>{f.packet.sources[0].extraction.pages[1].page=55;f.fact.evidence.locator.page=55},'SCOPE_CONTEXT_PAGE'],
  ['scope context jumps an unmapped source line',f=>{f.packet.sources[0].extraction.pages[0].lineEnd=3},'SCOPE_CONTEXT_PAGE'],
  ['real parent statement switches the notes scope',f=>{f.lines[3]='十六、母公司财务报表项目注释'},'SCOPE_CONTEXT'],
  ['context follows the target value',f=>{f.fact.evidence.scopeContext.locator.lineStart=9;f.fact.evidence.scopeContext.locator.lineEnd=9;f.fact.evidence.scopeContext.quote=f.lines[8]},'SCOPE_CONTEXT'],
  ['null scope context',f=>{f.fact.evidence.scopeContext=null},'SCOPE_CONTEXT'],
  ['unknown scope locator field',f=>{f.fact.evidence.scopeContext.locator.sourceId='other'},'SCOPE_CONTEXT'],
  ['duplicate PDF mapping for a scope page',f=>{f.packet.sources[0].extraction.pages.push({...f.packet.sources[0].extraction.pages[0]})},'SCOPE_CONTEXT_PAGE'],
  ['a scope title on the value row itself',f=>{f.lines[8]='母公司现金流量表 '+f.lines[8]},'SCOPE_CONTEXT'],
 ])('blocks %s',async(_name,mutate,code)=>{const f=noteFixture();mutate(f);f.refresh();const result=await validate(f);expect(result.ok).toBe(false);expect(errors(result).map(d=>d.code)).toContain(code)})
 it.each([
  ['before-change share quantity',f=>{f.fact.evidence.locator.column=2;f.fact.value='12';f.fact.evidence.valueText='12'}],
  ['final percentage instead of quantity',f=>{f.fact.evidence.locator.column=10;f.fact.value='100';f.fact.evidence.valueText='100'}],
  ['different report period end',f=>{f.fact.period='2026-12-31'}],
  ['non-share metric',f=>{f.fact.metric='sharesCancelled'}],
  ['subheader includes a fictitious leading label cell',f=>{f.lines[3]='项目\t'+f.lines[3]}],
  ['no independent share unit declaration',f=>{f.lines[1]='单位：万元'}],
 ])('blocks share mapping to %s',async(_name,mutate)=>{const f=sharesFixture();mutate(f);f.refresh();const result=await validate(f);expect(result.ok).toBe(false);expect(errors(result).map(d=>d.code)).toContain('PERIOD_MAPPING')})
 it('keeps a missing explicit scope blocked when scopeContext is absent',async()=>{const f=noteFixture();delete f.fact.evidence.scopeContext;const result=await validate(f);expect(errors(result).map(d=>d.code)).toContain('SCOPE_MISMATCH')})
 it('does not treat a repeated issuer report header as another financial statement scope',async()=>{const f=noteFixture();f.packet.entityScopes=[company];f.lines[4]=company+' 2026年半年度报告';f.refresh();const result=await validate(f);expect(errors(result)).toEqual([])})
 it('does not turn a financial table preparer company label into a second statement scope',async()=>{const f=noteFixture();f.packet.entityScopes=[company];f.lines[2]='编制单位：'+company;f.fact.evidence.locator.lineStart=1;delete f.fact.evidence.scopeContext;f.refresh();const result=await validate(f);expect(errors(result)).toEqual([])})
 it('maps original per-share dividend currency without inventing 元/股 in the quote',async()=>{
  const lines=['范围：合并','2026-06-01','A 股每股现金红利23.957元（含税）'],quote=lines.join('\n'),fact={id:'dividend',metric:'cashDividendPerShare',period:'2026-06-01',scope:'合并',unit:'CNY_per_share',value:'23.957',sourceId:'report',evidence:{quote,locator:{lineStart:1,lineEnd:3,valueLine:3},metricText:'每股现金红利',periodText:'2026-06-01',scopeText:'合并',unitText:'元',valueText:'23.957',unitMapping:{kind:'per-share-currency'}}}
  const result=await validate(fixture(lines,fact,null));expect(errors(result)).toEqual([]);expect(result.facts[0].normalizedUnit).toBe('CNY_per_share');expect(result.facts[0].evidence.quote).toBe(quote)
 })
 it('binds an issuer dividend notice split across the original title lines',async()=>{
  const lines=[company+'2025年中期','权益分派实施公告','A股每股现金红利23.957元（含税）','（一）发放年度：2025年中期'],fact={id:'dividend',metric:'cashDividendPerShare',period:'2025H1',scope:company,unit:'CNY_per_share',value:'23.957',sourceId:'report',evidence:{quote:lines.join('\n'),locator:{lineStart:1,lineEnd:4,valueLine:3},metricText:'每股现金红利',periodText:'2025年中期',scopeText:company,unitText:'元',valueText:'23.957',unitMapping:{kind:'per-share-currency'}}},f=fixture(lines,fact,null);f.packet.entityScopes=[company];const result=await validate(f);expect(errors(result)).toEqual([])
 })
 it.each([
  ['ordinary revenue',f=>{f.fact.metric='revenue';f.fact.evidence.metricText='营业收入';f.lines[2]='营业收入23.957元'}],
  ['current share price',f=>{f.fact.metric='currentPrice'}],
  ['a scaled currency unit',f=>{f.fact.evidence.unitText='万元';f.lines[2]='每股现金红利23.957万元'}],
  ['a missing per-share metric label',f=>{f.fact.evidence.metricText='现金红利';f.lines[2]='现金红利23.957元'}],
  ['an arbitrary mapping field',f=>{f.fact.evidence.unitMapping.multiplier='10000'}],
 ])('rejects per-share currency mapping for %s',async(_name,mutate)=>{
  const lines=['范围：合并','2026-06-01','每股现金红利23.957元'],fact={id:'dividend',metric:'cashDividendPerShare',period:'2026-06-01',scope:'合并',unit:'CNY_per_share',value:'23.957',sourceId:'report',evidence:{quote:lines.join('\n'),locator:{lineStart:1,lineEnd:3,valueLine:3},metricText:'每股现金红利',periodText:'2026-06-01',scopeText:'合并',unitText:'元',valueText:'23.957',unitMapping:{kind:'per-share-currency'}}},f=fixture(lines,fact,null);mutate(f);f.refresh();const result=await validate(f);expect(errors(result).map(d=>d.code)).toContain('UNIT_MAPPING')
 })
})
