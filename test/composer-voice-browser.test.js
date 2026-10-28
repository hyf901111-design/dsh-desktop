import {beforeAll,afterAll,it,expect} from 'vitest'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
const require=createRequire(import.meta.url),{notesComposerSource}=require('../scripts/lib/notes-composer.mjs'),{patchComposerVoice}=require('../scripts/lib/composer-voice.mjs')
const evidence=process.env.SHERLOCK_COMPOSER_VOICE_EVIDENCE||'/tmp/composer-voice-20261028'
let browser,sources,script,css
beforeAll(async()=>{
 const conversation=patchComposerVoice(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__InputBar=InputBar;exports.__setNoteRecord=(id,record)=>eworkNotesInputs.set(id,record);')
 sources={conversation,runtime:await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'),commands:await readFile('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8'),triggers:(await readFile('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__Menu=MenuView;')}
 const fixture=(await readFile('test/fixtures/composer-voice-browser.tsx','utf8')).replace('/* NOTES_SOURCE */',notesComposerSource)
 script=(await build({stdin:{resolveDir:process.cwd(),contents:fixture,loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
 css=[...conversation.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1])).filter(value=>value.includes('.uV2eYG_input')).join('\n')+'\n'+await readFile('src/preload/figma-inline-references.css','utf8')
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
async function fixture(mode='conversation',dark=false,width=1050){
 const page=await browser.newPage({viewport:{width,height:760}}),errors=[],assetWarnings=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'){if(message.text().includes('ERR_INVALID_URL')&&message.location().url.startsWith('data:font/ttf;base64,'))assetWarnings.push('Existing native DshChipCell inline font unavailable in isolated fixture');else errors.push(message.text())}});page.setDefaultTimeout(3000)
 await page.route('https://composer-voice.local/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}));await page.goto('https://composer-voice.local/')
 await page.setContent('<title>原生输入框语音验证</title><meta charset="utf-8"><style>'+css+`body{margin:0;font:14px/22px system-ui;background:${dark?'#171717':'#eee'};--dsw-alias-label-primary:${dark?'#eee':'#252525'};--dsw-alias-label-secondary:#888;--dsw-specific-input-major:${dark?'#2e2e2e':'#fff'};--dsw-alias-button-info-fill:${dark?'#eee':'#333'};--dsw-alias-border-l2-darkmode-thin:#0001;--dsh-composer-side-clearance:0px;--dsh-composer-card-max-width:720px;color:${dark?'#eee':'#252525'}}.uV2eYG_root{width:100%}.uV2eYG_card{padding:12px}.uV2eYG_primary{color:${dark?'#222':'#fff'}}textarea{min-height:80px}#composer{position:fixed;left:16px;bottom:30px;width:min(720px,calc(100vw - 32px))}#menus{position:fixed;left:16px;bottom:150px;width:540px}</style><button id="outside">其它控件</button><main id="composer" data-composer-card></main><div id="menus"></div>`)
 await page.evaluate(({mode,dark})=>{window.fixtureMode=mode;window.nativeModules={};if(dark)document.body.setAttribute('data-ds-dark-theme','');if(mode==='notes'){document.body.dataset.workspaceSurface='notes';document.querySelector('#composer').dataset.eworkNotesComposerHost='native-notes'}else if(mode==='research'){document.body.dataset.workspaceSurface='research';document.querySelector('#composer').dataset.researchComposerHost=''}}, {mode,dark})
 for(const[name,source]of Object.entries(sources)){await page.evaluate(()=>window.__ModuleLoader__={load:descriptor=>window.lastDescriptor=descriptor});await page.addScriptTag({content:source});await page.evaluate(name=>window.nativeModules[name]=window.lastDescriptor,name)}
 await page.addScriptTag({content:script});await page.locator('textarea').waitFor().catch(async error=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText()})+' '+error.message)})
 return{page,errors,assetWarnings,input:page.locator('textarea'),start:()=>page.getByRole('button',{name:'语音输入',exact:true}).click(),emit:event=>page.evaluate(event=>probe.emit(event),event),close:async()=>{await page.evaluate(()=>window.probe.dispose());await page.close()}}
}
for(const mode of ['home','conversation','research','notes'])it(`dictates into the actual controlled ${mode} editor with cumulative replacements, no auto-send and an audio-driven adjacent pill`,async()=>{
 const f=await fixture(mode,true);try{
  expect(await f.page.title()).toBe('原生输入框语音验证');const other=await f.page.evaluate(()=>probe.other.snapshot)
  await f.start();expect(await f.input.evaluate(el=>document.activeElement===el)).toBe(true)
  expect(await f.page.getByRole('button',{name:'发送',exact:true}).isDisabled()).toBe(true)
  await f.emit({type:'state',state:'listening'});await f.emit({type:'partial',text:'研究'});await f.emit({type:'partial',text:'研究市场'});await f.emit({type:'partial',text:'研究市场'})
  await expect.poll(()=>f.input.inputValue()).toBe('研究市场');expect(await f.page.evaluate(()=>probe.shell.snapshot.draft)).toBe('研究市场');await expect.poll(()=>f.input.evaluate(el=>el.selectionEnd)).toBe(4)
  expect(await f.page.evaluate(()=>probe.submits)).toEqual([]);expect(await f.page.evaluate(()=>probe.other.snapshot)).toEqual(other)
  const silent=await f.page.locator('[data-composer-voice-wave] i').last().evaluate(el=>el.getBoundingClientRect().height)
  for(const level of [.15,.4,.75,.3,.8,.5,.2,.65,.4,.85])await f.emit({type:'level',level});await expect.poll(()=>f.page.locator('[data-composer-voice-wave] i').last().evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(12)
  const geometry=await f.page.evaluate(()=>{const pill=document.querySelector('[data-composer-voice-pill]').getBoundingClientRect(),send=document.querySelector('button[aria-label="发送"]').getBoundingClientRect();return{pill:{x:pill.x,y:pill.y,width:pill.width,height:pill.height,right:pill.right},send:{x:send.x,y:send.y,width:send.width,height:send.height}}})
  expect(geometry.pill.right).toBeLessThanOrEqual(geometry.send.x);expect(Math.abs(geometry.pill.y+geometry.pill.height/2-geometry.send.y-geometry.send.height/2)).toBeLessThanOrEqual(3)
  await f.page.screenshot({path:evidence+'/'+mode+'-active-dark.png'});await writeFile(evidence+'/'+mode+'-geometry.json',JSON.stringify(geometry,null,2))
  await f.emit({type:'final',text:'研究市场并保留来源'});await expect.poll(()=>f.input.inputValue()).toBe('研究市场并保留来源');expect(await f.page.locator('[data-composer-voice-pill]').count()).toBe(0);expect(await f.page.evaluate(()=>probe.submits)).toEqual([])
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('stops on the first Enter without submitting, keeps normal editing and only submits on the next Enter',async()=>{
 const f=await fixture();try{
  await f.start();await f.emit({type:'partial',text:'保留文字'});await f.input.press('Enter')
  expect(await f.page.locator('[data-composer-voice-pill]').count()).toBe(0);expect(await f.page.evaluate(()=>probe.submits)).toEqual([]);expect(await f.input.inputValue()).toBe('保留文字')
  await f.emit({type:'final',text:'迟到覆盖'});await f.input.press('Meta+ArrowRight');await f.input.press('x');expect(await f.input.inputValue()).toBe('保留文字x')
  await f.input.press('Enter');await expect.poll(()=>f.page.evaluate(()=>probe.submits.length)).toBe(1);expect(await f.page.evaluate(()=>probe.submits[0].draft)).toBe('保留文字x');expect(f.errors).toEqual([])
 }finally{await f.close()}
})
it('keeps native Shift+Enter newline editing while stopping capture',async()=>{
 const f=await fixture();try{
  await f.start();await f.emit({type:'partial',text:'正文'});await expect.poll(()=>f.input.evaluate(el=>el.selectionEnd)).toBe(2)
  await f.input.press('Shift+Enter');expect(await f.input.inputValue()).toBe('正文\n');expect(await f.page.locator('[data-composer-voice-pill]').count()).toBe(0);expect(await f.page.evaluate(()=>probe.submits)).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
})
it.each(['Meta','Control'])('stops the complete %s+Enter gesture without sending, then restores the ordinary shortcut',async modifier=>{
 const f=await fixture();try{
  await f.start();await f.emit({type:'partial',text:'组合快捷键保留文字'})
  await f.page.keyboard.press(modifier+'+Enter')
  expect(await f.page.locator('[data-composer-voice-pill]').count()).toBe(0);expect(await f.page.evaluate(()=>probe.submits)).toEqual([]);expect(await f.input.inputValue()).toBe('组合快捷键保留文字')
  await f.emit({type:'final',text:'迟到覆盖'});await f.page.keyboard.press(modifier+'+Enter')
  await expect.poll(()=>f.page.evaluate(()=>probe.submits.length)).toBe(1);expect(await f.page.evaluate(()=>probe.submits[0].draft)).toBe('组合快捷键保留文字');expect(f.errors).toEqual([])
 }finally{await f.close()}
})
it.each(['key','blur','stop','hidden','foreign-write','dispose'])('freezes the visible transcript on %s and rejects delayed partial/final callbacks',async reason=>{
 const f=await fixture('notes');try{
  await f.start();await f.emit({type:'partial',text:'已识别的要求'})
  if(reason==='key')await f.input.press('ArrowLeft')
  if(reason==='blur')await f.page.locator('#outside').click()
  if(reason==='stop'){await f.page.getByRole('button',{name:'停止语音输入',exact:true}).click();expect(await f.input.evaluate(el=>document.activeElement===el)).toBe(true)}
  if(reason==='hidden')await f.page.locator('#composer').evaluate(el=>el.hidden=true)
  if(reason==='foreign-write')await f.page.evaluate(()=>probe.shell.setDraft('新手动草稿'))
  if(reason==='dispose')await f.page.evaluate(()=>probe.dispose())
  await expect.poll(()=>f.page.evaluate(()=>probe.cancels.length)).toBeGreaterThan(0);await f.emit({type:'partial',text:'迟到部分'});await f.emit({type:'final',text:'迟到结束'})
  expect(await f.page.evaluate(()=>probe.shell.snapshot.draft)).toBe(reason==='foreign-write'?'新手动草稿':'已识别的要求');expect(await f.page.evaluate(()=>probe.submits)).toEqual([]);expect(f.errors).toEqual([])
 }finally{if(reason==='dispose')await f.page.close();else await f.close()}
})
it('does not consume IME commit and lets typing replace recognition without later overwrites',async()=>{
 const f=await fixture();try{
  await f.start();await f.emit({type:'partial',text:'组合前文'})
  const result=await f.input.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));const e=new KeyboardEvent('keydown',{key:'Enter',isComposing:true,keyCode:229,bubbles:true,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented})
  expect(result).toBe(false);expect(await f.page.locator('[data-composer-voice-pill]').count()).toBe(0);expect(await f.page.evaluate(()=>probe.submits)).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
})
it('cleans up delayed starts and keeps attachment-only send and running-task stop actions',async()=>{
 const f=await fixture();try{
  await f.page.evaluate(()=>probe.delay=true);await f.start();await f.page.getByRole('button',{name:'停止语音输入',exact:true}).click();await f.start();await f.page.evaluate(()=>probe.release());await f.page.evaluate(()=>probe.emit({type:'final',text:'过期回调'},0));expect(await f.input.inputValue()).toBe('')
  await f.page.getByRole('button',{name:'停止语音输入',exact:true}).click();await f.page.evaluate(()=>probe.attach());expect(await f.page.getByRole('button',{name:'语音输入',exact:true}).count()).toBe(0);await f.page.getByRole('button',{name:'发送',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>probe.submits.length)).toBe(1)
  await f.page.evaluate(()=>{probe.shell.pruneImages([]);probe.setRunning(true)});expect(await f.page.getByRole('button',{name:'语音输入',exact:true}).count()).toBe(0);await f.page.getByRole('button',{name:'input.stop',exact:true}).click();expect(await f.page.evaluate(()=>probe.stops)).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.close()}
})
for(const dark of [false,true])it(`fits a narrow composer in ${dark?'dark':'light'} appearance without clipping the pill or stealing pointer focus`,async()=>{
 const f=await fixture('home',dark,360);try{
  await f.page.screenshot({path:evidence+'/narrow-'+(dark?'dark':'light')+'-idle.png'});await f.start();await f.emit({type:'state',state:'listening'});await f.emit({type:'level',level:.5})
  const box=await f.page.locator('[data-composer-voice-pill]').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(360);expect(await f.input.evaluate(el=>document.activeElement===el)).toBe(true)
  await f.page.screenshot({path:evidence+'/narrow-'+(dark?'dark':'light')+'-active.png'});expect(f.errors).toEqual([])
 }finally{await f.close()}
})
