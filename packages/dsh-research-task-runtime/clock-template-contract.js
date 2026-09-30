export const CLOCK_TEMPLATES=Object.freeze([
 Object.freeze({id:'clock',type:'clock',title:'世界时钟',figma:'1917:353139',width:980,height:200,minWidth:320,minHeight:180,version:'21z-20260930',interactions:['城市与时区','12/24小时制']})
]);
export function clockTemplateSchema(type){
 if(type==='clock')return 'version:1,type:"clock",title,asOf,locations:[{id:"ny",label:"纽约 · 美国",timeZone:"America/New_York"}]；1–12个唯一id，timeZone必须为有效IANA时区。可选selectedId、hourCycle:"h23"或"h12"、note。mode默认live，从设备时钟实时计算；mode:"snapshot"必须提供带Z或时区偏移的ISO currentTime（如2026-09-30T12:00:00Z），固定展示该时刻并明确标注快照。按IANA规则计算夏令时与跨日，不把时钟更新时间写成行情刷新时间。时钟的live和snapshot均必须在首次工作台调用提供完整panel.artifact时区配置，不能仅传title/prompt。';
}
export function clockDataIssue(s){
 const text=(v,n=256)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
 const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
 if(!object(s,['version','type','title','asOf','locations','selectedId','hourCycle','mode','currentTime','note'])||s.version!==1||s.type!=='clock'||!text(s.title)||!text(s.asOf))return '时钟需version:1、type:clock、title、asOf及locations';
 if(s.note!==undefined&&!text(s.note,2000))return 'note无效';
 if(s.hourCycle!==undefined&&!['h23','h12'].includes(s.hourCycle))return 'hourCycle必须为h23或h12';
 if(s.mode!==undefined&&!['live','snapshot'].includes(s.mode))return 'mode必须为live或snapshot';
 if(!Array.isArray(s.locations)||!s.locations.length||s.locations.length>12)return 'locations必须包含1–12个城市或时区';
 const seen=new Set();
 for(const [i,l]of s.locations.entries()){
  if(!object(l,['id','label','timeZone'])||!text(l.id,64)||!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(l.id)||seen.has(l.id)||!text(l.label)||!text(l.timeZone,96)||!(/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(l.timeZone)||l.timeZone==='UTC'))return `locations[${i}]需唯一安全id、label和IANA timeZone`;
  try{new Intl.DateTimeFormat('en',{timeZone:l.timeZone}).format(0);}catch{return `locations[${i}].timeZone不是有效IANA时区`;}
  seen.add(l.id);
 }
 if(s.selectedId!==undefined&&!seen.has(s.selectedId))return 'selectedId必须对应locations中的城市';
 if(s.mode==='snapshot'){
  if(typeof s.currentTime!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(s.currentTime)||!Number.isFinite(Date.parse(s.currentTime)))return 'snapshot需带时区的ISO currentTime';
  const [year,month,day]=s.currentTime.slice(0,10).split('-').map(Number);
  if(new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10)!==s.currentTime.slice(0,10))return 'currentTime日期无效';
 }else if(s.currentTime!==undefined)return 'live时钟使用设备当前时间，不接受固定currentTime；固定时间请用snapshot';
 return null;
}
// Uses the supplied instant, never a fixed UTC offset. Serialized with runtime.
export function clockDisplayValue(timeZone,hourCycle,instant){
 const date=new Date(instant);
 return {
  time:new Intl.DateTimeFormat('zh-CN',{timeZone,hourCycle,hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(date),
  date:new Intl.DateTimeFormat('zh-CN',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).format(date),
  offset:new Intl.DateTimeFormat('en',{timeZone,timeZoneName:'shortOffset'}).formatToParts(date).find(p=>p.type==='timeZoneName')?.value??timeZone
 };
}
