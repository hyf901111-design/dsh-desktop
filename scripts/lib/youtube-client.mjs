import {parseYoutubeSpec,youtubeVideo,youtubeSignInUrl} from '../../packages/dsh-research-task-runtime/youtube-template-contract.js'
const css=`
.ew-youtube-preset{--youtube-control:#e9ebef;position:relative;width:100%;height:100%;min-width:0;min-height:0;color:var(--grid-text,#252a33);font-size:12px;line-height:16px;overflow:auto;scrollbar-color:var(--grid-muted,#666) transparent;scrollbar-width:thin;}
body[data-ds-dark-theme] .ew-youtube-preset{--youtube-control:#25242a;}
body [data-ework-grid][data-workbench-style=dark] .ew-youtube-preset{--youtube-control:#25242a;}
body [data-ework-grid][data-workbench-style=light] .ew-youtube-preset,body [data-ework-grid][data-workbench-style=enterprise] .ew-youtube-preset{--youtube-control:#e9ebef;}
.ew-youtube-empty{display:flex;min-height:100%;flex-direction:column;align-items:stretch;justify-content:safe center;gap:15px;padding:12px 10px;box-sizing:border-box;}
.ew-youtube-empty>*{flex-shrink:0;}
.ew-youtube-empty strong{font-size:14px;line-height:16px;}
.ew-youtube-preset input,.ew-youtube-preset button{font:inherit;box-sizing:border-box;}
.ew-youtube-preset input{width:100%;min-width:0;height:34px;border:1px solid var(--grid-border,#ced2da);border-radius:4px;padding:8px 10px;background:var(--grid-control,#f7f7f9);color:inherit;}
body [data-ework-grid] .ew-youtube-preset input{background:var(--grid-control,#f7f7f9)!important;color:var(--grid-text,#252a33)!important;}
.ew-youtube-preset button{min-height:30px;border:0;border-radius:4px;padding:7px 14px;background:var(--youtube-control);color:inherit;cursor:pointer;}
body [data-ework-grid] .ew-youtube-preset button{background:var(--youtube-control)!important;color:var(--grid-text,#252a33)!important;}
.ew-youtube-confirm{width:80px;height:30px;}
.ew-youtube-preset button:disabled{opacity:.5;cursor:default;}
.ew-youtube-preset input:focus,.ew-youtube-preset button:focus-visible,.ew-youtube-preset summary:focus-visible{outline:2px solid #168fff;outline-offset:-2px;}
.ew-youtube-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.ew-youtube-loaded{display:flex;flex-direction:column;gap:10px;padding:0 10px 12px;min-width:0;box-sizing:border-box;}
.ew-youtube-loaded iframe{display:block;flex:none;width:100%;height:auto;aspect-ratio:16/9;min-height:200px;border:0;background:#111;}
.ew-youtube-loading{display:grid;place-items:center;min-height:200px;aspect-ratio:16/9;background:var(--grid-control,#f7f7f9);color:var(--grid-muted,#666);}
.ew-youtube-loaded p,.ew-youtube-loaded pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;}
.ew-youtube-loaded details{color:var(--grid-muted,#666);overflow-wrap:anywhere;}
.ew-youtube-loaded details[open]>div{padding-top:8px;display:flex;flex-direction:column;gap:10px;}
.ew-youtube-loaded img{max-width:100%;height:auto;object-fit:contain;}
.ew-youtube-error{overflow-wrap:anywhere;color:var(--grid-text,#252a33);}
body [data-ework-grid] .rScV5Q_containerContent:has(.ew-youtube-preset){padding:0!important;overflow:hidden!important;}
body [data-ework-grid] .odyssey-component-content:has(.ew-youtube-preset),body [data-ework-grid] .odyssey-component-primary:has(.ew-youtube-preset){height:100%;min-height:0;min-width:0;overflow:hidden;}
`
export function ResearchYoutubePreset({node,sessionId}){
 const spec=node.containerSpec,ref=react.useRef(null),inputRef=react.useRef(null)
 const [editing,setEditing]=react.useState(false),[error,setError]=react.useState(''),[reload,setReload]=react.useState(0)
 const [frame,setFrame]=react.useState(null)
 react.useSyncExternalStore(sherlockBoardsAdapter?.subscribe??(()=>()=>{}),sherlockBoardsAdapter?.version??(()=>0))
 const readOnly=sherlockShared(sessionId)&&sherlockBoardsAdapter?.getView(sessionId)?.permissions.edit!==true
 react.useLayoutEffect(()=>{const host=ref.current;if(!host)return;host.__eworkEditYoutube=()=>{if(!readOnly){setEditing(true);setError('')}};host.__eworkReloadYoutube=()=>{if(!spec.url)throw Error('请先添加视频网址');setReload(n=>n+1);setError('')};return()=>{delete host.__eworkEditYoutube;delete host.__eworkReloadYoutube}},[readOnly,spec.url])
 const submit=e=>{
  e.preventDefault();e.stopPropagation();if(readOnly)return
  const url=inputRef.current.value.trim(),next=researchYoutubeSpec({...spec,url:url||null})
  if(!next){setError('请输入不含账号密码的完整YouTube视频网址。');return}
  try{if(!researchYoutubeSinks.get(sessionId)?.(node.id,spec.url,next)){setError('视频网址尚未保存，请重试。');return}setEditing(false);setError('')}catch(error){setError(error?.message??'视频网址尚未保存，请重试。')}
 }
 const video=spec.url?youtubeVideo(spec.url):null,children=[]
 const src=video?'https://www.youtube.com/embed/'+video.id+'?autoplay=0&controls=1&playsinline=1'+(video.startSeconds?'&start='+video.startSeconds:''):null
 react.useEffect(()=>{
  if(!src){setFrame(null);return}
  const bridge=window.dshDesktop?.researchLinkFrame,identity={sessionId,nodeId:node.id}
  if(typeof bridge?.authorize!=='function'){setFrame({src,reload,name:''});return}
  let active=true;setFrame(null)
  const unavailable=()=>{if(active){setFrame(null);setError('视频载入授权失败，请重试或打开原视频。')}}
  Promise.resolve().then(()=>bridge.authorize({...identity,url:src})).then(result=>{
   if(!active)return
   if(result?.url!==src||typeof result?.frameName!=='string'||!/^sherlock-research-link-[a-f0-9]{32}$/i.test(result.frameName)){unavailable();return}
   setFrame({src,reload,name:result.frameName})
  }).catch(unavailable)
  return()=>{active=false;Promise.resolve(bridge.release?.(identity)).catch(()=>{})}
 },[sessionId,node.id,src,reload])
 if(!video||editing)children.push(react_jsx_runtime.jsxs('form',{className:'ew-youtube-empty',onSubmit:submit,onPointerDown:e=>e.stopPropagation(),children:[
  react_jsx_runtime.jsx('strong',{children:'YouTube 视频网址'}),
  react_jsx_runtime.jsx('input',{ref:inputRef,type:'url','aria-label':'YouTube视频网址',defaultValue:spec.url??'',placeholder:'输入 YouTube 视频网址',disabled:readOnly,autoFocus:editing,onKeyDown:e=>{e.stopPropagation();if(e.key==='Enter'&&!e.nativeEvent?.isComposing&&e.keyCode!==229)submit(e)}}),
  error&&react_jsx_runtime.jsx('div',{role:'alert',className:'ew-youtube-error',children:error}),
  react_jsx_runtime.jsxs('div',{className:'ew-youtube-actions',children:[react_jsx_runtime.jsx('button',{type:'submit',className:'ew-youtube-confirm',disabled:readOnly,children:'确认'}),editing&&react_jsx_runtime.jsx('button',{type:'button',onClick:()=>{setEditing(false);setError('')},children:'取消'})]})
 ]}))
 else{
  children.push(react_jsx_runtime.jsxs('div',{className:'ew-youtube-loaded',children:[
   frame?.src===src&&frame.reload===reload?react_jsx_runtime.jsx('iframe',{'data-youtube-player':'',name:frame.name,title:spec.title+'（YouTube 官方播放器）',src,sandbox:'allow-scripts allow-same-origin allow-presentation',allow:'encrypted-media; picture-in-picture; fullscreen',allowFullScreen:true,referrerPolicy:'strict-origin-when-cross-origin',loading:'lazy',onError:()=>setError('视频未能载入，请重试或打开原视频。')},String(reload)+spec.url):react_jsx_runtime.jsx('div',{className:'ew-youtube-loading',role:'status',children:error?'视频尚未载入':'正在安全载入视频…'}),
   error&&react_jsx_runtime.jsx('p',{role:'alert',className:'ew-youtube-error',children:error}),
   react_jsx_runtime.jsxs('div',{className:'ew-youtube-actions',onPointerDown:e=>e.stopPropagation(),children:[react_jsx_runtime.jsx('button',{type:'button',onClick:()=>{setReload(n=>n+1);setError('')},children:'重试载入'}),react_jsx_runtime.jsx('button',{type:'button',onClick:()=>window.open(spec.url,'_blank','noopener,noreferrer'),children:'在浏览器观看'}),react_jsx_runtime.jsx('button',{type:'button',onClick:()=>window.open(youtubeSignInUrl(spec.url),'_blank','noopener,noreferrer'),children:'在浏览器登录'}),spec.durationSeconds!==undefined&&react_jsx_runtime.jsx('span',{children:'已提供时长：'+spec.durationSeconds+' 秒'})]}),
   react_jsx_runtime.jsx('p',{className:'ew-youtube-login-hint',children:'浏览器登录状态不会同步到组件；需要账号验证的视频请在浏览器观看。'}),
   (spec.description||spec.subtitles||spec.thumbnailUrl)&&react_jsx_runtime.jsxs('details',{children:[react_jsx_runtime.jsx('summary',{children:'已提供说明与字幕'}),react_jsx_runtime.jsxs('div',{children:[spec.description&&react_jsx_runtime.jsx('p',{children:spec.description}),spec.subtitles&&react_jsx_runtime.jsx('pre',{children:spec.subtitles}),spec.thumbnailUrl&&react_jsx_runtime.jsx('img',{src:spec.thumbnailUrl,alt:'已提供的视频封面',loading:'lazy',referrerPolicy:'no-referrer'})]})]})
  ]}))
 }
 children.push(react_jsx_runtime.jsx('style',{children:RESEARCH_YOUTUBE_CSS}))
 return react_jsx_runtime.jsxs('div',{ref,className:'ew-youtube-preset','data-research-youtube-preset':'',children})
}
export function patchYoutubeClient(source){
 const start='/* ODYSSEY_YOUTUBE_PRESET_V1 */',end='/* ODYSSEY_YOUTUBE_PRESET_END */'
 const definitions=`${start}\nconst researchYoutubeSinks=new Map(),RESEARCH_YOUTUBE_CSS=${JSON.stringify(css)};\nconst youtubeVideo=${youtubeVideo.toString()};\nconst youtubeSignInUrl=${youtubeSignInUrl.toString()};\nconst researchYoutubeSpec=${parseYoutubeSpec.toString()};\n${ResearchYoutubePreset.toString()}\n${end}`
 if(source.includes(start)){const a=source.indexOf(start),b=source.indexOf(end,a);if(b<0)throw Error('YouTube definitions boundary missing');source=source.slice(0,a)+definitions+source.slice(b+end.length)}
 else{const anchor='function createResearchWorkspaceSession(storage, sessionId) {';if(source.split(anchor).length!==2)throw Error('YouTube definitions host missing');source=source.replace(anchor,definitions+'\n'+anchor)}
 const once=(a,b)=>{if(source.includes(b))return;if(source.split(a).length!==2)throw Error('YouTube anchor missing or ambiguous: '+a.slice(0,90));source=source.replace(a,b)}
 const types=/const RESEARCH_CONTAINER_TYPES = (?:\/\* @__PURE__ \*\/ )?new Set\(\[[^\]]+\]/
 const match=source.match(types);if(!match)throw Error('YouTube native types anchor missing');if(!match[0].includes('"youtube"'))source=source.replace(types,s=>s.replace('new Set([','new Set(["youtube", '))
 if(!source.includes('if (value.type === "youtube") return researchYoutubeSpec(value);'))once('if (value.type === "web") {','if (value.type === "youtube") return researchYoutubeSpec(value);\n\t\t\tif (value.type === "web") {')
 once("if (spec === null || spec.type === 'web' || spec.type === 'iframe') return '';","if (spec === null || ['web','iframe','youtube'].includes(spec.type)) return '';")
 if(!source.includes('researchYoutubeSinks.set(sessionId,'))once('const htmlFitStates = new Map();',`researchYoutubeSinks.set(sessionId,(nodeId,expectedUrl,spec)=>{
  if(!collaborationCanWrite())return false;
  const node=snapshot.artifacts.find(n=>n.id===nodeId),next=researchYoutubeSpec(spec);
  if(node?.kind!=='generated-container'||node.containerSpec?.type!=='youtube'||node.containerSpec.url!==expectedUrl||!next)return false;
  return commitUpdate({artifacts:snapshot.artifacts.map(n=>n.id===nodeId?{...n,containerSpec:next,sourceText:undefined,sourceTitle:undefined,sourceUpdatedAt:undefined}:n)},true)!==false;
 });\nconst htmlFitStates = new Map();`)
 const body='function ResearchContainerBody({ node, sessionId, visible, onHtmlSize, preserveHeading = false }) {'
 const branch="if(node.containerSpec.type==='youtube')return react_jsx_runtime.jsx(ResearchYoutubePreset,{node,sessionId});"
 if(!source.includes(branch))once(body,body+'\n'+branch)
 return source
}
