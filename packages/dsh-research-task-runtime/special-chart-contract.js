import {chartSourcesIssue} from './component-provenance-display.js';
// Data contracts for the composition, distribution and target charts in Figma.
// A parent has children OR a leaf value, never a second independently summed value.
export const SPECIAL_CHART_TEMPLATES = Object.freeze([
  ['pie','饼图','1918:358185',['分类联动','完整数据']],
  ['donut','环形图','1918:358450',['分类联动','完整数据']],
  ['treemap','矩形树图','1918:358724',['下钻','返回上层','完整数据']],
  ['sunburst','旭日图','1918:358885',['下钻','返回上层','完整数据']],
  ['radar','雷达图','1918:359237',['系列切换','维度详情','完整数据']],
  ['histogram','直方图','1918:360475',['分箱调整','区间详情','完整数据']],
  ['box','箱线图','1918:360723',['五数摘要','离群值','完整数据']],
  ['bullet','子弹图','1918:364313',['实际与目标','参考区间','完整数据']],
  ['gauge','仪表图','1918:364549',['指标明细','目标差额']]
].map(([variant,title,figma,interactions])=>Object.freeze({variant,title,figma,interactions,width:656,height:412})));
export const SPECIAL_CHART_VARIANTS=Object.freeze(SPECIAL_CHART_TEMPLATES.map(t=>t.variant));
const shapes={
 pie:'items:[{label:"华东",value:42},{label:"华南",value:28}]；1–20项非负原值，宿主计算百分比，不提交百分比代替金额',
 donut:'items:[{label:"华东",value:42},{label:"华南",value:28}]；1–20项非负原值，中心显示总量',
 treemap:'root:{name:"收入",children:[{name:"产品",children:[{name:"软件",value:42},{name:"服务",value:28}]},{name:"其他",value:10}]}；父节点只有children，叶节点只有非负value，最多5层150节点',
 sunburst:'root:{name:"收入",children:[{name:"产品",children:[{name:"软件",value:42},{name:"服务",value:28}]},{name:"其他",value:10}]}；父节点只有children，叶节点只有非负value，最多5层150节点',
 radar:'labels:["效率","质量","响应"],series:[{name:"本期",values:[70,85,60]}],normalization:"各维度均按同向0–100评分"；3–8维、1–4系列，分值0–100；normalization须说明统一评分口径，不混用原始单位',
 histogram:'samples:[12,15,18,20,25,30],binCount:6；1–600个有限连续数值，4–40箱；或提供 bins:[{lower:0,upper:10,count:5},{lower:10,upper:20,count:8}] 替代 samples/binCount。连续不重叠，count非负整数，非等宽箱宿主显示频数密度',
 box:'groups:[{name:"A组",samples:[1,2,3,4,5,6,20]}]；1–12组共≤600样本，宿主计算线性插值分位数及1.5×IQR须线。或 groups:[{name:"A组",low:1,q1:2,median:3,q3:4,high:6,outliers:[20],count:7}],whiskerMethod:"1.5×IQR"；不混用两种形式，须线算法必填',
 bullet:'min:0,max:120,rows:[{label:"收入",value:72,target:85}],bands:[{to:50,label:"区间一"},{to:85,label:"区间二"},{to:120,label:"区间三"}]；1–12行共用单位和固定尺度，区间连续至max，实际和目标均在范围内',
 gauge:'min:0,max:100,value:72,target:85；固定上下界，当前与可选目标均在范围内，unit为原始单位'
};
export function specialChartSchema(variant){
 const base='公共字段 version:1,type:"chart",title,variant,unit,asOf；可选 subtitle、note。';
 return variant ? base+`chart.${variant}：${shapes[variant]}` : base+SPECIAL_CHART_VARIANTS.map(v=>`chart.${v}：${shapes[v]}`).join('；');
}
export function specialChartDataIssue(s){
 const sourceIssue=chartSourcesIssue(s?.sources);if(sourceIssue)return sourceIssue;
 const text=(v,max=256)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
 const num=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12;
 const obj=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k));
 const list=(a,max)=>Array.isArray(a)&&a.length>0&&a.length<=max;
 const unique=names=>new Set(names).size===names.length;
 const fields={pie:['items'],donut:['items'],treemap:['root'],sunburst:['root'],radar:['labels','series','normalization'],histogram:['samples','binCount','bins'],box:['groups','whiskerMethod'],bullet:['min','max','rows','bands'],gauge:['min','max','value','target']};
 if(!fields[s?.variant]||s.type!=='chart'||s.version!==1||!text(s.title)||!obj(s,['version','type','title','variant','unit','asOf','subtitle','note','sources',...fields[s.variant]]))return '图表版本、类型或字段无效';
 for(const k of ['unit','asOf','subtitle','note'])if(s[k]!==undefined&&!text(s[k],k==='note'?2000:256))return `${k} 无效`;
 if(['pie','donut'].includes(s.variant)){
  if(!list(s.items,20)||!s.items.every(i=>obj(i,['label','value'])&&text(i.label,128)&&num(i.value)&&i.value>=0)||!unique(s.items.map(i=>i.label)))return '占比图需1–20个名称不同且非负的原值';
 }else if(['treemap','sunburst'].includes(s.variant)){
  let count=0;
  const valid=(n,depth)=>{
   if(++count>150||depth>5||!obj(n,['name','value','children'])||!text(n.name,128))return false;
   if(n.children!==undefined)return n.value===undefined&&list(n.children,100)&&unique(n.children.map(c=>c?.name))&&n.children.every(c=>valid(c,depth+1));
   return num(n.value)&&n.value>=0;
  };
  if(!valid(s.root,0))return '层级图需有效树：父节点children，叶节点非负value，最多5层150节点，同级名称不能重复';
 }else if(s.variant==='radar'){
  if(!list(s.labels,8)||s.labels.length<3||!s.labels.every(l=>text(l,128))||!unique(s.labels)||!text(s.normalization,1000)||!list(s.series,4)||!s.series.every(r=>obj(r,['name','values'])&&text(r.name,128)&&Array.isArray(r.values)&&r.values.length===s.labels.length&&r.values.every(v=>num(v)&&v>=0&&v<=100))||!unique(s.series.map(r=>r.name)))return '雷达图需3–8个不同维度、1–4个不同系列、0–100同向分值及normalization说明';
 }else if(s.variant==='histogram'){
  if(s.samples!==undefined){
   if(s.bins!==undefined||!list(s.samples,600)||!s.samples.every(num)||s.binCount!==undefined&&(!Number.isInteger(s.binCount)||s.binCount<4||s.binCount>40))return '直方图samples为1–600个有限值，binCount为4–40，不能同时提供bins';
  }else if(s.binCount!==undefined||!list(s.bins,40)||!s.bins.every((b,i)=>obj(b,['lower','upper','count'])&&num(b.lower)&&num(b.upper)&&b.upper>b.lower&&Number.isSafeInteger(b.count)&&b.count>=0&&b.count<=1e9&&(i===0||b.lower===s.bins[i-1].upper)))return '直方图bins需连续不重叠、宽度为正、count为非负整数；无原样本时不能重新分箱';
 }else if(s.variant==='box'){
  if(!list(s.groups,12)||!unique(s.groups.map(g=>g?.name)))return '箱线图需1–12个名称不同的分组';
  const raw=s.groups[0]?.samples!==undefined;
  if(raw&&s.whiskerMethod!==undefined||!raw&&!text(s.whiskerMethod,1000))return '原始样本由宿主计算Tukey须线；汇总值必须说明whiskerMethod';
  let points=0;
  for(const g of s.groups){
   if(!text(g?.name,128))return '箱线图组名无效';
   if(raw){if(!obj(g,['name','samples'])||!list(g.samples,600)||!g.samples.every(num))return '箱线图每组需有效样本，不能混用汇总值';points+=g.samples.length;}
   else if(!obj(g,['name','low','q1','median','q3','high','outliers','count'])||![g.low,g.q1,g.median,g.q3,g.high].every(num)||!(g.low<=g.q1&&g.q1<=g.median&&g.median<=g.q3&&g.q3<=g.high)||!Array.isArray(g.outliers)||!g.outliers.every(v=>num(v)&&(v<g.low||v>g.high))||g.count!==undefined&&(!Number.isInteger(g.count)||g.count<1||g.count<=g.outliers.length))return '箱线图需有序五数摘要，离群值在须线外，样本量为正整数';
   else points+=g.outliers.length+5;
  }
  if(points>600)return '箱线图总数据点不超过600';
 }else{
  if(!num(s.min)||!num(s.max)||s.min>=s.max)return '指标图必须提供有效固定上下界min < max';
  const inRange=v=>num(v)&&v>=s.min&&v<=s.max;
  if(s.variant==='gauge'){
   if(!inRange(s.value)||s.target!==undefined&&!inRange(s.target))return '当前值和目标必须位于固定范围内';
  }else{
   if(!list(s.rows,12)||!s.rows.every(r=>obj(r,['label','value','target'])&&text(r.label,128)&&inRange(r.value)&&inRange(r.target))||!unique(s.rows.map(r=>r.label)))return '子弹图实际值和目标必须在同一固定范围，行名不同';
   if(!list(s.bands,6)||!s.bands.every((b,i)=>obj(b,['to','label'])&&text(b.label,128)&&inRange(b.to)&&b.to>(i?s.bands[i-1].to:s.min))||s.bands.at(-1).to!==s.max)return '参考区间需递增且覆盖整个固定范围，每段说明含义';
  }
 }
 return null;
}
