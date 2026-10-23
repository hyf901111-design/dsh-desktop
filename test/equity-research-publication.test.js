import {describe,expect,it} from 'vitest'
import {publicationMetadata} from '../skills/ework-equity-research/scripts/lib/publication.mjs'

const packet=()=>({company:{name:'贵州茅台酒股份有限公司',ticker:'600519.SH'},asOf:'2026-10-23',financialAsOf:'2026-06-30',report:{profile:'full',publication:{companyShortName:'贵州茅台',reportType:'财报点评报告',industry:'食品饮料 / 白酒'}}})
describe('formal report publication metadata',()=>{
 it('keeps the opinion headline separate from the formal report name and shared file stem',()=>{
  const p=packet();p.report.title='现金回收与经营质量观察'
  expect(publicationMetadata(p)).toEqual({companyLabel:'贵州茅台',reportType:'财报点评报告',financialPeriodLabel:'2026中报',reportName:'贵州茅台（600519.SH）2026中报财报点评报告',fileStem:'贵州茅台（600519.SH）2026中报财报点评报告_2026-10-23'})
 })
 it.each([['2025-12-31','2025年报'],['2026-03-31','2026一季报'],['2026-06-30','2026中报'],['2026-09-30','2026三季报'],['2026-08-15','截至2026-08-15']])('labels the financial period %s without inventing a quarter', (date,label)=>{
  const p=packet();p.financialAsOf=date;expect(publicationMetadata(p).financialPeriodLabel).toBe(label)
 })
 it('defaults missing publication to company name and the truthful full/brief report category',()=>{
  const p=packet();delete p.report.publication;expect(publicationMetadata(p)).toMatchObject({companyLabel:p.company.name,reportType:'公司研究报告'})
  p.report.profile='brief';expect(publicationMetadata(p).reportType).toBe('公司研究简报')
  delete p.report.profile;expect(publicationMetadata(p).reportType).toBe('公司研究简报')
 })
 it('rejects malformed, unknown and active metadata with a controlled field error',()=>{
  for(const publication of[null,[],{other:'unknown'},{reportType:'买入推荐'},{reportType:null},{companyShortName:''},{companyShortName:'<b>公司</b>'},{industry:'行业\n注入'},{industry:'行'.repeat(81)}]){
   const p=packet();p.report.publication=publication;expect(()=>publicationMetadata(p)).toThrow(/report\.publication/)
  }
  const p=packet();p.financialAsOf='2026-02-31';expect(()=>publicationMetadata(p)).toThrow(/financialAsOf/)
 })
 it('makes deterministic safe NFC filenames within a portable UTF8 basename limit',()=>{
  const p=packet();delete p.report.publication;p.company.name='CON../公司:*?"<>|\\'+'研'.repeat(300);p.company.ticker='A/B:'+ 'T'.repeat(100)
  const result=publicationMetadata(p),again=publicationMetadata(p)
  expect(result.fileStem).toBe(again.fileStem);expect(result.fileStem).not.toMatch(/[<>:"/\\|?*\u0000-\u001f]/)
  expect(Buffer.byteLength(result.fileStem+'.html')).toBeLessThanOrEqual(240)
  expect(result.fileStem).toMatch(/公司研究报告_2026-10-23$/)
  const other=structuredClone(p);other.company.name+='异';expect(publicationMetadata(other).fileStem).not.toBe(result.fileStem)
  p.company.name='Cafe\u0301';expect(publicationMetadata(p).fileStem).toContain('Café')
 })
})
