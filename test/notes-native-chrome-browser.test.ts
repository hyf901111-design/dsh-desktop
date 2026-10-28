import {afterAll,beforeAll,expect,it} from 'vitest'
import {writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'
import {notesResidentProductionSource} from './helpers/notes-resident-production-source.mjs'
let browser:any,script=''
const entry='\0notes-native-chrome-fixture',evidence=process.env.SHERLOCK_NOTES_CHROME_EVIDENCE
beforeAll(async()=>{
 const patched=notesResidentProductionSource()
 const native=patched.replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__NoteViews=EWorkNoteComponentViews;exports.__Chrome=WorkbenchChrome;exports.__Body=ResearchContainerBody;')
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const fixture:Plugin={name:'notes-native-chrome-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import React,{useState} from 'react';import * as JSX from 'react/jsx-runtime';import * as DOM from 'react-dom';import {createRoot} from 'react-dom/client';
 import {NativeComponentBlock} from ${JSON.stringify(resolve('src/preload/notes/native-component-block.tsx'))};
 import {financialWidgetDefaults} from ${JSON.stringify(resolve('packages/dsh-research-task-runtime/financial-widget-contract.js'))};
 import {financialIndexCatalog} from ${JSON.stringify(resolve('packages/dsh-research-task-runtime/financial-index-catalog.js'))};
 import {workbenchModeCss} from ${JSON.stringify(resolve('packages/dsh-research-task-runtime/workbench-style.js'))};
 import noteStyles from ${JSON.stringify(resolve('src/preload/notes/style.css')+'?inline')};import researchStyles from ${JSON.stringify(resolve('scripts/lib/research-grid-workbench.css')+'?inline')};import paletteStyles from ${JSON.stringify(resolve('scripts/lib/workbench-style.css')+'?inline')};import financialStyles from ${JSON.stringify(resolve('scripts/lib/financial-widget.css')+'?inline')};
 const factories=new Map();window.__ModuleLoader__={load:d=>factories.set(d.id,d.factory)};new Function(${JSON.stringify(native)})();class Service{};const noop=()=>null,primitives=new Proxy({},{get:()=>noop});
 const library=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?DOM:id==='@deepseek-ai/cordis'?{Service}:primitives);
 const style=document.createElement('style');style.textContent=[researchStyles,workbenchModeCss('body [data-ework-grid]'),paletteStyles,noteStyles,financialStyles].join(String.fromCharCode(10));document.head.append(style);
 const symbols=financialIndexCatalog().slice(0,18).map(({symbol},i)=>({...symbol,name:'合成指数 '+(i+1)+'：长名称验证完整内容与窄列布局'}));
 const spec=window.fixtureWidget==='quote'?financialWidgetDefaults('quote'):{...financialWidgetDefaults('indices'),symbols};window.fixtureCalls=[];window.fixtureChanges=[];
 window.dshDesktop={financialWidget:{request:async input=>{window.fixtureCalls.push(input);if(input.action==='search')return{symbols:[{market:'SH',code:'600519',name:'合成验收标的与完整搜索名称'}]};if(input.action==='bars')return{bars:[],source:'合成验收数据'};return{quotes:(input.symbols||[]).map((s,i)=>({...s,price:3000+i,changePercent:i%2?-1.25:2.5,quotedAt:'2026-10-28T11:51:00Z',source:'合成验收数据'})),source:'合成验收数据',receivedAt:'2026-10-28T11:51:01Z'}}}};
 const node={id:'note-indices',title:spec.title+(window.fixtureWidget==='quote'?'':' · 长标题用于验证与研究模式相同的裁切和按钮位置'),kind:'generated-container',noteLibrary:true,height:320,containerSpec:spec};let block={id:'note-block',type:'research',props:{payload:JSON.stringify(node)}};let setBlock;
 const editor={isEditable:true,getBlock:()=>block,removeBlocks:()=>{},updateBlock:(_id,value)=>{block={...block,props:{...block.props,...value.props}};window.fixtureChanges.push(block);setBlock(block)}};
 function Note(){const [current,update]=useState(block);setBlock=update;return React.createElement(NativeComponentBlock,{block:current,node:JSON.parse(current.props.payload),context:{editor,bridge:{request:async()=>({})},sessionId:'notes-chrome',dark:window.fixtureDark}})}
 createRoot(document.querySelector('#note')).render(React.createElement(Note));createRoot(document.querySelector('#note-portals')).render(React.createElement(library.__NoteViews,{sessionId:'notes-chrome',active:true}));
 const referenceNode={...node,id:'research-indices'};createRoot(document.querySelector('#research')).render(React.createElement(React.Fragment,null,React.createElement(library.__Chrome,{node:referenceNode,sessionId:'research-chrome',selected:false,readOnly:false}),React.createElement('div',{'data-research-preview-body':''},React.createElement(library.__Body,{node:referenceNode,sessionId:'research-chrome',visible:true}))));
 `:undefined}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 script=(Array.isArray(output)?output:[output]).flatMap(value=>'output'in value?value.output:[]).filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n')
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>browser?.close())
async function fixture(width:number,dark:boolean,widget='indices'){
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors:string[]=[];page.setDefaultTimeout(4000);page.on('pageerror',(error:Error)=>errors.push(error.message));page.on('console',(message:any)=>{if(message.type()==='error')errors.push(message.text())})
 await page.route('http://127.0.0.1/notes-chrome',(route:any)=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-odyssey-locale="zh"><body style="margin:0;padding:24px;display:flex;gap:32px;background:${dark?'#09090b':'#edf0f3'}"><section class="en-root" data-dark="${dark}" style="position:relative;width:${width}px;flex:none;height:700px"><div id="note" class="en-editor-host" style="width:100%"></div></section><div id="note-portals"></div><div data-ework-grid data-workbench-style="${dark?'dark':'light'}" style="width:${width}px;flex:none"><section id="research" data-research-node-id="research-indices" style="height:320px"><style>#research>[data-research-preview-body]{height:286px;min-height:0;overflow:auto}</style></section></div></body></html>`}))
 await page.route('**/fonts/NotoSansSC.woff2',(route:any)=>route.fulfill({contentType:'font/woff2',path:resolve('build/fonts/NotoSansSC.woff2')}))
 await page.goto('http://127.0.0.1/notes-chrome');await page.evaluate(({dark,widget}:any)=>{(window as any).fixtureDark=dark;(window as any).fixtureWidget=widget;if(dark)document.body.dataset.dsDarkTheme='true'},{dark,widget});await page.addScriptTag({content:'var exports={};\n'+script})
 await page.locator('.en-native-component-heading').waitFor();await page.locator('#research .ew-grid-header').waitFor();return {context,page,errors}
}
it.each([{width:500,dark:false},{width:320,dark:true}])('uses the Research frame and header and keeps only resize controls when selected at $width px',async({width,dark})=>{
 const f=await fixture(width,dark);try{
  await f.page.locator('.en-native-component-heading strong').click()
  expect(await f.page.getByRole('separator',{name:'调整组件宽度',exact:true}).count()).toBe(1)
  expect.soft(await f.page.getByLabel('组件样式',{exact:true}).count()).toBe(0)
  const styles=await f.page.evaluate(()=>{const note=document.querySelector<HTMLElement>('.en-native-component')!,reference=document.querySelector<HTMLElement>('#research')!,read=(element:HTMLElement)=>{const header=element.querySelector<HTMLElement>('header')!,title=header.querySelector<HTMLElement>('strong,.ew-grid-title-copy')!,button=header.querySelector<HTMLElement>('button')!,close=header.querySelector<HTMLElement>(':scope>button:last-child')!,icon=close.querySelector<HTMLElement>('svg,.ew-grid-icon')!,a=getComputedStyle(element),h=getComputedStyle(header),t=getComputedStyle(title),c=getComputedStyle(close);return{border:a.borderTopWidth,radius:a.borderTopLeftRadius,height:element.getBoundingClientRect().height,headerHeight:header.getBoundingClientRect().height,padding:h.paddingLeft,fontSize:t.fontSize,fontWeight:t.fontWeight,lineHeight:t.lineHeight,buttonWidth:button.getBoundingClientRect().width,buttonHeight:button.getBoundingClientRect().height,closeOpacity:c.opacity,closeColor:c.color,closeIconWidth:icon.getBoundingClientRect().width,bg:a.backgroundColor,color:h.color}};return{note:read(note),reference:read(reference)}})
  expect.soft(styles.note).toEqual(styles.reference)
  if(evidence){writeFileSync(resolve(evidence,`notes-chrome-${width}.json`),JSON.stringify(styles,null,2));await f.page.screenshot({path:resolve(evidence,`notes-chrome-${width}-${dark?'dark':'light'}.png`)})}
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it.each([{width:500,dark:false},{width:320,dark:true}])('keeps the actual quote title, search and controls inside the shared 34px header at $width px',async({width,dark})=>{
 const f=await fixture(width,dark,'quote');try{
  const header=f.page.locator('.en-native-component>.en-research-header'),reference=f.page.locator('#research>.ew-grid-header')
  expect.soft(await header.locator('.ew-grid-title').count()).toBe(1)
  expect.soft(await header.locator('.ew-grid-title').getAttribute('data-ui-system-title')).toBe(await reference.locator('.ew-grid-title').getAttribute('data-ui-system-title'))
  expect.soft((await header.boundingBox())!.height).toBe((await reference.boundingBox())!.height)
  const readTitle=(root:HTMLElement)=>{const title=root.querySelector<HTMLElement>('.ew-grid-title')!,style=getComputedStyle(title);return{display:style.display,maxWidth:style.maxWidth,font:style.font,color:style.color}}
  expect.soft(await header.evaluate(readTitle)).toEqual(await reference.evaluate(readTitle))
  const selector=header.locator('.ew-financial-header-selector');await selector.click()
  const input=selector.locator('input');await input.fill('600519');await f.page.getByRole('option').filter({hasText:'合成验收标的'}).first().waitFor()
  const sizes=await header.evaluate((root:HTMLElement)=>{const rect=root.getBoundingClientRect(),controls=Array.from(root.querySelectorAll<HTMLElement>('input,button,.ew-financial-header-selector')).map(element=>{const r=element.getBoundingClientRect();return{tag:element.tagName,top:r.top,bottom:r.bottom,left:r.left,right:r.right}});return{header:{top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right},controls}})
  expect(sizes.header.bottom-sizes.header.top).toBe(34)
  for(const control of sizes.controls){expect.soft(control.top,JSON.stringify(control)).toBeGreaterThanOrEqual(sizes.header.top);expect.soft(control.bottom,JSON.stringify(control)).toBeLessThanOrEqual(sizes.header.bottom);expect.soft(control.left,JSON.stringify(control)).toBeGreaterThanOrEqual(sizes.header.left);expect.soft(control.right,JSON.stringify(control)).toBeLessThanOrEqual(sizes.header.right)}
  if(evidence){writeFileSync(resolve(evidence,`notes-quote-search-${width}.json`),JSON.stringify(sizes,null,2));await f.page.screenshot({path:resolve(evidence,`notes-quote-search-${width}-${dark?'dark':'light'}.png`)})}
  await f.page.getByRole('option').filter({hasText:'合成验收标的'}).first().click();await expect.poll(()=>f.page.evaluate(()=>(window as any).fixtureChanges.at(-1)?.props.payload)).toContain('600519')
  expect(await f.page.getByLabel('组件样式',{exact:true}).count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
it.each([{width:500,dark:false},{width:320,dark:true}])('keeps a long indices body scrollable and its footer inside the Notes frame at $width px',async({width,dark})=>{
 const f=await fixture(width,dark);try{
  await expect.poll(()=>f.page.locator('.en-native-component .ew-indices-grid>div').count()).toBeGreaterThan(5)
  await f.page.locator('.en-native-component .en-component-scroll-guard').click()
  const result=await f.page.locator('.en-native-component').evaluate((root:HTMLElement)=>{const host=root.querySelector<HTMLElement>('.en-native-component-host')!,list=root.querySelector<HTMLElement>('.ew-indices-grid')!,footer=root.querySelector<HTMLElement>('.ew-financial-footer')!,a=root.getBoundingClientRect(),b=footer.getBoundingClientRect();list.scrollTop=list.scrollHeight;return{width:host.clientWidth,scrollWidth:host.scrollWidth,overflow:getComputedStyle(list).overflowY,scrollTop:list.scrollTop,clientHeight:list.clientHeight,scrollHeight:list.scrollHeight,footer:{top:b.top,bottom:b.bottom,left:b.left,right:b.right},frame:{top:a.top,bottom:a.bottom,left:a.left,right:a.right}}})
  expect(result.scrollWidth).toBeLessThanOrEqual(result.width);expect(result.scrollHeight).toBeGreaterThan(result.clientHeight);expect(result.scrollTop).toBeGreaterThan(0);expect(['auto','scroll']).toContain(result.overflow);expect(result.footer.bottom).toBeLessThanOrEqual(result.frame.bottom+1);expect(result.footer.left).toBeGreaterThanOrEqual(result.frame.left);expect(result.footer.right).toBeLessThanOrEqual(result.frame.right)
  if(evidence){writeFileSync(resolve(evidence,`notes-indices-overflow-${width}.json`),JSON.stringify(result,null,2));await f.page.screenshot({path:resolve(evidence,`notes-indices-overflow-${width}-${dark?'dark':'light'}.png`)})}
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
})
