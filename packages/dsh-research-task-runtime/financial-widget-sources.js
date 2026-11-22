// Source profiles are fixed host adapters, never renderer-authored URLs.
// Keep these functions self-contained: the trusted React bundle serializes them.
export function financialWidgetSources(spec){
 if(spec.widget==='futures')return [{id:'shfe',name:'上海期货交易所 · 交易日报'}]
 if(spec.widget==='news')return [{id:'doubao',name:'豆包搜索'},{id:'eastmoney',name:'东方财富'},{id:'sina',name:'新浪财经'}]
 if(spec.widget==='announcements')return [{id:'default',name:'东方财富'},{id:'backup',name:'巨潮资讯'}]
 if(spec.widget==='quote'&&spec.symbols?.[0]?.market==='CRYPTO')
  return [{id:'kraken',name:'Kraken'},{id:'bitfinex',name:'Bitfinex'}]
 if(['watchlist','quote','indices'].includes(spec.widget)){
  const sources=[{id:'default',name:spec.widget==='indices'?'腾讯财经 / Yahoo Finance':'腾讯财经'},{id:'backup',name:spec.widget==='indices'?'新浪财经 / 东方财富 / Cboe / Yahoo Finance':'新浪财经 / Yahoo Finance'}]
  if(spec.widget==='quote'&&['SH','SZ','BJ'].includes(spec.symbols?.[0]?.market))
   sources.push({id:'tushare',name:'Tushare · 收盘日线'},{id:'datapro',name:'火山方舟专业数据集 · 收盘日线'})
  return sources
 }
 return []
}
export function financialWidgetSourceId(spec, query){
 const source=spec.dataSource||'default'
 if(spec.widget==='news'&&['default','backup'].includes(source)){
  const hasTopic=Boolean(query?.trim())
  return (source==='backup'?!hasTopic:hasTopic)?'eastmoney':'sina'
 }
 if(spec.widget==='quote'&&spec.symbols?.[0]?.market==='CRYPTO'&&!['kraken','bitfinex'].includes(source))return 'kraken'
 return source
}
