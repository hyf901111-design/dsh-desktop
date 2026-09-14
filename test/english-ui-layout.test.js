import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
let browser, script, sidebarCss
beforeAll(async () => {
  const result = await build({ stdin: { contents: "import {mountDesktopShellStyles} from './src/preload/shell-style'; mountDesktopShellStyles(document);import {mountUiLocalization} from './src/preload/ui-localization';mountUiLocalization(document)", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'browser', write: false,
    plugins: [{ name: 'styles', setup(b) {
      b.onResolve({ filter: /\?raw$/ }, a => ({ path: resolve(a.resolveDir, a.path.slice(0, -4)), namespace: 'raw' }))
      b.onLoad({ filter: /.*/, namespace: 'raw' }, async a => ({ contents: 'export default ' + JSON.stringify(await readFile(a.path, 'utf8')), loader: 'js' }))
    } }] })
  script = result.outputFiles[0].text
  const sidebarSource=await readFile('node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js','utf8')
  sidebarCss=JSON.parse(sidebarSource.match(/const css = ("(?:\\.|[^"])*");/)[1])
  const { chromium } = await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => browser?.close())

it.each([760,1380])('fits English labels and equalizes menu padding at viewport %s',async width=>{
 const page=await browser.newPage({viewport:{width,height:900}})
 try {
 await page.setContent(`<html data-odyssey-locale="en"><body><header class="wSkVaW_header" data-odyssey-header-layout="regular" style="display:flex;width:600px;height:56px"><div data-srb-tabs><button class="wSkVaW_tab">Chat</button><button class="wSkVaW_tab">Research</button><button class="wSkVaW_tab">Trajectory</button></div><button class="cubgiG_seat">Standard mode</button></header><div class="VOzbGW_overlay" style="position:relative;inset:auto;display:block;padding:20px"><div class="sherlock-settings-item"><button class="_5QVD0a_selector"><svg></svg><span>Standard mode</span><svg></svg></button></div></div><div role="menu"><div role="presentation"><div role="menuitem"><span class="odyssey-permission-item"><span class="odyssey-permission-name">Read only</span><span class="odyssey-permission-description">Allows reading and analysis; editing files requires approval.</span></span></div></div></div><div class="srb-dialog"><h2>创建协作</h2><button>查找并核对</button><p>成员将共同编辑同一块共享画板。原个人研究独立保留，后续修改互不影响。</p><button>发送邀请</button></div><div class="hHd-Xa_newSessionGroup" style="width:208px"><button class="hHd-Xa_newSession"><svg width="16" height="16"></svg><span class="hHd-Xa_newSessionLabel">New Chat</span></button><button class="hHd-Xa_newSession"><svg width="16" height="16"></svg><span class="hHd-Xa_newSessionLabel">New Research</span></button></div></body></html>`)
 await page.addStyleTag({content:sidebarCss})
 await page.addScriptTag({content:script})
 await expect.poll(()=>page.locator('.srb-dialog h2').textContent()).toBe('Create collaboration')
 const geometry=await page.locator('[role=menuitem]').evaluate(e=>{const row=e.getBoundingClientRect(),label=e.querySelector('.odyssey-permission-item').getBoundingClientRect();return {top:label.top-row.top,bottom:row.bottom-label.bottom}})
 expect(Math.abs(geometry.top-geometry.bottom)).toBeLessThan(1)
 for(const selector of ['.wSkVaW_tab','._5QVD0a_selector','.srb-dialog button','.hHd-Xa_newSessionLabel']){
  for(const node of await page.locator(selector).all()){const geometry=await node.evaluate(e=>({ok:e.scrollWidth<=e.clientWidth+1,text:e.textContent,w:e.clientWidth,sw:e.scrollWidth}));expect(geometry.ok,JSON.stringify(geometry)).toBe(true)}
 }
 if(process.env.ENGLISH_SCREENSHOTS)await page.screenshot({path:process.env.ENGLISH_SCREENSHOTS+'/english-controls-'+width+'.png'})
 }finally{await page.close()}
})

it('makes running mode visibly disabled and removes asymmetric progress indentation',async()=>{
 const page=await browser.newPage()
 try{
 await page.setContent('<button class="cubgiG_seat" disabled>Standard mode</button><div style="width:400px"><div class="Md3f7G_executionProgress"><p>Progress paragraph</p></div></div>')
 await page.addStyleTag({content:sidebarCss})
 await page.addScriptTag({content:script})
 const state=await page.locator('button').evaluate(e=>({disabled:e.disabled,opacity:getComputedStyle(e).opacity,cursor:getComputedStyle(e).cursor}))
 expect(state).toEqual({disabled:true,opacity:'0.35',cursor:'not-allowed'})
 expect(await page.locator('.Md3f7G_executionProgress').evaluate(e=>{const s=getComputedStyle(e);return[s.paddingLeft,s.paddingRight]})).toEqual(['0px','0px'])
 }finally{await page.close()}
})
