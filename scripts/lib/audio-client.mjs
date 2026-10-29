import {parseAudioSpec} from '../../packages/dsh-research-task-runtime/audio-template-contract.js'
export const AUDIO_CSS=`
@layer ework-workbench{body [data-research-canvas][data-ework-grid] [data-research-node-id] :is([data-research-preview-body],[data-research-artifact-content],.rScV5Q_generatedContainer,.rScV5Q_containerContent):has([data-research-audio-preset]){padding:0!important}}
.ew-audio-preset{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;min-width:0;min-height:0;padding:12px 16px 16px;color:var(--grid-text);font:400 12px/18px var(--sherlock-font-sans);overflow-wrap:anywhere}
.ew-audio-preset strong{font-size:16px;line-height:24px;font-weight:700;color:inherit}
body [data-ework-grid] .ew-audio-preset{color:var(--grid-text)!important;font-size:12px!important;line-height:18px!important}
body [data-ework-grid] .ew-audio-preset strong{font-size:16px!important;line-height:24px!important;color:inherit!important}
.ew-audio-meta,.ew-audio-status,.ew-audio-chapters{font-size:11px;line-height:16.5px;color:var(--grid-muted)}
body [data-ework-grid] .ew-audio-preset :is(.ew-audio-meta,.ew-audio-status,.ew-audio-chapters){color:var(--grid-muted)!important}
.ew-audio-controls,.ew-audio-chapters,.ew-audio-form-actions{display:flex;align-items:center;flex-wrap:wrap;gap:12px;min-width:0}
.ew-audio-preset button,.ew-audio-preset select,.ew-audio-preset input{font:inherit;box-sizing:border-box;min-width:0}
body [data-ework-grid] .ew-audio-preset button,body [data-ework-grid] .ew-audio-preset select{min-height:28px;padding:5px 12px;border:1px solid transparent;border-radius:4px;background:var(--grid-menu)!important;color:var(--grid-text)!important;cursor:pointer}
body [data-ework-grid] .ew-audio-preset [data-audio-play]{background:var(--grid-accent,#00a6e9)!important;color:white!important}
.ew-audio-preset button:disabled{opacity:.5;cursor:default}
.ew-audio-preset :is(input,button,select):focus-visible{outline:2px solid #168fff;outline-offset:-2px}
.ew-audio-wave{display:flex;align-items:center;gap:3px;height:44px;overflow:hidden;min-width:0;position:relative}
.ew-audio-wave i{flex:1;max-width:5px;min-width:1px;border-radius:1px;background:var(--grid-border,#41414c)}
.ew-audio-wave i[data-played=true]{background:#5eb57f}
.ew-audio-wave input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.ew-audio-wave:focus-within{outline:2px solid #168fff;outline-offset:-2px}
.ew-audio-timeline{height:44px;display:flex;align-items:center;gap:12px;min-width:0}
.ew-audio-timeline input{flex:1;min-width:0;width:100%;accent-color:var(--grid-accent,#00a6e9)}
.ew-audio-controls label{display:flex;align-items:center;gap:6px;min-width:0}
.ew-audio-controls input[type=range]{width:72px;accent-color:var(--grid-accent,#00a6e9)}
.ew-audio-preset details{border-top:1px solid var(--grid-border,#ddd);padding-top:8px}
.ew-audio-preset summary{cursor:pointer;font:inherit;color:inherit}
.ew-audio-transcript{white-space:pre-wrap;font:inherit;color:inherit;margin:8px 0 0;overflow-wrap:anywhere}
.ew-audio-form{display:flex;flex-direction:column;gap:10px;min-width:0}
.ew-audio-form input{width:100%;padding:6px 8px;border:1px solid var(--grid-muted);border-radius:4px;background:var(--grid-card);color:inherit}
`
export function ResearchAudioPreset({node,sessionId,visible=true}){
 const spec=node.containerSpec,root=react.useRef(null),audio=react.useRef(null),input=react.useRef(null)
 const key=sessionId+':'+node.id+':'+spec.url,saved=researchAudioPlayback.get(key)||{position:0,rate:1,volume:1}
 const [position,setPosition]=react.useState(saved.position),[duration,setDuration]=react.useState(spec.durationSeconds??null),[rate,setRate]=react.useState(saved.rate),[volume,setVolume]=react.useState(saved.volume),[status,setStatus]=react.useState('等待加载'),[playing,setPlaying]=react.useState(false),[editing,setEditing]=react.useState(false),[error,setError]=react.useState('')
 react.useSyncExternalStore(sherlockBoardsAdapter?.subscribe??(()=>()=>{}),sherlockBoardsAdapter?.version??(()=>0))
 const readOnly=sherlockShared(sessionId)&&sherlockBoardsAdapter?.getView(sessionId)?.permissions.edit!==true
 const time=n=>n===null?'时长待读取':Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0')
 const remember=(p=position,r=rate,v=volume)=>{researchAudioPlayback.set(key,{position:p,rate:r,volume:v});if(researchAudioPlayback.size>512)researchAudioPlayback.delete(researchAudioPlayback.keys().next().value)}
 react.useEffect(()=>{setPosition(saved.position);setDuration(spec.durationSeconds??null);setRate(saved.rate);setVolume(saved.volume);setPlaying(false);setStatus('等待加载');setError('')},[key])
 react.useEffect(()=>{if(visible===false){audio.current?.pause();setPlaying(false)}},[visible])
 react.useEffect(()=>{const element=audio.current;return()=>element?.pause()},[key,editing])
 react.useLayoutEffect(()=>{const host=root.current;if(!host)return;host.__eworkEditAudio=()=>{if(!readOnly){audio.current?.pause();setEditing(true);setError('')}};host.__eworkReloadAudio=()=>{if(!audio.current)throw Error('请先添加音频网址');setStatus('正在重新加载音源');setPlaying(false);audio.current.load()};return()=>{delete host.__eworkEditAudio;delete host.__eworkReloadAudio}},[readOnly,editing])
 const seek=value=>{const element=audio.current;if(duration===null||duration<=0||!element)return;const p=Math.max(0,Math.min(duration,Number(value)));element.currentTime=p;setPosition(p);remember(p);if(element.paused&&!element.error&&p<duration){setPlaying(false);setStatus('已暂停')}}
 const toggle=async()=>{const element=audio.current;if(!element)return;if(!element.paused){element.pause();return}setStatus('正在加载');try{await element.play()}catch{if(audio.current===element){setPlaying(false);setStatus('播放失败，请检查音源或重试。')}}}
 const metadata=()=>{const element=audio.current;if(!element)return;const d=Number.isFinite(element.duration)&&element.duration>=0?element.duration:null;setDuration(d);if(d!==null)element.currentTime=Math.max(0,Math.min(d,saved.position));element.playbackRate=rate;element.volume=volume;setStatus('已暂停')}
 const submit=e=>{e.preventDefault();e.stopPropagation();if(readOnly)return;const url=input.current.value.trim()||null;const {durationSeconds,waveform,transcript,chapters,source,date,...base}=spec;const next=researchAudioSpec(url===spec.url?spec:{...base,url});if(!next){setError('请输入不含账号密码的完整 HTTP 或 HTTPS 音频网址。');return}if(!researchAudioSinks.get(sessionId)?.(node.id,spec.url,next)){setError('音频网址尚未保存，请重试。');return}setEditing(false);setError('')}
 const jsx=react_jsx_runtime.jsx,jsxs=react_jsx_runtime.jsxs,ready=spec.url&&!editing,controlsDisabled=duration===null||duration<=0
 return jsxs('div',{ref:root,className:'ew-audio-preset','data-research-audio-preset':'','data-research-preview-interactive':'',onPointerDown:e=>e.stopPropagation(),children:[
  jsx('style',{children:RESEARCH_AUDIO_CSS}),jsx('strong',{children:spec.title}),
  (spec.source||spec.date)&&jsx('div',{className:'ew-audio-meta',children:[spec.source,spec.date].filter(Boolean).join(' · ')}),
  ready?jsxs(react.Fragment,{children:[
   jsx('audio',{ref:audio,src:spec.url,preload:'metadata',onLoadedMetadata:metadata,onTimeUpdate:()=>{const p=audio.current.currentTime;setPosition(p);remember(p)},onPlaying:()=>{setPlaying(true);setStatus('正在播放')},onPause:()=>{setPlaying(false);setStatus('已暂停')},onWaiting:()=>setStatus('正在缓冲'),onStalled:()=>setStatus('等待音源响应'),onEnded:()=>{setPlaying(false);setStatus('播放结束')},onError:()=>{setPlaying(false);setStatus('音频加载失败，请重试。')}}),
   spec.waveform?jsxs('div',{className:'ew-audio-wave',children:[...spec.waveform.map((value,i)=>jsx('i',{'aria-hidden':true,'data-played':duration>0&&i/spec.waveform.length<position/duration,style:{height:Math.max(1,value*44)+'px'}},i)),jsx('input',{type:'range','aria-label':'音频进度',min:0,max:duration??0,step:.1,value:position,disabled:controlsDisabled,onInput:e=>seek(e.currentTarget.value)})]}):jsxs('div',{className:'ew-audio-timeline',children:[jsx('input',{type:'range','aria-label':'音频进度',min:0,max:duration??0,step:.1,value:position,disabled:controlsDisabled,onInput:e=>seek(e.currentTarget.value)}),jsx('span',{className:'ew-audio-meta',children:'波形未提供'})]}),
   jsxs('div',{className:'ew-audio-controls',children:[jsx('button',{type:'button','data-audio-play':'',onClick:toggle,children:playing?'暂停':'播放'}),jsx('span',{children:time(position)+' / '+time(duration)}),jsx('select',{'aria-label':'播放速度',value:rate,onChange:e=>{const r=Number(e.currentTarget.value);audio.current.playbackRate=r;setRate(r);remember(position,r)},children:[.5,1,1.25,1.5,2].map(r=>jsx('option',{value:r,children:r+'×'},r))}),jsxs('label',{children:['音量',jsx('input',{type:'range','aria-label':'音量',min:0,max:1,step:.05,value:volume,onInput:e=>{const v=Number(e.currentTarget.value);audio.current.volume=v;setVolume(v);remember(position,rate,v)}})]}),jsx('button',{type:'button',onClick:()=>{setStatus('正在重新加载音源');setPlaying(false);audio.current.load()},children:'重试'})]}),
   jsx('div',{className:'ew-audio-status',role:'status',children:status}),
   spec.chapters?.length>0&&jsx('div',{className:'ew-audio-chapters',children:spec.chapters.map((c,i)=>jsx('button',{type:'button',disabled:controlsDisabled||c.startSeconds>duration,onClick:()=>seek(c.startSeconds),children:time(c.startSeconds)+' '+c.title},i))}),
   spec.transcript?jsxs('details',{children:[jsx('summary',{children:'查看完整转写'}),jsx('p',{className:'ew-audio-transcript',children:spec.transcript})]}):jsx('div',{className:'ew-audio-meta',children:'转写未提供'}),
   spec.description&&jsx('p',{className:'ew-audio-transcript',children:spec.description})
  ]}):jsxs(react.Fragment,{children:[jsx('div',{children:editing?'添加或修改音频网址':'尚未添加音频。请提供音频原网址。'}),spec.description&&jsx('p',{className:'ew-audio-transcript',children:spec.description}),spec.transcript&&jsxs('details',{children:[jsx('summary',{children:'查看完整转写'}),jsx('p',{className:'ew-audio-transcript',children:spec.transcript})]}),editing?jsxs('form',{className:'ew-audio-form',onSubmit:submit,children:[jsx('input',{ref:input,type:'url','aria-label':'音频网址',defaultValue:spec.url??'',placeholder:'https://',autoFocus:true,disabled:readOnly,onKeyDown:e=>{e.stopPropagation();if(e.key==='Enter'&&!e.nativeEvent?.isComposing&&e.keyCode!==229)submit(e)}}),error&&jsx('div',{role:'alert',children:error}),jsxs('div',{className:'ew-audio-form-actions',children:[jsx('button',{type:'submit',disabled:readOnly,children:'保存音频'}),jsx('button',{type:'button',onClick:()=>{setEditing(false);setError('')},children:'取消'})]})]}):jsx('button',{type:'button',disabled:readOnly,onClick:()=>{setEditing(true);setError('')},children:'添加音频'})]})
 ]})
}
export function patchAudioClient(source){
 const start='/* ODYSSEY_AUDIO_PRESET_V1 */',end='/* ODYSSEY_AUDIO_PRESET_END */'
 const definitions=`${start}\nconst researchAudioSinks=new Map(),researchAudioPlayback=new Map(),RESEARCH_AUDIO_CSS=${JSON.stringify(AUDIO_CSS)};\nconst researchAudioSpec=${parseAudioSpec.toString()};\n${ResearchAudioPreset.toString()}\n${end}`
 if(source.includes(start)){const a=source.indexOf(start),b=source.indexOf(end,a);if(b<0)throw Error('Audio definitions boundary missing');source=source.slice(0,a)+definitions+source.slice(b+end.length)}
 else{const anchor='function createResearchWorkspaceSession(storage, sessionId) {';if(source.split(anchor).length!==2)throw Error('Audio host missing');source=source.replace(anchor,definitions+'\n'+anchor)}
 const once=(a,b)=>{if(source.includes(b))return;if(source.split(a).length!==2)throw Error('Audio anchor missing: '+a.slice(0,100));source=source.replace(a,b)}
 const types=/const RESEARCH_CONTAINER_TYPES = (?:\/\* @__PURE__ \*\/ )?new Set\(\[[^\]]+\]/;if(!source.match(types))throw Error('Audio native types missing');if(!source.match(types)[0].includes('"audio"'))source=source.replace(types,s=>s.replace('new Set([','new Set(["audio", '))
 if(!source.includes('if (value.type === "audio") return researchAudioSpec(value);'))once('if (value.type === "web") {','if (value.type === "audio") return researchAudioSpec(value);\n\t\t\tif (value.type === "web") {')
 if(!source.includes("if (spec.type === 'audio') return [spec.title"))once("if (spec.type === 'html') return researchHtmlText(spec.html) || spec.title;","if (spec.type === 'audio') return [spec.title,spec.source,spec.date,spec.description,spec.transcript||'未提供音频转写，不能仅凭网址概括音频内容。'].filter(Boolean).join('\\n');\n\t\t\tif (spec.type === 'html') return researchHtmlText(spec.html) || spec.title;")
 // Reconcile registrations before adding the canonical callback; earlier installs
 // interleaved this sink with the attachment registration at the same anchor.
 source=source.replace(/researchAudioSinks\.set\(sessionId,\(nodeId,expectedUrl,spec\)=>\{[\s\S]*?\n \}\);\n/g,'')
 once('const htmlFitStates = new Map();',`researchAudioSinks.set(sessionId,(nodeId,expectedUrl,spec)=>{
  if(!collaborationCanWrite())return false;
  const node=snapshot.artifacts.find(n=>n.id===nodeId),next=researchAudioSpec(spec);
  if(node?.kind!=='generated-container'||node.containerSpec?.type!=='audio'||node.containerSpec.url!==expectedUrl||!next)return false;
  return commitUpdate({artifacts:snapshot.artifacts.map(n=>n.id===nodeId?{...n,containerSpec:next}:n)},true)!==false;
 });\nconst htmlFitStates = new Map();`)
 const body='function ResearchContainerBody({ node, sessionId, visible, onHtmlSize, preserveHeading = false }) {'
 const branch="if(node.containerSpec.type==='audio')return react_jsx_runtime.jsx(ResearchAudioPreset,{node,sessionId,visible});"
 if(!source.includes(branch))once(body,body+'\n'+branch)
 return source
}
