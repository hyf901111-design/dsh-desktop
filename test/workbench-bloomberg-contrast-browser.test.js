import {afterAll,beforeAll,expect,it} from 'vitest'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {renderCartesianChart} from '../packages/dsh-research-task-runtime/cartesian-chart-artifact.js'
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js'

let browser,script,style
const evidence='/tmp/workbench-bloomberg-contrast-20261025'
const chart={version:1,type:'chart',variant:'bar',title:'季度对比',labels:['第一季度','第二季度','第三季度'],series:[{name:'收入',values:[16,24,28]},{name:'利润',values:[8,12,15]}]}
const text='# 研究观察框架\n- 盈利质量\n  - 现金流与利润匹配\n- 风险信号\n  - 跟踪估值与预期变化'
beforeAll(async()=>{
 const resident=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const anchor='exports.ResearchCanvas = ResearchCanvas;'
 if(resident.split(anchor).length!==2)throw Error('Actual native ResearchCanvas export changed')
 // Execute the installed renderer and its real stylesheet layers. Only expose
 // existing component functions; service/transport modules remain out of scope.
 const client=resident.replace(anchor,'exports.__Contrast={Chart:ResearchContainerChart,Map:ResearchMindMap,DerivedMap:ResearchDerivedMindMap,outline:researchDerivedOutline};'+anchor)
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import * as JSX from 'react/jsx-runtime';import * as DOM from 'react-dom';import {createRoot} from 'react-dom/client';
 let descriptor;window.__ModuleLoader__={load:value=>descriptor=value};new Function(${JSON.stringify(client)})();
 const unused=new Proxy(function(){},{get:()=>unused,apply:()=>unused,construct:()=>({})});
 const lib=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?DOM:unused).__Contrast;
 window.chartSpec=${JSON.stringify(chart)};window.mapText=${JSON.stringify(text)};
 createRoot(document.querySelector('#chart')).render(<lib.Chart spec={window.chartSpec}/>);
 for(const kind of ['ordinary','derived','legacy']){const root=createRoot(document.querySelector('#'+kind));
  const render=value=>root.render(kind==='derived'?<lib.DerivedMap nodeId={kind} outline={lib.outline(value)} content={value} readOnly={false} onCommit={render}/>:<lib.Map nodeId={kind} text={value} onNodeLabelCommit={(line,label)=>{const lines=value.split('\\n');lines[line]=lines[line].replace(/^(#+ | *[-*+] ).*$/,'$1'+label);render(lines.join('\\n'))}}/>);render(window.mapText);
 }
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})
 script=result.outputFiles[0].text;style=await readFile(process.env.SHERLOCK_BLOOMBERG_STYLE_FILE||'scripts/lib/workbench-style.css','utf8')
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await pw.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(async()=>browser?.close())
const shell=()=>`<main data-research-canvas data-ework-grid data-workbench-style="openterminal">
 <article data-research-node-id="chart" data-research-artifact-card data-research-compact-chrome data-research-generated-container><header class="ew-grid-header">分组柱状图</header><div class="rScV5Q_containerContent" data-research-container-type="chart" id="chart"></div></article>
 ${['ordinary','derived','legacy'].map(kind=>`<article data-research-node-id="${kind}" data-research-artifact-card data-research-compact-chrome ${kind==='legacy'?'data-research-generated-mind-map':'data-research-generated-container'}><header class="ew-grid-header">${kind} 思维导图</header><div ${kind==='legacy'?'class="rScV5Q_artifactBody"':'class="rScV5Q_containerContent"'} id="${kind}"></div></article>`).join('')}</main>`
async function mount(page,apply=true){
 await page.setContent(shell());await page.addScriptTag({content:script})
 await page.addStyleTag({content:'html,body{margin:0}main[data-ework-grid]{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px;min-height:100vh;box-sizing:border-box}article[data-research-node-id]{position:relative!important;box-sizing:border-box;width:100%;height:300px;overflow:hidden;display:flex;flex-direction:column}article .ew-grid-header{position:relative!important;flex:none;padding:8px;height:34px;box-sizing:border-box}article>.rScV5Q_containerContent,article>.rScV5Q_artifactBody{min-height:0;flex:1;overflow:auto}.rScV5Q_containerChart{height:100%}.rScV5Q_containerChart>svg{flex:1}.rScV5Q_mindMap{min-height:180px!important}'});
 if(apply)await page.addStyleTag({content:style})
 await page.locator('#chart .rScV5Q_chartLegend button').first().waitFor()
 for(const kind of ['ordinary','derived','legacy'])await expect.poll(()=>page.locator('#'+kind+' [data-research-mind-map-edges] path').getAttribute('d')).toMatch(/^M/)
}
const contrast=(a,b)=>{
 const luminance=value=>{const rgb=value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]}
 const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)
}
async function colors(locator){return locator.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,border:s.borderColor,borderWidth:parseFloat(s.borderWidth),opacity:Number(s.opacity),outline:s.outlineColor}})}

it('keeps actual native visible-series legends readable without recoloring swatches or hiding data',async()=>{
 const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 try{
  await mount(page);const buttons=page.locator('#chart .rScV5Q_chartLegend button'),swatches=buttons.locator('i')
  const samples=await buttons.evaluateAll(nodes=>nodes.map(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color}}))
  const phase=process.env.SHERLOCK_BLOOMBERG_EVIDENCE_PHASE||'current'
  await page.screenshot({path:evidence+'/'+phase+'.png',fullPage:true});await writeFile(evidence+'/'+phase+'-legend.json',JSON.stringify(samples,null,2))
  // aria-pressed is series visibility, not a primary action. A 1.84:1 gray
  // label on orange is the bug this real renderer/cascade regression catches.
  expect(samples[0].background).toBe('rgba(0, 0, 0, 0)')
  expect(contrast(samples[0].color,'rgb(10, 10, 10)')).toBeGreaterThanOrEqual(4.5)
  expect(await swatches.evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).backgroundColor))).toEqual(['rgb(255, 153, 0)','rgb(79, 195, 247)'])
  const before=await page.locator('#chart .odyssey-native-chart-data').textContent()
  await buttons.last().click();expect(await buttons.last().getAttribute('aria-pressed')).toBe('false');expect((await colors(buttons.last())).opacity).toBeLessThan(.5)
  expect(await page.locator('#chart svg rect').count()).toBe(3)
  await buttons.last().click();expect(await buttons.last().getAttribute('aria-pressed')).toBe('true');expect((await colors(buttons.last())).opacity).toBe(1)
  expect(await page.locator('#chart svg rect').count()).toBe(6)
  await buttons.first().focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab')
  expect((await colors(buttons.first())).outline).toBe('rgb(255, 153, 0)')
  expect(await page.locator('#chart .odyssey-native-chart-data').textContent()).toBe(before);expect(await page.evaluate(()=>window.chartSpec)).toEqual(chart);expect(errors).toEqual([])
 }finally{await page.close()}
})

for(const kind of ['ordinary','derived','legacy'])it(`separates ${kind} native mind-map nodes while retaining native edit focus and orange card selection`,async()=>{
 const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'})
 try{
  await mount(page,false);const nodes=page.locator('#'+kind+' [data-research-mind-map-node]'),node=nodes.first()
  await node.dblclick();const editor=page.locator('#'+kind+' textarea');await editor.waitFor();const originalEditor=await colors(editor);await editor.press('Escape')
  await page.addStyleTag({content:style});const sample=await colors(node)
  await writeFile(evidence+'/'+(process.env.SHERLOCK_BLOOMBERG_EVIDENCE_PHASE||'current')+'-'+kind+'.json',JSON.stringify(sample,null,2))
  expect(await nodes.count()).toBeGreaterThanOrEqual(3)
  expect(contrast(sample.background,'rgb(10, 10, 10)')).toBeGreaterThanOrEqual(1.3)
  expect(sample.borderWidth).toBeGreaterThanOrEqual(1);expect(contrast(sample.border,'rgb(10, 10, 10)')).toBeGreaterThanOrEqual(3)
  expect(contrast(sample.color,sample.background)).toBeGreaterThanOrEqual(7)
  const path=page.locator('#'+kind+' [data-research-mind-map-edges] path'),edge=await path.evaluate(el=>{const s=getComputedStyle(el);return {stroke:s.stroke,opacity:s.opacity,strokeOpacity:s.strokeOpacity}})
  expect(contrast(edge.stroke,'rgb(10, 10, 10)')).toBeGreaterThanOrEqual(7);expect(edge.opacity).toBe('1');expect(edge.strokeOpacity).toBe('1')
  await page.locator('article[data-research-node-id="'+kind+'"]').evaluate(el=>el.dataset.selected='true')
  expect((await colors(page.locator('article[data-research-node-id="'+kind+'"]'))).border).toBe('rgb(179, 107, 0)')
  await node.dblclick();await editor.waitFor();await editor.focus()
  expect(await colors(editor)).toEqual(originalEditor)
  await editor.press('Escape');expect(await page.evaluate(()=>window.mapText)).toBe(text)
 }finally{await page.close()}
})

it('leaves light, dark and EFund native states unchanged and preserves the HTML grouped-bar legend exception',async()=>{
 const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'})
 try{
  await mount(page,false);const snapshot=async()=>({legend:await colors(page.locator('#chart .rScV5Q_chartLegend button').first()),maps:await Promise.all(['ordinary','derived','legacy'].map(kind=>colors(page.locator('#'+kind+' [data-research-mind-map-node]').first())))})
  const before={};for(const mode of ['light','dark','enterprise']){await page.locator('main').evaluate((el,mode)=>el.dataset.workbenchStyle=mode,mode);before[mode]=await snapshot()}
  await page.addStyleTag({content:style})
  for(const mode of ['light','dark','enterprise']){await page.locator('main').evaluate((el,mode)=>el.dataset.workbenchStyle=mode,mode);expect(await snapshot()).toEqual(before[mode])}
  const template=renderCartesianChart({...chart,variant:'groupedBar'})
  await page.setContent(buildResearchHtmlPreview(template.html,template.title,'dark',{workbench:true,notoFont:'runtime'}))
  const frame=page.frameLocator('iframe');await frame.locator('[data-chart-series]').first().waitFor();await frame.locator('html').evaluate(el=>el.dataset.workbenchStyle='openterminal')
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-interaction-state',readOnly:false,state:{version:'contrast-fixture',events:{}}},'*'))
  await frame.locator('html').evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)))
  const legend=frame.locator('[data-chart-series]').first(),visible=await colors(legend)
  expect(visible.background).toBe('rgba(0, 0, 0, 0)');expect(contrast(visible.color,'rgb(10, 10, 10)')).toBeGreaterThanOrEqual(4.5)
  await legend.click();expect(await legend.getAttribute('aria-pressed')).toBe('false');expect((await colors(legend)).opacity).toBeLessThan(.5)
 }finally{await page.close()}
},20000)
