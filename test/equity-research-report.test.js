import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validatePacket, calculatePacket } from '../skills/ework-equity-research/scripts/lib/index.mjs'
import { renderReport, validateReport } from '../skills/ework-equity-research/scripts/lib/report.mjs'

const fixture = () => {
 const facts=[{id:'rev',metric:'revenue',period:'FY2025',scope:'合并',unit:'CNY',value:'168838102514.79',normalizedValue:'168838102514.79',normalizedUnit:'CNY',sourceId:'annual',status:'verified',evidence:{locator:{page:6,lineStart:1,lineEnd:2}}}]
 return {packet:{schemaVersion:1,synthetic:true,company:{name:'虚构研究公司',ticker:'SYNTHETIC',currency:'CNY'},asOf:'2026-10-23',financialAsOf:'2025-12-31',sources:[{id:'annual',title:'虚构年度资料',publisher:'示例',kind:'text-snapshot',textFile:'source.txt',publishedAt:'2026-04-17',accessedAt:'2026-10-23',url:'https://example.com/report'}],facts,report:{title:'增长质量研究',summary:[{text:'营业收入 {{rev|yi}}，增长 {{growth|pct}}。',refs:['rev','growth']}],sections:[{title:'盈利质量',paragraphs:[{text:'需要观察收入与利润能否共同改善。',refs:['rev']}]}]}},validation:{ok:true,facts,sources:[{id:'annual',integrity:'verified',authenticity:'unverified'}],diagnostics:[]},calculation:{ok:true,calculations:[{id:'growth',status:'calculated',op:'yoy',inputs:['rev'],value:'0.123456789012345678',unit:'ratio'}],diagnostics:[]}}
}
describe('equity report output contract',()=>{
 it('renders the actual DCF engine contract, including per-share values, assumptions and value bridge',async()=>{
  const root=resolve('skills/ework-equity-research/examples/synthetic')
  const packet=JSON.parse(await readFile(root+'/packet.json','utf8'))
  const evidence=await validatePacket(packet,{root}), calculation=calculatePacket(packet,evidence)
  const html=renderReport(packet,evidence,calculation)
  expect(html).toContain('手工预测假设');expect(html).toContain('企业价值到股权价值')
  expect(html).toContain('少数股东权益');expect(html).toContain('纯虚构基准假设')
  expect(calculation.dcf.scenarios[1].perShareValue).toBeTruthy()
  expect(html).toContain(Number(calculation.dcf.scenarios[1].perShareValue).toFixed(2)+' 元/股')
 })
 it('renders exact values with EFund tokens, near citations and explicit synthetic status',()=>{
  const f=fixture();const html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('1,688.38 亿元');expect(html).toContain('12.35%')
  expect(html).toContain('#005096');expect(html).toContain('#1EB9E1')
  expect(html).toContain('虚构数据演示');expect(html).toContain('href="#source-annual"')
  expect(html).toContain('外部真实性未认证');expect(html).not.toContain('<script')
 })
 it('rejects free financial numbers, unknown references and incompatible formatting',()=>{
  const f=fixture();f.packet.report.summary=[{text:'营业收入 9999 亿元。',refs:['missing']}]
  expect(validateReport(f.packet,f.validation,f.calculation).map(x=>x.code)).toEqual(expect.arrayContaining(['UNTEMPLATED_NUMBER','UNKNOWN_REPORT_REF']))
  f.packet.report.summary=[{text:'金额 {{growth|yi}}。'}]
  expect(validateReport(f.packet,f.validation,f.calculation).map(x=>x.code)).toContain('REPORT_UNIT')
 })
 it('escapes untrusted content and never emits active links or raw HTML',()=>{
  const f=fixture();f.packet.report.summary=[{text:'<img src=x onerror="alert(1)">'}]
  expect(validateReport(f.packet,f.validation,f.calculation).some(x=>x.code==='UNTEMPLATED_NUMBER')).toBe(true)
  f.packet.report.summary=[{text:'<img src=x onerror="alert()">'}]
  f.packet.sources[0].url='javascript:alert()'
  const html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('&lt;img');expect(html).not.toContain('href="javascript:');expect(html).not.toContain('<img')
 })
 it('does not render an invalid fact or failed computation as a report',()=>{
  const f=fixture();f.validation.ok=false
  expect(()=>renderReport(f.packet,f.validation,f.calculation)).toThrow('校验')
  f.validation.ok=true;f.calculation.ok=false
  expect(()=>renderReport(f.packet,f.validation,f.calculation)).toThrow('校验')
 })
 it('omits current-price metrics and rating when no verified quote or DCF exists',()=>{
  const f=fixture();const html=renderReport(f.packet,f.validation,f.calculation)
  expect(html).toContain('未提供经核对的现价');expect(html).not.toContain('较现价空间')
  expect(html).not.toContain('投资评级</th>');expect(html).not.toContain('参赛作品')
 })
})
