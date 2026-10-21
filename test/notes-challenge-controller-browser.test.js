import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

let browser,script
const original='这项结论的成度较高。'
const answer={version:1,issues:[],coveredBlockIds:[],checks:[],reply:{text:'目前没有实际来源，无法核实这项判断。'}}
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountNotes}from'./src/preload/notes/mount';import{YjsThreadStore}from'@blocknote/core/yjs';import{DefaultThreadStoreAuth}from'@blocknote/core/comments';import{findChallengeQuote}from'./src/preload/notes/challenge-anchors';import{CHALLENGE_KIND,CHALLENGE_USER}from'./src/preload/notes/challenge-controller';import{noteText}from'./src/shared/workspace-notes';import*as Y from'yjs';
 window.calls=[];window.jobs=[];window.saved={};window.drafts={};window.completed=0;
 const bridge={request:async(method,input)=>{window.calls.push({method,input});if(method==='load')return{saved:window.saved[input.sessionId]?{...window.saved[input.sessionId],revision:0}:{title:input.sessionId,blocks:[{id:'p',type:'paragraph',content:${JSON.stringify(original)}}],yjs:'',revision:0}};if(method==='challenge')return new Promise((resolve,reject)=>window.jobs.push({input,resolve,reject}));if(method==='save'){window.saved[input.sessionId]=input.content;return{status:'saved',saved:{...input.content,revision:input.revision+1}}}return{}},draft:async input=>{window.drafts[input.sessionId]=input.content}};
 const host={register:(_mode,surface)=>{surface.style.left='0';document.body.append(surface)},open:()=>{},close:()=>{},current:()=>'notes'};let mounted=mountNotes(document,bridge,host);window.remount=()=>{mounted.dispose();mounted=mountNotes(document,bridge,host)};
 window.switchNote=id=>{document.querySelector('[data-ework-notes-session]').dataset.eworkNotesSession=id;document.querySelector('[data-ework-note-view]').dataset.eworkNoteView=id;document.dispatchEvent(new CustomEvent('sherlock:notes-open',{detail:{sessionId:id}}))};
 window.messages=()=>window.challenge.threads[0]?.comments.filter(c=>!c.deletedAt).map(c=>noteText(c.body))||[];
 window.savedMessages=()=>{const doc=new Y.Doc();Y.applyUpdate(doc,Uint8Array.from(atob(window.drafts['note-a'].yjs),c=>c.charCodeAt(0)));return[...doc.getMap('threads').values()].flatMap(thread=>thread.get('comments').toArray().map(comment=>noteText(comment.get('body'))))};
 window.start=(kind='reply',text='请核实来源')=>{window.challenge.runAction(window.challenge.threads[0],kind,text).then(()=>window.completed++)};
 window.seed=async(override={})=>{const issue={blockId:'p',quote:'成度',category:'typo',message:'请核对这段用字。',evidence:[],...override},store=new YjsThreadStore(CHALLENGE_USER,window.noteDoc.getMap('threads'),new DefaultThreadStoreAuth(CHALLENGE_USER,'editor'));const thread=await store.createThread({metadata:{kind:CHALLENGE_KIND,issue,sourceText:window.editor.getBlock(issue.blockId).content.map(c=>c.text||'').join('')},initialComment:{body:[{type:'paragraph',content:[{type:'text',text:issue.message,styles:{}}]}]}});const range=findChallengeQuote(window.editor,issue.blockId,issue.quote);window.editor.transact(tr=>tr.setMeta('addToHistory',false).addMark(range.from,range.to,tr.doc.type.schema.marks.comment.create({threadId:thread.id,orphan:false})));return thread.id};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'inline-production-styles',setup(b){b.onResolve({filter:/\.css\?inline$/},async args=>{const found=await b.resolve(args.path.slice(0,-7),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}},{name:'expose-controller',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.editor=editor;window.challenge=challenge;window.noteDoc=doc; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(){
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[]
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(5000)
 await page.route('http://127.0.0.1/challenge-controller',route=>route.fulfill({contentType:'text/html',body:'<span data-ework-notes-session="note-a"></span><div data-ework-note-view="note-a"></div>'}))
 await page.goto('http://127.0.0.1/challenge-controller');await page.addScriptTag({content:script});await page.locator('.bn-editor').waitFor()
 await expect.poll(()=>page.evaluate(()=>!!window.challenge)).toBe(true)
 await page.evaluate(original=>window.editor.replaceBlocks(window.editor.document,[{id:'p',type:'paragraph',content:original}]),original)
 const id=await page.evaluate(()=>window.seed());await expect.poll(()=>page.evaluate(()=>window.challenge.threads.length)).toBe(1)
 return{context,page,errors,id}
}
async function finish(page,value=answer,index=0){await page.evaluate(({value,index})=>window.jobs[index].resolve(value),{value,index})}
async function start(page,kind='reply',text='请核实来源'){await page.evaluate(({kind,text})=>window.start(kind,text),{kind,text});await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)}

it('publishes and saves a sent message before the deferred reply, blocks duplicate actions, and keeps a new draft',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.evaluate(id=>window.challenge.setDraft(id,'请核实来源'),id)
  await start(page)
  expect(await page.evaluate(()=>({busy:window.challenge.busyId,kind:window.challenge.actionKind,messages:window.messages(),draft:window.challenge.threads[0].metadata.draft}))).toEqual({busy:id,kind:'reply',messages:['请核对这段用字。','请核实来源'],draft:''})
  expect(await page.evaluate(()=>window.savedMessages())).toContain('请核实来源')
  await page.evaluate(id=>{window.start('reply','重复发送');window.start('optimize');window.challenge.setDraft(id,'等待时继续写的新草稿')},id)
  expect(await page.evaluate(()=>window.jobs.length)).toBe(1)
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(original)
  await finish(page)
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.challenge.actionKind||null)).toBeNull()
  expect(await page.evaluate(()=>window.messages())).toEqual(['请核对这段用字。','请核实来源','目前没有实际来源，无法核实这项判断。'])
  expect(await page.evaluate(()=>window.challenge.threads[0].metadata.draft)).toBe('等待时继续写的新草稿')
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('replaces a transport failure with a short retry message while retaining the sent message and draft',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await start(page);await page.evaluate(id=>window.challenge.setDraft(id,'下一个问题'),id)
  await page.evaluate(()=>window.jobs[0].reject(Error('PRIVATE provider stack tool trace')))
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.messages())).toEqual(['请核对这段用字。','请核实来源','没能完成，请重试'])
  expect(await page.evaluate(()=>window.challenge.threads[0].metadata.draft)).toBe('下一个问题')
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(original)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

for(const route of ['close','resolve','switch','off','hidden'])it('ends a pending reply on '+route+' and ignores a late replacement',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await start(page)
  await page.evaluate(({route,id})=>{window.challenge.setDraft(id,'保留新草稿');if(route==='close')window.challenge.close(id);if(route==='resolve')void window.challenge.resolve(id);if(route==='switch')window.switchNote('note-b');if(route==='off')window.challenge.setLevel(0);if(route==='hidden'){document.querySelector('.en-root').hidden=true;document.dispatchEvent(new Event('sherlock:workspace-surface-change'))}},{route,id})
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  await expect.poll(()=>page.evaluate(()=>window.completed)).toBe(1)
  expect(await page.evaluate(()=>window.calls.filter(c=>c.method==='challenge-stop').length)).toBe(1)
  await finish(page,{...answer,reply:{text:'迟到的建议',replacement:'新内容'}})
  if(route==='switch'){await page.evaluate(()=>window.switchNote('note-a'));await expect.poll(()=>page.locator('.en-title').inputValue()).toBe('note-a')}
  const snapshot=await page.evaluate(()=>({text:window.editor.getBlock('p').content.map(c=>c.text).join(''),messages:[...window.noteDoc.getMap('threads').values()].flatMap(thread=>thread.get('comments').toArray().map(c=>c.get('body'))),draft:[...window.noteDoc.getMap('threads').values()][0].get('metadata').draft,selected:window.challenge.selected||null}))
  expect(snapshot.text).toBe(original);expect(JSON.stringify(snapshot.messages)).toContain('请核实来源');expect(JSON.stringify(snapshot.messages)).not.toContain('迟到的建议');expect(snapshot.draft).toBe('保留新草稿')
  if(route==='close'||route==='resolve')expect(snapshot.selected).toBeNull()
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('keeps a new action busy when an older cancelled request settles later and guards changed text',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await start(page);await page.evaluate(id=>{window.challenge.close(id);window.challenge.select(id);window.start('optimize')},id)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2)
  await finish(page,{...answer,reply:{text:'旧建议',replacement:'旧替换'}})
  expect(await page.evaluate(()=>({id:window.challenge.busyId,kind:window.challenge.actionKind}))).toEqual({id,kind:'optimize'})
  await page.evaluate(()=>window.editor.updateBlock('p',{content:'这项结论的成度较高，但刚刚增加了限定。'}))
  await finish(page,{...answer,reply:{text:'新建议',replacement:'程度'}},1)
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe('这项结论的成度较高，但刚刚增加了限定。')
  expect(await page.evaluate(()=>window.messages())).not.toContain('旧建议')
  expect(await page.evaluate(()=>window.messages().at(-1))).toContain('正文已变化')
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('persists margin preference per note across resize, reload and switching without altering a running reply or draft',async()=>{
 const{context,page,errors,id}=await fixture();try{
  expect(await page.evaluate(()=>window.challenge.marginExpanded)).toBe(true)
  await start(page)
  await page.evaluate(id=>{window.challenge.setLevel(2);window.challenge.setDraft(id,'我的草稿');window.challenge.select(id);window.challenge.setMarginExpanded(false)},id)
  expect(await page.evaluate(()=>({margin:window.challenge.marginExpanded,selected:window.challenge.selected||null,busy:window.challenge.busyId,kind:window.challenge.actionKind,level:window.challenge.level,draft:window.challenge.threads[0].metadata.draft,messages:window.messages()}))).toEqual({margin:false,selected:null,busy:id,kind:'reply',level:2,draft:'我的草稿',messages:['请核对这段用字。','请核实来源']})
  await page.setViewportSize({width:880,height:900});await page.setViewportSize({width:1440,height:900})
  expect(await page.evaluate(()=>window.challenge.marginExpanded)).toBe(false)
  await finish(page);await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  await page.evaluate(()=>window.remount());await expect.poll(()=>page.evaluate(()=>window.challenge.marginExpanded)).toBe(false)
  await page.evaluate(()=>window.switchNote('note-b'));await expect.poll(()=>page.locator('.en-title').inputValue()).toBe('note-b')
  expect(await page.evaluate(()=>window.challenge.marginExpanded)).toBe(true)
  await page.evaluate(()=>window.switchNote('note-a'));await expect.poll(()=>page.locator('.en-title').inputValue()).toBe('note-a')
  expect(await page.evaluate(()=>window.challenge.marginExpanded)).toBe(false)
  expect(await page.evaluate(()=>window.challenge.threads[0].metadata.draft)).toBe('我的草稿')
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('persists an optimization preview without editing and applies it only through the explicit replacement action',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.evaluate(id=>window.challenge.select(id),await page.evaluate(()=>window.challenge.threads[0].id));await start(page,'optimize');await finish(page,{...answer,reply:{text:'建议调整用字。',replacement:'程度'}})
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(original)
  await expect.poll(()=>page.locator('.en-challenge-replacement-text').allTextContents()).toEqual(['程度'])
  await expect.poll(()=>page.evaluate(()=>Object.keys(window.saved).length)).toBe(1);await page.evaluate(()=>window.remount());await expect.poll(()=>page.evaluate(()=>window.challenge.threads.length)).toBe(1);await page.evaluate(()=>window.challenge.select(window.challenge.threads[0].id));await expect.poll(()=>page.locator('.en-challenge-replace').count()).toBe(1)
  await page.locator('.en-challenge-card').screenshot({path:'/tmp/notes-challenge-v16-replacement-preview.png'});await page.locator('.en-challenge-replace').click()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe('这项结论的程度较高。')
  expect(await page.locator('.en-challenge-replace').isDisabled()).toBe(true)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
for(const [text,direct] of [['请帮我优化一下表达，先给建议',false],['请直接修改原文，把成度替换为程度',true],['你直接帮我改好替换上去',true],['不用解释，直接替换到原文',true],['不要解释，直接替换',true],['不要替换，只解释',false],['请解释为什么直接修改原文',false],['直接修改原文会丢格式吗？',false],['直接替换原文会影响已有评论吗？',false],['他说“直接替换原文”，你怎么看？',false],['现在就把原文改为程度',true],['可以帮我直接改好',true],['可以帮我改好吗？',true],['替换一下',true]])it(`uses human intent to ${direct?'execute':'preview'} a reply replacement: ${text}`,async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.challenge.select(window.challenge.threads[0].id));await start(page,'reply',text)
  await finish(page,{...answer,reply:{text:'模型声称已修改原文',replacement:'程度'}})
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(direct?'这项结论的程度较高。':original)
  await expect.poll(()=>page.locator('.en-challenge-replace').count()).toBe(direct?0:1)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('rejects a persisted replacement when its captured source has changed',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(id=>window.challenge.select(id),await page.evaluate(()=>window.challenge.threads[0].id));await start(page,'optimize');await finish(page,{...answer,reply:{text:'建议调整用字。',replacement:'程度'}})
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  await page.evaluate(()=>window.editor.updateBlock('p',{content:'新上下文。'+window.editor.getBlock('p').content.map(c=>c.text).join('')}))
  await page.locator('.en-challenge-replace').click()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe('新上下文。'+original)
  expect(await page.locator('.en-challenge-replace').textContent()).toBe('原文已变化')
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('orders reverse-arriving threads by real document and quote positions even for multiple sentences on one line',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.setViewportSize({width:2400,height:900})
  await page.evaluate(async()=>{window.editor.replaceBlocks(window.editor.document,[{id:'p',type:'paragraph',content:'第一句方向错误。第二句物态错误。'},{id:'q',type:'paragraph',content:'后段呼吸错误。'}]);await window.seed({blockId:'q',quote:'呼吸错误'});await window.seed({blockId:'p',quote:'物态错误'});await window.seed({blockId:'p',quote:'方向错误'})})
  await expect.poll(()=>page.evaluate(()=>window.challenge.threads.map(t=>t.metadata.issue.quote))).toEqual(['方向错误','物态错误','呼吸错误'])
  await expect.poll(()=>page.locator('.en-challenge-quote').allTextContents()).toEqual(['方向错误','物态错误','呼吸错误'])
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('includes the persisted proposed wording in later discussion context without authorizing its application',async()=>{
 const{context,page,errors}=await fixture();try{
  await start(page,'optimize');await finish(page,{...answer,reply:{text:'建议调整用字。',replacement:'程度'}});await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  await page.evaluate(()=>window.start('reply','为什么这样表达更合适？'));await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2)
  expect(await page.evaluate(()=>window.jobs[1].input.thread.messages.some(message=>message.role==='assistant'&&message.text.includes('程度')))).toBe(true)
  await finish(page,answer,1);await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(original);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
