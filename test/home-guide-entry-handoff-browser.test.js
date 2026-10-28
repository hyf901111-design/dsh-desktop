import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises'
import {join,dirname} from 'node:path'
import {tmpdir} from 'node:os'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {patchHomeGuideNative} from '../scripts/lib/home-guide-native.mjs'
import {stripWorkbenchReplay} from './fixtures/strip-workbench-replay.mjs'
import {NotesStore} from '../src/main/notes/store'
import {homeGuidePlaybackFixture} from './fixtures/home-guide-playback.js'
let browser,script,css,runtime,conversation,theme
const output='/tmp/home-guide-entry-handoff-20261026'
beforeAll(async()=>{
 runtime=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 conversation=patchHomeGuideNative(stripWorkbenchReplay(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))).replace('exports.apply = apply;','exports.apply = apply;exports.__InputBar=InputBar;exports.__header=ConversationSessionHeader;exports.__register=registerConversationNodes;exports.__createChatStore=createChatStore;')
 theme=(await Promise.all(['figma-final-shell','figma-home','figma-panels','figma-reading','figma-refinements'].map(name=>readFile('src/preload/'+name+'.css','utf8')))).join('\n')
 const result=await build({entryPoints:['test/fixtures/home-guide-entry-handoff-browser.tsx'],bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.svg':'dataurl','.woff':'dataurl','.woff2':'dataurl'},plugins:[homeGuidePlaybackFixture(),{name:'inline-css',setup(b){b.onResolve({filter:/\.css\?(inline|raw)$/},async args=>{const found=await b.resolve(args.path.replace(/\?(inline|raw)$/, ''),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>{const source=await readFile(args.path,'utf8');if(!source.includes('@import'))return{contents:source,loader:'text'};const bundled=await build({entryPoints:[args.path],bundle:true,conditions:['browser','import','style'],write:false,outfile:'note.css',logLevel:'silent',loader:{'.svg':'dataurl','.woff':'dataurl','.woff2':'dataurl'}});return{contents:bundled.outputFiles.find(file=>file.path.endsWith('.css')).text,loader:'text'}})}}]})
 script=result.outputFiles.find(file=>file.path.endsWith('.js')).text;css=result.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'});await mkdir(output,{recursive:true})
},60000)
afterAll(()=>browser?.close())
async function fixture(options={}){
 const directory=await mkdtemp(join(tmpdir(),'entry-handoff-')),store=new NotesStore(directory),context=await browser.newContext({viewport:{width:1100,height:860},reducedMotion:'no-preference'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(4500);page.on('pageerror',error=>errors.push(error.stack))
 await page.exposeFunction('entryNotesStorage',async(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft')return store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);if(method==='engage')return{ok:true};throw Error('入口不应请求其他操作：'+method)})
 await page.route('http://127.0.0.1/entry-handoff',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><main class="pI_x6G_centerCol"><div id="native-root"></div></main>'}));await page.goto('http://127.0.0.1/entry-handoff');await page.addStyleTag({content:theme+'\n'+css+'\nhtml,body{margin:0;height:100%;font-family:system-ui}.pI_x6G_centerCol{position:relative;width:1000px;height:100vh}#native-root{height:100%;min-height:0}'});await page.evaluate(input=>window.entryInput=input,{runtime,conversation,...options});await page.addScriptTag({content:script});await page.locator('textarea').waitFor().catch(async error=>{throw Error(error.message+' '+errors.join('\n')+' BODY '+await page.locator('body').innerText())});return{page,context,errors,store,async close(){await page.evaluate(()=>window.entryProbe.dispose()).catch(()=>{});await context.close();await rm(directory,{recursive:true,force:true})}}
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
  expect(await page.evaluate(()=>window.entryProbe.sessions.list.getSnapshot().current)).toBe('source');expect(await page.evaluate(()=>window.entryProbe.requests.map(r=>r.command))).toEqual(['prepare'])
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
