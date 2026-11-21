// Frozen host programs emitted by EWork Odyssey 1.6.9 (commit 9844dc5fd).
// Loaded as text for exact matching of saved Notes chart journals, never executed.

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
