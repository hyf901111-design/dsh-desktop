import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {noteMenuDocumentHtml,noteMenuPresentation} from '../src/main/notes/native-menu'
vi.mock('electron',()=>({BrowserWindow:class{},screen:{}}))

let browser, script, css
beforeAll(async () => {
  const output = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';import {createPortal} from 'react-dom';import {EWorkNoteExportMenu} from './scripts/lib/notes-export-menu.mjs';window.react_dom={createPortal};
      import {componentLibraryBuiltins} from './packages/dsh-research-task-runtime/component-library-catalog.js';import {financialWidgetDefaults,financialWidgetDimensions,financialWidgetSpec} from './packages/dsh-research-task-runtime/financial-widget-contract.js';import {createNoteComponentViewStore,EWorkNoteComponentViews} from './scripts/lib/notes-components.mjs';import {NotesApp} from './src/preload/notes/editor'; import {createNoteFileViewStore,EWorkNoteFileViews} from './scripts/lib/notes-files.mjs';
      import {createNotesActivityStore,EWorkNotesActivity} from './scripts/lib/notes-activity.mjs';
      window.react=React;window.eworkNotesActivity=createNotesActivityStore(document);const header=document.createElement('header');header.style.cssText='position:fixed;top:4px;left:360px;z-index:100';document.body.append(header);createRoot(header).render(<EWorkNoteExportMenu sessionId="outline-test"/>);
      import '@blocknote/mantine/style.css'; import './src/preload/notes/style.css';
      window.noteRequests=[];window.noteTasks=[];window.noteCommits=[];document.addEventListener('sherlock:notes-task-state',event=>window.noteTasks.push(event.detail));document.addEventListener('sherlock:notes-composer-commit',event=>window.noteCommits.push(event.detail));
      window.eworkNoteFileViews=createNoteFileViewStore(document);window.eworkNoteOfficePreview={subscribe:()=>()=>{},getSnapshot:()=>null};window.ResearchCanvasFileCard=({node})=><section className="rScV5Q_richNode"><header>{node.name}</header><div>原生文件预览</div></section>;const fileViews=document.createElement('div');document.body.append(fileViews);createRoot(fileViews).render(<EWorkNoteFileViews sessionId="outline-test" active/>);window.financialWidgetSpec=financialWidgetSpec;window.eworkNoteComponentViews=createNoteComponentViewStore(document);window.ResearchContainerBody=({node})=><div>{node.containerSpec.content||node.title}</div>;window.FinancialWidget=({node,onSpecChange})=><div data-financial-widget={node.containerSpec.widget}><span>{node.title}</span><button onClick={()=>onSpecChange(node.containerSpec,{...node.containerSpec,symbols:[{code:'600519',market:'SH',name:'验收标的'}]})}>添加验收自选股</button></div>;window.FinancialLibraryIcon=()=>null;window.FinancialQuoteSelector=()=>null;window.FinancialNewsSearch=()=>null;const componentViews=document.createElement('div');document.body.append(componentViews);createRoot(componentViews).render(<EWorkNoteComponentViews sessionId="outline-test" active/>);window.resolveNoteFiles={};const bridge={filePath:file=>'/tmp/'+file.name,request:async(method,input)=>{window.noteRequests.push({method,input});return method==='library-list'?[...componentLibraryBuiltins().map(item=>({id:item.id,title:item.name,icon:item.widget,group:'内置组件'})),{id:'custom-demo',title:window.customLibraryName||'我的研究总结',icon:'library',group:'自定义组件'}]:method==='library-read'?await (window.deferLibraryRead?new Promise(resolve=>window.releaseLibraryRead=()=>resolve({id:crypto.randomUUID(),title:'延迟组件',noteLibrary:true,containerSpec:{version:1,type:'markdown',title:'延迟组件',content:'内容'}})):Promise.resolve((()=>{const item=componentLibraryBuiltins().find(item=>item.id===input.id),spec=item?(item.widget==='calendar'?{version:1,type:'calendar-tool',title:item.name}:financialWidgetDefaults(item.widget)):{version:1,type:'markdown',title:window.customLibraryName||'我的研究总结',content:'原始研究内容'};return {id:crypto.randomUUID(),kind:'generated-container',title:spec.title,noteLibrary:true,generationStatus:'completed',containerSpec:spec,...(item&&item.widget!=='calendar'?financialWidgetDimensions(spec):{height:320})}})())):method==='component-ready'?{ready:window.noteRequests.some(row=>row.method==='save'&&row.input.content.blocks.some(block=>block.type==='research'&&JSON.parse(block.props.payload).id===input.nodeId))}:method==='load'?{saved:window.noteSaved||{title:'浮层位置验收',blocks:[],yjs:'',revision:0,updatedAt:0}}:method==='save'?{status:'saved',saved:{...input.content,revision:input.revision+1}}:method==='clipboard'?{kind:'components',nodes:[window.noteComponent]}:method==='render'?{html:input.spec.html,document:window.noteComponentDocument}:method==='file-bind'?{previewSessionId:'note-files:fixture'}:method==='file-admit'?await new Promise(resolve=>{window.resolveNoteFiles[input.nodeId]=()=>resolve({id:input.nodeId,name:input.name,source:'computer',path:input.path,authorizationId:'fixture-grant-'+input.nodeId,previewSessionId:'note-files:fixture',contentType:'text/plain'})}):method==='generate'?await new Promise(resolve=>{window.resolveNoteSuggestion=result=>resolve(result||{kind:'text',markdown:'改写后的验收句子。'})}):{}},draft:async()=>{}};
      const activity=document.createElement('div');activity.id='native-activity';activity.className='t8lSSG_panelBody';document.body.append(activity);createRoot(activity).render(<EWorkNotesActivity sessionId="outline-test" t={key=>key} UserBubble={({content})=><div>{content.map(b=>b.text)}</div>} Progress={({entry})=><div role="status">{entry.noteTask.status}</div>} Markdown={({blocks})=><div>{blocks.map(b=>b.text)}</div>}/>);
      const root=document.querySelector('.en-editor-host');
      createRoot(root).render(<NotesApp sessionId="outline-test" bridge={bridge} dark={document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>{}}/>);
      document.addEventListener('sherlock:notes-composer-draft',e=>{const input=document.querySelector('#native-input');input.value=e.detail.text;if(e.detail.focus)input.focus({preventScroll:true})});
      document.querySelector('#native-command').onclick=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-command',{detail:{sessionId:'outline-test'}}));
      document.querySelector('#native-send').onclick=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'outline-test',prompt:document.querySelector('#native-input').value,images:[]}}));
    ` },
    bundle: true, platform: 'browser', conditions: ['browser', 'import', 'style'], format: 'iife', write: false, outfile: 'fixture.js',
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.svg': 'dataurl' },
    plugins: [{name:'notes-test-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo'),loader:'tsx'}))}},{ name: 'notes-inline-svg', setup(b) {
      b.onResolve({ filter: /\.svg\?inline$/ }, a => ({ path: resolve(a.resolveDir, a.path.slice(0, -7)), namespace: 'svg' }))
      b.onLoad({ filter: /.*/, namespace: 'svg' }, async a => ({ contents: 'export default ' + JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(await readFile(a.path)).toString('base64')), loader: 'js' }))
    } }]
  })
  script = output.outputFiles.find(f => f.path.endsWith('.js')).text
  css = output.outputFiles.find(f => f.path.endsWith('.css')).text + (await readFile('src/preload/figma-refinements.css','utf8')).split('\n').filter(line=>line.includes('.en-export-menu')||line.includes('.en-header-export')||line.includes('.en-task-result')).join('\n')
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(runtime).href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => { await browser?.close() })

async function fileFixture(saved){
 const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage()
 await page.route('http://127.0.0.1/notes-outline-fixture',route=>route.fulfill({contentType:'text/html',body:'<body data-ds-dark-theme><section class="en-root" data-dark="true" style="left:10px;right:340px"><div class="en-editor-host"></div></section><aside style="position:fixed;right:10px;bottom:20px;width:320px"><textarea id="native-input"></textarea><button id="native-command"></button><button id="native-send"></button></aside></body>'}));await page.goto('http://127.0.0.1/notes-outline-fixture')
 if(saved)await page.evaluate(value=>window.noteSaved=value,saved)
 await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor();return {context,page}
}
async function dropNoteFiles(page,names){await page.evaluate(names=>{const target=document.querySelector('.en-document .bn-inline-content'),box=target.getBoundingClientRect(),data=new DataTransfer();for(const name of names)data.items.add(new File(['file content'],name,{type:'text/plain'}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data,clientX:box.x+10,clientY:box.bottom-1}))},names)}

it('keeps dropped files in order and inside component frames across asynchronous completion and undo',async()=>{
 const {context,page}=await fileFixture();try{
  await page.locator('.en-document .bn-editor').click();await page.keyboard.type('前文。');await dropNoteFiles(page,['first.txt','second.txt']);await page.locator('.en-file-import').first().waitFor()
  expect(await page.locator('.en-file-import [role=status]').count()).toBe(2);expect(await page.locator('.en-file-import [role=alert]').count()).toBe(0)
  await expect.poll(()=>page.evaluate(()=>Object.keys(window.resolveNoteFiles).length)).toBe(1)
  await page.evaluate(()=>Object.values(window.resolveNoteFiles)[0]());await expect.poll(()=>page.evaluate(()=>Object.keys(window.resolveNoteFiles).length)).toBe(2);await page.evaluate(()=>Object.values(window.resolveNoteFiles)[1]())
  await expect.poll(()=>page.locator('.en-file-host[data-note-file-rendered] .rScV5Q_richNode header').allTextContents()).toEqual(['first.txt','second.txt'])
  expect(await page.locator('.en-file-host').first().evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('.rScV5Q_richNode').getBoundingClientRect();return Math.abs(a.x-b.x)<1&&Math.abs(a.width-b.width)<1})).toBe(true)
  await page.locator('.en-document .bn-editor').click({position:{x:20,y:10}});await page.keyboard.press('ControlOrMeta+z');await expect.poll(()=>page.locator('.en-note-file,.en-file-import').count()).toBe(0)
  expect(await page.locator('.en-document .bn-editor').textContent()).toContain('前文。')
  await page.keyboard.press('ControlOrMeta+Shift+z');await expect.poll(()=>page.locator('.en-file-host[data-note-file-rendered] .rScV5Q_richNode header').allTextContents()).toEqual(['first.txt','second.txt'])
 }finally{await context.close()}
},15000)
it('does not resurrect a removed pending file when admission finishes',async()=>{
 const {context,page}=await fileFixture();try{
  await dropNoteFiles(page,['removed.txt']);await expect.poll(()=>page.evaluate(()=>Object.keys(window.resolveNoteFiles).length)).toBe(1);await page.getByRole('button',{name:'移除笔记中的文件',exact:true}).click();await page.evaluate(()=>Object.values(window.resolveNoteFiles)[0]())
  await expect.poll(()=>page.evaluate(()=>window.noteRequests.filter(row=>row.method==='file-revoke').length)).toBeGreaterThan(0);expect(await page.locator('.en-note-file,.en-file-import').count()).toBe(0)
 }finally{await context.close()}
},15000)
it('does not leave orphaned importing states after undoing an unfinished multi-file drop and redoing it',async()=>{
 const {context,page}=await fileFixture();try{
  await dropNoteFiles(page,['pending-first.txt','pending-second.txt']);await expect.poll(()=>page.evaluate(()=>Object.keys(window.resolveNoteFiles).length)).toBe(1)
  await page.locator('.en-document .bn-editor').click({position:{x:20,y:10}});await page.keyboard.press('ControlOrMeta+z');await expect.poll(()=>page.locator('.en-file-import').count()).toBe(0)
  await page.evaluate(()=>Object.values(window.resolveNoteFiles)[0]());await expect.poll(()=>page.evaluate(()=>window.noteRequests.filter(row=>row.method==='file-revoke').length)).toBeGreaterThan(0)
  await page.keyboard.press('ControlOrMeta+Shift+z');await expect.poll(()=>page.locator('.en-file-import [role=alert]').count()).toBe(2);expect(await page.locator('.en-file-import [role=status]').count()).toBe(0)
 }finally{await context.close()}
},15000)
it('shows an interrupted saved import as a terminal retryable error',async()=>{
 const first=await fileFixture();let saved
 try{await dropNoteFiles(first.page,['interrupted.txt']);await expect.poll(()=>first.page.evaluate(()=>window.noteRequests.filter(row=>row.method==='save').at(-1)?.input.content.blocks.some(block=>block.type==='attachment'))).toBe(true);saved=await first.page.evaluate(()=>({...window.noteRequests.filter(row=>row.method==='save').at(-1).input.content,revision:1,updatedAt:1}))}finally{await first.context.close()}
 const {context,page}=await fileFixture(saved);try{
  await page.getByRole('alert').filter({hasText:'上次文件导入已中断'}).waitFor();expect(await page.locator('.en-file-import [role=status]').count()).toBe(0)
 }finally{await context.close()}
},15000)

it('centers the empty outline and formatting toolbar and uses legible comment and embed controls',async()=>{
 const {context,page}=await fileFixture();try{
  await page.getByRole('button',{name:'展开目录',exact:true}).click()
  expect(await page.locator('.en-toc-popover').evaluate(el=>{const outer=el.getBoundingClientRect(),inner=el.querySelector('.en-toc-heading').getBoundingClientRect();return Math.abs((inner.y-outer.y)-(outer.bottom-inner.bottom))})).toBeLessThanOrEqual(1)
  await page.keyboard.press('Escape');await page.locator('.en-document .bn-editor').click();await page.keyboard.type('文字工具栏验收。')
  await page.evaluate(()=>{const target=document.querySelector('.en-document .bn-inline-content'),range=document.createRange();range.selectNodeContents(target);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))})
  await page.getByRole('button',{name:'AI 改写',exact:true}).waitFor();expect(await page.locator('.en-ai-format svg').count()).toBe(1)
  expect(await page.locator('.bn-formatting-toolbar').evaluate(el=>{const outer=el.getBoundingClientRect(),button=el.querySelector('.en-ai-format').getBoundingClientRect();return Math.abs((button.y-outer.y)-(outer.bottom-button.bottom))})).toBeLessThanOrEqual(1)
  await page.getByRole('button',{name:'添加评论',exact:true}).click();await page.locator('.bn-thread').waitFor();const save=page.locator('.bn-thread .bn-comment-actions button')
  expect(await save.isDisabled()).toBe(true);const disabled=await save.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,height:el.getBoundingClientRect().height,border:getComputedStyle(el).borderColor}));expect(disabled.background).not.toBe(disabled.color);expect(disabled.height).toBe(28);expect(disabled.border).toBe('rgb(72, 72, 72)')
  await page.locator('.bn-thread .bn-editor').click();await page.keyboard.type('评论按钮验收');await expect.poll(()=>save.isDisabled()).toBe(false);expect(await save.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(229, 229, 229)')
  await save.click();await page.locator('.en-title').click();await page.locator('.en-document .bn-editor').first().click();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('/图片');await expect.poll(()=>page.evaluate(()=>window.noteRequests.filter(row=>row.method==='menu-sync').at(-1)?.input.items.length)).toBe(1);await page.keyboard.press('Enter');await page.locator('.bn-add-file-button').click();await page.locator('.bn-panel').waitFor()
  expect(await page.locator('.bn-panel').evaluate(el=>getComputedStyle(el).borderColor)).toBe('rgb(72, 72, 72)');expect(await page.locator('.bn-panel input').evaluate(el=>getComputedStyle(el).borderColor)).toBe('rgb(72, 72, 72)');expect(await page.locator('.bn-panel button[type=submit]').evaluate(el=>el.getBoundingClientRect().height)).toBe(30)
 }finally{await context.close()}
},15000)
it('fits a full-document suggestion to its content without a resize handle or a fixed empty body',async()=>{
 const {context,page}=await fileFixture();try{
  await page.locator('#native-input').fill('精简正文');await page.locator('#native-send').click();await page.locator('.en-ai-loading').waitFor();await page.evaluate(()=>window.resolveNoteSuggestion({kind:'text',markdown:'简短的正文。'}));await page.locator('.en-composer-area .en-preview').waitFor()
  expect(await page.getByRole('separator',{name:'调整建议面板高度'}).count()).toBe(0)
  expect(await page.locator('.en-composer-area .en-preview').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(180)
 }finally{await context.close()}
},15000)

it('keeps native slash filtering and keyboard insertion in the editor and rejects stale mouse selections',async()=>{
 const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage()
 try{
  await page.route('http://127.0.0.1/notes-outline-fixture',route=>route.fulfill({contentType:'text/html',body:'<body><section class="en-root" style="left:10px;right:340px"><div class="en-editor-host"></div></section><aside style="position:fixed;right:10px;bottom:20px;width:320px"><textarea id="native-input"></textarea><button id="native-command"></button><button id="native-send"></button></aside></body>'}));await page.goto('http://127.0.0.1/notes-outline-fixture');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor()
  const latest=()=>page.evaluate(()=>window.noteRequests.filter(row=>row.method==='menu-sync').at(-1)?.input)
  await page.locator('.en-document .bn-editor').click();await page.keyboard.type('/');await expect.poll(async()=> (await latest())?.items.length||0).toBeGreaterThan(0)
  const first=await latest();expect(first.items.some(item=>item.title==='一级标题')).toBe(true);expect(await page.locator('.en-document .bn-editor').evaluate(el=>el.contains(document.activeElement))).toBe(true)
  await page.keyboard.type('引用');await expect.poll(async()=> (await latest())?.items.map(item=>item.title)).toEqual(['引用'])
  const query=await latest();await page.evaluate(input=>document.dispatchEvent(new CustomEvent('sherlock:notes-menu-event',{detail:{...input,action:'select',itemId:input.items[0].id,revision:input.revision-1}})),query)
  expect(await page.locator('.en-document [data-content-type="quote"]').count()).toBe(0)
  await page.keyboard.press('Enter');await page.locator('.en-document [data-content-type="quote"]').waitFor();await expect.poll(()=>page.locator('.en-native-menu-accessible').count()).toBe(0);expect(await page.evaluate(()=>window.noteRequests.some(row=>row.method==='menu-close'))).toBe(true)
  await page.keyboard.type('/');await expect.poll(async()=> (await latest())?.menuId).not.toBe(first.menuId)
  await page.keyboard.press('ArrowDown');await expect.poll(async()=> (await latest())?.selectedIndex).toBe(1)
  const menu=await latest();await page.evaluate(input=>document.dispatchEvent(new CustomEvent('sherlock:notes-menu-event',{detail:{...input,action:'select',itemId:input.items.find(item=>item.icon==='paragraph').id}})),menu)
  await page.locator('.en-document [data-content-type="paragraph"]').waitFor();await expect.poll(()=>page.locator('.en-document .bn-editor').textContent()).not.toContain('/')
  await page.keyboard.type('/');await expect.poll(()=>page.locator('.en-native-menu-accessible').count()).toBe(1)
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change',{detail:{surface:'integrations'}})));await expect.poll(()=>page.locator('.en-native-menu-accessible').count()).toBe(0)
 }finally{await context.close()}
},15000)

it('shows clarification in the shared conversation and leaves the note empty without an acceptance panel',async()=>{
 const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage()
 try{
  await page.route('http://127.0.0.1/notes-outline-fixture',route=>route.fulfill({contentType:'text/html',body:'<body><section class="en-root" style="left:10px;right:340px"><div class="en-editor-host"></div></section><aside style="position:fixed;right:10px;bottom:20px;width:320px"><textarea id="native-input"></textarea><button id="native-command">命令测试接口</button><button id="native-send">发送测试接口</button></aside></body>'}));await page.goto('http://127.0.0.1/notes-outline-fixture');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor()
  await page.locator('#native-input').fill('写一篇文章');await page.locator('#native-send').click();await page.locator('.en-ai-loading').waitFor();await page.evaluate(()=>window.resolveNoteSuggestion({kind:'conversation',markdown:'你想写什么主题？大约多少字？'}))
  await page.locator('#native-activity').getByText('你想写什么主题？大约多少字？',{exact:true}).waitFor({timeout:2000})
  expect(await page.locator('.en-preview,.en-ai-loading').count()).toBe(0);expect(await page.getByRole('button',{name:'插入到下方',exact:true}).count()).toBe(0)
  expect(await page.locator('.en-document .bn-editor').textContent()).not.toContain('你想写什么主题')
  expect(await page.evaluate(()=>window.noteTasks.at(-1).phase)).toBe('replied')
  expect(await page.locator('#native-activity .en-task-result').count()).toBe(0)
  expect(await page.evaluate(()=>window.noteCommits.length)).toBe(1)
  await page.locator('#native-input').fill('创建一个收入趋势图表');await page.locator('#native-send').click();await page.locator('.en-research').waitFor();await page.evaluate(()=>window.resolveNoteSuggestion({kind:'conversation',markdown:'请提供月份和收入数据。'}));await page.locator('#native-activity').getByText('请提供月份和收入数据。',{exact:true}).waitFor()
  expect(await page.locator('.en-research,.en-preview,.en-ai-loading').count()).toBe(0)
 }finally{await context.close()}
},15000)

for(const generated of ['改写后的词句','> **改写后的词句**'])it(`replaces only selected inline text and preserves its original block and marks (${generated})`,async()=>{
 const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage()
 try{
  await page.route('http://127.0.0.1/notes-outline-fixture',route=>route.fulfill({contentType:'text/html',body:'<body><section class="en-root" style="left:10px;right:340px"><div class="en-editor-host"></div></section><aside style="position:fixed;right:10px;bottom:20px;width:320px"><textarea id="native-input"></textarea><button id="native-command">命令测试接口</button><button id="native-send">发送测试接口</button></aside></body>'}));await page.goto('http://127.0.0.1/notes-outline-fixture');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor()
  await page.evaluate(()=>{const editor=document.querySelector('.en-document .bn-editor'),data=new DataTransfer();data.setData('text/html','<p>前文<strong><span data-style-type="textColor" data-value="red" data-editable>待改写的词句</span></strong>后文。</p>');editor.focus();editor.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))});const original=page.locator('.en-document .bn-inline-content').filter({hasText:'待改写的词句'});await original.waitFor()
  const block=await original.evaluate(el=>({id:el.closest('[data-id]').dataset.id,type:el.closest('[data-content-type]').dataset.contentType,style:getComputedStyle(el.querySelector('[data-style-type="textColor"]')).color}));expect(block.style).toBe('rgb(224, 62, 62)')
  await page.evaluate(()=>{const el=document.querySelector('.en-document strong');document.querySelector('.en-document .bn-editor').focus();const range=document.createRange();range.selectNodeContents(el);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))});await page.getByRole('button',{name:/AI 改写/}).click();await page.locator('#native-send').click();await page.locator('.en-ai-loading').waitFor();await page.evaluate(result=>window.resolveNoteSuggestion({kind:'text',markdown:result}),generated);await page.locator('.en-preview').waitFor();await page.locator('#native-activity .en-task-result').waitFor({timeout:1000})
  await page.getByRole('button',{name:'替换所选',exact:true}).click();await expect.poll(()=>page.locator('.en-document .bn-inline-content').allTextContents()).toContain('前文改写后的词句后文。')
  const rewritten=page.locator('.en-document .bn-inline-content').filter({hasText:'前文改写后的词句后文。'});expect(await rewritten.evaluate(el=>el.closest('[data-id]').dataset.id)).toBe(block.id);expect(await rewritten.evaluate(el=>el.closest('[data-content-type]').dataset.contentType)).toBe(block.type)
  expect(await rewritten.locator('strong').textContent()).toBe('改写后的词句');expect(await rewritten.locator('[data-style-type="textColor"]').evaluate(el=>getComputedStyle(el).color)).toBe(block.style);expect(await page.locator('.en-document [data-content-type="quote"],.en-document .bn-block-group .bn-block-group').count()).toBe(0)
  await page.locator('#native-activity .en-task-result').waitFor({timeout:2000});expect(await page.locator('#native-activity .en-task-result').textContent()).toContain('改写后的词句');expect(await page.locator('.en-preview').count()).toBe(0)
  await rewritten.click();await page.keyboard.press('Meta+z');await expect.poll(()=>page.locator('.en-document .bn-inline-content').allTextContents()).toContain('前文待改写的词句后文。')
  if(generated==='改写后的词句'){
    await original.hover();await page.getByRole('button',{name:'段落操作',exact:true}).click();const menu=page.locator('.en-block-menu');await menu.waitFor()
    const layout=await menu.evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,lines:[...el.querySelectorAll('.en-block-types:first-child button')].map(button=>{const range=document.createRange();range.selectNodeContents(button.lastChild);return range.getClientRects().length})}))
    expect(layout.lines).toEqual([1,1,1,1,1]);expect(layout.scroll).toBeLessThanOrEqual(layout.height)
    await page.setViewportSize({width:1100,height:400});await expect.poll(()=>menu.evaluate(el=>el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(392)
    await menu.evaluate(el=>el.scrollTop=el.scrollHeight);expect(await menu.getByRole('button',{name:'删除段落',exact:true}).isVisible()).toBe(true);await page.keyboard.press('Escape');expect(await menu.count()).toBe(0)
  }
 }finally{await context.close()}
},15000)

for (const dark of [false, true]) for (const width of [1380, 900]) it(`outline and inline AI keep the document and sidebar composer stable (${dark ? 'dark' : 'light'}, ${width})`, async () => {
  const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage()
  try {
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    await page.route('http://127.0.0.1/notes-outline-fixture', route => route.fulfill({ contentType: 'text/html', body: `<body ${dark ? 'data-ds-dark-theme' : ''}><section class="en-root" data-dark="${dark}" style="left:10px;right:340px"><div class="en-editor-host"></div></section><aside class="test-native-sidebar" style="position:fixed;right:10px;top:60px;bottom:10px;width:320px"><div class="en-native-composer-host sRp_composer" style="position:absolute;bottom:20px;width:100%;height:138px"><textarea id="native-input" aria-label="原生输入框测试接口"></textarea><button id="native-command">命令测试接口</button><button id="native-send">发送测试接口</button></div></aside></body>` }))
    await page.goto('http://127.0.0.1/notes-outline-fixture')
    await page.addStyleTag({ content: css })
    await page.addScriptTag({ content: script })
    try { await page.locator('.en-title').waitFor({ timeout: 2000 }) } catch (e) { throw Error(errors.join('\n') || e.message) }
    if(!dark&&width===900){for(const label of ['Word','PDF','Markdown']){await page.getByRole('button',{name:'导出笔记',exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click()}expect(await page.evaluate(()=>window.noteRequests.filter(r=>r.method==='export').map(r=>r.input.format))).toEqual(['docx','pdf','md'])}
    expect(await page.getByRole('button',{name:'展开目录',exact:true}).textContent()).toBe('')
    await page.getByRole('button',{name:'展开目录',exact:true}).click();expect(await page.locator('.en-toc-heading button').count()).toBe(0);expect(await page.getByText('添加标题后显示目录',{exact:true}).count()).toBe(0);await page.keyboard.press('Escape')
    // Paste into the actual BlockNote view to exercise live outline updates.
    await page.evaluate(() => { const node = document.querySelector('.bn-editor'), data = new DataTransfer(); data.setData('text/html', '<h2>本周观察</h2><p>目录展开时正文保持原位。</p><h3>下一步</h3><p>输入框保持原位。</p>'); node.focus(); node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })) })
    await page.getByText('目录展开时正文保持原位。', { exact: true }).waitFor()
    const geometry = () => page.evaluate(() => ['.en-title', '.bn-editor', '.en-native-composer-host'].map(selector => { const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect(); return { x, y, width, height } }))
    await page.locator('.en-document-scroll').evaluate(el=>el.scrollTo(0,0))
    const before = await geometry()
    expect(before[2].x).toBeGreaterThan(before[0].x+before[0].width)
    expect(await page.locator('.en-document-actions').count()).toBe(0);expect(before[0].x).toBeGreaterThanOrEqual(74)
    expect(await page.locator('.en-document-scroll').evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(100)
    await page.getByRole('button', { name: '展开目录', exact: true }).click()
    await expect.poll(() => page.getByRole('dialog', { name: '文档目录' }).isVisible()).toBe(true)
    expect(await geometry()).toEqual(before)
    expect(await page.getByRole('button', { name: '浮层位置验收', exact: true }).count()).toBe(0)
    expect(await page.getByRole('button', { name: '本周观察', exact: true }).count()).toBe(1)
    expect(await page.getByRole('button', { name: '本周观察', exact: true }).evaluate(el=>getComputedStyle(el).paddingLeft)).toBe('8px')
    await page.getByRole('button', { name: '收起目录', exact: true }).click()
    expect(await geometry()).toEqual(before)
    await page.getByRole('button', { name: '展开目录', exact: true }).click()
    await page.keyboard.press('Escape')
    expect(await page.getByRole('dialog', { name: '文档目录' }).count()).toBe(0)
    expect(await page.getByRole('button', { name: '展开目录', exact: true }).evaluate(el => el === document.activeElement)).toBe(true)
    await page.getByRole('button', { name: '展开目录', exact: true }).click()
    await page.locator('.en-title').click()
    expect(await page.getByRole('dialog', { name: '文档目录' }).count()).toBe(0)
    expect(await page.locator('.en-title').evaluate(el => el === document.activeElement)).toBe(true)
    expect((await geometry()).map(({y,...rect})=>rect)).toEqual(before.map(({y,...rect})=>rect))
    await page.getByRole('button', { name: '展开目录', exact: true }).click()
    await page.getByRole('button', { name: '下一步', exact: true }).click()
    expect(await page.getByRole('dialog', { name: '文档目录' }).count()).toBe(0)
    await page.evaluate(()=>{const editor=document.querySelector('.en-document .bn-editor');editor.focus();const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range)})
    await page.keyboard.press('Enter');await page.keyboard.type('/');await expect.poll(()=>page.evaluate(()=>window.noteRequests.filter(r=>r.method==='menu-sync').at(-1)?.input.items.length||0)).toBeGreaterThan(0);await page.keyboard.press('Escape');await page.keyboard.press('Backspace')
    await page.evaluate(()=>{const paragraph=[...document.querySelectorAll('.en-document .bn-inline-content')].find(el=>el.textContent==='目录展开时正文保持原位。');document.querySelector('.en-document .bn-editor').focus();const range=document.createRange();range.selectNodeContents(paragraph);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));paragraph.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))})
    await page.getByRole('button',{name:/AI 改写/}).click()
    expect(await page.locator('.en-ai-selection').allTextContents()).toEqual(['目录展开时正文保持原位。'])
    expect(await page.locator('#native-input').evaluate(el=>el===document.activeElement)).toBe(true)
    await page.locator('#native-send').click()
    await expect.poll(()=>page.locator('.en-inline-assistant .en-ai-loading').isVisible()).toBe(true);await page.locator('#native-activity').getByText('正在生成内容',{exact:true}).waitFor();
    const target=await page.locator('.en-ai-selection').boundingBox(),loading=await page.locator('.en-inline-assistant .en-ai-loading').boundingBox();expect(loading.y).toBeGreaterThan(target.y+target.height);await expect.poll(async()=>(await page.locator('.en-inline-assistant .en-ai-loading').boundingBox()).x).toBe(before[0].x)
    await page.getByText('输入框保持原位。',{exact:true}).click();await page.keyboard.press('End');await page.keyboard.type('旁边的更新');
    if(dark&&width===900){
      await page.evaluate(()=>window.resolveNoteSuggestion({kind:'conversation',markdown:'希望使用什么语气？'}));await page.locator('#native-activity').getByText('希望使用什么语气？',{exact:true}).waitFor()
      expect(await page.locator('.en-ai-selection').allTextContents()).toEqual(['目录展开时正文保持原位。']);expect(await page.locator('.en-preview').count()).toBe(0)
      await page.locator('#native-input').fill('正式一些');await page.locator('#native-send').click();await page.locator('.en-inline-assistant .en-ai-loading').waitFor()
      expect(await page.evaluate(()=>window.noteRequests.filter(r=>r.method==='generate').at(-1).input.selection)).toBe('目录展开时正文保持原位。')
    }
    await page.evaluate(()=>window.resolveNoteSuggestion())
    await expect.poll(()=>page.locator('.en-inline-assistant .en-preview').isVisible()).toBe(true)
    const previewLayout=await page.locator('.en-preview').evaluate(el=>({title:el.querySelector('header strong').getBoundingClientRect().x,text:el.querySelector('.bn-inline-content').getBoundingClientRect().x,actions:[...el.querySelectorAll('footer button')].map(button=>button.getBoundingClientRect().height)}))
    expect(Math.abs(previewLayout.title-previewLayout.text)).toBeLessThanOrEqual(1);expect(Math.max(...previewLayout.actions)).toBeLessThanOrEqual(32)
    expect(await page.locator('.en-composer-area .en-preview').count()).toBe(0)
    expect(await page.getByRole('separator',{name:'调整建议面板高度'}).count()).toBe(0);expect(await page.locator('.en-preview').evaluate(el=>getComputedStyle(el).backgroundColor)).not.toContain('rgba');
    await page.getByRole('button',{name:'替换所选',exact:true}).click()
    await expect.poll(()=>page.locator('.en-document .bn-editor').textContent()).toContain('改写后的验收句子。')
    expect(await page.locator('.en-document .bn-editor').textContent()).not.toContain('目录展开时正文保持原位。')
    expect(await page.locator('.en-ai-selection').count()).toBe(0)
    expect(await page.locator('.en-inline-assistant').count()).toBe(0)
    expect(await page.locator('.en-document .bn-editor').textContent()).toContain('旁边的更新')
    expect(JSON.stringify(await page.evaluate(()=>window.noteRequests.filter(r=>r.method==='save').map(r=>r.input.content)))).not.toContain('正在改写所选内容')
    expect(await page.evaluate(()=>window.noteRequests.find(r=>r.method==='generate').input.selection)).toBe('目录展开时正文保持原位。')
    expect(await page.evaluate(()=>window.noteTasks.map(row=>row.phase))).toEqual(dark&&width===900?['preparing','generating','replied','preparing','generating','ready','accepted']:['preparing','generating','ready','accepted']);expect(errors).toEqual([])
  } finally { await context.close() }
},15000)

it('keeps a visible suggestion and protects new text when its selected paragraph is deleted during generation',async()=>{
 const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage();try{
  await page.route('http://127.0.0.1/notes-outline-fixture',route=>route.fulfill({contentType:'text/html',body:'<body><section class="en-root" style="left:10px;right:340px"><div class="en-editor-host"></div></section><aside style="position:fixed;right:10px;bottom:20px;width:320px"><textarea id="native-input"></textarea><button id="native-command">命令测试接口</button><button id="native-send">发送测试接口</button></aside></body>'}));await page.goto('http://127.0.0.1/notes-outline-fixture');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor();
  await page.evaluate(()=>{const editor=document.querySelector('.en-document .bn-editor'),data=new DataTransfer();data.setData('text/html','<p>待改写的旧段落，原文包含较长的说明与多个细节，需要保持原意并优化表达。</p><p>原来的下方段落。</p>');editor.focus();editor.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))});await page.getByText('待改写的旧段落，原文包含较长的说明与多个细节，需要保持原意并优化表达。',{exact:true}).waitFor();
  await page.evaluate(()=>{const paragraph=[...document.querySelectorAll('.en-document .bn-inline-content')].find(el=>el.textContent==='待改写的旧段落，原文包含较长的说明与多个细节，需要保持原意并优化表达。');document.querySelector('.en-document .bn-editor').focus();const range=document.createRange();range.selectNodeContents(paragraph);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));paragraph.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))});await page.getByRole('button',{name:/AI 改写/}).click();await page.locator('#native-send').click();await page.locator('.en-inline-assistant .en-ai-loading').waitFor();
  await page.evaluate(()=>{const editor=document.querySelector('.en-document .bn-editor');editor.focus();const range=document.createRange();range.selectNodeContents(editor);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));editor.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));const data=new DataTransfer();data.setData('text/html','<p>编辑期间的新正文。</p>');editor.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))});await page.getByText('编辑期间的新正文。',{exact:true}).waitFor();await page.locator('.en-composer-area .en-ai-loading').waitFor();
  await page.evaluate(()=>window.resolveNoteSuggestion());await page.locator('.en-composer-area .en-preview').waitFor();expect(await page.getByRole('button',{name:'替换所选',exact:true}).count()).toBe(0);expect(await page.getByText('编辑期间的新正文。',{exact:true}).count()).toBe(1);
  const resize=page.getByRole('separator',{name:'调整建议面板高度'}),initialHeight=await page.locator('.en-preview-content').evaluate(el=>el.clientHeight);await resize.focus();await page.keyboard.press('ArrowUp');expect(await page.locator('.en-preview-content').evaluate(el=>el.clientHeight)).toBe(initialHeight+32);const handle=await resize.boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+10);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2,handle.y-50);await page.mouse.up();expect(await page.locator('.en-preview-content').evaluate(el=>el.clientHeight)).toBe(initialHeight+92);
  await page.getByRole('button',{name:'重新撰写',exact:true}).click();await page.locator('.en-composer-area .en-ai-loading').waitFor();await page.evaluate(()=>window.resolveNoteSuggestion());await page.locator('.en-composer-area .en-preview').waitFor();expect(await page.getByRole('button',{name:'替换所选',exact:true}).count()).toBe(0);await page.getByRole('button',{name:'插入到下方',exact:true}).click();await page.locator('.en-document').getByText('改写后的验收句子。',{exact:true}).waitFor();expect(await page.getByText('编辑期间的新正文。',{exact:true}).count()).toBe(1);expect(await page.locator('.en-preview').count()).toBe(0);expect(await page.getByText(/正文已变化/).count()).toBe(0)
 }finally{await context.close()}
},15000)

for(const dark of [false,true])it(`pastes the complete research card and keeps its canonical theme (${dark?'dark':'light'})`,async()=>{
 const {buildResearchHtmlPreview}=await import('../packages/dsh-research-task-runtime/html-artifact.js')
 const context=await browser.newContext({viewport:{width:1250,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.route('http://127.0.0.1/notes-outline-fixture',route=>route.fulfill({contentType:'text/html',body:`<body ${dark?'data-ds-dark-theme':''}><section class="en-root" data-dark="${dark}" style="left:10px;right:340px"><div class="en-editor-host"></div></section><aside style="position:fixed;right:10px;bottom:20px;width:320px"><textarea id="native-input"></textarea><button id="native-command"></button><button id="native-send"></button></aside></body>`}));await page.goto('http://127.0.0.1/notes-outline-fixture');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor()
  const html='<html><head><style>body{color:var(--sherlock-text);background:var(--sherlock-surface)}.up{color:#00bc65}.down{color:#f35c67}</style></head><body><p class="up">上涨 12</p><p class="down">下跌 -3</p><details open><summary>完整数据</summary><table><tr><td>一月</td><td>12</td></tr></table></details></body></html>'
  await page.evaluate(({html,documentHTML})=>{window.noteComponent={id:'copied',kind:'generated-container',title:'原始样式组件',containerSpec:{version:1,type:'html',title:'原始样式组件',html},sourceText:'未绑定数据源 · 未刷新'};window.noteComponentDocument=documentHTML;const editor=document.querySelector('.en-document .bn-editor'),data=new DataTransfer();data.setData('text/html','<meta name="sherlock-research-clipboard" content="native"><p>忽略这个普通粘贴退化内容</p>');editor.focus();editor.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))},{html,documentHTML:buildResearchHtmlPreview(html,'原始样式组件',dark?'dark':'light',{workbench:true})})
  try{await page.locator('.en-research-header').getByText('原始样式组件',{exact:true}).waitFor({timeout:2500})}catch(error){throw Error(JSON.stringify({errors,requests:await page.evaluate(()=>window.noteRequests.map(r=>r.method)),body:await page.locator('body').textContent()}))};expect(await page.locator('.en-source').count()).toBe(0);expect(await page.locator('.en-research').evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('1px')
  const frame=page.frameLocator('iframe[title="原始样式组件"]').frameLocator('#preview');try{await frame.getByText('上涨 12',{exact:true}).waitFor({timeout:2500})}catch(error){throw Error(JSON.stringify({errors,frames:await Promise.all(page.frames().map(f=>f.locator('body').innerText().then(s=>s.slice(0,400)).catch(()=>'')))}))};expect(await frame.getByText('上涨 12',{exact:true}).evaluate(el=>getComputedStyle(el).color)).toBe(dark?'rgb(0, 200, 74)':'rgb(0, 168, 62)');expect(await frame.getByText('下跌 -3',{exact:true}).evaluate(el=>getComputedStyle(el).color)).toBe(dark?'rgb(238, 89, 98)':'rgb(223, 79, 87)');expect(await frame.getByText('一月',{exact:true}).count()).toBe(1);expect(await page.getByText('忽略这个普通粘贴退化内容',{exact:true}).count()).toBe(0);await expect.poll(()=>page.locator('iframe[title="原始样式组件"]').evaluate(el=>el.clientHeight)).toBeLessThan(300)
  await page.evaluate(()=>{const editor=document.querySelector('.en-document .bn-editor'),data=new DataTransfer(),range=document.createRange();editor.focus();range.selectNodeContents(editor);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);data.setData('text/html',Array.from({length:25},(_,i)=>'<p>后续正文 '+i+'</p>').join(''));editor.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));document.querySelector('.en-document-scroll').scrollTo(0,0)})
  const shield=page.getByRole('button',{name:'选中组件并操作内容',exact:true});await shield.scrollIntoViewIfNeeded();const box=await shield.boundingBox(),before=await page.locator('.en-document-scroll').evaluate(el=>el.scrollTop);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,before>0?-100:100);await expect.poll(async()=>Math.abs((await page.locator('.en-document-scroll').evaluate(el=>el.scrollTop))-before)).toBeGreaterThan(5)
  await shield.click();expect(await page.locator('.en-research [data-selected=true]').count()).toBe(0);expect(await page.locator('.en-research[data-selected=true]').count()).toBe(1);expect(await shield.count()).toBe(0)
  await page.evaluate(()=>{const editor=window.noteEditor;let position;editor._tiptapEditor.state.doc.descendants((node,pos)=>{if(node.type.name==='research')position=pos});editor._tiptapEditor.commands.setNodeSelection(position)});await expect.poll(()=>page.getByRole('button',{name:'AI 改写',exact:true}).count()).toBe(0);await page.locator('.en-title').click();await shield.waitFor();const renderCount=await page.evaluate(()=>window.noteRequests.filter(row=>row.method==='render').length);await page.getByRole('button',{name:'刷新组件',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.noteRequests.filter(row=>row.method==='render').length)).toBe(renderCount+1);await frame.getByText('上涨 12',{exact:true}).waitFor();expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('opens the component library second level, inserts at the slash paragraph, persists native changes and survives reopen',async()=>{
 const {context,page}=await fileFixture();let saved
 try{
  const latest=()=>page.evaluate(()=>window.noteRequests.filter(row=>row.method==='menu-sync').at(-1)?.input)
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.locator('.en-document .bn-editor').click();await page.keyboard.type('前文');await page.keyboard.press('Enter');await page.keyboard.type('/组件库')
  await expect.poll(async()=> (await latest())?.items.map(item=>item.title)).toEqual(['组件库'])
  const menu=await latest();expect(menu.items[0].children.map(item=>item.title)).toEqual(['自选股','个股行情','市场指数','新闻列表','公告列表','日历','我的研究总结'])
  await page.keyboard.press('ArrowRight');await expect.poll(async()=> (await latest())?.submenu?.selectedIndex).toBe(0)
  await page.keyboard.press('ArrowDown');await expect.poll(async()=> (await latest())?.submenu?.selectedIndex).toBe(1)
  await page.keyboard.press('ArrowLeft');await expect.poll(async()=> (await latest())?.submenu).toBeUndefined()
  await page.keyboard.press('Enter');await expect.poll(async()=> (await latest())?.submenu?.selectedIndex).toBe(0)
  await page.keyboard.press('Enter');await page.locator('.en-native-component-host [data-financial-widget="watchlist"]').waitFor();expect(await page.locator('.en-native-component-title > strong').first().evaluate(el=>getComputedStyle(el).display)).toBe('none')
  expect(await page.locator('.en-document .bn-inline-content').first().textContent()).toBe('前文')
  expect(await page.locator('.en-document .bn-editor').textContent()).not.toContain('/组件库')
  await page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click();await page.getByRole('button',{name:'添加验收自选股',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.noteEditor.document.some(block=>block.type==='research'&&JSON.parse(block.props.payload).containerSpec.symbols?.[0]?.code==='600519'))).toBe(true)
  await expect.poll(()=>page.evaluate(()=>window.noteRequests.filter(row=>row.method==='save').at(-1)?.input.content.blocks.some(block=>block.type==='research'&&JSON.parse(block.props.payload).containerSpec.symbols?.[0]?.code==='600519'))).toBe(true)
  saved=await page.evaluate(()=>({...window.noteRequests.filter(row=>row.method==='save').at(-1).input.content,revision:1,updatedAt:1}))
  expect(errors).toEqual([])
 }finally{await context.close()}
 const reopened=await fileFixture(saved);try{await reopened.page.locator('.en-native-component-host [data-financial-widget="watchlist"]').waitFor();expect(await reopened.page.evaluate(()=>JSON.parse(window.noteEditor.document.find(block=>block.type==='research').props.payload).containerSpec.symbols[0].code)).toBe('600519')}finally{await reopened.context.close()}
},15000)
it('handles a current native child click and a renamed custom library entry without accepting stale clicks',async()=>{
 const {context,page}=await fileFixture();try{
  await page.evaluate(()=>window.customLibraryName='重命名的研究总结');await page.locator('.en-document .bn-editor').click();await page.keyboard.type('/组件库')
  const latest=()=>page.evaluate(()=>window.noteRequests.filter(row=>row.method==='menu-sync').at(-1)?.input)
  await expect.poll(async()=> (await latest())?.items[0]?.children?.at(-1)?.title).toBe('重命名的研究总结')
  const first=await latest();await page.evaluate(input=>document.dispatchEvent(new CustomEvent('sherlock:notes-menu-event',{detail:{...input,action:'open',itemId:input.items[0].id}})),first)
  await expect.poll(async()=> Boolean((await latest())?.submenu)).toBe(true);const child=await latest()
  await page.evaluate(input=>document.dispatchEvent(new CustomEvent('sherlock:notes-menu-event',{detail:{...input,action:'select',parentId:input.items[0].id,itemId:input.items[0].children.at(-1).id,revision:input.revision-1}})),child)
  expect(await page.locator('.en-native-component').count()).toBe(0)
  await page.evaluate(input=>document.dispatchEvent(new CustomEvent('sherlock:notes-menu-event',{detail:{...input,action:'select',parentId:input.items[0].id,itemId:input.items[0].children.at(-1).id}})),child)
  await page.locator('.en-native-component-host').getByText('原始研究内容',{exact:true}).waitFor()
  await page.locator('.en-document .bn-editor').focus();await page.keyboard.press('ControlOrMeta+z');await expect.poll(()=>page.locator('.en-native-component').count()).toBe(0)
  await page.keyboard.press('ControlOrMeta+Shift+z');await page.locator('.en-native-component-host').getByText('原始研究内容',{exact:true}).waitFor()
 }finally{await context.close()}
},15000)

it('shows every slash command without internal scrolling, including the last component-library option',async()=>{
 const context=await browser.newContext(),page=await context.newPage();try{
  const icons=['paragraph','heading','heading_2','heading_3','heading_4','numbered_list','bullet_list','check_list','code_block','quote','divider','toggle_list','table','image','video','audio','file','toggle_heading','toggle_heading_2','toggle_heading_3','heading_5','heading_6','emoji','library']
  const state={sessionId:'s',menuId:'m',revision:1,dark:false,selectedIndex:0,anchor:{x:0,y:0,width:0,height:20},items:icons.map(icon=>({id:icon,title:icon,icon,subtext:'',group:'',badge:''}))}
  await page.setContent(noteMenuDocumentHtml)
  for(const height of [800,400]){
   const result=noteMenuPresentation(state,'ticket',{height:height-48,width:900-48})
   await page.setViewportSize({width:result.width,height:result.height});await page.evaluate(html=>document.querySelector('main').innerHTML=html,result.html)
   expect(result.height).toBeLessThanOrEqual(height)
   expect(await page.locator('[role=option]').evaluateAll(items=>items.every(el=>{const a=el.getBoundingClientRect(),menu=el.closest('.menu').getBoundingClientRect();return a.width>0&&a.height>=28&&a.top>=menu.top&&a.bottom<=menu.bottom&&a.right<=menu.right&&a.left>=menu.left}))).toBe(true)
   expect(await page.locator('.menu>[role=listbox]').evaluate(el=>({scrolls:el.scrollHeight>el.clientHeight,overflow:getComputedStyle(el).overflowY}))).toEqual({scrolls:false,overflow:'hidden'})
  }
 }finally{await context.close()}
},15000)

it('renders every native second-level option without scrolling in both themes and on a short screen',async()=>{
 const context=await browser.newContext({viewport:{width:576,height:340}}),page=await context.newPage();try{
  const {componentLibraryBuiltins}=await import('../packages/dsh-research-task-runtime/component-library-catalog.js')
  const children=componentLibraryBuiltins().map(item=>({id:item.id,title:item.name,icon:item.widget,subtext:'',group:'内置组件',badge:''})),state={sessionId:'s',menuId:'m',revision:1,dark:true,selectedIndex:0,anchor:{x:0,y:0,width:0,height:20},items:[{id:'library',title:'组件库',icon:'library',subtext:'',group:'',badge:'',children}],submenu:{parentId:'library',selectedIndex:0}}
  await page.route('http://127.0.0.1/native-menu-fixture',route=>route.fulfill({contentType:'text/html',body:noteMenuDocumentHtml}));await page.goto('http://127.0.0.1/native-menu-fixture')
  const result=noteMenuPresentation(state,'ticket');await page.evaluate(html=>document.querySelector('main').innerHTML=html,result.html)
  expect(await page.locator('footer').count()).toBe(0)
  for(const dark of [true,false]){
   await page.evaluate(dark=>document.body.className=dark?'dark':'',dark)
   expect(await page.locator('.child-menu a[role=option]').count()).toBe(6);expect(await page.locator('.child-menu>[role=listbox]').evaluate(el=>({scrolls:el.scrollHeight>el.clientHeight,overflow:getComputedStyle(el).overflowY}))).toEqual({scrolls:false,overflow:'hidden'})
   expect(await page.locator('.child-menu').evaluate(el=>{const a=el.getBoundingClientRect(),last=el.querySelector('a[aria-label="日历"]').getBoundingClientRect();return {bottomGap:a.bottom-last.bottom,fits:a.right<=innerWidth}})).toEqual({bottomGap:7,fits:true})
   expect(await page.locator('.root-menu').evaluate(el=>el.getBoundingClientRect().bottom-el.querySelector('a[role=option]').getBoundingClientRect().bottom)).toBe(7)
  }
  const compact=noteMenuPresentation(state,'ticket',{height:152,width:528});await page.setViewportSize({width:compact.width,height:compact.height});await page.evaluate(html=>document.querySelector('main').innerHTML=html,compact.html)
  expect(compact.height).toBeLessThanOrEqual(200)
  expect(await page.locator('.child-menu a[role=option]').evaluateAll(items=>items.every(el=>{const a=el.getBoundingClientRect(),menu=el.closest('.menu').getBoundingClientRect();return a.top>=menu.top&&a.bottom<=menu.bottom&&a.left>=menu.left&&a.right<=menu.right}))).toBe(true)
  expect(await page.locator('.child-menu>[role=listbox]').evaluate(el=>({scrolls:el.scrollHeight>el.clientHeight,overflow:getComputedStyle(el).overflowY}))).toEqual({scrolls:false,overflow:'hidden'})
 }finally{await context.close()}
},15000)
