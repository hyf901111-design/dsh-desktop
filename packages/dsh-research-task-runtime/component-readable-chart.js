const esc=value=>String(value).replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const finite=value=>typeof value==='number'&&Number.isFinite(value)
const missing=value=>value===null||value===undefined||value===''
const coord=value=>Number(value.toFixed(3))

// Presentation only: the caller must already have proved the source mapping
// and semantic contract. No source data is changed, fetched or downsampled.
export function readableTrendFigure(data){
 if(!(data?.type==='chart'&&data.variant==='line'||data?.type==='market'&&data.variant==='trend'))return null
 if(typeof data.title!=='string'||!data.title.trim()||!Array.isArray(data.labels)||!data.labels.length||!data.labels.every(label=>typeof label==='string'&&label.trim())||!Array.isArray(data.series)||!data.series.length||data.series.length>12)return null
 let low=Infinity,high=-Infinity
 for(const series of data.series){
  if(typeof series?.name!=='string'||!series.name.trim()||!Array.isArray(series.values)||series.values.length!==data.labels.length)return null
  for(const value of series.values){
   if(missing(value))continue
   if(!finite(value))return null
   low=Math.min(low,value);high=Math.max(high,value)
  }
 }
 if(low===Infinity)return null
 const left=112,right=736,top=20,bottom=234,middle=(top+bottom)/2
 // Normalize before subtracting so even opposite finite extremes do not
 // overflow. Constant series use the middle rather than fabricated endpoints.
 const scale=Math.max(Math.abs(low),Math.abs(high))||1,min=low/scale,max=high/scale
 const x=index=>data.labels.length===1?(left+right)/2:left+(right-left)*index/(data.labels.length-1)
 const y=value=>low===high?middle:bottom-(value/scale-min)/(max-min)*(bottom-top)
 const unit=typeof data.unit==='string'?data.unit:''
 const plotted=data.series.map((series,index)=>{
  const segments=[];let segment=[],valid=0
  for(const [i,value]of series.values.entries()){
   if(finite(value)){segment.push({i,value,x:coord(x(i)),y:coord(y(value))});valid++}
   else if(segment.length){segments.push(segment);segment=[]}
  }
  if(segment.length)segments.push(segment)
  const marks=segments.map(points=>{
   if(points.length===1){
    const point=points[0],title=series.name+' · '+data.labels[point.i]+': '+point.value+(unit?' '+unit:'')
    return `<circle data-readable-index="${point.i}" data-readable-value="${point.value}" cx="${point.x}" cy="${point.y}" r="3"><title>${esc(title)}</title></circle>`
   }
   return `<polyline fill="none" stroke-width="2" vector-effect="non-scaling-stroke" points="${points.map(point=>point.x+','+point.y).join(' ')}"/>`
  }).join('')
  const dash=index>=6?' stroke-dasharray="6 3"':''
  return `<g data-readable-series="${index}" data-readable-valid-points="${valid}" aria-label="${esc(series.name)}" stroke="var(--sherlock-chart-${index%6+1})" fill="var(--sherlock-chart-${index%6+1})"${dash}>${marks}</g>`
 }).join('')
 const tick=value=>esc(Number(value.toPrecision(6)))
 const yLabels=low===high
  ?`<text x="104" y="${middle+4}" text-anchor="end"><title>${esc(low)}</title>${tick(low)}</text>`
  :`<text x="104" y="${top+5}" text-anchor="end"><title>${esc(high)}</title>${tick(high)}</text><text x="104" y="${bottom}" text-anchor="end"><title>${esc(low)}</title>${tick(low)}</text>`
 const axisIndices=[...new Set([0,Math.floor((data.labels.length-1)/2),data.labels.length-1])]
 const axis=axisIndices.map((i,index)=>{
  const column=axisIndices.length===1?2:index===0?1:index===axisIndices.length-1?3:2,align=column===1?'left':column===3?'right':'center'
  return `<span data-readable-axis-label data-readable-index="${i}" style="grid-column:${column};min-width:0;overflow-wrap:anywhere;text-align:${align}">${esc(data.labels[i])}</span>`
 }).join('')
 const legend=data.series.map((series,index)=>`<span data-readable-legend-item style="min-width:0;overflow-wrap:anywhere"><i aria-hidden="true" style="display:inline-block;width:16px;margin-right:5px;vertical-align:middle;border-top:2px ${index>=6?'dashed':'solid'} var(--sherlock-chart-${index%6+1})"></i>${esc(series.name)}</span>`).join('')
 return `<figure data-readable-trend style="margin:12px 0;min-width:0;max-width:100%"><svg viewBox="0 0 760 248" role="img" aria-label="${esc(data.title)}" style="display:block;width:100%;height:auto"><g stroke="var(--sherlock-border)"><line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}"/><line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}"/></g><g fill="var(--sherlock-muted)" font-size="13">${yLabels}</g>${plotted}</svg><div data-readable-axis-labels style="margin-left:14.737%;margin-right:3.158%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;font-size:12px">${axis}</div><figcaption style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;min-width:0">${legend}${unit?`<span data-readable-unit style="min-width:0;overflow-wrap:anywhere">${esc(unit)}</span>`:''}</figcaption></figure>`
}
