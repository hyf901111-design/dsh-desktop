import{beforeAll,afterAll,it,expect}from'vitest'
import{readFile,mkdir,writeFile}from'node:fs/promises'
import{createRequire}from'node:module'
import{pathToFileURL}from'node:url'
import{build}from'esbuild'
const require=createRequire(import.meta.url),{notesComposerSource}=require('../scripts/lib/notes-composer.mjs'),{patchPlainSlashInput}=require('../scripts/lib/plain-slash-input.mjs')
let browser,sources,script,css
beforeAll(async()=>{
 let conversation=patchPlainSlashInput(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 conversation=conversation.replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__InputBar=InputBar;exports.__setNoteRecord=(id,record)=>eworkNotesInputs.set(id,record);')
 sources={conversation,runtime:await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'),commands:await readFile('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8'),triggers:(await readFile('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')).replace('exports.apply = apply;','exports.apply = apply;exports.__Menu=MenuView;')}
 const fixture=(await readFile('test/fixtures/plain-slash-input-browser.tsx','utf8')).replace('/* NOTES_SOURCE */',notesComposerSource)
 script=(await build({stdin:{resolveDir:process.cwd(),contents:fixture,loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
 css=[...conversation.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1])).filter(value=>value.includes('.uV2eYG_input')).join('\n')+'\n'+await readFile('src/preload/figma-inline-references.css','utf8')
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(()=>browser?.close())
async function fixture(mode){
 const page=await browser.newPage({viewport:{width:1050,height:760}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(2500)
 await page.setContent('<meta charset="utf-8"><style>'+css+'body{margin:0;font:15px/24px system-ui}.uV2eYG_root{width:540px}.uV2eYG_card{padding:12px}textarea{min-height:80px}#composer{position:fixed;left:40px;bottom:30px;width:540px}#menus{position:fixed;left:40px;bottom:150px;width:540px}</style><main id="composer" data-composer-card></main><div id="menus"></div>')
 await page.evaluate(mode=>{window.fixtureMode=mode;window.nativeModules={};if(mode==='notes'){document.body.dataset.workspaceSurface='notes';document.querySelector('#composer').dataset.eworkNotesComposerHost='native-notes'}else if(mode==='research-right'){document.body.dataset.workspaceSurface='research';document.querySelector('#composer').dataset.researchComposerHost=''}},mode)
 for(const[name,source]of Object.entries(sources)){await page.evaluate(()=>window.__ModuleLoader__={load:descriptor=>window.lastDescriptor=descriptor});await page.addScriptTag({content:source});await page.evaluate(name=>window.nativeModules[name]=window.lastDescriptor,name)}
 await page.addScriptTag({content:script});await page.locator('textarea').waitFor().catch(async error=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText()})+' '+error.message)})
 await page.locator('textarea').evaluate(el=>el.addEventListener('input',event=>window.probe.inputTypes.push(event.inputType)))
 return{page,errors,input:page.locator('textarea'),close:async()=>{await page.evaluate(()=>window.probe.dispose());await page.close()}}
}
for(const mode of ['chat','reading','research-right','notes'])for(const command of ['goal','feedback'])it(`places the ${mode} native /${command} pick caret after its token and keeps deletion quiet until a new slash`,async()=>{
 const f=await fixture(mode);try{
  const other=await f.page.evaluate(()=>window.probe.other.snapshot);await f.input.fill('/');await f.page.getByRole('option',{name:new RegExp(command)}).click();await expect.poll(()=>f.input.inputValue()).toBe('/'+command+' ')
  expect(await f.input.evaluate(el=>({start:el.selectionStart,end:el.selectionEnd,focused:document.activeElement===el}))).toEqual({start:command.length+2,end:command.length+2,focused:true})
  for(let index=0;index<=command.length;index++){await f.input.press('Backspace');await expect.poll(()=>f.page.getByRole('listbox').count()).toBe(0)}
  expect(await f.input.inputValue()).toBe('/');expect(await f.page.evaluate(()=>window.probe.inputTypes.filter(type=>type==='deleteContentBackward').length)).toBe(command.length+1)
  await f.input.press('Backspace');await f.input.press('/');await f.page.getByRole('option',{name:/goal/}).waitFor();expect(await f.page.evaluate(()=>window.probe.other.snapshot)).toEqual(other);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('does not reopen command suggestions when a user Backspaces a picked command from its actual end',async()=>{
 const f=await fixture('chat');try{
  await f.input.fill('/');await f.page.getByRole('option',{name:/feedback/}).click();await expect.poll(()=>f.input.inputValue()).toBe('/feedback ');await f.input.evaluate(el=>el.setSelectionRange(el.value.length,el.value.length));await f.input.press('Backspace')
  expect(await f.input.inputValue()).toBe('/feedback');expect(await f.page.evaluate(()=>window.probe.trigger.menu.getSnapshot().open)).toBe(false)
 }finally{await f.close()}
})
for(const mode of ['chat','notes'])it(`keeps ${mode} skill/file occurrences, Unicode suffix and native undo while picking and deleting a plain command`,async()=>{
 const f=await fixture(mode);try{
  await f.page.evaluate(()=>window.probe.seedReferences());await f.input.focus();await f.input.evaluate(el=>el.setSelectionRange(1,1));await f.page.evaluate(()=>probe.shell.track(probe.shell.snapshot.draft,1));const before=await f.page.evaluate(()=>probe.shell.snapshot)
  await f.page.getByRole('option',{name:/feedback/}).click();await expect.poll(()=>f.input.inputValue()).toMatch(/^\/feedback /);expect(await f.input.evaluate(el=>el.selectionStart)).toBe(10)
  await f.input.press('Backspace');expect(await f.page.getByRole('listbox').count()).toBe(0)
  const after=await f.page.evaluate(()=>probe.shell.snapshot);expect(after.draft).toBe('/feedback'+before.draft.slice(1));expect(after.occurrences.map(({offset,...occurrence})=>occurrence)).toEqual(before.occurrences.map(({offset,...occurrence})=>occurrence));expect(after.occurrences.map(value=>value.offset)).toEqual(before.occurrences.map(value=>value.offset+8));expect(after.draft).toContain('尾文📌')
  await f.input.press('Control+z');await expect.poll(()=>f.page.evaluate(()=>probe.shell.snapshot.draft)).toBe('/feedback '+before.draft.slice(1));await f.input.press('Control+z');await expect.poll(()=>f.page.evaluate(()=>probe.shell.snapshot.draft)).toBe(before.draft);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('retains native IME Enter arbitration and only applies the later explicit pick caret',async()=>{
 const f=await fixture('chat');try{
  await f.input.fill('/');await f.page.getByRole('option',{name:/goal/}).waitFor();await f.input.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));await f.input.press('Enter')
  // Browser-only composition events do not install an OS IME to consume Enter;
  // the native guard passes it through as a newline, rather than picking/sending.
  expect(await f.input.inputValue()).toBe('/\n');expect(await f.page.evaluate(()=>probe.shell.snapshot.phase)).toBe('plain');expect(await f.page.evaluate(()=>probe.events.some(event=>event.name==='slash/input-begin-command'))).toBe(false)
  await f.input.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''})));await f.page.waitForTimeout(20);await f.input.fill('/');await f.page.getByRole('option',{name:/goal/}).click();await expect.poll(()=>f.input.inputValue()).toBe('/goal ');expect(await f.input.evaluate(el=>el.selectionStart)).toBe(6);expect(f.errors).toEqual([])
 }finally{await f.close()}
})
it('drops a command caret outcome when another native draft transaction wins before React commits',async()=>{
 const f=await fixture('chat');try{
  await f.input.fill('/');await f.page.evaluate(()=>{const shell=probe.shell,begin=shell.beginCommand.bind(shell);shell.beginCommand=(claim,span)=>{const accepted=begin(claim,span);if(accepted)shell.setDraft('用户并发写入的新要求📌');return accepted}})
  await f.page.getByRole('option',{name:/goal/}).click();await expect.poll(()=>f.input.inputValue()).toBe('用户并发写入的新要求📌');expect(await f.page.evaluate(()=>probe.shell.snapshot.draft)).toBe('用户并发写入的新要求📌');expect(f.errors).toEqual([])
 }finally{await f.close()}
})
