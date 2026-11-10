import {beforeAll,afterAll,it,expect} from 'vitest'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'

let browser,code
const evidence=process.env.BROWSER_SIDEBAR_EVIDENCE||'/tmp/browser-sidebar-entry-order-20261110'
beforeAll(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),contents:`import {mountDesktopShellStyles} from './src/preload/shell-style';import {ScheduledTaskView} from './src/preload/scheduled/view';mountDesktopShellStyles(document);
window.sidebarCalls=[];window.browserOpens=0;window.addEventListener('sherlock:browser-request',()=>window.browserOpens++);const view=new ScheduledTaskView(document,{list:async()=>[],workspaces:async()=>[],save:async()=>window.sidebarCalls.push('save'),action:async()=>window.sidebarCalls.push('action')},{register:()=>window.sidebarCalls.push('register'),open:()=>window.sidebarCalls.push('open'),close:()=>{},current:()=>undefined},undefined,{newNote:async()=>window.sidebarCalls.push('new-note')});view.mount();window.sidebarFixture={wide:value=>{const sidebar=document.querySelector('[data-dsh-sidebar-root]');sidebar.dataset.dshSidebarWide=String(value);sidebar.classList.toggle('hHd-Xa_collapsed',!value);view.mountMore()},selected:value=>{if(value)document.body.dataset.workspaceSurface='browser';else delete document.body.dataset.workspaceSurface;document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change'))}};`},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent',plugins:[{name:'inline',setup(b){b.onResolve({filter:/\?(inline|raw)$/},async args=>{const r=await b.resolve(args.path.replace(/\?(inline|raw)$/,''),{resolveDir:args.resolveDir,kind:args.kind});return{path:r.path,namespace:'inline'}});b.onLoad({filter:/.*/,namespace:'inline'},async args=>({contents:JSON.stringify(args.path.endsWith('.svg')?'data:image/svg+xml,'+encodeURIComponent((await readFile(args.path,'utf8')).replaceAll('"',"'")):await readFile(args.path,'utf8')),loader:'json'}))}}]});code=result.outputFiles[0].text
 const pw=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href):await import('playwright');browser=await(pw.default??pw).chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});await mkdir(evidence,{recursive:true})
},20000)
afterAll(async()=>browser?.close())
const luminance=color=>{const rgb=color.match(/[\d.]+/g).map(Number);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}

for(const dark of [false,true])it(`keeps collapsed browser order, keyboard order and selected contrast in ${dark?'dark':'light'}`,async()=>{
 const page=await browser.newPage({viewport:{width:900,height:700}}),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.route('https://sidebar.test/**',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(/^odyssey-b-[a-z-]+-\d+\.svg$/.test(name))await route.fulfill({contentType:'image/svg+xml',body:await readFile('build/brand/'+name)});else await route.fulfill({contentType:'text/html',body:'<!doctype html>'})});await page.goto('https://sidebar.test/')
  await page.setContent(`<html><head><style>body{margin:0;background:${dark?'#191919':'#ededed'};--dsw-alias-interactive-bg-hover:${dark?'rgba(255,255,255,.1)':'rgba(0,0,0,.08)'}}aside{position:fixed;inset:10px auto 10px 10px;width:64px;padding:24px 8px;background:${dark?'#242424':'#fff'}}.hHd-Xa_newSession{display:flex;align-items:center;justify-content:center}.hHd-Xa_newSessionGroup>button>span{display:none}</style></head><body ${dark?'data-ds-dark-theme':''}><aside class="hHd-Xa_root hHd-Xa_collapsed" data-dsh-sidebar-root data-dsh-sidebar-wide="false"><div class="hHd-Xa_newSessionGroup"><button class="hHd-Xa_newSession" aria-label="对话"><span>对话</span></button><button class="hHd-Xa_newSession" aria-label="研究"><span>研究</span></button><button class="hHd-Xa_newSession" data-sidebar-new-note aria-label="笔记"><span>笔记</span></button></div></aside></body></html>`)
  await page.addScriptTag({content:code});const more=page.getByRole('button',{name:'更多',exact:true}),entry=page.getByRole('button',{name:'浏览器',exact:true}),divider=page.locator('[data-sidebar-browser-separator]');await entry.waitFor();await page.waitForLoadState('networkidle')
  const boxes=await page.evaluate(()=>{const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{top:r.top,bottom:r.bottom,width:r.width,height:r.height}};return{more:box('.st-more'),divider:box('[data-sidebar-browser-separator]'),browser:box('[data-sidebar-browser]')}})
  expect(boxes.browser.top).toBeGreaterThan(boxes.divider.bottom);expect(boxes.more.top).toBeGreaterThan(boxes.browser.bottom);expect(boxes.divider.height).toBe(1);expect(boxes.divider.width).toBeGreaterThan(10);expect(await entry.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})).toBe(true)
  await page.getByRole('button',{name:'笔记',exact:true}).focus();await page.keyboard.press('Tab');expect(await entry.evaluate(el=>el===document.activeElement)).toBe(true);await page.keyboard.press('Tab');expect(await more.evaluate(el=>el===document.activeElement)).toBe(true)
  const colors=[]
  for(const selected of [false,true]){
   await page.evaluate(selected=>window.sidebarFixture.selected(selected),selected)
   const sample=await entry.evaluate(el=>({glyph:getComputedStyle(el,'::before').backgroundColor,color:getComputedStyle(el).color,shared:getComputedStyle(document.querySelector('.hHd-Xa_newSession'),'::before').backgroundColor,background:getComputedStyle(el).backgroundColor,pressed:el.getAttribute('aria-pressed')}));colors.push(sample)
   expect(sample.pressed).toBe(String(selected));expect(sample.glyph).toBe(sample.color);if(!selected)expect(sample.glyph).toBe(sample.shared);else{expect(sample.glyph).not.toBe(sample.shared);expect(sample.background).not.toBe('rgba(0, 0, 0, 0)')}
  }
  if(dark)expect(luminance(colors[1].glyph)).toBeGreaterThan(luminance(colors[0].glyph));else expect(luminance(colors[1].glyph)).toBeLessThan(luminance(colors[0].glyph))
  await entry.screenshot({path:evidence+'/selected-browser-'+dark+'.png'});await page.locator('aside').screenshot({path:evidence+'/rail-'+dark+'.png'});await writeFile(evidence+'/rail-'+dark+'.json',JSON.stringify({boxes,colors},null,2))
  for(let i=0;i<6;i++){await page.evaluate(()=>window.sidebarFixture.wide(true));expect(await entry.count()).toBe(0);expect(await divider.count()).toBe(0);await page.evaluate(()=>window.sidebarFixture.wide(false));expect(await entry.count()).toBe(1);expect(await divider.count()).toBe(1);expect(await page.locator('.st-more-zone').count()).toBe(1)}
  await more.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Enter');expect(await page.evaluate(()=>window.browserOpens)).toBe(1);expect(await page.evaluate(()=>window.sidebarCalls)).toEqual([]);expect(errors).toEqual([])
 }finally{await page.close()}
})
