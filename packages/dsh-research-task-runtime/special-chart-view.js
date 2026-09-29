// Pure data-to-geometry projection, shared with the trusted sandbox runtime.
// Descriptors are mounted with createElementNS/textContent under Trusted Types.
export function specialChartView(spec, width=624, options={}){
 const node=(tag,attributes={},children=[])=>({tag,attributes,children});
 const fmt=v=>Number(v.toPrecision(6)).toLocaleString('en-US');
 const color=i=>`var(--sherlock-chart-${i%6+1})`;
 const unit=spec.unit?' '+spec.unit:'',differenceUnit=/^[%％]$|百分比/u.test(spec.unit??'')?' 个百分点':unit;
 const text=(x,y,value,attrs={})=>node('text',{x,y,...attrs},[String(value)]);
 const short=(s,n=12)=>s.length>n?s.slice(0,n-1)+'…':s;
 const w=Math.max(280,width),kind=spec.variant,composition=['pie','donut','sunburst'].includes(kind);
 const sw=composition?280:w,ideal=composition?264:kind==='bullet'?Math.max(180,spec.rows.length*54+34):260;
 const h=Math.max(kind==='bullet'?spec.rows.length*46+34:160,Math.min(ideal,Number.isFinite(options.height)?options.height:ideal));
 const elements=[], rows=[],metrics={};let headers=['项目','数值'+unit],summary='',footnote='',root=spec.root;
 const selected=(i,children)=>node('g',{'data-inspect':i},children);
 const title=s=>node('title',{},[s]);
 const centerLabel=(cx,cy,value,label,maxWidth,maxHeight,valueClass='center-value',fontSize=24)=>node('g',{
  class:'chart-center-label','data-center-x':cx,'data-center-y':cy,'data-center-width':maxWidth,'data-center-height':maxHeight
 },[text(cx,cy+(label?-8:0),value,{class:valueClass,'text-anchor':'middle','dominant-baseline':'central',style:`font-size:${fontSize}px`}),...(label?[text(cx,cy+fontSize/2+3,label,{'text-anchor':'middle','dominant-baseline':'central'})]:[])]);
 const pct=(v,total)=>total?fmt(v/total*100)+'%':'—';
 const polar=(cx,cy,r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];
 const arc=(cx,cy,r,inner,a,b)=>{
  const p=(rr,t)=>polar(cx,cy,rr,t).join(',');
  const span=b-a;if(span<=0||r<=0)return '';
  // Full circles use two arcs; a coincident SVG endpoint is not a circle.
  const outer=span>=Math.PI*2-1e-9?`M${p(r,a)} A${r},${r} 0 1 1 ${p(r,a+Math.PI)} A${r},${r} 0 1 1 ${p(r,b)}`:`M${p(r,a)} A${r},${r} 0 ${span>Math.PI?1:0} 1 ${p(r,b)}`;
  if(!inner)return outer+` L${cx},${cy} Z`;
  return outer+` L${p(inner,b)}`+(span>=Math.PI*2-1e-9?` A${inner},${inner} 0 1 0 ${p(inner,a+Math.PI)} A${inner},${inner} 0 1 0 ${p(inner,a)}`:` A${inner},${inner} 0 ${span>Math.PI?1:0} 0 ${p(inner,a)}`)+' Z';
 };
 const value=n=>n.children?n.children.reduce((s,c)=>s+value(c),0):n.value;
 const path=options.path??[];for(const index of path)root=root.children[index];
 const row=(label,cells,detail,more={})=>{rows.push({label,cells,detail,...more});return rows.length-1;};
 const scales=(lo,hi)=>{
  if(lo===hi){const delta=Math.max(1,Math.abs(lo)*.1);lo-=delta;hi+=delta;}
  return {lo,hi,left:48,right:sw-16,top:16,bottom:h-32,y:v=>16+(hi-v)/(hi-lo)*(h-48)};
 };
 const grid=(s)=>{for(let i=0;i<=4;i++){const v=s.lo+(s.hi-s.lo)*i/4,y=s.y(v);elements.push(node('line',{class:'grid',x1:s.left,x2:s.right,y1:y,y2:y}),text(s.left-8,y+4,fmt(v),{'text-anchor':'end'}));}};
 if(['pie','donut','sunburst'].includes(kind)){
  const cy=h/2,radius=Math.min(112,(h-24)/2),ratio=radius/112;
  const items=kind==='sunburst'?(root.children??[root]).map((n,i)=>({label:n.name,value:value(n),children:n.children,path:root.children?[...path,i]:path})):spec.items;
  const total=items.reduce((s,i)=>s+i.value,0);let start=-Math.PI/2;
  headers=['分类','数值'+unit,'占比'];summary=(root?.name??'合计')+' '+fmt(total)+unit;
  metrics.total=total;metrics.sectors=[];
  items.forEach((item,i)=>{
   const end=start+(total?item.value/total*Math.PI*2:0),detail=`${item.label} · ${fmt(item.value)}${unit} · ${pct(item.value,total)}`;
   row(item.label,[fmt(item.value),pct(item.value,total)],detail,{path:item.path,drill:!!item.children,color:color(i)});
   const mark=(r,inner,a,b,opacity=1)=>node('path',{class:'composition-sector',d:arc(140,cy,r*ratio,inner*ratio,a,b),fill:color(i),'fill-opacity':opacity,stroke:'var(--sherlock-surface)','stroke-width':1.5,'data-grow-radial':'true'},[title(detail)]);
   const marks=[];
   if(item.value>0){
    marks.push(mark(kind==='sunburst'&&item.children?77:112,kind==='pie'?0:kind==='donut'?68:54,start,end));
    if(kind==='sunburst'&&item.children){let angle=start;item.children.forEach((c,ci)=>{const b=angle+value(c)/item.value*(end-start);marks.push(mark(112,77,angle,b,.55+.4*(ci%3)/2));angle=b;});}
    if(kind==='pie'&&item.value/total>=.08&&radius>=90){const p=polar(140,cy,76*ratio,(start+end)/2);marks.push(text(p[0],p[1]+4,pct(item.value,total),{class:'sector-label','text-anchor':'middle'}));}
   }
   elements.push(selected(i,marks));metrics.sectors.push({start,end,value:item.value});start=end;
  });
  if(!total)elements.push(text(140,cy+4,'总量为 0，暂无占比',{'text-anchor':'middle'}));
  else if(kind!=='pie'){
   const inner=(kind==='donut'?68:54)*ratio;
   elements.push(centerLabel(140,cy,fmt(total),spec.unit??'合计',inner*1.55,inner*1.45));
   metrics.center={x:140,y:cy,innerRadius:inner};
  }
  footnote=kind==='sunburst'?'父节点等于叶节点合计 · 点击分类下钻':'面积按原值占比 · 悬停分类联动明细';
 }else if(kind==='treemap'){
  const items=(root.children??[root]).map((n,index)=>({n,index,v:value(n)})).sort((a,b)=>b.v-a.v),total=value(root);
  summary=root.name+' '+fmt(total)+unit;headers=['分类','数值'+unit,'占比'];metrics.tiles=[];
  // Recursive balanced binary partition. Every pre-gap area is proportional;
  // the 2px visual separation never changes the partition weights.
  const partition=(list,x,y,rw,rh,draw)=>{
   if(!list.length)return;const total=list.reduce((s,i)=>s+i.v,0);if(!total)return;
   if(list.length===1){draw(list[0],x,y,rw,rh);return;}
   let sum=0,k=0;while(k<list.length-1&&(k===0||sum+list[k].v<total/2)){sum+=list[k].v;k++;}
   const ratio=sum/total,horizontal=rw>=rh;
   partition(list.slice(0,k),x,y,horizontal?rw*ratio:rw,horizontal?rh:rh*ratio,draw);
   partition(list.slice(k),horizontal?x+rw*ratio:x,horizontal?y:y+rh*ratio,horizontal?rw*(1-ratio):rw,horizontal?rh:rh*(1-ratio),draw);
  };
  items.forEach(({n,index,v})=>row(n.name,[fmt(v),pct(v,total)],`${n.name} · ${fmt(v)}${unit} · ${pct(v,total)}`,{path:root.children?[...path,index]:path,drill:!!n.children,color:color(index)}));
  partition(items.filter(i=>i.v>0),0,0,sw,h,(item,x,y,rw,rh)=>{
   const ri=items.indexOf(item),marks=[];metrics.tiles.push({name:item.n.name,value:item.v,x,y,width:rw,height:rh});
   const leaves=item.n.children?.map(n=>({n,v:value(n)})).filter(n=>n.v>0)??[item];
   partition(leaves,x,y,rw,rh,(leaf,lx,ly,lw,lh)=>marks.push(node('rect',{class:'tree-tile',x:lx+1,y:ly+1,width:Math.max(0,lw-2),height:Math.max(0,lh-2),fill:color(item.index),'fill-opacity':leaf===item?1:.7+.3*(leaves.indexOf(leaf)%3)/2,'data-grow-origin':'center center'},[title(rows[ri].detail)])));
   if(rw>90&&rh>44)marks.push(text(x+10,y+22,short(item.n.name,Math.floor(rw/12)),{class:'sector-label'}),text(x+10,y+41,pct(item.v,total),{class:'sector-label'}));
   elements.push(selected(ri,marks));
  });
  if(!total)elements.push(text(sw/2,h/2,'总量为 0，暂无面积分布',{'text-anchor':'middle'}));
  footnote='面积按叶节点原值汇总 · 点击分类下钻';
 }else if(kind==='radar'){
  const cx=sw/2,cy=h/2,r=Math.min(89,(h-40)/2),n=spec.labels.length,point=(v,i)=>polar(cx,cy,r*v/100,-Math.PI/2+i*Math.PI*2/n);
  for(const level of [25,50,75,100]){
   elements.push(node('polygon',{class:'grid',points:spec.labels.map((_,i)=>point(level,i).join(',')).join(' '),fill:'none'}));
   elements.push(text(cx+4,cy-r*level/100,level));
  }
  spec.labels.forEach((label,i)=>{
   const p=point(100,i),l=point(124,i);elements.push(node('line',{class:'grid',x1:cx,y1:cy,x2:p[0],y2:p[1]}),text(l[0],l[1]+4,short(label,8),{'text-anchor':l[0]<cx-10?'end':l[0]>cx+10?'start':'middle'},));
   row(label,spec.series.map(s=>fmt(s.values[i])),label+' · '+spec.series.map(s=>s.name+' '+fmt(s.values[i])+' 分').join(' · '));
  });
  spec.series.forEach((s,si)=>{if(options.visible?.[si]===false)return;
   elements.push(node('polygon',{class:'radar-area',points:s.values.map((v,i)=>point(v,i).join(',')).join(' '),fill:color(si),'fill-opacity':.12,stroke:color(si),'stroke-width':2,'stroke-dasharray':si?'5 3':'none','data-grow-radial':'true'}));
   s.values.forEach((v,i)=>{const p=point(v,i);elements.push(selected(i,[node('circle',{cx:p[0],cy:p[1],r:4,fill:color(si)},[title(rows[i].detail)]),node('circle',{class:'hit',cx:p[0],cy:p[1],r:12,fill:'transparent'})]));});
  });
  headers=['维度',...spec.series.map(s=>s.name+'（分）')];summary='统一评分 · 0–100';footnote=spec.normalization+'；不以多边形面积比较总体表现';
 }else if(kind==='histogram'){
  let bins=spec.bins;
  if(spec.samples){
   let min=Math.min(...spec.samples),max=Math.max(...spec.samples);if(min===max){min-=.5;max+=.5;}
   const count=options.binCount??spec.binCount??10,step=(max-min)/count;
   bins=Array.from({length:count},(_,i)=>({lower:min+i*step,upper:i===count-1?max:min+(i+1)*step,count:0}));
   for(const v of spec.samples)bins[Math.min(count-1,Math.max(0,Math.floor((v-min)/step)))].count++;
  }
  const total=bins.reduce((s,b)=>s+b.count,0),span=bins[0].upper-bins[0].lower;
  const density=bins.some(b=>Math.abs((b.upper-b.lower)-span)>Math.max(1,Math.abs(span))*1e-9);
  const heights=bins.map(b=>density?b.count/(b.upper-b.lower):b.count),s=scales(0,Math.max(1,...heights));grid(s);
  const xmin=bins[0].lower,xmax=bins.at(-1).upper,x=v=>s.left+(v-xmin)/(xmax-xmin)*(s.right-s.left);
  bins.forEach((b,i)=>{
   const label=`[${fmt(b.lower)}, ${fmt(b.upper)}${i===bins.length-1?']':')'}`,detail=`${label}${unit} · 频数 ${b.count} · ${pct(b.count,total)}${density?' · 频数密度 '+fmt(heights[i]):''}`;
   row(label,[String(b.count),pct(b.count,total)],detail);
   elements.push(selected(i,[node('rect',{x:x(b.lower),y:s.y(heights[i]),width:x(b.upper)-x(b.lower),height:s.bottom-s.y(heights[i]),fill:color(0),stroke:'var(--sherlock-surface)','stroke-width':.5},[title(detail)]),node('rect',{class:'hit',x:x(b.lower),y:s.top,width:x(b.upper)-x(b.lower),height:s.bottom-s.top,fill:'transparent'})]));
  });
  for(let i=0;i<=4;i++){const v=xmin+(xmax-xmin)*i/4;elements.push(text(x(v),h-10,fmt(v),{'text-anchor':'middle'}));}
  metrics.bins=bins;metrics.density=density;headers=['区间'+unit,'频数','占比'];summary=`样本 ${total} · ${bins.length} 个区间 · ${density?'纵轴：频数密度':'纵轴：频数'}`;
  footnote='区间左闭右开，最后一箱含右端点'+(density?' · 非等宽箱以面积表示频数':'')+(spec.bins?' · 汇总数据不能反推精确中位数':'');
 }else if(kind==='box'){
  const quantile=(a,p)=>{const at=(a.length-1)*p,i=Math.floor(at);return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(at-i);};
  const groups=spec.groups.map(g=>{
   if(!g.samples)return g;const a=[...g.samples].sort((x,y)=>x-y),q1=quantile(a,.25),median=quantile(a,.5),q3=quantile(a,.75),iqr=q3-q1;
   const inside=a.filter(v=>v>=q1-1.5*iqr&&v<=q3+1.5*iqr);
   return {name:g.name,low:inside[0],q1,median,q3,high:inside.at(-1),outliers:a.filter(v=>v<q1-1.5*iqr||v>q3+1.5*iqr),count:a.length};
  });
  const all=groups.flatMap(g=>[g.low,g.high,...g.outliers]),s=scales(Math.min(...all),Math.max(...all));grid(s);
  const band=(s.right-s.left)/groups.length,bw=Math.min(48,band*.55);
  groups.forEach((g,i)=>{
   const x=s.left+band*(i+.5),cells=[g.low,g.q1,g.median,g.q3,g.high].map(fmt),detail=`${g.name} · 下须 ${cells[0]} · Q1 ${cells[1]} · 中位数 ${cells[2]} · Q3 ${cells[3]} · 上须 ${cells[4]}${unit} · 离群值 ${g.outliers.length?g.outliers.map(fmt).join('、'):'无'} · 样本量 ${g.count??'未提供'}`;
   row(g.name,[...cells,g.outliers.map(fmt).join('、')||'—',g.count??'—'],detail);
   const line=(x1,x2,y)=>node('line',{class:'box-keyline',x1,x2,y1:y,y2:y,stroke:color(i),'stroke-width':1.5});
   elements.push(selected(i,[node('line',{class:'box-keyline',x1:x,x2:x,y1:s.y(g.high),y2:s.y(g.low),stroke:color(i),'stroke-width':1.5}),line(x-bw/3,x+bw/3,s.y(g.high)),line(x-bw/3,x+bw/3,s.y(g.low)),node('rect',{x:x-bw/2,y:s.y(g.q3),width:bw,height:Math.max(1,s.y(g.q1)-s.y(g.q3)),fill:color(i),'fill-opacity':.18,stroke:color(i)}),line(x-bw/2,x+bw/2,s.y(g.median)),...g.outliers.map(v=>node('circle',{cx:x,cy:s.y(v),r:3,fill:'var(--sherlock-surface)',stroke:color(i)},[title('离群值 '+fmt(v)+unit)])),text(x,s.y(g.median)-5,fmt(g.median),{'text-anchor':'middle'}),node('rect',{class:'hit',x:x-band/2,y:s.top,width:band,height:s.bottom-s.top,fill:'transparent'},[title(detail)])]));
   elements.push(text(x,h-10,short(g.name,Math.max(3,Math.floor(band/12))),{'text-anchor':'middle'}));
  });
  metrics.groups=groups;headers=['分组',...['下须','Q1','中位数','Q3','上须'].map(l=>l+unit),'离群值'+unit,'样本量'];summary='中位数与四分位分布'+unit;
  footnote=spec.groups[0].samples?'四分位：线性插值 · 须线：1.5 × IQR 内最远样本 · 空心点为离群值':'须线算法：'+spec.whiskerMethod;
 }else if(kind==='bullet'){
  const left=Math.min(120,sw*.26),right=sw-18,pw=right-left,x=v=>left+(v-spec.min)/(spec.max-spec.min)*pw;
  spec.rows.forEach((r,i)=>{
   const y=10+i*Math.min(54,(h-34)/spec.rows.length),detail=`${r.label} · 实际 ${fmt(r.value)}${unit} · 目标 ${fmt(r.target)}${unit} · 差额 ${fmt(r.value-r.target)}${differenceUnit}`;
   row(r.label,[fmt(r.value),fmt(r.target),fmt(r.value-r.target)],detail);let start=spec.min;
   const marks=spec.bands.map((b,bi)=>{const mark=node('rect',{class:'background',x:x(start),y:y+16,width:x(b.to)-x(start),height:20,fill:'var(--sherlock-muted)','fill-opacity':.1+bi*.07},[title(`${b.label}：${fmt(start)}–${fmt(b.to)}${unit}`)]);start=b.to;return mark;});
   marks.push(node('rect',{x:left,y:y+22,width:x(r.value)-left,height:8,fill:color(i),'data-grow-axis':'x'}),node('line',{class:'target',x1:x(r.target),x2:x(r.target),y1:y+12,y2:y+40,stroke:'var(--sherlock-text)','stroke-width':2}),text(left,y+7,`实际 ${fmt(r.value)} · 目标 ${fmt(r.target)}`),node('rect',{class:'hit',x:left,y,width:pw,height:44,fill:'transparent'},[title(detail)]));
   elements.push(text(left-8,y+30,short(r.label,Math.floor(left/12)),{'text-anchor':'end'}),selected(i,marks));
  });
  for(let i=0;i<=4;i++){const v=spec.min+(spec.max-spec.min)*i/4;elements.push(text(x(v),h-6,fmt(v),{'text-anchor':'middle'}));}
  summary='实际与目标'+unit;headers=['指标','实际'+unit,'目标'+unit,'差额'+differenceUnit];footnote='参考区间：'+spec.bands.map((b,i)=>`${b.label} ${fmt(i?spec.bands[i-1].to:spec.min)}–${fmt(b.to)}`).join(' · ')+'；范围本身不代表好坏';
 }else if(kind==='gauge'){
  const cx=sw/2,cy=h-42,r=Math.min(155,(sw-60)/2,h-64),angle=v=>Math.PI+(v-spec.min)/(spec.max-spec.min)*Math.PI;
  elements.push(node('path',{class:'background',d:arc(cx,cy,r,r-22,Math.PI,Math.PI*2),fill:'var(--sherlock-surface-muted)'}));
  const detail=`当前 ${fmt(spec.value)}${unit}`+(spec.target===undefined?'':` · 目标 ${fmt(spec.target)}${unit} · 差额 ${fmt(spec.value-spec.target)}${differenceUnit}`);
  const marks=[node('path',{'data-grow-radial':'true',d:arc(cx,cy,r,r-22,Math.PI,angle(spec.value)),fill:color(0)},[title(detail)])];
  if(spec.target!==undefined){const a=angle(spec.target),p=polar(cx,cy,r-28,a),q=polar(cx,cy,r+6,a);marks.push(node('line',{class:'target',x1:p[0],y1:p[1],x2:q[0],y2:q[1],stroke:'var(--sherlock-text)','stroke-width':2}));}
  elements.push(selected(0,marks),centerLabel(cx,cy-(r-22)*.35,fmt(spec.value),spec.unit??'',(r-28)*1.6,(r-28)*.85,'gauge-value',38),text(cx,cy+22,spec.target===undefined?'固定范围':`目标 ${fmt(spec.target)}${unit}`,{'text-anchor':'middle'}),text(cx-r,cy+20,fmt(spec.min),{'text-anchor':'middle'}),text(cx+r,cy+20,fmt(spec.max),{'text-anchor':'middle'}));
  headers=['指标','数值'];row('当前值',[fmt(spec.value)+unit],detail);row('范围',[`${fmt(spec.min)}–${fmt(spec.max)}${unit}`],`固定范围 ${fmt(spec.min)}–${fmt(spec.max)}${unit}`);
  if(spec.target!==undefined){row('目标',[fmt(spec.target)+unit],detail);row('差额',[fmt(spec.value-spec.target)+differenceUnit],detail);}
  summary='单指标 · 固定范围';footnote='弧长使用固定上下界；数值始终显示';
 }
 return {width:sw,height:h,elements,rows,headers,summary,footnote,composition,metrics};
}
