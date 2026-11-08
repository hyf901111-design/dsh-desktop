export const DERIVED_GUIDANCE='总结提炼使用type=summary，思维导图使用type=mind-map。首次同时提交完整artifact:{version:1,type,title,asOf?（材料数据时点）,content,source:{title,text,nodeId?}}。content为完整结果，source为一个所选组件的冻结原标题和完整原文；仅当已有画布组件ID明确时提供nodeId，不猜ID。不扩展到整个工作台，不补充来源未提供的事实；摘要区分事实、推断和待验证。思维导图content仅用一个#根标题和完整项目列表；第一层项目可无缩进或两空格缩进，之后每层增加两空格，不能把普通正文静默丢掉。结果可编辑、原文独立保留。用户直接提供的材料也可作为source，明确来源为本人提供材料，不编造画布链接。不生成HTML，不启动逐卡模型。'
export const DERIVED_TEMPLATES=Object.freeze([
 {id:'summary',type:'summary',title:'总结提炼',figma:'1918:343676'},
 {id:'mind-map',type:'mind-map',title:'思维导图',figma:'1917:357536'}
].map(t=>Object.freeze({...t,width:980,height:280,minWidth:280,minHeight:180,version:'21z-derived-20261001',interactions:['完整原文与来源','回到来源组件','编辑结果','复制导出','会话恢复']})))
// Every nonblank outline line must be represented. The older renderer's 48-node
// budget is not used for this preset; a large tree scrolls without losing leaves.
export function derivedOutline(content){
 if(typeof content!=='string')return null
 const lines=content.split(/\r?\n/),first=lines.findIndex(s=>s.trim()),heading=lines[first]?.match(/^#\s+(.+)$/)
 if(!heading)return null
 const root={label:heading[1],line:first,children:[]},stack=[{depth:-1,node:root}];let count=1,baseDepth=null
 for(let i=first+1;i<lines.length;i++){
  if(!lines[i].trim())continue
  const m=lines[i].match(/^( *)(?:[-*+] )(.+)$/)
  if(!m||m[1].length%2||++count>500)return null
  const rawDepth=m[1].length/2;if(baseDepth===null){if(rawDepth>1)return null;baseDepth=rawDepth}
  const depth=rawDepth-baseDepth;if(depth<0||depth>8)return null
  if(depth>stack.at(-1).depth+1)return null
  while(stack.length>1&&stack.at(-1).depth>=depth)stack.pop()
  const node={label:m[2],line:i,children:[]};stack.at(-1).node.children.push(node);stack.push({depth,node})
 }
 return root.children.length?root:null
}
export function parseDerivedSpec(s){
 const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max
 if(!s||typeof s!=='object'||Array.isArray(s)||s.version!==1||!['summary','mind-map'].includes(s.type)||!text(s.title,256)||!text(s.content,32000))return null
 if(Object.keys(s).some(k=>!['version','type','title','content','source','asOf','note'].includes(k)))return null
 if(s.asOf!==undefined&&!text(s.asOf,1024))return null
 if(s.note!==undefined&&!text(s.note,4000))return null
 const source=s.source
 if(!source||typeof source!=='object'||Array.isArray(source)||!text(source.title,256)||!text(source.text,32000)||Object.keys(source).some(k=>!['title','text','nodeId'].includes(k)))return null
 if(source.nodeId!==undefined&&(typeof source.nodeId!=='string'||!/^[-\w:]{1,128}$/.test(source.nodeId)))return null
 if(s.type==='mind-map'&&!derivedOutline(s.content))return null
 if(new TextEncoder().encode(JSON.stringify(s)).length>64000)return null
 return Object.freeze({...s,source:Object.freeze({...source})})
}
