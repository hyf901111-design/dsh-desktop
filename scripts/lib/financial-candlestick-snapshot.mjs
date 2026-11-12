// Only the host's retained, validated candle model is admitted. The original
// HTML/model remains the persisted data-binding and export snapshot.
export function financialCandlestickSnapshot(spec){
 if(spec?.type!=='html'||typeof spec.html!=='string'||!spec.html.includes('data-sherlock-market="candlestick"')&&!spec.html.includes('data-chart-template="candlestick"'))return null
 const encoded=spec.html.match(/<script id="sherlock-template-data" type="application\/json">([^]*?)<\/script>/)?.[1]
 if(!encoded||encoded.length>2000000)return null
 let model;try{model=JSON.parse(encoded)}catch{return null}
 const d=model.data;if(!['market.candlestick','chart.candlestick'].includes(model.templateId)||typeof model.version!=='string'||!model.version||d?.version!==1||!['market','chart'].includes(d.type)||model.templateId!==d.type+'.candlestick'||d.variant!=='candlestick')return null
 const groups=d.datasets??[{name:d.title,candles:d.candles}]
 if(!Array.isArray(groups)||!groups.length||groups.length>6)return null
 const datasets=[]
 for(const g of groups){
  if(!Array.isArray(g.candles)||!g.candles.length||g.candles.length>2000)return null
  const bars=[];let previous=''
  for(const b of g.candles){
   if(typeof b.date!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/.test(b.date)||!Number.isFinite(Date.parse(b.date))||b.date<=previous||![b.open,b.high,b.low,b.close].every(v=>Number.isFinite(v)&&v>0)||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close)||b.volume!==null&&b.volume!==undefined&&(!Number.isFinite(b.volume)||b.volume<0))return null
   previous=b.date;bars.push({date:b.date,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume??null})
  }
  datasets.push({name:typeof g.name==='string'?g.name:d.title,bars})
 }
 return {title:d.title,asOf:d.asOf,note:d.note||'',volumeUnit:d.volumeUnit,sources:Array.isArray(d.sources)?d.sources:[],datasets}
}

export function FinancialCandlestickSnapshot({model}){
 useWorkbenchLocale();
 const text=workbenchText;
 const {jsx,jsxs}=react_jsx_runtime,[dataset,setDataset]=react.useState(0),[period,setPeriod]=react.useState('1d'),[indicators,setIndicators]=react.useState(['MA','VOL','MACD']),[focused,setFocused]=react.useState(null),[range,setRange]=react.useState(96)
 const active=Math.min(dataset,model.datasets.length-1),bars=model.datasets[active].bars,grouped=financialPeriodBars(bars,period),last=grouped.at(-1),current=focused??last,previous=grouped.at(-2)?.close,change=previous===undefined?null:last.close-previous,percentage=change===null||!previous?null:change/previous*100
 const fmt=v=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:6,minimumFractionDigits:2}):'—',toggle=v=>setIndicators(old=>old.includes(v)?old.filter(x=>x!==v):[...old,v])
 react.useEffect(()=>setFocused(null),[model,active,period])
 const basis=/不复权|前复权|后复权/.exec(model.note+' '+model.asOf)?.[0]||'来源口径',sourceVolumeUnit=model.volumeUnit||/量单位\s*[:：]?\s*([^；;。]+)/.exec(model.note)?.[1]||/成交量单位\s*[:：]?\s*([^；;。]+)/.exec(model.note)?.[1]||'原始单位',volumeUnit=/原始|未核实|未确认|未知/.test(sourceVolumeUnit)?'原始单位':sourceVolumeUnit
 const visible=Math.min(range,grouped.length),ranges=[...new Set([...([20,60,96,120,320].filter(v=>v<grouped.length)),grouped.length,visible])].sort((a,b)=>a-b)
 return jsxs('section',{'data-financial-candle-snapshot':'','data-research-preview-interactive':'',className:'ew-financial-widget ew-financial-quote ew-candle-snapshot',children:[
  jsxs('div',{className:'ew-quote-price-line',children:[jsx('strong',{'data-direction':change>0?'up':change<0?'down':undefined,children:fmt(last.close)}),jsx('span',{className:'ew-quote-change','data-direction':change>0?'up':change<0?'down':undefined,children:change===null?'—':(change>0?'+':'')+fmt(change)+' '+(percentage>0?'+':'')+percentage.toFixed(2)+'%'}),jsx('small',{title:model.asOf,children:model.asOf})]}),
  jsxs('div',{className:'ew-quote-ohlc',children:[jsx('span',{title:current.date,children:current.date.slice(0,10)+'  '+text('开 ')+fmt(current.open)+' '+text('高 ')+fmt(current.high)+' '+text('低 ')+fmt(current.low)+' '+text('收 ')+fmt(current.close)}),jsx('span',{title:volumeUnit,children:text('成交量')+' '+fmt(current.volume)})]}),
  jsxs('div',{className:'ew-quote-controls',children:[jsx('div',{className:'ew-quote-periods',children:[['1d','日K'],['1w','周K'],['1mo','月K'],['1y','年K']].map(([v,label])=>jsx('button',{type:'button','data-candle-period':v,'aria-pressed':period===v,onClick:()=>setPeriod(v),children:text(label)},v))}),jsx('div',{className:'ew-quote-indicators',children:['VOL','MACD','MA'].map(v=>jsx('button',{type:'button','aria-pressed':indicators.includes(v),onClick:()=>toggle(v),children:v},v))}),jsx('select',{'aria-label':text('显示交易日数量'),value:visible,onChange:e=>setRange(Number(e.target.value)),children:ranges.map(v=>jsx('option',{value:v,children:text('近 '+v+' 根')},v))})]}),
  model.datasets.length>1&&jsx('select',{'aria-label':text('K线标的'),value:active,onChange:e=>setDataset(Number(e.target.value)),children:model.datasets.map((d,i)=>jsx('option',{value:i,children:d.name},i))}),
  jsx(FinancialPriceChart,{bars,period,indicators,volumeUnit,initialCount:range,onFocusBar:setFocused},active),
  jsxs('details',{'data-candle-original-data':'',className:'ew-candle-original-data',children:[jsxs('summary',{children:[jsx('span',{children:text('完整行情数据')+' · '+bars.length+' '+text('条')}),jsx('span',{children:basis})]}),model.note&&jsx('div',{className:'ew-candle-note',children:model.note}),jsx('div',{className:'ew-candle-data-scroll',children:jsxs('table',{children:[jsx('thead',{children:jsx('tr',{children:['日期','开盘','最高','最低','收盘','成交量'].map(label=>jsx('th',{children:text(label)},label))})}),jsx('tbody',{children:bars.map(b=>jsx('tr',{children:[b.date,b.open,b.high,b.low,b.close,b.volume??'—'].map((v,i)=>jsx('td',{children:String(v)},i))},b.date))})]})})]}),
  jsxs('div',{className:'ew-candle-source',title:[model.asOf,model.note].filter(Boolean).join('\n'),children:[jsx('span',{children:model.asOf}),...model.sources.filter(s=>typeof s.url==='string'&&/^https?:\/\//.test(s.url)).map((s,i)=>jsx('a',{href:s.url,target:'_blank',rel:'noopener noreferrer',onClick:e=>financialOpenArticle(e,s.url),children:s.label||text('数据来源')},i))]})
 ]})
}

export const financialCandlestickSnapshotCss=`
body [data-ework-grid] [data-research-node-id]:has([data-financial-candle-snapshot]) :is([data-research-preview-body],.rScV5Q_containerContent,.rScV5Q_generatedContainer){padding:0!important;min-height:0!important;overflow:hidden!important}
body [data-ework-grid] [data-research-node-id]:has([data-financial-candle-snapshot]) :is(.rScV5Q_containerContent,.rScV5Q_generatedContainer){height:100%!important;display:flex!important;flex-direction:column!important;gap:0!important}
body .ew-candle-snapshot{flex:1;min-height:0}
body .ew-candle-original-data{flex:none;margin:0 6px;color:var(--fw-muted);font:11px/16px Inter,system-ui;border-top:1px solid var(--fw-grid)}
body .ew-candle-original-data summary{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;min-height:28px;padding:4px 0;box-sizing:border-box}
/* The workbench's generic marker follows the first text line. This summary
   centers both labels in a padded flex row, so center its marker in that row. */
body .ew-candle-original-data>summary::before{top:50%;translate:0 -50%}
body .ew-candle-data-scroll{max-height:150px;overflow:auto;scrollbar-width:thin}
body .ew-candle-data-scroll table{width:max-content;min-width:100%;border-collapse:collapse;font:11px/18px Inter,system-ui;color:var(--fw-text)}
body .ew-candle-data-scroll :is(th,td){padding:4px 8px;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}
body .ew-candle-data-scroll :is(th,td):first-child{text-align:left}
body .ew-candle-data-scroll th{position:sticky;top:0;background:var(--fw-heading)}
body .ew-candle-data-scroll tr:nth-child(even){background:var(--fw-row)}
body .ew-candle-source{display:flex;align-items:center;gap:10px;flex:none;padding:4px 6px;font:11px/16px Inter,system-ui;color:var(--fw-muted)}
body .ew-candle-source>span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body .ew-candle-source>a{flex:none;color:var(--fw-accent);text-decoration:none}
body .ew-candle-note{flex:none;max-height:34px;overflow:auto;padding:0 6px 4px;font:11px/15px Inter,system-ui;color:var(--fw-muted);scrollbar-width:thin}
`;
