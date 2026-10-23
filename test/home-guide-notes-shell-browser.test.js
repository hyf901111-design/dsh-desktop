import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountHomeGuides}from'./src/preload/home-guides';import{mountHomeNotesGuide}from'./src/preload/home-guide-notes';import{mountNotes}from'./src/preload/notes/mount';import{WorkspaceSurfaceHost}from'./src/preload/workspace-surface-host';
 window.nativeNoteLoads=0;window.originalInput=document.querySelector('#original-draft');window.originalInput.focus();window.originalInput.setSelectionRange(1,3);
 const host=new WorkspaceSurfaceHost(document),bridge={request:async(method,input)=>{if(method==='load'){window.nativeNoteLoads++;return{saved:{title:'用户原始笔记',blocks:[{id:'user-paragraph',type:'paragraph',content:'这份用户笔记必须保持原样。'}],yjs:'',revision:0,updatedAt:Date.now()}}}if(method==='save')return{status:'saved',saved:{...input.content,revision:input.revision+1,updatedAt:Date.now()}};return{}},draft:async()=>{throw Error('不应写入用户草稿')}};
 window.nativeNotes=mountNotes(document,bridge,host);
 window.deferNativeRestore=false;
 for(const tab of document.querySelectorAll('[data-conversation-view-id]'))tab.addEventListener('click',()=>{const apply=()=>{for(const other of document.querySelectorAll('[data-conversation-view-id]'))other.setAttribute('aria-selected',String(other===tab));const old=document.querySelector('[data-ework-note-view]');old?.remove();if(tab.dataset.conversationViewId==='notes'){const anchor=document.createElement('div');anchor.dataset.eworkNoteView='original-session';document.querySelector('#resident-body').append(anchor);document.dispatchEvent(new CustomEvent('sherlock:notes-open',{detail:{sessionId:'original-session'}}))}else document.dispatchEvent(new CustomEvent('sherlock:notes-close',{detail:{sessionId:'original-session'}}))};if(window.deferNativeRestore&&tab.dataset.conversationViewId==='chat')setTimeout(apply,70);else apply()});
 window.guides=mountHomeGuides(document,{mountNotes:mountHomeNotesGuide,mountPresentation:async()=>({runStep:async()=>{},dispose:()=>{}})});
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'inline-styles',setup(b){b.onResolve({filter:/\.css\?(inline|raw)$/},async args=>{const found=await b.resolve(args.path.replace(/\?(inline|raw)$/,''),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>{const contents=await readFile(args.path,'utf8');if(!contents.includes('@import'))return{contents,loader:'text'};const compiled=await build({entryPoints:[args.path],conditions:['browser','import','style'],bundle:true,write:false,outfile:'notes.css',logLevel:'silent',loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'}});return{contents:compiled.outputFiles.find(file=>file.path.endsWith('.css')).text,loader:'text'}})}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(paneWidth=600){
 const context=await browser.newContext({viewport:{width:paneWidth+480,height:752}}),page=await context.newPage(),errors=[],logs=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['warning','error'].includes(message.type()))logs.push(message.text()+' '+JSON.stringify(message.location()))})
 await page.route('http://127.0.0.1/notes-guide-shell',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content"><title>首页笔记教程集成验收</title><style>body{margin:0;font-family:system-ui} .pI_x6G_centerCol{position:absolute;left:88px;top:10px;width:${paneWidth}px;bottom:10px;border-radius:12px;overflow:hidden;background:#eee}.wSkVaW_root{height:100%;position:relative}.wSkVaW_header{height:44px;display:flex;align-items:center;padding-inline:12px}.wSkVaW_header button{height:30px;border:0;border-radius:7px;padding:0 14px;background:transparent}.wSkVaW_header button[aria-selected=true]{background:#ddd} #original-draft{position:absolute;top:250px;left:20px;width:calc(100% - 50px)} [data-srb-tabs]{display:flex}.en-root{z-index:45}</style><div class="pI_x6G_centerCol"><div class="wSkVaW_root"><header class="wSkVaW_header" data-srb-session-header data-ework-notes-session="original-session"><div data-srb-tabs role="tablist"><button role="tab" data-conversation-view-id="chat" aria-selected="true">对话</button><button role="tab" data-conversation-view-id="research" aria-selected="false">研究</button><button role="tab" data-conversation-view-id="notes" aria-selected="false">笔记</button></div></header><div id="resident-body" style="height:calc(100% - 44px)"><textarea id="original-draft">用户原有提示词与技能标签</textarea></div></div></div>`}))
 await page.goto('http://127.0.0.1/notes-guide-shell');if(css)await page.addStyleTag({content:css});await page.addScriptTag({content:script});return{context,page,errors,logs}
}
for(const width of [600,700])it(`uses the real note mode and preserves the user's resident draft through a ${width}px pane walkthrough`,async()=>{
 const{context,page,errors,logs}=await fixture(width);try{
  await page.evaluate(()=>window.guides.start('note'))
  await expect.poll(()=>page.getByRole('tab',{name:'笔记'}).getAttribute('aria-selected')).toBe('true')
  await expect.poll(()=>page.locator('[data-home-guide] .odyssey-home-guide-count').innerText(),{timeout:20000}).toBe('演示完成')
  expect(await page.locator('[data-home-guide] .bn-editor').innerText()).toContain('同比增长10%');expect(await page.evaluate(()=>window.nativeNoteLoads)).toBe(0)
  expect(await page.evaluate(()=>document.querySelector('#original-draft')===window.originalInput&&window.originalInput.value==='用户原有提示词与技能标签')).toBe(true)
  expect(await page.locator('[data-home-guide]').evaluate(root=>{const box=root.getBoundingClientRect(),pane=document.querySelector('.pI_x6G_centerCol').getBoundingClientRect(),footer=root.querySelector('.odyssey-home-guide-footer').getBoundingClientRect(),content=root.querySelector('[data-home-guide-content]').getBoundingClientRect();return box.left>=pane.left&&box.right<=pane.right+1&&box.bottom<=pane.bottom+1&&content.bottom<=footer.top+1&&root.scrollWidth<=root.clientWidth})).toBe(true)
  await page.screenshot({path:'/tmp/home-guide-notes-shell-'+width+'-20261024.png'})
  await page.getByRole('button',{name:'退出示例教程'}).click();expect(await page.locator('[data-home-guide]').count()).toBe(0)
  expect(await page.getByRole('tab',{name:'对话'}).getAttribute('aria-selected')).toBe('true');expect(await page.evaluate(()=>({same:document.querySelector('#original-draft')===window.originalInput,selection:[window.originalInput.selectionStart,window.originalInput.selectionEnd],focused:document.activeElement===window.originalInput,nativeLoads:window.nativeNoteLoads}))).toEqual({same:true,selection:[1,3],focused:true,nativeLoads:0})
  expect(errors).toEqual([]);expect(logs).toEqual([])
 }finally{await context.close()}
},30000)
it('pauses the stream, replays without losing the original tab, and exits cleanly',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.guides.start('note'));await expect.poll(()=>page.locator('[data-home-guide] .bn-editor').innerText()).toContain('研究摘要')
  await page.getByRole('button',{name:'暂停',exact:true}).click();await page.waitForTimeout(120);const paused=await page.locator('[data-home-guide] .bn-editor').innerText();await page.waitForTimeout(300);expect(await page.locator('[data-home-guide] .bn-editor').innerText()).toBe(paused)
  await page.getByRole('button',{name:'重播',exact:true}).click();await page.locator('[data-home-guide] .bn-editor').waitFor();await page.getByRole('button',{name:'退出示例教程'}).click()
  await page.waitForTimeout(200);expect(await page.locator('[data-home-guide]').count()).toBe(0);expect(await page.getByRole('tab',{name:'对话'}).getAttribute('aria-selected')).toBe('true');expect(await page.evaluate(()=>window.nativeNoteLoads)).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('honors a user click on the native Notes tab instead of restoring the old Chat tab',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.guides.start('note'));await page.getByRole('tab',{name:'笔记'}).click();await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0)
  await expect.poll(()=>page.evaluate(()=>window.nativeNoteLoads)).toBeGreaterThan(0);expect(await page.getByRole('tab',{name:'笔记'}).getAttribute('aria-selected')).toBe('true');expect(await page.locator('#original-draft').inputValue()).toBe('用户原有提示词与技能标签');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('suppresses user-note loading until an asynchronous original-tab restore has committed',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.guides.start('note'));await page.evaluate(()=>window.deferNativeRestore=true)
  await page.getByRole('button',{name:'退出示例教程'}).click();expect(await page.locator('[data-home-guide]').count()).toBe(0)
  await expect.poll(()=>page.getByRole('tab',{name:'对话'}).getAttribute('aria-selected')).toBe('true')
  await page.waitForTimeout(100);expect(await page.evaluate(()=>window.nativeNoteLoads)).toBe(0);expect(await page.locator('html[data-home-guide-transition]').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
