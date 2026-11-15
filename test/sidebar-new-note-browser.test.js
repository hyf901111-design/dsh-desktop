import {beforeAll,afterAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {createServer} from 'node:http'
let browser,server,origin,script,input,css
const output=process.env.SHERLOCK_NEW_NOTE_ARTIFACTS||'/tmp/sidebar-new-note-20261026',base='node_modules/@deepseek-ai/'
const nodePatch=(source)=>execFileSync(process.execPath,['--input-type=module','-e',`import fs from 'node:fs';import{patchSidebarNewNoteShell}from'./scripts/lib/sidebar-new-note.mjs';process.stdout.write(patchSidebarNewNoteShell(fs.readFileSync(0,'utf8')))`],{input:source,encoding:'utf8',maxBuffer:8*1024*1024})
const expose=(source,names)=>source.replace('exports.apply = apply;',`exports.apply = apply;${names.map(name=>`exports.__test${name}=${name};`).join('')}`)
beforeAll(async()=>{
 await mkdir(output,{recursive:true});const runtime=await readFile(base+'dsh-client-runtime/lib/client.js','utf8'),conversation=expose(await readFile(base+'dsh-client-ui-conversation/lib/client.js','utf8'),['createChatStore']),sidebar=expose(nodePatch(await readFile(base+'dsh-client-ui-sidebar/lib/client.js','utf8')),['SidebarRoot','zh','en']),workspace=expose(await readFile(base+'dsh-client-ui-workspace/lib/client.js','utf8'),['WorkspaceBrowser','createWorkspaceViewStore','zh','en'])
 const primitive=await readFile(base+'dsh-client-ui-primitives/lib/index.js','utf8'),a=primitive.indexOf('function Tooltip('),b=primitive.indexOf('//#endregion',a),assetsDir=base+'dsh-web-frontend/dist/assets',cssName=(await readdir(assetsDir)).find(name=>/^index-.*\.css$/.test(name));css=await readFile(assetsDir+'/'+cssName,'utf8');const rule=css.match(/(\.[A-Za-z0-9_-]*bubble[A-Za-z0-9_-]*)\{[^}]*pointer-events:none[^}]*\}/)[0]
 const install=execFileSync(process.execPath,['--input-type=module','-e',`import{installSidebarNewNote}from'./scripts/lib/sidebar-new-note.mjs';process.stdout.write(installSidebarNewNote.toString())`],{encoding:'utf8'})
 input={runtime,conversation,sidebar,workspace,install,tooltip:primitive.slice(a,b),tooltipClass:rule.slice(1,rule.indexOf('{'))}
 const built=await build({entryPoints:['test/fixtures/sidebar-new-note-browser.tsx'],bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl','.svg':'dataurl'},plugins:[{name:'raw',setup(b){b.onResolve({filter:/\?raw$/},async args=>{const r=await b.resolve(args.path.slice(0,-4),{resolveDir:args.resolveDir,kind:args.kind});return{path:r.path,namespace:'raw'}});b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}},{name:'inline-css',setup(build){build.onResolve({filter:/\.css\?inline$/},async args=>{const found=await build.resolve(args.path.slice(0,-7),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});build.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}},{name:'test-editor-access',setup(build){build.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.noteEditors[props.sessionId]=editor; const slashMenu = useMemo'),loader:'tsx'}))}}]});script=built.outputFiles.find(file=>file.path.endsWith('.js')).text;css+='\n'+(built.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'')
 server=createServer((req,res)=>{if(req.url==='/sherlock/spreadsheet/session'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true}));return}res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><style>'+css+'body{margin:0;font-family:system-ui;height:100vh}#app{height:100vh}.pI_x6G_centerCol{position:fixed;left:280px;right:0;top:0;bottom:0}.en-root{z-index:1}[data-dsh-sidebar-root]{height:100vh}</style></head><body><div id="app"></div></body></html>')});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port
 const pw=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.chromium??pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve))})
async function fixture(){const page=await browser.newPage({viewport:{width:1180,height:800}});page.setDefaultTimeout(6000);page.on('pageerror',error=>console.log('PAGEERROR',error.message));await page.goto(origin);await page.evaluate(input=>{window.newNoteInput=input},input);await page.addScriptTag({content:script});await page.waitForSelector('[data-fixture-ready="true"]',{state:'attached'});try{await page.waitForSelector('.bn-editor')}catch(error){console.log('FIXTURE',await page.evaluate(()=>({ready:document.documentElement.dataset.fixtureReady,body:document.body.innerText.slice(0,1600),current:window.newNoteFixture?.current(),events:window.newNoteFixture?.events})));throw error}return page}
it('creates normal native Notes from the real expanded menu after saving the old editor',async()=>{const page=await fixture();try{
 await page.locator('.bn-editor').click();await page.keyboard.press('End');await page.keyboard.type('，保存新输入👩‍💻。')
 await page.locator('.st-more').click();expect(await page.getByRole('menuitem').allTextContents()).toEqual(['新笔记','新建表格','浏览器','知识库','插件','定时任务']);await page.getByRole('menuitem',{name:'新笔记',exact:true}).click();await page.waitForFunction(()=>window.newNoteFixture.current().id!=='old').catch(async error=>{console.log('NEWNOTE-STATE',await page.evaluate(()=>({current:window.newNoteFixture.current(),events:window.newNoteFixture.events,body:document.body.innerText.slice(-1200),surface:document.body.dataset.workspaceSurface})));throw error});await page.waitForFunction(()=>!!window.noteEditors[window.newNoteFixture.current().id]).catch(async error=>{console.log('NEWNOTE-EDITOR',await page.evaluate(()=>({current:window.newNoteFixture.current(),editors:Object.keys(window.noteEditors),events:window.newNoteFixture.events,body:document.body.innerText.slice(-1600),anchors:[...document.querySelectorAll('[data-ework-note-view],[data-ework-notes-session]')].map(n=>n.outerHTML.slice(0,150))})));throw error});const result=await page.evaluate(()=>{const f=window.newNoteFixture;return{current:f.current(),events:f.events,saved:f.saved.old,draft:f.shellFor('old').snapshot.draft,mode:localStorage.getItem('ework.session.view.v1:'+f.current().id)}})
 expect(result.current.view).toBe('notes');expect(result.mode).toBe('notes');expect(result.draft).toBe('原有对话草稿😀');expect(JSON.stringify(result.saved)).toContain('保存新输入👩‍💻。');expect(result.events.filter(e=>e.type==='create').at(-1).payload).toEqual({workspaceId:'active'});const flush=result.events.findIndex(e=>e.type==='flush-end'),create=result.events.findLastIndex(e=>e.type==='create');expect(flush).toBeLessThan(create);expect(await page.locator('.bn-editor').textContent()).not.toContain('旧笔记正文')
 }finally{await page.close()}},30000)
it('shows one collapsed Home action with a native tooltip and follows the visible main view', async () => {
 const page=await fixture()
 try {
  await page.evaluate(()=>window.newNoteFixture.setCollapsed(true))
  const rail=page.locator('[data-dsh-sidebar-root][data-dsh-sidebar-wide="false"]')
  await rail.waitFor()
  expect(await rail.locator('button[aria-label]:visible').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label'))))
   .toEqual(['打开侧边栏','主页','浏览器','知识库','更多'])
  const home=rail.getByRole('button',{name:'主页',exact:true})
  await home.hover()
  await page.getByText('主页',{exact:true}).waitFor()
  await home.click()
  expect(await page.evaluate(()=>window.newNoteFixture.events.filter(e=>e.type==='original-chat').length)).toBe(1)
  await page.evaluate(()=>{
   delete document.body.dataset.workspaceSurface
   document.body.insertAdjacentHTML('beforeend','<main class="pI_x6G_centerCol"><div class="wSkVaW_root" data-odyssey-page="home"></div></main>')
  })
  await expect.poll(()=>home.getAttribute('aria-pressed')).toBe('true')
  await page.mouse.move(600,400)
  expect(await home.getAttribute('aria-pressed')).toBe('true')
  for(const surface of ['browser','knowledge','notes']){
   await page.evaluate(surface=>{document.body.dataset.workspaceSurface=surface},surface)
   await expect.poll(()=>home.getAttribute('aria-pressed')).toBe('false')
   const app=rail.locator('[data-sidebar-'+surface+']')
   if(surface!=='notes') expect(await app.getAttribute('aria-pressed')).toBe('true')
  }
  await page.evaluate(()=>{
   delete document.body.dataset.workspaceSurface
   document.querySelector('.wSkVaW_root').dataset.odysseyPage='conversation'
  })
  await expect.poll(()=>home.getAttribute('aria-pressed')).toBe('false')
  await page.evaluate(()=>{document.querySelector('.wSkVaW_root').dataset.odysseyPage='home'})
  await expect.poll(()=>home.getAttribute('aria-pressed')).toBe('true')
  await rail.locator('.st-more').click()
  expect(await page.getByRole('menuitem').allTextContents()).toEqual(['新建对话','新建研究','新建笔记','新建表格','插件','定时任务'])
  await page.keyboard.press('Escape')
  await page.evaluate(()=>window.newNoteFixture.setCollapsed(false))
  await expect.poll(()=>home.count()).toBe(0)
  await page.getByRole('button',{name:'新建对话',exact:true}).waitFor()
  await page.getByRole('button',{name:'新建研究',exact:true}).waitFor()
  await page.getByRole('button',{name:'添加工作区',exact:true}).waitFor()
 } finally {await page.close()}
},30000)
it('keeps the Figma row/icon geometry and bilingual colors in both modes',async()=>{const page=await fixture();try{for(const dark of[false,true])for(const locale of['zh','en']){
 await page.evaluate(({dark,locale})=>{window.newNoteFixture.setDark(dark);window.newNoteFixture.setLocale(locale)},{dark,locale});await page.locator('.st-more').click();const item=page.getByRole('menuitem').first();await expect.poll(()=>item.textContent()).toBe(locale==='en'?'New Note':'新笔记');const sizes=await item.evaluate(n=>({row:n.getBoundingClientRect().height,icon:n.querySelector('.st-icon').getBoundingClientRect().width,gap:getComputedStyle(n).gap,menu:n.parentElement.getBoundingClientRect().width}));expect(sizes).toEqual({row:38,icon:18,gap:'10px',menu:240});await page.locator('.st-menu').screenshot({path:output+'/screens/menu-'+locale+'-'+(dark?'dark':'light')+'.png'});await page.keyboard.press('Escape')
 }}finally{await page.close()}},30000)
it('refuses late same-session mode navigation and shows real host errors without losing the old draft',async()=>{const page=await fixture();try{
 await page.evaluate(()=>window.newNoteFixture.hold());await page.locator('.st-more').click();await page.getByRole('menuitem',{name:'新笔记',exact:true}).click();await page.waitForFunction(()=>window.newNoteFixture.events.filter(e=>e.type==='create').length===2);await page.evaluate(()=>{window.newNoteFixture.switch('research');window.newNoteFixture.release()});await page.waitForTimeout(60);expect((await page.evaluate(()=>window.newNoteFixture.current())).id).toBe('old');expect(await page.locator('[role=alert]').count()).toBe(0);await page.evaluate(()=>window.newNoteFixture.fail());await page.locator('.st-more').click();await page.getByRole('menuitem',{name:'新笔记',exact:true}).click();await page.waitForSelector('[role=alert]');expect(await page.locator('[role=alert]').textContent()).toContain('Host');expect(await page.evaluate(()=>window.newNoteFixture.shellFor('old').snapshot.draft)).toBe('原有对话草稿😀')
 }finally{await page.close()}},30000)
it('shares the native 20px muted pseudo-icon family in the rail while keeping menu icons at 18px',async()=>{
 const page=await fixture(),states=[];await mkdir(output+'/rail',{recursive:true})
 try{
  void 0
  await page.evaluate(()=>window.newNoteFixture.setCollapsed(true));await page.waitForSelector('[data-dsh-sidebar-wide="false"]')
  for(const dark of[false,true]){
   await page.evaluate(dark=>window.newNoteFixture.setDark(dark),dark)
   const state=await page.evaluate(()=>{
    const buttons=[...document.querySelectorAll('[data-dsh-sidebar-root] .hHd-Xa_newSession')]
    return buttons.map(button=>{const s=getComputedStyle(button,'::before');return{width:s.width,height:s.height,background:s.backgroundColor,mask:s.maskImage}})
   });states.push({dark,...state});await page.locator('[data-dsh-sidebar-root]').screenshot({path:output+'/rail/'+(dark?'dark':'light')+'.png'})
  }
  await writeFile(output+'/rail/metrics.json',JSON.stringify(states,null,2))
  for(const state of states){
   expect(state).toMatchObject({0:{width:'20px',height:'20px'},1:{width:'20px',height:'20px'},2:{width:'20px',height:'20px'}})
   expect(new Set([state[0].mask,state[1].mask,state[2].mask]).size).toBe(3)
   expect([state[0],state[1],state[2]].every(glyph=>glyph.mask!=='none'&&glyph.background===state[0].background)).toBe(true)
  }
  await page.evaluate(()=>window.newNoteFixture.setCollapsed(false));await page.waitForSelector('[data-dsh-sidebar-wide="true"]');await page.locator('.st-more').click();const sizes=await page.getByRole('menuitem').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n.querySelector('.st-icon'));return{width:s.width,height:s.height,background:s.backgroundColor}}));expect(sizes).toHaveLength(6);expect(sizes.every(s=>s.width==='18px'&&s.height==='18px'&&s.background===sizes[0].background)).toBe(true)
 }finally{await page.close()}
},30000)

it('renders both Browser entry points with the Figma rail geometry and persistent selection',async()=>{const page=await fixture();try{
 void 0;await page.evaluate(()=>{window.browserEntryCount=0;window.addEventListener('sherlock:browser-request',()=>{window.browserEntryCount++;document.body.dataset.workspaceSurface='browser';document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change'))})});
 await page.locator('.st-more').click();await page.getByRole('menuitem',{name:'浏览器',exact:true}).click();expect(await page.evaluate(()=>window.browserEntryCount)).toBe(1);await page.evaluate(()=>window.newNoteFixture.setCollapsed(true));const entry=page.locator('[data-sidebar-browser]');await entry.waitFor();await entry.click();await expect.poll(()=>entry.getAttribute('aria-pressed')).toBe('true');await page.mouse.move(600,400);expect(await entry.getAttribute('aria-pressed')).toBe('true');await entry.click();expect(await page.evaluate(()=>window.browserEntryCount)).toBe(3);
 const geometry=await entry.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),i=getComputedStyle(el,'::before');return {width:r.width,height:r.height,radius:s.borderRadius,icon:[i.width,i.height],mask:i.maskImage!=='none'}});expect(geometry).toEqual({width:36,height:36,radius:'6px',icon:['20px','20px'],mask:true});for(const dark of [false,true]){await page.evaluate(dark=>window.newNoteFixture.setDark(dark),dark);expect(await entry.evaluate(el=>getComputedStyle(el,'::before').backgroundColor===getComputedStyle(el).color)).toBe(true);const selected=await entry.evaluate(el=>getComputedStyle(el).color);await page.evaluate(()=>{document.body.dataset.workspaceSurface='notes';document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change'))});await expect.poll(()=>entry.getAttribute('aria-pressed')).toBe('false');expect(await entry.evaluate(el=>getComputedStyle(el).color)).not.toBe(selected);expect(await entry.evaluate(el=>getComputedStyle(el,'::before').backgroundColor===getComputedStyle(el).color)).toBe(true);await page.evaluate(()=>{document.body.dataset.workspaceSurface='browser';document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change'))});await expect.poll(()=>entry.getAttribute('aria-pressed')).toBe('true')}await mkdir(output+'/browser',{recursive:true});await page.locator('[data-dsh-sidebar-root]').screenshot({path:output+'/browser/collapsed-selected.png'});await page.evaluate(()=>window.newNoteFixture.setLocale('en'));await expect.poll(()=>entry.getAttribute('aria-label')).toBe('Browser');await page.evaluate(()=>window.newNoteFixture.setCollapsed(false));await expect.poll(()=>page.locator('[data-sidebar-browser]').count()).toBe(0);await page.locator('.st-more').click();await expect.poll(()=>page.getByRole('menuitem').allTextContents()).toEqual(['New Note','New spreadsheet','Browser','Knowledge Base','Plugins','Scheduled tasks']);
 }finally{await page.close()}},30000)

it('opens a fresh spreadsheet from the expanded sidebar in the current workspace',async()=>{const page=await fixture();try{
 await page.locator('.st-more').click()
 await page.getByRole('menuitem',{name:'新建表格',exact:true}).click()
 await page.waitForFunction(()=>window.newNoteFixture.current().view==='spreadsheet')
 const result=await page.evaluate(()=>({current:window.newNoteFixture.current(),events:window.newNoteFixture.events}))
 expect(result.current).toEqual({id:'new-note-1',view:'spreadsheet'})
 expect(result.events.filter(event=>event.type==='create').at(-1).payload).toEqual({workspaceId:'active'})
 }finally{await page.close()}},30000)
