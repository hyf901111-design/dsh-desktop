import {expect,it} from 'vitest'
import {noteKrakenQuotePlan,noteKrakenQuoteGuidance} from '../packages/dsh-research-task-runtime/notes-kraken-source.js'
const instruction='创建 BTC/USD 与 ETH/USD 指标组件，实际读取 Kraken 最新报价并绑定成功接口'
it('supplies fixed registered requests and the existing crypto mapping without inventing business values',()=>{
 const plan=noteKrakenQuotePlan(instruction),text=noteKrakenQuoteGuidance(instruction,[{name:'public_data_query'}])
 expect(plan.publicData.requests).toEqual([{source:'kraken-ticker',parameters_json:'{"pair":"XBTUSD"}'},{source:'kraken-ticker',parameters_json:'{"pair":"ETHUSD"}'}])
 const candidate=JSON.parse(text.split('\n')[2])
 expect(candidate.requests.map(x=>x.tool)).toEqual(['public_data_query','public_data_query']);expect(candidate.mapping).toMatchObject({type:'market',variant:'metrics',asOf:'Kraken · 报价时点未提供'})
 expect(candidate.mapping.items).toHaveLength(12);expect(candidate.mapping.items.every(item=>typeof item.value==='object'&&['q0','q1'].includes(item.value.$from))).toBe(true)
 expect(text).not.toContain('https://');expect(text).not.toContain('123.45')
 expect(noteKrakenQuotePlan('Create real current Kraken BTC/USD and ETH/USD prices')).not.toBeNull()
})
it.each([
 '创建 BTC/USD 最新报价组件','创建 Kraken BTC/USD 报价说明','Kraken BTC/USD 最新报价，只做快照',
 '不要联网，创建 Kraken BTC/USD 真实报价','创建 Kraken BTC/USD 和 SOL/USD 最新报价','创建 Kraken BTC/USDT 最新报价',
 '创建 Kraken ETH/EUR 最新报价','创建 Kraken BTC/USD 历史K线','创建 Kraken BTC/USD 最新价格和相关新闻',
 '创建 Kraken BTC/USD 最新报价表格组件',
 '实际读取 Coinbase 的 BTC/USD 最新报价','创建 Kraken BTC/USD 最新报价，改用 https://other.example/ticker',
 'Kraken BTC/USD latest price without network access'
])('does not reroute a broader, offline, ambiguous or differently sourced requirement: %s',value=>{
 expect(noteKrakenQuotePlan(value)).toBeNull();expect(noteKrakenQuoteGuidance(value,[{name:'public_data_query'}])).toBe('')
})
it('requires actual parent-visible registration and never substitutes a globally named tool',()=>{
 for(const schemas of [undefined,[],[{name:'web_fetch'}],[{name:'private_public_data_query'}]])expect(noteKrakenQuoteGuidance(instruction,schemas)).toBe('')
})
