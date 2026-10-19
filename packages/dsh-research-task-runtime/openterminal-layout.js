// OpenTerminal QuoteWidget, NewsWidget, ChartWidget and data-table composition.
// Explicit artifact profile: layout survives refresh; changing colors alone never opts in.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function validOpenTerminalLayout(s){
 return s.layoutProfile===undefined||s.layoutProfile==='openterminal'&&
  (s.type==='news'||s.type==='market'&&['ticker-information','price-volume','table'].includes(s.variant))
}
export function openTerminalDimensions(s){
 if(s?.layoutProfile!=='openterminal'||!validOpenTerminalLayout(s))return null
 return {width:s.type==='news'||s.variant==='ticker-information'?448:832,
  height:s.type==='news'||s.variant==='table'?400:340,
  minWidth:280,minHeight:220,provenance:'OpenTerminal · QuoteWidget / ChartWidget / data-table / NewsWidget',
  layoutProfile:'openterminal',version:'openterminal-layout-20261019'}
}
export function openTerminalQuote(s,spark){
 const signed=v=>v===null?'—':(v>0?'+':'')+v,tone=(s.dayChangePercent??s.dayChange)>0?'positive':(s.dayChangePercent??s.dayChange)<0?'negative':'neutral'
 return `<section class="financial-profile ot-quote"><div class="ot-identity"><strong>${esc(s.symbol)}</strong><span>${esc(s.name)}</span></div><div class="ot-quote-hero"><strong data-refresh-key="ticker:price" data-refresh-value="${esc(s.price)}">${s.price===null?'—':esc(s.price)}<small>${esc(s.priceUnit)}</small></strong><div data-tone="${tone}">${esc(signed(s.dayChange))} ${s.dayChange===null?'':esc(s.priceUnit)}<br>${esc(signed(s.dayChangePercent))}${s.dayChangePercent===null?'':'%'}</div></div><dl class="ot-quote-facts">${s.info.map(i=>`<div><dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd></div>`).join('')}</dl><div class="ot-quote-history"><span class="ot-section-label">历史报价 / ${esc(s.priceUnit)}</span>${spark}</div>${s.missing?`<p class="ticker-missing">${esc(s.missing)}</p>`:''}</section>`
}
export function openTerminalMarketBody(s,body){
 if(s.layoutProfile!=='openterminal')return body
 if(s.variant==='table')return `<div class="ot-table-context"><strong>${s.rows.length}<small> 条完整记录</small></strong><span>数值单位见列名 · 单击表头排序</span></div>${body}`
 if(s.variant!=='price-volume')return body
 const last=s.prices.at(-1),previous=s.prices.at(-2),delta=last-previous,percent=previous===0?'—':((last/previous-1)*100).toFixed(2)+'%',tone=delta>0?'positive':delta<0?'negative':'neutral'
 return `<section class="ot-chart-snapshot"><div><span>最近记录</span><strong>${esc(last)} <small>${esc(s.priceUnit)}</small></strong></div><div data-tone="${tone}">${delta>0?'+':''}${esc(Number(delta.toFixed(4)))}<small> ${esc(s.priceUnit)} / ${delta>0?'+':''}${esc(percent)}</small></div><span>${esc(s.labels.at(-1))}<br>较前一记录</span></section>${body}`
}
export function openTerminalNewsItem(i){
 return `<div class="ot-news-meta"><time>${esc([i.date,i.time].filter(Boolean).join(' ')||'发布时间未提供')}</time>${i.category?`<span>${esc(i.category)}</span>`:''}<span>${esc(i.publisher||'来源未提供')}</span></div><div class="ot-news-copy"><h2>${i.url?`<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.title)} ↗</a>`:esc(i.title)}</h2><details open><summary>收起摘要</summary><p>${esc(i.summary||'来源仅提供标题与原文链接，未提供摘要。')}</p></details></div>`
}
// This sheet is placed in ework-workbench, beside the existing host presentation.
export const OPEN_TERMINAL_LAYOUT_CSS=`
body[data-layout-profile="openterminal"]{padding:8px!important;line-height:18px!important}
body[data-layout-profile="openterminal"] :is(.ot-identity,.ot-table-context){display:flex!important;align-items:baseline!important;justify-content:space-between!important;gap:12px!important;flex-wrap:wrap!important;border-bottom:1px solid var(--sherlock-border)!important;padding:0 0 7px!important;margin:0 0 7px!important}
body[data-layout-profile="openterminal"] .ot-identity strong{color:var(--sherlock-control-primary)!important;font-size:14px!important}
body[data-layout-profile="openterminal"] .ot-identity span{font-size:11px!important;color:var(--sherlock-muted)!important}
body[data-layout-profile="openterminal"] .ot-quote-hero{display:flex!important;align-items:baseline!important;gap:18px!important;padding:2px 0 9px!important}
body[data-layout-profile="openterminal"] .ot-quote-hero>strong{font-size:30px!important;line-height:36px!important;font-weight:500!important;letter-spacing:-1px!important}
body[data-layout-profile="openterminal"] :is(.ot-quote-hero,.ot-chart-snapshot) small{font-size:11px!important;color:var(--sherlock-muted)!important;letter-spacing:0!important}
body[data-layout-profile="openterminal"] .ot-quote-hero small{padding-left:8px!important}
body[data-layout-profile="openterminal"] .ot-quote-facts{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0 20px!important;margin:0 0 8px!important}
body[data-layout-profile="openterminal"] .ot-quote-facts>div{display:flex!important;justify-content:space-between!important;align-items:baseline!important;gap:8px!important;border-bottom:1px solid var(--sherlock-border)!important;padding:4px 0!important;min-width:0!important}
body[data-layout-profile="openterminal"] .ot-quote-facts dt{font-size:11px!important;color:var(--sherlock-muted)!important}
body[data-layout-profile="openterminal"] .ot-quote-facts dd{margin:0!important;text-align:right!important;font-size:12px!important;overflow-wrap:anywhere!important}
body[data-layout-profile="openterminal"] .ot-section-label{font-size:10px!important;color:var(--sherlock-muted)!important}
body[data-layout-profile="openterminal"] .ot-quote-history svg{display:block!important;width:100%!important;height:64px!important;overflow:visible!important}
body[data-layout-profile="openterminal"] .ot-quote-history svg path{fill:none;stroke:var(--sherlock-chart-1);stroke-width:1.5;vector-effect:non-scaling-stroke}
body[data-layout-profile="openterminal"] .ot-quote-history svg circle{fill:var(--sherlock-chart-1)}
body[data-layout-profile="openterminal"] [data-ticker-readout]{font-size:11px!important;line-height:17px!important;margin:0!important;color:var(--sherlock-muted)!important}
body[data-layout-profile="openterminal"] .ot-chart-snapshot{display:flex!important;align-items:baseline!important;gap:20px!important;flex-wrap:wrap!important;padding-bottom:8px!important;margin-bottom:6px!important;border-bottom:1px solid var(--sherlock-border)!important}
body[data-layout-profile="openterminal"] .ot-chart-snapshot>div:first-child{display:flex!important;gap:10px!important;align-items:baseline!important}
body[data-layout-profile="openterminal"] .ot-chart-snapshot strong{font-size:24px!important;font-weight:500!important;line-height:30px!important}
body[data-layout-profile="openterminal"] .ot-chart-snapshot>span{margin-left:auto!important;text-align:right!important;font-size:10px!important;line-height:15px!important;color:var(--sherlock-muted)!important}
body[data-layout-profile="openterminal"][data-sherlock-market="price-volume"] .price-volume svg{height:clamp(130px,calc(100vh - 182px),500px)!important}
body[data-layout-profile="openterminal"] :is(.price-volume-controls,.terminal-table-toolbar){border-bottom:1px solid var(--sherlock-border)!important;padding:0 0 6px!important;margin:0 0 5px!important}
body[data-layout-profile="openterminal"] .ot-table-context strong{font-size:16px!important;font-weight:500!important}
body[data-layout-profile="openterminal"] .ot-table-context :is(small,span){font-size:11px!important;color:var(--sherlock-muted)!important}
body[data-layout-profile="openterminal"][data-sherlock-market="table"]{display:flex!important;flex-direction:column!important;height:100vh!important;overflow:hidden!important}
body[data-layout-profile="openterminal"] .market-table-wrap{flex:1 1 auto!important;max-height:none!important;min-height:60px!important}
body[data-layout-profile="openterminal"] .market-table-wrap :is(th,td){height:28px!important;padding:4px 8px!important;border-bottom:1px solid var(--sherlock-border)!important}
body[data-layout-profile="openterminal"] .market-table-wrap :is(th,td):first-child{position:sticky!important;left:0!important;z-index:2!important;background:var(--sherlock-bg)!important;font-weight:600!important}
body[data-layout-profile="openterminal"] .market-table-wrap th:first-child{z-index:3!important}
body[data-layout-profile="openterminal"] .market-footer{flex:none!important;margin-top:6px!important;padding-top:6px!important;border-top:1px solid var(--sherlock-border)!important}
body[data-layout-profile="openterminal"] .ot-news-item{display:grid!important;grid-template-columns:78px minmax(0,1fr)!important;gap:10px!important;padding:9px 0!important;border-bottom:1px solid var(--sherlock-border)!important;min-width:0!important}
body[data-layout-profile="openterminal"] .ot-news-item[hidden]{display:none!important}
body[data-layout-profile="openterminal"] .ot-news-meta{display:flex!important;flex-direction:column!important;gap:4px!important;font-size:10px!important;line-height:15px!important;color:var(--sherlock-muted)!important}
body[data-layout-profile="openterminal"] .ot-news-meta time{font-variant-numeric:tabular-nums!important}
body[data-layout-profile="openterminal"] .ot-news-meta span:first-of-type{color:var(--sherlock-control-primary)!important}
body[data-layout-profile="openterminal"] .ot-news-copy{min-width:0!important;overflow-wrap:anywhere!important}
body[data-layout-profile="openterminal"] .ot-news-copy h2{margin:0 0 4px!important;font-size:13px!important;line-height:20px!important;font-weight:500!important}
body[data-layout-profile="openterminal"] .ot-news-copy details{display:flex!important;flex-direction:column!important;font-size:11px!important;line-height:18px!important}
body[data-layout-profile="openterminal"] .ot-news-copy summary{font-size:10px!important;color:var(--sherlock-muted)!important;cursor:pointer!important}
body[data-layout-profile="openterminal"] .ot-news-copy p{margin:4px 0 0!important;color:var(--sherlock-muted)!important;white-space:pre-wrap!important}
@media(max-width:360px){body[data-layout-profile="openterminal"] .ot-quote-facts{grid-template-columns:minmax(0,1fr)!important}body[data-layout-profile="openterminal"] .ot-chart-snapshot{gap:6px 12px!important}body[data-layout-profile="openterminal"] .ot-news-item{grid-template-columns:minmax(0,1fr)!important;gap:3px!important}body[data-layout-profile="openterminal"] .ot-news-meta{flex-direction:row!important;flex-wrap:wrap!important;gap:3px 8px!important}}
`
