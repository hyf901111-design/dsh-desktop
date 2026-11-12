import {inputDataIssue} from './input-template-contract.js';

function separateFields(text){
 const parts=[];
 let depth=0,start=0;
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(char==='（'||char==='(')depth++;
  if(char==='）'||char===')')depth--;
  if(depth<0)return;
  if(depth===0&&(/[、，,]/u.test(char)||char==='和'&&/^(?:必填|可选|多行)/u.test(text.slice(i+1)))){
   parts.push(text.slice(start,i));
   start=i+1;
  }
 }
 if(depth===0)return [...parts,text.slice(start)].map(part=>part.trim());
}

function nativeField(piece,index){
 const match=/^(必填|可选)?\s*(多行)?([\p{L}\p{N}][\p{L}\p{N} ·/-]{0,36}?)(下拉)?(?:[（(]([^（）()]+)[）)])?$/u.exec(piece);
 if(!match)return;
 const [,presence,multiline,label,dropdown,description]=match;
 if(/上传|附件|验证码|密码/u.test(label))return;
 const field={id:`item-${index+1}`,label,...(presence==='必填'?{required:true}:{})};
 if(dropdown){
  const options=description?.split(/[、，,]/u).map(option=>option.trim());
  if(!options?.length||options.some(option=>!option||option.length>40||/[:：]|例如|等$/u.test(option)))return;
  return {...field,kind:'select',options:options.map(option=>({value:option,label:option}))};
 }
 if(description){
  const range=/^(?:(万元|亿元|元|%|％|bp|个|笔)[，,、]\s*)?([+-]?\d+(?:\.\d+)?)\s*(?:到|至|[-–—~～])\s*([+-]?\d+(?:\.\d+)?)$/u.exec(description.trim());
  if(!range)return;
  const [,unit,min,max]=range;
  return {...field,label:unit?`${label}（${unit}）`:label,kind:'number',min:Number(min),max:Number(max)};
 }
 const kind=multiline||/(?:说明|备注|理由|详情|原因)$/u.test(label)?'textarea':/(?:日期|(?:交付|生效|到期|截止|发生)日)$/u.test(label)?'date':'text';
 return {...field,kind};
}

export function prepareAuthoredLocalForm(panel,request=''){
 if(!['form','html'].includes(panel?.type)||panel.library||panel.publicData||panel.profile||panel.requests||
    !/表单/u.test(request)||!/(?:仅|只).{0,15}(?:工作台|画布|本地).{0,12}(?:保存|记录)|(?:本地|工作台内)(?:保存|登记)/u.test(request)||
    /(?:联动|动态字段|自动审批|提交到外部|同步到其他系统)/u.test(request))return panel;
 const originalTitle=panel.title?.split(/[（(]/u,1)[0].trim();
 const clauses=[...request.matchAll(/[「“『]([^」”』\n]+)[」”』]([^「“『。；;\n]*)/gu)];
 const text=clauses.find(([,title])=>title===originalTitle)?.[2]?.trim();
 const description=/^(?:要有|包含|字段(?:为|有|包括)?)\s*[:：]?\s*(.+)$/u.exec(text??'')?.[1];
 if(!description)return panel;
 const parts=separateFields(description);
 const fields=parts?.map(nativeField);
 if(!fields?.length||fields.some(field=>!field)||new Set(fields.map(field=>field.label)).size!==fields.length)return panel;
 const artifact={version:1,type:'form',title:originalTitle,asOf:'本工作台登记',mode:'local',fields};
 if(inputDataIssue(artifact))return panel;
 const {view,artifact:previous,content,...layout}=panel;
 return {...layout,type:'form',title:originalTitle,artifact};
}
