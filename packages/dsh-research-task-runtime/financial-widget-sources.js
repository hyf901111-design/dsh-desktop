// Source profiles are fixed host adapters, never renderer-authored URLs.
// Keep this function self-contained: the trusted React bundle serializes it.
export function financialWidgetSources(spec){
 const query=spec.linkedSourceId?(spec.symbols?.[0]?.name||spec.symbols?.[0]?.code||''):spec.query
 if(spec.widget==='news')return [{id:'default',name:query?'东方财富':'新浪财经'},{id:'backup',name:query?'新浪财经':'东方财富'}]
 if(spec.widget==='announcements')return [{id:'default',name:'东方财富'},{id:'backup',name:'巨潮资讯'}]
 if(['watchlist','quote','indices'].includes(spec.widget))return [{id:'default',name:spec.widget==='indices'?'腾讯财经 / Yahoo Finance':'腾讯财经'},{id:'backup',name:spec.widget==='indices'?'新浪财经 / 东方财富 / Yahoo Finance':'新浪财经 / Yahoo Finance'}]
 return []
}
