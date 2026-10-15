import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {patchDerivedPresetClient,derivedPresetCss} from '../scripts/lib/derived-preset-client.mjs'
import {canvasCss} from '../scripts/lib/figma-canvas-client.mjs'

let browser,script,css
beforeAll(async()=>{
 const client=patchDerivedPresetClient(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).replace('exports.ResearchCanvas = ResearchCanvas;','exports.__Map=ResearchDerivedMindMap;exports.__Outline=researchDerivedOutline;exports.ResearchCanvas = ResearchCanvas;')
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import * as JSX from 'react/jsx-runtime';import * as DOM from 'react-dom';import {createRoot} from 'react-dom/client';
 let descriptor;window.__ModuleLoader__={load:value=>descriptor=value};new Function(${JSON.stringify(client)})();
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});const lib=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?DOM:fake);
 window.mapContent='# 市场资讯\\n- 科技\\n  - 半导体承压\\n- 宏观\\n  - 人民币中间价6.7253';
 const root=createRoot(document.querySelector('#map'));window.showMap=(value=window.mapContent,readOnly=false)=>{window.mapContent=value;root.render(<lib.__Map nodeId="browser-map" outline={lib.__Outline(value)} content={value} readOnly={readOnly} onCommit={next=>window.showMap(next)}/>)};window.showMap();
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})
 script=output.outputFiles[0].text;css=canvasCss+'\n'+derivedPresetCss
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>browser?.close())
for(const width of [380,900])it(`renders connected horizontal hierarchy at ${width}px and keeps offscreen leaves reachable`,async()=>{
 const context=await browser.newContext({viewport:{width:width+20,height:900}}),page=await context.newPage(),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.route('http://127.0.0.1/mind-map',route=>route.fulfill({contentType:'text/html',body:`<section data-research-compact-chrome style="width:${width}px"><div id="map" class="ew-derived-preset"></div></section>`}))
  await page.goto('http://127.0.0.1/mind-map');await page.addStyleTag({content:css});await page.addScriptTag({content:script})
  const map=page.locator('[data-research-mind-map]'),root=map.locator('[data-research-mind-map-depth="0"]'),branch=map.locator('[data-research-mind-map-depth="1"]').first(),leaf=map.locator('[data-research-mind-map-depth="2"]').first()
  await expect.poll(()=>map.locator('[data-research-mind-map-edges] path').getAttribute('d')).toMatch(/^M/)
  const boxes=await Promise.all([root,branch,leaf].map(node=>node.boundingBox()))
  expect(boxes[1].x).toBeGreaterThanOrEqual(boxes[0].x+boxes[0].width+20);expect(boxes[2].x).toBeGreaterThanOrEqual(boxes[1].x+boxes[1].width+20)
  expect(await map.evaluate(el=>el.clientWidth)).toBeLessThanOrEqual(width)
  await leaf.dblclick();const input=page.getByRole('textbox',{name:'编辑思维导图节点'});await input.fill('半导体回升');await input.press('Enter')
  expect(await page.evaluate(()=>window.mapContent)).toContain('  - 半导体回升')
  await page.evaluate(()=>window.showMap('# 完整导图\n'+Array.from({length:60},(_,i)=>'- 分支'+i+'\n  - 证据'+i).join('\n'),true))
  await expect.poll(()=>map.locator('[data-research-mind-map-node]').count()).toBe(121)
  const last=map.getByText('证据59',{exact:true});await last.scrollIntoViewIfNeeded();expect(await last.isVisible()).toBe(true)
  await last.dblclick();expect(await map.locator('textarea').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
