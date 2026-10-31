import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile,readdir,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {join,dirname} from 'node:path'
import {tmpdir} from 'node:os'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {patchHomeGuideNative} from '../scripts/lib/home-guide-native.mjs'
import {stripWorkbenchReplay} from './fixtures/strip-workbench-replay.mjs'
import {NotesStore} from '../src/main/notes/store'
import {homeGuidePlaybackFixture} from './fixtures/home-guide-playback.js'
let browser,script,css,runtime,conversation,theme,sidebarSource
const output=process.env.SHERLOCK_ENTRY_HANDOFF_EVIDENCE||'/tmp/sherlock-explore-refinement-r3-20261031/entry-browser'
beforeAll(async()=>{
 sidebarSource=(await readFile('node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__Root=SidebarRoot;')
 runtime=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 conversation=patchHomeGuideNative(stripWorkbenchReplay(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))).replace('exports.apply = apply;','exports.apply = apply;exports.__InputBar=InputBar;exports.__header=ConversationSessionHeader;exports.__register=registerConversationNodes;exports.__createChatStore=createChatStore;exports.__setGuidePage=page=>{sherlockBoardsAdapter=page;};exports.__boardsPage=sherlockBoardsPage;')
 theme=(await Promise.all(['figma-final-shell','figma-home','figma-panels','figma-reading','figma-refinements'].map(name=>readFile('src/preload/'+name+'.css','utf8')))).join('\n')
 const result=await build({entryPoints:['test/fixtures/home-guide-entry-handoff-browser.tsx'],bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.svg':'dataurl','.woff':'dataurl','.woff2':'dataurl'},plugins:[homeGuidePlaybackFixture(),{name:'inline-js-source',setup(b){b.onResolve({filter:/\.js\?raw$/},args=>({path:join(args.resolveDir,args.path.slice(0,-4)),namespace:'inline-js-source'}));b.onLoad({filter:/.*/,namespace:'inline-js-source'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}},{name:'inline-css',setup(b){b.onResolve({filter:/\.css\?(inline|raw)$/},async args=>{const found=await b.resolve(args.path.replace(/\?(inline|raw)$/, ''),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>{const source=await readFile(args.path,'utf8');if(!source.includes('@import'))return{contents:source,loader:'text'};const bundled=await build({entryPoints:[args.path],bundle:true,conditions:['browser','import','style'],write:false,outfile:'note.css',logLevel:'silent',loader:{'.svg':'dataurl','.woff':'dataurl','.woff2':'dataurl'}});return{contents:bundled.outputFiles.find(file=>file.path.endsWith('.css')).text,loader:'text'}})}}]})
 const assets='node_modules/@deepseek-ai/dsh-web-frontend/dist/assets',files=await readdir(assets);theme=(await readFile(join(assets,files.find(name=>/^index-.*\.css$/.test(name))),'utf8'))+'\n'+theme
 script=result.outputFiles.find(file=>file.path.endsWith('.js')).text;css=result.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'});await mkdir(output,{recursive:true})
},60000)
afterAll(()=>browser?.close())
async function fixture(options={}){
 const directory=await mkdtemp(join(tmpdir(),'entry-handoff-')),store=new NotesStore(directory),context=await browser.newContext({viewport:{width:1100,height:860},reducedMotion:'no-preference'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(4500);page.on('pageerror',error=>errors.push(error.stack))
 await page.exposeFunction('entryNotesStorage',async(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft')return store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);if(method==='engage')return{ok:true};throw Error('入口不应请求其他操作：'+method)})
 await page.route('http://127.0.0.1/entry-handoff',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><main class="pI_x6G_centerCol"><div id="native-root"></div></main>'}));await page.goto('http://127.0.0.1/entry-handoff');await page.addStyleTag({content:theme+'\n'+css+'\nhtml,body{margin:0;height:100%;font-family:system-ui}.pI_x6G_centerCol{position:relative;width:1000px;height:100vh}#native-root{height:100%;min-height:0}#native-sidebar{position:fixed;left:0;top:0;bottom:0;width:220px;z-index:20}body:has(#native-sidebar) .pI_x6G_centerCol{margin-left:240px;width:calc(100% - 240px)}#native-sidebar>[data-dsh-sidebar-root]{height:100%;display:flex;flex-direction:column}'});await page.evaluate(input=>window.entryInput=input,{runtime,conversation,sidebar:sidebarSource,...options});await page.addScriptTag({content:script});if(options.sourceView==='notes'){await page.locator('[data-srb-tabs] [data-conversation-view-id=notes]').click();await page.locator('[data-workspace-surface=notes] .bn-editor').waitFor({timeout:10000})}else await page.locator('textarea').waitFor().catch(async error=>{throw Error(error.message+' '+errors.join('\n')+' BODY '+await page.locator('body').innerText())});return{page,context,errors,store,async close(){await page.evaluate(()=>window.entryProbe.dispose()).catch(()=>{});await context.close();await rm(directory,{recursive:true,force:true})}}
}
async function begin(page,index){await page.getByRole('button',{name:'切换到快速开始',exact:true}).click();await expect.poll(()=>page.locator('.pI_x6G_centerCol').getAttribute('data-odyssey-home-operations-motion')).toBe('idle');await page.locator('button[data-case="'+index+'"]').click();await expect.poll(()=>page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe(String(index));await page.locator('[data-odyssey-operations-open-example]').click()}
for(const[kind,index,mode]of [['board',0,'research'],['note',1,'notes']])it('does not paint the original empty '+mode+' page while preparing the independent '+kind+' example',async()=>{
 const f=await fixture(),{page}=f;try{
  await begin(page,index)
  await page.locator('[data-home-guide-kind="'+kind+'"]').waitFor({timeout:7000});if(kind==='note')await page.locator('[data-home-guide] .bn-editor').waitFor();await page.waitForTimeout(80)
  const value=await page.evaluate(()=>({frames:window.entryProbe.frames,actions:window.entryProbe.actions,requests:window.entryProbe.requests,source:window.entryProbe.shellFor('source').snapshot,selected:window.entryProbe.sessions.list.getSnapshot().current}));await writeFile(output+'/'+kind+'-frames.json',JSON.stringify(value,null,2)+'\n');await page.screenshot({path:output+'/'+kind+'-entered.png'})
  const gap=value.frames.filter(frame=>frame.id==='source'&&frame.mode===mode);expect(gap).toEqual([])
  expect(value.selected).toBe('example-'+kind);expect(value.source.draft).toBe('原会话草稿和技能不得改变😀');expect(new Set(value.frames.map(frame=>frame.pointer).filter(Boolean)).size).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it.each(['typing','escape','navigation'])('does not hand a late prepared Notes session over after real user %s',async change=>{
 const f=await fixture({holdPrepare:true}),{page}=f;try{
  await begin(page,1);await expect.poll(()=>page.evaluate(()=>typeof window.entryProbe.releasePrepare),{timeout:6000}).toBe('function')
  if(change==='typing'){await page.locator('textarea').focus();await page.keyboard.press('End');await page.keyboard.type(' newer draft')}else if(change==='escape')await page.keyboard.press('Escape');else await page.locator('[data-srb-tabs] [data-conversation-view-id="research"]').click()
  const expected=await page.evaluate(()=>window.entryProbe.shellFor('source').snapshot)
  await page.evaluate(()=>window.entryProbe.releasePrepare());await page.waitForTimeout(180)
  expect(await page.evaluate(()=>window.entryProbe.sessions.list.getSnapshot().current)).toBe('source');expect(await page.evaluate(()=>window.entryProbe.requests.filter(r=>r.command!=='cancel').map(r=>r.command))).toEqual(['prepare'])
  expect(await page.evaluate(()=>window.entryProbe.shellFor('source').snapshot)).toEqual(expected);expect(await page.locator('[data-home-guide]').count()).toBe(0);expect(await page.locator('[data-home-guide-pointer]').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},18000)

it('keeps a real prepare failure visible beside the unchanged original composer',async()=>{
 const f=await fixture({failPrepare:true}),{page}=f;try{
  await begin(page,1);await expect.poll(()=>page.locator('[data-odyssey-operations-feedback]').textContent()).toBe('真实准备失败')
  expect(await page.evaluate(()=>window.entryProbe.actions.filter(a=>a.type==='tab-click'))).toEqual([]);expect(await page.evaluate(()=>window.entryProbe.sessions.list.getSnapshot().current)).toBe('source');expect(await page.locator('textarea').inputValue()).toBe('原会话草稿和技能不得改变😀');expect(f.errors).toEqual([])
 }finally{await f.close()}
},18000)

it('waits for a slow preparation before visibly pressing the real Notes tab, using the same pointer',async()=>{
 const f=await fixture({prepareDelay:1500}),{page}=f;try{
  await begin(page,1);await page.locator('[data-home-guide] .bn-editor').waitFor({timeout:9000})
  const result=await page.evaluate(()=>({prepared:window.entryProbe.prepared,actions:window.entryProbe.actions,frames:window.entryProbe.frames})),click=result.actions.find(action=>action.type==='tab-click')
  expect(result.frames.filter(frame=>frame.time>=result.prepared&&frame.time<=click.time&&frame.phase==='pressed').length).toBeGreaterThan(0)
  expect(new Set(result.frames.map(frame=>frame.pointer).filter(Boolean)).size).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

async function beginExplore(page,index){await page.getByRole('button',{name:'探索',exact:true}).click();await page.locator('.odyssey-explore-content').evaluate(node=>Promise.all(node.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished)));await page.locator('.odyssey-explore-pages button').nth(index).click();await expect.poll(()=>page.locator('.odyssey-explore-showcase').getAttribute('data-case')).toBe(String(index));await expect.poll(()=>page.locator('.odyssey-explore-showcase [data-odyssey-operations-case-blending]').count()).toBe(0);await page.locator('.odyssey-explore-example').click()}
for(const[kind,index,mode]of [['board',0,'research'],['note',1,'notes']])it('hands the global Explore '+kind+' entry to a retained native session without editing the source draft',async()=>{
 const f=await fixture({explore:true}),{page}=f;try{
  await beginExplore(page,index);await page.locator('[data-home-guide-kind="'+kind+'"]').waitFor({timeout:7000}).catch(async error=>{const diagnostic=await page.evaluate(()=>({body:document.body.innerText,selected:window.entryProbe.sessions.list.getSnapshot().current,requests:window.entryProbe.requests,actions:window.entryProbe.actions,frames:window.entryProbe.frames.slice(-20),phases:window.entryProbe.entryPhases,guideError:window.__testHomeGuideError}));await writeFile(output+'/entry-failure-'+kind+'.json',JSON.stringify(diagnostic,null,2));throw Error(error.message+' DIAGNOSTIC '+JSON.stringify(diagnostic))});if(kind==='note')await page.locator('[data-home-guide] .bn-editor').waitFor()
  const value=await page.evaluate(()=>({frames:window.entryProbe.frames,source:window.entryProbe.shellFor('source').snapshot,selected:window.entryProbe.sessions.list.getSnapshot().current,commands:window.entryProbe.requests.map(row=>row.command)}))
  expect(await page.evaluate(()=>window.entryProbe.extraBlank??0)).toBe(0);const ordering=await page.evaluate(()=>({actions:window.entryProbe.actions,requests:window.entryProbe.requests}));expect(ordering.actions.filter(row=>row.type==='explore-close')).toHaveLength(1);expect(ordering.actions.find(row=>row.type==='explore-close').time).toBeLessThan(ordering.requests[0].time);if(kind==='note'){expect(ordering.actions.filter(row=>row.type==='sidebar-more')).toHaveLength(1);expect(ordering.actions.filter(row=>row.type==='sidebar-new-note')).toHaveLength(1);expect(await page.locator('[data-sidebar-more]').count()).toBe(0)}expect(value.selected).toBe('example-'+kind);expect(value.commands).toEqual(['prepare','open']);expect(value.frames.filter(frame=>frame.id==='source'&&frame.mode===mode)).toEqual([]);expect(value.source.draft).toBe('原会话草稿和技能不得改变😀');expect(await page.locator('dialog.odyssey-explore[open]').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('stops an in-flight native guide preparation when the user opens Explore again',async()=>{
 const f=await fixture({explore:true,holdPrepare:true}),{page}=f;try{
  await beginExplore(page,1);await page.waitForFunction(()=>typeof window.entryProbe.releasePrepare==='function',{},{timeout:10000})
  await page.getByRole('button',{name:'探索',exact:true}).click();await page.evaluate(()=>window.entryProbe.releasePrepare());await page.waitForTimeout(180)
  expect(await page.evaluate(()=>window.entryProbe.sessions.list.getSnapshot().current)).toBe('source');expect(await page.evaluate(()=>window.entryProbe.requests.map(row=>row.command))).toEqual(['prepare']);expect(await page.locator('[data-home-guide-pointer]').count()).toBe(0);expect(await page.locator('dialog.odyssey-explore[open]').count()).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.close()}
},18000)

it('saves the real note and keeps its session when Explore takes over an active guide',async()=>{
 const f=await fixture({explore:true}),{page}=f;try{
  await beginExplore(page,1);const editor=page.locator('[data-home-guide] .bn-editor');await editor.waitFor({timeout:10000});await editor.click();await page.keyboard.type('探索打开后必须保留这条研究笔记。')
  await page.getByRole('button',{name:'探索',exact:true}).click();await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0)
  expect(await page.locator('[data-home-guide-pointer]').count()).toBe(0);expect(await page.locator('dialog.odyssey-explore[open]').count()).toBe(1);expect(await page.evaluate(()=>window.entryProbe.sessions.list.getSnapshot().current)).toBe('example-note');expect(JSON.stringify(f.store.load('owner','example-note'))).toContain('探索打开后必须保留这条研究笔记。');expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

for(const[kind,index,mode]of [['board',0,'research'],['note',1,'notes']])it('closes real Explore and activates the unselected native '+mode+' homepage tab without changing the source mode',async()=>{
 const f=await fixture({explore:true,homeEmpty:true}),{page}=f;try{await beginExplore(page,index);await page.locator('[data-home-guide-kind="'+kind+'"]').waitFor({timeout:10000});if(kind==='note')await page.locator('[data-home-guide] .bn-editor').waitFor({timeout:10000});const value=await page.evaluate(()=>({selected:window.entryProbe.sessions.list.getSnapshot().current,source:window.entryProbe.storeFor('source').getSnapshot().view,sourceDraft:window.entryProbe.shellFor('source').snapshot.draft,frames:window.entryProbe.frames,actions:window.entryProbe.actions,requests:window.entryProbe.requests,blank:window.entryProbe.extraBlank??0}));expect(value.selected).toBe('example-'+kind);expect(value.source).toBeNull();expect(value.sourceDraft).toBe('');expect(value.blank).toBe(0);expect(value.frames.filter(frame=>frame.id==='source'&&frame.mode===mode)).toEqual([]);expect(value.actions.filter(action=>action.type==='explore-close')).toHaveLength(1);expect(value.requests.map(row=>row.command)).toEqual(['prepare','open']);expect(f.errors).toEqual([])}finally{await f.close()}
},20000)
it('starts Explore from the real Notes surface and preserves its edited source document through the native More route',async()=>{
 const f=await fixture({explore:true,sourceView:'notes'}),{page}=f;try{const original=page.locator('[data-workspace-surface=notes] .bn-editor');await original.waitFor({timeout:10000});await original.click();await page.keyboard.type('原笔记段落必须保存，不属于演示内容。');await beginExplore(page,1);await page.locator('[data-home-guide] .bn-editor').waitFor({timeout:10000});expect(await page.evaluate(()=>window.entryProbe.sessions.list.getSnapshot().current)).toBe('example-note');expect(await page.evaluate(()=>window.entryProbe.storeFor('source').getSnapshot().view)).toBe('notes');expect(JSON.stringify(f.store.load('owner','source'))).toContain('原笔记段落必须保存，不属于演示内容。');expect(await page.evaluate(()=>window.entryProbe.extraBlank??0)).toBe(0);expect(f.errors).toEqual([])}finally{await f.close()}
},22000)

for(const[kind,index]of [['board',0],['ppt',2],['report',3],['workbench',4]])it('saves an undebounced real Notes source before Explore opens the native '+kind+' example',async()=>{
 const f=await fixture({explore:true,sourceView:'notes',holdSourceSave:true,prepareDelay:0}),{page}=f;try{
  const title='源研究笔记未防抖修改 '+kind;await page.locator('[data-note-editor-session="source"] .en-title').fill(title);expect(f.store.load('owner','source').saved.title).not.toBe(title)
  await beginExplore(page,index);await page.waitForFunction(()=>window.entryProbe.beforeOpenCalls.length>0&&typeof window.entryProbe.releaseSourceSave==='function',{},{timeout:12000})
  expect(await page.evaluate(()=>window.entryProbe.sessions.list.getSnapshot().current)).toBe('source');expect(await page.evaluate(()=>window.entryProbe.requests.filter(row=>row.command==='open'))).toEqual([])
  await page.evaluate(()=>window.entryProbe.releaseSourceSave());await page.locator('[data-home-guide-kind="'+kind+'"]').waitFor({timeout:10000})
  const value=await page.evaluate(()=>({selected:window.entryProbe.sessions.list.getSnapshot().current,mode:window.entryProbe.storeFor('source').getSnapshot().view,draft:window.entryProbe.shellFor('source').snapshot.draft,saves:window.entryProbe.saves,opened:window.entryProbe.opened,blank:window.entryProbe.extraBlank??0}));await writeFile(output+'/source-save-'+kind+'.json',JSON.stringify(value,null,2));expect(value.selected).toBe('example-'+kind);expect(value.mode).toBe('notes');expect(value.draft).toBe('原会话草稿和技能不得改变😀');expect(value.blank).toBe(0);expect(value.saves.find(row=>row.phase==='saved'&&row.title===title).time).toBeLessThan(value.opened);expect(f.store.load('owner','source').saved.title).toBe(title);expect(f.errors).toEqual([])
 }finally{await f.close()}
},25000)
it('keeps a failed Notes save and its draft alive while cancelling the real Explore native entry lease',async()=>{
 const f=await fixture({explore:true,sourceView:'notes',failSourceSave:true,prepareDelay:0}),{page}=f;try{
  const title='原笔记保存失败必须留在当前页';await page.locator('[data-note-editor-session="source"] .en-title').fill(title);await beginExplore(page,0)
  await expect.poll(()=>page.evaluate(()=>window.entryProbe.entryPhases.some(row=>row.phase==='cancel')),{timeout:12000}).toBe(true);await expect.poll(()=>page.locator('[data-home-guide-pointer]').count()).toBe(0)
  expect(await page.evaluate(()=>window.entryProbe.sessions.list.getSnapshot().current)).toBe('source');expect(await page.evaluate(()=>window.entryProbe.storeFor('source').getSnapshot().view)).toBe('notes');expect(await page.evaluate(()=>window.entryProbe.shellFor('source').snapshot.draft)).toBe('原会话草稿和技能不得改变😀');expect(await page.evaluate(()=>window.entryProbe.requests.filter(row=>row.command==='open'))).toEqual([]);expect(await page.locator('[data-note-editor-session="source"] .en-title').inputValue()).toBe(title);expect(f.store.load('owner','source').saved.title).not.toBe(title);expect(f.store.load('owner','source').draft.title).toBe(title);expect(await page.locator('[data-home-guide-entry-target]').count()).toBe(0);expect(await page.locator('[data-home-guide]').count()).toBe(0);await writeFile(output+'/source-save-failure.json',JSON.stringify(await page.evaluate(()=>({selected:window.entryProbe.sessions.list.getSnapshot().current,mode:window.entryProbe.storeFor('source').getSnapshot().view,phases:window.entryProbe.entryPhases,requests:window.entryProbe.requests})),null,2));expect(f.errors).toEqual([])
 }finally{await f.close()}
},22000)

for(const[kind,index]of [['board',0],['workbench',4]])it('starts a dedicated '+kind+' from an edited Notes source through real Boards preparation and a tabless native Header',async()=>{
 const f=await fixture({explore:true,sourceView:'notes',nativeBoards:true,prepareDelay:0}),{page}=f;try{
  const title='保留当前研究笔记 '+kind;await page.locator('[data-note-editor-session="source"] .en-title').fill(title)
  await beginExplore(page,index);await page.locator('[data-home-guide-kind="'+kind+'"]').waitFor({timeout:10000}).catch(async error=>{const failure=await page.evaluate(()=>{const p=window.entryProbe,id=p.sessions.list.getSnapshot().current,r=document.querySelector('.pI_x6G_centerCol .wSkVaW_root');return{selected:id,boardOnly:p.boards.isBoardOnly(id),tabs:r?.querySelectorAll('[data-srb-tabs]').length,header:r?.querySelector('[data-srb-session-header]')?.dataset.eworkNotesSession,canvasOwner:r?.querySelector('[data-research-canvas]')?.dataset.researchPreviewSession,operations:p.boardOperations,steps:p.nativeSteps??[],requests:p.requests,body:document.body.innerText}});await writeFile(output+'/dedicated-entry-failure-'+kind+'.json',JSON.stringify({failure,errors:f.errors},null,2));await page.screenshot({path:output+'/dedicated-entry-failure-'+kind+'.png'});throw error})
  const value=await page.evaluate(()=>{const p=window.entryProbe,id=p.sessions.list.getSnapshot().current,root=document.querySelector('[data-home-guide-resident]'),canvas=root?.querySelector('[data-research-canvas]');return{selected:id,boardOnly:p.boards.isBoardOnly(id),state:p.boards.getState(),tabs:root?.querySelectorAll('[data-srb-tabs]').length,header:root?.querySelector('[data-srb-session-header]')?.dataset.eworkNotesSession,canvasOwner:canvas?.dataset.researchPreviewSession,renderOwner:root?.dataset.homeGuideViewSession,renderBoardOnly:root?.dataset.homeGuideBoardOnly,renderMode:root?.dataset.odysseyPage,sourceMode:p.storeFor('source').getSnapshot().view,sourceDraft:p.shellFor('source').snapshot.draft,requests:p.requests,operations:p.boardOperations,steps:p.nativeSteps??[],sent:p.sent,extraBlank:p.extraBlank??0}})
  await writeFile(output+'/dedicated-entry-'+kind+'.json',JSON.stringify(value,null,2));await page.screenshot({path:output+'/dedicated-entry-'+kind+'.png'})
  expect(value.selected).toBe('example-'+kind);expect(value.boardOnly).toBe(true);expect(value.tabs).toBe(0);expect(value.header).toBe(value.selected);expect(value.renderOwner).toBe(value.selected);expect(value.renderBoardOnly).toBe('true');expect(value.renderMode).toBe('research');expect(value.canvasOwner).toBeUndefined();expect(value.sourceMode).toBe('notes');expect(value.sourceDraft).toBe('原会话草稿和技能不得改变😀');expect(f.store.load('owner','source').saved.title).toBe(title);expect(value.operations.some(row=>row.action==='favorite.add'&&row.input.dedicated===true)).toBe(true);expect(value.steps).toContain(kind==='board'?'mount-board':'workbench:mount');expect(value.extraBlank).toBe(0);expect(value.sent).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},22000)

it.each(['release','escape','explore'])('keeps a tabless dedicated entry pending for its actual rendered session and handles %s without consuming stale Notes content',async action=>{
 const f=await fixture({explore:true,sourceView:'notes',nativeBoards:true,holdResidentOwner:true,prepareDelay:0}),{page}=f;try{
  await beginExplore(page,0);await page.waitForFunction(()=>window.entryProbe.sessions.list.getSnapshot().current==='example-board'&&document.querySelector('[data-srb-session-header]')?.dataset.eworkNotesSession==='example-board',{},{timeout:10000});await page.waitForTimeout(180)
  expect(await page.locator('[data-home-guide]').count()).toBe(0);expect(await page.evaluate(()=>window.entryProbe.nativeSteps??[])).toEqual([]);expect(await page.locator('.pI_x6G_centerCol .wSkVaW_root').getAttribute('data-home-guide-view-session')).toBe('source');expect(await page.locator('[data-srb-tabs]').count()).toBe(0)
  if(action==='release'){await page.evaluate(()=>window.entryProbe.releaseResidentOwner());await page.locator('[data-home-guide-kind="board"]').waitFor({timeout:7000});expect(await page.locator('[data-home-guide-resident]').getAttribute('data-home-guide-view-session')).toBe('example-board');expect(await page.evaluate(()=>window.entryProbe.nativeSteps)).toContain('mount-board')}
  else{if(action==='escape')await page.keyboard.press('Escape');else await page.getByRole('button',{name:'探索',exact:true}).click();await expect.poll(()=>page.locator('[data-home-guide-pointer]').count()).toBe(0);await page.evaluate(()=>window.entryProbe.releaseResidentOwner());await page.waitForTimeout(150);expect(await page.locator('[data-home-guide]').count()).toBe(0);expect(await page.evaluate(()=>window.entryProbe.nativeSteps??[])).toEqual([])}
  expect(await page.evaluate(()=>window.entryProbe.shellFor('source').snapshot.draft)).toBe('原会话草稿和技能不得改变😀');expect(await page.evaluate(()=>window.entryProbe.extraBlank??0)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},22000)
