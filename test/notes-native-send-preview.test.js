import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {notesComposerSource,patchNotesComposer} from '../scripts/lib/notes-composer.mjs'
const repo=process.cwd(),require=createRequire(repo+'/package.json'),{build}=require('esbuild')
let browser,script,css
beforeAll(async()=>{
 const runtime=await readFile(repo+'/node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 const native=patchNotesComposer(await readFile(repo+'/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell; exports.__InputBar=InputBar;')
const output=await build({stdin:{resolveDir:repo,loader:'tsx',contents:`
import React from 'react';import * as jsxRuntime from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';
import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
window.react=React;window.react_jsx_runtime=jsxRuntime;window.react_dom=ReactDOM;
const factories=new Map();window.__ModuleLoader__={load:descriptor=>factories.set(descriptor.id,descriptor.factory)};
new Function(${JSON.stringify(runtime)})();new Function(${JSON.stringify(native)})();
class Service{constructor(ctx){this.ctx=ctx}};const emptyComponent=()=>null;const primitives=new Proxy({Tooltip:({children})=>children},{get:(target,key)=>target[key]||emptyComponent});const slots=new Proxy({SlotCore:class{}},{get:(target,key)=>target[key]||(()=>({}))});
const runtimeExports=factories.get('@deepseek-ai/dsh-client-runtime')(id=>id==='@deepseek-ai/cordis'?{Service}:slots);
const nativeExports=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?jsxRuntime:id==='react-dom'?ReactDOM:id.includes('dsh-client-runtime')?runtimeExports:id==='@deepseek-ai/cordis'?{Service}:id.includes('ui-slots')?slots:primitives);
const SessionInputShell=nativeExports.SessionInputShell,InputBar=nativeExports.__InputBar,react=React,react_jsx_runtime=jsxRuntime;
const ctx={effect:fn=>fn(),get:()=>undefined};
const conversationController=new nativeExports.ConversationController(ctx,{input:{},blocks:{}});window.releasedImages=[];const releaseImage=conversationController.releaseDraftImage.bind(conversationController);conversationController.releaseDraftImage=id=>{window.releasedImages.push(id);releaseImage(id)};const serializeImages=conversationController.serializeImages.bind(conversationController);conversationController.serializeImages=files=>window.deferImages?new Promise(resolve=>window.releaseImages=()=>serializeImages(files).then(resolve)):window.failImages?Promise.reject(Error('附件读取失败')):serializeImages(files);
window.addFixtureImage=name=>{const images=conversationController.createDraftImages([new File(['image'],name,{type:'image/png'})]);window.nativeShell.addImages(images.map(image=>image.id));return images[0].id};
${notesComposerSource}
const ordinary=new SessionInputShell({inputTriggers:()=>({track:()=>{},arbitrate:()=> 'pass',serializeReference:async(_source,ref)=>ref}),defaultSink:()=>{throw Error('ordinary chat was submitted')}});const record=eworkNotesInput('send-preview',ordinary,conversationController);window.nativeShell=record.shell;window.ordinaryShell=ordinary;
window.noteTasks=[];window.noteRequests=[];document.addEventListener('sherlock:notes-task-state',event=>window.noteTasks.push(event.detail));
const bridge={request:async(method,input)=>{window.noteRequests.push({method,input});if(method==='load')return {saved:{title:'原生发送回归',blocks:[],yjs:'',revision:0,updatedAt:0}};if(method==='save')return {status:'saved',saved:{...input.content,revision:input.revision+1}};if(method==='generate')return new Promise((resolve,reject)=>{window.resolveGeneration=resolve;window.rejectGeneration=message=>reject(Error(message))});if(method==='render')return {html:'<p>组件预览正文。</p>'};return {}},draft:async()=>{}};
window.notesRoot=createRoot(document.querySelector('#notes'));window.notesRoot.render(<NotesApp sessionId='send-preview' bridge={bridge} dark={document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>{}}/>);
function NativeComposer(){const props={sessionId:'send-preview',eworkNotes:true,keyboard:ordinary,inputActions:ordinary.actions,useInput:select=>select(React.useSyncExternalStore(ordinary.state.subscribe,ordinary.state.getSnapshot)),useNotices:select=>select(React.useSyncExternalStore(ordinary.notices.subscribe,ordinary.notices.getSnapshot)),useSession:select=>select({running:false,promptError:null,subagent:null,removed:false}),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(undefined),useProjection:()=>undefined,draftImages:ids=>conversationController.draftImages(ids),resolveSubmitMode:()=> 'queue',t:key=>key,renderSlot:()=>null,stop:()=>{},command:()=>{}};return <EWorkSharedInputBar {...props}/>};
createRoot(document.querySelector('#composer')).render(<NativeComposer/>);
`},bundle:true,platform:'browser',format:'iife',write:false,outfile:'fixture.js',conditions:['browser','import','style'],define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo'),loader:'tsx'}))}},{name:'svg',setup(b){b.onResolve({filter:/\.svg\?inline$/},a=>({path:require('node:path').resolve(a.resolveDir,a.path.slice(0,-7)),namespace:'svg'}));b.onLoad({filter:/.*/,namespace:'svg'},async a=>({contents:'export default '+JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(await readFile(a.path)).toString('base64')),loader:'js'}))}}]});

 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;css=output.outputFiles.find(f=>f.path.endsWith('.css')).text
 const playwright=await import(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');const {chromium}=playwright.default||playwright
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(async()=>{await browser?.close()})
async function fixture(dark=true){
 const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(3500);page.on('pageerror',error=>errors.push(error.message))
 await page.route('http://127.0.0.1/notes-native-send',route=>route.fulfill({contentType:'text/html',body:`<body ${dark?'data-ds-dark-theme':''}><section class="en-root" data-dark="${dark}" style="left:10px;right:340px"><div id="notes" class="en-editor-host"></div></section><aside id="composer" data-ework-notes-composer-host style="position:fixed;right:10px;bottom:20px;width:320px"></aside></body>`}));await page.goto('http://127.0.0.1/notes-native-send');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor();await page.locator('#composer textarea').waitFor();return {context,page,errors,input:page.locator('#composer textarea')}
}
async function send(page,text='请帮我改写正文。'){await page.locator('#composer textarea').fill(text);await page.locator('#composer textarea').press('Enter');await page.locator('.en-ai-loading').waitFor()}
async function ready(page,markdown='改写后的正文。'){await page.evaluate(markdown=>window.resolveGeneration({kind:'text',markdown}),markdown);await page.locator('.en-preview').waitFor()}

it('clears an admitted native draft while generating and keeps later typing through preview acceptance and regeneration',async()=>{
 const {context,page,input,errors}=await fixture();try{
  await send(page);expect(await input.inputValue()).toBe('');expect(await page.evaluate(()=>window.nativeShell.snapshot.draft)).toBe('')
  await input.fill('等待时新写的下一条。');await ready(page);expect(await input.inputValue()).toBe('等待时新写的下一条。')
  await page.getByRole('button',{name:'重新撰写',exact:true}).click();await page.locator('.en-ai-loading').waitFor();expect(await input.inputValue()).toBe('等待时新写的下一条。');await ready(page,'再次撰写的正文。')
  await page.getByRole('button',{name:'添加至正文',exact:true}).click();await page.locator('.en-document').getByText('再次撰写的正文。',{exact:true}).waitFor();expect(await input.inputValue()).toBe('等待时新写的下一条。');expect(await page.evaluate(()=>window.ordinaryShell.snapshot.draft)).toBe('');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('restores the exact native reference draft and attachments on failure, then clears a successful retry without undo resurrecting it',async()=>{
 const {context,page,input,errors}=await fixture();try{
  await input.fill('请参考 ');await page.evaluate(()=>{window.nativeShell.insertFilePaths(['/tmp/参考文件.txt']);window.nativeBefore=window.nativeShell.snapshot;window.sentImage=window.addFixtureImage('sent.png')});await input.press('Enter');await page.locator('.en-ai-loading').waitFor();expect(await input.inputValue()).toBe('')
  await page.evaluate(()=>window.rejectGeneration('生成失败'));await page.getByRole('alert').waitFor();const restored=await page.evaluate(()=>({draft:window.nativeShell.snapshot.draft,occurrences:window.nativeShell.snapshot.occurrences,before:window.nativeBefore,images:window.nativeShell.snapshot.imageIds,sent:window.sentImage,released:window.releasedImages}));expect(restored.draft).toBe(restored.before.draft);expect(restored.occurrences).toEqual(restored.before.occurrences);expect(restored.images).toEqual([restored.sent]);expect(restored.released).toEqual([])
  await input.press('Enter');await page.locator('.en-ai-loading').waitFor();expect(await input.inputValue()).toBe('');await ready(page);await input.focus();await input.press('ControlOrMeta+z');expect(await input.inputValue()).toBe('');expect(await page.evaluate(()=>window.nativeShell.snapshot.imageIds)).toEqual([]);expect(await page.evaluate(()=>window.releasedImages)).toEqual([restored.sent]);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('preserves a new draft and restores only admitted images ahead of later attachments when generation fails or is stopped',async()=>{
 const {context,page,input,errors}=await fixture();try{
  const sent=await page.evaluate(()=>window.addFixtureImage('sent.png'));await send(page);expect(await input.inputValue()).toBe('');await input.fill('新的请求');const later=await page.evaluate(()=>window.addFixtureImage('later.png'));await page.evaluate(()=>window.rejectGeneration('生成失败'));await page.getByRole('alert').waitFor();expect(await input.inputValue()).toBe('新的请求');expect(await page.evaluate(()=>window.nativeShell.snapshot.imageIds)).toEqual([sent,later]);expect(await page.evaluate(()=>window.releasedImages)).toEqual([])
  await input.press('Enter');await page.locator('.en-ai-loading').waitFor();expect(await input.inputValue()).toBe('');await page.locator('.en-ai-loading').getByRole('button',{name:'停止',exact:true}).click();expect(await input.inputValue()).toBe('新的请求');expect(await page.evaluate(()=>window.nativeShell.snapshot.imageIds)).toEqual([sent,later]);await page.evaluate(()=>window.resolveGeneration({kind:'text',markdown:'停止后的过时结果。'}));expect(await page.locator('.en-preview').count()).toBe(0);expect(await input.inputValue()).toBe('新的请求');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('does not clear a newer revision, even with the same text, while native image serialization is pending',async()=>{
 const {context,page,input,errors}=await fixture();try{
  await page.evaluate(()=>window.deferImages=true);await input.fill('原始请求');await input.press('Enter');await expect.poll(()=>page.evaluate(()=>typeof window.releaseImages)).toBe('function');await input.fill('修改过');await input.fill('原始请求');await page.evaluate(()=>window.releaseImages());await page.locator('.en-ai-loading').waitFor();expect(await input.inputValue()).toBe('原始请求');await ready(page);expect(await input.inputValue()).toBe('原始请求');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

for(const dark of [false,true])it(`keeps short full-note previews automatic until the top handle is dragged or adjusted with the keyboard (${dark?'dark':'light'})`,async()=>{
 const {context,page,errors}=await fixture(dark);try{
  await send(page);await ready(page,'简短正文。');const panel=page.locator('.en-preview'),content=panel.locator('.en-preview-content'),handle=panel.getByRole('separator',{name:'调整建议面板高度'});expect(await handle.count()).toBe(1);expect((await panel.boundingBox()).height).toBeLessThan(180);expect(await content.evaluate(el=>el.style.height)).toBe('');const initial=await content.evaluate(el=>el.clientHeight)
  await handle.focus();await handle.press('ArrowUp');expect(await content.evaluate(el=>el.clientHeight)).toBe(initial+32);const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-60,{steps:5});await page.mouse.up();expect(await content.evaluate(el=>el.clientHeight)).toBe(initial+92);expect(await handle.getAttribute('aria-valuenow')).toBe(String(initial+92));expect(await page.getByRole('button',{name:'添加至正文',exact:true}).count()).toBe(1);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('bounds long content and manual height after viewport resizing while keeping the footer visible',async()=>{
 const {context,page,errors}=await fixture();try{
  await send(page);await ready(page,Array.from({length:80},(_,i)=>'长篇建议第 '+i+' 段。').join('\n\n'));const panel=page.locator('.en-preview'),content=panel.locator('.en-preview-content'),handle=panel.getByRole('separator',{name:'调整建议面板高度'});expect(await content.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);await handle.focus();await handle.press('End');await page.setViewportSize({width:800,height:400});await expect.poll(async()=>(await panel.boundingBox()).y).toBeGreaterThanOrEqual(8);expect((await panel.boundingBox()).y+(await panel.boundingBox()).height).toBeLessThanOrEqual(392);const footer=await panel.locator('footer').boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(392);expect(Number(await handle.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(Number(await handle.getAttribute('aria-valuemax')));expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

for(const resultKind of ['conversation','component'])it(`settles admitted attachments when the native note request returns ${resultKind}`,async()=>{
 const {context,page,input,errors}=await fixture();try{
  const sent=await page.evaluate(()=>window.addFixtureImage('sent.png'));await send(page,resultKind==='component'?'创建一个图表组件':'请说明一下。');expect(await input.inputValue()).toBe('');await input.fill('之后的请求');await page.evaluate(kind=>window.resolveGeneration(kind==='conversation'?{kind,markdown:'说明回复。'}:{kind,node:{id:'generated-component',title:'生成的组件',generationStatus:'completed',containerSpec:{version:1,type:'html',html:'<p>真实组件内容。</p>'}}}),resultKind);await expect.poll(()=>page.evaluate(()=>window.noteTasks.at(-1).phase)).toBe(resultKind==='conversation'?'replied':'accepted');expect(await input.inputValue()).toBe('之后的请求');expect(await page.evaluate(()=>window.releasedImages)).toEqual([sent]);expect(await page.locator('.en-preview').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('keeps the native draft when attachment serialization fails or no mounted note acknowledges admission',async()=>{
 const {context,page,input,errors}=await fixture();try{
  const sent=await page.evaluate(()=>window.addFixtureImage('sent.png'));await input.fill('失败后可重试的需求');await page.evaluate(()=>window.failImages=true);await input.press('Enter');await expect.poll(()=>page.evaluate(()=>window.nativeShell.notices.getSnapshot()?.text)).toContain('附件读取失败');expect(await input.inputValue()).toBe('失败后可重试的需求');expect(await page.evaluate(()=>window.nativeShell.snapshot.imageIds)).toEqual([sent]);expect(await page.evaluate(()=>window.noteRequests.filter(row=>row.method==='generate').length)).toBe(0)
  await page.evaluate(()=>{window.failImages=false;window.notesRoot.unmount();document.dispatchEvent(new CustomEvent('sherlock:notes-composer-state',{detail:{sessionId:'send-preview',ready:true,running:false}}))});await input.press('Enter');await expect.poll(()=>page.evaluate(()=>window.nativeShell.notices.getSnapshot()?.text)).toContain('笔记还未就绪');expect(await input.inputValue()).toBe('失败后可重试的需求');expect(await page.evaluate(()=>window.nativeShell.snapshot.imageIds)).toEqual([sent]);expect(await page.evaluate(()=>window.releasedImages)).toEqual([]);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('releases pending admitted images during account reset instead of leaking hidden attachments',async()=>{
 const {context,page,errors}=await fixture();try{
  const sent=await page.evaluate(()=>window.addFixtureImage('sent.png'));await send(page);expect(await page.evaluate(()=>window.nativeShell.snapshot.imageIds)).toEqual([]);await page.evaluate(()=>{document.dispatchEvent(new CustomEvent('sherlock:notes-reset'));window.notesRoot.unmount()});expect(await page.evaluate(()=>window.releasedImages)).toEqual([sent]);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

for(const dark of [false,true])it(`resizes an actual inline text preview without losing the replacement selection (${dark?'dark':'light'})`,async()=>{
 const {context,page,input,errors}=await fixture(dark);try{
  await page.evaluate(()=>{const editor=window.noteEditor;editor.replaceBlocks(editor.document,[{id:'selected-body',type:'paragraph',content:'前文待改写文字后文。'}]);let from=0;editor._tiptapEditor.state.doc.descendants((node,pos)=>{if(node.isText&&node.text.includes('待改写文字'))from=pos+node.text.indexOf('待改写文字')});editor._tiptapEditor.commands.setTextSelection({from,to:from+'待改写文字'.length})});await send(page,'改写选中内容');await page.locator('.en-inline-assistant .en-ai-loading').waitFor();await ready(page,'改写后的词句');const panel=page.locator('.en-inline-assistant .en-preview'),content=panel.locator('.en-preview-content'),handle=panel.getByRole('separator',{name:'调整建议面板高度'}),initial=await content.evaluate(el=>el.clientHeight);expect(await content.evaluate(el=>el.style.height)).toBe('');await handle.focus();await handle.press('ArrowUp');const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-40,{steps:4});await page.mouse.up();expect(await content.evaluate(el=>el.clientHeight)).toBe(initial+72);expect(await page.getByRole('button',{name:'添加至正文',exact:true}).count()).toBe(1);await page.getByRole('button',{name:'替换所选',exact:true}).click();expect(await page.locator('.en-document .bn-editor').textContent()).toContain('前文改写后的词句后文。');expect(await input.inputValue()).toBe('');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
