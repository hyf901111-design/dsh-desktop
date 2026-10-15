// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest'
import {gatherNoteComponentSnapshots,noteSnapshotBlockIds,exportNoteWithSnapshots} from '../src/preload/notes/component-snapshots'
import {freezeNoteSnapshotElement,restoreNoteSnapshotFrameNames} from '../src/shared/note-component-snapshot'
import {captureNoteComponentSnapshots} from '../src/main/notes/component-snapshot'

const electron=vi.hoisted(()=>({created:[] as any[],png:Buffer.from('89504e470d0a1a0a0000000d4948445200000320000002580806000000','hex')}))
vi.mock('electron',()=>({BrowserWindow:class{
 options:any;loadedHtml='';loadedPath='';loadFile=vi.fn(async(path:string)=>{this.loadedPath=path;this.loadedHtml=await(await import('node:fs/promises')).readFile(path,'utf8')});webContents={executeJavaScript:vi.fn(async()=>true),session:{webRequest:{onBeforeRequest:vi.fn()}},setWindowOpenHandler:vi.fn(),on:vi.fn(),capturePage:vi.fn(async()=>({isEmpty:()=>false,toPNG:()=>electron.png}))};destroy=vi.fn();loadURL=vi.fn(async()=>{});isDestroyed=()=>false;setContentSize=vi.fn()
 constructor(options:any){this.options=options;electron.created.push(this)}
}}))
afterEach(()=>{document.body.replaceChildren();electron.created.splice(0);vi.restoreAllMocks()})
const rect=(width=800,height=600)=>({x:0,y:4000,left:0,top:4000,right:width,bottom:4000+height,width,height,toJSON(){}} as DOMRect)
function rendered(html='<table><tbody><tr><td>净值 1.23</td></tr></tbody></table>'){
 const root=document.createElement('section');root.className='en-research';root.innerHTML=html;root.getBoundingClientRect=()=>rect();document.body.append(root);return root
}
it('collects every persisted research and attachment including nested blocks in document order',()=>{
 expect(noteSnapshotBlockIds({blocks:[{id:'p',type:'paragraph',children:[{id:'chart',type:'research'}]},{id:'file',type:'attachment'},{id:'tail',type:'research'}]} as any)).toEqual(['chart','file','tail'])
})
it('requests current rendered snapshots without forwarding document payload, URLs or frame IDs',async()=>{
 const request=vi.fn(async()=>[{blockId:'r',dataUrl:'data:image/png;base64,AA==',width:800,height:600}]);const content={blocks:[{id:'r',type:'research',props:{payload:'private live state'}}]} as any
 expect(await gatherNoteComponentSnapshots(content,{request} as any,'session')).toHaveLength(1)
 expect(request).toHaveBeenCalledWith('component-snapshots',{sessionId:'session',blockIds:['r']})
})
it('freezes visible canvas, inline SVG, inputs and scroll without editing the live component',async()=>{
 const root=rendered('<button class="en-component-scroll-guard">选中</button><button class="en-component-resize">拖动</button><svg viewBox="0 0 40 20"><path d="M0 1L40 18" stroke="red"/></svg><input value="旧值"><canvas width="400" height="200"></canvas><script>steal()</script><div id="scroll"><p>当前第二页</p></div>');root.style.cssText='outline:2px solid blue;box-shadow:0 0 8px blue'
 const canvas=root.querySelector('canvas')!;canvas.toDataURL=()=> 'data:image/png;base64,Y2FudmFz';root.querySelector('input')!.value='当前值'
 const scroller=root.querySelector<HTMLElement>('#scroll')!;scroller.scrollTop=160;const before=root.outerHTML
 const frozen=await freezeNoteSnapshotElement(root,'capture-one')
 expect(frozen.html).toContain('data:image/png;base64,Y2FudmFz');expect(frozen.html).toContain('<svg');expect(frozen.html).toContain('当前值');expect(frozen.html).toContain('translate(0px, -160px)')
 expect(frozen.html).not.toContain('steal()');expect(frozen.html).not.toContain('en-component-resize');expect(frozen.html).not.toContain('en-component-scroll-guard');expect(frozen.html).not.toContain('2px solid blue')
 expect(root.outerHTML).toBe(before);expect(scroller.scrollTop).toBe(160);expect(frozen.width).toBe(800);expect(frozen.height).toBe(600)
})
it('names sandbox subframes for trusted main-frame lookup and restores names after capture',async()=>{
 const root=rendered('<iframe name="original" sandbox="allow-scripts" srcdoc="<h1>实时图表</h1>"></iframe>');const frame=root.querySelector('iframe')!
 const frozen=await freezeNoteSnapshotElement(root,'capture-frame');expect(frozen.frames).toEqual([{name:'capture-frame-0',width:300,height:150}]);expect(frozen.html).toContain('<!--note-snapshot:capture-frame-0-->');expect(frozen.html).not.toContain('srcdoc=')
 expect(frame.name).toBe('capture-frame-0');restoreNoteSnapshotFrameNames(document,'capture-frame');expect(frame.name).toBe('original')
})
it('refuses unloaded images and unmounted native previews instead of claiming a blank snapshot',async()=>{
 await expect(freezeNoteSnapshotElement(rendered('<img src="blob:missing">'),'image')).rejects.toThrow('图片尚未载入')
 await expect(freezeNoteSnapshotElement(rendered('<div class="en-native-component-host"></div>'),'native')).rejects.toThrow('预览尚未就绪')
})
it('rasterizes only passive offline clones and returns authoritative PNG pixels',async()=>{
 const executeJavaScript=vi.fn(async(code:string)=>code.includes('restoreNoteSnapshotFrameNames')?undefined:[{blockId:'r',html:'<section>当前净值</section>',width:400,height:300,frames:[]}]);const window:any={isDestroyed:()=>false,webContents:{mainFrame:{executeJavaScript,framesInSubtree:[]}}}
 expect(await captureNoteComponentSnapshots(window,{sessionId:'session',blockIds:['r']},()=>true)).toEqual([{blockId:'r',dataUrl:'data:image/png;base64,'+electron.png.toString('base64'),width:800,height:600}])
 const hidden=electron.created[0];expect(hidden.options.show).toBe(false);expect(hidden.options.webPreferences).toMatchObject({javascript:true,nodeIntegration:false,contextIsolation:true,sandbox:true});expect(hidden.options.webPreferences.partition).not.toContain('persist:')
 expect(hidden.loadedHtml).toContain("default-src 'none'");expect(hidden.loadedHtml).toContain("script-src 'none'");expect(hidden.webContents.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('document.fonts.ready'));expect(hidden.webContents.executeJavaScript.mock.invocationCallOrder[0]).toBeLessThan(hidden.webContents.capturePage.mock.invocationCallOrder[0]);expect(hidden.destroy).toHaveBeenCalledOnce()
})
it('fails closed on changed sessions, invalid IDs and concurrent capture without creating blank images',async()=>{
 const window:any={isDestroyed:()=>false,webContents:{mainFrame:{executeJavaScript:vi.fn()}}}
 await expect(captureNoteComponentSnapshots(window,{sessionId:'s',blockIds:['x']},()=>false)).rejects.toThrow('账号或会话已变化')
 await expect(captureNoteComponentSnapshots(window,{sessionId:'s',blockIds:['x','x']},()=>true)).rejects.toThrow('组件列表')
 expect(electron.created).toHaveLength(0)
})

it('skips component capture for Markdown and refuses mismatched text after asynchronous capture',async()=>{
 let content:any={title:'当前',yjs:'',blocks:[{id:'r',type:'research'}]};const request=vi.fn(async(method:string)=>{if(method==='component-snapshots'){content={...content,title:'已修改'};return [{blockId:'r',dataUrl:'data:image/png;base64,AA==',width:1,height:1}]}return {status:'saved'}})
 await exportNoteWithSnapshots({snapshot:()=>content,bridge:{request} as any,sessionId:'session',format:'md',current:()=>true})
 expect(request.mock.calls.map(call=>call[0])).toEqual(['export']);request.mockClear()
 await expect(exportNoteWithSnapshots({snapshot:()=>content,bridge:{request} as any,sessionId:'session',format:'pdf',current:()=>true})).rejects.toThrow('笔记内容已变化')
 expect(request.mock.calls.map(call=>call[0])).toEqual(['component-snapshots'])
})
it('does not open export after the note editor was disposed during capture',async()=>{
 let mounted=true;const content:any={title:'当前',yjs:'',blocks:[{id:'r',type:'research'}]},request=vi.fn(async()=>{mounted=false;return [{blockId:'r'}]})
 await expect(exportNoteWithSnapshots({snapshot:()=>content,bridge:{request} as any,sessionId:'session',format:'docx',current:()=>mounted})).rejects.toThrow('笔记会话已变化')
 expect(request).toHaveBeenCalledOnce()
})
it('refuses a current PDF page whose render has not completed and a paused PPT shell',async()=>{
 await expect(freezeNoteSnapshotElement(rendered('<canvas data-research-pdf-preview width="400" height="600"></canvas>'),'pdf')).rejects.toThrow('PDF 当前页尚未绘制')
 await expect(freezeNoteSnapshotElement(rendered('<div data-slide-index="0"><div style="width:800px;height:450px"></div></div>'),'ppt')).rejects.toThrow('PPT 当前页预览已暂停')
})
it('normalizes document-local SVG paint references without following external URLs',async()=>{
 const root=rendered('<svg><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="40" height="20" style="fill:url(\"'+document.URL+'#paint\")"/></svg>')
 root.querySelector('rect')!.style.setProperty('fill','url("'+document.URL+'#paint")')
 const frozen=await freezeNoteSnapshotElement(root,'svg');expect(frozen.html).toContain('#paint');expect(frozen.html).not.toContain(document.URL+'#paint')
})
it('freezes a current video frame and static audio controls without active media resources',async()=>{
 const root=rendered('<video controls src="blob:video"></video><audio style="display:block" controls src="blob:audio"></audio>'),video=root.querySelector('video')!,audio=root.querySelector('audio')!
 Object.defineProperties(video,{readyState:{value:2},videoWidth:{value:640},videoHeight:{value:360}});Object.defineProperties(audio,{currentTime:{value:35},duration:{value:120}})
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as any);vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,dmlkZW8=')
 const frozen=await freezeNoteSnapshotElement(root,'media');expect(frozen.html).toContain('data:image/png;base64,dmlkZW8=');expect(frozen.html).toContain('0:35');expect(frozen.html).toContain('2:00');expect(frozen.html).not.toContain('blob:');expect(frozen.html).not.toContain('<audio');expect(frozen.html).not.toContain('<video')
})
it('maps sandbox subframes through the trusted parent nonce handshake instead of dynamic frame.name',async()=>{
 let childFreezes=0
 const child:any={name:'unchanged-original-name',frames:[],executeJavaScript:vi.fn(async(code:string)=>{
  if(code.includes('installSnapshotIdentity'))return true
  if(code.startsWith('(async()=>'))return 'frame-name'
  if(code.includes('restoreNoteSnapshotFrameNames'))return undefined
  childFreezes++;return {html:'<div>当前子页图表</div>',width:300,height:150,frames:[]}
 })}
 const root:any={frames:[child],executeJavaScript:vi.fn(async(code:string)=>{
  if(code.includes('freezeRoots'))return [{blockId:'r',html:'<section><!--note-snapshot:frame-name--></section>',width:800,height:600,frames:[{name:'frame-name',width:300,height:150}]}]
  return undefined
 })}
 const window:any={isDestroyed:()=>false,webContents:{mainFrame:root}}
 await captureNoteComponentSnapshots(window,{sessionId:'session',blockIds:['r']},()=>true)
 expect(childFreezes).toBe(1);expect(electron.created[0].loadedHtml).toContain('当前子页图表')
})
it('freezes text-only code and textarea viewport offsets without scrolling or rewriting their live values',async()=>{
 const root=rendered('<pre>第一行\n当前代码行</pre><textarea>旧稿</textarea>'),pre=root.querySelector('pre')!,area=root.querySelector('textarea')!
 pre.scrollTop=80;pre.scrollLeft=20;area.value='当前输入内容';area.scrollTop=40
 const frozen=await freezeNoteSnapshotElement(root,'text-scroll')
 expect(frozen.html).toContain('translate(-20px, -80px)');expect(frozen.html).toContain('translate(0px, -40px)');expect(frozen.html).toContain('当前输入内容');expect(frozen.html).not.toContain('<TEXTAREA')
 expect(pre.scrollTop).toBe(80);expect(area.value).toBe('当前输入内容');expect(area.scrollTop).toBe(40)
})
it('freezes iframe body layout as a normal div so the HTML parser preserves flex and background',async()=>{
 const frameDoc=document.implementation.createHTMLDocument('frame');frameDoc.body.style.cssText='display:flex;background:rgb(12, 34, 56);padding:24px';frameDoc.body.innerHTML='<div>左列</div><div>右列</div>';frameDoc.body.getBoundingClientRect=()=>rect(800,600)
 Object.defineProperty(frameDoc,'defaultView',{value:window})
 const frozen=await freezeNoteSnapshotElement(frameDoc.body,'body',{width:800,height:600})
 expect(frozen.html.toLowerCase()).not.toContain('<body');expect(frozen.html).toContain('display: flex');expect(frozen.html).toContain('rgb(12, 34, 56)');expect(frozen.html).toContain('左列');expect(frozen.html).toContain('右列')
})
it('reuses its dedicated ephemeral partition and detaches request listeners after every export',async()=>{
 const root:any={frames:[],executeJavaScript:vi.fn(async(code:string)=>code.includes('freezeRoots')?[{blockId:'r',html:'<section>当前</section>',width:400,height:300,frames:[]}]:undefined)},window:any={isDestroyed:()=>false,webContents:{mainFrame:root}}
 await captureNoteComponentSnapshots(window,{sessionId:'s',blockIds:['r']},()=>true);await captureNoteComponentSnapshots(window,{sessionId:'s',blockIds:['r']},()=>true)
 expect(electron.created[0].options.webPreferences.partition).toBe(electron.created[1].options.webPreferences.partition)
 expect(electron.created[0].webContents.session.webRequest.onBeforeRequest).toHaveBeenLastCalledWith(null)
})
it('cancels a late preview preparation before it can change iframe markers and always releases its lease',async()=>{
 const root=rendered('<iframe name="kept" srcdoc="<p>子页</p>"></iframe>');let resolve!:(lease:{release():void})=>void,cancelled=false;const release=vi.fn()
 ;(root as any).__sherlockPrepareNoteSnapshot=()=>new Promise(done=>{resolve=done})
 const frozen=(freezeNoteSnapshotElement as any)(root,'cancelled',undefined,()=>cancelled);cancelled=true;resolve({release})
 await expect(frozen).rejects.toThrow('快照已取消');expect(root.querySelector('iframe')!.name).toBe('kept');expect(release).toHaveBeenCalledOnce()
})

it('clips an iframe document scrolled at window level to viewport coordinates without losing visible content',async()=>{
 const frameDoc=document.implementation.createHTMLDocument('scrolling frame');frameDoc.body.innerHTML='<p id="old">已滚走内容</p><p id="visible">当前可见内容</p>';frameDoc.body.getBoundingClientRect=()=>({...rect(800,1000),top:-300,bottom:700,y:-300});Object.defineProperty(frameDoc,'defaultView',{value:window})
 frameDoc.querySelector('#old')!.getBoundingClientRect=()=>({...rect(800,100),top:-300,bottom:-200,y:-300});frameDoc.querySelector('#visible')!.getBoundingClientRect=()=>({...rect(800,100),top:0,bottom:100,y:0});vi.spyOn(window,'scrollY','get').mockReturnValue(300)
 const frozen=await freezeNoteSnapshotElement(frameDoc.body,'window-scroll',{width:800,height:200})
 expect(frozen.html).toContain('当前可见内容');expect(frozen.html).not.toContain('已滚走内容')
})
