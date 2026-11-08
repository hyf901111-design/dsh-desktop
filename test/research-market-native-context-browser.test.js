import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {retainTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {renderMarketArtifact} from '../packages/dsh-research-task-runtime/market-artifact.js'
import {parseResearchMarketNativeTable,ResearchMarketNativeTable,researchMarketNativeTableCss} from '../scripts/lib/research-market-native-table.mjs'
import {installWorkbenchTableColumns,WORKBENCH_TABLE_COLUMNS_CSS} from '../packages/dsh-research-task-runtime/workbench-table-columns.js'
import {WORKBENCH_DISCLOSURE_CSS} from '../packages/dsh-research-task-runtime/workbench-presentation.js'
import {researchCompletedDesignCss} from '../scripts/lib/research-completed-design.mjs'
import {installDefaultWebLinks} from '../scripts/lib/default-web-links-client.mjs'

// Frozen observed data and synthetic long note, in a fresh isolated headless
// page. No installed app, CDP, network, model call or source retrieval.
const observed=JSON.parse(readFileSync(new URL('./fixtures/workbench-native-valuation-observed.json',import.meta.url),'utf8'))
// This production-retained HTML is byte-identical to the observed persisted
// 79,846-character artifact (verified independently in the round1 report).
// Recreate the persisted pre-collapsible-note envelope. New long-note artifacts
// intentionally retain their richer iframe composition instead of projecting.
const legacyArtifact=model=>{const artifact=renderMarketArtifact(model);return {...artifact,html:artifact.html.replace('<details class="market-methodology"><summary>完整口径与说明</summary><span>','<span>').replace('</span></details><span>','</span><span>')}}
const saved=legacyArtifact(observed)
const persistedObserved=retainTemplateModel({...saved,html:saved.html.replace('aria-label="搜索表格内容" placeholder="搜索表格内容"','aria-label="搜索行情" placeholder="代码 / 名称 / 关键字"')},observed)
const longNote=observed.note+'续注 <脚本> & "原样文本"。'.repeat(200).slice(0,2000-observed.note.length-2)+'终点'
let browser,bundle
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),contents:`
  import * as React from 'react';import * as jsx from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
  const parse=new Function('return ('+${JSON.stringify(parseResearchMarketNativeTable.toString())}+')')();
  const Component=new Function('react','react_jsx_runtime','return ('+${JSON.stringify(ResearchMarketNativeTable.toString())}+')')(React,jsx);
  const root=createRoot(document.querySelector('#fixture'));
  window.renderNative=html=>{const data=parse(html,document);if(!data)throw Error('Host table unexpectedly fell back');flushSync(()=>root.render(React.createElement(Component,{data})));return data};
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})
 bundle=output.outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},15000)
afterAll(async()=>browser?.close())

it.each([[420,'light'],[420,'dark'],[1100,'light'],[1100,'dark']])('preserves native context and routes links with bounded reading at %i px in %s theme',async(width,theme)=>{
 const page=await browser.newPage({viewport:{width,height:560},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/*',route=>route.abort())
 try{
  await page.setContent(`<html><head><style>html,body{margin:0;width:100%;height:100%}body{background:${theme==='dark'?'#222':'#fff'}}#fixture{width:100%;height:100%}.card{width:100%;height:400px;box-sizing:border-box}</style></head><body ${theme==='dark'?'data-ds-dark-theme=""':''}><section class="card" data-research-compact-chrome data-research-generated-container data-research-artifact-card><main id="fixture" data-research-container-type="html"></main></section></body></html>`)
  await page.addStyleTag({content:researchCompletedDesignCss+researchMarketNativeTableCss+WORKBENCH_TABLE_COLUMNS_CSS+WORKBENCH_DISCLOSURE_CSS})
  await page.addScriptTag({content:bundle})
  expect(await page.locator('[data-research-artifact-card]').evaluate(el=>getComputedStyle(el).getPropertyValue('--research-completed-surface').trim())).toBe(theme==='dark'?'#11161c':'#ffffff')
  const actual=await page.evaluate(html=>window.renderNative(html),persistedObserved.html)
  expect(persistedObserved.html).toHaveLength(79846)
  expect(actual.columns).toEqual(observed.columns)
  expect(actual.rows.map(row=>row.map(cell=>cell.text))).toEqual(observed.rows)
  expect(await page.locator('.terminal-native-context-lines').textContent()).toBe(observed.asOf+observed.note)
  expect(await page.locator('.terminal-native-context-lines').isVisible()).toBe(false)
  expect((await page.locator('.terminal-native-context').boundingBox()).height).toBeLessThanOrEqual(34)
  await page.screenshot({path:`/tmp/workbench-native-persisted-valuation-${width}-${theme}.png`,fullPage:true})
  const source='https://example.com/source?x=1&y=2#original',detail='https://example.org/detail?code=300308&view=full'
  expect(longNote).toHaveLength(2000)
  const linkedModel={...observed,note:longNote,sources:[{label:'来源 <甲>',url:source},{label:'无链接来源'}],rowLinks:[detail,null,null]}
  const html=retainTemplateModel(legacyArtifact(linkedModel),linkedModel).html
  await page.evaluate(html=>window.renderNative(html),html)
  await page.addScriptTag({content:`window.disposeWidths=(${installWorkbenchTableColumns.toString()})(document.querySelector('#fixture'));window.opened=[];window.disposeLinks=(${installDefaultWebLinks.toString()})({documentTarget:document,bridge:{subscribe:()=>()=>{},openSource:async request=>window.opened.push(request)},sessions:{list:{getSnapshot:()=>({current:'fixture-session'})}}});`})
  const context=page.locator('.terminal-native-context'),wrap=page.locator('.fund-native-table-wrap'),headers=page.locator('thead th'),rows=page.locator('tbody tr')
  expect(await headers.first().locator('button').evaluate(el=>getComputedStyle(el,'::after').content)).toBe('"↕"')
  expect((await headers.first().boundingBox()).height).toBeLessThanOrEqual(28)
  expect(await context.locator('.terminal-native-context-lines').textContent()).toBe(observed.asOf+longNote+'来源 <甲> ↗ · 无链接来源')
  expect(await context.locator('.terminal-native-context-lines').isVisible()).toBe(false)
  const disclosure=context.locator('summary')
  const chevron=()=>disclosure.evaluate(el=>{
   const style=getComputedStyle(el,'::before')
   return {border:style.borderRightWidth,transform:style.transform,marker:getComputedStyle(el).listStyleType}
  })
  const closedChevron=await chevron()
  expect(closedChevron).toMatchObject({border:'1px',marker:'none'})
  await disclosure.click()
  expect(await context.locator('.terminal-native-context-lines').isVisible()).toBe(true)
  expect((await chevron()).transform).not.toBe(closedChevron.transform)
  expect(await page.locator('#sherlock-template-data').count()).toBe(0)
  expect(await page.locator('script').count()).toBe(2) // Only fixture and installers, never artifact scripts.
  expect(await page.locator('tbody tr:first-child td').nth(1).evaluate(el=>getComputedStyle(el).color)).toBe(theme==='dark'?'rgb(225, 232, 240)':'rgb(27, 39, 52)')
  expect(await page.locator('tbody td,thead th').evaluateAll(items=>items.every(el=>getComputedStyle(el).whiteSpace==='nowrap'))).toBe(true)
  const boxes=await page.locator('.terminal-native-filters,.fund-native-table-wrap,.terminal-native-context').evaluateAll(items=>items.map(el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom}}))
  expect(boxes[0].height).toBeGreaterThan(20);expect(boxes[1].height).toBeGreaterThan(90)
  expect(boxes[0].bottom).toBeLessThanOrEqual(boxes[1].y);expect(boxes[1].bottom).toBeLessThanOrEqual(boxes[2].y)
  expect(boxes[2].bottom).toBeLessThanOrEqual(400)
  expect(await context.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true)
  expect((await rows.first().boundingBox()).y).toBeLessThan(150)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  // Let the real document bubbling listener prevent navigation and use the session bridge.
  await page.locator('tbody a').click()
  expect(await page.evaluate(()=>window.opened)).toEqual([{sessionId:'fixture-session',url:detail}])
  expect(await rows.first().getAttribute('aria-selected')).toBe('false')
  expect(page.url()).toBe('about:blank')
  await page.locator('tbody a').focus();await page.keyboard.press('Enter')
  expect(await rows.first().getAttribute('aria-selected')).toBe('false')
  expect((await page.evaluate(()=>window.opened)).at(-1)).toEqual({sessionId:'fixture-session',url:detail})
  await context.locator('a').click()
  expect((await page.evaluate(()=>window.opened)).at(-1)).toEqual({sessionId:'fixture-session',url:source})
  expect(await rows.first().getAttribute('aria-selected')).toBe('false')
  // Links in the selected-row details retain href and use the same route.
  await rows.first().locator('td').nth(1).click()
  const readout=page.locator('.terminal-native-readout')
  expect(await readout.textContent()).toContain('38.43')
  await readout.locator('a').click()
  expect((await page.evaluate(()=>window.opened)).at(-1)).toEqual({sessionId:'fixture-session',url:detail})
  expect(await rows.first().getAttribute('aria-selected')).toBe('true')
  const readoutBox=await readout.boundingBox(),contextBox=await context.boundingBox(),wrapBox=await wrap.boundingBox()
  expect(wrapBox.y+wrapBox.height).toBeLessThanOrEqual(readoutBox.y)
  expect(readoutBox.y+readoutBox.height).toBeLessThanOrEqual(contextBox.y)
  expect(wrapBox.height).toBeGreaterThan(90)
  await context.evaluate(el=>el.scrollTop=el.scrollHeight)
  expect(await context.evaluate(el=>{const text=el.querySelector('.terminal-native-context-lines').children[1].firstChild,range=document.createRange();range.setStart(text,text.length-2);range.setEnd(text,text.length);const end=range.getBoundingClientRect(),box=el.getBoundingClientRect();return end.bottom<=box.bottom+1&&end.top>=box.top})).toBe(true)
  expect(await context.evaluate(el=>{const end=el.querySelector('.terminal-native-context-lines').lastElementChild;const b=end.getBoundingClientRect(),box=el.getBoundingClientRect();return b.bottom<=box.bottom+1&&b.top>=box.top})).toBe(true)
  await page.screenshot({path:`/tmp/workbench-native-persisted-long-note-${width}-${theme}.png`,fullPage:true})
  await headers.first().locator('button').click();await headers.first().locator('button').click()
  expect(await headers.first().locator('button').evaluate(el=>getComputedStyle(el,'::after').content)).toBe('"↓"')
  expect(await rows.first().locator('td').first().textContent()).toBe('601138')
  await page.getByRole('searchbox',{name:'搜索表格内容'}).fill('新易盛')
  expect(await rows.count()).toBe(1);expect(await rows.first().textContent()).toContain('新易盛')
  await page.getByRole('searchbox',{name:'搜索表格内容'}).fill('')
  expect(await rows.count()).toBe(3)
  const handle=headers.first().locator('[data-workbench-column-resize="0"]'),initial=Number(await handle.getAttribute('aria-valuenow'))
  await handle.focus();await page.keyboard.press('ArrowRight')
  expect(Number(await handle.getAttribute('aria-valuenow'))).toBe(initial+10)
  await page.keyboard.press('Home')
  const endHandle=headers.last().locator('[data-workbench-column-resize="7"]')
  await wrap.evaluate(el=>el.scrollLeft=el.scrollWidth)
  const hb=await endHandle.boundingBox(),old=Number(await endHandle.getAttribute('aria-valuenow'))
  await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down()
  await page.mouse.move(hb.x+hb.width/2-(old-90),hb.y+hb.height/2,{steps:5});await page.mouse.up()
  expect(Number(await endHandle.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(91)
  expect(await page.locator('tbody tr:first-child td').last().evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('normal')
  expect(await page.locator('tbody tr:first-child td').nth(1).evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('nowrap')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await context.locator('summary').focus();await page.keyboard.press('Enter')
  expect(await context.locator('.terminal-native-context-lines').isVisible()).toBe(false)
  expect(errors).toEqual([])
 }finally{await page.close()}
},20000)
