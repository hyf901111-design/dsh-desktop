import{readFile,mkdir,writeFile}from'node:fs/promises'
import{spawnSync}from'node:child_process'
import{pathToFileURL}from'node:url'
import{build}from'esbuild'
import{beforeAll,afterAll,expect,it}from'vitest'
import{annotationInputBrowser}from'./fixtures/pptx-annotation-input-browser.js'
let browser,script,sources,nativeCss,referenceCss
beforeAll(async()=>{
 const base=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),child=spawnSync(process.execPath,['--input-type=module','-e',`import{patchFigmaInlineReferences}from'./scripts/lib/figma-inline-references-client.mjs';import{patchPptxAnnotationInput}from'./scripts/lib/pptx-annotation-native.mjs';process.stdin.setEncoding('utf8');let source='';for await(const chunk of process.stdin)source+=chunk;process.stdout.write(patchPptxAnnotationInput(patchFigmaInlineReferences(source)));`],{input:base,encoding:'utf8',maxBuffer:32*1024*1024});if(child.status!==0)throw Error(child.stderr)
 let conversation=child.stdout;const start=conversation.indexOf('/* sherlock:pptx-annotation-input:install:v1 */'),end=conversation.indexOf('\n',conversation.indexOf('ctx.inject(["inputTriggers"]',start)),hook=conversation.slice(start,end)
 conversation=conversation.replace('exports.apply = apply;','exports.apply = apply;exports.__InputBar=InputBar;exports.__Header=ConversationSessionHeader;exports.__InputHub=InputHub;exports.__Conversation=ConversationController;exports.__annotationHook=(ctx,sessions,inputHub)=>{'+hook+'};')
 sources={conversation,runtime:await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'),connection:await readFile('node_modules/@deepseek-ai/dsh-client-connection/lib/client.js','utf8')}
 nativeCss=[...conversation.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1])).filter(css=>css.includes('.uV2eYG_chip')).join('\n');referenceCss=await readFile('src/preload/figma-inline-references.css','utf8')
 script=(await build({stdin:{contents:annotationInputBrowser,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(()=>browser?.close())
async function fixture(options={}){
 const width=options.width??700,page=await browser.newPage({viewport:{width:Math.max(500,width+48),height:850}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://annotation.local/**',route=>route.fulfill({contentType:'text/html',body:`<html><head><style>${options.layout?nativeCss+'\n'+referenceCss:''}body{margin:24px;--dsw-font-family:system-ui;--dsh-composer-side-clearance:0;--dsh-composer-card-max-width:${width}px;background:${options.dark?'#202020':'#fff'};color:${options.dark?'#eee':'#222'}}.pI_x6G_centerCol{position:relative;width:${width}px;height:800px}.uV2eYG_root{width:${width}px}${options.layout?'.uV2eYG_card{font:16px/24px system-ui;padding:12px}.uV2eYG_grow{width:100%}':'textarea{min-height:100px}'}</style></head><body ${options.dark?'data-ds-dark-theme':''}><div class="pI_x6G_centerCol"><div id="root"></div></div></body></html>`}));await page.goto('https://annotation.local')
 await page.evaluate(()=>{window.__ModuleLoader__={load:descriptor=>window.lastDescriptor=descriptor}})
 for(const name of['runtime','connection','conversation']){await page.addScriptTag({content:sources[name]});await page.evaluate(name=>window[name+'Descriptor']=window.lastDescriptor,name)}
 await page.addScriptTag({content:script});try{await page.locator('.uV2eYG_root textarea').waitFor({state:'visible',timeout:4000});await page.evaluate(()=>window.probe.seed())}catch(reason){const info=await page.evaluate(()=>({views:probe.views,input:document.querySelector('.uV2eYG_root textarea')&&{disabled:document.querySelector('textarea').disabled,readOnly:document.querySelector('textarea').readOnly}}));throw Error(JSON.stringify({errors,info})+' '+reason.message)}return{page,errors,async close(){await page.evaluate(()=>window.probe.unmount());await page.close()}}
}
it.each([{width:700,dark:false},{width:400,dark:true}])('paints each real InputHub pin beside its remark with consecutive native line spacing at $width px / dark=$dark',async options=>{
 const f=await fixture({...options,layout:true});try{const{page}=f;await page.evaluate(async()=>{await probe.add('标题改为长期价值📈');await probe.add('补充风险说明',1)})
 await expect.poll(()=>page.locator('[data-figma-inline-ready]').count()).toBe(1)
 const measure=()=>page.evaluate(()=>{
  const root=document.querySelector('.uV2eYG_root'),backdrop=root.querySelector('.uV2eYG_backdrop'),lineHeight=parseFloat(getComputedStyle(root.querySelector('textarea')).lineHeight),remarks=['标题改为长期价值📈','补充风险说明']
  const rects=remarks.map((remark,index)=>{const walker=document.createTreeWalker(backdrop,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode()){const at=text.textContent.indexOf(remark);if(at<0)continue;const range=document.createRange();range.setStart(text,at);range.setEnd(text,at+1);const r=range.getBoundingClientRect(),chip=root.querySelectorAll('[data-reference-source="pptx-annotation"] .uV2eYG_chipLabel')[index].getBoundingClientRect();return{label:{x:chip.x,y:chip.y,width:chip.width,height:chip.height},text:{x:r.x,y:r.y,width:r.width,height:r.height}}}throw Error('remark text not rendered')})
  return{lineHeight,rects,draft:probe.getState().draft}
 })
 const stem=(process.env.PPT_ANNOTATION_INLINE_PHASE??'current')+'-native-'+options.width+'-'+(options.dark?'dark':'light');await mkdir('/tmp/ppt-annotation-inline-20261026',{recursive:true});await writeFile('/tmp/ppt-annotation-inline-20261026/'+stem+'.json',JSON.stringify(await measure(),null,2));await page.locator('.uV2eYG_card').screenshot({path:'/tmp/ppt-annotation-inline-20261026/'+stem+'.png'})
 await expect.poll(async()=>{const value=await measure();return value.rects.every(({label,text})=>Math.abs(label.y+label.height/2-text.y-text.height/2)<3&&text.x>=label.x+label.width-1)}).toBe(true)
 const value=await measure();expect(Math.abs(value.rects[1].label.y-value.rects[0].label.y-value.lineHeight)).toBeLessThan(1)
 expect(value.draft).toContain('\uFFFC 标题改为长期价值📈\n\uFFFC 补充风险说明\n');expect(value.draft).toContain('整体要求📌保留')
 await page.locator('[data-reference-source="pptx-annotation"]').first().click();await page.locator('.uV2eYG_root textarea').press('Backspace')
 await expect.poll(()=>page.evaluate(()=>probe.getState().draft)).toBe(value.draft.replace('\uFFFC 标题改为长期价值📈\n',''))
 expect(await page.evaluate(()=>probe.ranges().map(range=>range.comment))).toEqual(['补充风险说明'])
 await page.locator('.uV2eYG_root textarea').press('Control+z');await expect.poll(()=>page.evaluate(()=>probe.getState().draft)).toBe(value.draft)
 expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('writes a new empty remark by clicking beside its actual inline pin without selecting a synthetic range',async()=>{
 const f=await fixture({width:700,layout:true});try{const{page}=f;await page.evaluate(async()=>{document.activeElement?.blur();await probe.add('')});await expect.poll(()=>page.locator('[data-figma-inline-ready]').count()).toBe(1)
 const input=page.locator('.uV2eYG_root textarea'),initial=await input.evaluate(el=>{el.focus();return{active:document.activeElement===el,selection:[el.selectionStart,el.selectionEnd],range:probe.ranges()[0],draft:probe.getState().draft}})
 const label=await page.locator('[data-reference-source="pptx-annotation"] .uV2eYG_chipLabel').boundingBox(),box=await input.boundingBox();expect(label).toBeTruthy();expect(box).toBeTruthy()
 await input.click({position:{x:label.x+label.width+8-box.x,y:label.y+label.height/2-box.y}})
 const clicked=await input.evaluate(el=>[el.selectionStart,el.selectionEnd]);expect(clicked).toEqual([initial.range.start,initial.range.start])
 await page.keyboard.insertText('写的不错');await expect.poll(()=>page.evaluate(()=>probe.getState().marks[0].comment)).toBe('写的不错')
 expect((await page.evaluate(()=>probe.getState())).draft).toContain('\uFFFC 写的不错\n')
 await mkdir('/tmp/ppt-annotation-inline-20261026',{recursive:true});await writeFile('/tmp/ppt-annotation-inline-20261026/empty-comment-caret.json',JSON.stringify({initial,clicked,final:await page.evaluate(()=>probe.getState())},null,2));expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
async function rejectSkillForChangedDraft(page){
 await page.evaluate(async()=>{await probe.add('保持图表');probe.deferSkillCatalog=true})
 await page.locator('button.uV2eYG_primary').click();await expect.poll(()=>page.evaluate(()=>probe.skillCatalogWaiting)).toBe(true)
 await page.locator('.uV2eYG_root textarea').evaluate(el=>{el.focus();el.setSelectionRange(el.value.length,el.value.length)});await page.keyboard.insertText('用户后写的全局要求')
 await page.evaluate(()=>{probe.deferSkillCatalog=false;probe.releaseSkillCatalog()});await expect.poll(()=>page.evaluate(()=>probe.notice()?.text)).toBe('草稿已变化，未自动加入技能。')
 expect(await page.getByText('草稿已变化，未自动加入技能。',{exact:true}).isVisible()).toBe(true)
 expect(await page.evaluate(()=>({prepares:probe.prepares.length,requests:probe.requests.length}))).toEqual({prepares:0,requests:0})
}
it('clears its old skill CAS notice only after a later explicit native send prepares successfully',async()=>{
 const f=await fixture();try{const{page}=f;await rejectSkillForChangedDraft(page);await page.locator('button.uV2eYG_primary').click();await expect.poll(()=>page.evaluate(()=>probe.binds.length)).toBe(1)
 await expect.poll(()=>page.evaluate(()=>probe.notice())).toBeNull();expect(await page.getByText('草稿已变化，未自动加入技能。',{exact:true}).count()).toBe(0)
 const sent=await page.evaluate(()=>({requests:probe.requests,compose:probe.compose,state:probe.getState()}));expect(sent.requests).toHaveLength(1);expect(sent.requests[0].method).toBe('session.prompt');const text=sent.requests[0].payload.content.find(value=>value.type==='text').text;expect(text).toContain('用户后写的全局要求');expect(text).toContain('/ework-skill-180a6a3f86f8942e');expect(text).toContain('原附件：file.pdf');expect(sent.state.marks[0].comment).toBe('保持图表');expect(sent.state.draft).toBe('');expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('keeps a new prepare failure visible and clears it after an explicit send with the existing PPT skill succeeds',async()=>{
 const f=await fixture();try{const{page}=f;await rejectSkillForChangedDraft(page);await page.evaluate(()=>probe.prepareError='本轮标注快照准备失败。');await page.locator('button.uV2eYG_primary').click();await expect.poll(()=>page.evaluate(()=>probe.notice()?.text)).toBe('本轮标注快照准备失败。')
 expect(await page.getByText('本轮标注快照准备失败。',{exact:true}).isVisible()).toBe(true);const rejected=await page.evaluate(()=>({state:probe.getState(),requests:probe.requests}));expect(rejected.requests).toEqual([]);expect(rejected.state.draft).toContain('用户后写的全局要求');expect(rejected.state.occurrences.filter(value=>value.source==='ework-managed-skill'&&JSON.parse(value.ref).id==='builtin:efund-ppt-maker')).toHaveLength(1)
 await page.evaluate(()=>probe.prepareError=null);await page.locator('button.uV2eYG_primary').click();await expect.poll(()=>page.evaluate(()=>probe.binds.length)).toBe(1);await expect.poll(()=>page.evaluate(()=>probe.notice())).toBeNull();expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('does not clear a newer unrelated native error when the pending annotation preparation succeeds',async()=>{
 const f=await fixture();try{const{page}=f;await rejectSkillForChangedDraft(page);await page.evaluate(()=>probe.deferPrepare=true);await page.locator('button.uV2eYG_primary').click();await expect.poll(()=>page.evaluate(()=>probe.prepareWaiting)).toBe(true)
 await page.evaluate(()=>{probe.notify('error','当前附件已失效。');probe.releasePrepare()});await expect.poll(()=>page.evaluate(()=>probe.binds.length)).toBe(1);expect(await page.evaluate(()=>probe.notice()?.text)).toBe('当前附件已失效。');expect(await page.getByText('当前附件已失效。',{exact:true}).isVisible()).toBe(true);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('uses the real ordinary InputBar for two-page remarks, native tag deletion and one undo while keeping other references',async()=>{
 const f=await fixture();try{const{page}=f;await page.evaluate(async()=>{await probe.add('第一页意见');await probe.add('第二页意见',1)});const state=await page.evaluate(()=>probe.getState());expect(state.occurrences.map(value=>value.source)).toEqual(['ework-managed-skill','chat-file','pptx-annotation','pptx-annotation']);expect(state.draft).toContain('整体要求📌保留')
 const target=await page.evaluate(()=>{const range=probe.ranges()[0],el=document.querySelector('.uV2eYG_root textarea');el.focus();el.setSelectionRange(range.tagOffset,range.tagOffset+1);el.dispatchEvent(new Event('select',{bubbles:true}));return range});await page.keyboard.press('Backspace');await expect.poll(()=>page.evaluate(()=>probe.getState().occurrences.length)).toBe(3);expect((await page.evaluate(()=>probe.getState())).draft).not.toContain('第一页意见');await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>probe.getState().occurrences.length)).toBe(4);expect((await page.evaluate(()=>probe.ranges()[0])).blockStart).toBe(target.blockStart);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('tracks an initially empty remark through actual Chromium IME and persists only the committed Chinese text',async()=>{
 const f=await fixture();try{const{page}=f;await page.evaluate(()=>probe.add(''));await page.evaluate(()=>{const r=probe.ranges()[0],el=document.querySelector('.uV2eYG_root textarea');el.focus();el.setSelectionRange(r.start,r.end);probe.comments.length=0});const cdp=await page.context().newCDPSession(page);await cdp.send('Input.imeSetComposition',{text:'zhong',selectionStart:5,selectionEnd:5});expect(await page.evaluate(()=>probe.comments)).toEqual([]);await cdp.send('Input.insertText',{text:'中文📈'});await expect.poll(()=>page.evaluate(()=>probe.getState().marks[0].comment)).toBe('中文📈');expect(await page.evaluate(()=>probe.comments)).toEqual(['中文📈']);expect((await page.evaluate(()=>probe.getState())).draft).toContain('整体要求📌保留');expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('adds the actual managed PPT skill without replace and freezes all marks once before the real native API request',async()=>{
 const f=await fixture();try{const{page}=f;await page.evaluate(async()=>{await probe.add('保持图表');await probe.add('改第二页',1)});await page.locator('button.uV2eYG_primary').click();await expect.poll(()=>page.evaluate(()=>probe.requests.filter(value=>value.method==='session.prompt').length)).toBe(1);await expect.poll(()=>page.evaluate(()=>probe.binds.length)).toBe(1);const result=await page.evaluate(()=>({prepares:probe.prepares,compose:probe.compose,request:probe.requests.find(value=>value.method==='session.prompt'),bind:probe.binds[0],envelopes:probe.envelopes.filter(value=>value.rpcId===probe.requests.find(value=>value.method==='session.prompt').rpcId)}));expect(result.prepares).toHaveLength(1);expect(result.prepares[0].references).toHaveLength(2);expect(result.compose.commandSegment.via).toBe('menu');expect(result.compose.commandSegment.span.start).toBe(result.compose.commandSegment.span.end);expect(result.compose.prefill).toBeUndefined();expect(result.request.payload.sessionId).toBe('central');const text=result.request.payload.content.find(value=>value.type==='text').text;expect(text).toContain('/ework-skill-180a6a3f86f8942e');expect(text).toContain('/ework-skill-1111111111111111');expect(text).toContain('整体要求📌保留');expect(text).toContain('原附件：file.pdf');expect(result.bind.submissionId).toBe(result.request.rpcId);expect(result.envelopes.map(value=>value.type)).toEqual(['client-request','server-response']);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('preserves a real newer native draft when prepare finishes late and does not submit or clear it',async()=>{
 const f=await fixture();try{const{page}=f;await page.evaluate(async()=>{await probe.add('旧意见');probe.deferPrepare=true});await page.locator('button.uV2eYG_primary').click();await expect.poll(()=>page.evaluate(()=>probe.prepareWaiting)).toBe(true);await page.evaluate(()=>{const el=document.querySelector('.uV2eYG_root textarea');el.focus();el.setSelectionRange(el.value.length,el.value.length)});await page.keyboard.insertText('用户后写的新要求');await page.evaluate(()=>probe.releasePrepare());await expect.poll(()=>page.evaluate(()=>probe.cancelled.length)).toBe(1);expect(await page.evaluate(()=>probe.requests)).toEqual([]);expect((await page.evaluate(()=>probe.getState())).draft).toContain('用户后写的新要求');expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('retries a verified failed batch with new native request/output paths while leaving a later ordinary draft intact',async()=>{
 const f=await fixture();try{const{page}=f;await page.evaluate(()=>probe.add('首次冻结的意见'));await page.locator('button.uV2eYG_primary').click();await expect.poll(()=>page.evaluate(()=>probe.binds.length)).toBe(1);await expect.poll(()=>page.evaluate(()=>probe.getState().draft)).toBe('');await page.locator('.uV2eYG_root textarea').fill('后来独立写的整体需求');await page.evaluate(async()=>{probe.completionStatus='failed';await probe.handle.updateComment('mark-1','发送之后另改的意见');await probe.runtime().retry('prepared-1')});await expect.poll(()=>page.evaluate(()=>probe.requests.filter(value=>value.method==='session.prompt').length)).toBe(2);await expect.poll(()=>page.evaluate(()=>probe.binds.filter(value=>value.preparedId==='prepared-2').length)).toBe(1);const result=await page.evaluate(()=>({draft:probe.getState().draft,text:probe.requests.filter(value=>value.method==='session.prompt')[1].payload.content.find(value=>value.type==='text').text,prepares:probe.prepares,requests:probe.requests.filter(value=>value.method==='session.prompt')}));expect(result.draft).toBe('后来独立写的整体需求');expect(result.text).toContain('首次冻结的意见');expect(result.text).not.toContain('发送之后另改的意见');expect(result.text).toContain('marks/prepared-2.json');expect(result.prepares[1].retryOfPreparedId).toBe('prepared-1');expect(result.requests[0].rpcId).not.toBe(result.requests[1].rpcId);expect(result.requests.every(value=>value.method==='session.prompt')).toBe(true);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
