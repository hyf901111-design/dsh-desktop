export const RSS_TEMPLATES=Object.freeze([{id:'rss',type:'rss',title:'RSS 订阅',figma:'1917:352946',width:980,height:410,minWidth:280,minHeight:180,version:'21m-rss-20261001',interactions:['内容与订阅管理','搜索与来源筛选','新增订阅与实际读取','手动刷新','保留失败前数据','原文来源','视图恢复']}]);
export const RSS_WORKBENCH_GUIDANCE='RSS/Atom订阅使用panel.type与artifact.type都为rss；首次提交完整artifact:{version:1,type:"rss",title,asOf,feeds:[]}即可新建空订阅。已有源填feeds:[{id,url,title,format:"rss"或"atom"或"unknown",fetchedAt:null,error:"尚未读取",entries:[]}]。实际取得快照时entries:[{id,title,url（http/https或null）,summary,publishedAt（原发布时间字符串或null）,updatedAt（原更新时间字符串或null）}]。最多10源/每源100条/整体32KB；不要生成示例新闻。宿主在用户点击添加或刷新时读取公开RSS/Atom，保留失败前数据；publishedAt缺失不能用抓取时间补充。';
export function rssUrl(value){try{if(typeof value!=='string'||value.length>2048||/[\u0000-\u0020\u007f]/.test(value))return null;const Url=typeof globalThis.URL==='function'?globalThis.URL:globalThis.window?.URL,u=new Url(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function rssDataIssue(s){
 const record=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k)),text=(v,n=256,empty=false)=>typeof v==='string'&&v.length<=n&&(empty||v.trim().length>0),stamp=v=>v===null||text(v,128),ids=new Set(),urls=new Set();
 if(!record(s,['version','type','title','asOf','feeds'])||s.version!==1||s.type!=='rss'||!text(s.title)||!text(s.asOf,2000)||!Array.isArray(s.feeds)||s.feeds.length>10)return 'RSS需version:1/type:rss/title/asOf/feeds（0–10源）';
 for(const f of s.feeds){
  if(!record(f,['id','url','title','format','fetchedAt','error','entries'])||!text(f.id,1024)||ids.has(f.id)||!rssUrl(f.url)||urls.has(rssUrl(f.url))||!text(f.title,512,true)||!['rss','atom','unknown'].includes(f.format)||!stamp(f.fetchedAt)||(f.error!==null&&!text(f.error,1000))||!Array.isArray(f.entries)||f.entries.length>100)return 'RSS源需唯一id/url、title、format、fetchedAt、error及完整entries，最多100条；过大请拆分订阅';
  ids.add(f.id);urls.add(rssUrl(f.url));const entries=new Set();
  for(const e of f.entries){if(!record(e,['id','title','url','summary','publishedAt','updatedAt'])||!text(e.id,2048)||entries.has(e.id)||!text(e.title,1024,true)||(e.url!==null&&!rssUrl(e.url))||!text(e.summary,12000,true)||!stamp(e.publishedAt)||!stamp(e.updatedAt))return 'RSS条目需唯一原id、title、url或null、完整summary、publishedAt/updatedAt或null';entries.add(e.id);}
 }
 return new TextEncoder().encode(JSON.stringify(s)).length<=32000?null:'RSS完整来源超过32KB，请拆分订阅，已有内容保留';
}
export function rssTemplateSchema(type){if(type==='rss')return RSS_WORKBENCH_GUIDANCE;}
export function validRssState(s){return Boolean(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).length===3&&['content','manage'].includes(s.tab)&&typeof s.query==='string'&&s.query.length<=256&&typeof s.feed==='string'&&s.feed.length<=1024);}
export function rssReduce(state,action){if(!validRssState(state)||!action||typeof action!=='object'||Array.isArray(action)||Object.keys(action).length!==2||!['tab','query','feed'].includes(action.key))return state;const next={...state,[action.key]:action.value};return validRssState(next)?next:state;}
