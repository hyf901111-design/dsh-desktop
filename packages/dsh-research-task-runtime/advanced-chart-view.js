// Pure SVG descriptors; this same function runs in the production HTML sandbox.
export function advancedChartView(spec,width=624,options={}){
 const node=(tag,attributes={},children=[])=>({tag,attributes,children});
 const text=(x,y,s,a={})=>node('text',{x,y,...a},[String(s)]);
 const fmt=v=>Number(v.toPrecision(6)).toLocaleString('en-US');
 const short=(s,n=10)=>s.length>n?s.slice(0,n-1)+'…':s;
 const color=i=>`var(--sherlock-chart-${i%6+1})`;
 const unit=spec.unit?' '+spec.unit:'',pct=v=>v===null?'—':fmt(v*100)+'%';
 const kind=spec.variant,w=Math.max(280,width),elements=[],rows=[],metrics={};
 let h=Math.max(160,Math.min(264,Number.isFinite(options.height)?options.height:264)),summary='',footnote='',headers=['项目','数值'+unit],legend=[];
 const row=(label,cells,detail)=>{rows.push({label,cells,detail});return rows.length-1;};
 const group=(i,marks)=>node('g',{'data-inspect':i},[node('title',{},[rows[i].detail]),...marks]);
 const line=(x1,y1,x2,y2,a={})=>node('line',{x1,y1,x2,y2,...a});
 const domain=values=>{let lo=Math.min(...values),hi=Math.max(...values);const pad=(hi-lo)*.07||Math.max(1,Math.abs(lo)*.05);return [lo-pad,hi+pad];};
 const yGrid=(lo,hi,left,right,top,bottom)=>{
  const y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top);
  const raw=(hi-lo)/4,power=10**Math.floor(Math.log10(raw)),step=([1,2,2.5,5,10].find(n=>n>=raw/power)??10)*power;
  for(let k=Math.ceil(lo/step);k*step<=hi+step*1e-8;k++){const v=k*step,yy=y(v);elements.push(line(left,yy,right,yy,{class:'grid'}),text(left-7,yy+4,fmt(v),{'text-anchor':'end'}));}
  return y;
 };
 if(kind==='waterfall'){
  let current=spec.start.value;const steps=[{label:spec.start.label,from:0,to:current,value:current,total:true}];
  for(const s of spec.steps){steps.push({label:s.label,from:current,to:current+s.delta,value:s.delta,total:false});current+=s.delta;}
  steps.push({label:spec.endLabel??'期末',from:0,to:current,value:current,total:true});metrics.steps=steps;
  const values=steps.flatMap(s=>[s.from,s.to]),lo=Math.min(0,...values),hi=Math.max(0,...values),span=hi-lo||1;
  const left=48,right=w-14,bottom=h-36,y=yGrid(lo<0?lo-span*.04:0,hi+span*.08,left,right,16,bottom),step=(right-left)/steps.length,bw=Math.min(48,step*.65);
  steps.forEach((s,i)=>{
   const x=left+(i+.5)*step,detail=`${s.label} · ${s.total?'总额':'变动'} ${fmt(s.value)}${unit} · 累计 ${fmt(s.to)}${unit}`;
   row(s.label,[fmt(s.value),fmt(s.to)],detail);
   if(i&&i<steps.length-1)elements.push(line(x-step+bw/2,y(s.from),x-bw/2,y(s.from),{class:'grid','stroke-dasharray':'3 3'}));
   elements.push(group(i,[node('rect',{class:'waterfall-bar',x:x-bw/2,y:Math.min(y(s.from),y(s.to)),width:bw,height:Math.max(1,Math.abs(y(s.from)-y(s.to))),fill:color(s.total?0:s.value>=0?1:2),'data-grow-origin':s.to>=s.from?'center bottom':'center top'})]));
   if(step>=46)elements.push(text(x,Math.min(y(s.from),y(s.to))-5,(!s.total&&s.value>0?'+':'')+fmt(s.value),{'text-anchor':'middle'}));
   const stride=Math.max(1,Math.ceil(steps.length/Math.max(3,Math.floor((right-left)/64))));
   // Reserve one full tick interval for the final total. Adding the final
   // category beside a regular tick makes their labels overlap on narrow cards.
   if(i===0||i===steps.length-1||i%stride===0&&steps.length-1-i>=stride)elements.push(text(x,h-15,short(s.label,6),{'text-anchor':'middle'}));
  });
  headers=['项目','本项'+unit,'累计'+unit];summary=`期初 ${fmt(spec.start.value)} → 期末 ${fmt(current)}${unit}`;footnote='期末由期初与全部有符号增减累计；方向键查看每项';
 }else if(kind==='funnel'){
  h=Math.max(h,spec.stages.length*32+12);const left=86,right=w-70,max=spec.stages[0].value,step=(h-12)/spec.stages.length;
  metrics.stages=spec.stages.map((s,i)=>({...s,ratio:max?s.value/max:null,stepRatio:i&&spec.stages[i-1].value?s.value/spec.stages[i-1].value:i===0&&max?1:null}));
  metrics.stages.forEach((s,i)=>{
   const bw=max?(right-left)*s.value/max:0,y=6+i*step;
   row(s.label,[fmt(s.value),pct(s.ratio),pct(s.stepRatio)],`${s.label} · ${fmt(s.value)}${unit} · 占初始 ${pct(s.ratio)} · 较上阶段 ${pct(s.stepRatio)}`);
   elements.push(group(i,[node('rect',{class:'funnel-stage',x:(left+right-bw)/2,y:y+3,width:bw,height:step-9,fill:color(i),'data-grow-axis':'x','data-grow-origin':'center center'}),node('rect',{class:'hit',x:0,y,width:w,height:step,fill:'transparent'}),text(left-8,y+step/2+3,short(s.label,7),{'text-anchor':'end'}),text(right+7,y+step/2+3,fmt(s.value))]));
  });
  headers=['阶段','人数'+unit,'占初始','较上阶段'];summary=`初始 ${fmt(max)}${unit} · 最终转化 ${pct(metrics.stages.at(-1).ratio)}`;footnote='阶段宽度与人数成比例；完整数据区分初始与环节转化';
 }else if(kind==='sankey'){
  const nodes=spec.nodes.map(n=>({...n,input:0,output:0})),byId=new Map(nodes.map(n=>[n.id,n]));
  spec.links.forEach(l=>{byId.get(l.source).output+=l.value;byId.get(l.target).input+=l.value;});nodes.forEach(n=>n.value=Math.max(n.input,n.output));
  const columns=spec.columns.map((_,i)=>nodes.filter(n=>n.column===i)),total=columns[0].reduce((s,n)=>s+n.value,0),gap=10;
  h=Math.max(h,Math.max(...columns.map(c=>c.length))*25+32);
  const scale=Math.min(...columns.map(c=>(h-42-(c.length-1)*gap)/total)),nw=12,step=(w-36-nw)/(columns.length-1);
  columns.forEach((col,ci)=>{let y=28;elements.push(text(18+ci*step,14,short(spec.columns[ci],7),{'text-anchor':ci===columns.length-1?'end':'start'}));col.forEach(n=>{n.x=18+ci*step;n.y=y;n.height=n.value*scale;n.outY=y;n.inY=y;y+=n.height+gap;});});
  const links=[];
  spec.links.forEach(l=>{
   const a=byId.get(l.source),b=byId.get(l.target),thickness=l.value*scale,x=a.x+nw,xx=b.x,mid=(x+xx)/2,y=a.outY,yy=b.inY;
   const i=row(a.label+' → '+b.label,[fmt(l.value),pct(l.value/a.output)],`${a.label} → ${b.label} · ${fmt(l.value)}${unit} · 占${a.label} ${pct(l.value/a.output)}`);
   elements.push(group(i,[node('path',{class:'flow-ribbon',d:`M${x},${y} C${mid},${y} ${mid},${yy} ${xx},${yy} L${xx},${yy+thickness} C${mid},${yy+thickness} ${mid},${y+thickness} ${x},${y+thickness} Z`,fill:color(nodes.indexOf(a)),'fill-opacity':.35})]));a.outY+=thickness;b.inY+=thickness;links.push({...l,thickness});
  });
  nodes.forEach((n,ni)=>{
   const i=row(n.label,[fmt(n.value),'—'],`${n.label} · 流量 ${fmt(n.value)}${unit} · 输入 ${fmt(n.input)} · 输出 ${fmt(n.output)}`);
   const last=n.column===columns.length-1,labelX=last?n.x-5:n.x+nw+5;
   elements.push(group(i,[node('rect',{class:'flow-node',x:n.x,y:n.y,width:nw,height:n.height,fill:color(ni)}),text(labelX,n.y+n.height/2+4,short(n.label,w<400?4:8),{'text-anchor':last?'end':'start',style:'paint-order:stroke;stroke:var(--sherlock-surface);stroke-width:3px'})]));
  });
  metrics.nodes=nodes;metrics.links=links;metrics.total=total;metrics.scale=scale;headers=['路径 / 节点','流量'+unit,'占来源'];summary=`总流量 ${fmt(total)}${unit}`;footnote='带宽与流量成比例；每个中间节点输入输出守恒';
 }else if(['scatter','bubble'].includes(kind)){
  const groups=[...new Set(spec.points.map(p=>p.group??'样本'))];legend=groups.map((label,i)=>({label,color:color(i)}));
  const xd=domain(spec.points.map(p=>p.x)),yd=domain(spec.points.map(p=>p.y)),left=52,right=w-24,top=24,bottom=h-(kind==='bubble'?66:40);
  const x=v=>left+(v-xd[0])/(xd[1]-xd[0])*(right-left),y=yGrid(...yd,left,right,top,bottom),max=kind==='bubble'?Math.max(...spec.points.map(p=>p.size)):1;
  const xRaw=(xd[1]-xd[0])/4,xPower=10**Math.floor(Math.log10(xRaw)),xStep=([1,2,2.5,5,10].find(n=>n>=xRaw/xPower)??10)*xPower;
  for(let k=Math.ceil(xd[0]/xStep);k*xStep<=xd[1];k++){const v=k*xStep;elements.push(text(x(v),bottom+17,fmt(v),{'text-anchor':'middle'}));}
  const axisLabel=axis=>short(axis.label,14)+(axis.unit?' / '+axis.unit:'');
  elements.push(text(left,12,axisLabel(spec.yAxis)),text(right,bottom+33,axisLabel(spec.xAxis),{'text-anchor':'end'}));
  metrics.points=[];metrics.xDomain=xd;metrics.yDomain=yd;
  const radiusMax=Math.min(22,(bottom-top)*.16),visiblePoints=spec.points.filter(p=>options.visible?.[groups.indexOf(p.group??'样本')]!==false);
  visiblePoints.forEach(p=>{
   const gi=groups.indexOf(p.group??'样本'),radius=kind==='bubble'?(max?radiusMax*Math.sqrt(p.size/max):0):4;
   const detail=`${p.label} · ${spec.xAxis.label} ${fmt(p.x)} ${spec.xAxis.unit} · ${spec.yAxis.label} ${fmt(p.y)} ${spec.yAxis.unit}${kind==='bubble'?' · '+spec.sizeLabel+' '+fmt(p.size)+' '+spec.sizeUnit:''} · ${groups[gi]}`;
   const i=row(p.label,[fmt(p.x),fmt(p.y),...(kind==='bubble'?[fmt(p.size)]:[]),groups[gi]],detail);
   const marks=[node('circle',{class:'hit',cx:x(p.x),cy:y(p.y),r:Math.max(8,radius),fill:'transparent'})];
   // A zero bubble has no encoded area; the cross is a discoverable zero marker.
   if(radius)marks.push(node('circle',{class:'point',cx:x(p.x),cy:y(p.y),r:radius,fill:color(gi),'fill-opacity':kind==='bubble'?.45:.8,stroke:color(gi),'stroke-width':1}));
   else marks.push(line(x(p.x)-3,y(p.y)-3,x(p.x)+3,y(p.y)+3,{stroke:'var(--sherlock-muted)'}),line(x(p.x)-3,y(p.y)+3,x(p.x)+3,y(p.y)-3,{stroke:'var(--sherlock-muted)'}));
   elements.push(group(i,marks));metrics.points.push({...p,cx:x(p.x),cy:y(p.y),radius});
  });
  if(kind==='bubble'&&max>0){
   const legendRadius=Math.min(10,radiusMax),yy=h-11;
   for(const [i,ratio]of [0.25,1].entries())elements.push(node('circle',{class:'grid area-legend',style:'stroke:var(--sherlock-muted)',cx:left+12+i*95,cy:yy-2,r:legendRadius*Math.sqrt(ratio),fill:'none',stroke:'var(--sherlock-muted)'}),text(left+27+i*95,yy+2,fmt(max*ratio)+' '+spec.sizeUnit));
   metrics.sizeLegend=[max/4,max];
  }
  headers=['样本',spec.xAxis.label+' / '+spec.xAxis.unit,spec.yAxis.label+' / '+spec.yAxis.unit,...(kind==='bubble'?[spec.sizeLabel+' / '+spec.sizeUnit]:[]),'分组'];summary=`${visiblePoints.length} / ${spec.points.length} 个样本`;
  footnote=kind==='bubble'?`气泡面积对应${spec.sizeLabel}（${spec.sizeUnit}）；最大 ${fmt(max)}，零值以叉号标记；相关不等于因果`:'每点为一个具名样本；筛选保留坐标范围，相关不等于因果';
 }else if(kind==='heatmap'){
  const n=spec.labels.length;h=Math.max(h,n*15+76);const top=24,size=Math.min((w-78)/n,(h-top-52)/n),left=Math.max(66,(w-size*n)/2),right=left+size*n;
  for(let i=0;i<n;i++){
   const labelStride=Math.max(1,Math.ceil(34/size));if(i%labelStride===0)elements.push(text(left+(i+.5)*size,top+n*size+14,short(spec.labels[i],3),{'text-anchor':'middle'}));
   elements.push(text(left-6,top+(i+.5)*size+4,short(spec.labels[i],5),{'text-anchor':'end'}));
   for(let j=0;j<n;j++){
    const v=spec.values[i][j],detail=`${spec.labels[i]} × ${spec.labels[j]} · ${v===null?'未提供相关系数':'相关系数 '+fmt(v)}`,ri=row(spec.labels[i]+' × '+spec.labels[j],[v===null?'未提供':fmt(v)],detail);
    const fill=v===null?'var(--sherlock-surface)':`color-mix(in srgb, ${color(v>=0?0:1)} ${Math.abs(v)*82}%, var(--sherlock-surface-muted))`;
    const marks=[node('rect',{class:'correlation-cell',x:left+j*size+1,y:top+i*size+1,width:Math.max(0,size-2),height:Math.max(0,size-2),fill,stroke:v===null?'var(--sherlock-border)':'none','stroke-dasharray':v===null?'2 2':'none','data-grow-origin':'center center'})];
    if(size>=28)marks.push(text(left+(j+.5)*size,top+(i+.5)*size+4,v===null?'—':v.toFixed(2),{'text-anchor':'middle',style:Math.abs(v)>.65?'fill:#fff':''}));
    elements.push(group(ri,marks));
   }
  }
  const legendWidth=Math.min(150,right-left),legendX=left+(right-left-legendWidth)/2;
  for(let i=0;i<9;i++){const v=-1+i/4;elements.push(node('rect',{class:'grid color-legend',x:legendX+i*legendWidth/9,y:h-21,width:legendWidth/9,height:5,stroke:'none',fill:`color-mix(in srgb, ${color(v>=0?0:1)} ${Math.abs(v)*82}%, var(--sherlock-surface-muted))`}));}
  elements.push(text(legendX,h-3,'−1'),text(legendX+legendWidth/2,h-3,'0',{'text-anchor':'middle'}),text(legendX+legendWidth,h-3,'+1',{'text-anchor':'end'}));metrics.domain=[-1,1];summary=`${n} × ${n} 相关矩阵 · 固定范围 −1 至 +1`;headers=['指标对','相关系数'];footnote='正负使用不同色阶，零为中性灰；虚线空格为缺失，相关不等于因果';
 }else if(kind==='calendar'){
  const start=Date.parse(spec.start+'T00:00:00Z'),end=Date.parse(spec.end+'T00:00:00Z'),day=86400000,offset=(new Date(start).getUTCDay()+6)%7,map=new Map(spec.values.map(v=>[v.date,v.value]));
  const count=Math.round((end-start)/day)+1,weeks=Math.ceil((offset+count)/7),perRow=w<440?13:Math.min(52,Math.floor((w-44)/14)),segments=Math.ceil(weeks/perRow),cell=Math.min(21,(w-44)/Math.min(weeks,perRow)),segmentH=cell*7+29;
  h=Math.max(160,segmentH*segments+16);metrics.days=[];metrics.total=spec.values.reduce((s,v)=>s+v.value,0);const max=Math.max(0,...spec.values.map(v=>v.value)),monthLabels=new Map();
  for(let segment=0;segment<segments;segment++)for(let d=0;d<7;d++)elements.push(text(18,segment*segmentH+24+(d+.5)*cell,'一二三四五六日'[d],{'text-anchor':'end'}));
  for(let i=0;i<count;i++){
   const date=new Date(start+i*day).toISOString().slice(0,10),weekday=(offset+i)%7,week=Math.floor((offset+i)/7),segment=Math.floor(week/perRow),x=28+(week%perRow)*cell,y=segment*segmentH+20+weekday*cell,value=map.has(date)?map.get(date):null;
   const ri=row(date,[value===null?'未提供':fmt(value)],`${date} · 周${'一二三四五六日'[weekday]} · ${value===null?'未提供':fmt(value)+unit}`);
   if(i===0||date.endsWith('-01')||(offset+i)%(perRow*7)===0){const key=segment+':'+week,entry=monthLabels.get(key)??{x,y:segment*segmentH+13,months:[]};entry.months.push(Number(date.slice(5,7)));monthLabels.set(key,entry);}
   elements.push(group(ri,[node('rect',{class:'calendar-cell',x,y,width:Math.max(1,cell-2),height:Math.max(1,cell-2),fill:value===null?'none':value===0?'var(--sherlock-surface-muted)':`color-mix(in srgb, ${color(0)} ${25+75*value/max}%, var(--sherlock-surface))`,stroke:value===null?'var(--sherlock-border)':'none','stroke-dasharray':value===null?'2 2':'none','data-grow-origin':'center center'})]));metrics.days.push({date,value,weekday,week});
  }
  for(const m of monthLabels.values())elements.push(text(m.x,m.y,m.months.join('/')+'月'));
  headers=['自然日','数值'+unit];summary=`${spec.start} — ${spec.end} · 已提供 ${spec.values.length}/${count} 天`;footnote='周一至周日；灰格为明确零值，虚线格为缺失，范围外留白；深色表示较高值';
 }else if(['candlestick','ohlc'].includes(kind)){
  const all=spec.candles,candles=Number.isInteger(options.limit)&&options.limit>0?all.slice(-options.limit):all;
  const lo=Math.min(...candles.map(c=>c.low)),hi=Math.max(...candles.map(c=>c.high)),pad=(hi-lo)*.06||Math.max(1,hi*.02),left=48,right=w-12,top=16,priceBottom=Math.max(66,h*.62),volumeTop=priceBottom+16,bottom=h-25;
  const y=yGrid(lo-pad,hi+pad,left,right,top,priceBottom),step=(right-left)/candles.length,bw=Math.min(18,step*.62),maxVolume=Math.max(0,...candles.map(c=>c.volume)),vy=v=>bottom-(maxVolume?v/maxVolume:0)*(bottom-volumeTop);
  metrics.candles=[];
  candles.forEach((c,i)=>{
   // Price direction follows the displayed red-up/green-down convention;
   // business status tokens can use the opposite positive/negative palette.
   const x=left+(i+.5)*step,col=c.close>=c.open?'var(--sherlock-price-up,#df4f57)':'var(--sherlock-price-down,#00a83e)',highY=y(c.high),lowY=y(c.low),openY=y(c.open),closeY=y(c.close);
   const ri=row(c.date,[fmt(c.open),fmt(c.high),fmt(c.low),fmt(c.close),fmt(c.volume)],`${c.date} · 开 ${fmt(c.open)} · 高 ${fmt(c.high)} · 低 ${fmt(c.low)} · 收 ${fmt(c.close)}${unit} · 成交量 ${fmt(c.volume)} ${spec.volumeUnit}`);
   const marks=[line(x,highY,x,lowY,{class:'plot-stem',stroke:col,'stroke-width':1}),node('rect',{class:'volume-bar',x:x-bw/2,y:vy(c.volume),width:bw,height:bottom-vy(c.volume),fill:col,'fill-opacity':.65})];
   if(kind==='candlestick')marks.push(node('rect',{class:'candle-body',x:x-bw/2,y:Math.min(openY,closeY),width:bw,height:Math.max(1,Math.abs(openY-closeY)),fill:col}));
   else marks.push(line(x-bw/2,openY,x,openY,{class:'plot-stem',stroke:col,'stroke-width':1.5}),line(x,closeY,x+bw/2,closeY,{class:'plot-stem',stroke:col,'stroke-width':1.5}));
   marks.push(node('rect',{class:'hit',x:x-step/2,y:top,width:step,height:bottom-top,fill:'transparent'}));elements.push(group(ri,marks));metrics.candles.push({...c,x,highY,lowY,openY,closeY});
  });
  const ticks=[...new Set([0,Math.floor((candles.length-1)/2),candles.length-1])];ticks.forEach(i=>elements.push(text(left+(i+.5)*step,h-8,candles[i].date.slice(5),{'text-anchor':i===0?'start':i===candles.length-1?'end':'middle'})));
  elements.push(text(left-7,volumeTop+4,fmt(maxVolume),{'text-anchor':'end'}),text(left-7,bottom+3,'0',{'text-anchor':'end'}));
  headers=['日期','开'+unit,'高'+unit,'低'+unit,'收'+unit,'成交量 '+spec.volumeUnit];summary=`${candles[0].date} — ${candles.at(-1).date} · ${candles.length}/${all.length} 个观测日`;footnote=`价格${unit} · 下栏成交量 ${spec.volumeUnit} · 红：收≥开，绿：收<开${kind==='ohlc'?' · 左开右收':''}`;
 }
 return {width:w,height:h,elements,rows,headers,summary,footnote,composition:false,metrics,legend};
}
