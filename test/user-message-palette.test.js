import {beforeAll,afterAll,it,expect} from 'vitest'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {build} from 'esbuild'

const require=createRequire(import.meta.url)
let browser,script,theme,syntax
beforeAll(async()=>{
 const raw={name:'raw-css',setup(b){b.onResolve({filter:/\.css\?raw$/},a=>({path:a.path.startsWith('.')?resolve(a.resolveDir,a.path.slice(0,-4)):require.resolve(a.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:'export default '+JSON.stringify(await readFile(a.path,'utf8')),loader:'js'}))}}
 const output=await build({stdin:{contents:"import {mountDesktopShellStyles} from './src/preload/shell-style';mountDesktopShellStyles(document)",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',plugins:[raw]})
 script=output.outputFiles[0].text
 theme=await readFile(require.resolve('@deepseek-ai/dsh-client-ui-theme/styles/design-platform.css'),'utf8')
 syntax=await readFile(require.resolve('@deepseek-ai/dsh-client-ui-theme/styles/shiki.css'),'utf8')
 const {chromium}=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(async()=>await browser?.close())

it('uses the original dark content tokens and reference states on black light-mode bubbles across chat, research and notes',async()=>{
 const page=await browser.newPage({viewport:{width:1100,height:900}})
 try{
  const content=`<p>用户消息 <code style="color:var(--shiki-token-keyword)">const result</code></p><button class="gdEzaW_refChip" data-ref-chip="skill"><svg width="18" height="18" fill="currentColor"><circle cx="9" cy="9" r="6"/></svg><span class="gdEzaW_refChipLabel">撰写报告</span></button><button class="gdEzaW_refChip" data-ref-chip="subagent">研究助手</button><button class="gdEzaW_refChip" data-ref-chip="research-file">研究资料.pdf</button><button class="gdEzaW_refChip" data-ref-chip="research-artifact">市场指数组件</button><span data-extra-content style="color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)">额外内容</span>`
  await page.setContent(`<style>${theme+syntax}body{--odyssey-font-ui:system-ui;color:var(--dsw-alias-label-primary)}</style><main data-odyssey-page="conversation"><div class="gdEzaW_bubble">${content}</div><p data-assistant>助手回复</p><div class="uV2eYG_root" data-figma-inline-ready><span class="uV2eYG_chipLabel">待发送文件</span></div></main><aside class="sRp_messages"><div class="gdEzaW_bubble">${content}</div></aside><section class="en-task-history"><div class="gdEzaW_bubble">${content}</div></section>`)
  await page.addScriptTag({content:script})
  expect(await page.locator('.gdEzaW_bubble').evaluateAll(items=>items.map(el=>getComputedStyle(el).backgroundColor))).toEqual(['rgb(0, 0, 0)','rgb(0, 0, 0)','rgb(0, 0, 0)'])
  const tokenNames=[...new Set([...theme.matchAll(/(--dsw-[\w-]+):/g),...syntax.matchAll(/(--shiki-token-[\w-]+):/g)].map(m=>m[1]))]
  const light=await page.locator('.gdEzaW_bubble').first().evaluate((el,names)=>Object.fromEntries(names.map(name=>[name,getComputedStyle(el).getPropertyValue(name)])),tokenNames)
  const states=async()=>page.locator('.gdEzaW_refChip').first().evaluate(el=>{const s=getComputedStyle(el),icon=getComputedStyle(el.querySelector('svg'));return {background:s.backgroundColor,color:s.color,shadow:s.boxShadow,outline:s.outlineColor,icon:icon.fill}})
  const chipLight=await states();await page.locator('.gdEzaW_refChip').first().focus();const focusLight=await states()
  await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''))
  const dark=await page.locator('[data-assistant]').evaluate((el,names)=>Object.fromEntries(names.map(name=>[name,getComputedStyle(el).getPropertyValue(name)])),tokenNames)
  for(const name of tokenNames)expect(light[name],name).toBe(dark[name])
  expect(await states()).toEqual(focusLight);await page.locator('[data-assistant]').click();expect(await states()).toEqual(chipLight)
  await page.evaluate(()=>document.body.removeAttribute('data-ds-dark-theme'))
  expect(await page.locator('[data-assistant]').evaluate(el=>getComputedStyle(el).color)).toBe('rgb(15, 17, 21)')
  expect(await page.locator('.uV2eYG_chipLabel').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(246, 246, 247)')
 }finally{await page.close()}
},15000)
