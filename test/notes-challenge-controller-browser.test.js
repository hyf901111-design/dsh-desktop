import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

let browser,script
const original='这项结论的成度较高。'
const answer={version:1,issues:[],coveredBlockIds:[],checks:[],reply:{text:'目前没有实际来源，无法核实这项判断。'}}
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountNotes}from'./src/preload/notes/mount';import{mountFloatingSurfaces}from'./src/preload/floating-surfaces';window.enableFloatingSurfaces=()=>mountFloatingSurfaces(document);import{YjsThreadStore}from'@blocknote/core/yjs';import{DefaultThreadStoreAuth}from'@blocknote/core/comments';import{findChallengeQuote}from'./src/preload/notes/challenge-anchors';import{CHALLENGE_KIND,CHALLENGE_USER}from'./src/preload/notes/challenge-controller';import{noteText}from'./src/shared/workspace-notes';import*as Y from'yjs';
 window.calls=[];window.jobs=[];window.saved={};window.drafts={};window.completed=0;
 const bridge={request:async(method,input)=>{window.calls.push({method,input});if(method==='load')return{saved:window.saved[input.sessionId]?{...window.saved[input.sessionId],revision:0}:{title:input.sessionId,blocks:[{id:'p',type:'paragraph',content:${JSON.stringify(original)}}],yjs:'',revision:0}};if(method==='challenge')return new Promise((resolve,reject)=>window.jobs.push({input,resolve,reject}));if(method==='save'){window.saved[input.sessionId]=input.content;return{status:'saved',saved:{...input.content,revision:input.revision+1}}}return{}},draft:async input=>{window.drafts[input.sessionId]=input.content}};
 const host={register:(_mode,surface)=>{surface.style.left='0';document.body.append(surface)},open:()=>{},close:()=>{},current:()=>'notes'};let mounted=mountNotes(document,bridge,host);window.remount=()=>{mounted.dispose();mounted=mountNotes(document,bridge,host)};
 window.switchNote=id=>{document.querySelector('[data-ework-notes-session]').dataset.eworkNotesSession=id;document.querySelector('[data-ework-note-view]').dataset.eworkNoteView=id;document.dispatchEvent(new CustomEvent('sherlock:notes-open',{detail:{sessionId:id}}))};
 window.messages=()=>window.challenge.threads[0]?.comments.filter(c=>!c.deletedAt).map(c=>noteText(c.body))||[];
 window.savedMessages=()=>{const doc=new Y.Doc();Y.applyUpdate(doc,Uint8Array.from(atob(window.drafts['note-a'].yjs),c=>c.charCodeAt(0)));return[...doc.getMap('threads').values()].flatMap(thread=>thread.get('comments').toArray().map(comment=>noteText(comment.get('body'))))};
 window.start=(kind='reply',text='请核实来源')=>{window.challenge.runAction(window.challenge.threads[0],kind,text).then(()=>window.completed++)};
 window.seed=async(override={})=>{const issue={blockId:'p',quote:'成度',category:'typo',message:'请核对这段用字。',evidence:[],...override},store=new YjsThreadStore(CHALLENGE_USER,window.noteDoc.getMap('threads'),new DefaultThreadStoreAuth(CHALLENGE_USER,'editor'));const thread=await store.createThread({metadata:{kind:CHALLENGE_KIND,issue,sourceText:window.editor.getBlock(issue.blockId).content.map(c=>c.text||'').join('')},initialComment:{body:[{type:'paragraph',content:[{type:'text',text:issue.message,styles:{}}]}]}});const range=findChallengeQuote(window.editor,issue.blockId,issue.quote);window.editor.transact(tr=>tr.setMeta('addToHistory',false).addMark(range.from,range.to,tr.doc.type.schema.marks.comment.create({threadId:thread.id,orphan:false})));return thread.id};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'inline-production-styles',setup(b){b.onResolve({filter:/\.css\?inline$/},async args=>{const found=await b.resolve(args.path.slice(0,-7),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}},{name:'expose-controller',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.editor=editor;window.challenge=challenge;window.noteDoc=doc;window.setNoteWriting=setWriting; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(content=original,quote='成度'){
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[]
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(5000)
 await page.route('http://127.0.0.1/challenge-controller',route=>route.fulfill({contentType:'text/html',body:'<span data-ework-notes-session="note-a"></span><div data-ework-note-view="note-a"></div>'}))
 await page.goto('http://127.0.0.1/challenge-controller');await page.addScriptTag({content:script});await page.locator('.bn-editor').waitFor()
 await expect.poll(()=>page.evaluate(()=>!!window.challenge)).toBe(true)
 await page.evaluate(content=>window.editor.replaceBlocks(window.editor.document,[{id:'p',type:'paragraph',content}]),content)
 const id=await page.evaluate(quote=>window.seed({quote}),quote);await expect.poll(()=>page.evaluate(()=>window.challenge.threads.length)).toBe(1)
 return{context,page,errors,id}
}
// Successful mock reviews finish their returned coverage. Partial-review cases
// explicitly supply an empty/subset completeBlockIds, as the runtime now does.
async function finish(page,value=answer,index=0){
 const response=value.completeBlockIds===undefined?{...value,completeBlockIds:value.coveredBlockIds??[]}:value
 await page.evaluate(({value,index})=>window.jobs[index].resolve(value),{value:response,index})
}
async function start(page,kind='reply',text='请核实来源'){await page.evaluate(({kind,text})=>window.start(kind,text),{kind,text});await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)}

it('configure API reads Yjs immediately and queues a changed level until ordinary writing stops',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.clock.install();await page.evaluate(id=>window.challenge.resolve(id),id)
  await page.evaluate(()=>window.setNoteWriting(true));await page.getByText('正在生成内容…',{exact:true}).waitFor()
  const immediate=await page.evaluate(()=>{window.configuringController=window.challenge;window.configuringController.configure({level:3,commentsExpanded:false});return{configuration:window.configuringController.getConfiguration(),level:window.noteDoc.getMap('note-challenge').get('level'),commentsExpanded:window.noteDoc.getMap('note-challenge').get('marginExpanded')}})
  expect(immediate).toEqual({configuration:{level:3,commentsExpanded:false,phase:'paused'},level:3,commentsExpanded:false})
  await page.clock.fastForward(10000);expect(await page.evaluate(()=>window.jobs.length)).toBe(0)
  await page.evaluate(()=>window.setNoteWriting(false));await page.clock.fastForward(1)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  expect(await page.evaluate(()=>window.jobs[0].input)).toMatchObject({action:'review',level:3,changedIds:['p']})
  expect(await page.evaluate(()=>window.configuringController.getConfiguration())).toEqual({level:3,commentsExpanded:false,phase:'running'})
  expect(await page.locator('.en-challenge-paragraph-line').count()).toBe(0)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('configure API keeps the running review and existing selection when repeated settings do not change preferences',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.clock.install();await page.evaluate(()=>window.challenge.configure({level:3,commentsExpanded:false}));await page.clock.fastForward(1)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  const before=await page.evaluate(id=>{window.challenge.select(id);window.repeatedController=window.challenge;return{configuration:window.challenge.getConfiguration()}},id)
  const repeated=await page.evaluate(()=>{let updates=0;const observer=()=>updates++;window.noteDoc.on('update',observer);window.repeatedController.configure({level:3,commentsExpanded:false});window.noteDoc.off('update',observer);return{configuration:window.repeatedController.getConfiguration(),updates}})
  expect(repeated).toEqual({configuration:{level:3,commentsExpanded:false,phase:'running'},updates:0})
  expect(before.configuration.phase).toBe('running');expect(await page.evaluate(()=>window.challenge.selected)).toBe(id)
  await page.evaluate(()=>window.challenge.configure({commentsExpanded:true}))
  expect(await page.evaluate(()=>window.repeatedController.getConfiguration())).toEqual({level:3,commentsExpanded:true,phase:'running'})
  expect(await page.evaluate(()=>window.calls.filter(call=>call.method==='challenge-stop'))).toEqual([])
  expect(await page.evaluate(()=>window.jobs.length)).toBe(1)
  await finish(page,{version:1,issues:[],coveredBlockIds:['p'],completeBlockIds:[],checks:[{kind:'review',status:'partial',detail:'本轮深入检查尚未完整结束。'}]})
  // The integrated scheduler retains partial work for its bounded supplement.
  await expect.poll(()=>page.evaluate(()=>window.challenge.getConfiguration().phase)).toBe('waiting')
  expect(await page.locator('.en-challenge-paragraph-line').count()).toBe(0)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('configure API preserves the rolling review budget across level changes and disabling then enabling',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.clock.install();await page.evaluate(id=>window.challenge.resolve(id),id)
  await page.evaluate(()=>window.challenge.configure({level:2}));await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  await finish(page,{version:1,issues:[],coveredBlockIds:['p'],completeBlockIds:['p'],checks:[],usage:{inputTokens:20,outputTokens:4000}})
  await expect.poll(()=>page.evaluate(()=>window.challenge.getConfiguration().phase)).toBe('idle')
  for(const settings of [{level:3},{level:4,commentsExpanded:false},{level:0},{level:4,commentsExpanded:true}]){
   const configuration=await page.evaluate(settings=>{window.challenge.configure(settings);return window.challenge.getConfiguration()},settings)
   expect(configuration.phase).toBe(settings.level===0?'off':'limited')
   await page.clock.fastForward(1);expect(await page.evaluate(()=>window.jobs.length)).toBe(1)
  }
  await page.clock.fastForward(600000);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2)
  expect(await page.evaluate(()=>window.jobs[1].input.level)).toBe(4);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('localizes only fixed challenge reply failures while preserving user and model messages',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en')
  await start(page,'reply','用户中文问题不能翻译');await finish(page,{...answer,reply:{text:'模型原生中文回复应当保留。'}})
  await expect.poll(()=>page.evaluate(()=>window.messages().at(-1))).toBe('模型原生中文回复应当保留。')
  await page.evaluate(()=>window.start('reply','这次模拟来源失败'));await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2)
  await page.evaluate(()=>window.jobs[1].reject(Error('fixture transport failure')))
  await expect.poll(()=>page.evaluate(()=>window.messages().at(-1))).toBe('Could not finish. Try again.')
  expect(await page.evaluate(()=>window.messages())).toContain('用户中文问题不能翻译');expect(await page.evaluate(()=>window.messages())).toContain('模型原生中文回复应当保留。');expect(errors).toEqual([])
 }finally{await context.close()}
})

it('publishes and saves a sent message before the deferred reply, blocks duplicate actions, and keeps a new draft',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.evaluate(id=>window.challenge.setDraft(id,'请核实来源'),id)
  await start(page)
  expect(await page.evaluate(()=>({busy:window.challenge.busyId,kind:window.challenge.actionKind,messages:window.messages(),draft:window.challenge.threads[0].metadata.draft}))).toEqual({busy:id,kind:'reply',messages:['请核对这段用字。','请核实来源'],draft:''})
  expect(await page.evaluate(()=>window.savedMessages())).toContain('请核实来源')
  await page.evaluate(id=>{window.start('reply','重复发送');window.start('optimize');window.challenge.setDraft(id,'等待时继续写的新草稿')},id)
  expect(await page.evaluate(()=>window.jobs.length)).toBe(1)
  expect(await page.locator('.en-challenge-trigger').getAttribute('aria-busy')).toBe('true')
  expect(await page.locator('.en-challenge-trigger').getAttribute('aria-description')).toContain('正在执行')
  expect(await page.evaluate(()=>window.challenge.running)).toBe(true)
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(original)
  await finish(page)
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.challenge.actionKind||null)).toBeNull()
  expect(await page.locator('.en-challenge-trigger').getAttribute('aria-busy')).toBe('false')
  expect(await page.evaluate(()=>window.challenge.running)).toBe(false)
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
  expect(await page.locator('.en-challenge-trigger').getAttribute('aria-busy')).toBe('false')
  expect(await page.evaluate(()=>window.challenge.running)).toBe(false)
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
  expect(await page.locator('.en-challenge-trigger').getAttribute('aria-busy')).toBe('false')
  expect(await page.evaluate(()=>window.challenge.running)).toBe(false)
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
  await finish(page,{...answer,reply:{text:'新建议',replacement:'这项结论的程度较高。'}},1)
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
  await page.evaluate(id=>window.challenge.select(id),id);await start(page,'optimize');await finish(page,{...answer,reply:{text:'建议调整用字。',replacement:'这项结论的程度较高。'}})
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(original)
  await expect.poll(()=>page.locator('.en-challenge-replacement-text').allTextContents()).toEqual(['这项结论的程度较高。'])
  await expect.poll(()=>page.evaluate(()=>Object.keys(window.saved).length)).toBe(1)
  await page.evaluate(()=>{window.previousChallenge=window.challenge;window.remount()})
  // The old controller still exists until React mounts the restored editor.
  // Wait for the new controller and the persisted thread, not the stale array.
  await expect.poll(()=>page.evaluate(id=>window.challenge!==window.previousChallenge&&window.challenge.threads.some(thread=>thread.id===id),id)).toBe(true)
  await page.evaluate(id=>window.challenge.select(id),id);await expect.poll(()=>page.locator('.en-challenge-replace').count()).toBe(1)
  await page.locator('.en-challenge-card').screenshot({path:'/tmp/notes-challenge-v16-replacement-preview.png'});await page.locator('.en-challenge-replace').click()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe('这项结论的程度较高。')
  expect(await page.locator('.en-challenge-replace').count()).toBe(0);expect(await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('resolved'),id)).toBe(true)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
for(const [text,direct] of [['请把原文改为程度的理由说明一下',false],['请把原文改为程度的方案给我看看',false],['请把这项结论替换为“程度”',false],['请把原文改为“程度’',false],['请把建议改为“更谨慎的表达”',false],['请把这条评论改为“是否需要核对”',false],['请把原文改为“程度”的理由说明一下',false],['请把原文改为“程度”的方案给我看看',false],['请把原文改为‘程度’',true],['请把成度替换为程度',true],['请帮我优化一下表达，先给建议',false],['请直接修改原文，把成度替换为程度',true],['你直接帮我改好替换上去',true],['不用解释，直接替换到原文',true],['不要解释，直接替换',true],['不要替换，只解释',false],['请解释为什么直接修改原文',false],['直接修改原文会丢格式吗？',false],['直接替换原文会影响已有评论吗？',false],['他说“直接替换原文”，你怎么看？',false],['现在就把原文改为程度',true],['可以帮我直接改好',true],['可以帮我改好吗？',true],['替换一下',true],['直接修改原文能保留格式吗？',false],['直接替换原文有格式丢失的问题吗？',false],['修改建议看起来很生硬',false]])it(`uses human intent to ${direct?'execute':'preview'} a reply replacement: ${text}`,async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.challenge.select(window.challenge.threads[0].id));const editedAt=await page.evaluate(()=>window.noteDoc.getMap('note-metadata').get('editedAt'));await start(page,'reply',text)
  await finish(page,{...answer,reply:{text:'模型声称已修改原文',replacement:'这项结论的程度较高。'}})
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(direct?'这项结论的程度较高。':original)
  await expect.poll(()=>page.locator('.en-challenge-replace').count()).toBe(direct?0:1)
  if(!direct)expect(await page.evaluate(()=>window.noteDoc.getMap('note-metadata').get('editedAt'))).toBe(editedAt)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('rejects a persisted replacement when its captured source has changed',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(id=>window.challenge.select(id),await page.evaluate(()=>window.challenge.threads[0].id));await start(page,'optimize');await finish(page,{...answer,reply:{text:'建议调整用字。',replacement:'这项结论的程度较高。'}})
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

it('sends only live review anchor locations while preserving discussion and unsent replies',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await start(page,'reply','PRIVATE-USER-DISCUSSION');await finish(page)
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  const discussion=await page.evaluate(()=>window.messages())
  await page.evaluate(async id=>{
   window.challenge.setDraft(id,'PRIVATE-UNSENT-DRAFT')
   const resolved=await window.seed({quote:'结论'});await window.challenge.resolve(resolved)
   const orphan=await window.seed({quote:'较高'}),item=window.noteDoc.getMap('threads').get(orphan),metadata=item.get('metadata')
   item.set('metadata',{...metadata,issue:{...metadata.issue,quote:'已消失的文字'}})
  },id)
  await page.clock.install();await page.evaluate(()=>{window.editor._tiptapEditor.commands.blur();window.challenge.setLevel(2)})
  await page.clock.fastForward(5100);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2)
  const input=await page.evaluate(()=>window.jobs[1].input)
  expect(input.existingAnchors).toEqual([{blockId:'p',quote:'成度'}])
  expect(JSON.stringify(input)).not.toContain('PRIVATE')
  expect(JSON.stringify(input)).not.toContain('请核对这段用字')
  await finish(page,{...answer,reply:undefined,issues:[],coveredBlockIds:['p']},1)
  await expect.poll(()=>page.evaluate(()=>window.challenge.phase)).toBe('idle')
  expect(await page.evaluate(()=>window.messages())).toEqual(discussion)
  expect(await page.evaluate(()=>window.challenge.threads[0].metadata.draft)).toBe('PRIVATE-UNSENT-DRAFT')
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(original)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('reuses the same highlighted passage across review categories and preserves its discussion and unsent reply',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await start(page,'reply','请解释这项提醒');await finish(page)
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  const discussion=await page.evaluate(()=>window.messages())
  await page.evaluate(id=>window.challenge.setDraft(id,'这条回复还没有发送'),id)
  await page.clock.install()
  await page.evaluate(()=>{window.editor._tiptapEditor.commands.blur();window.challenge.setLevel(2)})
  await page.clock.fastForward(5100)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2)
  const issue={blockId:'p',quote:'成度',category:'question',message:'请核对“成度”是否应为“程度”。',evidence:[]}
  await finish(page,{...answer,reply:undefined,issues:[issue],coveredBlockIds:['p']},1)
  await expect.poll(()=>page.evaluate(()=>window.challenge.phase)).toBe('idle')
  expect(await page.evaluate(()=>window.challenge.threads.map(t=>t.id))).toEqual([id])
  expect(await page.evaluate(()=>window.messages())).toEqual([...discussion,issue.message])
  expect(await page.evaluate(()=>window.challenge.threads[0].metadata.draft)).toBe('这条回复还没有发送')
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-challenge-recheck',{detail:{sessionId:'note-a'}})))
  await page.clock.fastForward(31000)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(3)
  await finish(page,{...answer,reply:undefined,issues:[{...issue,category:'uncertain'}],coveredBlockIds:['p']},2)
  await expect.poll(()=>page.evaluate(()=>window.challenge.phase)).toBe('idle')
  expect(await page.evaluate(()=>window.challenge.threads.map(t=>t.id))).toEqual([id])
  expect(await page.evaluate(()=>window.messages())).toEqual([...discussion,issue.message])
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(original)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('retains separate findings for different passages when a review changes the category of an existing passage',async()=>{
 const{context,page,errors,id}=await fixture('成度不应替代程度，另一处判断也需要核对。');try{
  await page.clock.install()
  await page.evaluate(()=>{window.editor._tiptapEditor.commands.blur();window.challenge.setLevel(2)})
  await page.keyboard.press('Escape');await page.clock.fastForward(1)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  await finish(page,{...answer,reply:undefined,coveredBlockIds:['p'],issues:[
   {blockId:'p',quote:'成度',category:'question',message:'请核对这段用字。',evidence:[]},
   {blockId:'p',quote:'另一处判断',category:'question',message:'这项判断还需要依据。',evidence:[]}
  ]})
  await expect.poll(()=>page.evaluate(()=>window.challenge.phase)).toBe('idle')
  expect(await page.evaluate(()=>window.challenge.threads.map(t=>t.metadata.issue.quote))).toEqual(['成度','另一处判断'])
  expect(await page.evaluate(()=>window.challenge.threads[0].id)).toBe(id)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('keeps a resolved finding acknowledged while allowing a new category on that same passage',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.evaluate(id=>window.challenge.resolve(id),id)
  await expect.poll(()=>page.evaluate(()=>window.challenge.threads.length)).toBe(0)
  await page.clock.install()
  await page.evaluate(()=>{window.editor._tiptapEditor.commands.blur();window.challenge.setLevel(2)})
  await page.keyboard.press('Escape');await page.clock.fastForward(1)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  await finish(page,{...answer,reply:undefined,coveredBlockIds:['p'],issues:[
   {blockId:'p',quote:'成度',category:'typo',message:'同一用字提醒。',evidence:[]},
   {blockId:'p',quote:'成度',category:'fact',message:'这个词所指的指标还需要核对。',evidence:[]}
  ]})
  await expect.poll(()=>page.evaluate(()=>window.challenge.phase)).toBe('idle')
  expect(await page.evaluate(()=>window.challenge.threads.map(t=>t.metadata.issue.category))).toEqual(['fact'])
  expect(await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('resolved'),id)).toBe(true)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('does not reintroduce an acknowledged finding into a different older discussion on the same passage',async()=>{
 const{context,page,errors,id}=await fixture();try{
  const other=await page.evaluate(()=>window.seed({category:'question',message:'这个术语的定义是什么？'}))
  await page.evaluate(id=>window.challenge.resolve(id),id)
  await expect.poll(()=>page.evaluate(()=>window.challenge.threads.length)).toBe(1)
  await page.clock.install()
  await page.evaluate(()=>{window.editor._tiptapEditor.commands.blur();window.challenge.setLevel(2)})
  await page.keyboard.press('Escape');await page.clock.fastForward(1)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  await finish(page,{...answer,reply:undefined,coveredBlockIds:['p'],issues:[
   {blockId:'p',quote:'成度',category:'typo',message:'同一用字提醒再次出现。',evidence:[]}
  ]})
  await expect.poll(()=>page.evaluate(()=>window.challenge.phase)).toBe('idle')
  expect(await page.evaluate(()=>window.challenge.threads.map(t=>t.id))).toEqual([other])
  expect(await page.evaluate(()=>window.challenge.threads[0].metadata.issue.category)).toBe('question')
  expect(await page.evaluate(()=>window.messages())).toEqual(['这个术语的定义是什么？'])
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('includes the persisted proposed wording in later discussion context without authorizing its application',async()=>{
 const{context,page,errors}=await fixture();try{
  await start(page,'optimize');await finish(page,{...answer,reply:{text:'建议调整用字。',replacement:'这项结论的程度较高。'}});await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  await page.evaluate(()=>window.start('reply','为什么这样表达更合适？'));await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2)
  expect(await page.evaluate(()=>window.jobs[1].input.thread.messages.some(message=>message.role==='assistant'&&message.text.includes('程度')))).toBe(true)
  await finish(page,answer,1);await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(original);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

// Uses the real mounted scheduler; only the transport is deferred above.
it('keeps the swords static while waiting, animates a real review, and stops for success, failure, off and leaving notes',async()=>{
 const{context,page,errors}=await fixture();try{
  const trigger=page.locator('.en-challenge-trigger'),icon=trigger.locator('img').first()
  const staticSrc=await icon.getAttribute('src')
  const bounds=()=>trigger.evaluate(el=>{const r=el.getBoundingClientRect(),i=el.querySelector('img').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,iconX:i.x,iconY:i.y,iconWidth:i.width,iconHeight:i.height}})
  await page.clock.install()
  await trigger.click();await page.getByRole('slider',{name:'挑战强度'}).press('ArrowRight');await page.getByRole('slider',{name:'挑战强度'}).press('ArrowRight')
  await expect.poll(()=>page.evaluate(()=>window.challenge.phase)).toBe('paused')
  const waitingBounds=await bounds(),waitingLabel=await trigger.getAttribute('aria-label')
  expect(waitingBounds.iconWidth).toBe(16);expect(waitingBounds.iconHeight).toBe(16)
  expect(await trigger.getAttribute('aria-busy')).toBe('false');expect(await icon.getAttribute('src')).toBe(staticSrc)
  await page.keyboard.press('Escape');await page.clock.fastForward(1)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  await expect.poll(()=>trigger.getAttribute('aria-busy')).toBe('true')
  expect(await page.evaluate(()=>window.challenge.phase)).toBe('running')
  expect(await trigger.getAttribute('aria-label')).toBe(waitingLabel)
  expect(await icon.getAttribute('src')).not.toBe(staticSrc)
  const firstFrame=await icon.screenshot({path:'/tmp/notes-challenge-v16-motion-frame-a.png'})
  await expect.poll(async()=>firstFrame.equals(await icon.screenshot({path:'/tmp/notes-challenge-v16-motion-frame-b.png'}))).toBe(false)
  expect(await bounds()).toEqual(waitingBounds)
  await trigger.screenshot({path:'/tmp/notes-challenge-v16-motion-running.png'})
  await finish(page,{...answer,coveredBlockIds:['p']})
  await expect.poll(()=>trigger.getAttribute('aria-busy')).toBe('false')
  expect(await icon.getAttribute('src')).toBe(staticSrc)
  for(const stop of ['failure','off','hidden']){
   await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-challenge-recheck',{detail:{sessionId:'note-a'}})))
   // Rechecks still respect the real interval; move its clock without stubbing the scheduler.
   await page.clock.fastForward(31000)
   await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(stop==='failure'?2:stop==='off'?3:4)
   await expect.poll(()=>trigger.getAttribute('aria-busy')).toBe('true')
   await page.evaluate(stop=>{if(stop==='failure')window.jobs.at(-1).reject(Error('fixture failure'));if(stop==='off')window.challenge.setLevel(0);if(stop==='hidden'){document.querySelector('.en-root').hidden=true;document.dispatchEvent(new Event('sherlock:workspace-surface-change'))}},stop)
   if(stop==='hidden'){
    expect(await page.evaluate(()=>window.challenge.phase)).toBe('running')
    expect(await trigger.getAttribute('aria-busy')).toBe('true')
    await finish(page,{...answer,coveredBlockIds:['p']},3)
   }
   await expect.poll(()=>trigger.getAttribute('aria-busy')).toBe('false')
   expect(await icon.getAttribute('src')).toBe(staticSrc)
   if(stop==='off')await page.evaluate(()=>window.challenge.setLevel(2))
  }
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('retains every original sword path and independently counter-swings both groups while respecting reduced motion',async()=>{
 const originalSvg=await readFile('src/preload/notes/assets/challenge-swords.svg','utf8'),busySvg=await readFile('src/preload/notes/assets/challenge-swords-busy.svg','utf8')
 const context=await browser.newContext(),page=await context.newPage()
 try{
  await page.setContent(`<style>body{background:#252525;color:white;font:14px sans-serif}section{display:inline-flex;flex-direction:column;gap:12px;align-items:center;margin:24px}section svg{width:160px;height:160px}</style><section>原图${originalSvg}</section><section>初始${busySvg}</section><section>相向摆动${busySvg}</section><section>反向摆动${busySvg}</section>`)
  const geometry=await page.evaluate(()=>{
   const svgs=[...document.querySelectorAll('svg')],paths=svg=>[...svg.querySelectorAll('path')].map(path=>[...path.attributes].map(a=>[a.name,a.value])).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
   return svgs.map(svg=>({width:svg.getAttribute('width'),height:svg.getAttribute('height'),viewBox:svg.getAttribute('viewBox'),paths:paths(svg)}))
  })
  for(const animated of geometry.slice(1))expect(animated).toEqual(geometry[0])
  const samples=await page.evaluate(()=>{
   const svgs=[...document.querySelectorAll('svg')].slice(1)
   return svgs.map((svg,index)=>{
    const animations=svg.getAnimations({subtree:true});for(const animation of animations){animation.pause();animation.currentTime=[0,275,825][index]}
    return [...svg.querySelectorAll('.sword')].map(sword=>({ids:[...sword.querySelectorAll('path')].map(p=>p.id),matrix:getComputedStyle(sword).transform}))
   })
  })
  expect(samples[0].map(s=>s.ids)).toEqual([['Vector','Vector_2','Vector_4','Vector_5'],['Vector_3','Vector_6','Vector_7','Vector_8']])
  const degrees=matrix=>{const [a,b]=matrix.slice(7,-1).split(',').map(Number);return Math.atan2(b,a)*180/Math.PI}
  expect(degrees(samples[1][0].matrix)).toBeCloseTo(7,3);expect(degrees(samples[1][1].matrix)).toBeCloseTo(-7,3)
  expect(degrees(samples[2][0].matrix)).toBeCloseTo(-7,3);expect(degrees(samples[2][1].matrix)).toBeCloseTo(7,3)
  await page.screenshot({path:'/tmp/notes-challenge-v16-motion-geometry.png'})
  await page.emulateMedia({reducedMotion:'reduce'})
  expect(await page.evaluate(()=>[...document.querySelectorAll('.sword')].map(s=>getComputedStyle(s).transform))).toEqual(Array(6).fill('none'))
  expect(await page.evaluate(()=>document.getAnimations().length)).toBe(0)
  await page.screenshot({path:'/tmp/notes-challenge-v16-motion-reduced.png'})
 }finally{await context.close()}
},15000)

it('keeps a reduced-motion mounted toolbar static throughout a real action with its accessible busy explanation',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'})
  const trigger=page.locator('.en-challenge-trigger'),icon=trigger.locator('img').first(),before=await icon.screenshot({path:'/tmp/notes-motion-reduced-static.png'})
  await start(page,'optimize')
  expect(await trigger.getAttribute('aria-busy')).toBe('true');expect(await trigger.getAttribute('aria-description')).toContain('正在执行')
  await expect.poll(async()=>before.equals(await icon.screenshot())).toBe(true)
  const running=await icon.screenshot();expect(running.equals(await icon.screenshot())).toBe(true)
  await page.emulateMedia({reducedMotion:'no-preference'})
  await expect.poll(async()=>before.equals(await icon.screenshot())).toBe(false)
  await page.emulateMedia({reducedMotion:'reduce'})
  await expect.poll(async()=>before.equals(await icon.screenshot())).toBe(true)
  await trigger.screenshot({path:'/tmp/notes-challenge-v16-motion-reduced-toolbar.png'})
  await finish(page);await expect.poll(()=>trigger.getAttribute('aria-busy')).toBe('false')
  expect(before.equals(await icon.screenshot())).toBe(true);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)


it('removes the busy icon and cancels its request when the mounted notes controller is disposed',async()=>{
 const{context,page,errors}=await fixture();try{
  await start(page)
  const oldIcon=await page.locator('.en-challenge-trigger img').first().elementHandle()
  await page.evaluate(()=>window.remount())
  await expect.poll(()=>page.locator('.en-challenge-trigger').getAttribute('aria-busy')).toBe('false')
  expect(await oldIcon.evaluate(el=>el.isConnected)).toBe(false)
  await expect.poll(()=>page.evaluate(()=>window.calls.filter(c=>c.method==='challenge-stop').length)).toBe(1)
  await finish(page,{...answer,reply:{text:'迟到的回复'}})
  expect(await page.evaluate(()=>window.challenge.running)).toBe(false)
  expect(await page.evaluate(()=>window.messages())).not.toContain('迟到的回复');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

const capturedSource='20名参与者中有15人完成任务，因此完成率为90%。',capturedQuote='20名参与者中有15人完成任务',capturedReplacement='20名参与者中有15人完成任务，因此完成率为75%。'
it('previews the captured half-quote/full-sentence model result and applies exactly one corrected sentence',async()=>{
 const {context,page,errors,id}=await fixture([{type:'text',text:capturedQuote,styles:{bold:true}},{type:'text',text:'，因此完成率为90%。后句保留。',styles:{italic:true}}],capturedQuote);try{
  const before=await page.evaluate(()=>({content:window.editor.getBlock('p').content,date:window.noteDoc.getMap('note-metadata').get('editedAt')}))
  await page.evaluate(id=>{window.challenge.select(id);window.challenge.setDraft(id,'保留这份未发送草稿')},id);await start(page,'optimize')
  expect(await page.evaluate(()=>window.jobs[0].input.thread.quote)).toBe(capturedQuote)
  await finish(page,{...answer,reply:{text:'完成率应为75%。',replacement:capturedReplacement}})
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>({content:window.editor.getBlock('p').content,date:window.noteDoc.getMap('note-metadata').get('editedAt')}))).toEqual(before)
  const preview=await page.evaluate(()=>window.challenge.threads[0].comments.at(-1).metadata.challengeReplacement)
  expect(preview).toMatchObject({scopeVersion:2,anchorQuote:capturedQuote,quote:capturedSource,status:'pending'})
  await page.getByRole('button',{name:'替换到原文',exact:true}).click()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(capturedReplacement+'后句保留。')
  expect(await page.evaluate(quote=>window.editor.getBlock('p').content.find(c=>c.text===quote)?.styles.bold,capturedQuote)).toBe(true)
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.filter(c=>c.styles.italic).map(c=>c.text).join(''))).toBe('，因此完成率为75%。后句保留。')
  expect(await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('metadata').draft,id)).toBe('保留这份未发送草稿')
  await page.locator('.bn-editor').focus();await page.keyboard.press('Meta+z')
  await expect.poll(()=>page.locator('.en-challenge-quote').textContent()).toBe(capturedQuote)
  expect(await page.evaluate(()=>window.editor.getBlock('p').content)).toEqual(before.content)
  await page.keyboard.press('Meta+Shift+z')
  await expect.poll(()=>page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('resolved'),id)).toBe(true)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('uses the complete host sentence for the captured second-paragraph direct reply',async()=>{
 const quote='12人中有9人完成任务',source=quote+'，因此完成率为60%。',replacement=quote+'，因此完成率为75%。'
 const {context,page,errors}=await fixture(capturedSource,capturedQuote);try{
  const second=await page.evaluate(async({source,quote})=>{window.editor.insertBlocks([{id:'q',type:'paragraph',content:source}],'p','after');return window.seed({blockId:'q',quote})},{source,quote})
  await expect.poll(()=>page.evaluate(()=>window.challenge.threads.length)).toBe(2)
  await page.evaluate(id=>{void window.challenge.runAction(window.challenge.threads.find(thread=>thread.id===id),'reply','直接修改原文')},second)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1);await finish(page,{...answer,reply:{text:'完成率应为75%。',replacement}})
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.editor.getBlock('q').content.map(c=>c.text).join(''))).toBe(replacement)
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(capturedSource)
  expect(await page.locator('.en-challenge-replace').count()).toBe(0)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('rejects an old pending suggestion without a V2 scope and retains its history with a re-optimize explanation',async()=>{
 const {context,page,errors,id}=await fixture();try{
  await start(page,'optimize');await finish(page,{...answer,reply:{text:'保留历史建议。',replacement:'这项结论的程度较高。'}});await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  await page.evaluate(id=>{const thread=window.noteDoc.getMap('threads').get(id),comment=thread.get('comments').toArray().at(-1),metadata=comment.get('metadata'),suggestion={...metadata.challengeReplacement};delete suggestion.scopeVersion;delete suggestion.anchorQuote;comment.set('metadata',{...metadata,challengeReplacement:suggestion});window.challenge.select(id)},id)
  const before=await page.evaluate(()=>({text:window.editor.getBlock('p').content,date:window.noteDoc.getMap('note-metadata').get('editedAt')}))
  await page.getByRole('button',{name:'替换到原文',exact:true}).click()
  expect(await page.evaluate(()=>({text:window.editor.getBlock('p').content,date:window.noteDoc.getMap('note-metadata').get('editedAt')}))).toEqual(before)
  expect(await page.evaluate(()=>window.messages())).toContain('保留历史建议。')
  expect(await page.evaluate(()=>window.messages().at(-1))).toContain('请重新优化')
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
for(const kind of ['optimize','reply'])it('keeps an identical '+kind+' suggestion as discussion without a replace action or date change',async()=>{
 const {context,page,errors,id}=await fixture(capturedSource,capturedQuote);try{
  const before=await page.evaluate(()=>({content:window.editor.getBlock('p').content,date:window.noteDoc.getMap('note-metadata').get('editedAt')}))
  await page.evaluate(id=>window.challenge.select(id),id);await start(page,kind,'直接替换到原文')
  await page.evaluate(id=>window.challenge.setDraft(id,'下一条还没有发送的回复'),id)
  await finish(page,{...answer,reply:{text:'原句无需变化。',replacement:capturedSource}});await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.locator('.en-challenge-suggestion').count()).toBe(0)
  expect(await page.getByRole('button',{name:'替换到原文',exact:true}).count()).toBe(0)
  expect(await page.evaluate(()=>window.challenge.threads[0].comments.at(-1).metadata?.challengeReplacement??null)).toBeNull()
  expect(await page.evaluate(()=>window.messages().at(-1))).toBe('原句无需变化。')
  expect(await page.evaluate(()=>window.challenge.threads[0].metadata.draft)).toBe('下一条还没有发送的回复')
  expect(await page.evaluate(()=>({content:window.editor.getBlock('p').content,date:window.noteDoc.getMap('note-metadata').get('editedAt')}))).toEqual(before)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('keeps an older identical preview in history without rendering a redundant replacement or applying it again',async()=>{
 const {context,page,errors,id}=await fixture(capturedSource,capturedQuote);try{
  await start(page,'optimize');await finish(page,{...answer,reply:{text:'保留这条历史优化说明。',replacement:capturedReplacement}});await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  const commentId=await page.evaluate(({id,source})=>{const thread=window.noteDoc.getMap('threads').get(id),comment=thread.get('comments').toArray().at(-1),metadata=comment.get('metadata');comment.set('metadata',{...metadata,challengeReplacement:{...metadata.challengeReplacement,replacement:source}});window.challenge.select(id);return comment.get('id')},{id,source:capturedSource})
  const before=await page.evaluate(()=>({content:window.editor.getBlock('p').content,date:window.noteDoc.getMap('note-metadata').get('editedAt')}))
  await page.getByRole('button',{name:'AI优化',exact:true}).waitFor()
  expect(await page.locator('.en-challenge-suggestion').count()).toBe(0)
  expect(await page.evaluate(()=>window.messages().at(-1))).toBe('保留这条历史优化说明。')
  await page.evaluate(({id,commentId})=>window.challenge.applyReplacement(id,commentId),{id,commentId})
  expect(await page.evaluate(()=>window.challenge.threads[0].comments.at(-1).metadata.challengeReplacement.status)).toBe('pending')
  expect(await page.evaluate(()=>({content:window.editor.getBlock('p').content,date:window.noteDoc.getMap('note-metadata').get('editedAt')}))).toEqual(before)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
for(const tamper of ['scope','anchor','snapshot','thread'])it('independently rejects a pending V2 suggestion after '+tamper+' changes',async()=>{
 const {context,page,errors,id}=await fixture(capturedSource,capturedQuote);try{
  await page.evaluate(id=>window.challenge.select(id),id);await start(page,'optimize');await finish(page,{...answer,reply:{text:'建议修正。',replacement:capturedReplacement}});await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  const commentId=await page.evaluate(({id,tamper})=>{const thread=window.noteDoc.getMap('threads').get(id),comment=thread.get('comments').toArray().at(-1),metadata=comment.get('metadata'),suggestion={...metadata.challengeReplacement};if(tamper==='scope')suggestion.quote=suggestion.anchorQuote;if(tamper==='anchor')suggestion.anchorQuote='完成率';if(tamper==='snapshot')suggestion.documentKey='过期';if(tamper==='thread')thread.set('metadata',{...thread.get('metadata'),issue:{...thread.get('metadata').issue,quote:'完成率'}});comment.set('metadata',{...metadata,challengeReplacement:suggestion});return comment.get('id')},{id,tamper})
  await page.evaluate(({id,commentId})=>window.challenge.applyReplacement(id,commentId),{id,commentId})
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(capturedSource)
  expect(await page.evaluate(()=>window.challenge.threads[0].comments.at(-1).metadata.challengeReplacement.status)).toBe('stale')
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('blocks an oversized complete sentence before requesting a replacement while allowing discussion',async()=>{
 const {context,page,errors}=await fixture('文'.repeat(6000)+'错误。','错误');try{
  await page.evaluate(()=>window.start('optimize'));await expect.poll(()=>page.evaluate(()=>window.completed)).toBe(1)
  expect(await page.evaluate(()=>window.jobs.length)).toBe(0)
  expect(await page.evaluate(()=>window.messages().at(-1))).toContain('超过6000')
  await start(page,'reply','依据是什么？');await finish(page,answer);await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('preserves another native comment inside the complete sentence and on native undo/redo',async()=>{
 const {context,page,errors,id}=await fixture(capturedSource,capturedQuote);try{
  const other=await page.evaluate(()=>window.seed({quote:'因此完成率'}))
  await page.evaluate(id=>window.challenge.select(id),id);await start(page,'optimize');await finish(page,{...answer,reply:{text:'建议修正。',replacement:capturedReplacement}});await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  await page.locator('.en-challenge-card[data-thread-id="'+id+'"]').getByRole('button',{name:'替换到原文',exact:true}).click()
  const mark=()=>page.locator('.bn-editor [data-bn-thread-id="'+other+'"]').allTextContents()
  expect(await mark()).toEqual(['因此完成率'])
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(capturedReplacement)
  await page.locator('.bn-editor').focus();await page.keyboard.press('Meta+z');expect(await mark()).toEqual(['因此完成率'])
  await page.keyboard.press('Meta+Shift+z');expect(await mark()).toEqual(['因此完成率'])
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
for(const change of ['anchor','source','kind'])it('drops an in-flight direct replacement after current thread '+change+' changes',async()=>{
 const {context,page,errors,id}=await fixture(capturedSource,capturedQuote);try{
  await start(page,'reply','直接修改原文')
  await page.evaluate(({id,change})=>{const thread=window.noteDoc.getMap('threads').get(id),metadata=thread.get('metadata');thread.set('metadata',{...metadata,...change==='anchor'?{issue:{...metadata.issue,quote:'完成率'}}:change==='source'?{sourceText:'过期的原文快照'}:{kind:'其他评论'}})},{id,change})
  await finish(page,{...answer,reply:{text:'迟到的完整句建议',replacement:capturedReplacement}});await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(capturedSource)
  expect(await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('comments').length,id)).toBe(2)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('retains a deleted-quote thread history and draft without reanchoring it to new digits, and restores its exact mark only on native undo',async()=>{
 const {context,page,errors,id}=await fixture(capturedSource,capturedQuote);try{
  await page.setViewportSize({width:2400,height:900})
  const overwritten=await page.evaluate(()=>window.seed({quote:'90'})),unchanged=await page.evaluate(()=>window.seed({quote:'因此完成率'}))
  await expect.poll(()=>page.evaluate(()=>window.challenge.threads.length)).toBe(3)
  // Give B real native user/assistant history before its quoted text is replaced.
  await page.evaluate(id=>{void window.challenge.runAction(window.challenge.threads.find(thread=>thread.id===id),'reply','请保留这项统计讨论。')},overwritten)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  await finish(page,{...answer,reply:{text:'这份统计讨论仍可继续。'}})
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  await page.evaluate(id=>{window.challenge.setDraft(id,'B未发送草稿不能丢');const thread=window.noteDoc.getMap('threads').get(id);thread.set('metadata',{...thread.get('metadata'),preservedContext:{source:'B的原始90统计依据',revision:7}})},overwritten)
  const before=await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).toJSON(),overwritten)
  const mark=id=>page.locator('.bn-editor [data-bn-thread-id="'+id+'"]').allTextContents()
  expect(await mark(overwritten)).toEqual(['90']);expect(await mark(unchanged)).toEqual(['因此完成率'])
  await page.evaluate(id=>{window.challenge.select(id);void window.challenge.runAction(window.challenge.threads.find(thread=>thread.id===id),'optimize')},id)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2)
  await finish(page,{...answer,reply:{text:'完成率应为75%。',replacement:capturedReplacement}},1)
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  await page.locator('.en-challenge-card[data-thread-id="'+id+'"]').getByRole('button',{name:'替换到原文',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(capturedReplacement)
  expect(await mark(overwritten)).toEqual([]);expect(await mark(unchanged)).toEqual(['因此完成率'])
  expect(await page.locator('.en-challenge-card[data-thread-id="'+overwritten+'"]').count()).toBe(0)
  expect(await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).toJSON(),overwritten)).toEqual(before)
  await page.locator('.bn-editor').focus();await page.keyboard.press('Meta+z')
  await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(capturedSource)
  expect(await mark(overwritten)).toEqual(['90']);expect(await mark(unchanged)).toEqual(['因此完成率'])
  await expect.poll(()=>page.locator('.en-challenge-card[data-thread-id="'+overwritten+'"]').count()).toBe(1)
  expect(await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).toJSON(),overwritten)).toEqual(before)
  await page.keyboard.press('Meta+Shift+z')
  await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(capturedReplacement)
  expect(await mark(overwritten)).toEqual([]);expect(await mark(unchanged)).toEqual(['因此完成率'])
  expect(await page.locator('.en-challenge-card[data-thread-id="'+overwritten+'"]').count()).toBe(0)
  expect(await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).toJSON(),overwritten)).toEqual(before)
  expect(await page.evaluate(()=>window.noteDoc.getMap('threads').size)).toBe(3)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('continues read-only discussion at a still-unique quote after unrelated source text changes but refuses stale optimization and direct edits',async()=>{
 const {context,page,errors,id}=await fixture(capturedSource,capturedQuote);try{
  await page.evaluate(()=>window.editor.updateBlock('p',{content:'另加一个背景句。'+window.editor.getBlock('p').content.map(c=>c.text).join('')}))
  const before=await page.evaluate(()=>({content:window.editor.getBlock('p').content,date:window.noteDoc.getMap('note-metadata').get('editedAt')}))
  await page.evaluate(id=>{void window.challenge.runAction(window.challenge.threads.find(thread=>thread.id===id),'reply','请说明这项统计的依据。')},id)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  expect(await page.evaluate(()=>window.jobs[0].input.blocks[0].text)).toBe('另加一个背景句。'+capturedSource)
  await finish(page,{...answer,reply:{text:'可以继续讨论，当前没有外部核验来源。'}})
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.messages().at(-1))).toBe('可以继续讨论，当前没有外部核验来源。')
  await page.evaluate(id=>{void window.challenge.runAction(window.challenge.threads.find(thread=>thread.id===id),'reply','继续说明这项统计。')},id)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2)
  await finish(page,{...answer,reply:{text:'模型擅自附带编辑建议。',replacement:capturedReplacement}},1)
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.messages().at(-1))).toContain('请重新优化')
  expect(await page.locator('.en-challenge-replace').count()).toBe(0)
  for(const kind of ['optimize','reply']){
   await page.evaluate(({id,kind})=>window.challenge.runAction(window.challenge.threads.find(thread=>thread.id===id),kind,kind==='reply'?'直接修改原文':''),{id,kind})
   expect(await page.evaluate(()=>window.jobs.length)).toBe(2)
   expect(await page.evaluate(()=>window.messages().at(-1))).toContain('正文已变化')
  }
  expect(await page.evaluate(()=>({content:window.editor.getBlock('p').content,date:window.noteDoc.getMap('note-metadata').get('editedAt')}))).toEqual(before)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('keeps optimization running when its bubble closes and saves the preview without reopening or editing the note',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.evaluate(id=>{window.challenge.select(id);window.challenge.setDraft(id,'关卡片时仍保留的草稿')},id)
  const before=await page.evaluate(()=>({content:window.editor.getBlock('p').content,date:window.noteDoc.getMap('note-metadata').get('editedAt')}))
  await start(page,'optimize');await page.evaluate(id=>window.challenge.close(id),id)
  expect(await page.evaluate(()=>({busy:window.challenge.busyId,kind:window.challenge.actionKind,stops:window.calls.filter(c=>c.method==='challenge-stop').length}))).toEqual({busy:id,kind:'optimize',stops:0})
  await finish(page,{...answer,reply:{text:'可替换的优化建议。',replacement:'这项结论的程度较高。'}})
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.challenge.selected||null)).toBeNull();expect(await page.locator('.en-challenge-card').count()).toBe(0)
  expect(await page.evaluate(()=>({content:window.editor.getBlock('p').content,date:window.noteDoc.getMap('note-metadata').get('editedAt')}))).toEqual(before)
  await page.evaluate(id=>window.challenge.select(id),id);await page.getByRole('button',{name:'替换到原文',exact:true}).waitFor()
  expect(await page.getByRole('textbox',{name:'回复AI挑战'}).inputValue()).toBe('关卡片时仍保留的草稿');expect(await page.locator('.en-challenge-replacement-text').textContent()).toBe('这项结论的程度较高。')
  expect(await page.evaluate(()=>window.messages())).toContain('可替换的优化建议。');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('shows an in-button optimization ring, keeps it on reopening, and clears it on a hidden-task failure',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.evaluate(id=>window.challenge.select(id),id);await page.getByRole('button',{name:'AI优化',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  const button=page.getByRole('button',{name:'AI优化',exact:true}),ring=button.locator('[role="progressbar"]')
  await ring.waitFor();expect(await button.getAttribute('aria-busy')).toBe('true');expect(await button.isDisabled()).toBe(true)
  await page.screenshot({path:'/tmp/notes-optimize-button-running-20261021.png'})
  expect(await ring.evaluate(el=>{const ring=el.getBoundingClientRect(),button=el.parentElement.getBoundingClientRect();return ring.width>0&&ring.left>=button.left&&ring.right<button.right&&getComputedStyle(el).borderRadius==='50%'})).toBe(true)
  await page.evaluate(id=>{window.challenge.close(id);window.challenge.select(id)},id);await ring.waitFor();expect(await page.evaluate(()=>window.calls.filter(c=>c.method==='challenge-stop').length)).toBe(0)
  await page.emulateMedia({reducedMotion:'reduce'});expect(await ring.evaluate(el=>getComputedStyle(el).animationName)).toBe('none')
  await page.evaluate(id=>window.challenge.close(id),id);await page.evaluate(()=>window.jobs[0].reject(Error('fixture error')))
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull();await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(0)
  await page.evaluate(id=>window.challenge.select(id),id);await page.getByRole('button',{name:'AI优化',exact:true}).waitFor();expect(await ring.count()).toBe(0);expect(await button.isEnabled()).toBe(true)
  expect(await page.evaluate(()=>window.messages().at(-1))).toBe('没能完成，请重试');expect(errors).toEqual([])
  await page.screenshot({path:'/tmp/notes-optimize-background-finished-20261021.png'})
 }finally{await context.close()}
},15000)

it('shows a flowing perimeter only during work, keeps picker geometry and clicks, and respects reduced motion in both themes',async()=>{
 const{context,page,errors}=await fixture();try{
  const trigger=page.locator('.en-challenge-trigger'),perimeter=()=>trigger.evaluate(el=>{const s=getComputedStyle(el,'::before');return {animation:s.animationName,angle:s.getPropertyValue('--en-challenge-orbit-angle'),opacity:s.opacity,pointerEvents:s.pointerEvents,mask:s.maskComposite,background:s.backgroundImage}})
  const before=await trigger.boundingBox();expect((await perimeter()).animation).toBe('none')
  await start(page,'optimize');await expect.poll(()=>trigger.getAttribute('aria-busy')).toBe('true')
  for(const dark of [false,true]){
   await page.locator('.en-root').evaluate((el,dark)=>el.dataset.dark=String(dark),dark)
   await expect.poll(()=>trigger.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(dark?'rgb(44, 44, 44)':'rgb(233, 233, 233)')
   const first=await perimeter();expect(first.animation).toBe('en-challenge-orbit');expect(first.pointerEvents).toBe('none');expect(first.mask).toContain('exclude');expect(first.background).toContain('conic-gradient');expect(first.background).toContain('rgba(0, 0, 0, 0)');expect(first.background).toContain(dark?'255, 255, 255':'84, 103, 130')
   await expect.poll(async()=>(await perimeter()).angle).not.toBe(first.angle)
   expect(await trigger.boundingBox()).toEqual(before)
   await trigger.click();await page.getByRole('slider',{name:'挑战强度'}).waitFor();await page.keyboard.press('Escape')
   await trigger.screenshot({path:'/tmp/notes-challenge-orbit-'+(dark?'dark':'light')+'-20261022.png'})
  }
  await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(async()=>(await perimeter()).animation).toBe('none');expect((await perimeter()).background).toContain('conic-gradient')
  await finish(page);await expect.poll(()=>trigger.getAttribute('aria-busy')).toBe('false');expect((await perimeter()).animation).toBe('none')
  await expect.poll(async()=>(await perimeter()).opacity).toBe('0');expect(await trigger.boundingBox()).toEqual(before);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('automatically reviews a fresh unpunctuated edit while its caret remains in the real editor',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.clock.install();await page.evaluate(()=>{window.editor._tiptapEditor.commands.blur();window.challenge.setLevel(3)})
  await page.clock.fastForward(2000);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  await finish(page,{version:1,issues:[],coveredBlockIds:['p'],checks:[]});await expect.poll(()=>page.evaluate(()=>window.challenge.phase)).toBe('idle')
  await page.evaluate(()=>{window.editor.updateBlock('p',{content:'请审和这份报告'});window.editor.focus();window.editor.setTextCursorPosition('p','end')})
  expect(await page.evaluate(()=>window.editor._tiptapEditor.view.hasFocus())).toBe(true)
  await page.clock.fastForward(5000);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2)
  expect(await page.evaluate(()=>window.jobs[1].input.blocks.find(b=>b.id==='p').text)).toBe('请审和这份报告')
  await finish(page,{version:1,issues:[{blockId:'p',quote:'审和',category:'typo',message:'疑为“审核”。',evidence:[]}],coveredBlockIds:['p'],checks:[]},1)
  await expect.poll(()=>page.locator('.bn-editor [data-bn-thread-id]').textContent()).toContain('审和')
  await page.clock.fastForward(60000);expect(await page.evaluate(()=>window.jobs.length)).toBe(2);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('coalesces slider changes and starts the selected tier immediately after closing, including after a recent review',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.clock.install();const trigger=page.locator('.en-challenge-trigger'),slider=page.getByRole('slider',{name:'挑战强度'})
  await trigger.click();await slider.press('ArrowRight');expect(await page.locator('.en-challenge-description').textContent()).toBe('仅指出错别字及拼写错误')
  await slider.press('ArrowRight');expect(await page.locator('.en-challenge-description').textContent()).toBe('指出事实、逻辑、表达方面问题')
  await page.clock.fastForward(60000);expect(await page.evaluate(()=>window.jobs.length)).toBe(0)
  await page.keyboard.press('Escape');await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  expect(await page.locator('.en-challenge-popover').count()).toBe(0);expect(await page.evaluate(()=>window.jobs[0].input.level)).toBe(2)
  await finish(page,{version:1,issues:[],coveredBlockIds:['p'],checks:[]});await expect.poll(()=>trigger.getAttribute('aria-busy')).toBe('false')
  await trigger.click();await slider.press('End');expect(await page.locator('.en-challenge-description').textContent()).toBe('热衷质疑与追问，协助完善内容')
  await page.clock.fastForward(1);expect(await page.evaluate(()=>window.jobs.length)).toBe(1)
  await trigger.click();await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2)
  expect(await page.evaluate(()=>window.jobs[1].input.level)).toBe(4);expect(await trigger.getAttribute('aria-busy')).toBe('true');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('releases a visible picker pause when the native header retargets its portal',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.clock.install();await page.evaluate(()=>{document.body.insertAdjacentHTML('beforeend','<div id="slot-a" data-en-challenge-tools="note-a"></div><div id="slot-b" data-en-challenge-tools="other"></div>')})
  await page.locator('#slot-a .en-challenge-trigger').waitFor();await page.locator('#slot-a .en-challenge-trigger').click();await page.getByRole('slider',{name:'挑战强度'}).press('ArrowRight')
  await expect.poll(()=>page.evaluate(()=>window.challenge.phase)).toBe('paused')
  await page.evaluate(()=>{document.querySelector('#slot-a').dataset.enChallengeTools='other';document.querySelector('#slot-b').dataset.enChallengeTools='note-a'})
  await page.locator('#slot-b .en-challenge-trigger').waitFor();await page.clock.fastForward(1)
  await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1);expect(await page.locator('.en-challenge-popover').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

async function applyTrackedReplacement(page,replacement='这项结论的程度较高。'){
 await page.locator('.bn-editor [data-bn-thread-id]').first().click();await start(page,'optimize');await finish(page,{...answer,reply:{text:'修正错别字。',replacement}})
 await page.getByRole('button',{name:'替换到原文',exact:true}).click();await page.locator('.en-replacement-mark').waitFor();return replacement
}
it('highlights the complete marked replacement, opens an original/replacement comparison, and restores only its own scope',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.locator('.bn-editor [data-bn-thread-id]').first().click();await page.getByRole('textbox',{name:'回复AI挑战'}).fill('保留未发送的原讨论草稿')
  const replacement=await applyTrackedReplacement(page),mark=page.locator('.en-replacement-mark');expect(await mark.textContent()).toBe('程度')
  await mark.click();const popup=page.getByRole('dialog',{name:'替换对照'});await popup.waitFor();expect(await popup.locator('[data-replacement-before]').textContent()).toBe('成度');expect(await popup.locator('[data-replacement-after]').textContent()).toBe('程度')
  const bounds=await popup.boundingBox(),area=await page.locator('.en-main').boundingBox();expect(bounds.y).toBeGreaterThanOrEqual(area.y);expect(bounds.y+bounds.height).toBeLessThanOrEqual(area.y+area.height)
  await page.evaluate(()=>{const range=window.editor._tiptapEditor.state.doc;let from;range.descendants((node,pos)=>{if(node.type.name==='blockContainer'&&node.attrs.id==='p'){from=pos+2;return false}});const text=window.editor.getBlock('p').content.map(c=>c.text||'').join('');window.editor.transact(tr=>{tr.insertText('段后新增说明。',from+text.length);tr.insertText('新补充的前言。',from)})})
  await page.locator('.en-replacement-mark').click();await popup.getByRole('button',{name:'取消替换',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text||'').join(''))).toBe('新补充的前言。'+original+'段后新增说明。')
  expect(await page.locator('.en-replacement-mark').count()).toBe(0);expect(await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('metadata').draft,id)).toBe('保留未发送的原讨论草稿')
  await page.locator('.bn-editor [data-bn-thread-id]').first().click();await expect.poll(()=>page.getByRole('button',{name:'替换到原文',exact:true}).count()).toBe(1);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('retains replacement reviews across remount and resolves their highlight without changing the applied text',async()=>{
 const{context,page,errors,id}=await fixture();try{
  const replacement=await applyTrackedReplacement(page);await expect.poll(()=>page.evaluate(()=>!!window.saved['note-a']?.yjs)).toBe(true)
  await page.waitForTimeout(850);await page.evaluate(()=>window.remount());await page.locator('.en-replacement-mark').waitFor();await page.locator('.en-replacement-mark').click()
  const popup=page.getByRole('dialog',{name:'替换对照'});await popup.getByRole('button',{name:'已解决',exact:true}).click()
  await expect.poll(()=>page.locator('.en-replacement-mark').count()).toBe(0);expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text||'').join(''))).toBe(replacement)
  expect(await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('resolved'),id)).toBe(true);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('tracks direct requested replacements and hides/reappears with native undo and redo',async()=>{
 const{context,page,errors}=await fixture();try{
  await start(page,'reply','直接替换到原文');const replacement='这项结论的程度较高。';await finish(page,{...answer,reply:{text:'已按要求修正。',replacement}})
  await expect.poll(()=>page.evaluate(()=>({body:window.editor.getBlock('p').content.map(c=>c.text||'').join(''),records:window.noteDoc.getMap('note-replacement-reviews').size,messages:window.messages()}))).toMatchObject({body:replacement,records:1});await page.locator('.en-replacement-mark').waitFor();await page.locator('.bn-editor').focus();await page.keyboard.press('Meta+z');await expect.poll(()=>page.locator('.en-replacement-mark').count()).toBe(0)
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text||'').join(''))).toBe(original)
  await page.keyboard.press('Meta+Shift+z');await page.locator('.en-replacement-mark').waitFor();await page.locator('.en-replacement-mark').click()
  expect(await page.locator('[data-replacement-after]').textContent()).toBe('程度');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('refuses a stale targeted restore after the user edits the applied sentence and still allows resolving its review',async()=>{
 const{context,page,errors}=await fixture();try{
  await applyTrackedReplacement(page);await page.locator('.en-replacement-mark').click();const popup=page.getByRole('dialog',{name:'替换对照'})
  await page.evaluate(()=>window.editor.updateBlock('p',{content:'这项结论的评估程度有所提升。'}));await expect.poll(()=>popup.getByRole('button',{name:'取消替换',exact:true}).isDisabled()).toBe(true)
  expect(await popup.textContent()).toContain('已再次编辑');await popup.getByRole('button',{name:'已解决',exact:true}).click();expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text||'').join(''))).toBe('这项结论的评估程度有所提升。');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('never moves a replacement review onto a newly added identical quote after the original range changes',async()=>{
 const{context,page,errors}=await fixture();try{
  const replacement=await applyTrackedReplacement(page);await page.locator('.en-replacement-mark').click()
  await page.evaluate(replacement=>window.editor.updateBlock('p',{content:'这项结论的评估有所提升。另一个引用：'+replacement}),replacement)
  await expect.poll(()=>page.locator('.en-replacement-mark').count()).toBe(0)
  expect(await page.getByRole('button',{name:'取消替换',exact:true}).isDisabled()).toBe(true);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('restores original inline styles when cancelling an optimized replacement',async()=>{
 const{context,page,errors}=await fixture([{type:'text',text:'这项结论的',styles:{}},{type:'text',text:'成',styles:{bold:true}},{type:'text',text:'度',styles:{italic:true}},{type:'text',text:'较高。',styles:{}}]);try{
  await applyTrackedReplacement(page,'这项判断已经明确。');await page.locator('.en-replacement-mark').click();await page.getByRole('button',{name:'取消替换',exact:true}).click()
  const content=await page.evaluate(()=>window.editor.getBlock('p').content)
  expect(content.find(c=>c.text==='成')?.styles.bold).toBe(true);expect(content.find(c=>c.text==='度')?.styles.italic).toBe(true);expect(content.map(c=>c.text||'').join('')).toBe(original);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('keeps outside edits, original discussion and replacement review through cancelling and native undo/redo',async()=>{
 const{context,page,errors,id}=await fixture();try{
  const replacement=await applyTrackedReplacement(page)
  await page.evaluate(()=>{const state=window.editor._tiptapEditor.state;let from;state.doc.descendants((n,pos)=>{if(n.type.name==='blockContainer'&&n.attrs.id==='p'){from=pos+2;return false}});window.editor.transact(tr=>{tr.insertText('补充说明。',from+window.editor.getBlock('p').content.map(c=>c.text||'').join('').length);tr.insertText('前言。',from)})})
  await page.locator('.en-replacement-mark').click();await page.getByRole('button',{name:'取消替换',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text||'').join(''))).toBe('前言。'+original+'补充说明。')
  await page.locator('.bn-editor').focus();await page.keyboard.press('Meta+z');await page.locator('.en-replacement-mark').waitFor()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text||'').join(''))).toBe('前言。'+replacement+'补充说明。')
  expect(await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('resolved'),id)).toBe(true)
  await page.keyboard.press('Meta+Shift+z');await expect.poll(()=>page.locator('.en-replacement-mark').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('automatically resolves the replaced discussion, keeps its draft and shows only fragment comparison with reviewer labels outside prose',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.evaluate(id=>window.challenge.setDraft(id,'原讨论未发送的草稿'),id)
  await applyTrackedReplacement(page,'这项结论的程度较高（待核实）。')
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text||'').join(''))).toBe('这项结论的程度较高。')
  expect(await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('resolved'),id)).toBe(true)
  expect(await page.locator('.en-challenge-card').count()).toBe(0)
  await page.locator('.en-replacement-mark').click();const popup=page.getByRole('dialog',{name:'替换对照'});expect(await popup.locator('[data-replacement-before]').textContent()).toBe('成度');expect(await popup.locator('[data-replacement-after]').textContent()).toBe('程度')
  await popup.getByRole('button',{name:'取消替换',exact:true}).click()
  await expect.poll(()=>page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('resolved'),id)).toBe(false)
  expect(await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('metadata').draft,id)).toBe('原讨论未发送的草稿');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('allows a cancelled suggestion to be applied again and highlights the whole marked replacement including shared edge characters',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await applyTrackedReplacement(page);expect(await page.locator('.en-replacement-mark').textContent()).toBe('程度')
  await page.locator('.en-replacement-mark').click();await page.getByRole('button',{name:'取消替换',exact:true}).click()
  await page.locator('.bn-editor [data-bn-thread-id]').first().click();const button=page.getByRole('button',{name:'替换到原文',exact:true});await button.waitFor();expect(await button.isEnabled()).toBe(true);await button.click()
  await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text||'').join(''))).toBe('这项结论的程度较高。')
  expect(await page.locator('.en-replacement-mark').allTextContents()).toEqual(['程度']);expect(await page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('resolved'),id)).toBe(true);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('shows per-paragraph reviewed lines, exact unresolved counts and tier tooltips without marking unread paragraphs',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.clock.install();await page.evaluate(id=>window.challenge.resolve(id),id)
  await page.evaluate(()=>window.editor.replaceBlocks(window.editor.document,[{id:'p',type:'paragraph',content:'这是已经校对的正常段落。'},{id:'r',type:'paragraph',content:'请提胶并审和报告。'},{id:'q',type:'paragraph',content:'这是尚未阅读的段落。'}]))
  await page.evaluate(()=>window.challenge.setLevel(4));await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  expect(await page.locator('.en-challenge-paragraph-line').count()).toBe(0)
  await finish(page,{version:1,issues:[{blockId:'r',quote:'提胶',category:'typo',message:'应为提交。',evidence:[]},{blockId:'r',quote:'审和',category:'typo',message:'应为审核。',evidence:[]}],coveredBlockIds:['p','r'],completeBlockIds:['p','r'],checks:[{kind:'review',status:'partial',detail:'已检查其中两个段落。'}]})
  const passed=page.locator('.en-challenge-paragraph-line[data-block-id=p]'),issues=page.locator('.en-challenge-paragraph-line[data-block-id=r]')
  await expect.poll(()=>page.locator('.en-challenge-paragraph-line').count()).toBe(2)
  expect(await passed.getAttribute('data-state')).toBe('passed');expect(await passed.getAttribute('aria-label')).toContain('抬杠模式')
  expect(await issues.getAttribute('data-state')).toBe('issues');expect(await issues.getAttribute('aria-label')).toContain('2 处未解决问题')
  expect(await page.locator('.en-challenge-paragraph-line[data-block-id=q]').count()).toBe(0)
  await issues.hover();await expect.poll(()=>issues.getByRole('tooltip').isVisible()).toBe(true)
  const para=await page.locator('.bn-block-content[data-content-type=paragraph]').first().boundingBox(),line=await passed.boundingBox(),document=await page.locator('.en-document').boundingBox()
  expect(Math.abs(line.y-para.y)).toBeLessThan(2);expect(line.x).toBeGreaterThan(document.x+document.width);expect(Math.abs(line.height-para.height)).toBeLessThan(2)
  await issues.evaluate(el=>{window.originalStatusLine=el});await issues.focus()
  await page.evaluate(()=>{for(const thread of window.challenge.threads)void window.challenge.resolve(thread.id)})
  await expect.poll(()=>issues.getAttribute('data-state')).toBe('passed');expect(await issues.evaluate(el=>el===window.originalStatusLine)).toBe(true);expect(await issues.evaluate(el=>el===el.ownerDocument.activeElement)).toBe(true);expect(await issues.getAttribute('aria-label')).toContain('已解决 2 处问题')
  await page.evaluate(()=>window.editor.updateBlock('p',{content:'用户刚编辑过的新段落。'}));await expect.poll(()=>passed.count()).toBe(0)
  await page.evaluate(()=>window.challenge.setLevel(1));await page.clock.fastForward(600);await expect.poll(()=>page.locator('.en-challenge-paragraph-line').count()).toBe(0)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('does not display a passed line after a partial depth response, a failed request, or disabling challenge',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.clock.install();await page.evaluate(id=>window.challenge.resolve(id),id);await page.evaluate(()=>window.challenge.setLevel(3));await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  await finish(page,{version:1,issues:[],coveredBlockIds:['p'],completeBlockIds:[],checks:[{kind:'review',status:'partial',detail:'深入检查未完成。'}]});await expect.poll(()=>page.evaluate(()=>window.challenge.phase)).toBe('waiting')
  expect(await page.locator('.en-challenge-paragraph-line').count()).toBe(0)
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-challenge-recheck',{detail:{sessionId:'note-a'}})));await page.clock.fastForward(5000);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2)
  await page.evaluate(()=>window.jobs[1].reject(Error('provider unavailable')));await page.clock.fastForward(1);expect(await page.locator('.en-challenge-paragraph-line').count()).toBe(0)
  await page.evaluate(()=>window.challenge.setLevel(0));expect(await page.locator('.en-challenge-paragraph-line').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('keeps a clickable review anchor for a pure deletion and can restore the removed text',async()=>{
 const{context,page,errors}=await fixture('请多提交报告。','多');try{
  await applyTrackedReplacement(page,'请提交报告。');await page.locator('.en-replacement-mark').click()
  const popup=page.getByRole('dialog',{name:'替换对照'});expect(await popup.locator('[data-replacement-before]').textContent()).toBe('多');expect(await popup.locator('[data-replacement-after]').textContent()).toBe('（已删除）')
  await popup.getByRole('button',{name:'取消替换',exact:true}).click();expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text||'').join(''))).toBe('请多提交报告。');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('keeps a reviewed paragraph tooltip visible while the top of a long paragraph is scrolled away',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.clock.install();await page.evaluate(id=>window.challenge.resolve(id),id)
  await page.evaluate(()=>{window.editor.updateBlock('p',{content:'这段正常文字用于检查长段落滚动时反馈的位置。'.repeat(90)});window.challenge.setLevel(2)})
  await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  await finish(page,{version:1,issues:[],coveredBlockIds:['p'],completeBlockIds:['p'],checks:[{kind:'review',status:'completed',detail:'已完成。'}]})
  const line=page.locator('.en-challenge-paragraph-line'),area=await page.locator('.en-main').boundingBox();await line.waitFor()
  await page.locator('.en-document-scroll').evaluate(el=>{el.scrollTop=300;el.dispatchEvent(new Event('scroll'))})
  await expect.poll(async()=>Math.round((await line.boundingBox()).y)).toBeLessThan(Math.round(area.y))
  const rect=await line.boundingBox();await line.hover({position:{x:6,y:area.y-rect.y+24}})
  const tooltip=line.getByRole('tooltip');await expect.poll(()=>tooltip.isVisible()).toBe(true);expect((await tooltip.boundingBox()).y).toBeGreaterThanOrEqual(area.y);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('anchors paragraph feedback beside its own line with the real global floating surfaces mounted',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.evaluate(()=>window.enableFloatingSurfaces());await page.clock.install();await page.evaluate(id=>window.challenge.resolve(id),id)
  await page.evaluate(()=>{window.editor.replaceBlocks(window.editor.document,[{id:'p',type:'paragraph',content:'这是已经校对的正常段落。'},{id:'r',type:'paragraph',content:'请提胶并审和报告。'}]);window.challenge.setLevel(2)})
  await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  await finish(page,{version:1,issues:[{blockId:'r',quote:'提胶',category:'typo',message:'应为提交。',evidence:[]}],coveredBlockIds:['p','r'],completeBlockIds:['p','r'],checks:[]})
  for(const block of ['p','r']){
   const line=page.locator('.en-challenge-paragraph-line[data-block-id='+block+']');await line.hover();const tooltip=line.getByRole('tooltip');await expect.poll(()=>tooltip.isVisible()).toBe(true)
   const a=await line.boundingBox(),b=await tooltip.boundingBox();expect(b.x).toBeGreaterThan(24);expect(b.x+b.width).toBeLessThan(a.x);expect(a.x-b.x-b.width).toBeLessThan(32);expect(Math.abs(a.y-b.y)).toBeLessThan(20)
   expect(await tooltip.getAttribute('data-odyssey-floating-surface')).toBeNull()
  }
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('fades newly reviewed paragraph lines in without moving the text and respects reduced motion',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.clock.install();await page.evaluate(id=>window.challenge.resolve(id),id);await page.evaluate(()=>window.challenge.setLevel(2));await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  await finish(page,{version:1,issues:[],coveredBlockIds:['p'],completeBlockIds:['p'],checks:[]})
  const line=page.locator('.en-challenge-paragraph-line');await line.waitFor();const before=await page.locator('.bn-block-content').first().boundingBox()
  const opacity=await line.evaluate(el=>{const stroke=el.querySelector('.en-challenge-paragraph-stroke'),animation=stroke.getAnimations()[0];if(!animation)return null;animation.pause();const duration=Number(animation.effect.getTiming().duration);return [0,duration/2,duration].map(time=>{animation.currentTime=time;return Number(getComputedStyle(stroke).opacity)})})
  expect(opacity).not.toBeNull();expect(opacity[0]).toBeLessThan(.05);expect(opacity[1]).toBeGreaterThan(opacity[0]);expect(opacity[1]).toBeLessThan(1);expect(opacity[2]).toBeCloseTo(1)
  expect(await page.locator('.bn-block-content').first().boundingBox()).toEqual(before)
  await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>line.locator('.en-challenge-paragraph-stroke').evaluate(el=>el.getAnimations().length)).toBe(0);expect(await line.locator('.en-challenge-paragraph-stroke').evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('spaces paragraph strokes and overlaps their document-ordered entrance and tier-exit fades',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.clock.install();await page.evaluate(id=>window.challenge.resolve(id),id)
  await page.evaluate(()=>{window.editor.replaceBlocks(window.editor.document,['p','r','s'].map(id=>({id,type:'paragraph',content:'这是第'+id+'段已经校对的正常文字。'})));window.challenge.setLevel(2)})
  await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  await finish(page,{version:1,issues:[],coveredBlockIds:['p','r','s'],completeBlockIds:['p','r','s'],checks:[]})
  const lines=page.locator('.en-challenge-paragraph-line');await expect.poll(()=>lines.count()).toBe(3)
  const entry=await lines.evaluateAll(elements=>elements.map(el=>{const stroke=el.querySelector('.en-challenge-paragraph-stroke'),a=stroke?.getAnimations()[0];if(!a)return null;a.pause();const timing=a.effect.getTiming();a.currentTime=180;return {delay:timing.delay,duration:timing.duration,opacity:Number(getComputedStyle(stroke).opacity),inset:stroke.getBoundingClientRect().y-el.getBoundingClientRect().y,gap:el.getBoundingClientRect().height-stroke.getBoundingClientRect().height}}))
  expect(entry.every(Boolean)).toBe(true);expect(entry.map(x=>x.delay)).toEqual([0,55,110]);expect(entry[1].delay).toBeLessThan(entry[0].duration);expect(entry[0].opacity).toBeGreaterThan(entry[1].opacity);expect(entry[1].opacity).toBeGreaterThan(entry[2].opacity);expect(entry.every(x=>x.inset>=3&&x.gap>=6)).toBe(true)
  await lines.first().focus();await page.evaluate(()=>window.challenge.setLevel(3))
  const exits=page.locator('.en-challenge-paragraph-line[data-exiting]');await expect.poll(()=>exits.count()).toBe(3)
  expect(await exits.first().getAttribute('tabindex')).toBe('-1');expect(await exits.first().getAttribute('aria-hidden')).toBe('true');expect(await exits.first().evaluate(el=>el.inert)).toBe(true);expect(await exits.first().evaluate(el=>el.contains(document.activeElement))).toBe(false);expect(await page.getByRole('tooltip').count()).toBe(0)
  const exit=await exits.evaluateAll(elements=>elements.map(el=>{const a=el.querySelector('.en-challenge-paragraph-stroke').getAnimations()[0];return {delay:a.effect.getTiming().delay,duration:a.effect.getTiming().duration}}));expect(exit.map(x=>x.delay)).toEqual([0,35,70]);expect(exit[1].delay).toBeLessThan(exit[0].duration)
  await page.clock.fastForward(600);await expect.poll(()=>exits.count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('does not replay paragraph entrance on scroll and clears tier exits under reduced motion or note switches',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.clock.install();await page.evaluate(id=>window.challenge.resolve(id),id)
  await page.evaluate(()=>{window.editor.replaceBlocks(window.editor.document,[{id:'p',type:'paragraph',content:'首段已完成校对。'},{id:'r',type:'paragraph',content:'下一段用于撑开滚动区域。'.repeat(250)}]);window.challenge.setLevel(2)})
  await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1);await finish(page,{version:1,issues:[],coveredBlockIds:['p'],completeBlockIds:['p'],checks:[]})
  const line=page.locator('.en-challenge-paragraph-line[data-block-id=p]');await line.waitFor();await page.clock.fastForward(600)
  await page.locator('.en-document-scroll').evaluate(el=>{el.scrollTop=600;el.dispatchEvent(new Event('scroll'))});await expect.poll(()=>line.count()).toBe(0)
  await page.locator('.en-document-scroll').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'))});await line.waitFor();expect(await line.locator('.en-challenge-paragraph-stroke').evaluate(el=>el.getAnimations().length)).toBe(0)
  await page.evaluate(()=>window.challenge.setLevel(3));await expect.poll(()=>page.locator('[data-exiting].en-challenge-paragraph-line').count()).toBe(1)
  await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>page.locator('[data-exiting].en-challenge-paragraph-line').count()).toBe(0)
  await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2);await finish(page,{version:1,issues:[],coveredBlockIds:['p'],completeBlockIds:['p'],checks:[]},1);await line.waitFor();expect(await line.locator('.en-challenge-paragraph-stroke').evaluate(el=>el.getAnimations().length)).toBe(0)
  await page.emulateMedia({reducedMotion:'no-preference'});await expect.poll(()=>page.locator('.en-challenge-paragraph-feedback').getAttribute('data-motion')).toBe('full');expect(await line.locator('.en-challenge-paragraph-stroke').evaluate(el=>el.getAnimations().length)).toBe(0);await page.evaluate(()=>window.challenge.setLevel(4));await expect.poll(()=>page.locator('[data-exiting].en-challenge-paragraph-line').count()).toBe(1);await page.evaluate(()=>window.switchNote('note-b'));await expect.poll(()=>page.locator('.en-challenge-paragraph-line').count()).toBe(0);await page.clock.fastForward(700);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('keeps interrupted line fades continuous and does not let an old tier timer remove a newly reviewed tier',async()=>{
 const{context,page,errors,id}=await fixture();try{
  await page.clock.install();await page.evaluate(id=>window.challenge.resolve(id),id);await page.evaluate(()=>window.challenge.setLevel(2));await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
  const done={version:1,issues:[],coveredBlockIds:['p'],completeBlockIds:['p'],checks:[]};await finish(page,done)
  const current=page.locator('.en-challenge-paragraph-line:not([data-exiting])'),leaving=page.locator('.en-challenge-paragraph-line[data-exiting]');await current.waitFor()
  const opacity=await current.locator('.en-challenge-paragraph-stroke').evaluate(el=>{const a=el.getAnimations()[0];a.pause();a.currentTime=70;return Number(getComputedStyle(el).opacity)})
  await page.evaluate(()=>window.challenge.setLevel(3));await leaving.waitFor()
  const exitOpacity=await leaving.locator('.en-challenge-paragraph-stroke').evaluate(el=>{const a=el.getAnimations()[0];a.pause();a.currentTime=0;return Number(getComputedStyle(el).opacity)});expect(Math.abs(exitOpacity-opacity)).toBeLessThan(.02)
  await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(2);await finish(page,done,1);await current.waitFor();expect(await current.getAttribute('aria-label')).toContain('严格模式')
  await page.evaluate(()=>window.challenge.setLevel(2));await page.clock.fastForward(1);await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(3);await finish(page,done,2);await current.waitFor();expect(await current.getAttribute('aria-label')).toContain('标准模式')
  await page.clock.fastForward(700);await expect.poll(()=>leaving.count()).toBe(0);expect(await current.count()).toBe(1);expect(await current.getAttribute('aria-label')).toContain('标准模式');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
