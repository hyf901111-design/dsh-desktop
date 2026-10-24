import { noteUiText as t } from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import React,{useCallback,useEffect,useRef,useState} from 'react'
import type {NoteFileNode,NoteMediaKind,NoteMediaLease} from '../../shared/note-files'
import {useNoteComponentInteraction} from './component-interaction'
import {NoteComponentResizeHandles,useNoteComponentSize} from './component-size'
import {NoteMenuIcon} from './menu-icon'

const imageExtensions=new Set(['png','jpg','jpeg','gif','webp','bmp','ico','avif','svg'])
const audioExtensions=new Set(['mp3','wav','ogg','oga','m4a','aac','flac'])
const videoExtensions=new Set(['mp4','webm','mov','m4v','ogv'])
const documentExtensions=new Set(['pdf','docx','xlsx','pptx','html','htm','md','markdown','txt','csv','json','log'])
const extension=(node:NoteFileNode)=>node.name.toLowerCase().split('.').pop()||''
function mediaKind(node:NoteFileNode):NoteMediaKind|undefined{
 if(node.mediaKind)return node.mediaKind
 const mime=node.contentType?.split('/')[0]
 if(mime==='image'||mime==='audio'||mime==='video')return mime
 const ext=extension(node)
 return imageExtensions.has(ext)?'image':audioExtensions.has(ext)?'audio':videoExtensions.has(ext)?'video':undefined
}
/** Existing media also use natural document presentation; dragged documents retain their reader card. */
export function noteFilePresentation(node:NoteFileNode):'media'|'document'|'file'|'component'{
 if(mediaKind(node))return 'media'
 if(node.previewEligible===false)return 'file'
 // Existing slash-inserted PPTs keep their payload, but use the complete reader chrome.
 if(extension(node)==='pptx')return 'component'
 if(node.noteDisplay==='inline')return documentExtensions.has(extension(node))?'document':'file'
 return 'component'
}

function visible(element:HTMLElement|null){
 if(!element||document.visibilityState==='hidden')return false
 for(let current:HTMLElement|null=element;current;current=current.parentElement){const style=getComputedStyle(current);if(current.hidden||current.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden')return false}
 return true
}
type Playback={time:number;paused:boolean;rate:number;volume:number;muted:boolean}
const initialPlayback=():Playback=>({time:0,paused:true,rate:1,volume:1,muted:false})
function useNoteMedia(node:NoteFileNode,context:any,root:React.RefObject<HTMLElement>,enabled:boolean){
 const [lease,setLease]=useState<NoteMediaLease>(),[error,setError]=useState(''),[loading,setLoading]=useState(enabled),[attempt,setAttempt]=useState(0)
 const media=useRef<HTMLMediaElement|null>(null),playback=useRef<Playback>(initialPlayback()),failure=useRef<(message:string)=>void>(()=>{})
 const setMedia=useCallback((element:HTMLMediaElement|null)=>{
  if(!element&&media.current){media.current.pause();media.current.removeAttribute('src');media.current.load()}
  media.current=element
 },[])
 useEffect(()=>{
  let live=true,version=0,current:NoteMediaLease|undefined,timer:ReturnType<typeof setTimeout>|undefined,pending=false,failed=false
  setLease(undefined);setError('');setLoading(enabled);playback.current=initialPlayback()
  const input={sessionId:context.sessionId,nodeId:node.id,authorizationId:node.authorizationId}
  const release=(value?:NoteMediaLease)=>{if(value)void context.bridge.request('file-media',{...input,action:'release',releaseId:value.releaseId}).catch(()=>{})}
  const remember=(stayPaused=false)=>{const element=media.current;if(element){playback.current={time:Number.isFinite(element.currentTime)?element.currentTime:0,paused:stayPaused||element.paused,rate:element.playbackRate,volume:element.volume,muted:element.muted};element.pause()}else if(stayPaused)playback.current.paused=true}
  const clear=()=>{version++;pending=false;if(timer)clearTimeout(timer);timer=undefined;remember(true);release(current);current=undefined;if(live){setLease(undefined);setLoading(false)}}
  const fail=(message:string)=>{if(!live)return;failed=true;clear();setError(message||t("文件暂时无法读取。"))}
  failure.current=fail
  const acquire=async(renew=false)=>{
   if(!live||pending||failed||!enabled||!visible(root.current))return
   pending=true;const ticket=++version,previous=current
   if(!renew)setLoading(true)
   try{
    const value:NoteMediaLease=await context.bridge.request('file-media',{...input,action:renew?'renew':'acquire',...(renew&&previous?{releaseId:previous.releaseId}:{})})
    if(!value||!/^sherlock-preview:\/\/[^/]+\/$/.test(value.url)||!value.releaseId||!['image','audio','video'].includes(value.kind)||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now())throw Error(t("文件预览授权无效，请重试。"))
    if(!live||ticket!==version||!visible(root.current)){release(value);return}
    if(renew)remember()
    current=value;setLease(value);setLoading(false)
    const ttl=value.expiresAt-Date.now();timer=setTimeout(()=>void acquire(true),Math.max(100,ttl-Math.min(30000,Math.max(1000,ttl/3))))
   }catch(e){if(live&&ticket===version)fail((e as Error).message)}
   finally{if(ticket===version)pending=false}
  }
  const visibility=()=>{if(!visible(root.current)){clear();return}if(!current&&!pending&&!failed)void acquire()}
  const observer=new MutationObserver(visibility)
  for(let element=root.current;element;element=element.parentElement)observer.observe(element,{attributes:true,attributeFilter:['hidden','style','class','aria-hidden']})
  document.addEventListener('visibilitychange',visibility)
  const reset=()=>{failed=true;clear()};document.addEventListener('sherlock:notes-reset',reset)
  if(enabled&&!node.importStatus&&node.authorizationId)visibility();else setLoading(false)
  return()=>{live=false;clear();observer.disconnect();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('sherlock:notes-reset',reset);failure.current=()=>{}}
 },[context.bridge,context.sessionId,node.id,node.authorizationId,node.importStatus,enabled,attempt,root])
 const loaded=()=>{
  const element=media.current,state=playback.current;if(!element)return
  try{element.currentTime=state.time;element.playbackRate=state.rate;element.volume=state.volume;element.muted=state.muted}catch{}
  if(!state.paused&&visible(root.current))void element.play().catch(()=>{})
 }
 return {lease,error,loading,media,setMedia,loaded,retry:()=>setAttempt(value=>value+1),fail:()=>failure.current(t("文件无法播放或读取，请重试。"))}
}

export function InlineNoteFileBlock({block,node,context}:{block:any;node:NoteFileNode;context:any}){
 const interaction=useNoteComponentInteraction(),[revealError,setRevealError]=useState(''),[ready,setReady]=useState(false),[naturalHeight,setNaturalHeight]=useState(320)
 const kind=mediaKind(node),runtime=useNoteMedia(node,context,interaction.root,!!kind),size=useNoteComponentSize({block,node,editor:context.editor,root:interaction.root,naturalHeight})
 useEffect(()=>setReady(false),[runtime.lease?.url])
 const title=node.displayName||node.name,message=node.error||runtime.error||revealError
 const reveal=()=>void context.bridge.request('file-reveal',{sessionId:context.sessionId,nodeId:node.id,authorizationId:node.authorizationId}).catch((e:Error)=>setRevealError(e.message))
 const label=<div className="en-inline-file-label"><button type="button" className="en-inline-file-open" title={t("在访达中显示")} disabled={!node.authorizationId||!!node.importStatus} onClick={reveal}><NoteMenuIcon kind="file"/><span>{title}</span></button>{message?<span className="en-inline-file-status" role="alert">{t(message)}</span>:node.importStatus==='importing'||runtime.loading?<span className="en-inline-file-status" role="status">{node.importStatus==='importing'?t("正在导入…"):t("正在读取…")}</span>:null}{runtime.error?<button type="button" className="en-inline-file-retry" onClick={runtime.retry}>{t("重试")}</button>:null}</div>
 const value=runtime.lease,visual=!!value&&!message
 const height=(node.noteSize?.height||size.resizing)?size.height:undefined
 const metadata=()=>{runtime.loaded();setReady(true);const element=runtime.media.current;if(element instanceof HTMLVideoElement&&element.videoWidth)setNaturalHeight(Math.min(2400,size.width*element.videoHeight/element.videoWidth))}
 return <section ref={interaction.root as React.RefObject<HTMLElement>} className="en-research en-note-file en-inline-file" style={size.style} contentEditable={false} data-note-research-block={block.id} data-research-node-id={node.id} data-note-file={node.id} data-note-session={context.sessionId} data-selected={interaction.selected||undefined} data-resizing={size.resizing||undefined} onPointerDown={event=>{if(event.button===0)interaction.select(event.shiftKey||event.metaKey||event.ctrlKey)}}>
  <div className="en-inline-file-content" data-note-file={node.id} data-note-session={context.sessionId} data-note-file-rendered="true">
   {visual?<div className="en-inline-media" data-media-ready={ready} data-media-kind={value.kind}>
    {value.kind==='image'?<img src={value.url} crossOrigin="anonymous" alt={title} draggable={false} style={{height,objectFit:height?'contain':undefined}} onLoad={event=>{setReady(true);if(event.currentTarget.naturalWidth)setNaturalHeight(Math.min(2400,size.width*event.currentTarget.naturalHeight/event.currentTarget.naturalWidth))}} onError={runtime.fail}/>:value.kind==='video'?<video ref={runtime.setMedia} src={value.url} crossOrigin="anonymous" controls playsInline preload="metadata" aria-label={title} style={{height,objectFit:height?'contain':undefined}} onLoadedMetadata={metadata} onError={runtime.fail}/>:<audio ref={runtime.setMedia} src={value.url} crossOrigin="anonymous" controls preload="metadata" aria-label={title} onLoadedMetadata={metadata} onError={runtime.fail}/>}
    {!ready?<div className="en-inline-media-loading" role="status">{t("正在读取 ")}{title}…</div>:null}
   </div>:label}
  </div>
  {visual&&ready&&value.kind!=='audio'&&interaction.selected&&context.editor?.isEditable?<NoteComponentResizeHandles size={size}/>:null}
 </section>
}
