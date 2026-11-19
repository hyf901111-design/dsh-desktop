import {beforeAll,afterAll,expect,it} from 'vitest'
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {createServer} from 'node:http'
import {build} from 'esbuild'
let browser,server,origin,script,input,css
const output='/tmp/sidebar-pptx-tooltip-20261026'
const sidebar='/Users/heyafeng/Documents/ChatGPT/sherlock-desktop/build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js'
function patch(source){const script='import{patchBetterSidebarClient as patch}from '+JSON.stringify(pathToFileURL(resolve('scripts/lib/patch-sherlock-better-sidebar.mjs')).href)+';import{readFileSync}from"node:fs";const a=patch(readFileSync(0,"utf8"));if(patch(a)!==a)throw Error("second pass drift");process.stdout.write(a)';return execFileSync(process.execPath,['--input-type=module','-e',script],{input:source,encoding:'utf8',maxBuffer:8*1024*1024})}
beforeAll(async()=>{
 await mkdir(output,{recursive:true});const installed=patch(await readFile(sidebar,'utf8')),start=installed.indexOf('function EditorHost(props) {'),end=installed.indexOf('\n\t\t/**',start)
 const primitive=await readFile('node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js','utf8'),a=primitive.indexOf('function Tooltip('),b=primitive.indexOf('//#endregion',a)
 const assetsDir='node_modules/@deepseek-ai/dsh-web-frontend/dist/assets',assetFile=(await readdir(assetsDir)).find(name=>/^index-.*\.css$/.test(name)),nativeCss=await readFile(join(assetsDir,assetFile),'utf8'),rule=nativeCss.match(/(\.[A-Za-z0-9_-]*bubble[A-Za-z0-9_-]*)\{[^}]*pointer-events:none[^}]*\}/)[0],tooltipClass=rule.slice(1,rule.indexOf('{'))
 css=[...nativeCss.matchAll(new RegExp('[^{}]*'+tooltipClass+'[^{}]*\\{[^{}]*\\}','g'))].map(value=>value[0]).join('\n')
 const assets=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e','import{pptxAnnotationAssets as assets}from '+JSON.stringify(pathToFileURL(resolve('scripts/lib/pptx-annotation-assets.mjs')).href)+';process.stdout.write(JSON.stringify(assets))'],{encoding:'utf8'}))
 input={host:installed.slice(start,end),tooltip:primitive.slice(a,b),tooltipClass,assets}
 script=(await build({entryPoints:['test/fixtures/sidebar-pptx-tooltip-browser.tsx'],bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},logLevel:'silent'})).outputFiles[0].text
 server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><style>body{margin:0;font:13px/20px system-ui;background:#eee;color:#252525;--dsw-alias-tooltip-bg:#303238;--dsw-static-neutral-bluish-00:#fff}.surface{position:absolute;right:12px;top:12px;width:310px;height:350px;background:#fff;transform:translateX(0)}.editorHeader{height:42px;display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:0 12px}.iconButton{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:28px;height:28px;border:0;border-radius:5px;background:transparent;color:inherit;cursor:pointer}.iconButton:disabled{opacity:.4}.iconButton svg,.iconButton img{display:block}.iconButton:hover,.editorTreeToggleActive{background:#ddd}.iconButton:focus-visible{outline:2px solid #5e85d7}.preview{padding:24px}.dirtyDot{width:5px;height:5px;border-radius:50%;background:#f90}body[data-ds-dark-theme]{background:#111;color:#ddd;--dsw-alias-tooltip-bg:#42454b}body[data-ds-dark-theme] .surface{background:#252525}body[data-ds-dark-theme] .iconButton:hover,body[data-ds-dark-theme] .editorTreeToggleActive{background:#444}'+css+'</style><div class="surface" id="root"></div><script>window.pptTooltipInput='+JSON.stringify(input)+'</script><script>'+script+'</script>')})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port
 const pw=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve))})
it('shows a real body-portal tooltip for all four native PPT header actions on hover and keyboard focus',async()=>{
 const page=await browser.newPage({viewport:{width:520,height:420}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin)
 const controls=page.locator('.editorHeader .iconButton');await expect.poll(()=>controls.count()).toBe(4)
 for(let index=0;index<4;index++){
  await controls.nth(index).hover();await expect.poll(()=>page.getByRole('tooltip').count()).toBe(1)
  expect(await page.getByRole('tooltip').textContent()).toBe(['下载','打开文件夹','已锁定，点击解锁编辑','标注演示文稿'][index])
  expect(await page.getByRole('tooltip').evaluate(node=>node.parentElement===document.body)).toBe(true)
  const box=await page.getByRole('tooltip').boundingBox();expect(box.x).toBeGreaterThanOrEqual(11);expect(box.x+box.width).toBeLessThanOrEqual(509)
  expect(await controls.nth(index).getAttribute('title')).toBeNull();await page.mouse.move(10,400);await expect.poll(()=>page.getByRole('tooltip').count()).toBe(0)
  await controls.nth(index).focus();expect(await page.getByRole('tooltip').textContent()).toBe(['下载','打开文件夹','已锁定，点击解锁编辑','标注演示文稿'][index]);await controls.nth(index).evaluate(node=>node.blur())
 }
 await controls.last().hover();await expect.poll(()=>page.getByRole('tooltip').count()).toBe(1);await page.screenshot({path:join(output,'light.png')});await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));await page.screenshot({path:join(output,'dark.png')});expect(errors).toEqual([]);await page.close()
},15000)
it('updates edit and annotation action labels in both locales and retains native guarded handlers',async()=>{
 const page=await browser.newPage({viewport:{width:520,height:420}});await page.goto(origin)
 const edit=page.locator('[data-odyssey-pptx-mode-toggle]'),mark=page.locator('[data-odyssey-pptx-annotation-toggle]')
 await expect.poll(()=>edit.isEnabled()).toBe(true);await edit.click();expect(await edit.getAttribute('aria-label')).toBe('未锁定，可编辑。点击锁定');expect(await page.getByRole('button',{name:'保存',exact:true}).count()).toBe(1)
 await mark.click();expect(await mark.getAttribute('aria-label')).toBe('关闭标注模式');await page.evaluate(()=>window.pptTooltipFixture.locale('en'))
 await expect.poll(()=>edit.getAttribute('aria-label')).toBe('Unlocked for editing. Click to lock');expect(await mark.getAttribute('aria-label')).toBe('Exit annotation mode');await mark.focus();expect(await page.getByRole('tooltip').textContent()).toBe('Exit annotation mode')
 expect(await page.evaluate(()=>window.pptTooltipFixture.events)).toEqual(['mode','annotations'])
 await edit.click();await mark.click();expect(await edit.getAttribute('aria-label')).toBe('Locked. Click to unlock editing');expect(await mark.getAttribute('aria-label')).toBe('Annotate presentation')
 await page.evaluate(()=>window.pptTooltipFixture.unavailable());await expect.poll(()=>edit.isDisabled()).toBe(true);await page.close()
},15000)
it('uses a paired map-pin asset for normal and selected annotation states without changing numbered pins',async()=>{
 const normal=Buffer.from(input.assets['mark16-normal'].split(',')[1],'base64').toString(),selected=Buffer.from(input.assets['mark16-selected'].split(',')[1],'base64').toString()
 expect(normal).toContain('data-icon="map-pin"');expect(selected).toContain('data-icon="map-pin"');expect(normal).toContain('#B8BBC2');expect(selected).toContain('#B9D4FC')
 const page=await browser.newPage({viewport:{width:520,height:420}});await page.goto(origin);const mark=page.locator('[data-odyssey-pptx-annotation-toggle]');await expect.poll(()=>mark.isEnabled()).toBe(true)
 expect(await mark.locator('img').getAttribute('src')).toBe(input.assets['mark16-normal']);await mark.click();expect(await mark.locator('img').getAttribute('src')).toBe(input.assets['mark16-selected']);await page.close()
})
it('keeps the same focused button and live tooltip when mode and unrelated toolbar state change',async()=>{
 const page=await browser.newPage({viewport:{width:520,height:420}});await page.goto(origin);const edit=page.locator('[data-odyssey-pptx-mode-toggle]');await expect.poll(()=>edit.isEnabled()).toBe(true)
 await edit.focus();await edit.evaluate(node=>{window.originalToolbarButton=node});expect(await page.getByRole('tooltip').textContent()).toBe('已锁定，点击解锁编辑')
 await page.evaluate(()=>window.pptTooltipFixture.status({mode:'edit'}));await expect.poll(()=>edit.getAttribute('aria-label')).toBe('未锁定，可编辑。点击锁定')
 expect(await edit.evaluate(node=>({same:node===window.originalToolbarButton,focus:document.activeElement===node}))).toEqual({same:true,focus:true});expect(await page.getByRole('tooltip').textContent()).toBe('未锁定，可编辑。点击锁定')
 await page.evaluate(()=>window.pptTooltipFixture.status({dirty:true,saveState:'saved'}));await expect.poll(()=>page.locator('.dirtyDot').count()).toBe(1)
 expect(await edit.evaluate(node=>node===window.originalToolbarButton&&document.activeElement===node)).toBe(true);expect(await page.getByRole('tooltip').textContent()).toBe('未锁定，可编辑。点击锁定')
 await edit.hover();await edit.click();await expect.poll(()=>edit.getAttribute('aria-label')).toBe('已锁定，点击解锁编辑');expect(await edit.evaluate(node=>node===window.originalToolbarButton)).toBe(true);expect(await page.getByRole('tooltip').textContent()).toBe('已锁定，点击解锁编辑');await page.close()
})
