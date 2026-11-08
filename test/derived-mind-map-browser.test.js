import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile,writeFile} from 'node:fs/promises'
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
for(const width of [380,900])it(`adapts connected hierarchy at ${width}px and keeps offscreen leaves reachable`,async()=>{
 const context=await browser.newContext({viewport:{width:width+20,height:900}}),page=await context.newPage(),errors=[]
 page.setDefaultTimeout(5000);page.on('pageerror',error=>{errors.push(error.message);console.error(error.stack)})
 try{
  await page.route('http://127.0.0.1/mind-map',route=>route.fulfill({contentType:'text/html',body:`<section data-research-compact-chrome style="width:${width}px"><div id="map" class="ew-derived-preset"></div></section>`}))
  await page.goto('http://127.0.0.1/mind-map');await page.addStyleTag({content:css});await page.addScriptTag({content:script})
  const map=page.locator('[data-research-mind-map]'),root=map.locator('[data-research-mind-map-depth="0"]'),branch=map.locator('[data-research-mind-map-depth="1"]').first(),leaf=map.locator('[data-research-mind-map-depth="2"]').first()
  await expect.poll(()=>map.locator('[data-research-mind-map-edges] path').getAttribute('d')).toMatch(/^M/)
  const boxes=await Promise.all([root,branch,leaf].map(node=>node.boundingBox()))
  if(width<840){expect(boxes[1].x).toBeGreaterThanOrEqual(boxes[0].x+boxes[0].width+20);expect(boxes[2].x).toBeGreaterThanOrEqual(boxes[1].x+boxes[1].width+20)}
  else{expect(await map.getAttribute('data-research-mind-map-layout')).toBe('wide');expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].y+boxes[0].height+20);expect(boxes[2].y).toBeGreaterThanOrEqual(boxes[1].y+boxes[1].height+20)}
  expect(await map.evaluate(el=>el.clientWidth)).toBeLessThanOrEqual(width)
  await leaf.dblclick();const input=page.getByRole('textbox',{name:'编辑思维导图节点'});await input.fill('半导体回升');await input.press('Enter')
  expect(await page.evaluate(()=>window.mapContent)).toContain('  - 半导体回升')
  await page.evaluate(()=>window.showMap('# 完整导图\n'+Array.from({length:60},(_,i)=>'- 分支'+i+'\n  - 证据'+i).join('\n'),true))
  await expect.poll(()=>map.locator('[data-research-mind-map-node]').count()).toBe(121)
  const last=map.getByText('证据59',{exact:true});await last.scrollIntoViewIfNeeded();expect(await last.isVisible()).toBe(true)
  await last.dblclick();expect(await map.locator('textarea').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)


it('reflows full six-branch hierarchies across the available width and restores compact layout without losing nodes or edges',async()=>{
 const context=await browser.newContext({viewport:{width:1700,height:1000}}),page=await context.newPage(),errors=[]
 page.setDefaultTimeout(5000);page.on('pageerror',error=>{errors.push(error.message);console.error(error.stack)})
 try{
  await page.route('http://127.0.0.1/adaptive-map',route=>route.fulfill({contentType:'text/html',body:'<section data-research-compact-chrome style="width:1600px"><div id="map" class="ew-derived-preset"></div></section>'}))
  await page.goto('http://127.0.0.1/adaptive-map');await page.addStyleTag({content:css});await page.addScriptTag({content:script})
  await page.evaluate(()=>window.showMap('# 完整机构\n'+Array.from({length:6},(_,i)=>'- 管理层'+i+'\n  - 负责人'+i+'、完整职责及来源说明'.repeat(i+1)+'\n  - 原始依据'+i).join('\n')))
  const map=page.locator('[data-research-mind-map]'),nodes=map.locator('[data-research-mind-map-node]'),path=map.locator('[data-research-mind-map-edges] path')
  await expect.poll(()=>map.getAttribute('data-research-mind-map-layout')).toBe('wide')
  const content=await nodes.allTextContents(),wideHeight=await map.evaluate(el=>el.scrollHeight)
  expect(content).toHaveLength(19)
  const boxes=await nodes.evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}}))
  for(let i=0;i<boxes.length;i++)for(let j=0;j<i;j++)expect(boxes[i].x>=boxes[j].right-1||boxes[j].x>=boxes[i].right-1||boxes[i].y>=boxes[j].bottom-1||boxes[j].y>=boxes[i].bottom-1).toBe(true)
  expect(await map.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  expect(await map.evaluate(el=>[...el.querySelectorAll('[data-research-mind-map-node]')].every(n=>n.getBoundingClientRect().bottom<=el.getBoundingClientRect().bottom))).toBe(true)
  expect(boxes.at(-1).right-boxes[0].x).toBeGreaterThan(600)
  await expect.poll(async()=>(await path.getAttribute('d')).match(/M/g)?.length).toBe(18)
  const widePath=await path.getAttribute('d')
  await page.locator('section').evaluate(el=>{el.style.width='650px'})
  await expect.poll(()=>map.getAttribute('data-research-mind-map-layout')).toBe('compact')
  await expect.poll(()=>map.evaluate(el=>el.scrollHeight)).toBeGreaterThan(wideHeight)
  expect(await nodes.allTextContents()).toEqual(content)
  await expect.poll(()=>path.getAttribute('d')).not.toBe(widePath)
  await page.locator('section').evaluate(el=>{el.style.width='1600px'})
  await expect.poll(()=>map.getAttribute('data-research-mind-map-layout')).toBe('wide')
  await expect.poll(()=>map.evaluate(el=>el.scrollHeight)).toBe(wideHeight)
  expect(await nodes.allTextContents()).toEqual(content)
  if(process.env.SHERLOCK_TEST_EVIDENCE_DIR){await writeFile(process.env.SHERLOCK_TEST_EVIDENCE_DIR+'/adaptive-layout-metrics.json',JSON.stringify(await map.evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),height:getComputedStyle(el).height,overflow:getComputedStyle(el).overflow,scrollHeight:el.scrollHeight,scrollTop:el.scrollTop,parent:el.parentElement.getBoundingClientRect().toJSON(),nodes:[...el.querySelectorAll('[data-research-mind-map-node]')].map(n=>n.getBoundingClientRect().toJSON())}))));await page.screenshot({path:process.env.SHERLOCK_TEST_EVIDENCE_DIR+'/adaptive-six-branch-wide.png',fullPage:true})}
  expect(errors).toEqual([])
 }finally{await context.close()}
},20000)


it('renders all twelve levels and every connector without flattening deeper relationships',async()=>{
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 try{
  await page.setContent('<section data-research-compact-chrome style="width:1100px"><div id="map" class="ew-derived-preset"></div></section>');
  await page.addStyleTag({content:css});await page.addScriptTag({content:script});
  await page.evaluate(()=>window.showMap('# 完整体系\n'+Array.from({length:12},(_,i)=>'  '.repeat(i)+'- 第'+(i+1)+'层的完整节点').join('\n'),true));
  const map=page.locator('[data-research-mind-map]');
  await expect.poll(()=>map.locator('[data-research-mind-map-node]').count()).toBe(13);
  expect(await map.locator('[data-research-mind-map-depth="12"]').textContent()).toContain('第12层的完整节点');
  await expect.poll(async()=>(await map.locator('[data-research-mind-map-edges] path').getAttribute('d'))?.match(/M/g)?.length).toBe(12);
  await map.locator('[data-research-mind-map-depth="12"]').scrollIntoViewIfNeeded();
  expect(await map.locator('[data-research-mind-map-depth="12"]').isVisible()).toBe(true);
 }finally{await page.close()}
},15000);
