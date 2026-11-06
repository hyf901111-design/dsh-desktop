import {readFile,mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {build} from 'esbuild'
import {beforeAll,afterAll,it,expect} from 'vitest'
import {patchMessageEditClient,stripMessageEditClient} from '../scripts/lib/message-edit.mjs'
const require=createRequire(import.meta.url),evidence=resolve('output/message-edit')
let browser,source,bootstrap,css
beforeAll(async()=>{
 const original=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 source=patchMessageEditClient(original)
 expect(patchMessageEditClient(source)).toBe(source)
 expect(stripMessageEditClient(source)).toBe(stripMessageEditClient(original))
 source=source.replace('exports.UserStyleBubble = UserStyleBubble;','exports.UserStyleBubble = UserStyleBubble; exports.EditableUserMessage=EWorkEditableUserMessage;')
 css=[...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(m=>JSON.parse(m[1])).filter(s=>s.includes('gdEzaW_')||s.includes('p-xYUq_')).join('\n')
 bootstrap=(await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
 import * as React from 'react';import * as JSX from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';import{mountDesktopShellStyles}from'./src/preload/shell-style';
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 const primitives=new Proxy({Tooltip:({children})=>children,writeClipboard:async text=>{window.probe.copied=text;return true}}, {get:(o,k)=>o[k]??(()=>React.createElement('svg',{'data-icon':k}))});
 window.__ModuleLoader__={load:d=>window.descriptor=d};
 window.mountMessage=()=>{
  mountDesktopShellStyles(document);
  const client=window.descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?ReactDOM:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{ImageGallery:({images})=>React.createElement('div',{'data-attachments':images.length})}:fake);
  const root=createRoot(document.querySelector('#fixture')),listeners=new Set();let state={running:false,queue:[]};
  const useSession=selector=>React.useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>selector(state));
  window.probe={requests:[],copied:null};window.setRunning=running=>{state={...state,running};listeners.forEach(fn=>fn())};
  const node={kind:'user',data:{seq:7,time:Date.now(),source:{kind:'user'},content:[{type:'text',text:'请帮我检查这张图片。'},{type:'image',attachment:{attachmentId:'image-one'}}]}};
  ReactDOM.flushSync(()=>root.render(React.createElement(client.EditableUserMessage,{node,useSession,loadImage:async()=>'',openFile:()=>{},t:key=>({copy:'复制',copied:'已复制'}[key]||key),editMessage:async request=>{window.probe.requests.push(request);if(window.rejectSend)throw Error('模拟失败，草稿保留');await new Promise(r=>setTimeout(r,80))}})));
 };
 `},bundle:true,write:false,format:'iife',platform:'browser',plugins:[{name:'raw-css',setup(b){b.onResolve({filter:/\.css\?raw$/},a=>({path:a.path.startsWith('.')?resolve(a.resolveDir,a.path.slice(0,-4)):require.resolve(a.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:'export default '+JSON.stringify(await readFile(a.path,'utf8')),loader:'js'}))}}]})).outputFiles[0].text
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
async function mount(dark=false){
 const page=await browser.newPage({viewport:{width:950,height:500}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.setContent('<style>'+css+'body{padding:48px;font:15px system-ui;background:'+(dark?'#1f1f1f;color:#eee':'#f4f4f4;color:#222')+'}</style><body '+(dark?'data-ds-dark-theme':'')+'><main id="fixture"></main>')
 await page.addScriptTag({content:bootstrap});await page.addScriptTag({content:source});await page.evaluate(()=>window.mountMessage())
 await page.waitForSelector('[data-ework-user-message]');return{page,errors}
}
it.each([false,true])('shows timestamp and icons only on hover/focus, without shifting the bubble (dark=%s)',async dark=>{
 const{page,errors}=await mount(dark)
 try{
  const actions=page.locator('[data-ework-user-actions]'),before=await page.locator('.gdEzaW_bubble').boundingBox()
  expect(await actions.evaluate(e=>getComputedStyle(e).opacity)).toBe('0')
  await page.locator('.gdEzaW_bubble').hover();await page.waitForTimeout(150)
  expect(await actions.evaluate(e=>getComputedStyle(e).opacity)).toBe('1')
  expect(await page.locator('time').textContent()).toMatch(/^\d\d:\d\d$/)
  await page.getByRole('button',{name:'复制',exact:true}).click();expect(await page.evaluate(()=>window.probe.copied)).toBe('请帮我检查这张图片。')
  expect(await page.locator('.gdEzaW_bubble').boundingBox()).toEqual(before)
  await page.screenshot({path:resolve(evidence,'hover-'+dark+'.png')});expect(errors).toEqual([])
 }finally{await page.close()}
})
it('supports cancel, task races, multiline edit, attachment retention and single submit',async()=>{
 const{page,errors}=await mount(true)
 try{
  await page.locator('.gdEzaW_bubble').hover();await page.getByRole('button',{name:'编辑消息'}).click()
  await page.getByRole('textbox',{name:'编辑消息'}).fill('新内容\n第二行')
  await page.getByRole('button',{name:'取消',exact:true}).click();expect(await page.locator('.gdEzaW_bubble').textContent()).toContain('请帮我检查')
  await page.evaluate(()=>window.setRunning(true));expect(await page.getByRole('button',{name:'编辑消息'}).count()).toBe(0)
  await page.evaluate(()=>window.setRunning(false));await page.getByRole('button',{name:'编辑消息'}).click()
  await page.getByRole('textbox').fill('新内容\n第二行');await page.evaluate(()=>window.setRunning(true))
  expect(await page.getByRole('button',{name:'发送',exact:true}).isDisabled()).toBe(true)
  await page.evaluate(()=>window.setRunning(false));await page.screenshot({path:resolve(evidence,'editor.png')})
  await page.getByRole('textbox').press('Meta+Enter');await page.getByRole('textbox').press('Meta+Enter').catch(()=>{})
  await page.waitForTimeout(150)
  const requests=await page.evaluate(()=>window.probe.requests);expect(requests).toHaveLength(1);expect(requests[0].text).toBe('新内容\n第二行');expect(requests[0].content[1].attachment.attachmentId).toBe('image-one');expect(errors).toEqual([])
 }finally{await page.close()}
})
it('keeps the editor and draft after a rejected submission',async()=>{
 const{page}=await mount()
 try{await page.locator('.gdEzaW_bubble').hover();await page.getByRole('button',{name:'编辑消息'}).click();await page.getByRole('textbox').fill('保留草稿');await page.evaluate(()=>window.rejectSend=true);await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForSelector('[role=alert]');expect(await page.getByRole('textbox').inputValue()).toBe('保留草稿')}finally{await page.close()}
})
