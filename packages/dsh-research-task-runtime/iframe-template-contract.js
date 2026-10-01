export const IFRAME_GUIDANCE='嵌入网页使用 type=iframe，首次同时提交 artifact:{version:1,type:"iframe",title,url,description?}。url 必须是用户明确提供的无凭据 HTTP/HTTPS 网址；未提供网址时显式 url:null，展示添加网址空状态，不猜测网址，不生成HTML或逐卡模型。保留用户原网址与说明。网页浏览与重新载入不代表重新取数；登录过期由网站决定。'
export const IFRAME_TEMPLATES=Object.freeze([{id:'iframe',type:'iframe',title:'嵌入网页',figma:'1917:353041',width:485,height:340,minWidth:280,minHeight:180,version:'21z-iframe-20261001',interactions:['添加和修改网址','网页浏览','重新载入','加载失败重试','浏览器打开','会话恢复']}])
// Shared verbatim with the native host parser. No executable HTML is accepted.
export function parseIframeSpec(value){
 if(!value||Array.isArray(value)||value.version!==1||value.type!=='iframe'||typeof value.title!=='string'||!value.title.trim()||value.title.length>256)return null
 if(!['version','type','title','url'].every(k=>Object.hasOwn(value,k))||Object.keys(value).some(k=>!['version','type','title','url','description'].includes(k)))return null
 if(value.description!==undefined&&(typeof value.description!=='string'||!value.description.trim()||value.description.length>1024))return null
 if(value.url!==null){
  if(typeof value.url!=='string'||value.url.length>8192||value.url!==value.url.trim()||/[\u0000-\u0020\u007f]/.test(value.url)||!/^https?:\/\//i.test(value.url))return null
  try{const Url=globalThis.URL??globalThis.window?.URL,url=new Url(value.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!url.hostname)return null}catch{return null}
 }
 return Object.freeze({version:1,type:'iframe',title:value.title,url:value.url,...(value.description===undefined?{}:{description:value.description})})
}
