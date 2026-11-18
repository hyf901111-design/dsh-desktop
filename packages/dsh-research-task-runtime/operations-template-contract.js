import {NOTE_TEMPLATES,noteDataIssue,noteTemplateSchema} from './note-template-contract.js';
import {RSS_TEMPLATES,rssDataIssue,rssTemplateSchema} from './rss-template-contract.js';
import {CLOCK_TEMPLATES,clockDataIssue,clockTemplateSchema} from './clock-template-contract.js';
import {INPUT_TEMPLATES,inputDataIssue,inputTemplateSchema} from './input-template-contract.js';
// Figma 21Z / enterprise 22: the model supplies records, the host owns layout.
import {WORKFLOW_TEMPLATES,workflowDataIssue,workflowTemplateSchema} from "./workflow-template-contract.js";
export const OPERATIONS_TEMPLATES = Object.freeze([
 ...NOTE_TEMPLATES,
 ...RSS_TEMPLATES,
 ...CLOCK_TEMPLATES,
 ...INPUT_TEMPLATES,
 ...WORKFLOW_TEMPLATES,
 {id:'progress',title:'目标与进度',figma:'1918:344375',width:656,height:354,interactions:['分项目进度','完整口径','本地更新']},
 {id:'tasks',title:'任务清单',figma:'1918:344860',width:656,height:364,interactions:['筛选','任务详情','本地完成与撤销','添加本地任务']}
].map(t=>Object.freeze({...t,type:t.id,version:['note','rss'].includes(t.id)?t.version:'21z-20260930',minWidth:t.minWidth??400,minHeight:t.minHeight??320})));
const shapes = {
 progress:'items:[{label:"资料收集",current:24,target:24},{label:"数据核验",current:20,target:30}]；1–20项，current/target为有限非负原值，target必须大于0，宿主从合计计算总进度；可选unit、deadline、status。',
 tasks:'items:[{id:"a",title:"核对财务来源",completed:false,status:"进行中",owner:"研究组",due:"2026-10-15",priority:"高",detail:"逐项核验披露日期"}]；快照需1–100条记录。个人清单用mode:"local"，用户尚未提供事项时用items:[]，以便自行添加。每条id唯一，completed是布尔值，status/owner/due/priority/detail可选。status保留来源业务状态，支持按状态和负责人筛选；本地勾选仅改变个人完成记录，不改写来源status。'
};
export function operationsTemplateSchema(type){
 const common='公共字段 version:1,type,title,asOf（来源及数据时点）；可选 subject（正文业务标题）、note、mode:"snapshot"或"local"。默认snapshot仅展示来源记录；local支持保存到本画布的个人进度、清单、审阅意见和已读标记，不向外部业务系统写入，也不声称已更新原始数据源。';
 if(noteTemplateSchema(type))return noteTemplateSchema(type);
 if(rssTemplateSchema(type))return rssTemplateSchema(type);
 if(clockTemplateSchema(type))return clockTemplateSchema(type);
 if(inputTemplateSchema(type))return inputTemplateSchema(type);
 if(workflowTemplateSchema(type))return common+`${type}：${workflowTemplateSchema(type)}`;
 return common+(type&&shapes[type]?`${type}：${shapes[type]}`:Object.entries(shapes).map(([k,v])=>`${k}：${v}`).join('；')+'；'+[...NOTE_TEMPLATES,...RSS_TEMPLATES,...CLOCK_TEMPLATES,...WORKFLOW_TEMPLATES,...INPUT_TEMPLATES].map(t=>`${t.id}：${noteTemplateSchema(t.id)??rssTemplateSchema(t.id)??clockTemplateSchema(t.id)??workflowTemplateSchema(t.id)??inputTemplateSchema(t.id)}`).join('；'));
}
export function operationsDataIssue(s){
 if(NOTE_TEMPLATES.some(t=>t.id===s?.type))return noteDataIssue(s);
 if(RSS_TEMPLATES.some(t=>t.id===s?.type))return rssDataIssue(s);
 if(CLOCK_TEMPLATES.some(t=>t.id===s?.type))return clockDataIssue(s);
 if(INPUT_TEMPLATES.some(t=>t.id===s?.type))return inputDataIssue(s);
 if(WORKFLOW_TEMPLATES.some(t=>t.id===s?.type))return workflowDataIssue(s);
 const text=(v,n=256)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
 const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e12;
 const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
 if(!shapes[s?.type])return '未注册的运营组件类型';
 if(s.version!==1||!text(s.title)||!text(s.asOf)||!object(s,['version','type','title','asOf','subject','note','mode','items',...(s.type==='progress'?['unit','deadline','status']:['owner'])]))return '运营组件需 version:1、title、asOf 和对应数据字段';
 for(const key of ['subject','unit','deadline','status','owner','note'])if(s[key]!==undefined&&!text(s[key],key==='note'?2000:256))return `${key} 无效`;
 if(s.mode!==undefined&&!['snapshot','local'].includes(s.mode))return 'mode 必须为 snapshot 或 local';
 const maximum=s.type==='progress'?20:100;
 const minimum=s.type==='tasks'&&s.mode==='local'?0:1;
 if(!Array.isArray(s.items)||s.items.length<minimum||s.items.length>maximum)return `items 必须包含${minimum}–${maximum}项`;
 const seen=new Set();
 for(const [index,item]of s.items.entries()){
  if(s.type==='progress'){
   if(!object(item,['label','current','target','detail'])||!text(item.label)||!number(item.current)||!number(item.target)||item.target===0)return `进度第${index+1}项需 label、非负 current 和大于0的 target`;
  }else{
   if(!object(item,['id','title','completed','status','owner','due','priority','detail'])||!text(item.id,64)||seen.has(item.id)||!text(item.title)||typeof item.completed!=='boolean')return `任务第${index+1}项需唯一 id、title 和布尔 completed，且仅使用约定字段`;
   seen.add(item.id);
   for(const key of ['status','owner','due','priority'])if(item[key]!==undefined&&!text(item[key]))return `任务第${index+1}项 ${key} 无效`;
  }
  if(item.detail!==undefined&&!text(item.detail,2000))return `第${index+1}项 detail 无效`;
 }
 return null;
}
export function requestedOperationsType(value){
 if(typeof value!=='string')return undefined;
 if(/\b(?:RSS|Atom)\b|订阅源|订阅组件/iu.test(value))return 'rss';
 return value.match(/\b(?:type[:=\s]+|operations\.)(progress|tasks|approval|alerts|form|code|clock|note)\b/iu)?.[1]?.toLowerCase()??(/Markdown\s*笔记|研究笔记|可编辑笔记|笔记卡片/iu.test(value)?'note':/世界时钟|时区时钟|\bclock\b/iu.test(value)?'clock':/通用表单|输入表单|研究需求表单/iu.test(value)?'form':/代码与结构化内容|JSON查看|代码查看/iu.test(value)?'code':/审批记录|审批流程|approval/iu.test(value)?'approval':/工作台提醒|通知列表|alerts/iu.test(value)?'alerts':/任务清单|任务列表|待办|checklist/iu.test(value)?'tasks':/目标与进度|目标进度|分项进度|progress/iu.test(value)?'progress':undefined);
}
