export const YOUTUBE_GUIDANCE='YouTube视频使用 type=youtube，首次同时提交 artifact:{version:1,type:"youtube",title,url,description?,durationSeconds?,thumbnailUrl?,subtitles?}。url必须是用户提供的YouTube视频原网址；未提供时显式url:null，展示网址输入空态，不猜视频、不生成HTML或逐卡模型。可提供watch、youtu.be、shorts、embed或live网址，保留原网址及实际已取得的说明、时长、封面、字幕。时长为非负秒数，字幕为原文字符串，不补未知资料。采用官方播放器，不自动播放；重新载入不代表重新取数。'
export const YOUTUBE_TEMPLATES=Object.freeze([{id:'youtube',type:'youtube',title:'YouTube视频',figma:'1917:353092',width:485,height:340,minWidth:280,minHeight:180,version:'21z-youtube-20261001',interactions:['添加和修改视频网址','官方视频播放','原视频打开','加载重试','已提供字幕与说明','会话恢复']}])
export function youtubeVideo(value){
 if(typeof value!=='string'||value.length>8192||value!==value.trim()||/[\u0000-\u0020\u007f]/.test(value)||!/^https?:\/\//i.test(value))return null
 try{
  const Url=globalThis.URL??globalThis.window?.URL,url=new Url(value)
  if(url.username||url.password||url.port||!['http:','https:'].includes(url.protocol))return null
  let id
  if(url.hostname==='youtu.be')id=url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1]
  else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(url.hostname)){
   if(url.pathname==='/watch'&&url.searchParams.getAll('v').length===1)id=url.searchParams.get('v')
   else id=url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1]
  }
  if(!/^[A-Za-z0-9_-]{11}$/.test(id??''))return null
  const raw=url.searchParams.get('start')??url.searchParams.get('t'),time=raw?.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  const start=/^\d+$/.test(raw??'')?Number(raw):time&&time[0]?Number(time[1]??0)*3600+Number(time[2]??0)*60+Number(time[3]??0):0
  return {id,startSeconds:Number.isSafeInteger(start)&&start>0&&start<=864000?start:0}
 }catch{return null}
}
export function youtubeSignInUrl(value){
 const video=youtubeVideo(value);if(!video)return null
 const Url=globalThis.URL??globalThis.window?.URL,watch=new Url('https://www.youtube.com/watch')
 watch.searchParams.set('v',video.id)
 if(video.startSeconds)watch.searchParams.set('t',video.startSeconds+'s')
 const resume=new Url('https://www.youtube.com/signin')
 resume.searchParams.set('action_handle_signin','true');resume.searchParams.set('next',watch.pathname+watch.search)
 const login=new Url('https://accounts.google.com/AccountChooser')
 login.searchParams.set('service','youtube');login.searchParams.set('continue',resume.href)
 return login.href
}
export function parseYoutubeSpec(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||value.type!=='youtube'||typeof value.title!=='string'||!value.title.trim()||value.title.length>256)return null
 if(!['version','type','title','url'].every(k=>Object.hasOwn(value,k))||Object.keys(value).some(k=>!['version','type','title','url','description','durationSeconds','thumbnailUrl','subtitles'].includes(k)))return null
 if(value.url!==null&&!youtubeVideo(value.url))return null
 for(const key of ['description','subtitles'])if(value[key]!==undefined&&(typeof value[key]!=='string'||!value[key].trim()||value[key].length>(key==='subtitles'?32000:4096)))return null
 if(value.durationSeconds!==undefined&&(!Number.isFinite(value.durationSeconds)||value.durationSeconds<0||value.durationSeconds>864000))return null
 if(value.thumbnailUrl!==undefined){
  if(typeof value.thumbnailUrl!=='string'||value.thumbnailUrl.length>8192||value.thumbnailUrl!==value.thumbnailUrl.trim()||/[\u0000-\u0020\u007f]/.test(value.thumbnailUrl)||!/^https?:\/\//i.test(value.thumbnailUrl))return null
  try{const Url=globalThis.URL??globalThis.window?.URL,url=new Url(value.thumbnailUrl);if(url.username||url.password||!url.hostname)return null}catch{return null}
 }
 return Object.freeze({...value})
}
