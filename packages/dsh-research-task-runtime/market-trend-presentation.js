// Shared by fresh renders and saved native templates. Keep this function
// self-contained: the client preview embeds its serialized definition.
export function refineTrendPresentation(html,data) {
 if(typeof html!=='string'||data?.type!=='market'||data.variant!=='trend'||!html.includes('data-sherlock-market="trend"')||!html.includes('data-sherlock-design=')||!html.includes('class="market-trend"'))return html
 const {labels,series}=data,text=s=>typeof s==='string'&&s.trim()&&s.length<=2000
 if(!Array.isArray(labels)||labels.length<2||labels.length>366||!labels.every(text)||!Array.isArray(series)||!series.length||series.length>12||series.some(s=>!text(s?.name)||!Array.isArray(s.values)||s.values.length!==labels.length||s.values.some(v=>typeof v!=='number'||!Number.isFinite(v))))return html
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
 const normalized=series.every(s=>s.values[0]===100)
 const concise=name=>{
  const tail=name.match(/[（(]([^（）()]*)[）)]\s*$/)
  // Only remove a redundant, recognized base annotation. Meaningful analyst
  // qualifiers, scenario names and unknown suffixes stay visible.
  return normalized&&tail&&/(?:基期|基准)\s*(?:=|＝|为|→)?\s*100/.test(tail[1])&&!tail[1].replace(/前复权|后复权|不复权|收盘|基期|基准|100|[元点为=＝→，,、\s]/g,'')?name.slice(0,tail.index).trim():name
 }
 const palette=['var(--sherlock-chart-1)','var(--sherlock-chart-2)','var(--sherlock-chart-3)','#ad78cf','#d58a39','#589a8d']
 const swatch=i=>`<span class="trend-swatch${i>=6?' trend-swatch-dashed':''}" style="--trend-series-color:${palette[i%6]}" aria-hidden="true"></span>`
 if(!html.includes('data-trend-layout="v2"')){
  const start=html.indexOf('<div class="trend-head">'),end=html.indexOf('<svg',start)
  if(start<0||end<0||end-start>32000||!html.slice(start,end).includes('class="trend-readout"'))return html
  const last=labels.length-1
  const legend=series.map((s,i)=>`<button type="button" class="trend-key trend-${i+1}" data-trend-series="${i}" aria-pressed="true" aria-label="显示或隐藏${esc(s.name)}序列" title="${esc(s.name)}">${swatch(i)}<span class="trend-series-name">${esc(concise(s.name))}</span></button>`).join('')
  const rows=series.map((s,i)=>`<span class="trend-point" data-trend-readout-row="${i}" aria-label="${esc(s.name)}"><span class="trend-point-name" title="${esc(s.name)}">${esc(concise(s.name))}</span><b data-trend-point-value>${esc(s.values[last])}</b></span>`).join('')
  const header=`<div class="trend-head" data-trend-layout="v2"><span>${normalized?'归一化基期 = 100':`同口径序列 · ${labels.length} 个时点`}</span><div class="trend-legend">${legend}</div></div><div class="trend-readout" role="status"><time data-trend-selected-date>${esc(labels[last])}</time><div class="trend-point-grid">${rows}</div></div>`
  html=html.slice(0,start)+header+html.slice(end)
 }
 if(text(data.note)&&data.note.startsWith('来源：financial_query / financial-1。')&&data.note.includes('宿主按各价格/各自首值×100计算')&&!html.includes('data-trend-provenance="v2"')){
  const note=esc(data.note),comparison=data.note.split('\n').find(line=>/^相对 .+区间涨跌幅差/.test(line))
  // Retain the original note's wrapper and the existing source-link sibling.
  // Their DOM routes belong to saved component interaction journals.
  const replacement=`<span class="trend-provenance">${comparison?`<span class="trend-comparison">${esc(comparison)}</span>`:''}<details data-trend-provenance="v2"><summary>计算口径与来源</summary><div class="trend-provenance-copy">${note}</div></details></span>`
  html=html.replace('<span>'+note+'</span>',()=>replacement)
 }
 if(html.includes('data-trend-presentation="v2"'))return html
 const css=`body[data-sherlock-market="trend"]{height:100vh;min-height:100vh;box-sizing:border-box;display:flex;flex-direction:column}body .market-trend{display:flex;flex-direction:column;flex:1 0 auto;min-height:0}body .market-trend .trend-head{display:flex!important;flex-direction:column;align-items:stretch!important;gap:4px!important;padding-bottom:5px;flex:none}body .market-trend .trend-legend{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(154px,1fr));width:100%;gap:2px 12px!important;justify-content:stretch;overflow:visible}body .market-trend .trend-key{display:flex!important;align-items:center;gap:6px!important;min-width:0;max-width:100%;padding:0!important;line-height:18px!important;height:18px!important;min-height:18px!important;text-align:left}body .market-trend .trend-key::before{display:none!important}body .market-trend .trend-swatch{display:block;flex:none;width:12px;height:2px;background:var(--trend-series-color)!important}body .market-trend .trend-swatch-dashed{background:repeating-linear-gradient(to right,var(--trend-series-color) 0 4px,transparent 4px 6px)!important}body .market-trend .trend-series-name,body .market-trend .trend-point-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}body .market-trend .trend-readout{flex:none;white-space:normal!important;overflow:visible!important;padding:3px 0 5px}body .market-trend .trend-readout time{display:block;color:var(--sherlock-muted);font-size:11px;line-height:17px}body .market-trend .trend-point-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(154px,1fr));gap:1px 12px}body .market-trend .trend-point{display:flex;justify-content:space-between;min-width:0;gap:6px;font-size:11px;line-height:18px}body .market-trend .trend-point[hidden]{display:none}body .market-trend .trend-point b{font-weight:500;flex:none;font-variant-numeric:tabular-nums}body .market-trend svg{flex:1 0 132px;min-height:132px;height:auto!important;width:100%}body .market-trend>.trend-footer,body .market-trend>details,body>.market-footer{flex:none}body .market-trend>.trend-footer{margin-top:3px}body .market-footer .trend-provenance{display:block;min-width:0}body .market-footer .trend-comparison{display:block;white-space:normal;line-height:16px;margin-bottom:4px;color:var(--sherlock-text)}body .market-footer [data-trend-provenance]{margin:0;padding:0}body .market-footer [data-trend-provenance] summary{line-height:18px;cursor:pointer;color:var(--sherlock-muted)}body .market-footer .trend-provenance-copy{white-space:pre-wrap;line-height:16px;padding-top:4px}body .market-trend>.trend-footer>span:first-child{max-width:45%}`
 // Append after the existing DOM so stored routes are not shifted by a new
 // style child when the saved head is parsed inside the sandbox body.
 return html+`<style data-trend-presentation="v2">@layer ework-workbench{${css}}</style>`
}
