export const KPI_TEMPLATES=Object.freeze([{id:'kpi',type:'kpi',title:'指标概要',figma:'1918:343978',width:656,height:286,minWidth:280,minHeight:180,version:'21z-kpi-20261001',interactions:['完整指标口径','原数值单位与缺失原因','实际数据刷新','展开状态恢复']}]);
export const KPI_GUIDANCE='经营/项目指标卡用panel.type和artifact.type都为kpi，首次同次提供artifact:{version:1,type:"kpi",title,subject（正文业务标题，可选）,asOf（原数据来源及时点）,range（原统计范围，可选）,note（可选）,items:[{label,value（原数值或带单位字符串，未知为null）,unit（可选）,change（可选原变化说明）,detail（可选原口径）,missing（value为null时必需）,source（可选原来源）,url（可选已提供或已核验安全http/https来源）}]}。1–12项/32KB，完整保留零、负数、缺失原因、原单位、时点、范围和附加标量字段；不补样例指标、不推算未提供变化或统计月份。range只保留用户明示原范围；输入仅说“本月”时保留“本月”或省略range，不能从其他表格的最新月份推断。change、detail、source等字段也只能复制原指标明示的说明，不能依据其他卡的月份、日期或数值编造本月/上月对应期间；没有原口径时省略detail，不补上月月份、基数或计算解释。宿主提供随可用宽度排列的指标条、窄卡换行和默认展开的完整口径；来源与数据日期保留在底栏，不另写重复说明或刷新按钮。实际刷新由宿主根据数据绑定提供，静态快照不伪造刷新能力或刷新时间。';
export function kpiDataIssue(s){
 const record=v=>v&&typeof v==='object'&&!Array.isArray(v),text=(v,n=2000)=>typeof v==='string'&&v.trim().length>0&&v.length<=n,scalar=v=>typeof v==='string'&&v.length<=2000||typeof v==='number'&&Number.isFinite(v)||v===null;
 const safeUrl=v=>{try{const u=new URL(v);return typeof v==='string'&&v.length<=2048&&!/[\u0000-\u0020\u007f]/.test(v)&&['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
 if(!record(s))return '指标卡必须是对象';
 if(s.version!==1)return '指标卡缺少 version:1，请在 mapping 顶层补上';
 if(s.type!=='kpi')return '指标卡 type 必须为 kpi';
 const unknown=Object.keys(s).find(k=>!['version','type','title','subject','asOf','range','note','sources','items'].includes(k));
 if(unknown)return '指标卡不支持顶层字段 '+unknown+'；来源使用 sources:[{name,url?}]，口径用 note，业务指标放 items。其余顶层字段仅支持 version/type/title/subject/asOf/range';
 if(!text(s.title,256))return '指标卡 title 必须是非空标题（最多256字）';
 if(!Array.isArray(s.items)||s.items.length<1||s.items.length>12)return '指标卡 items 需要1–12项完整指标';
 for(const k of ['subject','asOf','range','note'])if(s[k]!==undefined&&!text(s[k]))return k+'无效';
 if(s.sources!==undefined&&(!Array.isArray(s.sources)||s.sources.length>12||s.sources.some(v=>!record(v)||Object.keys(v).some(k=>!['name','url'].includes(k))||!text(v.name)||v.url!==undefined&&!safeUrl(v.url))))return '来源需完整name和安全http/https链接';
 for(const [index,item]of s.items.entries()){
  if(!record(item)||!text(item.label,256)||!(item.value===null||typeof item.value==='number'&&Number.isFinite(item.value)||text(item.value,512)))return '指标第'+(index+1)+'项需完整label与原标量value';
  if(item.value===null&&!text(item.missing))return '未知指标必须用missing保留原缺失原因，不能补零';
  for(const [key,v]of Object.entries(item))if(key==='url'?!safeUrl(v):!scalar(v))return '指标附加字段必须是原标量，链接需安全http/https';
 }
 return new TextEncoder().encode(JSON.stringify(s)).length<=32000?null:'完整指标来源超过32KB，请拆分指标，不截断记录';
}
