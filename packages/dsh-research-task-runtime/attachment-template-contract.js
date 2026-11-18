export const ATTACHMENT_GUIDANCE='用户上传用于分析的输入附件默认是内容证据，不是新增交付文件卡的请求；原文件通过业务组件底栏来源文件入口访问，不为输入附件另造不可预览的文件卡。仅用户需要文件集合/文件浏览或新生成文件交付时才创建files组件。文件使用panel.type=files，图集使用panel.type=gallery。首次必须提供artifact:{version:1,type,title,asOf?（资料数据时点，不代替每项原文件date）,items:[{id,name,url或relativePath,description?,source?,date?,sizeBytes?,mimeType?,alt?,permissions?:{preview?,download?,remove?}}]}。只使用本人提供的原文件/原图网址或当前工作目录内相对路径；未提供原文件时显式url:null或items:[]，不编造样例文件或图片。大小为真实字节数，未知省略或null，不补零。来源、长文件名、图片alt及说明完整保留；下载与移除权限独立。采用source模式，宿主直接prepared，不生成HTML或逐卡模型。authorizationId仅由客户端导入产生，模型不创建或猜测。'
export const ATTACHMENT_TEMPLATES=Object.freeze([
 {id:'files',type:'files',title:'文件与附件',figma:'1918:347373',width:656,height:410,minWidth:280,minHeight:180,version:'21z-attachments-20261002',interactions:['搜索附件','完整文件名','安全预览','原文件下载','导入进度和重试','独立下载移除权限']},
 {id:'gallery',type:'gallery',title:'图片与图集',figma:'1918:347930',width:656,height:364,minWidth:280,minHeight:180,version:'21z-attachments-20261002',interactions:['缩略图','原图预览','上一张下一张','原图下载','导入图片','失败说明','会话恢复']}
])
// This exact validator is serialized into the trusted client.
export function parseAttachmentSpec(value){
 const record=(v,required,optional=[])=>v&&typeof v==='object'&&!Array.isArray(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k))
 const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)
 if(!record(value,['version','type','title','items'],['description','source','date','asOf','presentation'])||value.version!==1||!['files','gallery'].includes(value.type)||!text(value.title,256)||!Array.isArray(value.items)||value.items.length>128)return null
 for(const key of ['description','source','date','asOf'])if(value[key]!==undefined&&!text(value[key],key==='description'?4096:key==='source'?1024:128))return null
 const ids=new Set(),items=[]
 for(const item of value.items){
  if(!record(item,['id','name'],['url','relativePath','authorizationId','sizeBytes','date','mimeType','description','source','alt','permissions'])||!text(item.id,128)||!text(item.name,512)||ids.has(item.id))return null
  ids.add(item.id)
  if(['url','relativePath','authorizationId'].filter(k=>Object.hasOwn(item,k)).length!==1)return null
  if(Object.hasOwn(item,'url')&&item.url!==null){
   if(!text(item.url,8192)||item.url!==item.url.trim()||/[\u0000-\u0020\u007f]/.test(item.url)||!/^https?:\/\//i.test(item.url))return null
   try{const Url=globalThis.URL??globalThis.window?.URL,u=new Url(item.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!u.hostname)return null}catch{return null}
  }
  if(Object.hasOwn(item,'relativePath')&&(!text(item.relativePath,8192)||item.relativePath!==item.relativePath.trim()||/[\\:]/.test(item.relativePath)||item.relativePath.split('/').some(p=>!p||p==='.'||p==='..')))return null
  if(Object.hasOwn(item,'authorizationId')&&!text(item.authorizationId,512))return null
  if(item.sizeBytes!==undefined&&item.sizeBytes!==null&&(!Number.isSafeInteger(item.sizeBytes)||item.sizeBytes<0))return null
  for(const [key,max] of [['date',128],['mimeType',128],['description',4096],['source',1024],['alt',2048]])if(item[key]!==undefined&&!text(item[key],max))return null
  if(item.permissions!==undefined&&(!record(item.permissions,[],['preview','download','remove'])||Object.values(item.permissions).some(v=>typeof v!=='boolean')))return null
  items.push(Object.freeze({...item,...(item.permissions?{permissions:Object.freeze({...item.permissions})}:{})}))
 }
 if(value.presentation!==undefined){
  const [page]=items
  if(value.presentation!=='webpage'||value.type!=='files'||items.length!==1||!page.relativePath?.endsWith('.workbench.html')||!(/\.html?$/i.test(page.name))||page.permissions?.preview===false)return null
 }
 if(new TextEncoder().encode(JSON.stringify(value)).length>256000)return null
 return Object.freeze({...value,items:Object.freeze(items)})
}
