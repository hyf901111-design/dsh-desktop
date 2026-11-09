export const TIMELINE_TEMPLATES=Object.freeze([{id:'timeline',type:'timeline',title:'活动时间线',figma:'1918:346434',width:656,height:374,minWidth:280,minHeight:180,version:'21z-timeline-20261001',interactions:['按明确时间排序','同一时刻稳定次序','完整事件展开','原关联记录','最新已取得事件定位','视图恢复']}]);
export const TIMELINE_DATA_GUIDANCE='时间线数据对象：{version:1,type:"timeline",title,subject（正文标题，可选）,range（原范围标签，可选）,timeZone（已知IANA展示时区，可选）,date（HH:mm同日记录的明确YYYY-MM-DD，可选）,asOf（原数据时点，可选）,note（可选）,items:[{id（唯一稳定ID）,title,time（原发生时间字符串或null）,timeMissing（null时必需原缺失原因）,summary（可选原摘要）,actor（可选参与人）,object（可选关联对象）,source（可选原来源）,url（可选已提供/已核验安全http/https链接）}]}。0–60条，完整JSON≤32KB；完整保留原时间、来源和附加标量字段，零、负数、未知不补造。带明确偏移的ISO时间按实际时刻排序；HH:mm仅在明确共同date/timeZone下排序，同一时刻保留来源次序，时间口径无法比较时保留原序并说明。用户原链接独立保留，不拼入摘要，不联网读取。宿主提供节点、连续连线、事件展开、来源及最新已取得记录定位；显示最新动态只是定位已有记录，不取数或伪造新动态。';
export const TIMELINE_GUIDANCE='活动时间线用panel.type和artifact.type均为timeline，同次提供artifact:'+TIMELINE_DATA_GUIDANCE.slice('时间线数据对象：'.length);
const text=(v,n=2000)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const dateValue=v=>{if(typeof v!=='string'||!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(v)||v.startsWith('0000'))return null;const t=new Date(v+'T00:00:00Z');return Number.isFinite(t.getTime())&&t.toISOString().slice(0,10)===v?v:null;};
export function timelineDataIssue(s,{checkCapacity=true}={}){
 const safeUrl=v=>{try{const u=new URL(v);return typeof v==='string'&&v.length<=2048&&!/[\u0000-\u0020\u007f]/.test(v)&&['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
 if(!record(s)||Object.keys(s).some(k=>!['version','type','title','subject','range','timeZone','date','asOf','note','items'].includes(k))||s.version!==1||s.type!=='timeline'||!text(s.title,256)||!Array.isArray(s.items)||s.items.length>(checkCapacity?60:2000))return '时间线需version:1/type:timeline/title及0–60条完整items';
 for(const k of ['subject','range','asOf','note'])if(s[k]!==undefined&&!text(s[k]))return k+'无效';
 if(s.date!==undefined&&!dateValue(s.date))return '同日记录date需有效YYYY-MM-DD';
 if(s.timeZone!==undefined){if(!text(s.timeZone,96))return 'timeZone无效';try{new Intl.DateTimeFormat('en',{timeZone:s.timeZone});}catch{return 'timeZone需有效IANA时区';}}
 const ids=new Set();for(const item of s.items){
  if(!record(item)||!text(item.id,512)||/[\u0000-\u001f\u007f]/u.test(item.id)||ids.has(item.id)||!text(item.title,checkCapacity?256:8192)||!(item.time===null||text(item.time,256)))return '事件需唯一稳定id、完整title及原time字符串或null';ids.add(item.id);
  if(item.time===null&&!text(item.timeMissing))return '未知发生时间需timeMissing，不以创建时间或当前时间补齐';
  for(const [k,v]of Object.entries(item))if(k==='url'?!safeUrl(v):!(v===null||typeof v==='string'&&(!checkCapacity||v.length<=2000)||typeof v==='number'&&Number.isFinite(v)||typeof v==='boolean'))return '事件附加字段需完整原标量，来源链接需安全http/https';
 }
 return !checkCapacity||new TextEncoder().encode(JSON.stringify(s)).length<=32000?null:'完整时间线超过32KB，请拆分记录，不截断事件';
}
function timeKey(item,spec){
 if(item.time===null)return {kind:'missing',value:null};
 const full=typeof item.time==='string'&&item.time.match(/^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/);
 if(full&&dateValue(full[1])&&Number.isFinite(Date.parse(item.time)))return {kind:'absolute',value:Date.parse(item.time)};
 const clock=typeof item.time==='string'&&item.time.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
 if(clock&&dateValue(spec.date)&&spec.timeZone)return {kind:'clock',value:Number(clock[1])*3600+Number(clock[2])*60+Number(clock[3]||0)};
 return {kind:'unresolved',value:null};
}
export function timelineOrder(spec){
 const rows=spec.items.map((item,index)=>({item,index,...timeKey(item,spec)})),known=rows.filter(r=>r.value!==null),kinds=new Set(known.map(r=>r.kind));
 const sortable=known.length>0&&kinds.size===1&&!rows.some(r=>r.kind==='unresolved');
 return {sortable,items:sortable?rows.sort((a,b)=>(a.value===null)-(b.value===null)||(b.value??0)-(a.value??0)||a.index-b.index).map(r=>r.item):[...spec.items]};
}
export function timelineDisplayTime(item,spec){
 const key=timeKey(item,spec);
 if(key.kind==='absolute'&&spec.timeZone){const value=new Intl.DateTimeFormat('zh-CN',{timeZone:spec.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(key.value);return {clock:value,date:new Intl.DateTimeFormat('sv-SE',{timeZone:spec.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(key.value)};}
 if(key.kind==='absolute')return {clock:item.time.slice(11,16),date:item.time.slice(0,10),offset:item.time.match(/(Z|[+-]\d{2}:\d{2})$/)[1]};
 if(key.kind==='clock')return {clock:item.time,date:spec.date};
 return {clock:'时间待定',date:''};
}
