import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile,mkdir} from 'node:fs/promises'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {patchTaskProgressClient} from '../scripts/lib/task-progress-client.mjs'

let browser,entry,source,shellEntry,runtime,conversation
const evidence='/tmp/ework-task-continuation-browser-20261031'
beforeAll(async()=>{
 await mkdir(evidence,{recursive:true})
 const original=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),patched=patchTaskProgressClient(original),start=patched.indexOf('function TodoPanel('),end=patched.indexOf('\n\t\t/**',patched.indexOf('function TodoDock(',start))
 source=patched.slice(start,end)
 runtime=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 // Expose the actual private shell in this isolated browser fixture only. The
 // SDK on disk is never changed, and the same public actions drive TodoDock.
 conversation=patched.replace('exports.apply = apply;','exports.__testShell=SessionInputShell;exports.apply = apply;')
 shellEntry=(await build({stdin:{contents:`
import * as react from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import{createRoot}from'react-dom/client';
let fake;fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
const modules=id=>id==='react'?react:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/cordis'?{Service:class{constructor(ctx){this.ctx=ctx}}}:fake;
const rt=window.runtimeDescriptor.factory(modules),native=window.conversationDescriptor.factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?rt:modules(id));
const Dock=new Function('react','react_jsx_runtime','useOdysseyCompactTasks','TodoPanel_module_css_default','OdysseyTaskStatus','OdysseyTaskSheet','odysseyTaskObjective','odysseyTaskVisibleText','_deepseek_ai_dsh_client_ui_primitives',window.inputSource+';return TodoDock;')(react,jsx,()=>false,new Proxy({},{get:(_v,key)=>String(key)}),()=>null,()=>null,()=>null,()=>null,{IconChevronDownOutline14:()=>null});
const attempts=[];let shell; shell=new native.__testShell({sharedSubmit(){attempts.push({draft:shell.snapshot.draft,phase:shell.snapshot.phase});shell.notify('error','共享研究执行尚未就绪，输入已保留。');return true}});
const todos=[{content:'核验并交付',status:'in_progress'}],root=createRoot(document.querySelector('#root'));
function App(){const input=react.useSyncExternalStore(shell.state.subscribe,shell.state.getSnapshot);return jsx.jsx(Dock,{useSession:select=>select({running:false}),useProjection:key=>key==='todos'?todos:null,useInput:select=>select(input),inputActions:shell.actions,t:k=>k})}root.render(jsx.jsx(App,{}));
window.probe={shell,attempts,draft(text){shell.actions.setDraft(text)},snapshot(){return{attempts:attempts.length,draft:shell.snapshot.draft,phase:shell.snapshot.phase}}};
`,resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text
 entry=(await build({stdin:{contents:`
import * as react from 'react';import * as jsx from 'react/jsx-runtime';import{createRoot}from'react-dom/client';
const native=new Function('react','react_jsx_runtime','useOdysseyCompactTasks','TodoPanel_module_css_default','OdysseyTaskStatus','OdysseyTaskSheet','odysseyTaskObjective','odysseyTaskVisibleText','_deepseek_ai_dsh_client_ui_primitives',window.inputSource+';return TodoDock;')(react,jsx,()=>false,new Proxy({},{get:(_v,key)=>String(key)}),({status,running})=>jsx.jsx('span',{'data-state':!running&&status==='in_progress'?'pending':status}),()=>null,()=>null,()=>null,{IconChevronDownOutline14:()=>null});
let running=false,todos=[{content:'读取资料',status:'completed'},{content:'渲染核验并交付',status:'in_progress'}],input={draft:'',phase:'plain',imageIds:[],occurrences:[]},version=0,mount=0;
const listeners=new Set(),calls=[],publish=()=>{version++;for(const fn of listeners)fn()},actions={setDraft(text){calls.push(['draft',text]);input={...input,draft:text};publish()},submit(){calls.push(['submit']);input={...input,phase:'submitting'};publish()}};
function App(){react.useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>version);return jsx.jsx(native,{useSession:select=>select({running}),useProjection:key=>key==='todos'?todos:null,useInput:select=>select(input),inputActions:actions,t:k=>k})}
const root=createRoot(document.querySelector('#root')),render=()=>root.render(jsx.jsx(App,{},mount));render();
window.probe={calls,draft(text){input={...input,draft:text,phase:'plain'};publish()},running(value){running=value;input={...input,draft:'',phase:'plain'};publish()},reopen(){mount++;input={draft:'',phase:'plain',imageIds:[],occurrences:[]};render()},completed(){todos=todos.map(t=>({...t,status:'completed'}));publish()}};
`,resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text
 const pw=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
it('can retry after the production SessionInputShell rejects submit without running, and never overwrites a new user draft',async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 try{
  await page.setContent('<html lang="zh"><body><main id="root"></main></body></html>')
  await page.evaluate(({runtime,conversation,source})=>{
   window.__ModuleLoader__={load:descriptor=>window.runtimeDescriptor=descriptor};new Function(runtime)()
   window.__ModuleLoader__={load:descriptor=>window.conversationDescriptor=descriptor};new Function(conversation)()
   window.inputSource=source
  },{runtime,conversation,source})
  await page.addScriptTag({content:shellEntry})
  const button=page.getByRole('button',{name:'继续未完成任务',exact:true})
  await button.waitFor();await button.click()
  await expect.poll(()=>page.evaluate(()=>window.probe.snapshot())).toMatchObject({attempts:1,phase:'plain'})
  expect((await page.evaluate(()=>window.probe.snapshot())).draft).toContain('核验并交付')
  await page.evaluate(()=>window.probe.draft('先保留这个新草稿'))
  expect(await button.isDisabled()).toBe(true)
  expect((await page.evaluate(()=>window.probe.snapshot())).draft).toBe('先保留这个新草稿')
  await page.evaluate(()=>window.probe.draft(''));await expect.poll(()=>button.isEnabled()).toBe(true)
  // Double clicks in one render must still produce exactly one new submission.
  await page.evaluate(()=>{const target=document.querySelector('[data-task-continue]');target.click();target.click()})
  await expect.poll(()=>page.evaluate(()=>window.probe.snapshot())).toMatchObject({attempts:2,phase:'plain'})
  expect(errors).toEqual([])
 }finally{await page.close()}
})
afterAll(async()=>await browser?.close())
it('renders the real task dock as unfinished, retains it after remount, and sends one explicit native continuation without replacing a draft',async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 try{
  await page.setContent('<html lang="zh"><body><div id="root"></div></body></html>')
  await page.evaluate(value=>window.inputSource=value,source);await page.addScriptTag({content:entry})
  const button=page.getByRole('button',{name:'继续未完成任务',exact:true})
  await expect.poll(()=>button.count()).toBe(1)
  expect(await page.getByTestId('todo-panel').innerText()).toContain('任务尚未完成 · 可继续')
  expect(await page.locator('[data-state="in_progress"]').count()).toBe(0)
  await page.evaluate(()=>window.probe.draft('用户未发送的草稿'));expect(await button.isDisabled()).toBe(true);expect(await page.evaluate(()=>window.probe.calls)).toEqual([])
  await page.evaluate(()=>window.probe.reopen());await expect.poll(()=>button.isEnabled()).toBe(true)
  await page.evaluate(()=>{const target=document.querySelector('[data-task-continue]');target.click();target.click()})
  const calls=await page.evaluate(()=>window.probe.calls)
  expect(calls).toHaveLength(2);expect(calls[0][1]).toContain('渲染核验并交付');expect(calls[0][1]).not.toContain('读取资料');expect(calls[1]).toEqual(['submit'])
  await page.evaluate(()=>window.probe.running(true));await expect.poll(()=>button.count()).toBe(0)
  await page.evaluate(()=>{window.probe.running(false);window.probe.completed()});await expect.poll(()=>button.count()).toBe(0)
  await page.screenshot({path:evidence+'/completed-dock.png'})
  expect(errors).toEqual([])
 }finally{await page.close()}
})
