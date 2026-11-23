import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {esbuildRawSource} from './helpers/esbuild-raw-source.mjs'
let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {NotesApp,noteBlocksFromFile} from './src/preload/notes/editor';window.noteBlocksFromFile=noteBlocksFromFile;import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
 window.noteRequests=[];window.noteComponentViews=[];document.addEventListener('sherlock:notes-component-view',e=>window.noteComponentViews.push(e.detail));window.noteTaskRows=[];document.addEventListener('sherlock:notes-task-state',e=>window.noteTaskRows.push(e.detail));window.pickedFiles=[{name:'picked.png',path:'/synthetic/picked.png'}];window.savedNote=null;
 const bridge={request:async(method,input)=>{window.noteRequests.push({method,input});if(method==='load')return {saved:window.savedNote||{title:'斜杠插入验收',blocks:[{id:'before',type:'paragraph',content:'保留前文'},{id:'anchor',type:'paragraph'},{id:'after',type:'paragraph',content:'保留后文'}],yjs:'',revision:0}};if(method==='library-list')return [];if(method==='document-import')return new Promise(resolve=>window.finishDocumentImport=resolve);if(method==='file-pick')return new Promise(resolve=>window.finishPick=()=>resolve({files:window.pickedFiles}));if(method==='file-admit')return {...input,id:input.nodeId,source:'computer',authorizationId:'grant'};if(method==='file-bind')return {previewSessionId:'synthetic'};if(method==='generate')return new Promise((resolve,reject)=>{window.finishGenerate=resolve;window.failGenerate=()=>reject(Error('合成生成失败'))});if(method==='save'){window.savedNote={...input.content,revision:input.revision+1};return {status:'saved',saved:window.savedNote}};return {}},draft:async()=>{}};
 const root=createRoot(document.querySelector('#notes'));window.remount=()=>root.render(<NotesApp key={Date.now()} sessionId="slash-insert" bridge={bridge} dark={document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>{}}/>);window.remount();
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},alias:{react:resolve('node_modules/react'),'react-dom':resolve('node_modules/react-dom')},plugins:[esbuildRawSource(),{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;css=output.outputFiles.find(f=>f.path.endsWith('.css')).text
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(dark=false){
 const context=await browser.newContext({viewport:{width:1100,height:850}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(2500);page.on('pageerror',e=>errors.push(e.stack??e.message))
 await page.route('http://127.0.0.1/slash-insert',route=>route.fulfill({contentType:'text/html',body:`<body ${dark?'data-ds-dark-theme':''}><section id="notes" class="en-root" data-dark="${dark}" style="position:fixed;inset:0"><div class="en-editor-host"></div></section></body>`}));await page.goto('http://127.0.0.1/slash-insert');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor().catch(async error=>{await context.close();throw Error(errors.join('\n')+'\n'+error.message)});await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'before',type:'paragraph',content:'保留前文'},{id:'anchor',type:'paragraph'},{id:'after',type:'paragraph',content:'保留后文'}]));return {context,page,errors}
}
async function slash(page,title){
 await page.locator('[data-id="anchor"] .bn-inline-content').click();await page.keyboard.type('/')
 await expect.poll(()=>page.evaluate(title=>window.noteRequests.filter(v=>v.method==='menu-sync').at(-1)?.input.items.some(item=>item.title===title),title)).toBe(true)
 await page.evaluate(title=>{const s=window.noteRequests.filter(v=>v.method==='menu-sync').at(-1).input,item=s.items.find(i=>i.title===title);document.dispatchEvent(new CustomEvent('sherlock:notes-menu-event',{detail:{sessionId:s.sessionId,menuId:s.menuId,revision:s.revision,action:'select',itemId:item.id}}))},title)
}
it('places smart and link creation after files and before collapsible headings in the real slash menu',async()=>{
 const {context,page,errors}=await fixture();try{
  await page.locator('[data-id="anchor"] .bn-inline-content').click();await page.keyboard.type('/')
  const keys=['file','smart_component','link_component','toggle_heading'],indices=()=>page.evaluate(keys=>{const items=window.noteRequests.filter(v=>v.method==='menu-sync').at(-1)?.input.items||[];return keys.map(key=>items.findIndex(item=>item.id.startsWith(key+'-')))},keys)
  await expect.poll(async()=>(await indices()).every(index=>index>=0)).toBe(true)
  const positions=await indices();expect(positions).toEqual([...positions].sort((a,b)=>a-b));expect(new Set(positions).size).toBe(4);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
for(const [title,kind] of [['图片','image'],['视频','video'],['音频','audio'],['文件','file']])it(`opens ${kind} picker and imports selected files at the captured slash position`,async()=>{
 const {context,page,errors}=await fixture();try{
  await slash(page,title);await expect.poll(()=>page.evaluate(()=>window.noteRequests.find(v=>v.method==='file-pick')?.input.kind)).toBe(kind)
  expect(await page.evaluate(()=>window.noteEditor.document.some(b=>b.type==='image'||b.type==='file'))).toBe(false)
  await page.evaluate(()=>{window.pickedFiles=[{name:'one.pdf',path:'/synthetic/one.pdf'},{name:'two.pdf',path:'/synthetic/two.pdf'}];window.noteEditor.setTextCursorPosition('after','end');window.finishPick()})
  await page.locator('.en-note-file').nth(1).waitFor();const blocks=await page.evaluate(()=>window.noteEditor.document)
  expect(blocks.map(b=>b.id).indexOf('before')).toBeLessThan(blocks.findIndex(b=>b.type==='attachment'));expect(blocks.findLastIndex(b=>b.type==='attachment')).toBeLessThan(blocks.findIndex(b=>b.id==='after'))
  expect(blocks.filter(b=>b.type==='attachment').map(b=>JSON.parse(b.props.payload).name)).toEqual(['one.pdf','two.pdf']);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('drops a knowledge panel row at the chosen paragraph and consumes it before the composer',async()=>{
 const {context,page}=await fixture()
 try{
  await page.evaluate(()=>{
   document.querySelector('#notes').style.right='220px'
   const panel=document.createElement('aside');panel.id='odyssey-right-workspace-panel';panel.style.cssText='position:fixed;right:10px;bottom:20px';document.body.append(panel)
   const toggle=document.createElement('div');toggle.dataset.enViewModeHost='slash-insert';panel.append(toggle)
   const host=document.createElement('div');host.dataset.knowledgePanelHost='';host.dataset.knowledgePanelSession='slash-insert';panel.prepend(host)
   const row=document.createElement('div');row.draggable=true;row.dataset.knowledgeFileId='30dfbe26-b39f-4573-9b24-24a46d2f82d6';row.textContent='研究记录.md';host.append(row)
   row.addEventListener('dragstart',event=>{event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('application/x-ework-knowledge-file',JSON.stringify({id:row.dataset.knowledgeFileId,label:row.textContent}))})
   window.composerDrops=0;document.addEventListener('drop',()=>window.composerDrops++)
  })
  const row=page.locator('[data-knowledge-file-id]')
  await row.dragTo(page.locator('[data-id="after"] .bn-inline-content'),{targetPosition:{x:12,y:1}})
  const requests=await page.evaluate(()=>window.noteRequests.filter(row=>row.method==='file-admit'))
  expect(requests).toHaveLength(1)
  expect(requests[0].input).toMatchObject({knowledgeFileId:'30dfbe26-b39f-4573-9b24-24a46d2f82d6',name:'研究记录.md',sessionId:'slash-insert'})
  expect(requests[0].input).not.toHaveProperty('path')
  expect(await page.evaluate(()=>window.noteEditor.document.map(block=>block.id))).toEqual(['before','anchor',requests[0].input.nodeId,'after'])
  expect(await page.evaluate(()=>window.composerDrops)).toBe(0)
  await expect.poll(()=>page.evaluate(()=>JSON.parse(window.noteEditor.document[2].props.payload).authorizationId)).toBe('grant')
  await expect.poll(()=>page.evaluate(()=>window.savedNote?.blocks[2]?.type)).toBe('attachment')
  await page.locator('.en-header-view-mode').click()
  await expect.poll(()=>page.evaluate(()=>window.noteEditor.isEditable)).toBe(false)
  await row.dragTo(page.locator('[data-id="before"] .bn-inline-content'))
  expect(await page.evaluate(()=>window.noteRequests.filter(row=>row.method==='file-admit').length)).toBe(1)
 }finally{await context.close()}
},15000)

it('canceling the picker leaves the slash paragraph and surrounding text editable',async()=>{
 const {context,page}=await fixture();try{await slash(page,'文件');await expect.poll(()=>page.evaluate(()=>typeof window.finishPick)).toBe('function');await page.evaluate(()=>{window.pickedFiles=[];window.finishPick()});expect(await page.locator('.en-note-file').count()).toBe(0);expect(await page.evaluate(()=>window.noteEditor.getBlock('before').content[0].text)).toBe('保留前文');expect(await page.locator('.en-root [role=alert]').count()).toBe(0)}finally{await context.close()}
},15000)
it('converts a file opened in Notes to editable blocks with heading and list structure',async()=>{
 const {context,page}=await fixture()
 try {
  const blocks=await page.evaluate(()=>window.noteBlocksFromFile({format:'markdown',text:'# 报告\n\n- 项目一\n- 项目二'}))
  expect(blocks.map(block=>block.type)).toEqual(['heading','bulletListItem','bulletListItem'])
  expect(blocks[2].content[0].text).toBe('项目二')
  expect(blocks.every(block=>block.id)).toBe(true)
 }finally{await context.close()}
},15000)
it.each(['斜杠','顶栏'])('imports Markdown through %s as editable note blocks and preserves them on reopen',async(entry)=>{
 const {context,page,errors}=await fixture();try{
  if(entry==='斜杠')await slash(page,'导入文档')
  else await page.evaluate(()=>{window.noteEditor.setTextCursorPosition('anchor','start');document.dispatchEvent(new CustomEvent('sherlock:notes-import',{detail:{sessionId:'slash-insert'}}))})
  await expect.poll(()=>page.evaluate(()=>typeof window.finishDocumentImport)).toBe('function')
  await page.getByText('正在导入文档…',{exact:true}).waitFor()
  await page.evaluate(()=>{window.noteEditor.setTextCursorPosition('after','end');window.finishDocumentImport({format:'markdown',text:'## 导入标题\n\n正文内容'})})
  await page.getByRole('heading',{name:'导入标题',exact:true}).waitFor()
  expect(await page.evaluate(()=>window.noteEditor.document.map(block=>[block.type,block.content?.[0]?.text]))).toEqual([
   ['paragraph','保留前文'],['heading','导入标题'],['paragraph','正文内容'],['paragraph','保留后文']
  ])
  expect(await page.getByText('正文内容',{exact:true}).evaluate(node=>node.closest('[contenteditable=true]')!==null)).toBe(true)
  await page.evaluate(()=>{
   const editor=window.noteEditor,block=editor.document.find(block=>block.content?.[0]?.text==='正文内容')
   editor.setTextCursorPosition(block.id,'end');editor.insertInlineContent('，已编辑')
  })
  await page.getByText('正文内容，已编辑',{exact:true}).waitFor()
  await expect.poll(()=>page.evaluate(()=>window.savedNote?.blocks.some(block=>block.content?.[0]?.text==='正文内容，已编辑')),{timeout:5000}).toBe(true)
  await page.evaluate(()=>window.remount());await page.getByText('正文内容，已编辑',{exact:true}).waitFor()
  expect(await page.locator('.en-note-file').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
for(const dark of [false,true])it(`creates a full-width smart draft and replaces only that block after generation (${dark?'dark':'light'})`,async()=>{
 const {context,page,errors}=await fixture(dark);try{
  await slash(page,'智能组件');const input=page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true});await input.waitFor();const draft=page.locator('[data-note-creation-draft="smart"]'),box=await draft.boundingBox(),anchor=await page.locator('[data-id="anchor"] .bn-block-content').boundingBox();expect(Math.abs(box.x-anchor.x)).toBeLessThan(2);expect(Math.abs(box.width-anchor.width)).toBeLessThan(2)
  await input.fill('两个月收入对比');await page.getByRole('button',{name:'创建',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.noteRequests.find(v=>v.method==='generate')?.input.mode)).toBe('component')
  const id=await page.evaluate(()=>window.noteEditor.document.find(b=>b.type==='research').id);await page.evaluate(()=>window.finishGenerate({kind:'component',node:{id:'generated-id',title:'月收入',kind:'generated-container',containerSpec:{version:1,type:'table',title:'月收入',columns:['月','收入'],rows:[['一月',10],['二月',20]]}}}))
  await expect.poll(()=>page.evaluate(()=>JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload).containerSpec?.title)).toBe('月收入');const result=await page.evaluate(()=>window.noteEditor.document.filter(b=>b.type==='research'));expect(result).toHaveLength(1);expect(result[0].id).toBe(id);expect(JSON.parse(result[0].props.payload).noteDraft).toBeUndefined();expect(await page.locator('.bn-block-outer[data-id="after"]').textContent()).toBe('保留后文');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('keeps the failed smart draft and its requirement for an in-place retry',async()=>{
 const {context,page}=await fixture();try{await slash(page,'智能组件');await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).fill('模拟趋势图');await page.getByRole('button',{name:'创建',exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof window.failGenerate)).toBe('function');await page.evaluate(()=>window.failGenerate());await expect.poll(()=>page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).inputValue()).toBe('模拟趋势图');expect(await page.locator('[data-note-creation-draft="smart"]').count()).toBe(1)}finally{await context.close()}
},15000)
it('validates a link and loads it in the same note block without invoking AI',async()=>{
 const {context,page,errors}=await fixture();try{
  await slash(page,'链接');const input=page.getByRole('textbox',{name:'输入链接',exact:true});await input.fill('javascript:alert(1)');await page.getByRole('button',{name:'添加链接',exact:true}).click();expect(await page.locator('[data-note-creation-draft="link"] [role=alert]').textContent()).toContain('有效');expect(await page.evaluate(()=>window.noteRequests.some(v=>v.method==='generate'))).toBe(false)
  const id=await page.evaluate(()=>window.noteEditor.document.find(b=>b.type==='research').id);await input.fill('https://EXAMPLE.com/path');await page.getByRole('button',{name:'添加链接',exact:true}).click();await expect.poll(()=>page.evaluate(()=>JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload).url)).toBe('https://example.com/path');expect(await page.evaluate(()=>window.noteEditor.document.filter(b=>b.type==='research').map(b=>b.id))).toEqual([id]);expect(await page.evaluate(()=>window.noteRequests.some(v=>v.method==='generate'))).toBe(false);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
for(const [label,address,url] of [
 ['defaults a bare public domain to HTTPS',' baidu.com ','https://baidu.com/'],
 ['completes a public domain with a port and path','example.com:8443/notes?q=test#section','https://example.com:8443/notes?q=test#section'],
 ['preserves an existing HTTPS address','https://example.com/notes?q=test#section','https://example.com/notes?q=test#section'],
 ['matches research for an existing bare localhost address','localhost:3000/notes','https://localhost:3000/notes'],
 ['preserves existing explicit local HTTP validation','http://localhost:3000/notes','http://localhost:3000/notes']
])it(`link draft ${label}`,async()=>{
 const {context,page,errors}=await fixture();try{
  await slash(page,'链接');const input=page.getByRole('textbox',{name:'输入链接',exact:true}),id=await page.evaluate(()=>window.noteEditor.document.find(b=>b.type==='research').id)
  await input.fill(address);await input.press('Enter')
  await expect.poll(()=>page.evaluate(()=>JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload).url)).toBe(url)
  const blocks=await page.evaluate(()=>window.noteEditor.document),links=blocks.filter(b=>b.type==='research');expect(links.map(b=>b.id)).toEqual([id]);expect(JSON.parse(links[0].props.payload)).toMatchObject({kind:'web-link',title:new URL(url).hostname,url,excerpt:url,generationStatus:'completed'});expect(JSON.parse(links[0].props.payload).noteDraft).toBeUndefined()
  expect(blocks.findIndex(b=>b.id==='before')).toBeLessThan(blocks.findIndex(b=>b.id===id));expect(blocks.findIndex(b=>b.id===id)).toBeLessThan(blocks.findIndex(b=>b.id==='after'));expect(await page.evaluate(()=>window.noteRequests.some(v=>v.method==='generate'))).toBe(false);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('keeps unsafe schemes, plain text and credentialed URLs in the editable link draft',async()=>{
 const {context,page,errors}=await fixture();try{
  await slash(page,'链接');const input=page.getByRole('textbox',{name:'输入链接',exact:true}),id=await page.evaluate(()=>window.noteEditor.document.find(b=>b.type==='research').id)
  for(const address of ['javascript:alert(1)','file:///tmp/note.html','普通文字','https://user:password@example.com/notes']){
   await input.fill(address);await page.getByRole('button',{name:'添加链接',exact:true}).click();expect(await page.locator('[data-note-creation-draft="link"] [role=alert]').textContent()).toContain('有效');expect(await input.isEnabled()).toBe(true)
   const blocks=await page.evaluate(()=>window.noteEditor.document.filter(b=>b.type==='research'));expect(blocks.map(b=>b.id)).toEqual([id]);expect(JSON.parse(blocks[0].props.payload).url).toBeUndefined()
  }
  expect(await page.evaluate(()=>window.noteRequests.some(v=>v.method==='generate'))).toBe(false);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('restores an interrupted smart draft as an editable requirement instead of a permanently running frame',async()=>{
 const {context,page}=await fixture();try{
  await page.evaluate(()=>window.noteEditor.insertBlocks([{id:'stale-draft',type:'research',props:{payload:JSON.stringify({id:'note-component-stale',kind:'generated-container',title:'智能组件',noteDraft:'smart',containerPrompt:'上次输入',generationStatus:'running'})}}],'anchor','before'))
  const input=page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true});await input.waitFor();expect(await input.isEnabled()).toBe(true);expect(await input.inputValue()).toBe('上次输入');expect(await page.getByRole('button',{name:'创建',exact:true}).isEnabled()).toBe(true)
 }finally{await context.close()}
},15000)
for(const changed of ['stop','newer'])it(`does not replace a ${changed} smart draft with a late result`,async()=>{
 const {context,page}=await fixture();try{
  await slash(page,'智能组件');await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).fill('待生成内容');await page.getByRole('button',{name:'创建',exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof window.finishGenerate)).toBe('function')
  if(changed==='stop')await page.evaluate(()=>{const view=window.noteComponentViews.filter(value=>value.mode==='generation').at(-1);document.dispatchEvent(new CustomEvent('sherlock:notes-component-action',{detail:{instanceId:view.instanceId,sessionId:'slash-insert',requestId:'stop-card',nodeId:view.node.id,taskId:view.node.generationTaskId,action:'generation-stop'}}))})
  else await page.evaluate(changed=>{const b=window.noteEditor.document.find(b=>b.type==='research'),node=JSON.parse(b.props.payload);window.noteEditor.updateBlock(b.id,{props:{payload:JSON.stringify(changed==='resize'?{...node,noteSize:{height:300}}:{...node,containerPrompt:'较新的需求',generationStatus:'draft'})}})},changed)
  await page.evaluate(()=>window.finishGenerate({kind:'component',node:{id:'late',title:'不应写入的结果',containerSpec:{version:1,type:'table',title:'晚到结果',columns:['值'],rows:[[1]]}}}))
  await expect.poll(()=>page.locator('.en-ai-loading').count()).toBe(0);expect(await page.locator('[data-note-creation-draft="smart"]').count()).toBe(1);expect(await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).inputValue()).toBe(changed==='newer'?'较新的需求':'待生成内容');expect(await page.evaluate(()=>window.noteEditor.document.filter(b=>b.type==='research').length)).toBe(1);expect(await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).isEnabled()).toBe(true)
 }finally{await context.close()}
},15000)

it('shows a model clarification only in the card and preserves the editable smart draft',async()=>{
 const {context,page}=await fixture();try{
  await slash(page,'智能组件');await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).fill('按我的数据做图');await page.getByRole('button',{name:'创建',exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof window.finishGenerate)).toBe('function');await page.evaluate(()=>window.finishGenerate({kind:'conversation',markdown:'请补充月份和收入数据。'}))
  await expect.poll(()=>page.locator('.en-creation-feedback').textContent()).toBe('请补充月份和收入数据。');expect(await page.evaluate(()=>window.noteTaskRows)).toEqual([]);expect(await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).isEnabled()).toBe(true);expect(await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).inputValue()).toBe('按我的数据做图');expect(await page.locator('.en-error').count()).toBe(0)
 }finally{await context.close()}
},15000)

it('uses the shared research generation portal with actual child progress before replacing the same block',async()=>{
 const {context,page,errors}=await fixture();try{
  await slash(page,'智能组件');await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).fill('比特币价格面板');await page.getByRole('button',{name:'创建',exact:true}).click()
  await page.locator('.en-note-generation').waitFor();expect(await page.locator('[data-note-creation-draft="smart"]').count()).toBe(0)
  const original=await page.evaluate(()=>window.noteEditor.document.find(b=>b.type==='research'))
  await page.evaluate(()=>{const request=window.noteRequests.find(v=>v.method==='generate').input;document.dispatchEvent(new CustomEvent('sherlock:notes-generation-progress',{detail:{sessionId:'slash-insert',requestId:request.requestId,stage:'thinking',reasoning:'',outputChars:0,componentTask:{generationTaskId:'note-component-real-task',childSessionId:'actual-child-session',generationStartedAt:Date.now(),phase:'reading',generationEvents:[{type:'tool-started',seq:1,time:Date.now(),tool:'读取数据',detail:'Kraken'}],generationPartialText:'读取实时数据'}}}))})
  await expect.poll(()=>page.evaluate(()=>window.noteComponentViews.filter(v=>v.mode==='generation').at(-1)?.node.generationChildSessionId)).toBe('actual-child-session')
  expect(await page.evaluate(()=>window.noteComponentViews.filter(v=>v.mode==='generation').at(-1).node.generationEvents[0].detail)).toBe('Kraken')
  await page.evaluate(()=>window.finishGenerate({kind:'component',node:{id:'generated',kind:'generated-container',title:'BTC',containerSpec:{version:1,type:'table',title:'BTC',columns:['价格'],rows:[[100]]}}}))
  await expect.poll(()=>page.evaluate(()=>JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload).containerSpec?.title)).toBe('BTC')
  expect(await page.evaluate(()=>window.noteEditor.document.find(b=>b.type==='research').id)).toBe(original.id);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('saves and binds a verified generated recipe then applies refresh only to the note block',async()=>{
 const {context,page,errors}=await fixture();try{
  await slash(page,'智能组件');await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).fill('实时价格');await page.getByRole('button',{name:'创建',exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof window.finishGenerate)).toBe('function')
  await page.evaluate(()=>window.finishGenerate({kind:'component',node:{id:'generated',kind:'generated-container',title:'BTC',containerSpec:{version:1,type:'table',title:'BTC',columns:['价格'],rows:[[100]]}},sourceResult:{status:'verified',refreshStatus:'unbound',recipe:{intervalMinutes:1,requests:[]},sourceNames:['Kraken']}}))
  await expect.poll(()=>page.evaluate(()=>JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload).noteDataBound)).toBe(true)
  const result=await page.evaluate(()=>({node:JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload),methods:window.noteRequests.map(v=>v.method),bind:window.noteRequests.find(v=>v.method==='component-data').input}))
  expect(result.methods.indexOf('save')).toBeLessThan(result.methods.indexOf('component-data'));expect(result.bind.action).toBe('bind-generated');expect(result.bind.nodeId).toBe(result.node.id)
  await page.evaluate(async()=>{const node=JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload),send=(requestId,method,args)=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-data-action',{detail:{requestId,sessionId:'slash-insert',selectedIds:[node.id],expiresAt:Date.now()+10000,method,args}}));send('inspect-note','inspect',{ids:[node.id]});})
  await expect.poll(()=>page.evaluate(()=>window.noteRequests.find(v=>v.method==='component-data-reply'&&v.input.requestId==='inspect-note')?.input.result?.revision?.length)).toBe(64)
  await page.evaluate(()=>{const node=JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload),revision=window.noteRequests.find(v=>v.method==='component-data-reply'&&v.input.requestId==='inspect-note').input.result.revision;document.dispatchEvent(new CustomEvent('sherlock:notes-component-data-action',{detail:{requestId:'apply-note',sessionId:'slash-insert',selectedIds:[node.id],expiresAt:Date.now()+10000,method:'apply',args:{requestId:'refresh-op',revision,changes:[{op:'update',id:node.id,fields:{containerSpec:{...node.containerSpec,rows:[[101]]}}}]}}}))})
  await expect.poll(()=>page.evaluate(()=>JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload).containerSpec.rows[0][0])).toBe(101)
  expect(await page.locator('.bn-block-outer[data-id="before"]').textContent()).toBe('保留前文');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('preserves user resizing during generation while accepting the completed component',async()=>{
 const {context,page}=await fixture();try{
  await slash(page,'智能组件');await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).fill('待生成内容');await page.getByRole('button',{name:'创建',exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof window.finishGenerate)).toBe('function')
  await page.evaluate(()=>{const b=window.noteEditor.document.find(b=>b.type==='research'),node=JSON.parse(b.props.payload);window.noteEditor.updateBlock(b.id,{props:{payload:JSON.stringify({...node,noteSize:{height:300}})}});window.finishGenerate({kind:'component',node:{id:'result',title:'完成内容',kind:'generated-container',containerSpec:{version:1,type:'table',title:'完成内容',columns:['值'],rows:[[1]]}}})})
  await expect.poll(()=>page.evaluate(()=>JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload).containerSpec?.title)).toBe('完成内容');expect(await page.evaluate(()=>JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload).noteSize)).toEqual({height:300})
 }finally{await context.close()}
},15000)
it('stopping an older request preserves a replacement component and ignores its late result',async()=>{
 const {context,page}=await fixture();try{
  await slash(page,'智能组件');await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).fill('旧需求');await page.getByRole('button',{name:'创建',exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof window.finishGenerate)).toBe('function')
  await page.evaluate(()=>{const b=window.noteEditor.document.find(b=>b.type==='research');window.noteEditor.updateBlock(b.id,{props:{payload:JSON.stringify({id:'note-component-replacement',kind:'generated-container',title:'用户新内容',noteLibrary:true,generationStatus:'completed',containerSpec:{version:1,type:'table',title:'用户新内容',columns:['值'],rows:[[2]]}})}});document.dispatchEvent(new CustomEvent('sherlock:notes-stop',{detail:{sessionId:'slash-insert'}}));window.finishGenerate({kind:'component',node:{id:'old-result',title:'旧结果'}})})
  await expect.poll(()=>page.locator('.en-ai-loading').count()).toBe(0);expect(await page.evaluate(()=>JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload))).toMatchObject({title:'用户新内容',generationStatus:'completed',containerSpec:{rows:[[2]]}})
 }finally{await context.close()}
},15000)

it('pauses note data visibility as soon as the retained notes surface is hidden',async()=>{
 const {context,page}=await fixture();try{
  await expect.poll(()=>page.evaluate(()=>window.noteRequests.filter(v=>v.method==='component-data-visible').at(-1)?.input.active)).toBe(true)
  await page.evaluate(()=>{const root=document.querySelector('.en-root');root.hidden=true;root.style.display='none';document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change',{detail:{active:false}}))})
  await expect.poll(()=>page.evaluate(()=>window.noteRequests.filter(v=>v.method==='component-data-visible').at(-1)?.input.active)).toBe(false)
  await page.evaluate(()=>{const root=document.querySelector('.en-root');root.hidden=false;root.style.display='';document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change',{detail:{surface:'notes',active:true}}))})
  await expect.poll(()=>page.evaluate(()=>window.noteRequests.filter(v=>v.method==='component-data-visible').at(-1)?.input.active)).toBe(true)
 }finally{await context.close()}
},15000)
