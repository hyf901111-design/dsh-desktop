import {beforeAll,afterAll,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {patchFigmaFinalCanvas} from '../scripts/lib/figma-canvas-client.mjs'
import {patchFigmaFilePreview} from '../scripts/lib/figma-file-preview-client.mjs'
let browser,script,css
beforeAll(async()=>{
 const source=patchFigmaFilePreview(patchFigmaFinalCanvas(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')))
 const menu=source.slice(source.indexOf('function ResearchCanvasFrameMenu('),source.indexOf('function ResearchCanvasRichNodeFrame('))
 const editor=source.slice(source.indexOf('function ResearchCanvasInlineContentEditor('),source.indexOf('function figmaCanvasBounds('))
 css=[...source.matchAll(/style\.textContent\s*=\s*("(?:\\.|[^"\\])*")/g)].map(m=>JSON.parse(m[1])).join('\n')
 const result=await build({stdin:{resolveDir:process.cwd(),contents:`import * as react from 'react';import * as react_dom from 'react-dom';import * as react_jsx_runtime from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';const researchCanvasArtifactContentEditable=()=>true;${menu}\n${editor}\nwindow.start=()=>{createRoot(document.getElementById('menu')).render(react.createElement(ResearchCanvasFrameMenu,{node:{id:'test',kind:'assistant-result',title:'内容'},onAction:()=>{window.acted=true}}));createRoot(document.getElementById('editor')).render(react.createElement(ResearchCanvasInlineContentEditor,{nodeId:'test',value:'Some editable content',onCommit:()=>true,onCancel:()=>{}}));};`},bundle:true,write:false,platform:'browser'})
 script=result.outputFiles[0].text
 const {chromium}=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(async()=>browser?.close())
it.each([false,true])('keeps the menu reachable and the editor filling the component, expanded=%s',async expanded=>{
 const page=await browser.newPage({viewport:{width:1200,height:800}})
 try {
  await page.setContent('<dialog style="width:900px;height:650px"><div id="menu"></div><div data-research-compact-chrome style="width:640px;height:400px"><div class="rScV5Q_previewBody" style="height:100%"><div id="editor" class="rScV5Q_artifactBody"></div></div></div></dialog>')
  await page.addStyleTag({content:css})
  await page.evaluate(expanded=>{const d=document.querySelector('dialog');expanded?d.showModal():d.show()},expanded)
  await page.addScriptTag({content:script});await page.evaluate(()=>window.start())
  const input=page.locator('textarea');await input.waitFor()
  const box=await input.boundingBox();expect(box.height).toBeGreaterThan(350);expect(box.width).toBeGreaterThan(570)
  await page.locator('#menu button').first().click()
  const menu=page.locator('[role=menu]');await menu.waitFor({state:'visible'})
  expect(await menu.evaluate(e=>e.closest('dialog')!==null)).toBe(true)
  const item=page.locator('[role=menuitem]').first();await item.click()
  expect(await page.evaluate(()=>window.acted)).toBe(true)
 } finally {await page.close()}
})
