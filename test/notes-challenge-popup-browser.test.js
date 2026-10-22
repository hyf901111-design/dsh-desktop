import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountNotes}from'./src/preload/notes/mount';import{YjsThreadStore}from'@blocknote/core/yjs';import{DefaultThreadStoreAuth}from'@blocknote/core/comments';import{CHALLENGE_KIND,CHALLENGE_USER}from'./src/preload/notes/challenge-controller';import{findChallengeQuote}from'./src/preload/notes/challenge-anchors';
 const saved={title:'点击位置定位验收',blocks:[{id:'p',type:'paragraph',content:'待校对的文字。'}],yjs:'',revision:0};
 const bridge={request:async(method,input)=>method==='load'?{saved}:method==='save'?{status:'saved',saved:{...input.content,revision:input.revision+1}}:{},draft:async()=>{}};
 mountNotes(document,bridge,{register:(_mode,surface)=>{surface.style.left='240px';surface.style.top='54px';document.body.append(surface)},open:()=>{},close:()=>{},current:()=>'notes'});
 window.seed=async(quote,prefix='')=>{window.editor.replaceBlocks(window.editor.document,[{id:'p',type:'paragraph',content:prefix+quote+'。'}]);const issue={blockId:'p',quote,category:'question',message:'请核对这一段判断。',evidence:[]},store=new YjsThreadStore(CHALLENGE_USER,window.noteDoc.getMap('threads'),new DefaultThreadStoreAuth(CHALLENGE_USER,'editor'));const thread=await store.createThread({metadata:{kind:CHALLENGE_KIND,issue,sourceText:prefix+quote+'。'},initialComment:{body:[{type:'paragraph',content:[{type:'text',text:issue.message,styles:{}}]}]}}),range=findChallengeQuote(window.editor,'p',quote);window.editor.transact(tr=>tr.setMeta('addToHistory',false).addMark(range.from,range.to,tr.doc.type.schema.marks.comment.create({threadId:thread.id,orphan:false})));window.threadId=thread.id;return thread.id};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'inline-production-styles',setup(b){b.onResolve({filter:/\.css\?inline$/},async args=>{const found=await b.resolve(args.path.slice(0,-7),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}},{name:'expose-popup-controller',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.editor=editor;window.challenge=challenge;window.noteDoc=doc; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(width=1150){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(5000)
 await page.route('http://127.0.0.1/challenge-popup',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><header class="wSkVaW_header" data-ework-notes-session="popup-note" style="position:fixed;top:10px;left:240px;right:10px;z-index:80;height:44px;display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:0 20px"><div data-en-challenge-tools="popup-note"></div><button class="en-header-export">导出</button></header><div data-ework-note-view="popup-note"></div>'}))
 await page.goto('http://127.0.0.1/challenge-popup');if(css)await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.bn-editor').waitFor()
 return{context,page,errors}
}
async function lines(page){return page.locator('.bn-editor [data-bn-thread-id]').first().evaluate(el=>[...el.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,width:r.width})))}
async function clickText(page,line,x){
 const point={x:x??line.left+Math.min(45,line.width/2),y:(line.top+line.bottom)/2}
 const caret=await page.evaluate(point=>{const view=window.editor._tiptapEditor.view,result=view.posAtCoords({left:point.x,top:point.y});return result?view.coordsAtPos(result.pos):null},point)
 await page.mouse.click(point.x,point.y);await page.locator('.en-challenge-card').waitFor()
 return caret
}
async function expectedX(page,left){return page.locator('.en-main').evaluate((el,left)=>{const area=el.getBoundingClientRect();return Math.max(area.left+16,Math.min(left,area.right-336))},left)}

it('anchors a wrapped popup at the clicked character and line, and follows that text on scroll',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.seed('这段被标注的判断需要结合完整语境核实。'.repeat(110),'引用前的背景内容。'.repeat(3)))
  const rects=await lines(page),clicked=rects[2];expect(rects.length).toBeGreaterThan(12)
  const caret=await clickText(page,clicked,clicked.left+185),card=page.locator('.en-challenge-card')
  await expect.poll(async()=>Math.abs((await card.boundingBox()).y-clicked.bottom-10)).toBeLessThanOrEqual(2)
  await expect.poll(async()=>Math.abs((await card.boundingBox()).x-await expectedX(page,caret.left))).toBeLessThanOrEqual(2)
  await page.getByRole('textbox',{name:'回复AI挑战'}).fill('定位变化保留未发送回复。')
  const before=await card.boundingBox();await page.locator('.en-document-scroll').evaluate(el=>el.scrollTop+=30)
  await expect.poll(async()=>Math.abs((await card.boundingBox()).y-before.y+30)).toBeLessThanOrEqual(2)
  expect(await page.getByRole('textbox',{name:'回复AI挑战'}).inputValue()).toBe('定位变化保留未发送回复。')
  await page.screenshot({path:'/tmp/notes-challenge-popup-click-line-20261022.png'});expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('moves an already selected popup when the same long highlight is clicked on a different line',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.seed('同一条长引用需要在实际点击的文字行旁打开。'.repeat(100)))
  const rects=await lines(page),card=page.locator('.en-challenge-card');await clickText(page,rects[3],rects[3].left+260)
  const caret=await clickText(page,rects[0],rects[0].left+24)
  await expect.poll(async()=>Math.abs((await card.boundingBox()).y-rects[0].bottom-10)).toBeLessThanOrEqual(2)
  await expect.poll(async()=>Math.abs((await card.boundingBox()).x-await expectedX(page,caret.left))).toBeLessThanOrEqual(2)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('uses visible highlighted text for keyboard activation, external selection and locating after a pointer selection',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.seed('长引用的外部定位应回到当前可见的文字。'.repeat(110)))
  for(const route of ['keyboard-click','select','locate']){
   await page.locator('.en-document-scroll').evaluate(el=>el.scrollTop=0);const rects=await lines(page);await clickText(page,rects[3],rects[3].left+260)
   await page.evaluate(route=>{if(route==='keyboard-click')document.querySelector('.bn-editor [data-bn-thread-id]').click();else if(route==='select')window.challenge.select(window.threadId);else document.dispatchEvent(new CustomEvent('sherlock:notes-challenge-locate',{detail:{sessionId:'popup-note',blockId:'p'}}))},route)
   await expect.poll(()=>page.evaluate(()=>window.challenge.popupAnchor??null)).toBeNull()
   await page.locator('.en-document-scroll').evaluate(el=>el.scrollTop=240)
   await expect.poll(()=>page.locator('.en-challenge-card').evaluate(el=>{const area=document.querySelector('.en-main').getBoundingClientRect(),card=el.getBoundingClientRect(),line=[...document.querySelector('.bn-editor [data-bn-thread-id]').getClientRects()].find(r=>r.bottom>area.top&&r.top<area.bottom);return !!line&&card.top>=area.top+16&&card.bottom<=area.bottom-16&&Math.abs(card.top-line.bottom-10)<20})).toBe(true)
  }
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('keeps the clicked low-line popup above the text and clamped inside the note viewport',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.seed('临近底部的多行高亮仍应靠近点击文字。'.repeat(110)))
  const area=await page.locator('.en-main').boundingBox(),rects=await lines(page),clicked=rects.filter(r=>r.bottom<area.y+area.height-30).at(-1)
  const caret=await clickText(page,clicked,clicked.right-20),card=page.locator('.en-challenge-card')
  await expect.poll(async()=>{const box=await card.boundingBox();return Math.abs(clicked.top-box.y-box.height-10)}).toBeLessThanOrEqual(2)
  expect(await card.evaluate(el=>{const c=el.getBoundingClientRect(),a=document.querySelector('.en-main').getBoundingClientRect();return c.left>=a.left+16&&c.right<=a.right-16&&c.top>=a.top+16&&c.bottom<=a.bottom-16})).toBe(true)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('preserves export-aligned wide comments while pointer selections change',async()=>{
 const{context,page,errors}=await fixture(2650);try{
  await page.evaluate(()=>window.seed('展开评论栏仍保持导出右侧对齐。'.repeat(70)))
  await page.locator('.en-challenge-comments[data-wide]').waitFor();await page.locator('.en-challenge-card').waitFor()
  const rects=await lines(page);await clickText(page,rects[2],rects[2].left+180)
  await expect.poll(()=>page.locator('.en-challenge-card').evaluate(el=>Math.abs(el.getBoundingClientRect().right-document.querySelector('.en-header-export').getBoundingClientRect().right))).toBeLessThanOrEqual(1)
  expect(await page.locator('.en-challenge-close').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
