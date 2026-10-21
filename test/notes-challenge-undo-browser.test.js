import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

let browser,script
const original='这项结论的成度较高。',replacement='这项结论的可信程度较高。'
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountNotes}from'./src/preload/notes/mount';import{YjsThreadStore}from'@blocknote/core/yjs';import{DefaultThreadStoreAuth}from'@blocknote/core/comments';import{yUndoPluginKey}from'y-prosemirror';import{findChallengeQuote}from'./src/preload/notes/challenge-anchors';import{CHALLENGE_KIND,CHALLENGE_USER}from'./src/preload/notes/challenge-controller';
 window.jobs={};const bridge={request:async(method,input)=>{if(method==='load')return{saved:{title:'独立虚构笔记',blocks:[],yjs:'',revision:0}};if(method==='challenge')return new Promise(resolve=>window.jobs[input.requestId]={input,resolve});if(method==='save')return{status:'saved',saved:{...input.content,revision:input.revision+1}};return{}},draft:async()=>{}};
 mountNotes(document,bridge,{register:(_mode,surface)=>{surface.style.left='0';document.body.append(surface)},open:()=>{},close:()=>{},current:()=>'notes'});
 window.historyState=()=>{const state=window.editor._tiptapEditor.state,manager=yUndoPluginKey.getState(state).undoManager;return{undo:manager.undoStack.length,redo:manager.redoStack.length,keys:state.plugins.map(p=>p.key).filter(key=>/y.*undo/i.test(key))}};
 window.stopCapturing=()=>yUndoPluginKey.getState(window.editor._tiptapEditor.state).undoManager.stopCapturing();
 window.seedChallenge=async(quote=${JSON.stringify(original)})=>{const block=window.editor.document.find(b=>b.content?.some(c=>c.text?.includes('成度'))),issue={blockId:block.id,quote,category:'typo',message:'请核对这段用字。',evidence:[]},store=new YjsThreadStore(CHALLENGE_USER,window.noteDoc.getMap('threads'),new DefaultThreadStoreAuth(CHALLENGE_USER,'editor'));const thread=await store.createThread({metadata:{kind:CHALLENGE_KIND,issue,sourceText:block.content.map(c=>c.text||'').join('')},initialComment:{body:[{type:'paragraph',content:[{type:'text',text:issue.message,styles:{}}]}]}});const range=findChallengeQuote(window.editor,block.id,issue.quote);window.editor.transact(tr=>tr.setMeta('addToHistory',false).addMark(range.from,range.to,tr.doc.type.schema.marks.comment.create({threadId:thread.id,orphan:false})));return{blockId:block.id,threadId:thread.id}};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'inline-production-styles',setup(b){b.onResolve({filter:/\.css\?inline$/},async args=>{const found=await b.resolve(args.path.slice(0,-7),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}},{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.editor=editor;window.challenge=challenge;window.noteDoc=doc; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())

async function fixture(quote=original){
 const context=await browser.newContext({viewport:{width:2000,height:900}}),page=await context.newPage(),errors=[]
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(5000)
 await page.route('http://127.0.0.1/challenge-undo',route=>route.fulfill({contentType:'text/html',body:'<span data-ework-notes-session="undo-note"></span><div data-ework-note-view="undo-note"></div>'}))
 await page.goto('http://127.0.0.1/challenge-undo');await page.addScriptTag({content:script});await page.locator('.bn-editor').waitFor()
 await page.locator('.bn-editor').click()
 await page.evaluate(()=>{const transfer=new DataTransfer();transfer.setData('text/html','<p><strong>第一段格式保留。</strong></p><p>这项结论的成度较高。</p><p><em>第三段继续保留。</em></p><p>第四段没有问题。</p>');transfer.setData('text/plain','第一段格式保留。\n\n这项结论的成度较高。\n\n第三段继续保留。\n\n第四段没有问题。');window.editor._tiptapEditor.view.dom.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}))})
 await expect.poll(()=>page.evaluate(()=>window.editor.document.filter(block=>block.content?.length).length)).toBe(4)
 const pasted=await page.evaluate(()=>window.editor.document),beforeComment=await page.evaluate(()=>window.historyState()),identity=await page.evaluate(quote=>window.seedChallenge(quote),quote)
 await page.locator('.en-challenge-card').waitFor()
 return{context,page,errors,pasted,beforeComment,...identity}
}
async function optimize(page,value=replacement){
 const count=await page.evaluate(()=>Object.keys(window.jobs).length)
 await page.getByRole('button',{name:'AI优化',exact:true}).click();await expect.poll(()=>page.evaluate(()=>Object.keys(window.jobs).length)).toBe(count+1)
 await page.evaluate(replacement=>Object.values(window.jobs).at(-1).resolve({version:1,issues:[],coveredBlockIds:[],checks:[],reply:{text:'只优化这段用字。',replacement}}),value)
 await expect.poll(()=>page.locator('.en-challenge-quote').textContent()).toBe(value)
 await expect.poll(()=>page.getByRole('button',{name:'AI优化',exact:true}).isEnabled()).toBe(true)
}
// Keep the native editor focused without clicking an empty document after undo;
// that click can insert a fresh paragraph and legitimately clear the redo stack.
async function nativeHistory(page,redo=false){await page.locator('.bn-editor').focus();await page.keyboard.press(redo?'Meta+Shift+z':'Meta+z')}

it('isolates explicit optimization in native Yjs undo/redo without undoing the preceding four-paragraph paste or its formatting',async()=>{
 const f=await fixture();try{
  expect(await f.page.evaluate(()=>window.historyState().undo)).toBe(f.beforeComment.undo)
  await optimize(f.page)
  expect(await f.page.evaluate(()=>window.historyState().undo)).toBe(f.beforeComment.undo+1)
  await nativeHistory(f.page)
  await expect.poll(()=>f.page.evaluate(()=>window.editor.document)).toEqual(f.pasted)
  await nativeHistory(f.page,true)
  expect(await f.page.evaluate(id=>window.editor.getBlock(id).content.map(part=>part.text).join(''),f.blockId)).toBe(replacement)
  expect(await f.page.evaluate(id=>window.editor.document.filter(block=>block.id!==id),f.blockId)).toEqual(f.pasted.filter(block=>block.id!==f.blockId))
  await nativeHistory(f.page);await nativeHistory(f.page)
  expect(await f.page.evaluate(()=>window.editor.document.filter(block=>block.content?.length))).toEqual([])
  await nativeHistory(f.page,true)
  await expect.poll(()=>f.page.evaluate(()=>window.editor.document)).toEqual(f.pasted)
  await nativeHistory(f.page,true)
  expect(await f.page.evaluate(id=>window.editor.getBlock(id).content.map(part=>part.text).join(''),f.blockId)).toBe(replacement)
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},15000)

it('keeps the same discussion and unsent draft readable at the restored quote after native undo and redo',async()=>{
 const f=await fixture();try{
  await f.page.getByRole('textbox',{name:'回复AI挑战'}).fill('这份未发送讨论草稿不能丢。')
  await optimize(f.page);await nativeHistory(f.page)
  await expect.poll(()=>f.page.evaluate(id=>window.editor.getBlock(id).content.map(part=>part.text).join(''),f.blockId)).toBe(original)
  const undone=await f.page.evaluate(id=>({quote:document.querySelector('.en-challenge-quote')?.textContent??null,draft:window.noteDoc.getMap('threads').get(id).get('metadata').draft,ids:[...window.noteDoc.getMap('threads').keys()],mark:[...document.querySelectorAll('.bn-editor [data-bn-thread-id]')].filter(el=>el.dataset.bnThreadId===id).map(el=>el.textContent).join('')}),f.threadId)
  await nativeHistory(f.page,true)
  await expect.poll(()=>f.page.locator('.en-challenge-quote').textContent()).toBe(replacement)
  expect(await f.page.getByRole('textbox',{name:'回复AI挑战'}).inputValue()).toBe('这份未发送讨论草稿不能丢。')
  expect(await f.page.locator('.en-challenge-text').allTextContents()).toEqual(['请核对这段用字。','只优化这段用字。'])
  expect(undone).toEqual({quote:original,draft:'这份未发送讨论草稿不能丢。',ids:[f.threadId],mark:original})
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},15000)

it('maps consecutive native undo and redo to the matching original-block snapshot with bounded optimization history',async()=>{
 const f=await fixture();try{
  const variants=[original,...Array.from({length:9},(_,i)=>`第${i+1}次优化：${replacement}`)]
  for(const value of variants.slice(1))await optimize(f.page,value)
  const history=await f.page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('metadata').anchorHistory,f.threadId)
  expect(history).toHaveLength(8)
  expect(history.reduce((size,entry)=>size+entry.quote.length+entry.sourceText.length,0)).toBeLessThanOrEqual(64000)
  for(const value of variants.slice(3,-1).reverse()){
   await nativeHistory(f.page)
   await expect.poll(()=>f.page.locator('.en-challenge-quote').textContent()).toBe(value)
   expect(await f.page.locator('.en-challenge-card').getAttribute('data-thread-id')).toBe(f.threadId)
  }
  await nativeHistory(f.page,true)
  await expect.poll(()=>f.page.locator('.en-challenge-quote').textContent()).toBe(variants[4])
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)

it('does not remap a discussion for ordinary rewrites, partial source matches or an identical quote in another block',async()=>{
 const f=await fixture();try{
  await optimize(f.page)
  await f.page.evaluate(({id,original})=>{window.editor.updateBlock(id,{content:'新的上下文。'+original});window.stopCapturing();window.editor.updateBlock(window.editor.document.find(block=>block.id!==id).id,{content:original})},{id:f.blockId,original})
  await nativeHistory(f.page)
  await expect.poll(()=>f.page.locator('.en-challenge-card').count()).toBe(0)
  expect(await f.page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('metadata').issue.quote,f.threadId)).toBe(replacement)
  await f.page.evaluate(({id,original})=>window.editor.updateBlock(id,{content:original}),{id:f.blockId,original})
  await expect.poll(()=>f.page.locator('.en-challenge-card').count()).toBe(0)
  expect(await f.page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('metadata').issue.quote,f.threadId)).toBe(replacement)
  await f.page.evaluate(id=>{window.stopCapturing();window.editor.updateBlock(window.editor.document.find(block=>block.id!==id).id,{content:'另一处普通改写。'})},f.blockId)
  await nativeHistory(f.page)
  await expect.poll(()=>f.page.locator('.en-challenge-card').count()).toBe(0)
  expect(await f.page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('metadata').issue.quote,f.threadId)).toBe(replacement)
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},15000)

it('resolves every native mark fragment of the same thread after an undo without changing the note',async()=>{
 const f=await fixture();try{
  await optimize(f.page);await nativeHistory(f.page)
  await expect.poll(()=>f.page.locator('.en-challenge-quote').textContent()).toBe(original)
  await f.page.evaluate(id=>{const block=window.editor.document.at(-1),text=block.content.map(part=>part.text).join('');let range;window.editor._tiptapEditor.state.doc.descendants((node,pos)=>{if(node.isText&&node.text===text)range={from:pos,to:pos+text.length}});window.editor.transact(tr=>tr.setMeta('addToHistory',false).addMark(range.from,range.to,tr.doc.type.schema.marks.comment.create({threadId:id,orphan:false})))},f.threadId)
  const before=await f.page.evaluate(()=>window.editor.document)
  await f.page.locator('.bn-editor [data-bn-thread-id]').first().click()
  await f.page.getByRole('button',{name:'已解决',exact:true}).click()
  await expect.poll(()=>f.page.locator('.en-challenge-card').count()).toBe(0)
  const marks=await f.page.evaluate(id=>[...document.querySelectorAll('.bn-editor [data-bn-thread-id]')].filter(el=>el.dataset.bnThreadId===id).map(el=>({orphan:el.dataset.orphan,background:getComputedStyle(el).backgroundColor})),f.threadId)
  expect(marks).toHaveLength(2)
  expect(marks.every(mark=>mark.orphan==='true'&&mark.background==='rgba(0, 0, 0, 0)')).toBe(true)
  expect(await f.page.locator('.bn-thread-mark-selected').count()).toBe(0)
  expect(await f.page.evaluate(()=>window.editor.document)).toEqual(before)
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},15000)

it('opens the surviving active thread through an overlapping resolved native mark',async()=>{
 const quote='成度较高。',f=await fixture(quote);try{
  const whole=await f.page.evaluate(()=>window.seedChallenge())
  await expect.poll(()=>f.page.locator('.en-challenge-card').count()).toBe(2)
  await f.page.locator(`.en-challenge-card[data-thread-id="${whole.threadId}"]`).getByRole('button',{name:'已解决',exact:true}).click()
  await f.page.setViewportSize({width:980,height:900})
  await expect.poll(()=>f.page.locator('.en-challenge-card').count()).toBe(0)
  await f.page.locator(`.bn-editor [data-bn-thread-id="${f.threadId}"]`).click()
  await expect.poll(()=>f.page.locator('.en-challenge-quote').textContent()).toBe(quote)
  expect(await f.page.locator('.en-challenge-card').getAttribute('data-thread-id')).toBe(f.threadId)
  expect(await f.page.evaluate(id=>window.noteDoc.getMap('threads').get(id).get('resolved'),whole.threadId)).toBe(true)
  expect(await f.page.evaluate(()=>window.noteDoc.getMap('threads').size)).toBe(2)
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},15000)
