import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import*as ReactDOM from 'react-dom';import{createRoot}from'react-dom/client';import{EWorkNoteExportMenu}from'./scripts/lib/notes-export-menu.mjs';import{mountNotes}from'./src/preload/notes/mount';import{YjsThreadStore}from'@blocknote/core/yjs';import{DefaultThreadStoreAuth}from'@blocknote/core/comments';import{CHALLENGE_KIND,CHALLENGE_USER}from'./src/preload/notes/challenge-controller';import{findChallengeQuote}from'./src/preload/notes/challenge-anchors';
 window.react=React;window.react_dom=ReactDOM;window.noteUiText=text=>text;window.useNoteUiLocale=()=>{};window.headerRoot=createRoot(document.querySelector('[data-srb-utilities]'));window.headerRoot.render(React.createElement(EWorkNoteExportMenu,{sessionId:'layout-note'}));
 window.jobs={};window.stops=[];window.initialNote=window.saved=JSON.parse(localStorage.getItem('layout-note')||'null')||{title:'评论布局合成验收',blocks:Array.from({length:14},(_,i)=>({id:'body-'+i,type:'paragraph',content:'第'+i+'段判断需要更多依据。'})),yjs:'',revision:0};
 const bridge={request:async(method,input)=>{if(method==='challenge')return new Promise(resolve=>window.jobs[input.requestId]={input,resolve});if(method==='challenge-stop'){window.stops.push(input);return{}}if(method==='load')return{saved:JSON.parse(localStorage.getItem(input.sessionId)||'null')||window.initialNote};if(method==='save'){window.saved={...input.content,revision:input.revision+1};localStorage.setItem(input.sessionId,JSON.stringify(window.saved));return{status:'saved',saved:window.saved}}return{}},draft:async()=>{}};
 mountNotes(document,bridge,{register:(_mode,surface)=>{surface.style.left='240px';surface.style.top='54px';document.body.append(surface)},open:()=>{},close:()=>{},current:()=>'notes'});
 window.switchNote=sessionId=>{document.querySelector('[data-ework-notes-session]').dataset.eworkNotesSession=sessionId;document.querySelector('[data-ework-note-view]').dataset.eworkNoteView=sessionId;window.headerRoot.render(React.createElement(EWorkNoteExportMenu,{sessionId}));document.dispatchEvent(new CustomEvent('sherlock:notes-open',{detail:{sessionId}}))};
 window.seed=async(count=1,long=false)=>{const store=new YjsThreadStore(CHALLENGE_USER,window.noteDoc.getMap('threads'),new DefaultThreadStoreAuth(CHALLENGE_USER,'editor'));for(let i=0;i<count;i++){const blockId='body-'+i,quote='第'+i+'段判断',issue={blockId,quote,category:'question',message:long?'请提供实际依据。'.repeat(150):'这段判断需要哪些实际依据？',evidence:[]};const thread=await store.createThread({metadata:{kind:CHALLENGE_KIND,issue,sourceText:window.editor.getBlock(blockId).content.map(part=>part.text||'').join('')},initialComment:{body:[{type:'paragraph',content:[{type:'text',text:issue.message,styles:{}}]}]}});const range=findChallengeQuote(window.editor,blockId,quote);window.editor.transact(tr=>tr.setMeta('addToHistory',false).addMark(range.from,range.to,tr.doc.type.schema.marks.comment.create({threadId:thread.id,orphan:false})));}};
 window.setEvidenceWidth=width=>{document.querySelector('.en-root').style.right=(width+10)+'px';document.querySelector('.wSkVaW_header').style.right=(width+10)+'px';document.querySelector('#evidence').style.width=width+'px'};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'inline-production-styles',setup(b){b.onResolve({filter:/\.css\?inline$/},async args=>{const found=await b.resolve(args.path.slice(0,-7),{resolveDir:args.resolveDir,kind:args.kind});return{path:found.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}},{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.editor=editor;window.challenge=challenge;window.noteDoc=doc; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(width,noteRegion=false){
 const context=await browser.newContext({viewport:{width:width+(noteRegion?250:0),height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(5000)
 await page.route('http://127.0.0.1/challenge-layout',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><header class="wSkVaW_header" data-srb-session-header data-ework-notes-session="layout-note" style="position:fixed;top:10px;left:240px;right:10px;z-index:80;display:flex;align-items:center;gap:12px;height:44px;padding:0 20px"><div class="wSkVaW_crumbs" style="flex:0 1 200px;min-width:0;overflow:hidden"><span class="wSkVaW_crumb" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">很长的笔记会话标题需要收窄但保留对话研究笔记轨迹页签</span></div><nav data-srb-tabs style="display:flex;flex:none;gap:4px"><button>对话</button><button>研究</button><button>笔记</button><button>轨迹</button></nav><div data-srb-utilities style="display:flex;align-items:center;margin-left:auto;flex:none"></div></header><div data-ework-note-view="layout-note"></div><aside id="evidence" style="position:fixed;right:10px;top:10px;height:880px;width:0"></aside>'}))
 await page.goto('http://127.0.0.1/challenge-layout');if(css)await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.bn-editor').waitFor();await page.evaluate(()=>window.editor.replaceBlocks(window.editor.document,Array.from({length:14},(_,i)=>({id:'body-'+i,type:'paragraph',content:'第'+i+'段判断需要更多依据。'}))));await page.locator('.bn-editor .bn-block-outer[data-id="body-0"]').waitFor();return {context,page,errors}
}
async function dimensions(page){return page.evaluate(()=>{const area=document.querySelector('.en-main').getBoundingClientRect(),body=document.querySelector('.en-document').getBoundingClientRect(),card=document.querySelector('.en-challenge-card')?.getBoundingClientRect(),scroller=document.querySelector('.en-document-scroll');return {center:body.x+body.width/2,areaCenter:area.x+area.width/2,areaLeft:area.left,areaWidth:area.width,areaRight:area.right,areaBottom:area.bottom,bodyLeft:body.left,bodyRight:body.right,bodyWidth:body.width,triggerRight:document.querySelector('.en-challenge-trigger')?.getBoundingClientRect().right,exportRight:document.querySelector('.en-header-export')?.getBoundingClientRect().right,wide:document.querySelector('.en-main').dataset.challengeWide==='true',cardRight:card?.right,cardLeft:card?.left,cardBottom:card?.bottom,overflow:scroller.scrollWidth>scroller.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1}})}
async function assertHorizontalPlacement(page){const value=await dimensions(page);if(value.wide){expect(Math.abs(value.exportRight-value.cardRight)).toBeLessThanOrEqual(1)}else{const mark=await page.locator('.bn-editor [data-bn-thread-id]').first().boundingBox();expect(Math.abs(value.cardLeft-mark.x)).toBeLessThanOrEqual(2)}}
async function openSelected(page){const rail=page.locator('.en-challenge-comments');if(!await page.locator('.en-challenge-card').count()||await rail.getAttribute('aria-hidden')==='true')await page.locator('.bn-editor [data-bn-thread-id]').first().click();await page.locator('.en-challenge-card').first().waitFor();await expect.poll(()=>rail.getAttribute('aria-hidden')).not.toBe('true');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect.poll(()=>rail.evaluate(el=>el.getAnimations().filter(animation=>animation.playState==='running').length)).toBe(0)}
for(const width of [3440,1600,1180,900])it(`keeps the note centered with right-side wide comments and nearby narrow bubbles at ${width}px`,async()=>{
 const {context,page,errors}=await fixture(width,true);try{
  const before=await dimensions(page);await page.evaluate(()=>window.seed());await expect.poll(()=>page.evaluate(()=>window.challenge.threads.length)).toBe(1);await openSelected(page)
  await expect.poll(async()=>{const value=await dimensions(page);return Math.abs(value.center-before.center)}).toBeLessThanOrEqual(1)
  await expect.poll(()=>assertHorizontalPlacement(page)).toBeUndefined()
  const value=await dimensions(page);expect(value.areaWidth).toBe(width);expect(value.overflow).toBe(false);if(value.wide)expect(value.cardLeft-value.bodyRight).toBeGreaterThanOrEqual(24)
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
  expect(await page.locator('.en-challenge-close').count()).toBe(0)
  const value=await dimensions(page);expect(Math.abs(value.center-value.areaCenter)).toBeLessThanOrEqual(1);expect(Math.abs(value.exportRight-value.cardRight)).toBeLessThanOrEqual(1);expect(errors).toEqual([])
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

// A comment must never change document width, text wrapping or a real table's columns.
it('keeps the original document and table unchanged when challenges appear at an intermediate width',async()=>{
 const {context,page}=await fixture(1440,true);try{
  await page.evaluate(()=>{window.editor.updateBlock('body-0',{content:'第0段判断'+ '这段较长的正文用于验证开启评论不会改变任何自然换行。'.repeat(12)});window.editor.insertBlocks([{id:'evidence-table',type:'table',content:{type:'tableContent',columnWidths:[250,280,290],rows:[{cells:[['指标'],['改版前'],['改版后']]},{cells:[['日活用户'],['1.2万'],['1.5万']]}]}}],'body-1','after')})
  const snapshot=()=>page.evaluate(()=>{const body=document.querySelector('.en-document').getBoundingClientRect(),table=document.querySelector('.bn-editor table').getBoundingClientRect(),paragraph=document.querySelector('[data-id="body-0"]').getBoundingClientRect();return{left:body.left,width:body.width,tableWidth:table.width,paragraphHeight:paragraph.height,columns:[...document.querySelectorAll('.bn-editor col')].map(el=>el.getBoundingClientRect().width)}})
  const before=await snapshot();expect(before.width).toBe(820);await page.evaluate(()=>window.seed());await openSelected(page)
  expect(await snapshot()).toEqual(before);expect((await dimensions(page)).wide).toBe(false)
 }finally{await context.close()}
},15000)

it('places persistent note tools before export and preserves tabs while a long header title truncates',async()=>{
 const {context,page}=await fixture(1800,true);try{
  await page.evaluate(()=>window.seed());await openSelected(page)
  const tools=page.locator('[data-en-challenge-tools="layout-note"]');await expect.poll(()=>tools.locator('.en-challenge-trigger').count()).toBe(1)
  expect(await page.locator('[data-srb-utilities]').evaluate(el=>[...el.querySelectorAll('button')].map(button=>button.textContent))).toEqual(['收起评论','AI挑战关闭','导出'])
  const box=await page.locator('.en-challenge-trigger').boundingBox(),exportBox=await page.locator('.en-header-export').boundingBox();expect(box.width).toBe(128);expect(box.height).toBe(30);expect(exportBox.x-box.x-box.width).toBe(12)
  await page.setViewportSize({width:850,height:900});await expect.poll(()=>page.getByRole('button',{name:'收起评论',exact:true}).count()).toBe(0)
  expect(await page.locator('[data-srb-tabs]').evaluate(el=>[...el.children].every(tab=>{const r=tab.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth}))).toBe(true)
  expect(await page.locator('.wSkVaW_crumb').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true)
 }finally{await context.close()}
},15000)

it('remembers collapsed margin comments after reload without losing drafts or overwriting preference on narrow resize',async()=>{
 const {context,page}=await fixture(2000,true);try{
  const before=await dimensions(page);await page.evaluate(()=>window.seed(2));await openSelected(page);const input=page.getByRole('textbox',{name:'回复AI挑战'}).first();await input.fill('收起和重载都保留这份草稿。')
  await page.getByRole('button',{name:'收起评论',exact:true}).click();await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(0)
  expect(await page.evaluate(()=>window.challenge.marginExpanded)).toBe(false);await openSelected(page);expect(await input.inputValue()).toBe('收起和重载都保留这份草稿。');expect((await dimensions(page)).bodyLeft).toBe(before.bodyLeft)
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('layout-note')||'null')?.yjs.length||0)).toBeGreaterThan(0)
  await page.reload();if(css)await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.bn-editor').waitFor();await expect.poll(()=>page.getByRole('button',{name:'展开评论',exact:true}).count()).toBe(1);expect(await page.locator('.en-challenge-card').count()).toBe(0)
  await openSelected(page);expect(await input.inputValue()).toBe('收起和重载都保留这份草稿。')
  await page.setViewportSize({width:1200,height:900});await expect.poll(()=>page.getByRole('button',{name:'展开评论',exact:true}).count()).toBe(0);expect(await page.evaluate(()=>window.challenge.marginExpanded)).toBe(false)
  await page.setViewportSize({width:2250,height:900});await page.getByRole('button',{name:'展开评论',exact:true}).click();await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(2);expect(await input.inputValue()).toBe('收起和重载都保留这份草稿。')
 }finally{await context.close()}
},15000)

for(const dark of [false,true])it(`uses weak neutral selection only for multiple margin cards in ${dark?'dark':'light'} theme`,async()=>{
 const {context,page}=await fixture(2000,true);try{
  await page.locator('.en-root').evaluate((el,dark)=>el.dataset.dark=String(dark),dark);await page.evaluate(()=>window.seed(2));await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(2)
  expect(await page.locator('.en-challenge-card[data-selected=true]').count()).toBe(0);expect(await page.locator('.bn-editor [data-bn-thread-id]').first().evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(dark?'rgb(81, 69, 38)':'rgb(255, 240, 190)');await page.locator('.bn-editor [data-bn-thread-id]').first().click();await expect.poll(()=>page.locator('.en-challenge-card[data-selected=true]').count()).toBe(1)
  const selected=await page.locator('.en-challenge-card[data-selected=true]').evaluate(el=>({border:getComputedStyle(el).borderTopColor,shadow:getComputedStyle(el).boxShadow,padding:getComputedStyle(el.querySelector('.en-challenge-optimize')).paddingLeft}));expect(selected.border).toBe(dark?'rgb(77, 77, 77)':'rgb(209, 209, 209)');expect(selected.shadow).toContain('16px 1px');expect(selected.padding).toBe('12px');await page.screenshot({path:'/tmp/notes-challenge-v15-selected-'+(dark?'dark':'light')+'.png'})
  await page.getByRole('button',{name:'收起评论',exact:true}).click();await openSelected(page);expect(await page.locator('.en-challenge-card[data-selected=true]').count()).toBe(0)
  expect(await page.locator('.en-challenge-card').evaluate(el=>getComputedStyle(el).borderTopColor)).toBe(dark?'rgb(58, 58, 58)':'rgb(228, 228, 228)')
  await page.getByRole('button',{name:'挑战模式，当前关闭'}).click();const picker=await page.locator('.en-challenge-popover').evaluate(el=>{const style=getComputedStyle(el);return{width:el.offsetWidth,height:el.offsetHeight,radius:style.borderRadius,background:style.backgroundColor,title:getComputedStyle(el.querySelector('.en-challenge-level-name')).textAlign}});expect(picker).toEqual({width:280,height:112,radius:'20px',background:dark?'rgb(37, 37, 37)':'rgb(255, 255, 255)',title:'center'})
  await page.screenshot({path:'/tmp/notes-challenge-v15-'+(dark?'dark':'light')+'.png'})
 }finally{await context.close()}
},15000)

it('keeps reply waiting below the user message with initial actions in place and collapse preserving the running reply',async()=>{
 const {context,page,errors}=await fixture(2000,true);try{
  await page.evaluate(()=>window.seed());await openSelected(page);await page.getByRole('textbox',{name:'回复AI挑战'}).fill('请核实这份判断的依据');await page.getByRole('button',{name:'发送挑战回复'}).click();await page.getByRole('status').filter({hasText:'思考回复中…'}).waitFor()
  const order=await page.locator('.en-challenge-messages').evaluate(el=>({actionsBeforeUser:!!(el.querySelector('.en-challenge-actions').compareDocumentPosition(el.querySelectorAll('.en-challenge-message')[1])&Node.DOCUMENT_POSITION_FOLLOWING),userBeforeThinking:!!(el.querySelectorAll('.en-challenge-message')[1].compareDocumentPosition(el.querySelector('.en-challenge-thinking'))&Node.DOCUMENT_POSITION_FOLLOWING),waitingInside:el.contains(el.querySelector('.en-challenge-thinking')),ring:getComputedStyle(el.querySelector('.en-challenge-thinking>span')).borderTopColor}));expect(order).toMatchObject({actionsBeforeUser:true,userBeforeThinking:true,waitingInside:true,ring:'rgb(123, 123, 123)'})
  await page.screenshot({path:'/tmp/notes-challenge-v15-reply-waiting.png'});expect(await page.getByRole('button',{name:'发送挑战回复'}).isDisabled()).toBe(true);expect(await page.getByRole('button',{name:'AI优化',exact:true}).isDisabled()).toBe(true);await page.getByRole('textbox',{name:'回复AI挑战'}).fill('请求中继续保留的新草稿。')
  await page.getByRole('button',{name:'收起评论',exact:true}).click();expect(await page.evaluate(()=>window.stops.length)).toBe(0);expect(await page.evaluate(()=>window.challenge.actionKind)).toBe('reply');await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(0)
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await page.locator('.en-challenge-card').count()).toBe(0)
  await openSelected(page);await page.getByRole('button',{name:'展开评论',exact:true}).click();expect(await page.evaluate(()=>window.stops.length)).toBe(0);expect(await page.getByRole('textbox',{name:'回复AI挑战'}).inputValue()).toBe('请求中继续保留的新草稿。')
  await page.evaluate(()=>Object.values(window.jobs).at(-1).resolve({version:1,issues:[],checks:[],coveredBlockIds:[],reply:{text:'还需要补充同周期和渠道数据，再判断这份结论。'}}));await expect.poll(()=>page.locator('.en-challenge-thinking').count()).toBe(0);expect(await page.locator('.en-challenge-text').allTextContents()).toEqual(['这段判断需要哪些实际依据？','请核实这份判断的依据','还需要补充同周期和渠道数据，再判断这份结论。']);expect(errors).toEqual([])
  await page.screenshot({path:'/tmp/notes-challenge-v15-reply-finished.png'})
 }finally{await context.close()}
},15000)

it('restores each note display preference and unsent reply when switching notes in the same page',async()=>{
 const {context,page}=await fixture(2000,true);try{
  await page.evaluate(()=>window.seed());await openSelected(page);await page.getByRole('textbox',{name:'回复AI挑战'}).fill('第一份笔记的草稿。');const beforeSave=await page.evaluate(()=>localStorage.getItem('layout-note'));await page.getByRole('button',{name:'收起评论',exact:true}).click();await expect.poll(()=>page.evaluate(()=>localStorage.getItem('layout-note'))).not.toBe(beforeSave)
  await page.evaluate(()=>window.switchNote('another-note'));await page.locator('[data-note-source-session="another-note"]').waitFor();await page.getByRole('button',{name:'收起评论',exact:true}).waitFor();await page.evaluate(()=>{window.editor.replaceBlocks(window.editor.document,window.initialNote.blocks);return window.seed()});await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(1)
  await page.evaluate(()=>window.switchNote('layout-note'));await page.locator('[data-note-source-session="layout-note"]').waitFor();await page.getByRole('button',{name:'展开评论',exact:true}).waitFor();expect(await page.locator('.en-challenge-card').count()).toBe(0);await openSelected(page);expect(await page.getByRole('textbox',{name:'回复AI挑战'}).inputValue()).toBe('第一份笔记的草稿。')
 }finally{await context.close()}
},15000)

it('keeps the composer reachable while a long pending conversation scrolls and uses selection glow only when multiple margin cards are visible',async()=>{
 const {context,page}=await fixture(2000,true);try{
  await page.evaluate(()=>window.seed(2,true));await page.locator('.bn-editor [data-bn-thread-id]').first().click();await page.getByRole('textbox',{name:'回复AI挑战'}).first().fill('请继续核对');await page.getByRole('button',{name:'发送挑战回复'}).first().click();await page.locator('.en-challenge-thinking').waitFor();await page.locator('.en-challenge-comments').evaluate(el=>el.scrollTop=0)
  const value=await page.locator('.en-challenge-card').first().evaluate(el=>{const close=el.querySelector('.en-challenge-reply').getBoundingClientRect(),card=el.getBoundingClientRect(),area=document.querySelector('.en-main').getBoundingClientRect();return{closeVisible:close.top>=card.top&&close.bottom<=Math.min(card.bottom,area.bottom),selected:el.dataset.selected==='true'}});expect(value.closeVisible).toBe(true);const visible=await page.locator('.en-challenge-card').evaluateAll(cards=>{const area=document.querySelector('.en-main').getBoundingClientRect();return cards.filter(card=>{const r=card.getBoundingClientRect();return r.bottom>area.top&&r.top<area.bottom}).length});expect(await page.locator('.en-challenge-card[data-selected=true]').count()).toBe(visible>1?1:0)
 }finally{await context.close()}
},15000)

async function nativeHeaderAncestors(page){
 for(const file of ['figma-final-shell.css','figma-panels.css','figma-refinements.css'])await page.addStyleTag({content:await readFile('src/preload/'+file,'utf8')})
 await page.evaluate(()=>{
  const header=document.querySelector('.wSkVaW_header'),frame=document.createElement('div'),center=document.createElement('div'),root=document.createElement('div');frame.className='pI_x6G_frame';frame.style.cssText='position:fixed;inset:0;display:flex';center.className='pI_x6G_centerCol';center.style.cssText='position:absolute;left:240px;right:0;top:0;bottom:0;isolation:isolate';root.className='wSkVaW_root';root.dataset.odysseyPage='conversation';root.style.height='100%';header.style.cssText='position:absolute;left:0;right:0;top:0;z-index:8;display:flex;align-items:center;gap:12px;height:44px;padding:0 20px';root.append(header);center.append(root);frame.append(center);document.body.prepend(frame);document.body.dataset.workspaceSurface='notes'
 })
}
it('keeps the picker above the real isolated native header stack with keyboard, drag, resize and session cleanup',async()=>{
 const {context,page,errors}=await fixture(2000,true);try{
  await nativeHeaderAncestors(page);await page.evaluate(()=>window.seed());await page.evaluate(()=>window.challenge.setMarginExpanded(false));await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(0);await openSelected(page);await page.getByRole('textbox',{name:'回复AI挑战'}).fill('调整等级不能中断这份回复');await page.getByRole('button',{name:'发送挑战回复'}).click();await page.locator('.en-challenge-thinking').waitFor()
  await page.getByRole('button',{name:'挑战模式，当前关闭'}).focus();await page.keyboard.press('Enter');const popup=page.locator('.en-challenge-popover'),slider=page.getByRole('slider',{name:'挑战强度'});await popup.waitFor();expect(await slider.evaluate(el=>document.activeElement===el)).toBe(true);expect(await page.evaluate(()=>window.challenge.level)).toBe(0)
  expect(await popup.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('.en-challenge-popover')===el})).toBe(true)
  expect(await popup.evaluate(el=>el.parentElement===document.body)).toBe(true);expect(await popup.locator('.en-challenge-track').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))).toEqual({width:252,height:24});await page.keyboard.press('ArrowRight');await expect.poll(()=>page.evaluate(()=>window.challenge.level)).toBe(1)
  const track=await slider.boundingBox();await page.mouse.move(track.x+12,track.y+13);await page.mouse.down();await page.mouse.move(track.x+240,track.y+13);await page.mouse.up();await expect.poll(()=>page.evaluate(()=>window.challenge.level)).toBe(4);expect(await page.evaluate(()=>window.stops.length)).toBe(0)
  await page.setViewportSize({width:1900,height:900});await expect.poll(()=>popup.evaluate(el=>Math.abs(el.getBoundingClientRect().right-document.querySelector('.en-challenge-trigger').getBoundingClientRect().right))).toBeLessThanOrEqual(1)
  await page.screenshot({path:'/tmp/notes-challenge-v15-native-portal-open.png'});await page.keyboard.press('Escape');expect(await popup.count()).toBe(0);expect(await page.locator('.en-challenge-trigger').evaluate(el=>document.activeElement===el)).toBe(true);expect(await page.evaluate(()=>window.challenge.actionKind)).toBe('reply');expect(await page.evaluate(()=>window.stops.length)).toBe(0)
  await page.getByRole('button',{name:'挑战模式，当前抬杠'}).click();await popup.waitFor();await page.evaluate(()=>window.switchNote('another-note'));await page.locator('[data-note-source-session="another-note"]').waitFor();expect(await popup.count()).toBe(0);expect(errors).toEqual([])
  await page.screenshot({path:'/tmp/notes-challenge-v15-native-portal-cleanup.png'})
 }finally{await context.close()}
},15000)
for(const readingOlder of [false,true])it(`follows a completed reply in a long thread ${readingOlder?'without interrupting a reader who scrolled upward':'when the reader was following its bottom'}`,async()=>{
 const {context,page}=await fixture(900);try{
  await page.evaluate(()=>window.seed(1,true));await openSelected(page);await page.getByRole('textbox',{name:'回复AI挑战'}).fill('请继续核对');await page.getByRole('button',{name:'发送挑战回复'}).click();await page.locator('.en-challenge-thinking').waitFor();const messages=page.locator('.en-challenge-messages');await expect.poll(()=>messages.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
  if(readingOlder){await messages.evaluate(el=>el.scrollTop=0);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))}
  await page.evaluate(()=>Object.values(window.jobs).at(-1).resolve({version:1,issues:[],checks:[],coveredBlockIds:[],reply:{text:'还需要补充同周期和渠道数据，再判断这份结论。'.repeat(3)}}));await expect.poll(()=>page.locator('.en-challenge-thinking').count()).toBe(0)
  if(readingOlder)expect(await messages.evaluate(el=>el.scrollTop)).toBeLessThanOrEqual(1)
  else await expect.poll(()=>messages.evaluate(el=>{const reply=el.querySelector('.en-challenge-message:last-of-type .en-challenge-text').getBoundingClientRect(),area=el.getBoundingClientRect();return reply.top>=area.top&&reply.bottom<=area.bottom})).toBe(true)
  await page.screenshot({path:'/tmp/notes-challenge-v15-long-reply-'+(readingOlder?'older':'following')+'.png'})
 }finally{await context.close()}
},15000)

for(const settingsRoute of ['keyboard-overlay','surface-state'])it(`closes the resident picker for ${settingsRoute} settings and leaves it closed after restoring notes`,async()=>{
 const {context,page,errors}=await fixture(2000,true);try{
  await nativeHeaderAncestors(page);await page.evaluate(()=>window.seed());await page.evaluate(()=>window.challenge.setMarginExpanded(false));await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(0);await openSelected(page)
  await page.getByRole('textbox',{name:'回复AI挑战'}).fill('设置不应取消正在进行的回复');await page.getByRole('button',{name:'发送挑战回复'}).click();await page.locator('.en-challenge-thinking').waitFor();await page.getByRole('textbox',{name:'回复AI挑战'}).fill('设置期间保留的新草稿。')
  await page.getByRole('button',{name:'挑战模式，当前关闭'}).focus();await page.keyboard.press('Enter');await page.locator('.en-challenge-popover').waitFor()
  if(settingsRoute==='keyboard-overlay'){
   await page.evaluate(()=>{const open=event=>{if(event.metaKey&&event.key===','){const overlay=document.createElement('div');overlay.className='VOzbGW_overlay';document.body.append(overlay);document.removeEventListener('keydown',open)}};document.addEventListener('keydown',open)});await page.keyboard.press('Meta+,');await page.locator('.VOzbGW_overlay').waitFor({state:'attached'})
  }else await page.evaluate(()=>document.querySelector('.en-root').dataset.settingsOpen='true')
  await expect.poll(()=>page.locator('.en-challenge-popover').count()).toBe(0);expect(await page.evaluate(()=>window.challenge.level)).toBe(0);expect(await page.evaluate(()=>window.challenge.actionKind)).toBe('reply');expect(await page.evaluate(()=>window.stops.length)).toBe(0)
  await page.evaluate(()=>{document.querySelector('.VOzbGW_overlay')?.remove();document.querySelector('.en-root').dataset.settingsOpen='false'});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await page.locator('.en-challenge-popover').count()).toBe(0);expect(await page.getByRole('textbox',{name:'回复AI挑战'}).inputValue()).toBe('设置期间保留的新草稿。');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('keeps wide comments mounted and focused while their original anchors scroll out of view',async()=>{
 const{context,page,errors}=await fixture(3440);try{
  await page.evaluate(()=>window.seed(10));await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(10)
  const input=page.getByRole('textbox',{name:'回复AI挑战'}).first();await input.fill('滚动保留这份草稿');await input.evaluate(el=>window.retainedInput=el)
  await page.locator('.en-document-scroll').evaluate(el=>el.scrollTop=500)
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  expect(await page.locator('.en-challenge-card').count()).toBe(10)
  expect(await input.evaluate(el=>el===window.retainedInput&&document.activeElement===el)).toBe(true)
  expect(await input.inputValue()).toBe('滚动保留这份草稿');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('sends with Enter while preserving Shift+Enter and IME composition, and uses exact v16 geometry under native host CSS',async()=>{
 const{context,page,errors}=await fixture(2000,true);try{
  await nativeHeaderAncestors(page);await page.evaluate(()=>window.seed());await openSelected(page)
  const input=page.getByRole('textbox',{name:'回复AI挑战'});await input.fill('第一行');await page.keyboard.press('Shift+Enter');expect(await input.inputValue()).toBe('第一行\n')
  await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});expect(await page.evaluate(()=>Object.keys(window.jobs).length)).toBe(0)
  await input.fill('发送中文');await page.keyboard.press('Enter');await page.locator('.en-challenge-thinking').waitFor()
  expect(await page.evaluate(()=>Object.keys(window.jobs).length)).toBe(1)
  expect(await page.locator('.en-challenge-author strong').allTextContents()).toEqual(['AI挑战者','我'])
  await page.evaluate(()=>{window.challenge.setMarginExpanded(false);window.challenge.select(window.challenge.threads[0].id)});await page.locator('.en-challenge-close').waitFor()
  const geometry=await page.locator('.en-challenge-card').evaluate(card=>{const box=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{width:r.width,height:r.height,padding:s.padding,minWidth:s.minWidth,bg:s.backgroundColor}},close=card.querySelector('.en-challenge-close'),icon=close.querySelector('img'),c=close.getBoundingClientRect(),i=icon.getBoundingClientRect();return{card:box(card),close:box(close),send:box(card.querySelector('.en-challenge-reply>button')),input:box(card.querySelector('textarea')),iconCentered:Math.abs(c.x+c.width/2-i.x-i.width/2)<.1&&Math.abs(c.y+c.height/2-i.y-i.height/2)<.1}})
  expect(geometry.card.width).toBe(320);expect(geometry.close.width).toBe(24);expect(geometry.close.height).toBe(24);expect(geometry.close.padding).toBe('0px');expect(geometry.send.width).toBe(36);expect(geometry.send.height).toBe(32);expect(geometry.input.width).toBe(244);expect(geometry.input.height).toBe(36);expect(geometry.iconCentered).toBe(true)
  await page.screenshot({path:'/tmp/notes-challenge-v16-native-geometry.png'});await page.locator('.en-root').evaluate(el=>el.dataset.dark='true');await page.locator('.en-challenge-close').hover();await page.screenshot({path:'/tmp/notes-challenge-v16-native-geometry-dark.png'});console.log('v16 geometry',JSON.stringify(geometry));expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

for(const width of [2000,900])it(`limits long cards to 560px with a fixed composer and internally consumed wheel at ${width}px`,async()=>{
 const{context,page,errors}=await fixture(width,true);try{
  await page.setViewportSize({width:width+250,height:700});await page.evaluate(()=>window.seed(1,true));await openSelected(page)
  const card=page.locator('.en-challenge-card'),messages=card.locator('.en-challenge-messages'),input=card.getByRole('textbox',{name:'回复AI挑战'})
  await expect.poll(()=>card.evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(560)
  expect(await messages.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
  expect(await card.locator('.en-challenge-close').count()).toBe(width===2000?0:1)
  await input.fill('内部滚动保留我的草稿');await input.evaluate(el=>window.fixedComposer=el)
  const before=await card.evaluate(el=>({composer:el.querySelector('.en-challenge-reply').getBoundingClientRect().toJSON(),note:document.querySelector('.en-document-scroll').scrollTop,margin:document.querySelector('.en-challenge-comments').scrollTop}))
  await messages.hover();await page.mouse.wheel(0,450);await expect.poll(()=>messages.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
  await messages.evaluate(el=>el.scrollTop=el.scrollHeight);await messages.hover();await page.mouse.wheel(0,800);await page.waitForTimeout(100)
  const after=await card.evaluate(el=>({composer:el.querySelector('.en-challenge-reply').getBoundingClientRect().toJSON(),note:document.querySelector('.en-document-scroll').scrollTop,margin:document.querySelector('.en-challenge-comments').scrollTop}))
  expect(after).toEqual(before);expect(await card.evaluate(el=>{const r=el.querySelector('.en-challenge-reply').getBoundingClientRect(),area=document.querySelector('.en-main').getBoundingClientRect();return r.bottom<=area.bottom-16})).toBe(true);expect(await input.evaluate(el=>el===window.fixedComposer&&document.activeElement===el)).toBe(true);expect(await input.inputValue()).toBe('内部滚动保留我的草稿')
  await page.setViewportSize({width:width+250,height:460});await expect.poll(()=>card.evaluate(el=>{const r=el.getBoundingClientRect(),area=document.querySelector('.en-main').getBoundingClientRect();return r.height<=area.height-32&&r.height<=560})).toBe(true)
  await page.evaluate(()=>{window.longSuggestion='完整建议。'.repeat(700);window.challenge.runAction(window.challenge.threads[0],'optimize')});await expect.poll(()=>page.evaluate(()=>Object.keys(window.jobs).length)).toBe(1)
  await page.evaluate(()=>Object.values(window.jobs).at(-1).resolve({version:1,issues:[],coveredBlockIds:[],checks:[],reply:{text:'可替换建议如下。',replacement:window.longSuggestion}}));await expect.poll(()=>card.locator('.en-challenge-replacement-text').textContent()).toBe('完整建议。'.repeat(700))
  await card.getByRole('button',{name:'替换到原文',exact:true}).scrollIntoViewIfNeeded();expect(await card.evaluate(el=>{const button=el.querySelector('.en-challenge-replace').getBoundingClientRect(),messages=el.querySelector('.en-challenge-messages').getBoundingClientRect(),reply=el.querySelector('.en-challenge-reply').getBoundingClientRect();return button.top>=messages.top&&button.bottom<=messages.bottom&&reply.top>=messages.bottom-1})).toBe(true)
  expect(await input.inputValue()).toBe('内部滚动保留我的草稿')
  if(width===900){const close=card.getByRole('button',{name:'收起挑战评论'});expect(await close.evaluate(el=>getComputedStyle(el).backgroundColor===getComputedStyle(el.closest('article')).backgroundColor)).toBe(true);expect(await close.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===el})).toBe(true);await page.screenshot({path:'/tmp/notes-challenge-v16-fix2-popup-close.png'});await close.click();await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(0);await openSelected(page);expect(await page.getByRole('textbox',{name:'回复AI挑战'}).inputValue()).toBe('内部滚动保留我的草稿')}
  await page.screenshot({path:'/tmp/notes-challenge-v16-fix1-long-'+width+'.png'});expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('shows no margin close control but preserves draft when the toolbar changes the card into a closable popup',async()=>{
 const{context,page}=await fixture(2000,true);try{
  await page.evaluate(()=>window.seed());await openSelected(page);await page.getByRole('textbox',{name:'回复AI挑战'}).fill('常驻与浮层切换保留草稿')
  expect(await page.locator('.en-challenge-close').count()).toBe(0)
  expect(await page.locator('.en-challenge-quote').evaluate(el=>({width:el.getBoundingClientRect().width,right:getComputedStyle(el).paddingRight}))).toEqual({width:288,right:'0px'})
  await page.getByRole('button',{name:'收起评论',exact:true}).click();await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(0);await openSelected(page);await expect.poll(()=>page.locator('.en-challenge-close').count()).toBe(1)
  expect(await page.locator('.en-challenge-quote').evaluate(el=>getComputedStyle(el).paddingRight)).toBe('16px')
  await page.getByRole('button',{name:'收起挑战评论'}).click();await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(0);await openSelected(page);expect(await page.getByRole('textbox',{name:'回复AI挑战'}).inputValue()).toBe('常驻与浮层切换保留草稿')
  await page.getByRole('button',{name:'展开评论',exact:true}).click();await expect.poll(()=>page.locator('.en-challenge-close').count()).toBe(0)
 }finally{await context.close()}
},15000)

for(const reducedMotion of [false,true])it(`aligns margin comments to export and ${reducedMotion?'hides immediately for reduced motion':'fades out and reverses a rapid collapse without losing drafts'}`,async()=>{
 const {context,page,errors}=await fixture(2000,true);try{
  await page.emulateMedia({reducedMotion:reducedMotion?'reduce':'no-preference'});await page.evaluate(()=>window.seed(2));await openSelected(page)
  const rail=page.locator('.en-challenge-comments'),input=page.getByRole('textbox',{name:'回复AI挑战'}).first();await input.fill('展开收起不能丢失的草稿。')
  await expect.poll(()=>rail.evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1)
  const before=await dimensions(page);expect(Math.abs(before.exportRight-before.cardRight)).toBeLessThanOrEqual(1);expect(before.exportRight-before.triggerRight).toBeGreaterThan(20)
  await page.getByRole('button',{name:'收起评论',exact:true}).click()
  if(!reducedMotion){
   await expect.poll(()=>rail.evaluate(el=>Number(getComputedStyle(el).opacity))).toBeLessThan(1)
   expect(await page.locator('.en-challenge-card').count()).toBe(2);expect(await rail.evaluate(el=>el.inert)).toBe(true)
   await page.getByRole('button',{name:'展开评论',exact:true}).click();await expect.poll(()=>rail.evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1)
   expect(await input.inputValue()).toBe('展开收起不能丢失的草稿。');expect(await rail.evaluate(el=>el.inert)).toBe(false)
   await page.getByRole('button',{name:'收起评论',exact:true}).click()
  }else await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(0)
  await page.getByRole('button',{name:'展开评论',exact:true}).click();await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(2)
  await expect.poll(()=>rail.evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1)
  expect(await input.inputValue()).toBe('展开收起不能丢失的草稿。');expect((await dimensions(page)).bodyLeft).toBe(before.bodyLeft)
  if(reducedMotion)expect(await rail.evaluate(el=>el.getAnimations().length)).toBe(0)
  expect(errors).toEqual([])
  await page.screenshot({path:'/tmp/notes-comment-export-'+(reducedMotion?'reduced':'animated')+'-20261021.png'})
 }finally{await context.close()}
},15000)
