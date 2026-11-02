import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {parse} from '@babel/parser'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {patchTaskProgressClient} from '../scripts/lib/task-progress-client.mjs'

const evidence='/tmp/sherlock-task-resume-card-footer-20261102/layout'
let browser,entry,css
beforeAll(async()=>{
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),source=patchTaskProgressClient(raw)
 const names=new Set(['TodoPanel','TodoDock','continueUnfinishedTask','odysseyTaskHeaderObjective','odysseyTaskObjective','odysseyTaskVisibleText','useOdysseyCompactTasks','OdysseyTaskSheet','OdysseyTaskStatus','PendingGlyph']),declarations=[],sidebarCss=[]
 const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='StringLiteral'&&node.value.startsWith('.sRp_root{')||node.type==='StringLiteral'&&node.value.startsWith('.wSkVaW_root{position:relative}'))sidebarCss.push(node.value);if(node.type==='FunctionDeclaration'&&names.has(node.id?.name))declarations.push(source.slice(node.start,node.end));if(node.type==='VariableDeclarator'&&node.id?.name==='TodoPanel_module_css_default')declarations.push('const '+source.slice(node.start,node.end)+';');for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value)};visit(parse(source,{sourceType:'script'}))
 expect(declarations).toHaveLength(names.size+1)
 css=[await readFile('node_modules/@deepseek-ai/dsh-client-ui-theme/lib/styles/design-platform.css','utf8'),...[...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1])),...sidebarCss,...await Promise.all(['figma-final-shell','figma-panels','figma-refinements','figma-reading'].map(name=>readFile('src/preload/'+name+'.css','utf8')))].join('\n')
 entry=(await build({stdin:{resolveDir:process.cwd(),contents:`import * as react from 'react';import * as react_jsx_runtime from 'react/jsx-runtime';import * as react_dom from 'react-dom';import{createRoot}from'react-dom/client';
 const _deepseek_ai_dsh_client_ui_primitives={IconChevronDownOutline14:()=>react_jsx_runtime.jsx('svg',{'aria-hidden':true})};
 ${declarations.join('\n')}
 let running=false,allComplete=false,version=0;const listeners=new Set(),calls=[];
 const input={phase:'plain',draft:'',draftRev:0,imageIds:[],occurrences:[]},state={hasMore:true,running};
 const todos=Array.from({length:10},(_,index)=>({content:'核对并交付研究步骤 '+(index+1),status:index===0?'completed':'in_progress'}));
 const publish=()=>{version++;for(const fn of listeners)fn()};
 const actions={setDraft(value){input.draft=value;input.draftRev++;calls.push(['draft',value]);publish()},submit(){calls.push(['submit']);input.phase='submitting';publish()}};
 function App(){react.useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>version);return react_jsx_runtime.jsxs('div',{className:'wSkVaW_composerStack',children:[react_jsx_runtime.jsx(TodoDock,{useSession:select=>select({...state,running}),useProjection:key=>key==='todos'?(allComplete?todos.map(item=>({...item,status:'completed'})):todos):null,useInput:select=>select(input),inputActions:actions,t:(key,values)=>key==='todo.title'?(document.documentElement.dataset.odysseyLocale==='en'?'Task plan':'任务规划'):values?values.done+'/'+values.total:key}),react_jsx_runtime.jsx('div',{className:'wSkVaW_composerSeat',children:react_jsx_runtime.jsx('div',{className:'uV2eYG_root',children:react_jsx_runtime.jsxs('div',{className:'uV2eYG_card','data-layout-composer':'',children:[react_jsx_runtime.jsx('div',{className:'uV2eYG_scroll',children:react_jsx_runtime.jsx('textarea',{className:'uV2eYG_input','aria-label':'消息输入'})}),react_jsx_runtime.jsx('div',{className:'uV2eYG_row',children:'发送'})]})})})]})}
 createRoot(document.getElementById('dock-root')).render(react_jsx_runtime.jsx(App,{}));window.layoutProbe={calls,setRunning(value){running=value;publish()},complete(){allComplete=true;publish()}};`,loader:'js'},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'})).outputFiles[0].text
 const pw=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},20000)
afterAll(()=>browser?.close())
const scenarios=[{surface:'chat',width:1500,height:1000,dark:false},{surface:'chat',width:1500,height:1000,dark:true},{surface:'chat',width:800,height:550,dark:false},{surface:'sidebar',width:1380,height:900,dark:false},{surface:'sidebar',width:1380,height:900,dark:true},{surface:'sidebar',width:800,height:550,dark:true},{surface:'sidebar',width:800,height:550,dark:false,locale:'en'},{surface:'chat',width:1500,height:1000,dark:true,locale:'en'}]
it.each(scenarios)('keeps the real continuation footer inside the card and beside its composer: $surface $width×$height dark=$dark locale=$locale',async scenario=>{
 const {surface,width,height,dark,locale='zh'}=scenario,page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  const sidebar=surface==='sidebar',reading=sidebar?'sRp_messages':'wSkVaW_scrollBody',root=sidebar?'sRp_root':'wSkVaW_root',host=sidebar?'class="sRp_composer"':'data-center-composer-host',size=sidebar?'width:340px;right:12px':'left:12px;right:12px'
  // These are the actual production reader/footer/portal/stack ancestors. Only
  // the outer test window is positioned; task/composer layout uses shipped CSS.
  await page.setContent(`<style>${css}</style><style>body{margin:0;font-family:system-ui}#pane{position:absolute;top:12px;bottom:12px;height:calc(100% - 24px);${size}}</style><body ${dark?'data-ds-dark-theme':''}><main id="pane" class="${root}" data-odyssey-page="conversation" data-phase="active">${sidebar?'<div class="sRp_body"><div class="sRp_conversation">':''}<div class="${reading}">任务回复内容</div><div ${host}><div data-composer-portal-host id="dock-root"></div></div>${sidebar?'</div></div>':''}</main></body>`)
  await page.evaluate(locale=>{document.documentElement.dataset.odysseyLocale=locale;document.documentElement.lang=locale},locale);await page.addScriptTag({content:entry});const button=page.getByRole('button',{name:locale==='en'?'Continue unfinished task':'继续未完成任务',exact:true}),card=page.getByTestId('todo-panel');await button.waitFor()
  const snapshots=[]
  const measure=async label=>{
   const geometry=await page.evaluate(()=>{const card=document.querySelector('[data-testid=todo-panel]'),button=card.querySelector('[data-task-continue]'),footer=card.querySelector('[data-task-continuation]'),composer=document.querySelector('[data-layout-composer]'),reader=document.querySelector('.wSkVaW_scrollBody,.sRp_messages'),rect=node=>node.getBoundingClientRect().toJSON();return{card:rect(card),button:rect(button),footer:rect(footer),composer:rect(composer),reader:rect(reader),folded:card.dataset.odysseyTaskCollapsed,inside:footer.contains(button)&&card.contains(footer),zoom:getComputedStyle(document.documentElement).zoom,stackChildren:document.querySelector('.wSkVaW_composerStack').children.length,hit:document.elementFromPoint(button.getBoundingClientRect().left+button.clientWidth/2,button.getBoundingClientRect().top+button.clientHeight/2)===button}})
   expect(geometry.inside).toBe(true);expect(Number(geometry.zoom)).toBe(1);expect(geometry.button.height).toBeLessThanOrEqual(28);expect(geometry.stackChildren).toBe(2);expect(geometry.button.left).toBeGreaterThanOrEqual(geometry.card.left);expect(geometry.button.right).toBeLessThanOrEqual(geometry.card.right);expect(geometry.button.bottom).toBeLessThanOrEqual(geometry.card.bottom);expect(geometry.hit).toBe(true)
   expect(geometry.composer.top-geometry.card.bottom).toBeGreaterThanOrEqual(0);expect(geometry.composer.top-geometry.card.bottom).toBeLessThanOrEqual(16);expect(geometry.card.height).toBeLessThanOrEqual(252);expect(geometry.reader.height).toBeGreaterThanOrEqual(240)
   snapshots.push({label,...geometry});return geometry
  }
  const first=await measure('initial')
  const header=card.locator('> div > button').first();await header.click()
  if(first.folded==='true'){
   const sheet=page.locator('dialog.odyssey-task-sheet');await sheet.waitFor();await sheet.getByRole('button',{name:'关闭',exact:true}).click();await measure('compact-sheet-closed')
  }else{
   await expect.poll(()=>card.getAttribute('data-odyssey-task-collapsed')).toBe('true');await measure('folded');await header.click();await expect.poll(()=>card.getAttribute('data-odyssey-task-collapsed')).toBe('false');await measure('expanded')
  }
  expect(await page.evaluate(()=>window.layoutProbe.calls)).toEqual([])
  const name=surface+'-'+width+'x'+height+'-'+(dark?'dark':'light')+(locale==='en'?'-en':'');await page.screenshot({path:evidence+'/'+name+'.png'});await writeFile(evidence+'/'+name+'.json',JSON.stringify(snapshots,null,2))
  await page.evaluate(()=>window.layoutProbe.setRunning(true));await expect.poll(()=>button.count()).toBe(0);await page.evaluate(()=>{window.layoutProbe.setRunning(false);window.layoutProbe.complete()});await expect.poll(()=>button.count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
},20000)
