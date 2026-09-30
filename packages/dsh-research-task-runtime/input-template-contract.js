export const INPUT_TEMPLATES=Object.freeze([
 {id:'form',type:'form',title:'通用表单',figma:'1918:354019',width:656,height:428,minWidth:400,minHeight:380,interactions:['输入校验','本地提交记录','重置填写']},
 {id:'code',type:'code',title:'代码与结构化内容',figma:'1918:354512',width:656,height:328,minWidth:400,minHeight:280,interactions:['原始与格式化','行号','展开长内容','复制','下载']}
].map(t=>Object.freeze({...t,version:'21z-20260930'})));
const languages=['json','javascript','typescript','python','sql','text'];
export function inputTemplateSchema(type){
 if(type==='form')return 'version:1,type:"form",title,subject,asOf,fields:[{id:"topic",label:"研究主题",kind:"text",required:true,value:"季度经营表现分析"},{id:"priority",label:"优先级",kind:"select",options:[{value:"normal",label:"普通"},{value:"high",label:"高"}],value:"normal"},{id:"notes",label:"补充说明",kind:"textarea"}]；1–20个唯一id字段；kind为text/textarea/select/number/date，可选help/placeholder/maxLength（1–4000）；number可选min/max。提交仅保存本画布的本地输入记录，不启动智能体、不更新外部业务系统。';
 if(type==='code')return 'version:1,type:"code",title,asOf,language:"json",content:"原始代码或JSON文本"；language为json/javascript/typescript/python/sql/text，content为1–128000字符，可选note。JSON提供原始及格式化查看，格式错误原样展示并提示；复制与下载保留当前格式，不执行代码。';
}
export function inputDataIssue(s){
 const text=(v,n=256)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
 const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
 if(!INPUT_TEMPLATES.some(t=>t.id===s?.type))return '未注册的输入组件类型';
 if(!object(s,['version','type','title','asOf','subject','note',...(s.type==='form'?['fields']:['content','language'])])||s.version!==1||!text(s.title)||!text(s.asOf))return '输入组件需 version:1、title、asOf 和对应内容';
 if(s.subject!==undefined&&!text(s.subject)||s.note!==undefined&&!text(s.note,2000))return 'subject 或 note 无效';
 if(new TextEncoder().encode(JSON.stringify(s)).length>240000)return '组件输入超过240000字节';
 if(s.type==='code')return s.content?.split?.('\n').length>4000?'代码最多4000行':!languages.includes(s.language)||!text(s.content,128000)?'代码需有效 language 和1–128000字符 content':null;
 if(!Array.isArray(s.fields)||!s.fields.length||s.fields.length>20)return '表单需1–20个字段';
 const ids=new Set();
 for(const [i,f]of s.fields.entries()){
  if(!object(f,['id','label','kind','required','value','help','placeholder','maxLength','min','max','options'])||!text(f.id,64)||!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(f.id)||ids.has(f.id)||!text(f.label)||!['text','textarea','select','number','date'].includes(f.kind))return `fields[${i}] 需唯一安全id、label和kind`;
  ids.add(f.id);
  if(f.required!==undefined&&typeof f.required!=='boolean')return `fields[${i}].required需布尔值`;
  for(const k of ['help','placeholder'])if(f[k]!==undefined&&!text(f[k],1000))return `fields[${i}].${k}无效`;
  if(f.maxLength!==undefined&&(!Number.isInteger(f.maxLength)||f.maxLength<1||f.maxLength>4000))return `fields[${i}].maxLength无效`;
  if(f.value!==undefined&&(typeof f.value!=='string'||f.value.length>(f.maxLength??4000)))return `fields[${i}].value需有界字符串`;
  if(f.kind==='number'){
   if([f.min,f.max].some(v=>v!==undefined&&(!Number.isFinite(v)||Math.abs(v)>1e12))||f.min!==undefined&&f.max!==undefined&&f.min>f.max)return `fields[${i}]数值范围无效`;
  }else if(f.min!==undefined||f.max!==undefined)return `fields[${i}]仅number支持min/max`;
  if(f.kind==='select'){
   if(!Array.isArray(f.options)||!f.options.length||f.options.length>30||f.options.some(o=>!object(o,['value','label'])||!text(o.value)||!text(o.label))||new Set(f.options.map(o=>o.value)).size!==f.options.length||f.value&& !f.options.some(o=>o.value===f.value))return `fields[${i}].options或value无效`;
  }else if(f.options!==undefined)return `fields[${i}]仅select支持options`;
 }
 return null;
}
// Also serialized into the host page. Derive exports from retained data, never
// accept executable markup, a file path, or clipboard contents from an iframe.
export function codeTemplatePayload(data,format){
 if(!data||data.version!==1||data.type!=='code'||typeof data.title!=='string'||data.title.length>256||typeof data.content!=='string'||!data.content.length||data.content.length>128000||!['json','javascript','typescript','python','sql','text'].includes(data.language)||!['original','formatted'].includes(format))return null;
 let content=data.content;
 if(format==='formatted'){
  if(data.language!=='json')return null;
  try{content=JSON.stringify(JSON.parse(content),null,2);}catch{return null;}
 }
 return {content,format:data.language==='json'?'json':'txt',suggestedName:data.title.slice(0,120)+(data.language==='json'?'.json':'.txt')};
}
