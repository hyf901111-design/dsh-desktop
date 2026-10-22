import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {notesComposerSource,patchNotesComposer} from '../scripts/lib/notes-composer.mjs'
const repo=process.cwd(),require=createRequire(repo+'/package.json'),{build}=require('esbuild')
// Production serializes these helpers with native Node, not Vite's SSR-import rewrites.
const {patchNotesActivity}=require('./scripts/lib/notes-activity.mjs')
let browser,script,css
beforeAll(async()=>{
 const runtime=await readFile(repo+'/node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 const native=patchNotesActivity(patchNotesComposer(await readFile(repo+'/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))).replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell; exports.__InputBar=InputBar; exports.__NoteHistory=EWorkNotesActivity;')
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
createRoot(document.querySelector('#history')).render(<nativeExports.__NoteHistory sessionId='send-preview' t={key=>key} UserBubble={undefined} Progress={({entry})=><div data-native-note-progress>{entry.noteTask.status}</div>} Markdown={()=>null} Actions={null}/>);
`},bundle:true,platform:'browser',format:'iife',write:false,outfile:'fixture.js',conditions:['browser','import','style'],define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo'),loader:'tsx'}))}},{name:'svg',setup(b){b.onResolve({filter:/\.svg\?inline$/},a=>({path:require('node:path').resolve(a.resolveDir,a.path.slice(0,-7)),namespace:'svg'}));b.onLoad({filter:/.*/,namespace:'svg'},async a=>({contents:'export default '+JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(await readFile(a.path)).toString('base64')),loader:'js'}))}}]});

 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;css=output.outputFiles.find(f=>f.path.endsWith('.css')).text
 const playwright=await import(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');const {chromium}=playwright.default||playwright
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(async()=>{await browser?.close()})
async function fixture(dark=true){
 const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(3500);page.on('pageerror',error=>errors.push(error.message))
 await page.route('http://127.0.0.1/notes-native-send',route=>route.fulfill({contentType:'text/html',body:`<body ${dark?'data-ds-dark-theme':''}><section class="en-root" data-dark="${dark}" style="left:10px;right:340px"><div id="notes" class="en-editor-host"></div></section><aside id="history" style="position:fixed;right:10px;top:20px;width:320px;max-height:450px;overflow:auto"></aside><aside id="composer" data-ework-notes-composer-host style="position:fixed;right:10px;bottom:20px;width:320px"></aside></body>`}));await page.goto('http://127.0.0.1/notes-native-send');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor();await page.locator('#composer textarea').waitFor();return {context,page,errors,input:page.locator('#composer textarea')}
}
async function send(page,text='请帮我改写正文。'){await page.locator('#composer textarea').fill(text);await page.locator('#composer textarea').press('Enter');await page.locator('.en-ai-loading').waitFor()}
it('uses the concise note reference label and requested writing placeholder',async()=>{
 const {context,page,input}=await fixture();try{expect(await page.locator('[data-note-context-badge]').textContent()).toBe('参考当前笔记内容');expect(await input.getAttribute('placeholder')).toBe('撰写、补充或改写笔记...')}finally{await context.close()}
},15000)
it('keeps single and multiple quoted component labels inside their original native user bubbles',async()=>{
 const {context,page,errors}=await fixture();try{
  const nodes=[{id:'chart-a',title:'收入图',containerSpec:{version:1,type:'table',title:'收入图',columns:['项目','值'],rows:[['A',12]]}},{id:'chart-b',title:'利润表',containerSpec:{version:1,type:'table',title:'利润表',columns:['项目','值'],rows:[['B',34]]}}]
  await page.evaluate(nodes=>window.noteEditor.replaceBlocks(window.noteEditor.document,nodes.map((node,i)=>({id:'block-'+i,type:'research',props:{payload:JSON.stringify(node)}}))),nodes)
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-reference-component',{detail:{sessionId:'send-preview',blockId:'block-0'}})))
  await send(page,'总结所选组件');await page.locator('#history [data-note-message-reference="block-0"]').waitFor({timeout:2500})
  const row=page.locator('#history [data-note-task]').first();expect(await row.locator('[data-note-message-reference]').count()).toBe(1);expect(await row.textContent()).toContain('收入图')
  expect(await row.locator('[data-note-message-reference]').evaluate(el=>el.closest('[data-research-inline]')!==null)).toBe(true)
  await page.evaluate(()=>window.resolveGeneration({kind:'conversation',markdown:'完成'}));await page.locator('.en-ai-loading').waitFor({state:'hidden'})
  await page.evaluate(()=>{document.dispatchEvent(new CustomEvent('sherlock:notes-reference-component',{detail:{sessionId:'send-preview',blockId:'block-0'}}));document.dispatchEvent(new CustomEvent('sherlock:notes-reference-component',{detail:{sessionId:'send-preview',blockId:'block-1',append:true}}))})
  await send(page,'比较这两项');await expect.poll(()=>page.locator('#history [data-note-task]').nth(1).locator('[data-note-message-reference]').count()).toBe(2)
  await page.evaluate(()=>window.noteEditor.updateBlock('block-0',{props:{payload:JSON.stringify({id:'chart-a',title:'后来改名'})}}))
  expect(await row.locator('[data-note-message-reference]').textContent()).toContain('收入图');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
for(const dark of [false,true])it(`replays file and text quote labels inside the bubble with full tooltips (${dark?'dark':'light'})`,async()=>{
 const {context,page,errors}=await fixture(dark);try{
  const title='这是一段被选中的原始文字，'.repeat(25)+'结束标记'
  await page.evaluate(title=>document.dispatchEvent(new CustomEvent('sherlock:notes-history',{detail:{sessionId:'send-preview',rows:[{requestId:'replayed-refs',phase:'replied',prompt:'总结这些内容',startedAt:1,finishedAt:2,references:[{blockId:'file',title:'选区替换样式验收.pdf',type:'attachment'},{blockId:'text-selection',title,type:'text'}],result:{kind:'conversation',markdown:'总结'}},{requestId:'image-only-refs',phase:'replied',prompt:'',content:[{type:'image',attachment:{attachmentId:'image'}},{type:'text',text:''}],startedAt:3,finishedAt:4,references:[{blockId:'image-ref',type:'research',title:'图片对应的研究组件'}],result:{kind:'conversation',markdown:'已比较'}}]}})),title)
  const row=page.locator('#history [data-note-task="replayed-refs"]');await row.waitFor()
  expect(await row.locator('[data-note-message-reference]').count()).toBe(2)
  expect(await row.locator('[data-file-kind="pdf"]').textContent()).toBe('PDF')
  expect(await row.locator('[data-note-message-reference="text-selection"]').getAttribute('title')).toBe(title)
  expect(await row.textContent()).toContain('总结这些内容');expect(errors).toEqual([])
  expect(await page.locator('#history [data-note-task="image-only-refs"] [data-note-message-reference]').count()).toBe(1)
 }finally{await context.close()}
},15000)
for(const dark of [false,true])it(`shows note sources, toggles actual context and keeps selected text when focusing the native composer (${dark?'dark':'light'})`,async()=>{
 const {context,page,input,errors}=await fixture(dark);try{
  await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'body',type:'paragraph',content:'仅针对这段验收文字。'},{id:'chart',type:'research',props:{payload:JSON.stringify({id:'source',title:'收入表',containerSpec:{version:1,type:'table',title:'收入表',columns:['项目','收入'],rows:[['甲',123]]}})}}]))
  const badge=page.locator('[data-note-context-badge]');await expect.poll(()=>badge.textContent()).toContain('参考当前笔记内容')
  await badge.click();await page.getByRole('region',{name:'当前笔记参考内容'}).getByText('笔记全文',{exact:true}).waitFor();await page.getByRole('region',{name:'当前笔记参考内容'}).getByText('收入表',{exact:true}).waitFor()
  if(process.env.SHERLOCK_NOTES_QA_DIR)await page.screenshot({path:process.env.SHERLOCK_NOTES_QA_DIR+'/sources-'+(dark?'dark':'light')+'.png'})
  await page.getByRole('button',{name:'不参考当前笔记内容',exact:true}).click();await send(page,'解释一下');let request=await page.evaluate(()=>window.noteRequests.findLast(row=>row.method==='generate').input);expect(request.markdown).toBe('');expect(request.selection).toBe('');expect(request.context.scope).toBe('none');expect(request.context.components).toEqual([])
  await page.evaluate(()=>window.resolveGeneration({kind:'conversation',markdown:'不使用笔记的回复'}));await page.locator('.en-ai-loading').waitFor({state:'hidden'})
  await page.evaluate(()=>{const editor=window.noteEditor;editor.setTextCursorPosition('body','start');const pos=editor._tiptapEditor.state.selection.from;editor._tiptapEditor.commands.setTextSelection({from:pos,to:pos+7});editor.focus()})
  await page.locator('[data-note-reference-chip]').waitFor();await input.fill('精简这部分');expect(await page.locator('[data-note-reference-chip]').textContent()).toContain('仅针对这段验收')
  if(process.env.SHERLOCK_NOTES_QA_DIR)await page.screenshot({path:process.env.SHERLOCK_NOTES_QA_DIR+'/text-'+(dark?'dark':'light')+'.png'})
  await input.press('Enter');await page.locator('.en-ai-loading').waitFor();request=await page.evaluate(()=>window.noteRequests.findLast(row=>row.method==='generate').input);expect(request.selection).toBe('仅针对这段验收');expect(request.markdown).toBe('');expect(request.context.scope).toBe('selection');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('references a selected component in place of the full note and removes its chip explicitly',async()=>{
 const {context,page,input,errors}=await fixture();try{
  await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'body',type:'paragraph',content:'不该进入局部引用的正文'},{id:'chart',type:'research',props:{payload:JSON.stringify({id:'source',title:'收入表',containerSpec:{version:1,type:'table',title:'收入表',columns:['项目','收入'],rows:[['甲',123]]}})}}]))
  await page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click();await page.locator('[data-note-reference-chip]').waitFor();await input.fill('说明这份数据');expect(await page.locator('[data-note-reference-chip]').textContent()).toContain('收入表');await input.press('Enter');await page.locator('.en-ai-loading').waitFor();const request=await page.evaluate(()=>window.noteRequests.findLast(row=>row.method==='generate').input);expect(request.markdown).toBe('');expect(request.context.components[0]).toMatchObject({blockId:'chart',title:'收入表'});expect(request.context.components[0].content).toContain('123')
  await page.evaluate(()=>window.resolveGeneration({kind:'conversation',markdown:'甲收入为123'}));await page.locator('.en-ai-loading').waitFor({state:'hidden'});await page.getByRole('button',{name:'移除引用：收入表',exact:true}).click();await page.locator('[data-note-context-badge]').waitFor();expect(await page.locator('[data-note-reference-chip]').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('lists nested and off-screen components, keeps long chips within a narrow composer and drops deleted references',async()=>{
 const {context,page,errors}=await fixture();try{
  await page.setViewportSize({width:800,height:700});await page.evaluate(()=>{const nodes=Array.from({length:12},(_,i)=>({id:'chart-'+i,type:'research',props:{payload:JSON.stringify({id:'source-'+i,title:'嵌套组件'+i+'超长标题'.repeat(20),containerSpec:{version:1,type:'table',title:'数据',columns:['收入'],rows:[[i]]}})}}));window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'parent',type:'paragraph',content:'正文',children:nodes}])})
  const badge=page.locator('[data-note-context-badge]');await expect.poll(()=>badge.textContent()).toBe('参考当前笔记内容');await badge.click();expect(await page.locator('[data-note-context-directory] li').count()).toBe(13);expect(await page.locator('[data-note-context-directory] ul').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);await badge.click()
  await page.locator('[data-id="chart-0"] .en-research-header strong').click();await page.locator('[data-note-reference-chip]').waitFor();await page.locator('#composer textarea').focus();expect(await page.locator('[data-note-reference-chip]').evaluate(el=>el.getBoundingClientRect().right<=el.parentElement.getBoundingClientRect().right+1)).toBe(true)
  await page.evaluate(()=>window.noteEditor.removeBlocks(['chart-0']));await expect.poll(()=>page.locator('[data-note-reference-chip]').count()).toBe(0);await expect.poll(()=>badge.textContent()).toBe('参考当前笔记内容');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
for(const changed of [false,true])it(`updates only the referenced component and protects newer edits (${changed?'changed':'unchanged'})`,async()=>{
 const {context,page,input,errors}=await fixture();try{
  await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'body',type:'paragraph',content:'保留正文'},{id:'chart',type:'research',props:{payload:JSON.stringify({id:'note-component-source',title:'收入表',noteSize:{width:320},containerSpec:{version:1,type:'table',title:'收入表',columns:['收入'],rows:[[123]]}})}}]))
  await page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click();await send(page,'将收入改成456')
  if(changed)await page.evaluate(()=>{const editor=window.noteEditor,node=JSON.parse(editor.getBlock('chart').props.payload);editor.updateBlock('chart',{props:{payload:JSON.stringify({...node,title:'较新修改'})}})})
  await page.evaluate(()=>window.resolveGeneration({kind:'component',targetBlockId:'chart',node:{id:'new',title:'修改后收入表',containerSpec:{version:1,type:'table',title:'修改后收入表',columns:['收入'],rows:[[456]]}}}));await page.locator('.en-ai-loading').waitFor({state:'hidden'})
  const state=await page.evaluate(()=>({blocks:window.noteEditor.document,node:JSON.parse(window.noteEditor.getBlock('chart').props.payload)}));expect(state.blocks.filter(b=>b.type==='research')).toHaveLength(1);expect(state.node.title).toBe(changed?'较新修改':'修改后收入表');expect(state.node.id).toBe('note-component-source');expect(state.node.noteSize.width).toBe(320);if(changed)expect(await page.getByRole('alert').textContent()).toContain('组件已变化');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('replaces the displayed content of a component inserted from a conversation reply',async()=>{
 const {context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'reply',type:'research',props:{payload:JSON.stringify({id:'reply-source',kind:'assistant-result',noteReply:true,noteLibrary:true,excerpt:'旧会话回复',title:'会话回复'})}}]))
  // The native portalled renderer is tested separately; inspect its rendering discriminator here.
  await page.locator('[data-id="reply"] .en-research-header strong').click();await send(page,'将回复整理成表格');await page.evaluate(()=>window.resolveGeneration({kind:'component',targetBlockId:'reply',node:{id:'new',kind:'generated-container',title:'新回复表格',containerSpec:{version:1,type:'table',title:'新回复表格',columns:['项目'],rows:[['新内容']]}}}));await page.locator('.en-ai-loading').waitFor({state:'hidden'});const node=await page.evaluate(()=>JSON.parse(window.noteEditor.getBlock('reply').props.payload));expect(node.noteReply).toBeUndefined();expect(node.excerpt).toBeUndefined();expect(node.containerSpec.rows).toEqual([['新内容']]);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('does not carry a pinned text rewrite into a later component-only reference',async()=>{
 const {context,page,input,errors}=await fixture();try{
  await page.evaluate(()=>{const editor=window.noteEditor;editor.replaceBlocks(editor.document,[{id:'body',type:'paragraph',content:'不该泄漏的旧选区'},{id:'chart',type:'research',props:{payload:JSON.stringify({id:'source',title:'新选组件',containerSpec:{version:1,type:'table',title:'新选组件',columns:['收入'],rows:[[123]]}})}}]);editor.setTextCursorPosition('body','start');const from=editor._tiptapEditor.state.selection.from;editor.focus();editor._tiptapEditor.commands.setTextSelection({from,to:from+8})})
  await page.getByRole('button',{name:'AI 改写',exact:true}).click();await page.locator('[data-id="chart"] .en-research-header strong').click();await input.fill('解释这个组件');await input.press('Enter');await page.locator('.en-ai-loading').waitFor();const request=await page.evaluate(()=>window.noteRequests.findLast(row=>row.method==='generate').input);expect(request.selection).toBe('');expect(request.context.components.map(item=>item.blockId)).toEqual(['chart']);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
for(const outcome of ['stop','fail'])it(`leaves only the original component when regenerating a selected table is ${outcome}`,async()=>{
 const {context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'chart',type:'research',props:{payload:JSON.stringify({id:'source',title:'收入表',containerSpec:{version:1,type:'table',title:'收入表',columns:['收入'],rows:[[123]]}})}}]));await page.locator('[data-id="chart"] .en-research-header strong').click();await send(page,'重新生成选中的表格，收入改为456');expect(await page.evaluate(()=>window.noteEditor.document.filter(block=>block.type==='research').length)).toBe(1)
  if(outcome==='stop')await page.locator('.en-ai-loading').getByRole('button',{name:'停止',exact:true}).click();else await page.evaluate(()=>window.rejectGeneration('验证失败'))
  await page.locator('.en-ai-loading').waitFor({state:'hidden'});expect(await page.evaluate(()=>window.noteEditor.document.filter(block=>block.type==='research').length)).toBe(1);expect(await page.evaluate(()=>JSON.parse(window.noteEditor.getBlock('chart').props.payload).containerSpec.rows)).toEqual([[123]]);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
async function ready(page,markdown='改写后的正文。'){await page.evaluate(markdown=>window.resolveGeneration({kind:'text',markdown}),markdown);await page.locator('.en-preview').waitFor()}
async function handleGeometry(handle){await expect.poll(()=>handle.evaluate(el=>el.getBoundingClientRect().height)).toBe(20);return handle.evaluate(el=>{const rect=el.getBoundingClientRect(),panel=el.closest('.en-preview').getBoundingClientRect(),thumb=getComputedStyle(el,'::after');return {gap:panel.top-(rect.top+parseFloat(thumb.top)+parseFloat(thumb.height)),hitHeight:rect.height,hit:document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)===el,top:rect.top}})}

for(const dark of [false,true])it(`keeps the preview handle inside an offset clipped note workspace (${dark?'dark':'light'})`,async()=>{
 const {context,page,errors}=await fixture(dark);try{
  await page.setViewportSize({width:1100,height:700});await page.locator('.en-root').evaluate(el=>{el.style.top='160px';el.style.bottom='50px'})
  await send(page);await ready(page,Array.from({length:80},(_,i)=>'长篇建议第'+i+'段。').join('\n\n'))
  const panel=page.locator('.en-preview'),handle=panel.getByRole('separator',{name:'调整建议面板高度'});await handle.focus();await handle.press('End')
  const workspace=await page.locator('.en-main').boundingBox();await expect.poll(async()=>(await handleGeometry(handle)).top).toBeGreaterThanOrEqual(workspace.y+8)
  expect((await handleGeometry(handle)).hit).toBe(true);expect(await panel.locator('.en-preview-content').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
  const footer=await panel.locator('footer').boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(workspace.y+workspace.height-8)
  const initial=Number(await handle.getAttribute('aria-valuenow'));await handle.press('ArrowDown');expect(Number(await handle.getAttribute('aria-valuenow'))).toBeLessThan(initial)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('acknowledges immediately while real stages use the existing native progress region without a duplicate timer',async()=>{
 const {context,page,errors}=await fixture();try{
  await page.clock.install();await send(page,'优化本篇笔记')
  const feedback=page.locator('#history [data-note-feedback]');await feedback.waitFor();expect(await feedback.textContent()).toContain('已收到，正在处理这条笔记指令。')
  const id=await page.evaluate(()=>window.noteTasks.find(row=>row.phase==='preparing').requestId)
  for(const [stage,label]of [['model','正在连接当前模型'],['thinking','正在思考'],['writing','正在撰写内容'],['validating','正在检查生成内容']]){
   await page.evaluate(({id,stage})=>document.dispatchEvent(new CustomEvent('sherlock:notes-generation-progress',{detail:{sessionId:'send-preview',requestId:id,stage,reasoning:'PRIVATE-REASONING',outputChars:0}})),{id,stage})
   await expect.poll(()=>page.locator('[data-native-note-progress]').textContent()).toContain(label);expect(await feedback.textContent()).toBe('已收到，正在处理这条笔记指令。');expect(await feedback.count()).toBe(1);expect(await feedback.locator('.en-task-feedback-progress').count()).toBe(0)
  }
  await page.clock.runFor(2100);expect(await feedback.textContent()).toBe('已收到，正在处理这条笔记指令。')
  await ready(page,'建议正文');await expect.poll(()=>feedback.count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

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
  await send(page);await ready(page,'简短正文。');const panel=page.locator('.en-preview'),content=panel.locator('.en-preview-content'),handle=panel.getByRole('separator',{name:'调整建议面板高度'});expect(await handle.count()).toBe(1);const geometry=await handleGeometry(handle);expect(geometry.gap).toBeGreaterThanOrEqual(10);expect(geometry.gap).toBeLessThanOrEqual(12);expect(geometry.hitHeight).toBe(20);expect(geometry.hit).toBe(true);expect((await panel.boundingBox()).height).toBeLessThan(180);expect(await content.evaluate(el=>el.style.height)).toBe('');const initial=await content.evaluate(el=>el.clientHeight)
  await handle.focus();await handle.press('ArrowUp');expect(await content.evaluate(el=>el.clientHeight)).toBe(initial+32);const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-60,{steps:5});await page.mouse.up();expect(await content.evaluate(el=>el.clientHeight)).toBe(initial+92);expect(await handle.getAttribute('aria-valuenow')).toBe(String(initial+92));expect(await page.getByRole('button',{name:'添加至正文',exact:true}).count()).toBe(1);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('bounds long content and manual height after viewport resizing while keeping the footer visible',async()=>{
 const {context,page,errors}=await fixture();try{
  await send(page);await ready(page,Array.from({length:80},(_,i)=>'长篇建议第 '+i+' 段。').join('\n\n'));const panel=page.locator('.en-preview'),content=panel.locator('.en-preview-content'),handle=panel.getByRole('separator',{name:'调整建议面板高度'});expect(await content.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);await handle.focus();await handle.press('End');await page.setViewportSize({width:800,height:400});await expect.poll(async()=>(await panel.boundingBox()).y).toBeGreaterThanOrEqual(8);expect((await panel.boundingBox()).y+(await panel.boundingBox()).height).toBeLessThanOrEqual(392);const footer=await panel.locator('footer').boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(392);const geometry=await handleGeometry(handle);expect(geometry.gap).toBeGreaterThanOrEqual(10);expect(geometry.gap).toBeLessThanOrEqual(12);expect(geometry.top).toBeGreaterThanOrEqual(8);expect(geometry.hit).toBe(true);expect(Number(await handle.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(Number(await handle.getAttribute('aria-valuemax')));expect(errors).toEqual([])
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
  await page.evaluate(()=>{const editor=window.noteEditor;editor.replaceBlocks(editor.document,[{id:'selected-body',type:'paragraph',content:'前文待改写文字后文。'}]);let from=0;editor._tiptapEditor.state.doc.descendants((node,pos)=>{if(node.isText&&node.text.includes('待改写文字'))from=pos+node.text.indexOf('待改写文字')});editor._tiptapEditor.commands.setTextSelection({from,to:from+'待改写文字'.length})});await send(page,'改写选中内容');await page.locator('.en-inline-assistant .en-ai-loading').waitFor();await ready(page,'改写后的词句');const panel=page.locator('.en-inline-assistant .en-preview'),content=panel.locator('.en-preview-content'),handle=panel.getByRole('separator',{name:'调整建议面板高度'}),initial=await content.evaluate(el=>el.clientHeight);const geometry=await handleGeometry(handle);expect(geometry.gap).toBeGreaterThanOrEqual(10);expect(geometry.gap).toBeLessThanOrEqual(12);expect(geometry.hitHeight).toBe(20);expect(geometry.hit).toBe(true);const selection=await page.locator('.en-ai-selection').boundingBox();expect(geometry.top-(selection.y+selection.height)).toBeGreaterThanOrEqual(10);expect(await content.evaluate(el=>el.style.height)).toBe('');await handle.focus();await handle.press('ArrowUp');const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-40,{steps:4});await page.mouse.up();expect(await content.evaluate(el=>el.clientHeight)).toBe(initial+72);expect(await page.getByRole('button',{name:'添加至正文',exact:true}).count()).toBe(1);await page.getByRole('button',{name:'替换所选',exact:true}).click();expect(await page.locator('.en-document .bn-editor').textContent()).toContain('前文改写后的词句后文。');expect(await input.inputValue()).toBe('');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
