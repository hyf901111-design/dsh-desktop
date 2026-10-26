import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
let browser,script
beforeAll(async()=>{
 script=(await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`import{createAssistantTextPaint}from'./scripts/lib/assistant-reveal.mjs';window.createPaint=(route='composer')=>{const root=document.querySelector('[data-input-backdrop]'),record={epoch:1,live:true};window.paint=createAssistantTextPaint(root,record,route);window.paint.update()};window.append=text=>{document.querySelector('[data-input-plain]').textContent=' '+text;window.paint.update()};window.ranges=()=>[...CSS.highlights.values()].flatMap(value=>[...value].map(range=>range.toString()));`},bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent'})).outputFiles[0].text
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(()=>browser?.close())
async function fixture(reduced=false){const page=await browser.newPage({reducedMotion:reduced?'reduce':'no-preference'});await page.setContent('<div id="surface"><div class="uV2eYG_root"><div data-input-backdrop aria-hidden="true" style="color:rgb(40,40,40);font:16px/24px sans-serif"><span data-occurrence="skill">/PPT制作助手</span><span data-input-plain> </span></div></div></div>');await page.clock.install();await page.addScriptTag({content:script});return page}
it('uses the actual reply painter for the native decorative composer without fading existing tags or changing its aria contract',async()=>{
 const page=await fixture();try{
  await page.evaluate(()=>window.createPaint());await page.evaluate(()=>window.append('甲乙丙丁戊己庚辛壬癸子丑'))
  expect(await page.evaluate(()=>CSS.highlights.size)).toBeGreaterThan(0);expect((await page.evaluate(()=>window.ranges())).join('')).toContain('甲');expect((await page.evaluate(()=>window.ranges())).join('')).not.toContain('/PPT制作助手')
  expect(await page.locator('[data-input-backdrop]').getAttribute('aria-hidden')).toBe('true');expect(await page.locator('[data-occurrence]').textContent()).toBe('/PPT制作助手')
  await page.clock.runFor(80);expect(await page.evaluate(()=>CSS.highlights.size)).toBeGreaterThan(1);await page.clock.runFor(500);expect(await page.evaluate(()=>CSS.highlights.size)).toBe(0)
  expect(await page.locator('[data-input-plain]').textContent()).toBe(' 甲乙丙丁戊己庚辛壬癸子丑')
 }finally{await page.evaluate(()=>window.paint.dispose());expect(await page.evaluate(()=>CSS.highlights.size)).toBe(0);await page.close()}
})
it.each(['node','progress'])('keeps the ordinary %s route exclusion of aria-hidden text intact',async route=>{const page=await fixture();try{await page.evaluate(route=>window.createPaint(route),route);await page.evaluate(()=>window.append('不应从隐藏正文创建新涂层'));expect(await page.evaluate(()=>CSS.highlights.size)).toBe(0)}finally{await page.evaluate(()=>window.paint.dispose());await page.close()}})
it.each(['hidden','inert','aria-hidden'])('does not reveal a composer inside an independently %s ancestor',async attribute=>{const page=await fixture();try{await page.locator('#surface').evaluate((el,name)=>el.setAttribute(name,name==='aria-hidden'?'true':''),attribute);await page.evaluate(()=>window.createPaint());await page.evaluate(()=>window.append('后台保持原生完整文字'));expect(await page.evaluate(()=>CSS.highlights.size)).toBe(0)}finally{await page.evaluate(()=>window.paint.dispose());await page.close()}})
it('honors reduced motion and removes only its own highlights on disposal',async()=>{const page=await fixture(true);try{await page.evaluate(()=>{window.createPaint();window.append('👨‍👩‍👧‍👦与é都不改内容')});expect(await page.evaluate(()=>CSS.highlights.size)).toBe(0);expect(await page.locator('[data-input-plain]').textContent()).toBe(' 👨‍👩‍👧‍👦与é都不改内容')}finally{await page.evaluate(()=>window.paint.dispose());await page.close()}})
