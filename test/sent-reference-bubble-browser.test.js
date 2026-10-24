import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {patchSkillConversationPresentation} from '../scripts/lib/skill-presentation.mjs'

const evidence='/tmp/ework-sent-reference-bubbles-20261024'
const first='/ework-skill-0123456789abcdef',second='/ework-skill-fedcba9876543210'
const attachment='📎 文件：`/work/研报.pdf`'
const require=createRequire(import.meta.url)
let browser,source,bootstrap,nativeCss
beforeAll(async()=>{
 source=patchSkillConversationPresentation(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 nativeCss=[...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1])).filter(css=>css.includes('.gdEzaW_bubble')).join('\n')
 bootstrap=(await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
 import * as React from 'react';import * as JSX from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';import{mountDesktopShellStyles}from'./src/preload/shell-style';
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 const primitives=new Proxy({Tooltip:({children})=>children},{get:(target,key)=>target[key]??fake});
 window.__ModuleLoader__={load:descriptor=>window.descriptor=descriptor};
 window.mountSentBubble=text=>{
  mountDesktopShellStyles(document);
  const client=window.descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?ReactDOM:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{ImageGallery:()=>null}:fake);
  const root=createRoot(document.querySelector('#fixture'));window.probe={text,opened:[],copied:[]};
  const bubble=React.createElement(client.UserStyleBubble,{content:[{type:'text',text}],imageLoader:async()=>'',openFile:path=>window.probe.opened.push(path),t:key=>key,actions:raw=>React.createElement('button',{'data-copy-message':'',onClick:()=>window.probe.copied.push(raw)},'复制正文')});
  ReactDOM.flushSync(()=>root.render(bubble));
  window.dispatchEvent(new CustomEvent('sherlock:skill-presentation',{detail:{owner:'fixture',skills:[{invocationName:'ework-skill-0123456789abcdef',label:'efund-ppt-maker',name:'PPT制作助手'},{invocationName:'ework-skill-fedcba9876543210',label:'ework-equity-research',name:'权益研究'},{invocationName:'ework-skill-180a6a3f86f8942e',label:'efund-ppt-maker',name:'PPT制作助手'}],tools:[]}}));
  window.probe.dispose=()=>root.unmount();
 };
 `},bundle:true,write:false,format:'iife',platform:'browser',plugins:[{name:'raw-css',setup(b){b.onResolve({filter:/\.css\?raw$/},a=>({path:a.path.startsWith('.')?resolve(a.resolveDir,a.path.slice(0,-4)):require.resolve(a.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:'export default '+JSON.stringify(await readFile(a.path,'utf8')),loader:'js'}))}}]})).outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
async function fixture(text,{width=900,dark=false}={}){
 const page=await browser.newPage({viewport:{width,height:540},deviceScaleFactor:2}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.setContent(`<title>Native sent message references</title><style>${nativeCss}body{margin:16px;background:${dark?'#1f1f1f':'#f4f4f4'};font-family:system-ui}.sRp_messages{width:100%}</style><body ${dark?'data-ds-dark-theme':''}><main class="sRp_messages" id="fixture"></main></body>`)
 await page.addScriptTag({content:bootstrap});await page.addScriptTag({content:source});await page.evaluate(text=>window.mountSentBubble(text),text)
 await page.waitForSelector('.gdEzaW_bubble')
 return{page,errors,close:async()=>{await page.evaluate(()=>window.probe.dispose());await page.close()}}
}
async function metrics(page){return page.locator('.gdEzaW_bubble').evaluate(bubble=>{
 const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}
 const chips=[...bubble.querySelectorAll('[data-ref-chip]')].map(chip=>{const label=chip.querySelector('.gdEzaW_refChipLabel')??chip,range=document.createRange();range.selectNodeContents(label);const text=range.getBoundingClientRect(),box=chip.getBoundingClientRect();return{kind:chip.dataset.refChip,label:label.textContent,...rect(chip),textWidth:text.width,left:text.left-box.left,rightPadding:box.right-text.right}})
 const walker=document.createTreeWalker(bubble,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())if(!walker.currentNode.parentElement.closest('[data-ref-chip]'))nodes.push(walker.currentNode)
 const range=document.createRange(),text=nodes.find(node=>node.textContent.includes('请继续分析'));if(text){range.setStart(text,text.textContent.indexOf('请继续分析'));range.setEnd(text,text.textContent.indexOf('请继续分析')+1)}
 return{chips,text:bubble.textContent,prose:text?rect({getBoundingClientRect:()=>range.getBoundingClientRect()}):null,bubble:rect(bubble),overflow:bubble.scrollWidth>bubble.clientWidth,pageOverflow:document.documentElement.scrollWidth>innerWidth,newlines:nodes.map(node=>node.textContent).join('')}
})}
it.each([false,true])('sizes the actual sent skill chips to text with symmetric padding (dark=%s)',async dark=>{
 const f=await fixture(`${first} ${second} ${attachment} 请继续分析。`,{dark})
 try{
  const result=await metrics(f.page);await writeFile(`${evidence}/intrinsic-${dark?'dark':'light'}.json`,JSON.stringify(result,null,2));await f.page.screenshot({path:`${evidence}/intrinsic-${dark?'dark':'light'}.png`})
  for(const chip of result.chips.filter(chip=>chip.kind==='skill')){expect(Math.abs(chip.left-chip.rightPadding)).toBeLessThanOrEqual(1);expect(chip.width-chip.textWidth).toBeGreaterThanOrEqual(11.9);expect(chip.width-chip.textWidth).toBeLessThanOrEqual(12.1)}
  expect(result.overflow).toBe(false);expect(result.pageOverflow).toBe(false);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each([false,true])('flows a serialized leading two-skill/file run and following prose inline (dark=%s)',async dark=>{
 const wire=`${first}\n${second}\n${attachment}\n请继续分析这份材料，保留有意义的正文。`,f=await fixture(wire,{dark})
 try{
  const result=await metrics(f.page);await f.page.screenshot({path:`${evidence}/prefix-wide-${dark?'dark':'light'}.png`})
  expect(new Set(result.chips.map(chip=>Math.round(chip.y))).size).toBe(1)
  expect(result.prose.y).toBeLessThan(result.chips[2].bottom)
  expect(result.newlines).not.toContain('\n')
  await f.page.locator('[data-ref-chip="research-file"]').click();expect(await f.page.evaluate(()=>window.probe.opened)).toEqual(['/work/研报.pdf'])
  await f.page.locator('[data-copy-message]').click();expect(await f.page.evaluate(()=>window.probe.copied)).toEqual([wire.replace(first,'/efund-ppt-maker').replace(second,'/ework-equity-research')])
  expect(await f.page.evaluate(()=>window.probe.text)).toBe(wire)
  expect(await f.page.title()).toBe('Native sent message references');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each([false,true])('wraps compact references at narrow width without overflow or losing real paragraph breaks (dark=%s)',async dark=>{
 const wire=`${first}\n${second}\n${attachment}\n\n请继续分析第一段。\n这里是用户保留的下一行。\n\n这是用户保留的第二段。`,f=await fixture(wire,{width:360,dark})
 try{
  const result=await metrics(f.page);await f.page.screenshot({path:`${evidence}/prefix-narrow-${dark?'dark':'light'}.png`})
  expect(result.newlines).toBe('   请继续分析第一段。\n这里是用户保留的下一行。\n\n这是用户保留的第二段。')
  expect(result.overflow).toBe(false);expect(result.pageOverflow).toBe(false)
  for(const chip of result.chips)expect(chip.right).toBeLessThanOrEqual(result.bubble.right)
  expect(result.chips[1].x).toBeGreaterThan(result.chips[0].x)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each([
 `请继续分析。\n${first}\n${attachment}\n最后一行。`,
 `/unknown-command\n${attachment}\n请继续分析。`,
 `\n${first}\n${attachment}\n请继续分析。`,
 `${first} 请继续分析。\n${attachment}\n最后一行。`
])('preserves user-authored line boundaries outside a consecutive leading reference run: %s',async wire=>{
 const f=await fixture(wire)
 try{const result=await metrics(f.page);expect(result.newlines.match(/\n/g)?.length??0).toBe(wire.match(/\n/g)?.length??0);expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('compacts CRLF marker rows while preserving escaped file names and every later prose break',async()=>{
 const wire=`${first}\r\n📎 文件：\`/work/a\\\`b report.pdf\`\r\n请继续分析。\r\n第二行。`,f=await fixture(wire)
 try{const result=await metrics(f.page);expect(result.chips.map(chip=>chip.label)).toEqual(['/efund-ppt-maker','a`b report.pdf']);expect(result.newlines).toBe('  请继续分析。\r\n第二行。');expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('compacts only the known leading reference header, including its serialized blank separator',async()=>{
 const wire=`${first}\n\n${attachment}\n\n请继续分析。\n下一行。\n\n下一段。`,f=await fixture(wire)
 try{const result=await metrics(f.page);expect(result.newlines).toBe('  请继续分析。\n下一行。\n\n下一段。');expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it.each([false,true])('keeps a long sent file label intrinsic until the actual available width requires truncation (dark=%s)',async dark=>{
 const wire=`${first}\n📎 文件：\`/work/Vanguard-2026经济与市场展望.pdf\`\n\n请继续分析第一段。\n\n第二段仍独立。`,f=await fixture(wire,{dark})
 try{
  const wide=await metrics(f.page);expect(wide.chips[1].width).toBeGreaterThan(164);expect(wide.newlines).toBe('  请继续分析第一段。\n\n第二段仍独立。');await f.page.screenshot({path:`${evidence}/long-file-wide-${dark?'dark':'light'}.png`})
  await f.page.setViewportSize({width:360,height:540});const narrow=await metrics(f.page);expect(narrow.overflow).toBe(false);expect(narrow.pageOverflow).toBe(false);await f.page.screenshot({path:`${evidence}/long-file-narrow-${dark?'dark':'light'}.png`})
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it.each([false,true])('compacts a standalone known skill header but retains every break after prose starts (dark=%s)',async dark=>{
 const f=await fixture(`${first}\n\n请继续分析。\n第二行。\n\n第二段。`,{dark})
 try{expect((await metrics(f.page)).newlines).toBe(' 请继续分析。\n第二行。\n\n第二段。');expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it('does not compact ordinary Research text whose reference offsets are authoritative',async()=>{
 const body=`${first}\n${second}\n请继续分析。`,header={files:[{id:'f',name:'研报.pdf',path:'/work/研报.pdf'}],occurrences:[{fileId:'f',offset:body.length}]},f=await fixture('␞SHERLOCK_RESEARCH_FILES_V1 '+JSON.stringify(header)+'␟'+body)
 try{expect((await metrics(f.page)).newlines).toBe('\n\n请继续分析。');expect(f.errors).toEqual([])}finally{await f.close()}
},15000)
it.runIf(process.env.SENT_REFERENCE_REAL_SAMPLE).each([{width:900,dark:false},{width:900,dark:true},{width:360,dark:false},{width:360,dark:true}])('renders the supplied original persisted message without changing its prose: %j',async options=>{
 const wire=await readFile(process.env.SENT_REFERENCE_REAL_SAMPLE,'utf8'),body=wire.slice(wire.indexOf('\n\n')+2),f=await fixture(wire,options)
 try{
  const result=await metrics(f.page);expect(result.newlines).toBe('  '+body);expect(result.overflow).toBe(false);expect(result.pageOverflow).toBe(false);expect(await f.page.evaluate(()=>window.probe.text)).toBe(wire);expect(f.errors).toEqual([])
  await f.page.screenshot({path:`${evidence}/original-${options.width}-${options.dark?'dark':'light'}.png`,fullPage:true})
  await writeFile(`${evidence}/original-${options.width}-${options.dark?'dark':'light'}.json`,JSON.stringify(result,null,2))
 }finally{await f.close()}
},15000)
