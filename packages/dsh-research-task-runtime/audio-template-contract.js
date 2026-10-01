export const AUDIO_GUIDANCE='音频使用 panel.type=audio，首次提交 artifact:{version:1,type:"audio",title,url,description?,source?,date?,durationSeconds?,waveform?,transcript?,chapters?}。仅使用本人明确提供的无凭据HTTP/HTTPS音频原网址；未提供时url:null显示添加音频空态。时长单位秒，waveform仅为实际取得的0至1振幅数组，chapters:[{title,startSeconds}]，转写完整保留。未知时长、波形和转写不编造；不合成音频或HTML、不启动逐卡模型、不自动播放。采用source模式。'
export const AUDIO_TEMPLATES=Object.freeze([{id:'audio',type:'audio',title:'音频播放',figma:'1918:353063',width:656,height:264,minWidth:280,minHeight:180,version:'21z-audio-20261002',interactions:['添加音频原网址','播放和暂停','进度和音量','倍速','完整转写','章节定位','加载失败重试','会话恢复']}])
// Serialized verbatim into the trusted client, never into a generated HTML sandbox.
export function parseAudioSpec(value){
 if(!value||Array.isArray(value)||value.version!==1||value.type!=='audio'||typeof value.title!=='string'||!value.title.trim()||value.title.length>256)return null
 const required=['version','type','title','url'],optional=['description','source','date','durationSeconds','waveform','transcript','chapters']
 if(!required.every(k=>Object.hasOwn(value,k))||Object.keys(value).some(k=>!required.includes(k)&&!optional.includes(k)))return null
 if(value.url!==null){
  if(typeof value.url!=='string'||value.url.length>8192||value.url!==value.url.trim()||/[\u0000-\u0020\u007f]/.test(value.url)||!/^https?:\/\//i.test(value.url))return null
  try{const Url=globalThis.URL??globalThis.window?.URL,url=new Url(value.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!url.hostname)return null}catch{return null}
 }
 for(const [key,limit] of [['description',2048],['source',1024],['date',128],['transcript',64000]])if(value[key]!==undefined&&(typeof value[key]!=='string'||!value[key].trim()||value[key].length>limit))return null
 if(value.durationSeconds!==undefined&&(!Number.isFinite(value.durationSeconds)||value.durationSeconds<0||value.durationSeconds>604800))return null
 if(value.waveform!==undefined&&(!Array.isArray(value.waveform)||!value.waveform.length||value.waveform.length>2048||value.waveform.some(n=>!Number.isFinite(n)||n<0||n>1)))return null
 if(value.chapters!==undefined&&(!Array.isArray(value.chapters)||value.chapters.length>256||value.chapters.some(c=>!c||Array.isArray(c)||Object.keys(c).length!==2||typeof c.title!=='string'||!c.title.trim()||c.title.length>256||!Number.isFinite(c.startSeconds)||c.startSeconds<0||c.startSeconds>604800)))return null
 return Object.freeze({...value,...(value.waveform?{waveform:Object.freeze([...value.waveform])}:{}),...(value.chapters?{chapters:Object.freeze(value.chapters.map(c=>Object.freeze({...c})))}:{})})
}
