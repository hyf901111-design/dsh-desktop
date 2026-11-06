import {readFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {beforeAll,afterAll,it,expect} from 'vitest'
let browser,source,bundle,css
const evidence=process.env.SHERLOCK_MODEL_ACTIONS_EVIDENCE||'/tmp/model-settings-actions-20261104'
beforeAll(async()=>{
 source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js','utf8')
 css=await readFile('src/preload/figma-settings.css','utf8')
 bundle=(await build({entryPoints:['test/fixtures/model-settings-actions-browser.tsx'],bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
})
afterAll(async()=>browser?.close())
it.each([{theme:'light',width:1040},{theme:'dark',width:760}])('keeps readable centered model actions and their real behavior in $theme',async({theme,width})=>{
 const page=await browser.newPage({viewport:{width,height:680}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.setContent('<html><div id="app"></div></html>')
  await page.evaluate(theme=>{if(theme==='dark')document.body.dataset.dsDarkTheme='';window.__ModuleLoader__={load:descriptor=>window.modelsDescriptor=descriptor}},theme)
  await page.addScriptTag({content:source});await page.addStyleTag({content:css+'\nbody{margin:0;font-family:system-ui}.VOzbGW_overlay{position:static;display:block;padding:32px;min-height:100vh;box-sizing:border-box}.zGbnIq_section{max-width:900px!important;margin:auto!important}'});await page.addScriptTag({content:bundle})
  await expect.poll(()=>page.getByRole('button',{name:'容量 1',exact:true}).count()).toBe(1)
  const actions=page.locator('.sherlockModelRow>.zGbnIq_iconButton')
  const check=async()=>{
   for(const button of await actions.all()){
    await expect.poll(async()=>Math.round((await button.locator('svg').boundingBox()).width*10)/10).toBe(16)
    const box=await button.boundingBox(),svg=await button.locator('svg').boundingBox()
    expect(box.width).toBe(28);expect(box.height).toBe(28);expect(svg.width).toBeCloseTo(16,1);expect(svg.height).toBeCloseTo(16,1)
    expect(Math.abs(svg.x+8-box.x-14)).toBeLessThan(.1);expect(Math.abs(svg.y+8-box.y-14)).toBeLessThan(.1)
   }
  }
  await check();await page.getByRole('button',{name:'容量 2',exact:true}).click();await expect.poll(()=>page.getByRole('button',{name:'容量 2',exact:true}).getAttribute('aria-expanded')).toBe('true');await check()
  expect(await page.evaluate(()=>window.modelSettingsSnapshot())).toMatchObject([{id:'ark-code-latest',input:['text','image']},{id:'deepseek-v4.1-flash-261017',input:['text','image']}])
  await page.screenshot({path:evidence+'/'+theme+'.png'})
  await page.getByRole('button',{name:'容量 2',exact:true}).click();await expect.poll(()=>page.getByRole('button',{name:'容量 2',exact:true}).getAttribute('aria-expanded')).toBe('false')
  await page.getByRole('button',{name:'删除模型 1',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.modelSettingsSnapshot().length)).toBe(1)
  expect(await page.evaluate(()=>window.modelSettingsSnapshot()[0])).toMatchObject({id:'deepseek-v4.1-flash-261017',name:'DeepSeek V4.1 Flash 1017',input:['text','image']});await check();expect(errors).toEqual([])
 }finally{await page.close()}
})
