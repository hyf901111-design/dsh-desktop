import {execFileSync} from 'node:child_process'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve,dirname,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'

let browser,script
const output=process.env.SHERLOCK_GUIDE_LEASE_EVIDENCE||'/tmp/sherlock-computer-input-20261031/browser'
beforeAll(async()=>{
 script=(await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
 import{mountHomeGuides}from'./src/preload/home-guides';
 const header=document.querySelector('header'),composer=document.querySelector('textarea');let save,closing;
 window.addEventListener('sherlock:home-guide-session-request',event=>{const d=event.detail,reply=value=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-session-reply',{detail:{requestId:d.requestId,ok:true,...value}}));if(d.command==='prepare')reply({sessionId:'example-note',cwd:'/tmp/lease-browser',title:'示例',fresh:true});else if(d.command==='open'){header.dataset.eworkNotesSession=d.sessionId;reply({sessionId:d.sessionId,cwd:'/tmp/lease-browser',title:'示例'});window.dispatchEvent(new CustomEvent('sherlock:home-action-context-changed'))}else reply({})});
 const adapter=async(_doc,_host,options)=>({runStep:()=>new Promise(resolve=>options.signal.addEventListener('abort',resolve,{once:true})),flush:()=>new Promise(resolve=>save=resolve),dispose:()=>window.lease.released++});
 const controller=mountHomeGuides(document,{mountNotes:adapter,mountPresentation:adapter});
 document.querySelector('[data-next-session]').addEventListener('click',()=>{header.dataset.eworkNotesSession='user-next';window.dispatchEvent(new CustomEvent('sherlock:home-action-context-changed'))});
 window.lease={released:0,async start(){await controller.start('note')},exit(kind){if(kind==='navigation')document.querySelector('[data-next-session]').click();else if(kind==='escape')document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));else{window.dispatchEvent(new Event('blur'));closing=controller.reset(false)}},async save(){save();await closing},dispose:()=>controller.dispose()};
 `},bundle:true,format:'iife',platform:'browser',write:false,logLevel:'silent',plugins:[
  {name:'raw-css',setup(b){b.onResolve({filter:/\.css\?raw$/},a=>({path:resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw-css'}));b.onLoad({filter:/.*/,namespace:'raw-css'},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}))}},
  ...(process.env.SHERLOCK_GUIDE_LEASE_BASELINE==='1'?[{name:'exact-parent-baseline',setup(b){b.onLoad({filter:/src\/preload\/home-guides\.ts$/},a=>({loader:'ts',resolveDir:dirname(a.path),contents:execFileSync('git',['show','55e46e2433df898bcf28a6b3a503b6d84901ca26:src/preload/home-guides.ts'],{encoding:'utf8'})}))}}]:[])
 ]})).outputFiles[0].text
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'});await mkdir(output,{recursive:true})
},20000)
afterAll(()=>browser?.close())
for(const mode of ['light','dark'])for(const exit of ['navigation','escape','blur-reset'])it(`keeps real input and hover usable after ${exit} while example save is held (${mode})`,async()=>{
 const page=await browser.newPage({viewport:{width:800,height:600},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 try{
  await page.route('https://guide-lease.local/',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));await page.goto('https://guide-lease.local/')
  await page.setContent(`<style>body{margin:0;color:${mode==='dark'?'#ddd':'#222'};background:${mode==='dark'?'#171717':'#eee'};font:14px system-ui}.pI_x6G_centerCol{position:absolute;left:60px;top:0;width:740px;height:600px}.wSkVaW_root{height:100%}header{height:44px}textarea{display:block;width:500px;height:80px;margin:20px}[data-hover-action]{margin:20px;padding:12px;background:rgb(80,80,80)}[data-hover-action]:hover{background:rgb(34,177,76)}</style><aside data-dsh-sidebar-root><button data-next-session>新会话</button></aside><main class="pI_x6G_centerCol"><div class="wSkVaW_root"><header data-srb-session-header data-ework-notes-session="original"><div data-srb-tabs><button aria-selected="true">笔记</button></div></header><div class="wSkVaW_scrollBody">原有内容<button data-hover-action>更多</button></div><div data-center-composer-host><textarea aria-label="对话输入">原草稿</textarea></div></div></main>`)
  await page.addScriptTag({content:script});await page.evaluate(()=>window.lease.start());expect(await page.locator('textarea').evaluate(n=>n.closest('[inert]')!==null)).toBe(true)
  if(exit==='navigation')await page.getByRole('button',{name:'新会话',exact:true}).click()
  else if(exit==='escape')await page.keyboard.press('Escape')
  else await page.evaluate(exit=>window.lease.exit(exit),exit)
  expect(await page.evaluate(()=>window.lease.released)).toBe(0)
  await page.getByRole('textbox',{name:'对话输入'}).fill('退出演示后的新输入',{timeout:1500})
  await page.getByRole('button',{name:'更多',exact:true}).hover({timeout:1500})
  const actual=await page.evaluate(()=>({draft:document.querySelector('textarea').value,focused:document.activeElement===document.querySelector('textarea'),hover:getComputedStyle(document.querySelector('[data-hover-action]')).backgroundColor,retainedEditor:document.querySelector('[data-home-guide]')?.isConnected,hiddenEditor:getComputedStyle(document.querySelector('[data-home-guide]')).display,pointerCount:document.querySelectorAll('[data-home-guide-pointer]').length}))
  expect(actual).toMatchObject({draft:'退出演示后的新输入',focused:true,hover:'rgb(34, 177, 76)',retainedEditor:true,hiddenEditor:'none',pointerCount:0})
  await page.screenshot({path:join(output,`${mode}-${exit}.png`)});await writeFile(join(output,`${mode}-${exit}.json`),JSON.stringify(actual,null,2))
  await page.evaluate(()=>window.lease.save());await expect.poll(()=>page.evaluate(()=>window.lease.released)).toBe(1)
  expect(await page.getByRole('textbox').inputValue()).toBe(actual.draft);expect(await page.getByRole('textbox').evaluate(n=>document.activeElement===n)).toBe(true);expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.lease?.save()).catch(()=>{});await page.evaluate(()=>window.lease?.dispose()).catch(()=>{});await page.close()}
},10000)
