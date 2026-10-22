import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';import './src/preload/notes/challenge.css';import * as Y from 'yjs';import {YjsThreadStore} from '@blocknote/core/yjs';import {DefaultThreadStoreAuth} from '@blocknote/core/comments';import {CHALLENGE_USER,CHALLENGE_KIND} from './src/preload/notes/challenge-controller';import {saveChallengeReviewState} from './src/preload/notes/challenge-review-state';import {findChallengeQuote,replaceChallengeQuote} from './src/preload/notes/challenge-anchors';
 window.requests=[];window.views=[];window.tasks=[];window.composer=[];window.jobs={};document.addEventListener('sherlock:notes-component-view',e=>window.views.push(e.detail));document.addEventListener('sherlock:notes-task-state',e=>window.tasks.push(e.detail));document.addEventListener('sherlock:notes-composer-state',e=>window.composer.push(e.detail));
 const bridge={request:async(method,input)=>{window.requests.push({method,input});if(method==='load')return {saved:window.initialNote||{title:'',blocks:[{id:'anchor',type:'paragraph'}],yjs:'',revision:0}};if(method==='generate'||method==='challenge')return new Promise((resolve,reject)=>window.jobs[input.requestId]={input,resolve,reject});if(method==='library-list')return [];if(method==='save')return {status:'saved',saved:{...input.content,revision:input.revision+1}};return {}},draft:async()=>{}};
 const root=createRoot(document.querySelector('#notes'));let version=0;window.mountNote=()=>root.render(<NotesApp key={version++} sessionId="inline-generation" bridge={bridge} dark={false} navigate={()=>{}}/>);window.mountNote();
 window.seedReviewedNote=async()=>{const title='用户标题保留',blocks=[{id:'p',type:'paragraph',text:'这项结论的成度较高。'},{id:'clean',type:'paragraph',text:'已经检查的正常中文正文。'}],doc=window.noteDoc;window.editor.replaceBlocks(window.editor.document,blocks.map(({text,...block})=>({...block,content:text})));doc.getMap('note-challenge').set('level',2);doc.getMap('note-challenge-results').set('state',await saveChallengeReviewState(title,blocks,2,new Map(blocks.map((block,index)=>[block.id,{text:block.text,title,level:2,complete:true,issueCount:index===0?1:0}])),[]));const store=new YjsThreadStore(CHALLENGE_USER,doc.getMap('threads'),new DefaultThreadStoreAuth(CHALLENGE_USER,'editor')),thread=await store.createThread({metadata:{kind:CHALLENGE_KIND,issue:{blockId:'p',quote:'成度',category:'typo',message:'AI优化',evidence:[{title:'用户证据原文',url:'https://example.test'}]},sourceText:blocks[0].text,draft:'AI优化'},initialComment:{body:[{type:'paragraph',content:[{type:'text',text:'AI优化',styles:{}}]}]}});window.threadId=thread.id;const range=findChallengeQuote(window.editor,'p','成度');window.editor.transact(tr=>tr.setMeta('addToHistory',false).addMark(range.from,range.to,tr.doc.type.schema.marks.comment.create({threadId:thread.id,orphan:false})));let encoded='';for(const byte of Y.encodeStateAsUpdate(doc))encoded+=String.fromCharCode(byte);window.initialNote={title,blocks:blocks.map(({text,...block})=>({...block,content:text})),yjs:btoa(encoded),revision:0};window.mountNote()};
 window.addReplacementReview=()=>{const reviews=window.challenge.replacementReviews,snapshot=reviews.capture('p','成度');replaceChallengeQuote(window.editor,'p','成度','程度',window.threadId);const thread=window.noteDoc.getMap('threads').get(window.threadId),metadata=thread.get('metadata');thread.set('metadata',{...metadata,issue:{...metadata.issue,quote:'程度'},sourceText:'这项结论的程度较高。'});reviews.add({threadId:window.threadId,blockId:'p',anchorBefore:'成度',original:'成度',replacement:'程度',autoResolved:true},snapshot)};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.editor=editor;window.challenge=challenge;window.noteDoc=doc; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;css=output.outputFiles.find(f=>f.path.endsWith('.css')).text
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
it('changes note menus, placeholders and component drafts live without replacing unsaved content',async()=>{
 const context=await browser.newContext({viewport:{width:1100,height:850}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(4000)
 try{
  await page.route('http://127.0.0.1/english-notes',route=>route.fulfill({contentType:'text/html',body:'<html data-odyssey-locale="en"><section id="notes" class="en-root" style="position:fixed;inset:0"></section></html>'}));await page.goto('http://127.0.0.1/english-notes');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor()
  expect(await page.locator('.en-title').getAttribute('placeholder')).toBe('Untitled document')
  expect(await page.locator('.bn-block-content').evaluate(el=>getComputedStyle(el,':after').content)).toMatch(/commands|insert/i)
  await page.locator('.en-title').fill('用户标题保留')
  await page.evaluate(()=>{window.originalEditor=window.editor;window.editor.replaceBlocks(window.editor.document,[{id:'text',type:'paragraph',content:'用户正文：图片、文件、智能组件'},{id:'draft',type:'research',props:{payload:JSON.stringify({id:'note-component-test',noteDraft:'smart',containerPrompt:'中文需求原样保留',generationStatus:'draft'})}},{id:'anchor',type:'paragraph'}]);window.beforeLocale=JSON.stringify(window.editor.document)})
  expect(await page.locator('.en-creation-component strong').textContent()).toBe('Smart component')
  await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='zh')
  await expect.poll(()=>page.locator('.en-title').getAttribute('placeholder')).toBe('无标题文档')
  expect(await page.locator('.en-creation-component strong').textContent()).toBe('智能组件')
  await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en')
  await expect.poll(()=>page.locator('.en-creation-component strong').textContent()).toBe('Smart component')
  expect(await page.locator('.en-title').inputValue()).toBe('用户标题保留');expect(await page.locator('.en-creation-component textarea').inputValue()).toBe('中文需求原样保留')
  expect(await page.evaluate(()=>window.originalEditor===window.editor&&window.beforeLocale===JSON.stringify(window.editor.document))).toBe(true)
  await page.getByRole('button',{name:'Show outline'}).click();expect(await page.locator('.en-toc-heading').textContent()).toBe('Outline');await page.keyboard.press('Escape')
  await page.evaluate(()=>{window.editor.setTextCursorPosition('anchor','start');window.editor.focus()});await page.keyboard.type('/')
  await expect.poll(()=>page.evaluate(()=>window.requests.filter(r=>r.method==='menu-sync').at(-1)?.input.items.some(i=>i.title==='Smart component'))).toBe(true)
  const menu=await page.evaluate(()=>window.requests.filter(r=>r.method==='menu-sync').at(-1).input);expect(menu.locale).toBe('en');for(const title of ['Image','Video','Audio','File','Link','Component library'])expect(menu.items.some(i=>i.title===title)).toBe(true)
  expect(errors).toEqual([])
 }finally{await context.close()}
},20000)

it('switches challenge tiers, paragraph feedback and replacement UI live while preserving authored text and drafts',async()=>{
 const context=await browser.newContext({viewport:{width:1600,height:850}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(4000)
 const buttonFits=button=>button.evaluate(el=>{const bounds=el.getBoundingClientRect();return[...el.childNodes].every(node=>{const range=document.createRange();range.selectNode(node);const r=range.getBoundingClientRect();return r.left>=bounds.left-1&&r.right<=bounds.right+1&&r.top>=bounds.top-1&&r.bottom<=bounds.bottom+1})})
 try{
  await page.route('http://127.0.0.1/english-challenge',route=>route.fulfill({contentType:'text/html',body:'<html data-odyssey-locale="en"><section id="notes" class="en-root" style="position:fixed;inset:0"></section></html>'}));await page.goto('http://127.0.0.1/english-challenge');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor();await page.evaluate(()=>window.seedReviewedNote())
  const issueLine=page.locator('.en-challenge-paragraph-line[data-block-id=p]'),cleanLine=page.locator('.en-challenge-paragraph-line[data-block-id=clean]')
  await issueLine.waitFor();await cleanLine.waitFor();await page.evaluate(()=>window.challenge.select(window.threadId));const card=page.locator('.en-challenge-card');await card.waitFor()
  expect(await page.locator('.en-challenge-trigger').getAttribute('aria-label')).toBe('Challenge mode: Standard')
  expect(await buttonFits(page.locator('.en-challenge-trigger'))).toBe(true);expect(await buttonFits(page.locator('.en-challenge-margin-toggle'))).toBe(true)
  expect(await card.locator('.en-challenge-text').textContent()).toBe('AI优化');expect(await card.locator('textarea').inputValue()).toBe('AI优化')
  expect(await card.locator('textarea').getAttribute('aria-label')).toBe('Reply to AI Challenge');expect(await card.locator('textarea').getAttribute('placeholder')).not.toMatch(/[\u4e00-\u9fff]/u)
  expect(await card.locator('.en-challenge-category').textContent()).not.toMatch(/[\u4e00-\u9fff]/u)
  for(const name of ['AI optimize','View evidence','Resolved','Send challenge reply'])expect(await card.getByRole('button',{name,exact:true}).count()).toBe(1)
  expect(await issueLine.getAttribute('aria-label')).toMatch(/Standard.*1.*unresolved/i);expect(await cleanLine.getAttribute('aria-label')).toMatch(/Standard.*no issues/i)
  await page.evaluate(()=>{window.originalEditor=window.editor;window.beforeLocale=JSON.stringify(window.editor.document);window.originalStatusLine=document.querySelector('.en-challenge-paragraph-line[data-block-id=p]');document.documentElement.dataset.odysseyLocale='zh'})
  await expect.poll(()=>card.locator('textarea').getAttribute('aria-label')).toBe('回复AI挑战');await expect.poll(()=>issueLine.getAttribute('aria-label')).toContain('标准模式')
  await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en');await expect.poll(()=>issueLine.getAttribute('aria-label')).toMatch(/Standard.*1.*unresolved/i)
  expect(await issueLine.evaluate(el=>el===window.originalStatusLine)).toBe(true);expect(await card.locator('textarea').inputValue()).toBe('AI优化');expect(await card.locator('.en-challenge-text').textContent()).toBe('AI优化')
  expect(await page.evaluate(()=>window.originalEditor===window.editor&&window.beforeLocale===JSON.stringify(window.editor.document))).toBe(true)
  await page.locator('.en-challenge-trigger').click();const slider=page.getByRole('slider',{name:'Challenge intensity'});await slider.waitFor()
  for(const level of [1,2,3,4,2]){await page.evaluate(level=>window.challenge.setLevel(level),level);await expect.poll(()=>slider.getAttribute('aria-valuenow')).toBe(String(level));expect(await buttonFits(page.locator('.en-challenge-trigger'))).toBe(true)}
  const track=await slider.boundingBox()
  await page.mouse.move(track.x+12,track.y+13);await page.mouse.down()
  const grades=[];for(const offset of [12,69,126,183,240]){await page.mouse.move(track.x+offset,track.y+13);grades.push(await page.locator('.en-challenge-level-name').textContent());expect(await page.locator('.en-challenge-description').textContent()).not.toMatch(/[\u4e00-\u9fff]/u);expect(await slider.evaluate(el=>el.getBoundingClientRect().bottom<=el.closest('.en-challenge-popover').getBoundingClientRect().bottom-6)).toBe(true)}
  expect(grades[0]).toBe('Off');expect(new Set(grades).size).toBe(5);expect(grades.join(' ')).not.toMatch(/[\u4e00-\u9fff]/u)
  await page.mouse.move(track.x+126,track.y+13);await page.mouse.up();await page.keyboard.press('Escape');await page.evaluate(()=>window.challenge.resolve(window.threadId))
  await expect.poll(()=>page.locator('.en-challenge-paragraph-line[data-exiting]').count()).toBe(0);await expect.poll(()=>issueLine.getAttribute('aria-label')).toMatch(/Standard.*1.*resolved/i)
  const beforeComparisonRequests=await page.evaluate(()=>window.requests.filter(r=>r.method==='challenge'||r.method==='generate').length)
  await page.evaluate(()=>window.addReplacementReview());const mark=page.locator('.en-replacement-mark');await mark.waitFor();expect(await mark.getAttribute('aria-label')).toBe('View replacement comparison');await mark.click()
  const comparison=page.getByRole('dialog',{name:'Replacement comparison'});await comparison.waitFor();expect(await comparison.locator('h4').allTextContents()).toEqual(['Original text','Replacement']);expect(await comparison.locator('[data-replacement-before]').textContent()).toBe('成度');expect(await comparison.locator('[data-replacement-after]').textContent()).toBe('程度')
  await page.evaluate(()=>{window.replacementEditor=window.editor;window.beforeComparisonLocale=JSON.stringify(window.editor.document);window.beforeReviewLocale=JSON.stringify([...window.noteDoc.getMap('note-replacement-reviews').values()]);document.documentElement.dataset.odysseyLocale='zh'});await expect.poll(()=>mark.getAttribute('aria-label')).toBe('查看替换对照');await page.getByRole('dialog',{name:'替换对照'}).waitFor()
  await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en');await expect.poll(()=>mark.getAttribute('aria-label')).toBe('View replacement comparison');await comparison.waitFor();expect(await comparison.getByRole('button',{name:'Undo replacement'}).count()).toBe(1);expect(await page.evaluate(()=>window.replacementEditor===window.editor&&window.beforeComparisonLocale===JSON.stringify(window.editor.document)&&window.beforeReviewLocale===JSON.stringify([...window.noteDoc.getMap('note-replacement-reviews').values()]))).toBe(true)
  await page.evaluate(()=>window.editor.updateBlock('p',{content:'这段文字已再次调整。'}));await expect.poll(()=>comparison.getByRole('status').textContent()).not.toMatch(/[\u4e00-\u9fff]/u)
  expect(await page.evaluate(()=>window.requests.filter(r=>r.method==='challenge'||r.method==='generate').length)).toBe(beforeComparisonRequests);expect(errors).toEqual([])
 }finally{await context.close()}
},20000)
