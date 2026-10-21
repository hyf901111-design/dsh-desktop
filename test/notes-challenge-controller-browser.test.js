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
for(const [text,direct] of [['请把原文改为程度的理由说明一下',false],['请把原文改为程度的方案给我看看',false],['请把这项结论替换为“程度”',false],['请把原文改为“程度’',false],['请把建议改为“更谨慎的表达”',false],['请把这条评论改为“是否需要核对”',false],['请把原文改为“程度”的理由说明一下',false],['请把原文改为“程度”的方案给我看看',false],['请把原文改为‘程度’',true],['请把成度替换为程度',true],['请帮我优化一下表达，先给建议',false],['请直接修改原文，把成度替换为程度',true],['你直接帮我改好替换上去',true],['不用解释，直接替换到原文',true],['不要解释，直接替换',true],['不要替换，只解释',false],['请解释为什么直接修改原文',false],['直接修改原文会丢格式吗？',false],['直接替换原文会影响已有评论吗？',false],['他说“直接替换原文”，你怎么看？',false],['现在就把原文改为程度',true],['可以帮我直接改好',true],['可以帮我改好吗？',true],['替换一下',true],['直接修改原文能保留格式吗？',false],['直接替换原文有格式丢失的问题吗？',false],['修改建议看起来很生硬',false]])it(`uses human intent to ${direct?'execute':'preview'} a reply replacement: ${text}`,async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.challenge.select(window.challenge.threads[0].id));const editedAt=await page.evaluate(()=>window.noteDoc.getMap('note-metadata').get('editedAt'));await start(page,'reply',text)
  await finish(page,{...answer,reply:{text:'模型声称已修改原文',replacement:'程度'}})
  await expect.poll(()=>page.evaluate(()=>window.challenge.busyId||null)).toBeNull()
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(direct?'这项结论的程度较高。':original)
  await expect.poll(()=>page.locator('.en-challenge-replace').count()).toBe(direct?0:1)
  if(!direct)expect(await page.evaluate(()=>window.noteDoc.getMap('note-metadata').get('editedAt'))).toBe(editedAt)
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

// Uses the real mounted scheduler; only the transport is deferred above.
it('keeps the swords static while waiting, animates a real review, and stops for success, failure, off and leaving notes',async()=>{
 const{context,page,errors}=await fixture();try{
  const trigger=page.locator('.en-challenge-trigger'),icon=trigger.locator('img').first()
  const staticSrc=await icon.getAttribute('src')
  const bounds=()=>trigger.evaluate(el=>{const r=el.getBoundingClientRect(),i=el.querySelector('img').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,iconX:i.x,iconY:i.y,iconWidth:i.width,iconHeight:i.height}})
  await page.clock.install()
  await page.evaluate(()=>{window.editor._tiptapEditor.commands.blur();window.challenge.setLevel(2)})
  await expect.poll(()=>page.evaluate(()=>window.challenge.phase)).toBe('waiting')
  const waitingBounds=await bounds(),waitingLabel=await trigger.getAttribute('aria-label')
  expect(waitingBounds.iconWidth).toBe(16);expect(waitingBounds.iconHeight).toBe(16)
  expect(await trigger.getAttribute('aria-busy')).toBe('false');expect(await icon.getAttribute('src')).toBe(staticSrc)
  await page.clock.fastForward(5100)
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
