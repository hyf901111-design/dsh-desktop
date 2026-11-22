import { expect, it, vi } from 'vitest'
import { createFinancialTool } from '../packages/dsh-fund-research-runtime/financial-tool.js'
import { financialHash } from '../packages/dsh-fund-research-runtime/financial-contract.js'
import { readFundProfileNames } from '../packages/dsh-fund-research-runtime/fund-profile-names.js'

const args = { intent: 'profile', asset: 'fund', symbols: ['110011'] }
const provider = { financial: async query => ({
  schema_version: 'financial-1', request_hash: financialHash(query), received_at: new Date().toISOString(),
  status: 'partial', limitations: ['部分数据暂缺。'],
  // Old versions of the hosted service return this short value as “基金名称”.
  records: [{ evidence_id:'1'.repeat(32),instrument:'110011',metric:'基金名称',value:'易方达优质精选混合（QDII）',
    as_of:null,quality_state:'unknown',unit:'text',price_basis:'基金资料' }]
}) }
const profile = (code, fullName, shortName) => '<table><tr><th>基金全称</th><td>' + fullName +
  '</td><th>基金简称</th><td>' + shortName + '</td></tr><tr><th>基金代码</th><td>' + code +
  '（前端）<th>基金类型</th><td>混合</td></tr></table>'
const page = html => new Response(html, {headers:{'content-type':'text/html; charset=utf-8'}})

it('returns traceable full-name evidence alongside a legacy hosted fund display name', async () => {
  const profileFetch = vi.fn(async()=>page(profile('110011','易方达优质精选混合型证券投资基金','易方达优质精选混合(QDII)')))
  const tool = createFinancialTool(provider,{profileFetch}), result = await tool.execute(args,{})
  expect(result.profile_names).toEqual({code:'110011',full_name:'易方达优质精选混合型证券投资基金',short_name:'易方达优质精选混合(QDII)',
    source:'天天基金 · 基金基本概况',source_url:'https://fundf10.eastmoney.com/jbgk_110011.html'})
  expect(profileFetch.mock.calls[0]).toEqual([result.profile_names.source_url,expect.objectContaining({redirect:'error',credentials:'omit',headers:{accept:'text/html'}})])
  expect(result.records[0].value).toBe('易方达优质精选混合（QDII）')
})

it.each([
  ['incorrect share code',profile('110012','别的证券投资基金','别的混合')],
  ['missing legal name',profile('110011','','某混合')],
  ['unspecified display name',profile('110011','不明口径名称','某混合').replace('基金全称','基金名称')],
  ['conflicting product tables',profile('110011','一号证券投资基金','一号')+profile('110011','二号证券投资基金','二号')]
])('keeps the full name unconfirmed for %s',async(_name,html)=>{
  const tool=createFinancialTool(provider,{profileFetch:async()=>page(html)})
  const result=await tool.execute(args,{})
  expect(result.profile_names).toMatchObject({full_name:null,note:expect.stringContaining('未取得')})
  expect(result.profile_names).not.toHaveProperty('source_url')
  expect(result.records).toHaveLength(1)
})

it('recognizes a different product by its own code and labeled fields',async()=>{
  const result=await readFundProfileNames('000198',{fetch:async()=>page(profile('000198','天弘余额宝货币市场基金','天弘余额宝货币'))})
  expect(result).toMatchObject({code:'000198',full_name:'天弘余额宝货币市场基金',source_url:'https://fundf10.eastmoney.com/jbgk_000198.html'})
})

it('retains the hosted profile when the public source is offline and honors cancellation',async()=>{
  const controller=new AbortController()
  const offline=createFinancialTool(provider,{profileFetch:async()=>{throw Error('offline')}})
  expect((await offline.execute(args,{})).profile_names.full_name).toBeNull()
  const cancelled=createFinancialTool(provider,{profileFetch:async()=>{controller.abort();throw controller.signal.reason}})
  await expect(cancelled.execute(args,{signal:controller.signal})).rejects.toThrow()
})
