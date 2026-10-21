import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
let browser,script
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountNotes}from'./src/preload/notes/mount';import{YjsThreadStore}from'@blocknote/core/yjs';import{DefaultThreadStoreAuth}from'@blocknote/core/comments';import{CHALLENGE_KIND,CHALLENGE_USER}from'./src/preload/notes/challenge-controller';import{findChallengeQuote}from'./src/preload/notes/challenge-anchors';
 window.saved={title:'评论布局合成验收',blocks:Array.from({length:14},(_,i)=>({id:'body-'+i,type:'paragraph',content:'第'+i+'段判断需要更多依据。'})),yjs:'',revision:0};
 const bridge={request:async(method,input)=>{if(method==='load')return{saved:window.saved};if(method==='save'){window.saved={...input.content,revision:input.revision+1};return{status:'saved',saved:window.saved}}return{}},draft:async()=>{}};
 mountNotes(document,bridge,{register:(_mode,surface)=>{surface.style.left='240px';document.body.append(surface)},open:()=>{},close:()=>{},current:()=>'notes'});
 window.seed=async(count=1,long=false)=>{const store=new YjsThreadStore(CHALLENGE_USER,window.noteDoc.getMap('threads'),new DefaultThreadStoreAuth(CHALLENGE_USER,'editor'));for(let i=0;i<count;i++){const blockId='body-'+i,quote='第'+i+'段判断',issue={blockId,quote,category:'question',message:long?'请提供实际依据。'.repeat(150):'这段判断需要哪些实际依据？',evidence:[]};const thread=await store.createThread({metadata:{kind:CHALLENGE_KIND,issue,sourceText:window.editor.getBlock(blockId).content.map(part=>part.text||'').join('')},initialComment:{body:[{type:'paragraph',content:[{type:'text',text:issue.message,styles:{}}]}]}});const range=findChallengeQuote(window.editor,blockId,quote);window.editor.transact(tr=>tr.setMeta('addToHistory',false).addMark(range.from,range.to,tr.doc.type.schema.marks.comment.create({threadId:thread.id,orphan:false})));}};
 window.setEvidenceWidth=width=>{document.querySelector('.en-root').style.right=(width+10)+'px';document.querySelector('#evidence').style.width=width+'px'};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'inline-production-styles',setup(b){b.onResolve({filter:/\.css\?inline$/},async args=>{const found=await b.resolve(args.path.slice(0,-7),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}},{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.editor=editor;window.challenge=challenge;window.noteDoc=doc; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(width,noteRegion=false){
 const context=await browser.newContext({viewport:{width:width+(noteRegion?250:0),height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(5000)
 await page.route('http://127.0.0.1/challenge-layout',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><span data-ework-notes-session="layout-note"></span><div data-ework-note-view="layout-note"></div><aside id="evidence" style="position:fixed;right:10px;top:10px;height:880px;width:0"></aside>'}))
 await page.goto('http://127.0.0.1/challenge-layout');await page.addScriptTag({content:script});await page.locator('.bn-editor').waitFor();await page.evaluate(()=>window.editor.replaceBlocks(window.editor.document,Array.from({length:14},(_,i)=>({id:'body-'+i,type:'paragraph',content:'第'+i+'段判断需要更多依据。'}))));await page.locator('.bn-editor .bn-block-outer[data-id="body-0"]').waitFor();return {context,page,errors}
}
async function dimensions(page){return page.evaluate(()=>{const area=document.querySelector('.en-main').getBoundingClientRect(),body=document.querySelector('.en-document').getBoundingClientRect(),card=document.querySelector('.en-challenge-card')?.getBoundingClientRect(),scroller=document.querySelector('.en-document-scroll');return {center:body.x+body.width/2,areaCenter:area.x+area.width/2,areaLeft:area.left,areaWidth:area.width,areaRight:area.right,areaBottom:area.bottom,bodyRight:body.right,bodyWidth:body.width,wide:document.querySelector('.en-main').dataset.challengeWide==='true',cardRight:card?.right,cardLeft:card?.left,cardBottom:card?.bottom,overflow:scroller.scrollWidth>scroller.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1}})}
async function assertHorizontalPlacement(page){const value=await dimensions(page);if(value.wide){expect(value.areaRight-value.cardRight).toBeGreaterThanOrEqual(7);expect(value.areaRight-value.cardRight).toBeLessThanOrEqual(17)}else{const mark=await page.locator('.bn-editor [data-bn-thread-id]').first().boundingBox();expect(Math.abs(value.cardLeft-mark.x)).toBeLessThanOrEqual(2)}}
async function openSelected(page){if(!await page.locator('.en-challenge-card').count())await page.locator('.bn-editor [data-bn-thread-id]').first().click();await page.locator('.en-challenge-card').first().waitFor()}
for(const width of [3440,1600,1180,900])it(`keeps the note centered with right-side wide comments and nearby narrow bubbles at ${width}px`,async()=>{
 const {context,page,errors}=await fixture(width,true);try{
  const before=await dimensions(page);await page.evaluate(()=>window.seed());await expect.poll(()=>page.evaluate(()=>window.challenge.threads.length)).toBe(1);await openSelected(page)
  await expect.poll(async()=>{const value=await dimensions(page);return Math.abs(value.center-before.center)}).toBeLessThanOrEqual(1)
  await expect.poll(()=>assertHorizontalPlacement(page)).toBeUndefined()
  const value=await dimensions(page);expect(value.areaWidth).toBe(width);expect(value.overflow).toBe(false);if(value.wide)expect(value.cardLeft-value.bodyRight).toBeGreaterThanOrEqual(16)
  await page.screenshot({path:'/tmp/notes-challenge-centered-'+width+'.png'});expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('tracks the real note region when the global evidence sidebar changes without losing reply text',async()=>{
 const {context,page,errors}=await fixture(1600);try{
  await page.evaluate(()=>window.seed());await openSelected(page);await page.getByRole('textbox',{name:'回复AI挑战'}).fill('这份未发送回复不能丢。')
  for(const evidenceWidth of [420,0]){
   await page.evaluate(width=>window.setEvidenceWidth(width),evidenceWidth);await openSelected(page)
   await expect.poll(async()=>{const value=await dimensions(page);return Math.abs(value.center-value.areaCenter)}).toBeLessThanOrEqual(1)
   await expect.poll(()=>assertHorizontalPlacement(page)).toBeUndefined()
   expect(await page.getByRole('textbox',{name:'回复AI挑战'}).evaluate(el=>document.activeElement===el)).toBe(true)
   expect(await page.getByRole('textbox',{name:'回复AI挑战'}).inputValue()).toBe('这份未发送回复不能丢。');expect((await dimensions(page)).overflow).toBe(false)
  }
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('keeps stacked right-edge comments scrollable and follows original paragraphs when the document scrolls',async()=>{
 const {context,page,errors}=await fixture(3440);try{
  await page.evaluate(()=>window.seed(10));await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(10);await page.screenshot({path:'/tmp/notes-challenge-layout-client-3440.png'})
  const gutter=page.locator('.en-challenge-comments');await gutter.evaluate(el=>el.scrollTop=el.scrollHeight);await expect.poll(()=>gutter.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
  const last=await page.locator('.en-challenge-card').last().boundingBox(),outer=await gutter.boundingBox();expect(last.y+last.height).toBeLessThanOrEqual(outer.y+outer.height+1)
  await page.locator('.en-document-scroll').evaluate(el=>el.scrollTop=180);await expect.poll(()=>gutter.evaluate(el=>el.scrollTop)).toBe(0)
  await page.locator('.en-challenge-close').first().click();await expect.poll(()=>page.locator('.en-challenge-card').count()).toBeLessThan(10)
  const value=await dimensions(page);expect(Math.abs(value.center-value.areaCenter)).toBeLessThanOrEqual(1);expect(value.areaRight-value.cardRight).toBeLessThanOrEqual(17);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('keeps a long nearby narrow reply reachable and closes it without reopening or losing its draft',async()=>{
 const {context,page,errors}=await fixture(900);try{
  await page.evaluate(()=>window.seed(1,true));await openSelected(page)
  await expect.poll(async()=>{const value=await dimensions(page);return value.areaBottom-value.cardBottom}).toBeGreaterThanOrEqual(8)
  expect(await page.locator('.en-challenge-messages').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
  const input=page.getByRole('textbox',{name:'回复AI挑战'});await input.fill('第一行未发送内容。\n第二行继续保留。')
  const reply=await page.locator('.en-challenge-reply').boundingBox(),value=await dimensions(page);expect(reply.y+reply.height).toBeLessThanOrEqual(value.areaBottom-8);await assertHorizontalPlacement(page)
  await page.screenshot({path:'/tmp/notes-challenge-layout-narrow-900.png'})
  await page.getByRole('button',{name:'收起挑战评论'}).click();await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(0)
  await openSelected(page);expect(await input.inputValue()).toBe('第一行未发送内容。\n第二行继续保留。');await input.focus();await page.keyboard.press('Escape');await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('opens a narrow comment beside the marked text instead of against the distant right edge',async()=>{
 const {context,page,errors}=await fixture(1157,true);try{
  await page.evaluate(()=>window.seed());await openSelected(page)
  const quote=page.locator('.bn-editor [data-bn-thread-id]').first()
  await expect.poll(async()=>{const mark=await quote.boundingBox(),card=await page.locator('.en-challenge-card').boundingBox();return Math.abs(card.x-mark.x)}).toBeLessThanOrEqual(2)
  const mark=await quote.boundingBox(),card=await page.locator('.en-challenge-card').boundingBox()
  expect(card.y-mark.y-mark.height).toBeGreaterThanOrEqual(8);expect(card.y-mark.y-mark.height).toBeLessThanOrEqual(12)
  const value=await dimensions(page);expect(value.wide).toBe(false);expect(Math.abs(value.center-value.areaCenter)).toBeLessThanOrEqual(1);expect(value.overflow).toBe(false)
  await page.screenshot({path:'/tmp/notes-challenge-nearby-1157.png'});expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('places a narrow bubble above a low paragraph and keeps following it when the note scrolls',async()=>{
 const {context,page,errors}=await fixture(900);try{
  await page.evaluate(()=>window.seed(13));const quote=page.locator('.bn-editor [data-bn-thread-id]').nth(12)
  await quote.scrollIntoViewIfNeeded();await page.locator('.en-document-scroll').evaluate(el=>{const mark=document.querySelectorAll('.bn-editor [data-bn-thread-id]')[12].getBoundingClientRect(),area=document.querySelector('.en-main').getBoundingClientRect();el.scrollTop+=mark.top-(area.bottom-65)})
  await quote.click();await page.locator('.en-challenge-card').waitFor()
  await expect.poll(async()=>{const mark=await quote.boundingBox(),card=await page.locator('.en-challenge-card').boundingBox();return mark.y-card.y-card.height}).toBeGreaterThanOrEqual(8)
  const mark=await quote.boundingBox(),card=await page.locator('.en-challenge-card').boundingBox();expect(mark.y-card.y-card.height).toBeLessThanOrEqual(12);expect(Math.abs(mark.x-card.x)).toBeLessThanOrEqual(2)
  await page.locator('.en-document-scroll').evaluate(el=>el.scrollTop+=40)
  await expect.poll(async()=>{const mark=await quote.boundingBox(),card=await page.locator('.en-challenge-card').boundingBox();return mark.y-card.y-card.height}).toBeGreaterThanOrEqual(8)
  await page.screenshot({path:'/tmp/notes-challenge-nearby-above-900.png'});expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('keeps a narrow bubble inside the note when its marked text is near the right edge',async()=>{
 const {context,page,errors}=await fixture(900);try{
  await page.evaluate(()=>window.editor.updateBlock('body-0',{props:{textAlignment:'right'}}));await page.evaluate(()=>window.seed());await openSelected(page)
  const value=await dimensions(page);expect(value.cardLeft).toBeGreaterThanOrEqual(value.areaLeft+16);expect(value.cardRight).toBeLessThanOrEqual(value.areaRight-16)
  expect(value.overflow).toBe(false);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
for(const direction of ['above','below'])it(`keeps a focused reply visible when its marked paragraph scrolls ${direction} the viewport`,async()=>{
 const {context,page,errors}=await fixture(900);try{
  await page.evaluate(()=>window.seed(13));const quote=page.locator('.bn-editor [data-bn-thread-id]').nth(direction==='above'?0:12)
  await quote.click();const input=page.getByRole('textbox',{name:'回复AI挑战'});await input.fill('滚动时继续保留正在输入的回复。')
  await page.locator('.en-document-scroll').evaluate((el,direction)=>el.scrollTop=direction==='above'?500:0,direction)
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  await expect.poll(()=>page.locator('.en-challenge-card').evaluate(el=>{const card=el.getBoundingClientRect(),area=document.querySelector('.en-main').getBoundingClientRect();return card.top>=area.top+16&&card.bottom<=area.bottom-16})).toBe(true)
  expect(await input.evaluate(el=>document.activeElement===el)).toBe(true);expect(await input.inputValue()).toBe('滚动时继续保留正在输入的回复。');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
