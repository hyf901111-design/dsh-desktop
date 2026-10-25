import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {parse} from '@babel/parser'
import * as Y from 'yjs'
import {YjsThreadStore,blocksToYDoc} from '@blocknote/core/yjs'
import {BlockNoteEditor} from '@blocknote/core'
import {DefaultThreadStoreAuth} from '@blocknote/core/comments'
import {PNG} from 'pngjs'
import {NotesStore} from '../src/main/notes/store'
import {homeGuidePlaybackFixture} from './fixtures/home-guide-playback.js'

let browser,script,css
beforeAll(async()=>{
 const output=await build({entryPoints:['test/fixtures/home-note-handoff-browser.tsx'],bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[
  {name:'handoff-only-scenes',setup(b){b.onLoad({filter:/src\/preload\/home-guides\.ts$/},async args=>{const source=await readFile(args.path,'utf8'),ast=parse(source,{sourceType:'module',plugins:['typescript']}),examples=ast.program.body.flatMap(node=>node.type==='VariableDeclaration'?node.declarations:[]).find(node=>node.id.name==='EXAMPLES'),note=examples.init.properties.find(node=>node.key.name==='note'),steps=note.value.properties.find(node=>node.key.name==='steps').value;return{loader:'ts',resolveDir:dirname(args.path),contents:source.slice(0,steps.start)+JSON.stringify([['fixture-saved','已保存笔记','交接夹具，不运行AI演员',0],['fixture-top','回到顶部','验证真实交接',0]])+source.slice(steps.end)}})}},
  homeGuidePlaybackFixture(),
  {name:'inline-styles',setup(b){b.onResolve({filter:/\.css\?(inline|raw)$/},async args=>{const found=await b.resolve(args.path.replace(/\?(inline|raw)$/, ''),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>{const source=await readFile(args.path,'utf8');if(!source.includes('@import'))return{contents:source,loader:'text'};const bundled=await build({entryPoints:[args.path],conditions:['browser','import','style'],bundle:true,write:false,outfile:'note.css',logLevel:'silent',loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'}});return{contents:bundled.outputFiles.find(file=>file.path.endsWith('.css')).text,loader:'text'}})}}
 ]});script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(()=>browser?.close())
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'notes-handoff-')),store=new NotesStore(directory),blocks=Array.from({length:30},(_,index)=>({id:'saved-'+index,type:'paragraph',content:index===0?'确认保存的研究结论📈':('第'+index+'段：原始资料与研究判断需要保持。').repeat(5)})),doc=blocksToYDoc(BlockNoteEditor.create(),blocks,'note'),threads=new YjsThreadStore('me',doc.getMap('threads'),new DefaultThreadStoreAuth('me','editor'))
 await threads.createThread({metadata:{kind:'handoff-fixture'},initialComment:{body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'必须保留的原始批注'}]}]}}})
 const saved=store.save('owner','A',0,{title:'已保存的研究笔记',blocks,yjs:Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')})
 store.save('owner','B',0,{title:'另一个会话的笔记',blocks:[{id:'other',type:'paragraph',content:'原有正文'}],yjs:''});store.draft('owner','B','original-client',1,{title:'另一个会话未保存的标题',blocks:[{id:'other',type:'paragraph',content:'必须原样保留的另一份草稿'}],yjs:''});const beforeB=store.load('owner','B')
 const context=await browser.newContext({viewport:{width:1120,height:780},reducedMotion:'no-preference'}),page=await context.newPage(),errors=[],requests=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.exposeFunction('noteStorageRequest',async(method,input)=>{requests.push({method,sessionId:input.sessionId});if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft'){store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);return}if(method==='discard'){store.discardDraft('owner',input.sessionId,input.clientId);return}if(['engage','stop'].includes(method))return{ok:true};throw Error('交接夹具不允许模型或额外服务：'+method)})
 await page.route('http://127.0.0.1/note-handoff',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e5e5e5;font-family:system-ui}.pI_x6G_centerCol{position:absolute;left:20px;top:10px;width:800px;height:760px;overflow:hidden;background:#f2f2f2}.wSkVaW_root{height:100%;position:relative}.wSkVaW_header{height:44px;display:flex;align-items:center;justify-content:space-between}.wSkVaW_header button{height:30px}#resident{height:calc(100% - 44px)}#original-composer{margin:20px;width:500px;height:100px}</style><main class="pI_x6G_centerCol"><div class="wSkVaW_root" data-odyssey-page="home"><header class="wSkVaW_header" data-srb-session-header data-ework-notes-session="B"><div data-srb-tabs><button data-conversation-view-id="chat">对话</button><button data-conversation-view-id="notes" aria-selected="true">笔记</button></div><div data-en-challenge-tools="B"></div></header><div id="resident"><textarea id="original-composer">另一会话的普通输入草稿📌</textarea><div data-ework-note-view="B"></div></div></div></main>'}))
 await page.route('http://127.0.0.1/sherlock-research.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));await page.goto('http://127.0.0.1/note-handoff');if(css)await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('[data-note-editor-session="B"] .bn-editor').waitFor();await page.evaluate(()=>window.originalComposer=document.querySelector('#original-composer'))
 return{page,store,requests,errors,beforeB,saved,close:async()=>{await page.evaluate(()=>window.handoff.dispose()).catch(()=>{});await context.close();await rm(directory,{recursive:true,force:true})}}
}
const threadState=content=>{const doc=new Y.Doc();Y.applyUpdate(doc,Buffer.from(content.yjs,'base64'));return doc.getMap('threads').toJSON()}
it('keeps the real guide visible until the saved ordinary NotesApp is ready, then hands off without empty frames or duplicate header controls',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>window.handoff.begin());await expect.poll(()=>page.evaluate(()=>window.handoff.held),{timeout:6000}).toBe(true)
  expect(await page.locator('[data-home-guide] .bn-editor').count()).toBe(1);expect(await page.locator('[data-workspace-surface="notes"]').isVisible()).toBe(false);expect(await page.locator('[data-home-guide] .en-title').inputValue()).toBe('已保存的研究笔记')
  await page.waitForTimeout(100);const before=await page.screenshot({clip:{x:260,y:160,width:480,height:220}});await page.evaluate(()=>window.handoff.release());await expect.poll(()=>page.locator('[data-home-guide]').count()).toBe(0);await page.locator('[data-note-editor-session="A"] .bn-editor').waitFor({state:'visible'});await page.waitForTimeout(100)
  const allFrames=await page.evaluate(()=>window.handoff.frames.filter(frame=>frame.started)),frames=allFrames.slice(allFrames.findIndex(frame=>frame.guide));await mkdir('/tmp/notes-handoff-browser-20261025',{recursive:true});await writeFile('/tmp/notes-handoff-browser-20261025/frames.json',JSON.stringify(frames,null,2));await writeFile('/tmp/notes-handoff-browser-20261025/before.png',before);expect(frames.length).toBeGreaterThan(8);expect(frames.filter(frame=>!frame.guide&&!frame.normal)).toEqual([]);expect(frames.filter(frame=>frame.normal&&(!frame.editor||frame.loading||!frame.editorTextLength||frame.title!=='已保存的研究笔记'))).toEqual([]);expect(Math.max(...frames.map(frame=>frame.pickers))).toBe(1)
  const after=await page.screenshot({clip:{x:260,y:160,width:480,height:220}}),ink=buffer=>{const png=PNG.sync.read(buffer);let count=0;for(let at=0;at<png.data.length;at+=4)if(Math.max(png.data[at],png.data[at+1],png.data[at+2])<160)count++;return count};expect(ink(before)).toBeGreaterThan(300);expect(ink(after)).toBeGreaterThan(300)
  const result=await page.evaluate(()=>({callbacks:window.handoff.callbacks,surface:window.handoff.surface(),positions:window.handoff.scrollPositions,original:window.originalComposer===document.querySelector('#original-composer'),draft:document.querySelector('#original-composer').value}));expect(result.callbacks).toEqual([{signalAborted:false,guidePresent:false}]);expect(result.surface).toBe('notes');expect(result.positions.filter(value=>value>0).length).toBeGreaterThan(8);expect(result.positions.at(-1)).toBe(0);expect(result.original).toBe(true);expect(result.draft).toBe('另一会话的普通输入草稿📌')
  const current=f.store.load('owner','A');expect(current.saved.title).toBe('已保存的研究笔记');expect(threadState(current.saved)).toEqual(threadState(f.saved.saved));expect(f.store.load('owner','B')).toEqual(f.beforeB);expect(f.errors).toEqual([])
  await mkdir('/tmp/notes-handoff-browser-20261025',{recursive:true});await writeFile('/tmp/notes-handoff-browser-20261025/before.png',before);await writeFile('/tmp/notes-handoff-browser-20261025/after.png',after);await writeFile('/tmp/notes-handoff-browser-20261025/frames.json',JSON.stringify(frames,null,2))
  await page.locator('[data-note-editor-session="A"] .en-title').fill('已保存的研究笔记 · 后续编辑');await expect.poll(()=>f.store.load('owner','A').saved.title).toBe('已保存的研究笔记 · 后续编辑');expect(threadState(f.store.load('owner','A').saved)).toEqual(threadState(f.saved.saved));expect(f.store.load('owner','B')).toEqual(f.beforeB)
 }finally{await f.close()}
},25000)
it.each(['cancel','reset','A-B-A'])('does not let a deferred preload reopen a stale Notes surface after %s',async action=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>window.handoff.begin());await expect.poll(()=>page.evaluate(()=>window.handoff.held),{timeout:6000}).toBe(true)
  await page.evaluate(async action=>{if(action==='cancel'){await window.handoff.cancel();window.handoff.select('A','chat')}else if(action==='reset')window.handoff.resetIdentity();else{window.handoff.select('B','chat');window.handoff.select('A','chat')}},action)
  await page.evaluate(()=>window.handoff.release());await page.waitForTimeout(150);expect(await page.evaluate(()=>window.handoff.callbacks)).toEqual([]);expect(await page.evaluate(()=>window.handoff.surface())).not.toBe('notes');expect(f.store.load('owner','B')).toEqual(f.beforeB);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
