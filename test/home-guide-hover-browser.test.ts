import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {beforeAll,afterAll,it,expect} from 'vitest'

let browser:any,entry:string,styles:string
const output='/tmp/sherlock-research-demo-pointer-feedback-20261102'
beforeAll(async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`import{createHomeGuidePointer}from'./src/preload/home-guide-pointer';window.abort=new AbortController();window.pointer=createHomeGuidePointer(document,{runId:'hover-fixture',signal:window.abort.signal,wait:ms=>new Promise(resolve=>setTimeout(resolve,Math.min(ms,1))),waitUntilPlaying:()=>Promise.resolve()});window.move=id=>window.pointer.perform({target:document.getElementById(id),action:'move'});`},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'});entry=bundle.outputFiles[0]!.text
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js','utf8')
 styles=[await readFile('src/preload/explore-menu.css','utf8'),await readFile('src/preload/home-guides.css','utf8'),await readFile('scripts/lib/research-grid-workbench.css','utf8'),...[...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1]!))].join('\n')
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(output,{recursive:true})
},20000)
afterAll(()=>browser?.close())
it.each(['light','dark'])('matches real hover for Explore, new chat, toolbar and menu controls in %s and restores the shared CSS',async mode=>{
 const page=await browser.newPage({viewport:{width:1000,height:800},reducedMotion:'reduce'}),errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message))
 try{
  await page.setContent(`<style>${styles}</style><style id="ownership">#negative:hover{color:rgb(11,22,33)}#negative:not(:hover){color:rgb(44,55,66)}[data-label=":hover"]{border-color:red}@media(min-width:600px){#dynamic:hover{background:rgb(1,2,3)}}body{margin:30px}main{display:flex;align-items:center;gap:24px;margin-bottom:30px}button{position:relative!important;inset:auto!important;min-width:40px;min-height:40px}button,button *{transition:none!important}.ew-grid-menu{position:static!important;display:inline-flex!important;width:auto!important}.odyssey-explore{position:static;width:auto;height:auto;padding:0;overflow:visible}.odyssey-explore-system{position:static!important;display:block!important}input{position:fixed;left:40px;top:500px}</style><main class="odyssey-explore"><button id="appearance" class="odyssey-explore-tool">☼</button><button id="settings" class="odyssey-explore-tool">⚙</button><button id="search" class="odyssey-explore-tool">⌕</button><div class="odyssey-explore-system"><button id="close" class="odyssey-explore-tool">×</button></div></main><main><button id="new" class="hHd-Xa_newSession">New chat</button><div data-ework-toolbar><button id="toolbar" data-tool-tooltip="Library">Library</button></div><div class="ew-grid-menu"><button id="menu">Export</button></div><button id="negative">Cascade</button><button id="dynamic">Dynamic</button></main><input id="draft" value="用户仍可输入">`)
  if(mode==='dark')await page.evaluate(()=>document.body.dataset.dsDarkTheme='')
  const selectors=await page.evaluate(()=>[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules].filter(rule=>'selectorText'in rule).map(rule=>(rule as CSSStyleRule).selectorText)))
  await page.addScriptTag({content:entry})
  const snapshot=async(id:string)=>page.locator('#'+id).evaluate((node:HTMLElement)=>{const css=getComputedStyle(node);return{background:css.backgroundColor,color:css.color,border:css.borderColor,shadow:css.boxShadow,opacity:css.opacity,after:getComputedStyle(node,'::after').content}})
  const results=[]
  for(const id of ['appearance','settings','search','close','new','toolbar','menu','negative']){
   await page.mouse.move(980,780);await page.evaluate(()=>(window as any).pointer.hide());const idle=await snapshot(id)
   await page.locator('#'+id).hover();const real=await snapshot(id);await page.mouse.move(980,780)
   await page.evaluate((id:string)=>(window as any).move(id),id);const virtual=await snapshot(id)
   expect(virtual,id+' must reuse its real hover declarations').toEqual(real);results.push({id,idle,real,virtual})
  }
  expect(results.find(item=>item.id==='negative')!.virtual.color).toBe('rgb(11, 22, 33)')
  expect(results.find(item=>item.id==='toolbar')!.virtual.background).not.toBe(results.find(item=>item.id==='toolbar')!.idle.background)
  await page.evaluate(()=>{const style=document.createElement('style');style.textContent='@media(min-width:600px){#dynamic:hover{background:rgb(9,8,7)}}';document.head.append(style)})
  await page.evaluate(()=>(window as any).move('dynamic'));expect((await snapshot('dynamic')).background).toBe('rgb(9, 8, 7)')
  await page.evaluate(()=>(window as any).pointer.hide());expect(await page.locator('[data-home-guide-hover]').count()).toBe(0)
  await page.locator('#draft').fill('人工输入没有被锁定');expect(await page.locator('#draft').inputValue()).toBe('人工输入没有被锁定')
  await page.evaluate(()=>(window as any).move('menu'));await page.screenshot({path:output+'/hover-'+mode+'.png'});await page.evaluate(()=>(window as any).abort.abort())
  expect(await page.locator('[data-home-guide-hover]').count()).toBe(0)
  const restored=await page.evaluate(()=>[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules].filter(rule=>'selectorText'in rule).map(rule=>(rule as CSSStyleRule).selectorText)))
  expect(restored).toEqual(selectors);expect(errors).toEqual([]);await writeFile(output+'/hover-'+mode+'.json',JSON.stringify(results,null,2))
 }finally{await page.close()}
},20000)
