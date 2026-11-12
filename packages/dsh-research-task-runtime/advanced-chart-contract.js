import {chartSourcesIssue} from './component-provenance-display.js';
// Figma 22A: flows, paired measurements, correlation, calendar and OHLC data.
export const ADVANCED_CHART_TEMPLATES=Object.freeze([
 ['waterfall','瀑布图','1918:357949',['增减明细','累计值','完整数据']],
 ['funnel','漏斗图','1918:359500',['阶段转化','完整数据']],
 ['sankey','桑基图','1918:359694',['节点与路径','来源占比','完整数据']],
 ['scatter','散点图','1918:359876',['分组切换','样本详情','完整数据']],
 ['bubble','气泡图','1918:360198',['分组切换','面积图例','样本详情']],
 ['heatmap','相关性热力图','1918:360995',['指标对明细','固定色阶','完整数据']],
 ['calendar','日历热力图','1918:361573',['日期详情','缺失值区分','完整数据']],
 ['candlestick','K线图','1918:362301',['区间','逐日OHLC与成交量','完整数据']],
 ['ohlc','OHLC图','1918:363355',['区间','逐日OHLC与成交量','完整数据']]
].map(([variant,title,figma,interactions])=>Object.freeze({variant,title,figma,interactions,width:656,height:412})));
export const ADVANCED_CHART_VARIANTS=Object.freeze(ADVANCED_CHART_TEMPLATES.map(t=>t.variant));
const shapes={
 waterfall:'start:{label:"期初",value:120},steps:[{label:"新增",delta:26},{label:"成本",delta:-18}],endLabel:"期末"；1–24项有正负号的增减，期末由宿主累计，不再提交独立总额',
 funnel:'stages:[{label:"访问",value:10000},{label:"浏览",value:6800},{label:"成交",value:960}]；2–12阶段同单位非负且人数不递增，宽度按原值，占初始和环节转化由宿主计算',
 sankey:'columns:["来源","客群","结果"],nodes:[{id:"a",label:"搜索",column:0},{id:"b",label:"新客",column:1},{id:"c",label:"成交",column:2}],links:[{source:"a",target:"b",value:100},{source:"b",target:"c",value:100}]；2–5列，≤40节点，每列≤10节点，≤100条正值流量；边只连相邻下一列，中间节点输入输出守恒，无重复边和孤立节点',
 scatter:'xAxis:{label:"客单价",unit:"元"},yAxis:{label:"转化率",unit:"%"},points:[{label:"样本A",x:120,y:6,group:"A组"}]；1–600个具名样本、最多6组；x/y为有限原值，各轴单位独立，不使用labels/series冒充样本',
 bubble:'xAxis:{label:"客单价",unit:"元"},yAxis:{label:"转化率",unit:"%"},sizeLabel:"订单量",sizeUnit:"单",points:[{label:"样本A",x:120,y:6,size:400,group:"A组"}]；1–300个具名样本、最多6组；面积与非负size成比例，零值不伪造成有面积',
 heatmap:'labels:["收入","利润"],values:[[1,0.6],[0.6,1]]；2–16个不同指标，方阵、对称、对角线1、固定范围[-1,1]；未知相关系数用null，不用0替代缺失；须使用实际计算或明确模拟的相关系数',
 calendar:'start:"2026-09-01",end:"2026-09-30",values:[{date:"2026-09-01",value:8},{date:"2026-09-02",value:0}]；ISO自然日范围≤366天，每日最多一条非负值；显式0是零值，未提供的日期是缺失而非0，范围外留白',
 candlestick:'unit、volumeUnit分别填写原价格和成交量单位，保留原数值、不自行换算。candles:[{date:"2026-09-01",open:100,high:105,low:98,close:103,volume:20}]；1–366条按日期严格升序的真实OHLC结构，high≥max(open,close)、low≤min(open,close)，数值与成交量非负，不用收盘折线替代',
 ohlc:'unit:"元",volumeUnit:"万手",candles:[{date:"2026-09-01",open:100,high:105,low:98,close:103,volume:20}]；同K线数据契约；绘制高低竖线、左开右收刻度及对齐成交量'
};
export function advancedChartSchema(variant){
 const base='公共字段 version:1,type:"chart",title,variant,unit,asOf；可选 subtitle、note。';
 return base+(variant?`chart.${variant}：${shapes[variant]}`:ADVANCED_CHART_VARIANTS.map(v=>`chart.${v}：${shapes[v]}`).join('；'));
}
export function advancedChartDataIssue(s){
 const sourceIssue=chartSourcesIssue(s?.sources);if(sourceIssue)return sourceIssue;
 const text=(v,n=256)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
 const num=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12;
 const obj=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
 const list=(a,n)=>Array.isArray(a)&&a.length>0&&a.length<=n;
 const unique=a=>new Set(a).size===a.length;
 const date=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 const fields={waterfall:['start','steps','endLabel'],funnel:['stages'],sankey:['columns','nodes','links'],scatter:['xAxis','yAxis','points'],bubble:['xAxis','yAxis','points','sizeLabel','sizeUnit'],heatmap:['labels','values'],calendar:['start','end','values'],candlestick:['candles','volumeUnit'],ohlc:['candles','volumeUnit']};
 if(!fields[s?.variant]||s.version!==1||s.type!=='chart'||!text(s.title)||!obj(s,['version','type','title','variant','unit','asOf','subtitle','note','sources',...fields[s.variant]]))return '图表版本、类型或字段无效';
 for(const k of ['unit','asOf','subtitle','note'])if(s[k]!==undefined&&!text(s[k],k==='note'?2000:256))return `${k} 无效`;
 if(s.variant==='waterfall'){
  if(!obj(s.start,['label','value'])||!text(s.start.label,128)||!num(s.start.value)||!list(s.steps,24)||!s.steps.every(t=>obj(t,['label','delta'])&&text(t.label,128)&&num(t.delta))||s.endLabel!==undefined&&!text(s.endLabel,128))return '瀑布图需期初值及1–24项具名增减delta';
 }else if(s.variant==='funnel'){
  if(!list(s.stages,12)||s.stages.length<2||!s.stages.every((r,i)=>obj(r,['label','value'])&&text(r.label,128)&&num(r.value)&&r.value>=0&&(!i||r.value<=s.stages[i-1].value))||!unique(s.stages.map(t=>t.label)))return '漏斗图需2–12个不同阶段，同单位非负原值依次不递增';
 }else if(s.variant==='sankey'){
  if(!list(s.columns,5)||s.columns.length<2||!s.columns.every(n=>text(n,64))||!unique(s.columns)||!list(s.nodes,40)||!s.nodes.every(n=>obj(n,['id','label','column'])&&text(n.id,64)&&text(n.label,128)&&Number.isInteger(n.column)&&n.column>=0&&n.column<s.columns.length)||!unique(s.nodes.map(n=>n.id)))return '桑基图需2–5列、≤40个不同id的具名节点，column为列下标';
  const nodes=new Map(s.nodes.map(n=>[n.id,{...n,input:0,output:0}])),seen=new Set();
  if(!list(s.links,100))return '桑基图需1–100条流量';
  for(const l of s.links){
   const a=nodes.get(l?.source),b=nodes.get(l?.target),key=JSON.stringify([l?.source,l?.target]);
   if(!obj(l,['source','target','value'])||!a||!b||a.column+1!==b.column||!num(l.value)||l.value<=0||seen.has(key))return '桑基图边仅连接相邻下一列，流量为正值且边不重复';
   seen.add(key);a.output+=l.value;b.input+=l.value;
  }
  for(let i=0;i<s.columns.length;i++)if(!s.nodes.some(n=>n.column===i)||s.nodes.filter(n=>n.column===i).length>10)return '桑基图每列需1–10个节点';
  for(const n of nodes.values()){
   if(!n.input&&!n.output)return `桑基图节点「${n.label}」没有输入或输出流量；不能有孤立节点`;
   if(n.column>0&&n.column<s.columns.length-1&&Math.abs(n.input-n.output)>Math.max(1e-8,Math.max(n.input,n.output)*1e-8))return `桑基图节点「${n.label}」输入 ${n.input}、输出 ${n.output}；中间节点输入输出必须守恒`;
  }
 }else if(['scatter','bubble'].includes(s.variant)){
  for(const a of [s.xAxis,s.yAxis])if(!obj(a,['label','unit'])||!text(a.label,128)||!text(a.unit,64))return '散点图每条轴必须标注名称与原始单位';
  const bubble=s.variant==='bubble';
  if(bubble&&(!text(s.sizeLabel,128)||!text(s.sizeUnit,64)))return '气泡图需sizeLabel和sizeUnit说明面积指标';
  if(!list(s.points,bubble?300:600)||!s.points.every(p=>obj(p,['label','x','y','group',...(bubble?['size']:[])])&&text(p.label,128)&&num(p.x)&&num(p.y)&&(p.group===undefined||text(p.group,128))&&(!bubble||num(p.size)&&p.size>=0))||!unique(s.points.map(p=>p.label))||new Set(s.points.map(p=>p.group??'样本')).size>6)return '散点/气泡需具名不同样本、有限x/y、最多6组；气泡size必须非负';
 }else if(s.variant==='heatmap'){
  if(!list(s.labels,16)||s.labels.length<2||!s.labels.every(l=>text(l,128))||!unique(s.labels)||!Array.isArray(s.values)||s.values.length!==s.labels.length||!s.values.every(r=>Array.isArray(r)&&r.length===s.labels.length))return '相关性热力图需2–16个不同指标的方阵';
  for(let i=0;i<s.labels.length;i++)for(let j=0;j<s.labels.length;j++){
   const v=s.values[i][j],mirror=s.values[j][i];
   if(v!==null&&(!num(v)||v<-1||v>1)||i===j&&v!==1||v===null&&mirror!==null||v!==null&&(mirror===null||Math.abs(v-mirror)>1e-8))return '相关矩阵必须对称、对角线为1、系数在[-1,1]；缺失用null';
  }
 }else if(s.variant==='calendar'){
  if(!date(s.start)||!date(s.end)||s.end<s.start||(Date.parse(s.end)-Date.parse(s.start))/86400000>=366||!Array.isArray(s.values)||s.values.length>366||!s.values.every(d=>obj(d,['date','value'])&&date(d.date)&&d.date>=s.start&&d.date<=s.end&&num(d.value)&&d.value>=0)||!unique(s.values.map(d=>d.date)))return '日历热力图需有效且不超过366天的范围，每日唯一非负值；未提供日期保持缺失';
 }else{
  if(!text(s.unit,64)||!text(s.volumeUnit,64)||!list(s.candles,366)||!s.candles.every((c,i)=>obj(c,['date','open','high','low','close','volume'])&&date(c.date)&&(!i||c.date>s.candles[i-1].date)&&[c.open,c.high,c.low,c.close,c.volume].every(v=>num(v)&&v>=0)&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)))return '行情图需1–366条日期严格升序的有效OHLC/volume及价格、成交量单位，high/low须包住开收';
 }
 return null;
}
