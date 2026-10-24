// @vitest-environment happy-dom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach,expect,it,vi} from 'vitest'
import {InlineNoteFileBlock,noteFilePresentation} from '../src/preload/notes/file-inline'
import * as ReactDOM from 'react-dom'
import {EWorkNoteFileView} from '../scripts/lib/notes-files.mjs'
import {createRequire} from 'node:module'
const {componentPptxModeHost,useComponentPptxMode}=createRequire(import.meta.url)('../scripts/lib/component-pptx-mode.mjs')
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
const dispose:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const fn of dispose.splice(0).reverse())await fn();document.body.replaceChildren();vi.useRealTimers();vi.restoreAllMocks()})
async function mount(node:any,request:any){
 const surface=document.createElement('div');surface.className='en-root';document.body.append(surface);Object.defineProperty(surface,'clientWidth',{value:800});const root=createRoot(surface),block={id:'block',props:{payload:JSON.stringify(node)}},editor={isEditable:true,getBlock:()=>block,updateBlock:vi.fn()},bridge={request};let mounted=true
 const close=async()=>{if(mounted){mounted=false;await act(async()=>root.unmount())}};dispose.push(close)
 await act(async()=>root.render(<InlineNoteFileBlock block={block} node={node} context={{bridge,editor,sessionId:'notes',dark:false}}/>))
 return {surface,editor,block,close}
}
const file=(name:string,extra:any={})=>({id:'note-file-one',name,authorizationId:'owned',source:'computer',...extra})
it('uses natural media for existing files, inline previews for slash documents and preserves dragged document cards',()=>{
 expect(noteFilePresentation(file('photo.png'))).toBe('media');expect(noteFilePresentation(file('track.mp3'))).toBe('media');expect(noteFilePresentation(file('movie.mp4'))).toBe('media')
 expect(noteFilePresentation(file('report.pdf',{noteDisplay:'inline'}))).toBe('document');expect(noteFilePresentation(file('report.pdf'))).toBe('component');expect(noteFilePresentation(file('archive.zip',{noteDisplay:'inline',previewEligible:false}))).toBe('file')
})
it('presents stored slash-inserted PPTX as a full component without rewriting its payload or other inline document types',()=>{
 const stored=file('original.PPTX',{noteDisplay:'inline',displayName:'重命名后无扩展名',path:'/work/original.PPTX',noteSize:{width:620,height:520}}),before=JSON.stringify(stored)
 expect(noteFilePresentation(stored)).toBe('component');expect(JSON.stringify(stored)).toBe(before)
 for(const name of ['report.pdf','report.docx','report.xlsx','report.md'])expect(noteFilePresentation(file(name,{noteDisplay:'inline'}))).toBe('document')
 expect(noteFilePresentation(file('original.pptx',{noteDisplay:'inline',previewEligible:false}))).toBe('file')
})
it('renders an owned image directly in the document and releases its memory-only URL on unmount',async()=>{
 const request=vi.fn(async(method:string,input:any)=>input.action==='release'?{ok:true}:{url:'sherlock-preview://image-one/',releaseId:'image-lease',expiresAt:Date.now()+300000,kind:'image'}),f=await mount(file('photo.png',{noteDisplay:'inline'}),request)
 expect(f.surface.querySelector('img')?.getAttribute('src')).toBe('sherlock-preview://image-one/');expect(f.surface.querySelector('img')?.crossOrigin).toBe('anonymous');expect(f.surface.querySelector('.en-file-header,.ew-grid-header,.en-component-close')).toBeNull();expect(f.surface.querySelector('[data-note-file="note-file-one"][data-note-session="notes"]')).toBeTruthy();expect(f.editor.updateBlock).not.toHaveBeenCalled();expect(f.block.props.payload).not.toContain('sherlock-preview')
 await f.close();expect(request).toHaveBeenCalledWith('file-media',expect.objectContaining({sessionId:'notes',nodeId:'note-file-one',action:'release',releaseId:'image-lease'}))
})
it('keeps native audio controls and playback position through URL renewal, then pauses and releases when hidden',async()=>{
 vi.useFakeTimers();let paused=false;const pause=vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{paused=true}),play=vi.spyOn(HTMLMediaElement.prototype,'play').mockImplementation(async()=>{paused=false});vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{})
 let leases=0;const request=vi.fn(async(_method:string,input:any)=>input.action==='release'?{ok:true}:{url:'sherlock-preview://audio-'+(++leases)+'/',releaseId:'audio-'+leases,expiresAt:Date.now()+3000,kind:'audio'}),f=await mount(file('track.mp3',{noteDisplay:'inline'}),request),audio=f.surface.querySelector('audio')!
 expect(audio.controls).toBe(true);Object.defineProperty(audio,'paused',{get:()=>paused,configurable:true});audio.currentTime=42;audio.playbackRate=1.5
 await act(async()=>vi.advanceTimersByTimeAsync(2200));expect(request.mock.calls.some(([,input]:any)=>input.action==='renew'&&input.releaseId==='audio-1')).toBe(true)
 audio.currentTime=0;paused=true;await act(async()=>audio.dispatchEvent(new Event('loadedmetadata')));expect(audio.currentTime).toBe(42);expect(audio.playbackRate).toBe(1.5);expect(play).toHaveBeenCalled()
 f.surface.hidden=true;await act(async()=>document.dispatchEvent(new Event('visibilitychange')));expect(pause).toHaveBeenCalled();expect(request).toHaveBeenCalledWith('file-media',expect.objectContaining({action:'release',releaseId:'audio-2'}))
})
it('uses a compact reveal label for unsupported files and offers retry after a visible media error',async()=>{
 const request=vi.fn(async(method:string)=>{if(method==='file-media')throw Error('音频无法读取');return {ok:true}}),f=await mount(file('archive.zip',{noteDisplay:'inline',previewEligible:false}),request)
 expect(f.surface.textContent).toContain('archive.zip');expect(f.surface.querySelector('.en-file-host')?.getAttribute('style')||'').not.toContain('520');await act(async()=>f.surface.querySelector('button')!.click());expect(request).toHaveBeenCalledWith('file-reveal',expect.objectContaining({nodeId:'note-file-one',authorizationId:'owned'}));await f.close()
 const audio=await mount(file('track.mp3',{noteDisplay:'inline'}),request);expect(audio.surface.querySelector('[role=alert]')?.textContent).toContain('音频无法读取');expect([...audio.surface.querySelectorAll('button')].some(button=>button.textContent==='重试')).toBe(true);expect(audio.surface.querySelector('audio')).toBeNull()
})
it('reuses the authorized document reader without workbench chrome and shrinks loading and error states',async()=>{
 const outer=document.createElement('section');outer.className='en-note-file en-inline-document';outer.innerHTML='<div id="header"></div><div class="en-file-host" style="height:520px"></div>';document.body.append(outer)
 const header=outer.firstElementChild as HTMLElement,host=outer.lastElementChild as HTMLElement,chrome=vi.fn(()=>React.createElement('header',{className:'workbench-chrome'},'Workbench'))
 let setState:(value:string)=>void=()=>{}
 const Reader=(props:any)=>{const [state,set]=React.useState('loading');setState=set;expect(props).toMatchObject({nodeId:'doc',sessionId:'bound',visible:true,noteDocument:true});return React.createElement('div',{...(state==='loading'?{'data-research-preview-loading':''}:state==='failed'?{'data-research-preview-unavailable':'',role:'alert'}:{'data-research-preview-interactive':''})},state)}
 const View=new Function('react','react_dom','ResearchAttachmentLocalPreview','WorkbenchChrome','WorkbenchIcon',componentPptxModeHost.toString()+'\n'+useComponentPptxMode.toString()+'\nreturn ('+EWorkNoteFileView.toString()+')')(React,ReactDOM,Reader,chrome,()=>null),root=createRoot(document.createElement('div')),entry={instanceId:'doc-view',inline:true,host,header,sessionId:'notes',node:{id:'doc',name:'report.pdf',authorizationId:'grant',previewSessionId:'bound'}}
 dispose.push(async()=>act(async()=>root.unmount()))
 await act(async()=>root.render(React.createElement(View,{entry})))
 expect(chrome).not.toHaveBeenCalled();expect(header.textContent).toContain('report.pdf');expect(host.dataset.noteInlineState).toBe('loading')
 await act(async()=>setState('ready'));expect(host.dataset.noteInlineState).toBe('ready')
 await act(async()=>setState('failed'));expect(host.dataset.noteInlineState).toBe('failed');expect(header.textContent).toContain('重试')
})
it('pauses the actual media element on unmount and releases a lease that arrives after unmount',async()=>{
 const pause=vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{})
 const request=vi.fn(async(_method:string,input:any)=>input.action==='release'?{ok:true}:{url:'sherlock-preview://video/',releaseId:'video',expiresAt:Date.now()+300000,kind:'video'}),f=await mount(file('clip.mp4'),request),video=f.surface.querySelector('video')!
 await f.close();expect(pause.mock.contexts).toContain(video);expect(video.hasAttribute('src')).toBe(false)
 let resolve:(value:any)=>void=()=>{};const pending=new Promise(done=>{resolve=done}),late=vi.fn((_method:string,input:any)=>input.action==='release'?Promise.resolve({ok:true}):pending),g=await mount(file('photo.png'),late)
 await g.close();await act(async()=>resolve({url:'sherlock-preview://late/',releaseId:'late',expiresAt:Date.now()+300000,kind:'image'}));expect(late).toHaveBeenCalledWith('file-media',expect.objectContaining({action:'release',releaseId:'late'}))
})
it('adds a media reference when Command-clicking alongside an existing reference',async()=>{
 const f=await mount(file('image.png'),vi.fn(async()=>({url:'sherlock-preview://image/',releaseId:'image',expiresAt:Date.now()+300000,kind:'image'}))),events:any[]=[]
 f.surface.dataset.noteSourceSession='notes';f.surface.dataset.id='block';f.surface.classList.add('bn-block-outer')
 const receive=(event:Event)=>events.push((event as CustomEvent).detail);document.addEventListener('sherlock:notes-reference-component',receive)
 try{await act(async()=>{document.dispatchEvent(new CustomEvent('sherlock:notes-reference-state',{detail:{sessionId:'notes',references:[{blockId:'other'}]}}));f.surface.querySelector('img')!.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true,metaKey:true}))});expect(events.at(-1)).toMatchObject({sessionId:'notes',blockId:'block',append:true})}finally{document.removeEventListener('sherlock:notes-reference-component',receive)}
})
