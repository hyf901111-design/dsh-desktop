import {esbuildRawSource} from './helpers/esbuild-raw-source.mjs'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {writeFileSync,mkdirSync,mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const selectionOutput=process.env.SHERLOCK_NOTE_SELECTION_OUTPUT_DIR||mkdtempSync(join(tmpdir(),'home-note-selection-'));mkdirSync(selectionOutput,{recursive:true})
let browser,script,css
it('selects only the unique sentence inside its unchanged paragraph and rejects ambiguous or stale text',async()=>{
 const{context,page}=await fixture();try{
  const text='前一句必须保持不变。后续将持续密切关注相关业务及各项指标的进一步变化情况。最后一句也必须保留。',sentence='后续将持续密切关注相关业务及各项指标的进一步变化情况。'
  expect(await page.evaluate(({text,sentence})=>{window.noteApi.updateText('logic',text);window.noteApi.selectParagraph('logic',text,sentence);return getSelection().toString()},{text,sentence})).toBe(sentence)
  expect(await page.evaluate(({text,sentence})=>{window.sentenceLease=window.noteApi.beginParagraphSelection('logic',text,sentence);window.sentenceLease.finish();return getSelection().toString()},{text,sentence})).toBe(sentence)
  expect(await page.evaluate(({text,sentence})=>{window.noteApi.updateText('logic',text+sentence);try{window.noteApi.selectParagraph('logic',text+sentence,sentence);return'accepted'}catch(error){return error.message}},{text,sentence})).toContain('变化')
  expect(await page.evaluate(({text,sentence})=>{try{window.noteApi.beginParagraphSelection('logic',text,sentence);return'accepted'}catch(error){return error.message}},{text,sentence})).toContain('变化')
 }finally{await context.close()}
},15000)
it('expires its read-only native tail lease after caret movement, a document edit, another run or disposal',async()=>{
 const{context,page}=await fixture();try{
  expect(await page.evaluate(()=>{window.tail=window.noteApi.prepareNative();return window.tail()})).toBe(true)
  await page.locator('[data-id="intro"] .bn-inline-content').click()
  expect(await page.evaluate(()=>window.tail())).toBe(false)
  expect(await page.evaluate(()=>{window.tail=window.noteApi.prepareNative();return window.tail()})).toBe(true)
  await page.evaluate(()=>window.noteApi.updateText('intro','用户刚修改的内容必须保留。'))
  expect(await page.evaluate(()=>window.tail())).toBe(false)
  await page.evaluate(()=>{window.tail=window.noteApi.prepareNative();document.documentElement.dataset.homeGuidePointerRun='another-run'})
  expect(await page.evaluate(()=>window.tail())).toBe(false)
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='native-note-run';window.tail=window.noteApi.prepareNative();window.noteRoot.unmount()})
  expect(await page.evaluate(()=>{try{window.tail();return false}catch(error){return error.name==='AbortError'}})).toBe(true)
 }finally{await context.close()}
},15000)
it('opens the actual slash suggestion from an owned empty paragraph and rejects a nonempty or expired editor',async()=>{
 const{context,page}=await fixture();try{
  await page.evaluate(()=>{window.noteApi.appendBlock({id:'slash-tail',type:'paragraph',content:''});window.noteApi.prepareNative();window.noteApi.typeSlash()})
  await expect.poll(()=>page.locator('[data-id="slash-tail"] .bn-inline-content').textContent()).toBe('/')
  await expect.poll(()=>page.getByRole('listbox',{name:'笔记斜杠菜单'}).count()).toBe(1)
  await page.keyboard.press('Escape')
  expect(await page.evaluate(()=>{try{window.noteApi.typeSlash();return false}catch{return true}})).toBe(true)
  await page.evaluate(()=>{window.noteApi.appendBlock({id:'empty-again',type:'paragraph',content:''});window.noteApi.prepareNative();document.documentElement.dataset.homeGuidePointerRun='foreign-run'})
  expect(await page.evaluate(()=>{try{window.noteApi.typeSlash();return false}catch{return true}})).toBe(true)
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='native-note-run';window.oldApi=window.noteApi;window.noteRoot.unmount()})
  expect(await page.evaluate(()=>{try{window.oldApi.typeSlash();return false}catch{return true}})).toBe(true)
 }finally{await context.close()}
},15000)
beforeAll(async()=>{
 const built=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from'react';import{createRoot}from'react-dom/client';import{NotesApp}from'./src/preload/notes/editor';import{createHomeGuidePointer}from'./src/preload/home-guide-pointer';
 import'@blocknote/mantine/style.css';import'./src/preload/notes/style.css';import'./src/preload/notes/challenge.css';
 import'./src/preload/home-guides.css';
 document.documentElement.dataset.homeGuidePointerRun='native-note-run';window.events=[];window.requests=[];window.results=[];
 for(const name of ['notes-composer-state','notes-composer-draft','notes-submit-accepted','notes-task-state','notes-reference-state'])document.addEventListener('sherlock:'+name,event=>window.events.push({name,detail:event.detail}));
 const bridge={request:async(method,input)=>{window.requests.push({method,input});if(method==='load')return{saved:{title:'',blocks:[],yjs:'',revision:0,updatedAt:0}};if(method==='save')return{status:'saved',saved:{...input.content,revision:input.revision+1}};if(method==='generate')return new Promise(resolve=>window.results.push({resolve,input}));return{}},draft:async()=>{}};
 window.noteRoot=createRoot(document.querySelector('#note'));window.noteRoot.render(<NotesApp sessionId='native-note-session' bridge={bridge} dark={false} navigate={()=>{}} guide={{native:{runId:'native-note-run'},ready:api=>window.noteApi=api,dispose:()=>window.noteApi=undefined}}/>);
 window.submitNative=(prompt='请整理专业研究摘要。',sessionId='native-note-session')=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId,prompt,images:[],submissionId:window.requests.length,admission:{draft:prompt,draftRev:1,imageIds:[]}}}));
 window.selectionPoint=offset=>{const root=document.querySelector('[data-id="logic"] .bn-inline-content'),walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while(node=walk.nextNode()){if(offset<node.length){const range=document.createRange();range.setStart(node,offset);range.setEnd(node,Math.min(node.length,offset+1));const box=range.getBoundingClientRect();return{x:box.left+Math.min(1,box.width/4),y:box.top+box.height/2}}offset-=node.length}throw Error('selection point missing')};
 window.dragSelection=()=>{const text=document.querySelector('[data-id="logic"] .bn-inline-content').textContent,range=document.createRange();range.selectNodeContents(document.querySelector('[data-id="logic"] .bn-inline-content'));const boxes=[...range.getClientRects()].filter(r=>r.width&&r.height),start=boxes[0],end=boxes.at(-1),anchor=point=>{const node=document.createElement('span');node.style.cssText='position:fixed;width:2px;height:2px;left:'+point.x+'px;top:'+point.y+'px';document.body.append(node);return node},from=anchor({x:start.left,y:start.top+start.height/2}),to=anchor({x:end.right-2,y:end.top+end.height/2});let lease,gate;window.selectionSamples=[];window.selectionAbort=new AbortController();window.selectionPause=()=>gate=new Promise(resolve=>window.selectionResume=()=>{gate=undefined;resolve()});window.selectionPointer=createHomeGuidePointer(document,{runId:'native-note-run',signal:window.selectionAbort.signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),waitUntilPlaying:()=>gate||Promise.resolve()});window.selectionAction=window.selectionPointer.perform({target:to,fromTarget:from,action:'drag',onFrame:frame=>{if(frame.phase==='pressed')lease=window.noteApi.beginParagraphSelection('logic',text);if(lease&&['pressed','dragging','released'].includes(frame.phase)){lease.updateAt(frame);window.selectionSamples.push({...frame,text:getSelection().toString(),rects:[...getSelection().getRangeAt(0).getClientRects()].filter(r=>r.width>0).length})}}}).then(()=>{lease.finish();window.selectionDone=true},error=>{lease?.cancel();window.selectionError=error.message}).finally(()=>{from.remove();to.remove();window.selectionPointer.dispose()})};
 `},plugins:[esbuildRawSource()],bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'}})
 script=built.outputFiles.find(file=>file.path.endsWith('.js')).text;css=built.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(){
 const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(3500);page.on('pageerror',error=>errors.push(error.message))
 await page.route('http://127.0.0.1/note-native-guide',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><body data-workspace-surface="notes"><section class="en-root" style="left:0;right:340px;top:0;bottom:0"><div id="note" class="en-editor-host"></div></section>'}))
 await page.goto('http://127.0.0.1/note-native-guide');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.waitForFunction(()=>window.noteApi)
 await page.evaluate(()=>window.noteApi.setDocument('研究笔记',[{id:'intro',type:'paragraph',content:'原文摘要必须保留。'},{id:'logic',type:'paragraph',content:'订单增长不能保证利润翻倍，仍需验证产品价格和回款。'}]))
 return{context,page,errors}
}
it('admits its native composer only for its explicit run and appends the actual generated preview',async()=>{
 const{context,page,errors}=await fixture();try{
  await expect.poll(()=>page.evaluate(()=>window.events.some(event=>event.name==='notes-composer-state'&&event.detail.ready))).toBe(true)
  await page.evaluate(()=>{window.noteApi.prepareNative();window.submitNative('其他会话','another-session');window.submitNative()})
  await expect.poll(()=>page.evaluate(()=>window.results.length)).toBe(1)
  expect(await page.evaluate(()=>window.results[0].input)).toMatchObject({sessionId:'native-note-session',selection:'',context:{scope:'note',components:[]}})
  expect(await page.evaluate(()=>window.results[0].input.markdown)).toContain('原文摘要必须保留')
  await page.evaluate(()=>window.results[0].resolve({kind:'text',markdown:'### 专业研究摘要\n\n跟踪订单转化、毛利率与经营现金流，逐季核验盈利兑现。'}))
  await page.getByRole('button',{name:'添加至正文',exact:true}).click();await page.evaluate(()=>window.noteApi.flush())
  const saved=await page.evaluate(()=>window.requests.findLast(row=>row.method==='save').input.content)
  expect(JSON.stringify(saved.blocks)).toContain('原文摘要必须保留');expect(JSON.stringify(saved.blocks)).toContain('跟踪订单转化');expect(saved.yjs.length).toBeGreaterThan(100)
  expect(await page.evaluate(()=>window.events.filter(event=>event.name==='notes-task-state').map(event=>event.detail.phase))).toEqual(['preparing','generating','ready','accepted']);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('uses the real paragraph selection and AI rewrite control before replacing only that paragraph',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.noteApi.selectParagraph('logic','订单增长不能保证利润翻倍，仍需验证产品价格和回款。'))
  // The tutorial's visual pointer acknowledges a target, then its actor calls
  // that native button once; it never synthesizes an OS pointer drag.
  await page.getByRole('button',{name:'AI 改写',exact:true}).evaluate(button=>{button.click();button.focus({preventScroll:true})})
  expect(await page.evaluate(()=>window.events.findLast(event=>event.name==='notes-composer-draft').detail.text)).toContain('改写选中文字')
  await page.evaluate(()=>window.submitNative('改写选中文字，保留原意并让表达更清晰。'))
  await expect.poll(()=>page.evaluate(()=>window.results.length)).toBe(1)
  expect(await page.evaluate(()=>window.results[0].input)).toMatchObject({selection:'订单增长不能保证利润翻倍，仍需验证产品价格和回款。',markdown:'',context:{scope:'selection',components:[]}})
  await page.evaluate(()=>window.results[0].resolve({kind:'text',markdown:'订单增长为收入扩张提供线索，利润兑现仍取决于价格、毛利率与回款质量。'}))
  await page.getByRole('button',{name:'替换所选',exact:true}).click();await page.evaluate(()=>window.noteApi.flush())
  expect(await page.locator('[data-id="intro"] .bn-inline-content').innerText()).toBe('原文摘要必须保留。')
  expect(await page.locator('[data-id="logic"] .bn-inline-content').innerText()).toBe('订单增长为收入扩张提供线索，利润兑现仍取决于价格、毛利率与回款质量。');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('matches a targeted stop to the current semantic request while preserving the ordinary Stop action',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{window.noteApi.prepareNative();window.submitNative()});await expect.poll(()=>page.evaluate(()=>window.results.length)).toBe(1)
  const first=await page.evaluate(()=>window.results[0].input.requestId)
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-stop',{detail:{sessionId:'native-note-session',requestId:'other-request'}})))
  expect(await page.evaluate(()=>window.requests.filter(row=>row.method==='stop').length)).toBe(0)
  await page.evaluate(requestId=>document.dispatchEvent(new CustomEvent('sherlock:notes-stop',{detail:{sessionId:'native-note-session',requestId}})),first)
  await expect.poll(()=>page.evaluate(()=>window.requests.filter(row=>row.method==='stop').length)).toBe(1)
  await page.evaluate(()=>window.submitNative('新的笔记需求'));await expect.poll(()=>page.evaluate(()=>window.results.length)).toBe(2)
  await page.evaluate(requestId=>document.dispatchEvent(new CustomEvent('sherlock:notes-stop',{detail:{sessionId:'native-note-session',requestId}})),first)
  expect(await page.evaluate(()=>window.requests.filter(row=>row.method==='stop').length)).toBe(1)
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-stop',{detail:{sessionId:'native-note-session'}})))
  await expect.poll(()=>page.evaluate(()=>window.requests.filter(row=>row.method==='stop').length)).toBe(2)
  expect(await page.evaluate(()=>window.events.filter(row=>row.name==='notes-task-state'&&row.detail.phase==='stopped').map(row=>row.detail.requestId))).toEqual(await page.evaluate(()=>window.results.map(row=>row.input.requestId)))
  await page.evaluate(()=>window.results.forEach(row=>row.resolve({kind:'text',markdown:'取消后的旧结果不得写入'})));await page.waitForTimeout(50)
  expect(await page.locator('.bn-editor').innerText()).not.toContain('取消后的旧结果');expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('rejects stale paragraph text and a replaced run without moving or editing its document',async()=>{
 const{context,page,errors}=await fixture();try{
  const before=await page.evaluate(()=>JSON.stringify(window.noteApi.snapshot().blocks))
  expect(await page.evaluate(()=>{try{window.noteApi.selectParagraph('logic','旧版本原文');return'accepted'}catch(error){return error.message}})).toContain('变化')
  await page.evaluate(()=>document.documentElement.dataset.homeGuidePointerRun='newer-run')
  expect(await page.evaluate(()=>{try{window.noteApi.prepareNative();return'accepted'}catch(error){return error.name}})).toBe('AbortError')
  await page.evaluate(()=>window.submitNative());await page.waitForTimeout(100)
  expect(await page.evaluate(()=>window.results.length)).toBe(0);expect(await page.evaluate(()=>JSON.stringify(window.noteApi.snapshot().blocks))).toBe(before);expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('keeps newer user edits when an older generated suggestion is applied',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{window.noteApi.selectParagraph('logic','订单增长不能保证利润翻倍，仍需验证产品价格和回款。');window.submitNative()})
  await expect.poll(()=>page.evaluate(()=>window.results.length)).toBe(1)
  await page.evaluate(()=>window.results[0].resolve({kind:'text',markdown:'较早生成的改写。'}));await page.locator('.en-preview').waitFor()
  await page.evaluate(()=>window.noteApi.updateText('logic','用户已经更新这一段。'))
  await page.getByRole('button',{name:'替换所选',exact:true}).click()
  expect(await page.locator('[data-id="logic"] .bn-inline-content').innerText()).toBe('用户已经更新这一段。');expect(await page.getByRole('alert').innerText()).toContain('变化');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('does not surface a late generation after its run has been cancelled',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{window.noteApi.prepareNative();window.submitNative()});await expect.poll(()=>page.evaluate(()=>window.results.length)).toBe(1)
  await page.evaluate(()=>{delete document.documentElement.dataset.homeGuidePointerRun;window.results[0].resolve({kind:'text',markdown:'取消后不应该出现。'})});await page.waitForTimeout(100)
  expect(await page.locator('.en-preview').count()).toBe(0);expect(await page.locator('.bn-editor').innerText()).not.toContain('取消后');expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('extends a real multi-line Chinese and emoji selection with the painted drag before release',async()=>{
 const{context,page,errors}=await fixture();try{
  expect(await page.evaluate(()=>typeof window.noteApi.beginParagraphSelection)).toBe('function')
  await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:760,height:900})
  const text='订单增长📈不能保证利润翻倍，仍需验证产品价格与回款。研究员👩🏽‍💻需要逐季核验现金流，观察毛利率、合同负债与风险信号。'
  await page.evaluate(text=>{window.noteApi.setDocument('研究笔记',[{id:'intro',type:'paragraph',content:'原文摘要必须保留。'},{id:'logic',type:'paragraph',content:[{type:'text',text:text.slice(0,8),styles:{bold:true}},{type:'text',text:text.slice(8),styles:{}}]}])},text)
  await page.locator('.bn-editor').focus();await page.locator('[data-id="logic"] .bn-inline-content').scrollIntoViewIfNeeded()
  await page.evaluate(async expected=>{await document.fonts.ready;let previous='',stable=0;window.selectionPreparation=[];for(let count=0;count<120;count++){const element=document.querySelector('[data-id="logic"] .bn-inline-content'),box=element.getBoundingClientRect(),value=JSON.stringify([box.left,box.top,box.width,box.height]);window.selectionPreparation.push({value,text:element.textContent});stable=element.textContent===expected&&value===previous?stable+1:0;previous=value;if(stable>=5)return;await new Promise(requestAnimationFrame)}throw Error('拖选段落字体或几何尚未稳定')},text)
  await page.evaluate(()=>window.dragSelection())
  try{await expect.poll(()=>page.evaluate(()=>window.selectionSamples.filter(row=>row.phase==='dragging'&&row.text.length>0&&row.text.length<document.querySelector('[data-id="logic"] .bn-inline-content').textContent.length).length),{timeout:2500}).toBeGreaterThan(2)}catch(error){writeFileSync(join(selectionOutput,'selection-failure.json'),JSON.stringify(await page.evaluate(()=>({samples:window.selectionSamples,error:window.selectionError,done:window.selectionDone,focused:document.hasFocus(),reduced:matchMedia('(prefers-reduced-motion: reduce)').matches})),null,2));throw error}
  await page.evaluate(()=>{window.selectionPause()});await page.waitForTimeout(80);const paused=await page.evaluate(()=>({count:window.selectionSamples.length,text:getSelection().toString()}));await page.waitForTimeout(200);expect(await page.evaluate(()=>({count:window.selectionSamples.length,text:getSelection().toString()}))).toEqual(paused)
  await page.screenshot({path:join(selectionOutput,'selection-multiline-partial-1.png')})
  await page.evaluate(()=>window.selectionResume());await page.waitForFunction(({first,total})=>getSelection().toString().length>Math.max(first+4,total*.45)&&getSelection().toString().length<total,{first:paused.text.length,total:text.length});await page.evaluate(()=>{window.selectionPause()});await page.waitForTimeout(60);await page.screenshot({path:join(selectionOutput,'selection-multiline-partial-2.png')})
  await page.evaluate(()=>window.selectionResume());await page.evaluate(()=>window.selectionAction)
  const result=await page.evaluate(()=>({samples:window.selectionSamples,selected:getSelection().toString(),error:window.selectionError,done:window.selectionDone}));expect(result.error).toBeUndefined();expect(result.done).toBe(true);expect(result.selected).toBe(text)
  const partial=result.samples.filter(row=>row.phase==='dragging'&&row.text.length>0&&row.text.length<text.length),boundaries=new Set([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(row=>row.index));expect(new Set(partial.map(row=>row.text)).size).toBeGreaterThan(2);expect(partial.some(row=>row.rects>1)).toBe(true);expect(partial.every(row=>text.startsWith(row.text)&&boundaries.has(row.text.length))).toBe(true);expect(await page.evaluate(()=>window.results.length)).toBe(0);expect(errors).toEqual([])
  writeFileSync(join(selectionOutput,'selection-frame-samples.json'),JSON.stringify(result,null,2))
  await page.screenshot({path:join(selectionOutput,'selection-multiline-released.png')})
 }finally{await context.close()}
},15000)
it('uses viewport coordinates after scrolling and preserves a newer user selection on cancellation',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{window.noteApi.setDocument('研究笔记',[...Array.from({length:12},(_,i)=>({id:'p'+i,type:'paragraph',content:'前置内容保持。'.repeat(12)})),{id:'logic',type:'paragraph',content:'中文📈研究判断需要检查现金回款和利润质量。'},{id:'after',type:'paragraph',content:'用户新的选择必须保留。'}])})
  await page.locator('[data-id="logic"] .bn-inline-content').scrollIntoViewIfNeeded()
  const selected=await page.evaluate(()=>{window.lease=window.noteApi.beginParagraphSelection('logic','中文📈研究判断需要检查现金回款和利润质量。');window.lease.updateAt(window.selectionPoint(12));return getSelection().toString()});expect(selected.length).toBeGreaterThan(0);expect(selected.length).toBeLessThan(25)
  await page.evaluate(()=>{window.noteApi.selectParagraph('after','用户新的选择必须保留。');window.lease.cancel()});expect(await page.evaluate(()=>getSelection().toString())).toBe('用户新的选择必须保留。');expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('cancels a selection lease after document geometry changes without restoring a stale range',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{window.lease=window.noteApi.beginParagraphSelection('logic','订单增长不能保证利润翻倍，仍需验证产品价格和回款。');window.lease.updateAt(window.selectionPoint(10))})
  await page.evaluate(()=>document.querySelector('[data-id="logic"]').style.transform='translateY(40px)')
  expect(await page.evaluate(()=>{try{window.lease.updateAt(window.selectionPoint(15));return'accepted'}catch(error){window.lease.cancel();return error.message}})).toContain('变化');expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('restores only its own interrupted selection and leaves a newer outside selection and focus intact',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{window.noteApi.selectParagraph('intro','原文摘要必须保留。');window.lease=window.noteApi.beginParagraphSelection('logic','订单增长不能保证利润翻倍，仍需验证产品价格和回款。');window.lease.updateAt(window.selectionPoint(10));window.lease.cancel()});expect(await page.evaluate(()=>getSelection().toString())).toBe('原文摘要必须保留。')
  await page.evaluate(()=>{window.lease=window.noteApi.beginParagraphSelection('logic','订单增长不能保证利润翻倍，仍需验证产品价格和回款。');window.lease.updateAt(window.selectionPoint(10));const p=document.createElement('p'),button=document.createElement('button');p.id='user-selection';p.textContent='用户在其他区域的新选择';button.id='user-focus';document.body.append(p,button);button.focus();const r=document.createRange();r.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(r);window.lease.cancel()})
  expect(await page.evaluate(()=>({selected:getSelection().toString(),focus:document.activeElement.id}))).toEqual({selected:'用户在其他区域的新选择',focus:'user-focus'});expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it.each(['abort','owner','user-selection'])('keeps a user selection outside Notes when an in-flight drag loses %s',async reason=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.dragSelection())
  await expect.poll(()=>page.evaluate(()=>window.selectionSamples.filter(row=>row.phase==='dragging'&&row.text.length>0).length)).toBeGreaterThan(1)
  await page.evaluate(reason=>{const p=document.createElement('p'),button=document.createElement('button');p.textContent='用户保留的其他选择';button.id='new-focus';document.body.append(p,button);button.focus();const range=document.createRange();range.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(range);if(reason==='abort')window.selectionAbort.abort();else if(reason==='owner')document.documentElement.dataset.homeGuidePointerRun='another-run'},reason)
  await page.evaluate(()=>window.selectionAction);const final=await page.evaluate(()=>({text:getSelection().toString(),focus:document.activeElement.id,count:window.selectionSamples.length,error:window.selectionError}));expect(final).toMatchObject({text:'用户保留的其他选择',focus:'new-focus'});expect(final.error).toBeTruthy();await page.waitForTimeout(100);expect(await page.evaluate(()=>window.selectionSamples.length)).toBe(final.count);expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
