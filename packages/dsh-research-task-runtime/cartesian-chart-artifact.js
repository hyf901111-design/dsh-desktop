import {CARTESIAN_CHART_TEMPLATES,chartDataIssue} from './chart-template-contract.js';

// Pure SVG geometry is also used in the sandbox. Never evaluates model code.
// Axis domains stay fixed while toggling series, preserving visual comparison.
export function cartesianChartSvg(spec, width = 620, visible = spec.series.map(() => true), availableHeight = 240) {
  const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const node = (tag, attributes = {}, children = []) => ({tag, attributes, children});
  const serialize = el => typeof el === 'string' ? esc(el) : `<${el.tag}${Object.entries(el.attributes).map(([k,v]) => ` ${k}="${esc(v)}"`).join('')}>${el.children.map(serialize).join('')}</${el.tag}>`;
  const fmt = v => Number(v.toPrecision(5)).toLocaleString('en-US',{maximumSignificantDigits:5});
  const color = i => `var(--sherlock-chart-${i % 8 + 1},var(--sherlock-chart-${i % 6 + 1}))`;
  const n = spec.labels.length, kind = spec.variant;
  const horizontal = ['horizontal','lollipop','dumbbell'].includes(kind);
  const stacked = ['stackedArea','stackedBar','percentBar'].includes(kind);
  const percent = kind === 'percentBar';
  const w = Math.max(280, width), h = horizontal ? Math.max(160, n <= 6 ? n * 24 + 46 : n * 30 + 50, Math.min(240, availableHeight)) : Math.max(160, Math.min(240, availableHeight));
  const left = horizontal ? Math.min(110, w * .27) : 48, right = 16, top = 16, bottom = 30;
  const pw = w-left-right, ph = h-top-bottom;
  const totals = spec.labels.map((_, i) => spec.series.reduce((sum,s,si) => sum + (visible[si]?s.values[i]:0), 0));
  const values = spec.series.map(s => s.values.map((v,i) => percent ? (totals[i] ? v / totals[i] * 100 : 0) : v));
  const positive = Array(n).fill(0), negative = Array(n).fill(0);
  const ranges = values.map((series,si) => series.map((value,i) => {
    if (!stacked) return [0,value];
    const sums = value >= 0 ? positive : negative, start = sums[i];
    if(visible[si])sums[i] += value; return [start,sums[i]];
  }));
  const fullPositive=spec.labels.map((_,i)=>spec.series.reduce((sum,s)=>sum+Math.max(0,s.values[i]),0)),fullNegative=spec.labels.map((_,i)=>spec.series.reduce((sum,s)=>sum+Math.min(0,s.values[i]),0));
  const all = stacked ? [...fullPositive,...fullNegative] : values.flat();
  let low = Math.min(0,...all), high = Math.max(0,...all);
  // Lines and paired dots compare positions, so fit the observed range. Bars,
  // stems and filled areas measure distance from zero and retain that baseline.
  // Include every series even when hidden so legend toggles cannot rescale it.
  if (['line','step','dumbbell'].includes(kind)) {
    low = Math.min(...all); high = Math.max(...all);
    const padding = high === low ? Math.abs(low)*.05 || 1 : (high-low)*.05;
    low -= padding; high += padding;
  }
  if (percent) {low=0;high=100;}
  if (high===low) high=low+1;
  // Five stable grid nodes keep saved interaction routes intact. Round the
  // display domain outwards to readable steps; never round the observations.
  if (['horizontal','lollipop'].includes(kind)) {
    const rawStep=(high-low)/4, magnitude=10**Math.floor(Math.log10(rawStep));
    let step=[1,2,2.5,3,4,5,10].find(value=>value*magnitude>=rawStep)*magnitude;
    let floor=Math.floor(low/step)*step;
    while(floor+4*step<high-rawStep*1e-10){step*=2;floor=Math.floor(low/step)*step;}
    low=Number(floor.toPrecision(14));high=Number((floor+4*step).toPrecision(14));
  }
  const pos = value => horizontal ? left+(value-low)/(high-low)*pw : top+(high-value)/(high-low)*ph;
  const cat = i => horizontal ? top+(i+.5)*ph/n : left+(i+.5)*pw/n;
  const tickText = value => fmt(value)+(percent?'%':'');
  const axes = [];
  for (let i=0;i<=4;i++) {
    const v=low+(high-low)*i/4, p=pos(v);
    axes.push(node('line', horizontal ? {class:'grid',x1:p,x2:p,y1:top,y2:h-bottom} : {class:'grid',x1:left,x2:w-right,y1:p,y2:p}));
    axes.push(node('text', horizontal ? {x:p,y:h-9,'text-anchor':'middle'} : {x:left-8,y:p+4,'text-anchor':'end'}, [tickText(v)]));
  }
  // Keep endpoint dates and a stable set of passive nodes on resize. Hide only
  // colliding labels, never observations or hit targets. Reserve the final date
  // before placing interior ticks, so it cannot overlap a nearby penultimate one.
  const tickCount=horizontal?n:Math.min(5,n);
  const indices=Array.from({length:tickCount},(_,i)=>tickCount===1?0:Math.round(i*(n-1)/(tickCount-1)));
  const textWidth=text=>[...text].reduce((sum,c)=>sum+(/[\x00-\x7f]/u.test(c)?6.8:11),0);
  const lastLabel=spec.labels[n-1],lastShort=lastLabel.length>10?lastLabel.slice(0,9)+'…':lastLabel;
  const lastStart=w-right-textWidth(lastShort);
  let previousEnd=-Infinity;
  for (const i of indices) {
    const label=spec.labels[i], short=label.length>(horizontal?12:10)?label.slice(0,horizontal?11:9)+'…':label;
    const size=textWidth(short),x=n===1?left+pw/2:i===0?left:i===n-1?w-right:cat(i);
    const anchor=n===1?'middle':i===0?'start':i===n-1?'end':'middle';
    const start=x-(anchor==='start'?0:anchor==='end'?size:size/2),end=start+size;
    const hidden=!horizontal&&i>0&&i<n-1&&(start<previousEnd+10||end>lastStart-10);
    if(!hidden)previousEnd=end;
    axes.push(node('text', horizontal ? {x:left-8,y:cat(i)+4,'text-anchor':'end'} : {x,y:h-10,'text-anchor':anchor,...(hidden?{visibility:'hidden','aria-hidden':'true'}:{})}, [node('title',{},[label]),short]));
  }
  const groups=[], count=spec.series.filter((s,si)=>visible[si] && (kind!=='combo'||(s.kind??(si===0?'bar':'line'))==='bar')).length || 1;
  let barIndex=0;
  for (const [si,s] of spec.series.entries()) {
    if(!visible[si])continue;
    const type = kind==='combo' ? s.kind??(si===0?'bar':'line') : kind;
    const marks=[];
    const line = ['line','area','stackedArea','step'].includes(type);
    if(line) {
      const points=ranges[si].map((r,i)=>[cat(i),pos(r[1])]);
      const d=points.map(([x,y],i)=>i===0?`M${x},${y}`:type==='step'?`H${x}V${y}`:`L${x},${y}`).join(' ');
      if(type==='area'||type==='stackedArea') {
        const base=[...ranges[si]].map((r,i)=>[cat(i),pos(r[0])]).reverse();
        marks.push(node('path',{class:'plot-area',d:`${d} ${base.map(([x,y])=>`L${x},${y}`).join(' ')} Z`,fill:color(si),'fill-opacity':type==='area'?.18:.65}));
      }
      marks.push(node('path',{class:'plot-line',d,fill:'none',stroke:color(si),'stroke-width':2}));
      points.forEach(([x,y],i)=>marks.push(node('circle',{'data-point':i,cx:x,cy:y,r:3,fill:color(si)})));
    } else if(type==='dumbbell') {
      for(let i=0;i<n;i++) {
        if(si===0&&visible[1])marks.push(node('line',{class:'plot-connector',x1:pos(values[0][i]),x2:pos(values[1][i]),y1:cat(i),y2:cat(i),stroke:'var(--sherlock-muted)','stroke-width':3}));
        marks.push(node('circle',{'data-point':i,cx:pos(values[si][i]),cy:cat(i),r:4,fill:color(si)}));
      }
    } else {
      const band=(horizontal?ph:pw)/n*.7, thickness=band/(stacked?1:count), offset=stacked?0:barIndex*thickness;
      for(let i=0;i<n;i++) {
        const [a,b]=ranges[si][i], p=pos(a), q=pos(b), at=cat(i)-band/2+offset;
        const signColors=spec.colorBySign===true||spec.colorBySign===undefined&&['bar','horizontal','lollipop'].includes(kind)&&/正绿负红/u.test(spec.subtitle??'');
        const fill=signColors?`var(--sherlock-${b>0?'market-positive':b<0?'market-negative':'muted'})`:color(si);
        if(type==='lollipop') {
          marks.push(node('line',{class:'plot-stem',x1:p,x2:q,y1:at+thickness/2,y2:at+thickness/2,stroke:fill,'stroke-width':2}));
          marks.push(node('circle',{'data-point':i,cx:q,cy:at+thickness/2,r:4,fill}));
        } else marks.push(node('rect',horizontal
          ? {'data-point':i,x:Math.min(p,q),y:at,width:Math.abs(q-p),height:Math.max(.5,thickness-2),fill,'data-grow-axis':'x','data-grow-origin':b<a?'right center':'left center'}
          : {'data-point':i,x:at,y:Math.min(p,q),width:Math.max(.5,thickness-2),height:Math.abs(q-p),fill,'data-grow-origin':b<a?'center top':'center bottom'}));
      }
      barIndex++;
    }
    groups.push(node('g',{'data-series':si},marks));
  }
  // Full-band targets keep small points and zero values keyboard/pointer usable.
  const hits=spec.labels.map((label,i)=>node('rect',horizontal
    ? {class:'hit','data-point':i,x:left,y:top+i*ph/n,width:pw,height:ph/n,fill:'transparent'}
    : {class:'hit','data-point':i,x:left+i*pw/n,y:top,width:pw/n,height:ph,fill:'transparent'}));
  const cursor=node('line',horizontal?{class:'chart-cursor',x1:left,x2:w-right,y1:cat(0),y2:cat(0)}:{class:'chart-cursor',x1:cat(0),x2:cat(0),y1:top,y2:h-bottom});
  const elements=[...axes,...groups,cursor,...hits];
  return {markup:elements.map(serialize).join(''),elements,width:w,height:h,horizontal,categoryStart:horizontal?top:left,categorySize:(horizontal?ph:pw)/n};
}

export function cartesianChartRuntime(spec, geometry) {
  const svg=document.querySelector('.template-chart'),readout=document.querySelector('.chart-readout');
  const legend=[...document.querySelectorAll('[data-chart-series]')], visible=spec.series.map(()=>true);
  let selected=0, size=null, frame=0;
  const seriesName=name=>{
    const match=name.match(/\s*[（(]([^（）()]+)[）)]\s*$/u);
    return spec.unit&&match?.[1].trim()===spec.unit.trim()?name.slice(0,match.index).trimEnd():name;
  };
  // Old saved headers receive the same display-only normalization. Do not
  // replace buttons or column handles: their saved interaction paths persist.
  const headers=[...document.querySelectorAll('details table thead th')];
  spec.series.forEach((series,i)=>{
    const header=headers[i+1];if(!header)return;
    const label=seriesName(series.name)+(spec.unit?'（'+spec.unit+'）':'');
    const button=header.querySelector('button');
    const text=[...(button??header).childNodes].find(node=>node.nodeType===3);
    if(text)text.textContent=label;
    if(header.hasAttribute('data-column-label'))header.setAttribute('data-column-label',label);
    if(button?.hasAttribute('aria-label'))button.setAttribute('aria-label','按'+label+'排序');
  });
  const describe=()=>{
    const total=spec.series.reduce((sum,s,i)=>sum+(visible[i]?s.values[selected]:0),0);
    const parts=spec.series.flatMap((s,i)=>visible[i]?[seriesName(s.name)+' '+s.values[selected]+(spec.unit?' '+spec.unit:'')+(spec.variant==='percentBar'?' ('+(total?s.values[selected]/total*100:0).toFixed(1)+'%)':'')]:[]);
    readout.textContent=spec.labels[selected]+' · '+parts.join(' · ');
    svg.setAttribute('aria-label',readout.textContent+'；左右方向键查看相邻数据');
    if(size){const p=size.categoryStart+(selected+.5)*size.categorySize,cursor=svg.querySelector('.chart-cursor');for(const key of size.horizontal?['y1','y2']:['x1','x2'])cursor.setAttribute(key,String(p));}
  };
  // createElementNS/textContent work under the preview's Trusted Types policy.
  // No HTML parsing or model-supplied markup enters the live SVG.
  const mount=part=>{
    if(typeof part==='string')return document.createTextNode(part);
    const el=document.createElementNS('http://www.w3.org/2000/svg',part.tag);
    for(const [key,value] of Object.entries(part.attributes))el.setAttribute(key,String(value));
    el.append(...part.children.map(mount));return el;
  };
  let lastWidth=0,lastHeight=0;
  const draw=()=>{
    frame=0;lastWidth=svg.parentElement.clientWidth;lastHeight=window.innerHeight;describe();
    const outerHeight=element=>{const style=getComputedStyle(element);return style.display==='none'?0:element.getBoundingClientRect().height+parseFloat(style.marginTop||0)+parseFloat(style.marginBottom||0);};
    const bodyStyle=getComputedStyle(document.body);
    const disclosures=[...document.querySelectorAll('body>details,body>.component-reading-footer')].map(el=>{
      const style=getComputedStyle(el),summary=el.querySelector('summary');
      return (summary?outerHeight(summary):0)+['marginTop','marginBottom','paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum,key)=>sum+(parseFloat(style[key])||0),0);
    });
    // Expanded records scroll naturally; they must not squash the chart.
    const compactFooter=document.querySelector('.component-reading-footer');
    const tabBar=document.querySelector('.component-reading-tabs:not([hidden])');
    const footerHeight=tabBar?outerHeight(tabBar):compactFooter?Math.max(0,...disclosures):disclosures.reduce((sum,h)=>sum+h,0);
    const chrome=[...document.querySelectorAll('.chart-context,.legend,.chart-readout,figcaption')].reduce((sum,el)=>sum+outerHeight(el),0)+parseFloat(bodyStyle.paddingTop)+parseFloat(bodyStyle.paddingBottom)+footerHeight+2;
    // The host fits the card to its open records. Use an intrinsic plot height
    // here instead of feeding the newly enlarged iframe back into the plot.
    // This also keeps the tabs in place when switching between detail panels.
    const expanded=document.body.dataset.componentReadingTabs==='expanded'||!tabBar&&document.querySelector('body>details[open]');
    size=geometry(spec,lastWidth,visible,expanded?240:lastHeight-chrome);svg.setAttribute('viewBox',`0 0 ${size.width} ${size.height}`);svg.style.height=size.height+'px';svg.replaceChildren(...size.elements.map(mount));describe();
  };
  const select=i=>{selected=Math.max(0,Math.min(spec.labels.length-1,i));describe();};
  svg.addEventListener('pointermove',event=>{const el=event.target.closest('[data-point]');if(el)select(Number(el.dataset.point));});
  svg.addEventListener('click',event=>{const el=event.target.closest('[data-point]');if(el)select(Number(el.dataset.point));});
  svg.addEventListener('keydown',event=>{const i=['ArrowLeft','ArrowUp'].includes(event.key)?selected-1:['ArrowRight','ArrowDown'].includes(event.key)?selected+1:event.key==='Home'?0:event.key==='End'?spec.labels.length-1:null;if(i===null)return;event.preventDefault();select(i);});
  legend.forEach((button,i)=>button.addEventListener('click',()=>{
    if(visible[i]&&visible.filter(Boolean).length===1)return;
    visible[i]=!visible[i];button.setAttribute('aria-pressed',String(visible[i]));draw();
  }));
  const schedule=()=>{if((svg.parentElement.clientWidth!==lastWidth||window.innerHeight!==lastHeight)&&!frame)frame=requestAnimationFrame(draw);};
  const observer=new ResizeObserver(schedule);observer.observe(svg.parentElement);window.addEventListener('resize',schedule);draw();
  const presentation=()=>{if(!frame)frame=requestAnimationFrame(draw);};
  window.addEventListener('sherlock-presentation-change',presentation);
  // Host metadata/styles are appended after this script in saved previews.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',draw,{once:true});
  window.addEventListener('pagehide',()=>{observer.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('sherlock-presentation-change',presentation);if(frame)cancelAnimationFrame(frame);},{once:true});
}

export function renderCartesianChart(spec) {
  if(!CARTESIAN_CHART_TEMPLATES.some(t=>t.variant===spec?.variant)||chartDataIssue(spec))return undefined;
  // Keep the original native line/bar data path for existing saved consumers.
  if(['line','bar'].includes(spec.variant)&&!['asOf','unit','subtitle','note','axisDecimals','detailRows'].some(k=>spec[k]!==undefined)&&spec.labels.length<=24&&spec.series.length<=6)return undefined;
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const precise=spec.axisDecimals!==undefined,geometryProgram=precise?'('+cartesianChartAxisPrecision.toString()+')('+cartesianChartSvg.toString()+')':cartesianChartSvg.toString();
  const geometry=(precise?cartesianChartAxisPrecision(cartesianChartSvg):cartesianChartSvg)(spec);
  const {seriesNames,seriesHeaders,detailColumns,selectedDetails}=cartesianChartPresentation(spec);
  // Notes verifies the original script and read-only table shape verbatim.
  // The preview upgrades that program only after the artifact is accepted.
  const plottedHeaders=spec.detailRows?seriesHeaders:spec.series.map(series=>series.name+(spec.unit?' ('+spec.unit+')':''));
  const headers=[detailColumns[0]??'分类',...plottedHeaders,...selectedDetails.map(column=>detailColumns[column])];
  const rows=spec.labels.map((label,i)=>{
    const values=[label,...spec.series.map(series=>series.values[i]),...selectedDetails.map(column=>spec.detailRows[i][column])];
    return `<tr>${values.map(value=>`<td>${esc(value===null?'—':value)}</td>`).join('')}</tr>`;
  }).join('');
  const encoded=JSON.stringify(spec).replace(/</g,'\\u003c');
  const program=spec.detailRows
    ? `(${cartesianChartReadingRuntime.toString()})(${encoded},${geometryProgram},${cartesianChartPresentation.toString()});`
    : `(${cartesianChartRuntime.toString()})(${encoded},${geometryProgram});`;
  const html=`<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:10px 12px;font:12px/1.5 var(--sherlock-font-sans);color:var(--sherlock-text);background:var(--sherlock-surface)}*{box-sizing:border-box}figure{margin:0;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;column-gap:12px}
.chart-context,figcaption{color:var(--sherlock-muted);overflow-wrap:anywhere}
.chart-context:empty{display:none}
.legend{display:flex;gap:4px 12px;flex-wrap:wrap;grid-column:2;justify-content:flex-end}
.chart-context:empty+.legend{grid-column:1/-1;justify-content:flex-start}
figure>svg,.chart-readout,figcaption{grid-column:1/-1}
@media(max-width:359px){figure{grid-template-columns:minmax(0,1fr)}.legend{grid-column:1;justify-content:flex-start}}.legend button{font:inherit;display:flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--sherlock-control-text,var(--sherlock-text));padding:3px 0;cursor:pointer;min-width:0;max-width:100%;overflow-wrap:anywhere;text-align:left}.legend i{width:12px;height:3px;flex:none;background:var(--series)}.legend button[aria-pressed="false"]{opacity:.4}.legend button:focus-visible{outline:1px solid var(--sherlock-muted)}svg{display:block;width:100%;max-width:100%;overflow:visible}svg text{fill:var(--sherlock-muted);font:11px var(--sherlock-font-sans)}.grid{stroke:var(--sherlock-border);stroke-width:.5}.chart-cursor{stroke:var(--sherlock-muted);stroke-width:1;stroke-dasharray:3 3;pointer-events:none}.chart-readout{background:var(--sherlock-surface-muted);color:var(--sherlock-text);min-height:36px;padding:6px 8px;margin:6px 0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.chart-readout-category{color:var(--sherlock-muted)}
.chart-readout-series strong{font-weight:650;font-variant-numeric:tabular-nums}
figcaption{font-size:11px;white-space:pre-wrap}details{border-top:1px solid var(--sherlock-border);margin-top:8px;padding-top:6px}summary{cursor:pointer}.data-scroll{max-height:200px;overflow:auto}table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:11px}th,td{text-align:right;padding:5px 8px;border-bottom:1px solid var(--sherlock-border)}th:first-child,td:first-child{text-align:left}thead{color:var(--sherlock-text);background:var(--sherlock-surface-muted)}tbody tr:hover{background:var(--sherlock-surface-muted)}
</style></head><body data-research-kind="chart" data-chart-template="${spec.variant}"><figure><div class="chart-context">${esc([spec.subtitle,spec.variant==='percentBar'?'占比 · 原值单位：'+(spec.unit||'未提供'):spec.unit].filter(Boolean).join(' · '))}</div><div class="legend">${spec.series.map((_,i)=>`<button type="button" data-chart-series="${i}" aria-pressed="true" aria-label="显示或隐藏${esc(seriesNames[i])}"><i style="--series:var(--sherlock-chart-${i%8+1},var(--sherlock-chart-${i%6+1}))"></i>${esc(seriesNames[i])}</button>`).join('')}</div><svg class="template-chart" viewBox="0 0 ${geometry.width} ${geometry.height}" height="240" role="img" tabindex="0" aria-label="${esc(spec.title)}">${geometry.markup}</svg><div class="chart-readout" role="status" aria-live="polite">${esc(spec.labels[0])}</div><figcaption>${esc([spec.asOf,spec.note].filter(Boolean).join(' · '))}</figcaption></figure><details><summary>查看完整数据</summary><div class="data-scroll"><table><thead><tr><th>${esc(headers[0])}</th>${headers.slice(1).map(name=>`<th>${esc(name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></details><script>${program}</script></body></html>`;
  const content=spec.detailRows?html.replace('</body>',`<script>(${installCartesianChartDetails.toString()})(${encoded},${JSON.stringify(selectedDetails)});</script></body>`):html;
  return {version:1,type:'html',title:spec.title,html:content};
}

export function cartesianChartPresentation(spec) {
  const unit=typeof spec.unit==='string'?spec.unit.trim():'';
  const withoutUnit=name=>{
    let label=name.trim();
    while(unit){
      const suffix=label.match(/\s*[（(]([^（）()]+)[）)]$/u);
      const base=suffix&&label.slice(0,suffix.index).trimEnd();
      if(!base||suffix[1].trim()!==unit)break;
      label=base;
    }
    return label;
  };
  const seriesNames=spec.series.map(series=>withoutUnit(series.name));
  const seriesHeaders=seriesNames.map(name=>unit?name+'（'+unit+'）':name);
  const detailColumns=Array.isArray(spec.detailColumns)?spec.detailColumns:[];
  const selectedDetails=[],duplicateDetails=[];
  for(let column=1;column<detailColumns.length;column++){
    const detail=detailColumns[column];
    const duplicate=typeof detail==='string'&&Array.isArray(spec.detailRows)&&spec.detailRows.length===spec.labels.length&&
      spec.series.some((series,i)=>withoutUnit(detail)===seriesNames[i]&&
        spec.detailRows.every((row,point)=>row?.[column]===series.values[point]));
    (duplicate?duplicateDetails:selectedDetails).push(column);
  }
  return {unit,seriesNames,seriesHeaders,detailColumns,selectedDetails,duplicateDetails};
}

export function cartesianChartReadingRuntime(spec, geometry, presentation) {
  const svg=document.querySelector('.template-chart'),readout=document.querySelector('.chart-readout');
  const legend=[...document.querySelectorAll('[data-chart-series]')], visible=spec.series.map(()=>true);
  const {unit,seriesNames,seriesHeaders,detailColumns,duplicateDetails}=presentation(spec);
  let selected=['line','step'].includes(spec.variant)?spec.labels.length-1:0, size=null, frame=0;
  const setLabel=(element,label)=>{
    if(!element)return;
    const text=[...element.childNodes].find(node=>node.nodeType===3);
    if(text&&text.textContent!==label)text.textContent=label;
  };
  // Preserve legacy sorting controls and the original routes of the saved
  // table. New artifacts omit the duplicate cells when the table is rendered.
  const table=document.querySelector('body>details table'),headers=[...(table?.tHead?.querySelector('tr')?.cells??[])];
  if(duplicateDetails.length&&headers.length===spec.series.length+detailColumns.length){
    for(const row of table.rows)for(const column of duplicateDetails){
      const cell=row.cells[spec.series.length+column];
      if(cell)cell.hidden=true;
    }
  }
  spec.series.forEach((_,i)=>{
    const label=seriesHeaders[i],header=headers[i+1],button=header?.querySelector('button');
    setLabel(button??header,label);
    if(header?.hasAttribute('data-column-label'))header.setAttribute('data-column-label',label);
    if(button?.hasAttribute('aria-label'))button.setAttribute('aria-label','按'+label+'排序');
    setLabel(legend[i],seriesNames[i]);
    if(legend[i])legend[i].setAttribute('aria-label','显示或隐藏'+seriesNames[i]);
  });
  const readoutContent=document.createElement('span');
  readoutContent.className='chart-readout-content';
  readout.replaceChildren(readoutContent);
  const describe=()=>{
    const total=spec.series.reduce((sum,s,i)=>sum+(visible[i]?s.values[selected]:0),0);
    const category=document.createElement('span');
    category.className='chart-readout-category';category.textContent=spec.labels[selected];
    const fields=[category];
    for(const [i,series] of spec.series.entries()){
      if(!visible[i])continue;
      const field=document.createElement('span'),value=document.createElement('strong');
      const raw=series.values[selected];
      field.className='chart-readout-series';value.textContent=String(raw);
      const percent=spec.variant==='percentBar'?' ('+(total?raw/total*100:0).toFixed(1)+'%)':'';
      field.append(' · '+seriesNames[i]+' ',value,(unit?' '+unit:'')+percent);
      fields.push(field);
    }
    readoutContent.replaceChildren(...fields);
    svg.setAttribute('aria-label',readout.textContent+'；左右方向键查看相邻数据');
    if(size){const p=size.categoryStart+(selected+.5)*size.categorySize,cursor=svg.querySelector('.chart-cursor');for(const key of size.horizontal?['y1','y2']:['x1','x2'])cursor.setAttribute(key,String(p));}
  };
  // createElementNS/textContent work under the preview's Trusted Types policy.
  // No HTML parsing or model-supplied markup enters the live SVG.
  const mount=part=>{
    if(typeof part==='string')return document.createTextNode(part);
    const el=document.createElementNS('http://www.w3.org/2000/svg',part.tag);
    for(const [key,value] of Object.entries(part.attributes))el.setAttribute(key,String(value));
    el.append(...part.children.map(mount));return el;
  };
  // Append passive labels after the existing hit targets. Their routes and
  // the source order stay stable for saved keyboard and pointer selections.
  const labelComparison=()=>{
    if(spec.variant!=='horizontal'||visible.filter(Boolean).length!==1)return;
    const index=visible.indexOf(true),bars=[...svg.querySelectorAll('g[data-series="'+index+'"] rect[data-point]')];
    if(!bars.length)return;
    const hit=svg.querySelector('.hit'),left=Number(hit.getAttribute('x')),right=left+Number(hit.getAttribute('width'));
    const overlay=document.createElementNS(svg.namespaceURI,'g');
    overlay.setAttribute('pointer-events','none');overlay.setAttribute('aria-hidden','true');
    const mark=(tag,attrs,text)=>{
      const el=document.createElementNS(svg.namespaceURI,tag);
      for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
      if(text!==undefined)el.textContent=text;
      overlay.append(el);return el;
    };
    const top=size.categoryStart,bottom=top+spec.labels.length*size.categorySize;
    for(const [i,bar] of bars.entries()){
      const value=spec.series[index].values[i],bx=Number(bar.getAttribute('x')),bw=Number(bar.getAttribute('width'));
      const end=value<0?bx:bx+bw;
      if(i===0){
        const zero=value<0?bx+bw:bx;
        mark('line',{x1:zero,x2:zero,y1:top,y2:bottom,stroke:'var(--sherlock-muted)','stroke-width':1,'data-comparison-zero':''});
      }
      const text=value.toLocaleString('zh-CN',{maximumSignificantDigits:6}),length=text.length*6.5;
      const after=value>=0?end+5+length<=right:end-5-length<left;
      const label=mark('text',{'data-comparison-value':'',x:after?Math.min(right-length,end+5):Math.max(left+length,end-5),y:top+(i+.5)*size.categorySize+4,'text-anchor':after?'start':'end'},text);
      label.style.cssText='font-weight:600;fill:var(--sherlock-text);paint-order:stroke;stroke:var(--sherlock-surface);stroke-width:3px;stroke-linejoin:round';
    }
    svg.append(overlay);
  };
  let lastWidth=0,lastHeight=0;
  const draw=()=>{
    frame=0;lastWidth=svg.parentElement.clientWidth;lastHeight=window.innerHeight;describe();
    const outerHeight=element=>{const style=getComputedStyle(element);return style.display==='none'?0:element.getBoundingClientRect().height+parseFloat(style.marginTop||0)+parseFloat(style.marginBottom||0);};
    const bodyStyle=getComputedStyle(document.body);
    const disclosures=[...document.querySelectorAll('body>details,body>.component-reading-footer')].map(el=>{
      const style=getComputedStyle(el),summary=el.querySelector('summary');
      return (summary?outerHeight(summary):0)+['marginTop','marginBottom','paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum,key)=>sum+(parseFloat(style[key])||0),0);
    });
    // Expanded records scroll naturally; they must not squash the chart.
    const compactFooter=document.querySelector('.component-reading-footer');
    const tabBar=document.querySelector('.component-reading-tabs:not([hidden])');
    const footerHeight=tabBar?outerHeight(tabBar):compactFooter?Math.max(0,...disclosures):disclosures.reduce((sum,h)=>sum+h,0);
    const headerHeight=svg.getBoundingClientRect().top-svg.parentElement.getBoundingClientRect().top;
    const chrome=headerHeight+[...document.querySelectorAll('.chart-readout,figcaption')].reduce((sum,el)=>sum+outerHeight(el),0)+parseFloat(bodyStyle.paddingTop)+parseFloat(bodyStyle.paddingBottom)+footerHeight+2;
    // The host fits the card to its open records. Use an intrinsic plot height
    // here instead of feeding the newly enlarged iframe back into the plot.
    // This also keeps the tabs in place when switching between detail panels.
    const expanded=document.body.dataset.componentReadingTabs==='expanded'||!tabBar&&document.querySelector('body>details[open]');
    size=geometry(spec,lastWidth,visible,expanded?240:lastHeight-chrome);svg.setAttribute('viewBox',`0 0 ${size.width} ${size.height}`);svg.style.height=size.height+'px';svg.replaceChildren(...size.elements.map(mount));labelComparison();describe();
  };
  const select=i=>{
    const next=Math.max(0,Math.min(spec.labels.length-1,i));
    if(next===selected)return;
    selected=next;describe();
  };
  svg.addEventListener('pointermove',event=>{const el=event.target.closest('[data-point]');if(el)select(Number(el.dataset.point));});
  svg.addEventListener('click',event=>{const el=event.target.closest('[data-point]');if(el)select(Number(el.dataset.point));});
  svg.addEventListener('keydown',event=>{const i=['ArrowLeft','ArrowUp'].includes(event.key)?selected-1:['ArrowRight','ArrowDown'].includes(event.key)?selected+1:event.key==='Home'?0:event.key==='End'?spec.labels.length-1:null;if(i===null)return;event.preventDefault();select(i);});
  legend.forEach((button,i)=>button.addEventListener('click',()=>{
    if(visible[i]&&visible.filter(Boolean).length===1)return;
    visible[i]=!visible[i];button.setAttribute('aria-pressed',String(visible[i]));draw();
  }));
  const schedule=()=>{if((svg.parentElement.clientWidth!==lastWidth||window.innerHeight!==lastHeight)&&!frame)frame=requestAnimationFrame(draw);};
  const observer=new ResizeObserver(schedule);observer.observe(svg.parentElement);window.addEventListener('resize',schedule);draw();
  const schedulePresentation=()=>{if(!frame)frame=requestAnimationFrame(draw);};
  window.addEventListener('sherlock-presentation-change',schedulePresentation);
  // Host metadata/styles are appended after this script in saved previews.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',draw,{once:true});
  window.addEventListener('pagehide',()=>{observer.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('sherlock-presentation-change',schedulePresentation);if(frame)cancelAnimationFrame(frame);},{once:true});
}

// Supplementary fields stay in one collapsed table. Sorting changes its view,
// never the chart's source order or the relationship between labels and values.
export function installCartesianChartDetails(spec, selectedDetails) {
  const table=document.querySelector('body[data-chart-template] details table');
  if(!table||!spec.detailRows)return;
  const rows=[...table.tBodies[0].rows],headers=[...table.tHead.rows[0].cells];
  const values=spec.labels.map((label,i)=>[label,...spec.series.map(series=>series.values[i]),...selectedDetails.map(column=>spec.detailRows[i][column])]);
  const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
  let selected=-1,ascending=true;
  headers.forEach((header,column)=>{
    const label=header.getAttribute('data-column-label')||header.textContent.trim();
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.setAttribute('aria-label','按'+label+'排序');button.dataset.chartDetailColumn=String(column);
    button.style.cssText='display:flex;align-items:center;color:inherit;background:transparent;border:0;font:inherit;cursor:pointer';
    [...header.childNodes].filter(node=>node.nodeType===3).forEach(node=>node.remove());header.prepend(button);header.setAttribute('aria-sort','none');
    button.addEventListener('click',()=>{
      ascending=selected===column?!ascending:true;selected=column;
      headers.forEach((cell,i)=>cell.setAttribute('aria-sort',i===column?(ascending?'ascending':'descending'):'none'));
      const ordered=rows.map((row,i)=>({row,i,value:values[i][column]})).sort((a,b)=>{
        const missing=value=>value===null||value==='';
        if(missing(a.value)!==missing(b.value))return missing(a.value)?1:-1;
        const order=typeof a.value==='number'&&typeof b.value==='number'?a.value-b.value:collator.compare(String(a.value??''),String(b.value??''));
        return (ascending?order:-order)||a.i-b.i;
      });
      table.tBodies[0].append(...ordered.map(entry=>entry.row));
    });
  });
}

/** Optional numeric formatting; base geometry owns label spacing and positions. */
export function cartesianChartAxisPrecision(base) {
  return function preciseCartesianChart(spec,...args) {
    const result=base(spec,...args),digits=spec.axisDecimals;
    for(const element of result.elements) {
      if(element.tag!=='text'||element.children.length!==1||typeof element.children[0]!=='string')continue;
      const text=element.children[0],percent=text.endsWith('%'),number=Number(text.replace(/,/g,'').replace(/%$/,''));
      if(!/^-?[\d,]+(?:\.\d+)?%?$/.test(text)||!Number.isFinite(number))continue;
      element.children[0]=number.toLocaleString('en-US',{maximumFractionDigits:digits})+(percent?'%':'');
    }
    // Compact saved artifacts retain one exact data model. Their SVG is drawn
    // by the existing runtime; an empty detail table is populated from it once.
    const svg=typeof document==='object'&&document.body?.dataset.researchKind==='chart'?document.querySelector('svg.template-chart'):null;
    if(svg&&!svg.__chartPrecisionPresentation) {
      Object.defineProperty(svg,'__chartPrecisionPresentation',{value:true});
      const table=document.querySelector('details table tbody');
      if(table&&!table.children.length)for(let i=0;i<spec.labels.length;i++) {
        const row=document.createElement('tr');
        for(const value of [spec.labels[i],...spec.series.map(series=>series.values[i])]){const cell=document.createElement('td');cell.textContent=String(value).replace(/\r\n?/g,'\n').replace(/\0/g,'\ufffd');row.append(cell);}
        table.append(row);
      }
      const highlight=()=>{
        const label=svg.getAttribute('aria-label')||'',selected=svg.matches(':hover,:focus')?spec.labels.findIndex(value=>label.startsWith(value+' · ')):-1;
        for(const point of svg.querySelectorAll('circle[data-point]'))point.classList.toggle('chart-selected-point',Number(point.getAttribute('data-point'))===selected);
      };
      new MutationObserver(highlight).observe(svg,{attributes:true,attributeFilter:['aria-label'],childList:true});
      for(const event of ['pointerenter','pointerleave','focus','blur'])svg.addEventListener(event,highlight);
      highlight();
    }
    const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const serialize=element=>typeof element==='string'?escape(element):`<${element.tag}${Object.entries(element.attributes).map(([key,value])=>` ${key}="${escape(value)}"`).join('')}>${element.children.map(serialize).join('')}</${element.tag}>`;
    return {...result,markup:result.elements.map(serialize).join('')};
  };
}
