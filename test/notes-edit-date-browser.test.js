import {afterAll,beforeAll,expect,it,vi} from 'vitest'
import {build} from 'esbuild'
import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {NotesStore} from '../src/main/notes/store'

let browser,script
const firstDay='2026-10-20T16:05:00Z',secondDay='2026-10-21T16:05:00Z',thirdDay='2026-10-22T16:05:00Z'
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import{mountNotes}from'./src/preload/notes/mount';import{BlockNoteEditor}from'@blocknote/core';import{YjsThreadStore,blocksToYDoc}from'@blocknote/core/yjs';import*as Y from'yjs';import{DefaultThreadStoreAuth}from'@blocknote/core/comments';import{findChallengeQuote}from'./src/preload/notes/challenge-anchors';import{CHALLENGE_KIND,CHALLENGE_USER}from'./src/preload/notes/challenge-controller';
  window.jobs={};window.calls=[];const bridge={request:async(method,input)=>{window.calls.push({method,input});if(method==='challenge')return new Promise(resolve=>window.jobs[input.requestId]={input,resolve});return window.noteTestRequest(method,input)},draft:input=>window.noteTestDraft(input)};
  const host={register:(_mode,surface)=>{surface.style.left='0';document.body.append(surface)},open:()=>{},close:()=>{},current:()=>'notes'};let mounted;window.remount=()=>{mounted.dispose();mounted=mountNotes(document,bridge,host)};
  void(async()=>{const seed=await window.noteTestLegacySeed();if(seed){const serialize=content=>{if(!seed.realYjs)return content;const model=BlockNoteEditor.create(),doc=blocksToYDoc(model,content.blocks,'note');try{let text='';for(const byte of Y.encodeStateAsUpdate(doc))text+=String.fromCharCode(byte);return{...content,yjs:btoa(text)}}finally{doc.destroy();model._tiptapEditor.destroy()}};await window.noteTestPersistLegacy({saved:serialize(seed.saved),draft:seed.draft?serialize(seed.draft):undefined})}mounted=mountNotes(document,bridge,host)})();
  window.switchNote=id=>{document.querySelector('[data-ework-notes-session]').dataset.eworkNotesSession=id;document.querySelector('[data-ework-note-view]').dataset.eworkNoteView=id;document.dispatchEvent(new CustomEvent('sherlock:notes-open',{detail:{sessionId:id}}))};
  window.seedChallenge=async()=>{const block=window.editor.document.find(b=>b.content?.some(c=>c.text?.includes('成度'))),quote='成度',issue={blockId:block.id,quote,category:'typo',message:'请核对用字。',evidence:[]},store=new YjsThreadStore(CHALLENGE_USER,window.noteDoc.getMap('threads'),new DefaultThreadStoreAuth(CHALLENGE_USER,'editor'));const thread=await store.createThread({metadata:{kind:CHALLENGE_KIND,issue,sourceText:block.content.map(c=>c.text||'').join('')},initialComment:{body:[{type:'paragraph',content:[{type:'text',text:issue.message,styles:{}}]}]}});const range=findChallengeQuote(window.editor,block.id,quote);window.editor.transact(tr=>tr.setMeta('addToHistory',false).addMark(range.from,range.to,tr.doc.type.schema.marks.comment.create({threadId:thread.id,orphan:false})));return thread.id};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'inline-production-styles',setup(b){b.onResolve({filter:/\.css\?inline$/},async args=>{const found=await b.resolve(args.path.slice(0,-7),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}},{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.editor=editor;window.noteDoc=doc;window.challenge=challenge;window.systemUpdate=updateSystemComponent; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())

async function fixture({legacy=false,legacyDraft=false,legacyContent,legacyDraftContent}={}){
 const folder=await mkdtemp(join(tmpdir(),'notes-edit-date-')),store=new NotesStore(folder),control={failSaves:false},errors=[]
 const legacySeed=legacy||legacyDraft||legacyContent||legacyDraftContent?{saved:legacyContent||{title:'原有笔记',blocks:[{id:'legacy',type:'paragraph',content:'已保存的真实内容。'}],yjs:''},draft:legacyDraft||legacyDraftContent?legacyDraftContent||{title:'原有离线草稿',blocks:[{id:'legacy-draft',type:'paragraph',content:'以前离线保存的正文。'}],yjs:''}:undefined,realYjs:!!(legacyContent||legacyDraftContent)}:undefined
 const context=await browser.newContext({viewport:{width:2000,height:900},timezoneId:'Asia/Shanghai'}),page=await context.newPage()
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(5000)
 await page.exposeFunction('noteTestLegacySeed',()=>legacySeed)
 await page.exposeFunction('noteTestPersistLegacy',seed=>{const clock=vi.spyOn(Date,'now').mockReturnValue(new Date(firstDay).getTime());try{store.save('owner','date-note',0,seed.saved,'legacy');if(seed.draft){clock.mockReturnValue(new Date(secondDay).getTime());store.draft('owner','date-note','old-client',1,seed.draft)}}finally{clock.mockRestore()}})
 await page.exposeFunction('noteTestRequest',(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save'){if(control.failSaves)throw Error('离线保存');return store.save('owner',input.sessionId,input.revision,input.content,input.clientId)}if(method==='discard')return store.discardDraft('owner',input.sessionId,input.clientId);return{}})
 await page.exposeFunction('noteTestDraft',input=>store.draft('owner',input.sessionId,input.clientId,input.revision,input.content))
 await page.route('http://127.0.0.1/edit-date',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><span data-ework-notes-session="date-note"></span><div data-ework-note-view="date-note"></div>'}))
 await page.goto('http://127.0.0.1/edit-date');await page.clock.setFixedTime(new Date(firstDay));await page.addScriptTag({content:script});await page.locator('.bn-editor').waitFor()
 return{page,store,control,errors,close:async()=>{await context.close();await rm(folder,{recursive:true,force:true})}}
}
async function saved(f,session='date-note'){await expect.poll(()=>f.store.load('owner',session).draft).toBeUndefined();await expect.poll(()=>f.page.evaluate(()=>document.querySelector('.en-document .en-edit-date')?.textContent)).not.toBeUndefined();await f.page.waitForTimeout(850);expect(f.store.load('owner',session).draft).toBeUndefined()}
async function date(page,label){await expect.poll(()=>page.locator('.en-edit-date').textContent()).toBe(label)}
async function writeBody(page){await page.evaluate(()=>window.editor.updateBlock(window.editor.document[0].id,{content:'这项结论的成度较高。'}))}

it('hides an untouched blank note, then immediately records actual title/body edits using the local calendar below the title',async()=>{
 const f=await fixture();try{
  expect(await f.page.locator('.en-edit-date').count()).toBe(0);await f.page.waitForTimeout(900);expect(f.store.load('owner','date-note').saved.updatedAt).toBe(0)
  await f.page.getByRole('textbox',{name:'笔记标题',exact:true}).fill('真实编辑的笔记');await date(f.page,'编辑于2026年10月21日')
  expect(await f.page.locator('.en-edit-date').getAttribute('datetime')).toBe('2026-10-21')
  await saved(f);await f.page.clock.setFixedTime(new Date(secondDay));await writeBody(f.page);await date(f.page,'编辑于2026年10月22日');await saved(f)
  for(const dark of [false,true]){
   await f.page.locator('.en-root').evaluate((el,dark)=>el.dataset.dark=String(dark),dark)
   const style=await f.page.locator('.en-edit-date').evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect(),title=el.previousElementSibling.getBoundingClientRect(),body=el.parentElement.querySelector('.bn-container').getBoundingClientRect();return{font:s.fontFamily,size:s.fontSize,line:s.lineHeight,weight:s.fontWeight,color:s.color,align:s.textAlign,left:r.left,titleLeft:title.left,top:r.top,titleBottom:title.bottom,bottom:r.bottom,bodyTop:body.top}})
   expect(style).toMatchObject({size:'12px',line:'19px',weight:'400',align:'left',color:dark?'rgb(160, 163, 172)':'rgb(139, 142, 150)'});expect(style.font).toContain('Noto Sans SC');expect(style.left).toBe(style.titleLeft);expect(style.top-style.titleBottom).toBe(8);expect(style.bodyTop-style.bottom).toBe(26)
  }
  await f.page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en');await date(f.page,'Edited on October 22, 2026');expect(await f.page.locator('.en-edit-date').getAttribute('datetime')).toBe('2026-10-22');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('keeps edit dates stable across comments, challenge preferences, cursor moves, autosave, reopening, and note switching',async()=>{
 const f=await fixture();try{
  await writeBody(f.page);await date(f.page,'编辑于2026年10月21日');await saved(f)
  await f.page.clock.setFixedTime(new Date(secondDay));await f.page.evaluate(()=>{window.editor.setTextCursorPosition(window.editor.document[0].id,'end');window.challenge.setMarginExpanded(false);window.challenge.setLevel(1)})
  const thread=await f.page.evaluate(()=>window.seedChallenge());await f.page.evaluate(id=>window.challenge.setDraft(id,'保留未发送的讨论草稿。'),thread)
  await date(f.page,'编辑于2026年10月21日');await f.page.keyboard.press('Meta+s');await saved(f)
  await f.page.evaluate(()=>window.remount());await f.page.locator('.bn-editor').waitFor();await date(f.page,'编辑于2026年10月21日');expect(await f.page.locator('.en-recovery').count()).toBe(0)
  expect(await f.page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('metadata').draft,thread)).toBe('保留未发送的讨论草稿。')
  await f.page.evaluate(()=>window.switchNote('second-note'));await f.page.locator('[data-note-source-session="second-note"] .bn-editor').waitFor();expect(await f.page.locator('.en-edit-date').count()).toBe(0)
  await f.page.getByRole('textbox',{name:'笔记标题',exact:true}).fill('另一篇独立笔记');await date(f.page,'编辑于2026年10月22日');await saved(f,'second-note')
  await f.page.evaluate(()=>window.switchNote('date-note'));await f.page.locator('[data-note-source-session="date-note"] .bn-editor').waitFor();await date(f.page,'编辑于2026年10月21日');expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('updates for formatting and accepted AI optimization, while retaining its date through a genuine offline draft recovery',async()=>{
 const f=await fixture();try{
  await writeBody(f.page);await saved(f);await f.page.clock.setFixedTime(new Date(secondDay))
  await f.page.evaluate(()=>window.editor.updateBlock(window.editor.document[0].id,{props:{textAlignment:'center'}}));await date(f.page,'编辑于2026年10月22日');await saved(f)
  await f.page.clock.setFixedTime(new Date(thirdDay));await f.page.evaluate(()=>window.seedChallenge());await f.page.locator('.en-challenge-card').waitFor();await date(f.page,'编辑于2026年10月22日')
  await f.page.getByRole('button',{name:'AI优化',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>Object.keys(window.jobs).length)).toBe(1)
  await f.page.evaluate(()=>Object.values(window.jobs).at(-1).resolve({version:1,issues:[],coveredBlockIds:[],checks:[],reply:{text:'修正用字。',replacement:'程度'}}));await f.page.getByRole('button',{name:'替换到原文',exact:true}).waitFor();await date(f.page,'编辑于2026年10月22日');await f.page.getByRole('button',{name:'替换到原文',exact:true}).click();await date(f.page,'编辑于2026年10月23日');await saved(f)
  f.control.failSaves=true;await f.page.clock.setFixedTime(new Date('2026-10-23T16:05:00Z'));await f.page.getByRole('textbox',{name:'笔记标题',exact:true}).fill('离线草稿的标题');await date(f.page,'编辑于2026年10月24日');await expect.poll(()=>f.store.load('owner','date-note').draft?.title).toBe('离线草稿的标题');await f.page.waitForTimeout(850)
  await f.page.evaluate(()=>window.remount());await f.page.locator('.en-recovery').waitFor();f.control.failSaves=false;await f.page.getByRole('button',{name:'恢复草稿',exact:true}).click();await expect.poll(()=>f.page.locator('.en-recovery').count()).toBe(0);await date(f.page,'编辑于2026年10月24日');expect(await f.page.getByRole('textbox',{name:'笔记标题',exact:true}).inputValue()).toBe('离线草稿的标题');expect(f.store.load('owner','date-note').draft).toBeUndefined();expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('retains a known legacy save date without creating a draft merely by opening it',async()=>{
 const f=await fixture({legacy:true});try{
  await f.page.clock.setFixedTime(new Date(thirdDay));await date(f.page,'编辑于2026年10月21日');await f.page.waitForTimeout(900);expect(f.store.load('owner','date-note').draft).toBeUndefined();expect(f.store.load('owner','date-note').saved.revision).toBe(1)
  await f.page.evaluate(()=>window.challenge.setMarginExpanded(false));await saved(f);await f.page.evaluate(()=>window.remount());await f.page.locator('.bn-editor').waitFor();await date(f.page,'编辑于2026年10月21日');expect(await f.page.locator('.en-recovery').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('persists background component refreshes without claiming a content edit, then dates an actual user component change',async()=>{
 const f=await fixture();try{
  await f.page.evaluate(()=>window.editor.insertBlocks([{id:'component',type:'research',props:{payload:JSON.stringify({id:'note-component',title:'组件草稿',noteDraft:'smart',containerPrompt:'',generationStatus:'draft'})}}],window.editor.document[0],'after'));await date(f.page,'编辑于2026年10月21日');await saved(f)
  await f.page.clock.setFixedTime(new Date(secondDay));await f.page.evaluate(()=>window.systemUpdate('component',{...JSON.parse(window.editor.getBlock('component').props.payload),refreshTime:Date.now()}));await saved(f);await date(f.page,'编辑于2026年10月21日')
  // A subsequent preference save must not rediscover the earlier system mutation as user content.
  await f.page.evaluate(()=>window.challenge.setMarginExpanded(false));await saved(f);await date(f.page,'编辑于2026年10月21日')
  await f.page.evaluate(()=>window.editor.updateBlock('component',{props:{payload:JSON.stringify({...JSON.parse(window.editor.getBlock('component').props.payload),title:'用户修改的组件标题'})}}));await date(f.page,'编辑于2026年10月22日');await saved(f);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('preserves the known original date and cleanup of a pre-feature recovery draft when explicitly restored later',async()=>{
 const f=await fixture({legacyDraft:true});try{
  await f.page.locator('.en-recovery').waitFor();await f.page.clock.setFixedTime(new Date(thirdDay));await date(f.page,'编辑于2026年10月21日');expect(f.store.load('owner','date-note').draft.title).toBe('原有离线草稿')
  await f.page.getByRole('button',{name:'恢复草稿',exact:true}).click();await expect.poll(()=>f.page.locator('.en-recovery').count()).toBe(0);await date(f.page,'编辑于2026年10月22日');expect(await f.page.getByRole('textbox',{name:'笔记标题',exact:true}).inputValue()).toBe('原有离线草稿');expect(f.store.load('owner','date-note').draft).toBeUndefined()
  await f.page.evaluate(()=>window.remount());await f.page.locator('.bn-editor').waitFor();await date(f.page,'编辑于2026年10月22日');expect(await f.page.locator('.en-recovery').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

const legacyStructures=[
 ['table',{id:'legacy-table',type:'table',content:{type:'tableContent',rows:[{cells:[[{type:'text',text:'指标',styles:{}}],[{type:'text',text:'数值',styles:{}}]]},{cells:[[{type:'text',text:'留存率',styles:{}}],[{type:'text',text:'83%',styles:{}}]]}]}}],
 ['image',{id:'legacy-image',type:'image',props:{url:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"%3E%3Crect width="20" height="20" fill="gray"/%3E%3C/svg%3E',name:'原有图片',caption:''}}]
]
for(const[kind,block]of legacyStructures){
 it(`inherits the known edit date of an untitled legacy ${kind} without creating a recovery draft`,async()=>{
  const content={title:'',blocks:[block],yjs:''},f=await fixture({legacyContent:content});try{
   await f.page.clock.setFixedTime(new Date(thirdDay));await date(f.page,'编辑于2026年10月21日');await f.page.locator(`.bn-block-content[data-content-type="${kind}"]`).waitFor();expect(await f.page.getByRole('textbox',{name:'笔记标题',exact:true}).inputValue()).toBe('')
   await f.page.waitForTimeout(850);expect(f.store.load('owner','date-note').saved).toMatchObject({title:'',blocks:[block],revision:1});expect(f.store.load('owner','date-note').draft).toBeUndefined()
   await f.page.evaluate(()=>window.challenge.setMarginExpanded(false));await saved(f);await f.page.evaluate(()=>window.remount());await f.page.locator('.bn-editor').waitFor();await date(f.page,'编辑于2026年10月21日');expect(await f.page.locator('.en-recovery').count()).toBe(0);expect(f.errors).toEqual([])
  }finally{await f.close()}
 },15000)
 it(`restores an untitled legacy ${kind} draft with its original date while excluding an untouched empty paragraph`,async()=>{
  const content={title:'',blocks:[block],yjs:''},f=await fixture({legacyContent:{title:'',blocks:[{id:'empty',type:'paragraph',content:[]}],yjs:''},legacyDraftContent:content});try{
   await f.page.locator('.en-recovery').waitFor();await f.page.clock.setFixedTime(new Date(thirdDay));expect(await f.page.locator('.en-edit-date').count()).toBe(0)
   await f.page.getByRole('button',{name:'恢复草稿',exact:true}).click();await expect.poll(()=>f.page.locator('.en-recovery').count()).toBe(0);await date(f.page,'编辑于2026年10月22日');await f.page.locator(`.bn-block-content[data-content-type="${kind}"]`).waitFor();expect(f.store.load('owner','date-note').saved.blocks).toEqual([block]);expect(f.store.load('owner','date-note').draft).toBeUndefined()
   await f.page.evaluate(()=>window.remount());await f.page.locator('.bn-editor').waitFor();await date(f.page,'编辑于2026年10月22日');expect(await f.page.locator('.en-recovery').count()).toBe(0);expect(f.errors).toEqual([])
  }finally{await f.close()}
 },15000)
}
