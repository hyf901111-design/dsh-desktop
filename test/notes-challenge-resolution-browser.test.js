import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {mkdir,readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

const artifacts='/tmp/notes-copilot-feedback-20261026'
const original='订单同比增长即可保证全年净利润翻倍。这一判断仍需验证毛利率。'
const replacement='订单增长有望带动收入扩张，但不能直接推导全年净利润翻倍。利润兑现仍取决于交付确认、产品价格、毛利率和费用率。'
const clean={version:1,issues:[],coveredBlockIds:['p'],completeBlockIds:['p'],checks:[{kind:'review',status:'completed',detail:'当前段落已完整核验。'}]}
let browser,script,css
beforeAll(async()=>{
 await mkdir(artifacts,{recursive:true})
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountNotes}from'./src/preload/notes/mount';import{YjsThreadStore}from'@blocknote/core/yjs';import{DefaultThreadStoreAuth}from'@blocknote/core/comments';import'@blocknote/core/style.css';import{findChallengeQuote}from'./src/preload/notes/challenge-anchors';import{CHALLENGE_KIND,CHALLENGE_USER}from'./src/preload/notes/challenge-controller';import{noteText}from'./src/shared/workspace-notes';import*as Y from'yjs';
 window.jobs=[];window.calls=[];window.saved=null;window.replacement=${JSON.stringify(replacement)};
 const bridge={request:async(method,input)=>{window.calls.push({method,input});if(method==='load')return{saved:window.saved?{...window.saved,revision:0}:{title:'当前复查与评论历史',blocks:[{id:'p',type:'paragraph',content:${JSON.stringify(original)}},{id:'unresolved',type:'paragraph',content:'另一项风险尚未解决。'},{id:'manual',type:'paragraph',content:'人工评论保留原文。'}],yjs:'',revision:0}};if(method==='generate')return{kind:'text',markdown:window.replacement};if(method==='challenge')return new Promise((resolve,reject)=>window.jobs.push({input,resolve,reject}));if(method==='save'){window.saved=input.content;return{status:'saved',saved:{...input.content,revision:input.revision+1}}}return{}},draft:async()=>{}};
 const host={register:(_mode,surface)=>{surface.style.left='0';document.body.append(surface)},open:()=>{},close:()=>{},current:()=>'notes'};let mounted=mountNotes(document,bridge,host);window.remount=()=>{mounted.dispose();mounted=mountNotes(document,bridge,host)};
 window.seed=async(blockId,quote,manual=false)=>{const sourceText=window.editor.getBlock(blockId).content.map(c=>c.text||'').join(''),issue={blockId,quote,category:'logic',message:manual?'人工原始评论':'原始AI问题说明',evidence:[]},store=new YjsThreadStore(manual?'local':CHALLENGE_USER,window.noteDoc.getMap('threads'),new DefaultThreadStoreAuth(manual?'local':CHALLENGE_USER,'editor'));const thread=await store.createThread({metadata:manual?{}:{kind:CHALLENGE_KIND,issue,sourceText,draft:'历史讨论草稿保留'},initialComment:{body:[{type:'paragraph',content:[{type:'text',text:issue.message,styles:{}}]}]}});const range=findChallengeQuote(window.editor,blockId,quote);window.editor.transact(tr=>tr.setMeta('addToHistory',false).addMark(range.from,range.to,tr.doc.type.schema.marks.comment.create({threadId:thread.id,orphan:false})));return thread.id};
 window.historyFor=id=>{const thread=window.noteDoc.getMap('threads').get(id);return{resolved:thread.get('resolved'),metadata:thread.get('metadata'),comments:thread.get('comments').toArray().map(c=>({id:c.get('id'),userId:c.get('userId'),text:noteText(c.get('body'))}))}};
 window.savedHistoryFor=id=>{const doc=new Y.Doc();Y.applyUpdate(doc,Uint8Array.from(atob(window.saved.yjs),c=>c.charCodeAt(0)));try{const thread=doc.getMap('threads').get(id);return{resolved:thread.get('resolved'),comments:thread.get('comments').toArray().map(c=>noteText(c.get('body')))}}finally{doc.destroy()}};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'inline-production-styles',setup(b){b.onResolve({filter:/\.css\?inline$/},async args=>{const found=await b.resolve(args.path.slice(0,-7),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}},{name:'expose-real-note',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>{const source=await readFile(args.path,'utf8'),anchor='  const slashMenu = useMemo';if(source.split(anchor).length!==2)throw Error('real Notes exposure anchor drift');return{contents:source.replace(anchor,'  window.editor=editor;window.challenge=challenge;window.noteDoc=doc; '+anchor),loader:'tsx'}})}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(dark=false){
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[]
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(5000)
 await page.route('http://127.0.0.1/review-resolution',route=>route.fulfill({contentType:'text/html',body:'<header data-ework-notes-session="review-note"></header><div data-ework-note-view="review-note"></div>'}))
 await page.goto('http://127.0.0.1/review-resolution');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.bn-editor').waitFor()
 await page.evaluate(original=>window.editor.replaceBlocks(window.editor.document,[{id:'p',type:'paragraph',content:original},{id:'unresolved',type:'paragraph',content:'另一项风险尚未解决。'},{id:'manual',type:'paragraph',content:'人工评论保留原文。'}]),original)
 const ids=await page.evaluate(async dark=>{document.querySelector('.en-root').dataset.dark=String(dark);return{old:await window.seed('p','订单同比增长即可保证全年净利润翻倍。'),unresolved:await window.seed('unresolved','风险尚未解决'),manual:await window.seed('manual','人工评论',true)}},dark)
 return{context,page,errors,ids}
}
const mark=(page,id)=>page.locator('.bn-editor [data-bn-thread-id="'+id+'"]')
async function rewrite(page){
 await page.evaluate(()=>{window.editor.setTextCursorPosition('p','start');const from=window.editor._tiptapEditor.state.selection.from,text=window.editor.getBlock('p').content.map(c=>c.text||'').join('');window.editor.focus();window.editor._tiptapEditor.commands.setTextSelection({from,to:from+text.length})})
 // Use the real formatter's activation handler, as the native AX action does;
 // this fixture isolates the existing submit boundary from the InputHub shell.
 await page.getByRole('button',{name:'AI 改写',exact:true}).evaluate(button=>button.click())
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'review-note',prompt:'改写选中文字，保留原意并让表达更清晰。'}})))
 await page.getByRole('button',{name:'替换所选',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text||'').join(''))).toBe(replacement)
}
async function startReview(page){
 await page.clock.install();await page.evaluate(()=>window.challenge.configure({level:3}));await page.clock.fastForward(2600)
 await expect.poll(()=>page.evaluate(()=>window.jobs.length)).toBe(1)
}
async function finish(page,value=clean){await page.evaluate(value=>window.jobs[0].resolve(value),value);await page.clock.fastForward(10)}

it.each([false,true])('removes the inherited yellow AI mark only after the rewritten paragraph passes current review, retaining saved discussion and manual marks (dark=%s)',async dark=>{
 const{context,page,errors,ids}=await fixture(dark);try{
  const before=await page.evaluate(id=>window.historyFor(id),ids.old)
  await rewrite(page)
  expect(await mark(page,ids.old).textContent()).toBe(replacement)
  expect(await mark(page,ids.old).getAttribute('data-orphan')).toBeNull()
  expect(await mark(page,ids.old).evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  await page.screenshot({path:artifacts+'/yellow-before-'+(dark?'dark':'light')+'.png'})
  await startReview(page);await finish(page)
  await expect.poll(()=>page.locator('.en-challenge-paragraph-line[data-block-id=p]').getAttribute('data-state')).toBe('passed')
  await expect.poll(()=>mark(page,ids.old).getAttribute('data-orphan')).toBe('true')
  expect(await mark(page,ids.old).evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  expect(await mark(page,ids.manual).getAttribute('data-orphan')).toBeNull()
  expect(await mark(page,ids.unresolved).getAttribute('data-orphan')).toBeNull()
  expect(await mark(page,ids.unresolved).evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  expect(await page.evaluate(()=>window.noteDoc.getMap('threads').size)).toBe(3)
  const after=await page.evaluate(id=>window.historyFor(id),ids.old)
  expect(after.resolved).toBe(true);expect(after.comments).toEqual(before.comments);expect(after.metadata.draft).toBe('历史讨论草稿保留')
  await page.clock.fastForward(1200);await expect.poll(()=>page.evaluate(id=>window.savedHistoryFor(id).resolved,ids.old)).toBe(true)
  await page.screenshot({path:artifacts+'/yellow-after-'+(dark?'dark':'light')+'.png'})
  await page.evaluate(()=>window.remount());await page.locator('.bn-editor').waitFor()
  await expect.poll(()=>mark(page,ids.old).getAttribute('data-orphan')).toBe('true')
  expect(await page.evaluate(id=>window.historyFor(id).comments,ids.old)).toEqual(before.comments)
  expect(await page.evaluate(id=>window.historyFor(id).metadata.draft,ids.old)).toBe('历史讨论草稿保留');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it.each(['partial','uncovered','failed','edited','new-thread','changed-thread'])('keeps unresolved AI yellow when a clean result is %s instead of current complete proof',async kind=>{
 const{context,page,errors,ids}=await fixture();try{
  await rewrite(page);await startReview(page)
  let later
  if(kind==='edited')await page.evaluate(()=>window.editor.updateBlock('manual',{content:'用户刚写的新正文，旧检查不能作准。'}))
  if(kind==='new-thread')later=await page.evaluate(()=>window.seed('p','交付确认'))
  if(kind==='changed-thread')await page.evaluate(id=>{const thread=window.noteDoc.getMap('threads').get(id);thread.set('metadata',{...thread.get('metadata'),issue:{...thread.get('metadata').issue,quote:'交付确认',message:'等待期间的新问题'}})},ids.old)
  if(kind==='failed')await page.evaluate(()=>window.jobs[0].reject(Error('source unavailable')))
  else await finish(page,kind==='partial'?{...clean,completeBlockIds:[],checks:[{kind:'review',status:'partial',detail:'尚未完成本等级核验。'}]}:kind==='uncovered'?{...clean,coveredBlockIds:[]}:clean)
  await page.clock.fastForward(100)
  if(kind==='new-thread'){
   expect(await page.evaluate(id=>window.historyFor(id).resolved,later)).toBe(false)
   expect(await mark(page,later).getAttribute('data-orphan')).toBeNull()
   expect(await page.locator('.en-challenge-paragraph-line[data-block-id=p]').getAttribute('data-state')).toBe('issues')
  }else{
   expect(await page.evaluate(id=>window.historyFor(id).resolved,ids.old)).toBe(false)
   expect(await mark(page,ids.old).getAttribute('data-orphan')).toBeNull()
  }
  expect(await page.evaluate(id=>window.historyFor(id).resolved,ids.manual)).toBe(false);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('does not treat a manual author as system AI even if its imported thread has AI-kind metadata',async()=>{
 const{context,page,errors,ids}=await fixture();try{
  await page.evaluate(id=>{const thread=window.noteDoc.getMap('threads').get(id);thread.set('metadata',{kind:'ework-challenge-v1',issue:{blockId:'manual',quote:'人工评论',category:'question',message:'用户评论不能自动解决',evidence:[]},sourceText:'人工评论保留原文。'})},ids.manual)
  await startReview(page);await finish(page,{...clean,coveredBlockIds:['p','manual'],completeBlockIds:['p','manual']})
  expect(await page.evaluate(id=>window.historyFor(id).resolved,ids.manual)).toBe(false)
  expect(await mark(page,ids.manual).getAttribute('data-orphan')).toBeNull()
  expect(await page.evaluate(id=>window.historyFor(id).comments.map(c=>c.text),ids.manual)).toEqual(['人工原始评论']);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('restores the original unresolved finding on native undo and its clean state on redo without deleting the discussion',async()=>{
 const{context,page,errors,ids}=await fixture();try{
  const before=await page.evaluate(id=>window.historyFor(id),ids.old)
  await rewrite(page);await startReview(page);await finish(page)
  await expect.poll(()=>page.evaluate(id=>window.historyFor(id).resolved,ids.old)).toBe(true)
  await page.locator('.bn-editor').focus();await page.keyboard.press('Meta+z')
  await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text||'').join(''))).toBe(original)
  await expect.poll(()=>page.evaluate(id=>window.historyFor(id).resolved,ids.old)).toBe(false)
  expect(await mark(page,ids.old).getAttribute('data-orphan')).toBeNull()
  await page.keyboard.press('Meta+Shift+z')
  await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text||'').join(''))).toBe(replacement)
  await expect.poll(()=>page.evaluate(id=>window.historyFor(id).resolved,ids.old)).toBe(true)
  expect(await mark(page,ids.old).getAttribute('data-orphan')).toBe('true')
  expect(await page.evaluate(id=>window.historyFor(id).comments,ids.old)).toEqual(before.comments)
  expect(await page.evaluate(id=>window.historyFor(id).metadata.draft,ids.old)).toBe('历史讨论草稿保留');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('keeps an explicitly acknowledged discussion resolved when the preceding rewrite is undone',async()=>{
 const{context,page,errors,ids}=await fixture();try{
  await rewrite(page);await startReview(page);await finish(page)
  await page.evaluate(id=>window.challenge.resolve(id),ids.old)
  await page.locator('.bn-editor').focus();await page.keyboard.press('Meta+z')
  await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text||'').join(''))).toBe(original)
  expect(await page.evaluate(id=>window.historyFor(id).resolved,ids.old)).toBe(true)
  expect(await mark(page,ids.old).getAttribute('data-orphan')).toBe('true');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
