// Figma 21Z: source statuses stay separate from personal review annotations.
export const WORKFLOW_TEMPLATES=Object.freeze([
 {id:'approval',title:'审批记录',figma:'1918:346911',width:656,height:354,interactions:['审批步骤','完整意见','本地审阅记录']},
 {id:'alerts',title:'工作台提醒',figma:'1918:354877',width:656,height:392,interactions:['分类筛选','未读筛选','完整内容','本地已读标记']}
].map(t=>Object.freeze({...t,type:t.id,version:'21z-20260930',minWidth:400,minHeight:320})));
const statuses=['pending','approved','rejected'];
const shapes={
 approval:'subject:"研究报告发布申请",status:"pending",applicant:"张晓",submittedAt:"2026-09-30 10:24",items:[{id:"a",reviewer:"李明",stage:"数据核验",status:"approved",comment:"确认来源与披露日期",date:"2026-09-30 11:00"},{id:"b",reviewer:"王悦",stage:"研究负责人",status:"pending",comment:"核验结论与风险提示"}]；status只能为pending/approved/rejected，items为1–30个不同id的真实审批步骤。mode=local时只保存个人审阅意见，不改变来源审批状态或向审批系统提交。',
 alerts:'items:[{id:"a",title:"公司公告已更新",summary:"新增季度报告，可查看内容与来源",date:"2026-09-30 10:00",category:"提醒",read:false,detail:"可选完整备选方案或补充内容"}]；1–100条不同id，date保留来源时间，read为布尔值；summary与可选detail分别最多4000字，完整保留并在详情展开中显示，不删除关键业务内容以适配。按提供顺序显示，不将相对时间当作准确日期。mode=local仅允许保存本画布的个人已读标记，不执行风险动作或自动监测。'
};
export function workflowTemplateSchema(type){return shapes[type];}
export function workflowDataIssue(s){
 const text=(v,n=256)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
 const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
 if(!shapes[s?.type])return '未注册的工作流组件类型';
 const approval=s.type==='approval';
 const keys=['version','type','title','asOf','subject','note','mode','items',...(approval?['status','applicant','submittedAt']:[])];
 if(!object(s,keys)||s.version!==1||!text(s.title)||!text(s.asOf))return '工作流组件需 version:1、title、asOf 和对应记录';
 if(s.mode!==undefined&&!['snapshot','local'].includes(s.mode))return 'mode 必须为 snapshot 或 local';
 for(const key of ['subject','note'])if(s[key]!==undefined&&!text(s[key],key==='note'?2000:256))return `${key} 无效`;
 if(approval&&(!text(s.subject)||!text(s.applicant)||!text(s.submittedAt)||!statuses.includes(s.status)))return '审批记录需 subject、applicant、submittedAt 和有效 status';
 const max=approval?30:100;
 if(!Array.isArray(s.items)||!s.items.length||s.items.length>max)return `items 必须包含1–${max}条记录`;
 const ids=new Set();
 for(const [index,item]of s.items.entries()){
  const label=`items[${index}]`;
  const itemKeys=approval?['id','reviewer','stage','status','comment','date']:['id','title','summary','date','category','read','detail'];
  if(!item||typeof item!=='object'||Array.isArray(item))return `${label} 需要记录对象`;
  const unknown=Object.keys(item).filter(key=>!itemKeys.includes(key));
  if(unknown.length)return `${label} 不支持字段 ${unknown.join('、')}；请按契约保留完整业务记录，不删除关键内容冒充完成`;
  if(!text(item.id,64)||ids.has(item.id))return `${label} 需要唯一 id 和对应类型字段`;
  ids.add(item.id);
  if(approval){
   if(!text(item.reviewer)||!text(item.stage)||!statuses.includes(item.status))return `${label} 需要 reviewer、stage 和有效 status`;
   if((item.comment!==undefined&&!text(item.comment,4000))||(item.date!==undefined&&!text(item.date)))return `${label} 的 comment 或 date 无效`;
  }else {
   if(!text(item.title)||!text(item.summary,4000)||!text(item.date)||!text(item.category)||typeof item.read!=='boolean')return `${label} 需要 title、summary、date、category 和布尔 read`;
   if(item.detail!==undefined&&!text(item.detail,4000))return `${label}.detail 需非空完整文本且不超过4000字，超限请拆分，不截断`;
  }
 }
 return null;
}
