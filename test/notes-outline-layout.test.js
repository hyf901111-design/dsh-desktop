import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

let browser, script, css
beforeAll(async () => {
  const output = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';import {createPortal} from 'react-dom';import {EWorkNoteExportMenu} from './scripts/lib/notes-export-menu.mjs';window.react_dom={createPortal};
      import {NotesApp} from './src/preload/notes/editor';
      import {createNotesActivityStore,EWorkNotesActivity} from './scripts/lib/notes-activity.mjs';
      window.react=React;window.eworkNotesActivity=createNotesActivityStore(document);const header=document.createElement('header');header.style.cssText='position:fixed;top:4px;left:360px;z-index:100';document.body.append(header);createRoot(header).render(<EWorkNoteExportMenu sessionId="outline-test"/>);
      import '@blocknote/mantine/style.css'; import './src/preload/notes/style.css';
      window.noteRequests=[];window.noteTasks=[];window.noteCommits=[];document.addEventListener('sherlock:notes-task-state',event=>window.noteTasks.push(event.detail));document.addEventListener('sherlock:notes-composer-commit',event=>window.noteCommits.push(event.detail));
      const bridge={request:async(method,input)=>{window.noteRequests.push({method,input});return method==='load'?{saved:{title:'浮层位置验收',blocks:[],yjs:'',revision:0,updatedAt:0}}:method==='save'?{status:'saved',saved:{...input.content,revision:input.revision+1}}:method==='clipboard'?{kind:'components',nodes:[window.noteComponent]}:method==='render'?{html:input.spec.html,document:window.noteComponentDocument}:method==='generate'?await new Promise(resolve=>{window.resolveNoteSuggestion=result=>resolve(result||{kind:'text',markdown:'改写后的验收句子。'})}):{}},draft:async()=>{}};
      const activity=document.createElement('div');activity.id='native-activity';document.body.append(activity);createRoot(activity).render(<EWorkNotesActivity sessionId="outline-test" t={key=>key} UserBubble={({content})=><div>{content.map(b=>b.text)}</div>} Progress={({entry})=><div role="status">{entry.noteTask.status}</div>} Markdown={({blocks})=><div>{blocks.map(b=>b.text)}</div>}/>);
      const root=document.querySelector('.en-editor-host');
      createRoot(root).render(<NotesApp sessionId="outline-test" bridge={bridge} dark={document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>{}}/>);
      document.addEventListener('sherlock:notes-composer-draft',e=>{const input=document.querySelector('#native-input');input.value=e.detail.text;if(e.detail.focus)input.focus({preventScroll:true})});
      document.querySelector('#native-command').onclick=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-command',{detail:{sessionId:'outline-test'}}));
      document.querySelector('#native-send').onclick=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'outline-test',prompt:document.querySelector('#native-input').value,images:[]}}));
    ` },
    bundle: true, platform: 'browser', conditions: ['browser', 'import', 'style'], format: 'iife', write: false, outfile: 'fixture.js',
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.svg': 'dataurl' },
    plugins: [{ name: 'notes-inline-svg', setup(b) {
      b.onResolve({ filter: /\.svg\?inline$/ }, a => ({ path: resolve(a.resolveDir, a.path.slice(0, -7)), namespace: 'svg' }))
      b.onLoad({ filter: /.*/, namespace: 'svg' }, async a => ({ contents: 'export default ' + JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(await readFile(a.path)).toString('base64')), loader: 'js' }))
    } }]
  })
  script = output.outputFiles.find(f => f.path.endsWith('.js')).text
  css = output.outputFiles.find(f => f.path.endsWith('.css')).text + (await readFile('src/preload/figma-refinements.css','utf8')).split('\n').filter(line=>line.includes('.en-export-menu')||line.includes('.en-header-export')).join('\n')
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(runtime).href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => { await browser?.close() })

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
    await page.keyboard.press('Enter');await page.keyboard.type('/');await expect.poll(()=>page.locator('.bn-suggestion-menu').isVisible()).toBe(true);await page.keyboard.press('Escape');await page.keyboard.press('Backspace')
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
  try{await page.locator('.en-research-header').getByText('原始样式组件',{exact:true}).waitFor({timeout:2500})}catch(error){throw Error(JSON.stringify({errors,requests:await page.evaluate(()=>window.noteRequests.map(r=>r.method)),body:await page.locator('body').textContent()}))};expect(await page.locator('.en-source').textContent()).toContain('未绑定数据源');expect(await page.locator('.en-research').evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('1px')
  const frame=page.frameLocator('iframe[title="原始样式组件"]').frameLocator('#preview');try{await frame.getByText('上涨 12',{exact:true}).waitFor({timeout:2500})}catch(error){throw Error(JSON.stringify({errors,frames:await Promise.all(page.frames().map(f=>f.locator('body').innerText().then(s=>s.slice(0,400)).catch(()=>'')))}))};expect(await frame.getByText('上涨 12',{exact:true}).evaluate(el=>getComputedStyle(el).color)).toBe(dark?'rgb(0, 200, 74)':'rgb(0, 168, 62)');expect(await frame.getByText('下跌 -3',{exact:true}).evaluate(el=>getComputedStyle(el).color)).toBe(dark?'rgb(238, 89, 98)':'rgb(223, 79, 87)');expect(await frame.getByText('一月',{exact:true}).count()).toBe(1);expect(await page.getByText('忽略这个普通粘贴退化内容',{exact:true}).count()).toBe(0);await expect.poll(()=>page.locator('iframe[title="原始样式组件"]').evaluate(el=>el.clientHeight)).toBeLessThan(300);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
