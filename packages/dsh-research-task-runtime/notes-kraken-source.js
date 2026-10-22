import {validatePublicDataPanel} from './workbench-public-data.js'

export const noteSourceIsOffline=instruction=>typeof instruction==='string'&&/(?:不需要|无需|不用|不要|不必|禁止)(?:再|去|进行|额外|任何)?(?:联网|上网|搜索|检索|查找|查询|获取外部数据)|不联网|\b(?:do not|don't|without)\s+(?:search|browse|internet|network|fetch)\b/iu.test(instruction)

/** Deliberately narrow: a human's explicit exchange/pair quote intent only. */
export function noteKrakenQuotePlan(instruction){
 if(typeof instruction!=='string'||!instruction.trim()||instruction.length>8000||noteSourceIsOffline(instruction))return null
 if(!/\bKraken\b/iu.test(instruction)||!/(?:真实|实际|最新|实时|当前|\b(?:real|actual|live|latest|current)\b)/iu.test(instruction)||!/(?:报价|价格|行情|\b(?:quotes?|prices?|tickers?)\b)/iu.test(instruction))return null
 // An explicit URL, other exchange, history/analysis or another asset needs
 // the general worker; this hint cannot replace or broaden that requirement.
 if(/https?:\/\/|快照|历史|走势|K\s*线|图表|表格(?:组件|格式|视图)|(?:以|用|做成)表格|趋势|分析|研报|新闻|资讯|收益|预测|对比|\b(?:snapshot|history|candles?|chart|html|table|news|analysis|Binance|Coinbase|OKX|SOL|DOGE|ADA|XRP|LTC|BNB)\b|币安|欧易|莱特币|狗狗币/iu.test(instruction))return null
 const pairs=[...instruction.matchAll(/\b([A-Z0-9]{2,12})\s*\/\s*([A-Z0-9]{2,8})\b/giu)]
 if(!pairs.length||pairs.some(([,base,quote])=>!['BTC','XBT','ETH'].includes(base.toUpperCase())||quote.toUpperCase()!=='USD'))return null
 const names=[...new Set(pairs.map(([,base])=>base.toUpperCase()==='ETH'?'ETHUSD':'XBTUSD'))]
 const publicData=validatePublicDataPanel({profile:'crypto-metrics',requests:names.map(pair=>({source:'kraken-ticker',parameters_json:JSON.stringify({pair})})),intervalMinutes:1},'market',{strictParameters:true})
 return {title:names.map(pair=>pair==='ETHUSD'?'ETH/USD':'BTC/USD').join('、')+' · Kraken 报价',type:'market',publicData}
}

export function noteKrakenQuoteGuidance(instruction,schemas){
 const plan=noteKrakenQuotePlan(instruction)
 if(!plan||!Array.isArray(schemas)||!schemas.some(tool=>tool?.name==='public_data_query'))return ''
 // The generic worker observes the registered adapter's raw records/units.
 // Do not depend on display.* fields added only by the direct-panel renderer.
 // Business values remain paths and must pass observed-call validation.
 const requests=plan.publicData.requests.map((request,i)=>({key:'q'+i,tool:'public_data_query',args:{operation:'query',...request}}))
 const fields=[['price','最近成交'],['bid','买一'],['ask','卖一'],['high24h','24h最高'],['low24h','24h最低'],['volume24h','24h成交量']]
 const candidate={version:1,type:'data-bound',requests,mapping:{version:1,type:'market',variant:'metrics',title:plan.title,asOf:'Kraken · 报价时点未提供',note:'行情仅代表Kraken交易所；成交量为基础资产数量，获取时间不等于报价时间。',sources:[{label:'Kraken'}],items:requests.flatMap((request,i)=>{
  const asset=JSON.parse(plan.publicData.requests[i].parameters_json).pair==='ETHUSD'?'ETH':'BTC'
  return fields.map(([field,label])=>({label:asset+' '+label,value:{$from:request.key,$path:'records.0.'+field,$as:'string',$digits:field==='volume24h'?4:2,$suffix:' '+(field==='volume24h'?asset:'USD'),$default:'来源未提供'}}))
 })}}
 return '\n【Notes Kraken 注册报价合同】本轮原始用户需求明确指定 Kraken 及美元交易对，当前父会话可见 public_data_query。必须实际调用以下已注册内置接口取得本轮真实响应；不需要插件凭证，不调用模型自行补写的 URL，不用 web_fetch/financial_query 伪造可刷新来源。保留原始需求的刷新频率；组件正文和来源页脚不写死每分钟等刷新周期，实际周期以宿主当前刷新设置为准，后续用户可修改。以下仅为无数值的请求及映射合同，尚未取数、尚未保存绑定。只有真实成功调用且参数完全一致才能交付该 data-bound；接口失败或工具撤销时诚实说明，绝不填写报价或凭空声称已取得。报价时点未提供就写未提供，receivedAt只代表获取时间，配置保存时间不代表报价时点。\n'+JSON.stringify(candidate)+'\n【Notes Kraken 注册报价合同结束】'
}
