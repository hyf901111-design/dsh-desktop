import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {renderMarketArtifact} from '../packages/dsh-research-task-runtime/market-artifact.js'
import {retainTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {parseResearchMarketNativeTable,ResearchMarketNativeTable,researchMarketNativeTableCss} from '../scripts/lib/research-market-native-table.mjs'

// The renderer and source HTML are production functions; only the rows and
// surrounding note are synthetic. No installed app, source fetch or model call.
const model={version:1,type:'market',variant:'table',title:'主题投影验证',asOf:'合成静态快照',columns:['名称','数值'],rows:[['样本甲','12.34'],['样本乙','56.78'],['样本丙','90.12']],tones:[['neutral','positive'],['neutral','negative'],['neutral','neutral']],note:'保留内容、日期及来源说明',sources:[{label:'合成来源',url:'https://example.com/source'}]}
const selectors={card:'#card',body:'#card .rScV5Q_containerBody',native:'#card [data-sherlock-market-native]',head:'#card th',heading:'#card th button',row:'#card tbody tr:nth-child(3)',alternate:'#card tbody tr:nth-child(2)',cell:'#card tbody tr:nth-child(3) td',input:'#card input',footer:'#card .terminal-native-context'}
let browser,bundle
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
 import {installNotePresentation} from './src/preload/notes/component-presentation';import {freezeNoteSnapshotElement} from './src/shared/note-component-snapshot';
 const parse=new Function('return ('+${JSON.stringify(parseResearchMarketNativeTable.toString())}+')')();
 const Component=new Function('react','react_jsx_runtime','return ('+${JSON.stringify(ResearchMarketNativeTable.toString())}+')')(React,jsx);
 const root=createRoot(document.querySelector('#native'));
 window.renderNative=html=>{const data=parse(html,document);if(!data)throw Error('Production native table projection unexpectedly fell back');flushSync(()=>root.render(React.createElement(Component,{data})));return data};
 window.applyPresentation=(style,dark)=>{window.disposePresentation?.();window.disposePresentation=installNotePresentation(document.querySelector('#card'),style,dark)};
 window.freezeNoteSnapshotElement=freezeNoteSnapshotElement;
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})
 bundle=output.outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},15000)
afterAll(async()=>browser?.close())

async function fixture(variant){
 const page=await browser.newPage({viewport:{width:1000,height:700},reducedMotion:'reduce'})
 await page.route('**/*',route=>route.abort())
 await page.setContent('<body data-ds-dark-theme><section class="en-root" data-dark="true" style="position:static"><section id="card" class="en-research en-native-component" style="width:800px"><header class="en-research-header">主题投影验证</header><div class="en-native-component-host" style="height:320px"><div class="rScV5Q_containerBody en-native-component-body"><div id="native" style="height:100%"></div></div></div></section><section id="other" class="en-research"><div data-sherlock-market-native="table"><div class="terminal-native-filters"><input aria-label="其他组件"></div></div></section><p id="prose">保留笔记正文</p></section></body>')
 // Load native global dark rules last, matching the problematic host override.
 await page.addStyleTag({content:readFileSync('src/preload/notes/style.css','utf8')+'\n'+researchMarketNativeTableCss})
 await page.addScriptTag({content:bundle})
 const spec=retainTemplateModel(renderMarketArtifact({...model,variant}),{...model,variant}),payload=JSON.stringify(spec)
 const parsed=await page.evaluate(({spec,payload})=>{window.payload=payload;return window.renderNative(spec.html)},{spec,payload})
 expect(parsed.rows.map(row=>row.map(cell=>cell.text))).toEqual(model.rows)
 return{page,payload,footer:parsed.footer.flat().map(part=>part.text).join('')}
}
const colors={
 enterprise:{surface:'rgb(255, 255, 255)',text:'rgb(60, 60, 60)',muted:'rgb(102, 102, 102)',row:'rgb(243, 245, 247)',heading:'rgb(30, 185, 225)',headingText:'rgb(255, 255, 255)',control:'rgb(244, 244, 246)',controlText:'rgb(37, 37, 43)'},
 light:{surface:'rgb(255, 255, 255)',text:'rgb(37, 37, 43)',muted:'rgb(119, 119, 129)',row:'rgb(244, 244, 246)',heading:'rgb(244, 244, 246)',headingText:'rgb(119, 119, 129)',control:'rgb(244, 244, 246)',controlText:'rgb(37, 37, 43)'},
 dark:{surface:'rgb(21, 21, 24)',text:'rgb(232, 232, 237)',muted:'rgb(160, 160, 171)',row:'rgb(36, 36, 43)',heading:'rgb(36, 36, 43)',headingText:'rgb(160, 160, 171)',control:'rgb(29, 29, 35)',controlText:'rgb(232, 232, 237)'},
 openterminal:{surface:'rgb(10, 10, 10)',text:'rgb(217, 217, 217)',muted:'rgb(128, 128, 128)',row:'rgb(10, 10, 10)',heading:'rgb(17, 17, 17)',headingText:'rgb(128, 128, 128)',control:'rgb(17, 17, 17)',controlText:'rgb(217, 217, 217)'}
}
it.each(['table','fund-holdings'])('uses each node palette in a dark note and freezes the same native %s appearance without changing source data',async variant=>{
 const {page,payload,footer}=await fixture(variant)
 try{
  const tones=await page.locator('#card [data-tone=positive],#card [data-tone=negative]').evaluateAll(items=>items.map(el=>getComputedStyle(el).color))
  for(const [theme,dark] of [['enterprise',true],['light',true],['dark',true],['openterminal',true],['auto',true],['auto',false]]){
   const mode=theme==='auto'?(dark?'dark':'light'):theme,expected=colors[mode]
   const unchanged=await page.evaluate(({theme,dark})=>{document.querySelector('.en-root').dataset.dark=String(dark);const other=document.querySelector('#other'),before={other:{background:getComputedStyle(other.firstElementChild).backgroundColor,input:getComputedStyle(other.querySelector('input')).backgroundColor},prose:getComputedStyle(document.querySelector('#prose')).color};window.applyPresentation({theme,titleBar:false},dark);return before},{theme,dark})
   const actual=await page.evaluate(selectors=>Object.fromEntries(Object.entries(selectors).map(([name,selector])=>{const el=document.querySelector(selector),s=getComputedStyle(el);return[name,{background:s.backgroundColor,color:s.color,border:s.borderBottomWidth}]})),selectors)
   expect(actual.card.background,mode+' card').toBe(expected.surface)
   expect(actual.body.background,mode+' body').toBe(expected.surface)
   expect(actual.native.background,mode+' native').toBe(expected.surface)
   expect(actual.native.color,mode+' native text').toBe(expected.text)
   expect(actual.head.background,mode+' heading').toBe(expected.heading)
   expect(actual.head.color,mode+' heading text').toBe(expected.headingText)
   expect(actual.heading.color,mode+' heading button').toBe(expected.headingText)
   expect(actual.row.background,mode+' row').toBe(expected.surface)
   expect(actual.alternate.background,mode+' alternate row').toBe(expected.row)
   expect(actual.cell.color,mode+' cell').toBe(expected.text)
   expect(actual.input.background,mode+' input').toBe(expected.control)
   expect(actual.input.color,mode+' input text').toBe(expected.controlText)
   expect(actual.footer.color,mode+' footer').toBe(expected.muted)
   if(variant==='table')expect(parseFloat(actual.head.border)).toBeGreaterThan(0)
   const frozen=await page.evaluate(async selectors=>{const frozen=await window.freezeNoteSnapshotElement(document.querySelector('#card'),'native-theme'),copy=new DOMParser().parseFromString(frozen.html,'text/html');return{styles:Object.fromEntries(Object.entries(selectors).map(([name,selector])=>{const el=copy.querySelector(selector);return[name,{background:el.style.backgroundColor,color:el.style.color}]})),text:copy.body.textContent,payload:window.payload,alias:document.querySelector('#card').style.getPropertyValue('--en-component-bg')}},selectors)
   for(const key of Object.keys(selectors))expect(frozen.styles[key],mode+' frozen '+key).toEqual({background:actual[key].background,color:actual[key].color})
   expect(frozen.text).toContain('样本甲');expect(frozen.text).toContain(footer);expect(frozen.text).not.toContain('主题投影验证')
   expect(frozen.payload).toBe(payload);expect(frozen.alias,mode+' padding surface alias').toBe(mode==='light'||mode==='enterprise'?'#fff':mode==='dark'?'#151518':'#0a0a0a')
   expect(await page.locator('#other').evaluate(el=>({background:getComputedStyle(el.firstElementChild).backgroundColor,input:getComputedStyle(el.querySelector('input')).backgroundColor}))).toEqual(unchanged.other)
   expect(await page.locator('#prose').evaluate(el=>getComputedStyle(el).color)).toBe(unchanged.prose)
   expect(await page.locator('#card [data-tone=positive],#card [data-tone=negative]').evaluateAll(items=>items.map(el=>getComputedStyle(el).color))).toEqual(tones)
  }
 }finally{await page.close()}
},15000)
