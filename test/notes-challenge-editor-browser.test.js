import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import{createRoot}from'react-dom/client';import{mountNotes}from'./src/preload/notes/mount';import{CommentsExtension}from'@blocknote/core/comments';window.CommentsExtension=CommentsExtension;
 window.calls=[];window.jobs={};window.events=[];for(const name of ['open','state'])document.addEventListener('sherlock:notes-challenge-'+name,e=>window.events.push({name,detail:e.detail}));
 const bridge={request:async(method,input)=>{window.calls.push({method,input});if(method==='load')return{saved:window.saved?{...window.saved,revision:0}:{title:'研究笔记',blocks:[{id:'p',type:'paragraph',content:[{type:'text',text:'这项结论的成度较高。',styles:{bold:true}}]},{id:'other',type:'paragraph',content:'另一段保持不变。'}],yjs:'',revision:0}};if(method==='challenge')return new Promise(resolve=>window.jobs[input.requestId]={input,resolve});if(method==='save'){window.saved=input.content;return{status:'saved',saved:{...input.content,revision:input.revision+1}}}return{}},draft:async()=>{}};
 const host={register:(_mode,surface)=>{surface.style.left='0';document.body.append(surface)},open:()=>{},close:()=>{},current:()=>'notes'};let mounted=mountNotes(document,bridge,host);window.remount=()=>{mounted.dispose();mounted=mountNotes(document,bridge,host)};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'inline-production-styles',setup(b){b.onResolve({filter:/\.css\?inline$/},async args=>{const resolved=await b.resolve(args.path.slice(0,-7),{resolveDir:args.resolveDir,kind:args.kind});return{path:resolved.path,namespace:'inline-css'}});b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}},{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.editor=editor;window.challenge=challenge;window.noteDoc=doc; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;css=output.outputFiles.find(f=>f.path.endsWith('.css'))?.text||''
 const {chromium}=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(width=2000){const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);await page.route('http://127.0.0.1/challenge',r=>r.fulfill({contentType:'text/html',body:'<span data-ework-notes-session="challenge"></span><div data-ework-note-view="challenge"></div>'}));await page.goto('http://127.0.0.1/challenge');if(css)await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor();await page.evaluate(()=>window.editor.replaceBlocks(window.editor.document,[{id:'p',type:'paragraph',content:[{type:'text',text:'这项结论的成度较高。',styles:{bold:true}}]},{id:'other',type:'paragraph',content:'另一段保持不变。'}]));return{context,page,errors}}
const reply={version:1,issues:[{blockId:'p',quote:'成度',category:'typo',message:'这里是否应为“程度”？',evidence:[{kind:'note',label:'笔记原文',blockId:'p',quote:'这项结论的成度较高。'}]}],coveredBlockIds:['p','other'],checks:[{kind:'note',status:'completed',detail:'已检查原文。'}]}
async function enable(page){await page.getByRole('button',{name:'挑战模式，当前关闭'}).click();const slider=page.getByRole('slider',{name:'挑战强度'});await slider.focus();await slider.press('ArrowRight');await slider.press('ArrowRight');await page.getByRole('button',{name:'挑战模式，当前标准'}).click();await expect.poll(()=>page.evaluate(()=>Object.keys(window.jobs).length),{timeout:7000}).toBe(1).catch(async e=>{console.log('challenge diagnostic',await page.evaluate(()=>({level:window.challenge.level,pref:window.noteDoc.getMap('note-challenge').get('level'),focus:document.hasFocus(),visibility:document.visibilityState,blocks:window.editor.document,calls:window.calls})));throw e})}
async function finish(page,value=reply){await page.evaluate(value=>Object.values(window.jobs).at(-1).resolve(value),value)}
it('keeps writing quiet until real anchored issues exist, persists the five-level choice, and supports same-thread reply, evidence, optimize and resolution',async()=>{
 const{context,page,errors}=await fixture();try{
  expect(await page.evaluate(()=>window.calls.filter(c=>c.method==='challenge').length)).toBe(0)
  expect(await page.locator('.en-challenge-card').count()).toBe(0)
  await enable(page);expect(await page.locator('.en-challenge-card').count()).toBe(0)
  const focused=await page.evaluate(()=>document.activeElement?.className);await finish(page);await page.getByRole('article',{name:'AI挑战评论'}).waitFor();expect(await page.evaluate(()=>document.activeElement?.className)).toBe(focused);await page.screenshot({path:'/tmp/notes-challenge-wide-light-20261021.png'})
  expect(await page.locator('.en-challenge-card').count()).toBe(1);expect(await page.locator('[data-challenge-wide=true]').count()).toBe(1)
  expect(await page.evaluate(()=>window.editor.getBlock('p').content[0].styles.bold)).toBe(true)
  await page.getByRole('button',{name:'查看依据',exact:true}).click();expect(await page.evaluate(()=>window.events.some(e=>e.name==='open'&&e.detail.evidence[0].quote==='这项结论的成度较高。'))).toBe(true)
  const input=page.getByRole('textbox',{name:'回复AI挑战'});await input.fill('请解释理由');await input.press('Shift+Enter');await input.type('保留我的观点');expect(await input.inputValue()).toBe('请解释理由\n保留我的观点')
  expect(await page.evaluate(()=>window.calls.filter(c=>c.method==='challenge').length)).toBe(1)
  await input.press('Meta+Enter');await expect.poll(()=>page.evaluate(()=>Object.keys(window.jobs).length)).toBe(2);expect(await page.evaluate(()=>Object.keys(Object.values(window.jobs).at(-1).input.thread).sort())).toEqual(['blockId','category','message','messages','quote'])
  await finish(page,{version:1,issues:[],coveredBlockIds:[],checks:[],reply:{text:'只是文字用法问题，研究观点可以保留。'}})
  await expect.poll(()=>page.locator('.en-challenge-text').allTextContents()).toEqual(['这里是否应为“程度”？','请解释理由\n保留我的观点','只是文字用法问题，研究观点可以保留。'])
  await page.getByRole('button',{name:'AI优化',exact:true}).click();await expect.poll(()=>page.evaluate(()=>Object.keys(window.jobs).length)).toBe(3)
  await finish(page,{version:1,issues:[],coveredBlockIds:[],checks:[],reply:{text:'已修正用字。',replacement:'这项结论的程度较高。'}})
  await page.getByRole('button',{name:'替换到原文',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe('这项结论的程度较高。')
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.every(part=>part.styles.bold===true))).toBe(true)
  expect(await page.evaluate(()=>window.editor.getBlock('other').content[0].text)).toBe('另一段保持不变。')
  await page.getByRole('button',{name:'已解决',exact:true}).click();await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(0)
  expect(await page.evaluate(()=>window.noteDoc.getMap('note-challenge').get('level'))).toBe(2)
  expect(await page.evaluate(()=>window.noteDoc.getMap('threads').size)).toBe(1)
  expect(errors).toEqual([])
 }finally{await context.close()}
},20000)
it('uses an anchored nearby bubble on narrow panes, keeps drafts on close, and rejects a late result after editing',async()=>{
 const{context,page,errors}=await fixture(980);try{
  await enable(page);await page.locator('.bn-editor').click();await page.evaluate(()=>window.editor.setTextCursorPosition('other','end'))
  await finish(page);await expect.poll(()=>page.locator('[data-bn-thread-id]').count()).not.toBe(0)
  expect(await page.locator('.en-challenge-card').count()).toBe(0)
  await page.locator('.bn-editor [data-bn-thread-id]').first().click();await page.locator('.en-challenge-card').waitFor();await page.evaluate(()=>document.querySelector('.en-root').dataset.dark='true');await page.screenshot({path:'/tmp/notes-challenge-narrow-dark-20261021.png'})
  const input=page.getByRole('textbox',{name:'回复AI挑战'});await input.fill('保留这份回复草稿。');await page.getByRole('button',{name:'收起挑战评论'}).click();await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(0)
  await page.locator('.bn-editor [data-bn-thread-id]').first().click();await expect.poll(()=>input.inputValue()).toBe('保留这份回复草稿。')
  await page.getByRole('button',{name:'AI优化',exact:true}).click();await expect.poll(()=>page.evaluate(()=>Object.keys(window.jobs).length)).toBe(2)
  await page.evaluate(()=>window.editor.updateBlock('p',{content:'我刚改成了新的结论。'}));await finish(page,{version:1,issues:[],coveredBlockIds:[],checks:[],reply:{text:'旧建议',replacement:'程度'}})
  expect(await page.evaluate(()=>window.editor.getBlock('p').content[0].text)).toBe('我刚改成了新的结论。')
  expect(errors).toEqual([])
 }finally{await context.close()}
},20000)

it('preserves native manual comments and restores challenge preferences, anchors and reply drafts from the saved Yjs document',async()=>{
 const{context,page,errors}=await fixture();try{
  await enable(page);await finish(page);await page.locator('.en-challenge-card').waitFor()
  await page.getByRole('textbox',{name:'回复AI挑战'}).fill('未发送的讨论草稿。')
  await expect.poll(()=>page.evaluate(()=>!!window.saved?.yjs)).toBe(true)
  await page.waitForTimeout(850);await page.evaluate(()=>window.remount())
  await page.getByRole('button',{name:'挑战模式，当前标准'}).waitFor()
  await expect.poll(()=>page.getByRole('textbox',{name:'回复AI挑战'}).inputValue()).toBe('未发送的讨论草稿。')
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe('这项结论的成度较高。')
  await page.evaluate(()=>{window.challenge.setLevel(0);window.editor.setSelection('p','other');window.editor.getExtension(window.CommentsExtension).startPendingComment()})
  const manual=page.locator('.bn-thread .bn-editor');await manual.waitFor();await manual.fill('用户原生手动评论');await manual.press('Enter')
  await expect.poll(()=>page.evaluate(()=>[...window.noteDoc.getMap('threads').values()].length)).toBe(2)
  expect(await page.evaluate(()=>[...window.noteDoc.getMap('threads').values()].filter(t=>!t.get('metadata')?.kind).length)).toBe(1)
  expect(errors).toEqual([])
 }finally{await context.close()}
},20000)
it('keeps every comment reachable in a scrolling wide gutter and keeps prior discussions readable when automatic challenge is off',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.editor.replaceBlocks(window.editor.document,Array.from({length:5},(_,i)=>({id:'item'+i,type:'paragraph',content:'研究判断'+i+'仍需依据。'}))))
  await enable(page)
  await finish(page,{version:1,issues:Array.from({length:5},(_,i)=>({blockId:'item'+i,quote:'研究判断'+i,category:'question',message:'什么证据支持这项判断？',evidence:[]})),coveredBlockIds:Array.from({length:5},(_,i)=>'item'+i),checks:[]})
  await expect.poll(()=>page.locator('.en-challenge-card').count()).toBe(5)
  const gutter=page.locator('.en-challenge-comments');await gutter.hover({position:{x:4,y:16}});await page.mouse.wheel(0,700);await expect.poll(()=>gutter.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);await gutter.evaluate(el=>el.scrollTop=el.scrollHeight)
  const end=await page.locator('.en-challenge-card').last().boundingBox(),outer=await gutter.boundingBox();expect(end.y+end.height).toBeLessThanOrEqual(outer.y+outer.height+1)
  await page.evaluate(()=>window.challenge.setLevel(0));expect(await page.locator('.en-challenge-card').count()).toBe(5)
  expect(await page.getByRole('button',{name:'挑战模式，当前关闭'}).count()).toBe(1)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('continues a discussion after a long explicit optimization, bounds recent message history, and leaves oversized replacements unapplied',async()=>{
 const{context,page,errors}=await fixture();try{
  await enable(page);await finish(page);await page.locator('.en-challenge-card').waitFor()
  await page.getByRole('button',{name:'AI优化',exact:true}).click();await expect.poll(()=>page.evaluate(()=>Object.keys(window.jobs).length)).toBe(2)
  const replacement='更完整的研究表达。'.repeat(300)
  await finish(page,{version:1,issues:[],coveredBlockIds:[],checks:[],reply:{text:'已按原意优化表达。',replacement}})
  await page.getByRole('button',{name:'替换到原文',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.challenge.threads[0].metadata.issue.quote.length)).toBe(replacement.length)
  await page.evaluate(async()=>{const c=window.editor.getExtension(window.CommentsExtension),thread=window.challenge.threads[0];for(let i=0;i<8;i++)await c.threadStore.addComment({threadId:thread.id,comment:{body:[{type:'paragraph',content:[{type:'text',text:'旧的完整讨论内容。'.repeat(350),styles:{}}]}]}})})
  await page.getByRole('textbox',{name:'回复AI挑战'}).fill('请保留研究观点。');await page.getByRole('button',{name:'发送挑战回复'}).click();await expect.poll(()=>page.evaluate(()=>Object.keys(window.jobs).length)).toBe(3)
  const input=await page.evaluate(()=>Object.values(window.jobs).at(-1).input.thread);expect(input.quote).toBe(replacement);expect(JSON.stringify(input).length).toBeLessThanOrEqual(16000);expect(input.messages.at(-1).text).toBe('请保留研究观点。')
  await finish(page,{version:1,issues:[],coveredBlockIds:[],checks:[],reply:{text:'保留原有研究立场。'}})
  await expect.poll(()=>page.getByRole('button',{name:'AI优化',exact:true}).isEnabled()).toBe(true)
  await page.evaluate(replacement=>window.editor.updateBlock('p',{content:'前文'.repeat(4400)+replacement}),replacement);await page.locator('.en-document-scroll').evaluate(el=>el.scrollTop=el.scrollHeight)
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  await page.locator('.en-document-scroll').evaluate(el=>{const card=document.querySelector('.en-challenge-card').getBoundingClientRect(),area=document.querySelector('.en-main').getBoundingClientRect();el.scrollTop+=card.top-area.top-36})
  // An ordinary edit invalidates the old source snapshot; it must not issue call 4.
  await page.getByRole('button',{name:'AI优化',exact:true}).click()
  await expect.poll(()=>page.locator('.en-challenge-text').last().textContent()).toContain('正文已变化')
  expect(await page.evaluate(()=>Object.keys(window.jobs).length)).toBe(3)
  // Prepare a fresh anchored source fixture for the paragraph-capacity branch.
  // The sentence boundary keeps the editing scope bounded while the surrounding
  // paragraph remains close to 12000; refresh metadata, rather than bypassing the guard.
  await page.evaluate(replacement=>{const sourceText='前文'.repeat(4400)+'。'+replacement;window.editor.updateBlock('p',{content:sourceText});const thread=window.noteDoc.getMap('threads').get(window.challenge.threads[0].id);thread.set('metadata',{...thread.get('metadata'),sourceText})},replacement)
  await page.getByRole('button',{name:'AI优化',exact:true}).click();await expect.poll(()=>page.evaluate(()=>Object.keys(window.jobs).length)).toBe(4)
  const before=await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))
  await finish(page,{version:1,issues:[],coveredBlockIds:[],checks:[],reply:{text:'较长建议',replacement:'更多表达。'.repeat(1100)}})
  await expect.poll(()=>page.locator('.en-challenge-text').last().textContent()).toContain('本次未替换原文')
  expect(await page.evaluate(()=>window.editor.getBlock('p').content.map(c=>c.text).join(''))).toBe(before)
  expect(errors).toEqual([])
 }finally{await context.close()}
},20000)
