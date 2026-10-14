import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {resolve} from 'node:path'
import {patchNotesActivity} from '../scripts/lib/notes-activity.mjs'
import {patchResearchGridWorkbench,restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
let browser,script,css
beforeAll(async()=>{
 const native=patchNotesActivity(patchResearchGridWorkbench(restoreResearchGridWorkbench(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')))).replace('exports.SessionInputShell = SessionInputShell;',`exports.SessionInputShell = SessionInputShell;exports.__NoteRow=EWorkNoteConversationRow;exports.__NoteViews=EWorkNoteComponentViews;exports.__CanvasAction=ResearchAssistantCanvasAction;`)
 const feedback=(await readFile('node_modules/@deepseek-ai/dsh-client-ui-message-feedback/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__Actions=MessageFeedbackActions;exports.__Controller=MessageFeedbackController;exports.__copy=zh;')
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import * as jsxRuntime from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';import {WorkspaceSurfaceHost} from './src/preload/workspace-surface-host';window.WorkspaceSurfaceHost=WorkspaceSurfaceHost;
 import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
 const factories=new Map();window.__ModuleLoader__={load:descriptor=>factories.set(descriptor.id,descriptor.factory)};new Function(${JSON.stringify(native)})();new Function(${JSON.stringify(feedback)})();
 class Service{};const noop=()=>null;const primitives=new Proxy({Tooltip:({children,label})=><span data-tooltip={label}>{children}</span>,writeClipboard:async text=>{window.copiedReply=text;return true},MarkdownText:({text})=><pre>{text}</pre>},{get:(value,key)=>value[key]||noop});
 const nativeExports=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?jsxRuntime:id==='react-dom'?ReactDOM:id==='@deepseek-ai/cordis'?{Service}:primitives);
 const feedbackExports=factories.get('@deepseek-ai/dsh-client-ui-message-feedback')(id=>id==='react'?React:id==='react/jsx-runtime'?jsxRuntime:primitives);
 window.noteRequests=[];window.noteSaved={title:'正文光标插入验收',blocks:[{id:'body',type:'paragraph',content:[{type:'text',text:'前半',styles:{bold:true}},{type:'text',text:'后半',styles:{italic:true}}]},{id:'tail',type:'paragraph',content:'末段保留'}],yjs:'',revision:0,updatedAt:0};
 const bridge={request:async(method,input)=>{window.noteRequests.push({method,input});if(method==='load')return {saved:window.noteSaved};if(method==='save'){window.noteSaved={...input.content,revision:input.revision+1};return {status:'saved',saved:window.noteSaved}}return {ok:true}},draft:async()=>{}};
 window.createNoteRoot=()=>{const root=createRoot(document.querySelector('#notes'));root.render(<NotesApp sessionId='actions-test' bridge={bridge} dark={document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>{}}/>);return root};window.notesRoot=window.createNoteRoot();
 const NoteViews=nativeExports.__NoteViews;createRoot(document.querySelector('#views')).render(<NoteViews sessionId='actions-test' active/>);
 window.row={requestId:'reply',phase:'ready',completedSeq:7,finishedAt:1000,result:{kind:'text',markdown:'# 回复标题\\n\\n**完整回复**，与当前光标有关。'}};window.forkCalls=[];window.canvasCalls=[];window.feedbackCalls=[];let item,version=0;
 const carried=value=>({ok:true,value:{ok:true,value}}),remote={list:async()=>carried({items:item?[item]:[]}),put:async input=>{window.feedbackCalls.push(input);item={...input,version:String(++version),createdAt:1000,updatedAt:1000+version};return carried(item)},delete:async input=>{window.feedbackCalls.push(input);item=undefined;return carried({})}};
 const controller=new feedbackExports.__Controller(remote,'actions-test');window.feedbackController=controller;
 const workspace={subscribeAssistantActions:()=>()=>{},assistantActionsActive:()=>true,visibleCenter:()=>({x:100,y:100}),addAssistantResult:value=>window.canvasCalls.push(value)};
 const translate=key=>({copy:'复制',copied:'已复制','message.branch':'新分支','message.branchUnavailable':'生成中暂不能新建分支'}[key]||key),feedbackCopy=key=>feedbackExports.__copy[key]||key;
 function Feedback({messageId}){return React.createElement(feedbackExports.__Actions,{messageId,ensure:()=>controller.ensure(),toggle:(...args)=>controller.toggle(...args),rate:(...args)=>controller.rate(...args),clearNote:(...args)=>controller.clearNote(...args),useFeedback:select=>select(React.useSyncExternalStore(controller.subscribe,controller.getSnapshot)),t:feedbackCopy})}
 const Row=nativeExports.__NoteRow,Action=nativeExports.__CanvasAction;window.renderReply=()=>window.replyRoot.render(<Row sessionId='actions-test' row={window.row} t={translate} UserBubble={()=>null} Progress={()=>null} Markdown={({blocks})=><div>{blocks.map(b=>b.text)}</div>} forkAt={seq=>window.forkCalls.push(seq)} renderSlot={(name,props)=><><Feedback messageId={props.messageId}/><Action {...props} sessionId='actions-test' workspace={workspace}/></>}/>);
 window.replyRoot=createRoot(document.querySelector('#reply'));window.renderReply();document.dispatchEvent(new CustomEvent('sherlock:notes-open',{detail:{sessionId:'actions-test'}}));
 `},bundle:true,platform:'browser',format:'iife',write:false,outfile:'fixture.js',conditions:['browser','import','style'],define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo'),loader:'tsx'}))}},{name:'svg',setup(b){b.onResolve({filter:/\.svg\?inline$/},a=>({path:resolve(a.resolveDir,a.path.slice(0,-7)),namespace:'svg'}));b.onLoad({filter:/.*/,namespace:'svg'},async a=>({contents:'export default '+JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(await readFile(a.path)).toString('base64')),loader:'js'}))}}]})
 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;css=output.outputFiles.find(f=>f.path.endsWith('.css')).text+'\n'+await readFile('scripts/lib/research-grid-workbench.css','utf8')
 const playwright=await import(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');browser=await (playwright.default||playwright).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>{await browser?.close()})
async function fixture(dark=true){
 const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('http://127.0.0.1/note-reply-fixture',route=>route.fulfill({contentType:'text/html',body:`<html lang="zh"><body ${dark?'data-ds-dark-theme':''}><section class="en-root" data-dark="${dark}" style="left:10px;right:340px"><div id="notes" class="en-editor-host"></div></section><div id="views"></div><aside id="reply" style="position:fixed;right:10px;top:100px;width:310px;height:680px;overflow:auto"></aside></body></html>`}));await page.goto('http://127.0.0.1/note-reply-fixture');await page.addStyleTag({content:css});await page.addScriptTag({content:script});try{await page.locator('.en-title').waitFor({timeout:3000});await page.getByRole('button',{name:'添加到笔记',exact:true}).waitFor({timeout:3000})}catch(e){throw Error(JSON.stringify({errors,body:await page.locator('body').textContent(),message:e.message}))}await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,window.noteSaved.blocks));return {context,page,errors}
}
async function caret(page){await page.locator('[data-id="body"] .bn-inline-content').click();await page.evaluate(()=>{const editor=window.noteEditor;editor.setTextCursorPosition('body','start');editor._tiptapEditor.commands.setTextSelection(editor._tiptapEditor.state.selection.from+2);editor.focus()});expect(await page.evaluate(()=>({offset:window.noteEditor._tiptapEditor.state.selection.$from.parentOffset,text:window.noteEditor._tiptapEditor.state.selection.$from.parent.textContent}))).toEqual({offset:2,text:'前半后半'})}
async function replyBody(page,errors){try{await page.locator('.en-native-component-body [data-research-container-markdown]').waitFor({timeout:3000})}catch(e){throw Error(JSON.stringify({errors,body:(await page.locator('body').textContent()).slice(-3000),blocks:await page.evaluate(()=>window.noteEditor.document),requests:await page.evaluate(()=>window.noteRequests)}))}}
for(const dark of [false,true])it(`inserts the real reply as one native component at the body caret, retaining text styles and undo (${dark?'dark':'light'})`,async()=>{
 const {context,page,errors}=await fixture(dark);try{
  expect(await page.locator('#reply .p-xYUq_actions button').count()).toBe(5);await caret(page)
  await page.getByRole('button',{name:'添加到笔记',exact:true}).click();await replyBody(page,errors)
  const blocks=await page.evaluate(()=>window.noteEditor.document),node=JSON.parse(blocks[1].props.payload)
  expect(blocks.map(block=>block.type),JSON.stringify(blocks)).toEqual(['paragraph','research','paragraph','paragraph']);expect(blocks[0].content).toEqual([{type:'text',text:'前半',styles:{bold:true}}]);expect(blocks[2].content).toEqual([{type:'text',text:'后半',styles:{italic:true}}]);expect(blocks[3].content[0].text).toBe('末段保留');expect(node).toMatchObject({kind:'assistant-result',messageId:'ework-note:reply',noteReply:true,noteLibrary:true,excerpt:'# 回复标题\n\n**完整回复**，与当前光标有关。'})
  expect(await page.evaluate(()=>window.canvasCalls)).toEqual([]);await page.locator('.bn-editor').focus();await page.keyboard.press('ControlOrMeta+z');await expect.poll(()=>page.locator('.en-native-component').count()).toBe(0);expect((await page.evaluate(()=>window.noteEditor.document))[0].content).toEqual([{type:'text',text:'前半',styles:{bold:true}},{type:'text',text:'后半',styles:{italic:true}}]);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('copies the original reply, saves and toggles feedback through the native controller, and branches from the completed event',async()=>{
 const {context,page,errors}=await fixture();try{
  await page.getByRole('button',{name:'复制',exact:true}).click();expect(await page.evaluate(()=>window.copiedReply)).toBe('# 回复标题\n\n**完整回复**，与当前光标有关。')
  await page.getByRole('button',{name:'好的回答',exact:true}).click();await page.locator('#reply [aria-pressed="true"]').waitFor();expect(await page.evaluate(()=>window.feedbackCalls.at(-1))).toMatchObject({sessionId:'actions-test',messageId:'ework-note:reply',rating:'positive',ifVersion:null})
  await page.getByRole('button',{name:'有问题的回答',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.feedbackCalls.at(-1)?.rating)).toBe('negative');await page.locator('#reply [aria-pressed="true"][aria-label="取消标记"]').click();await expect.poll(()=>page.locator('#reply [aria-pressed="true"]').count()).toBe(0)
  await page.getByRole('button',{name:'新分支',exact:true}).click();expect(await page.evaluate(()=>window.forkCalls)).toEqual([7]);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('keeps long replies complete on save and reopen, and routes the same native add button back to canvas outside Notes',async()=>{
 const {context,page,errors}=await fixture();try{
  const text='# 长回复\n\n'+'完整正文。'.repeat(9000);await page.evaluate(text=>{window.row={...window.row,result:{kind:'conversation',markdown:text}};window.renderReply()},text);await caret(page);await page.getByRole('button',{name:'添加到笔记',exact:true}).click();await replyBody(page,errors);expect(await page.locator('.en-native-component-body pre').textContent()).toBe(text)
  await expect.poll(()=>page.evaluate(()=>window.noteSaved.blocks.some(block=>block.type==='research'))).toBe(true);const stored=await page.evaluate(()=>window.noteSaved.blocks.find(block=>block.type==='research').props.payload);expect(JSON.parse(stored).excerpt).toBe(text)
  await page.evaluate(()=>{window.notesRoot.unmount();window.notesRoot=window.createNoteRoot()});await replyBody(page,errors);expect(await page.locator('.en-native-component-body pre').textContent()).toBe(text)
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-close',{detail:{sessionId:'actions-test'}})));await page.getByRole('button',{name:'添加到画布',exact:true}).click();expect((await page.evaluate(()=>window.canvasCalls))[0].text).toBe(text);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('restores Notes as the action destination after identity reset with the same native header and surface',async()=>{
 const {context,page,errors}=await fixture();try{
  await page.evaluate(()=>{document.body.insertAdjacentHTML('afterbegin','<header data-ework-notes-session="actions-test"></header>');window.surfaceHost=new window.WorkspaceSurfaceHost(document);window.surfaceHost.register('notes',document.querySelector('.en-root'));window.surfaceHost.open('notes');document.dispatchEvent(new CustomEvent('sherlock:notes-reset'))})
  await page.getByRole('button',{name:'添加到画布',exact:true}).waitFor();await page.evaluate(()=>{window.surfaceHost.close('notes');window.surfaceHost.open('notes')});await page.getByRole('button',{name:'添加到笔记',exact:true}).waitFor();expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
