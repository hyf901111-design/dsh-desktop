import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {beforeAll,afterAll,expect,it} from 'vitest'
const require=createRequire(import.meta.url),baseline=process.env.SHERLOCK_TURN_ORDER_BASELINE==='1',evidence=process.env.SHERLOCK_TURN_ORDER_EVIDENCE||'/tmp/sherlock-chat-turn-order-20261031/browser';let browser,runtime,conversation,bundle,css
beforeAll(async()=>{
 runtime=await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),{patchNotesActivity}=require('../scripts/lib/notes-activity.mjs'),{patchConversationTurnOrder,stripConversationTurnOrder}=require('../scripts/lib/conversation-turn-order.mjs')
 conversation=(baseline?stripConversationTurnOrder(raw):patchConversationTurnOrder(patchNotesActivity(raw))).replace(/^\s*exports\.\w+ = [^;\n]+;$/gm,'').replace('\n\t\treturn module.exports;','\n\t\texports.__orderChat=ChatView;exports.__orderUser=UserMessageNodeView;exports.__orderAssistant=AssistantNodeView;exports.__orderTail=TurnTailNodeView;exports.__orderRegister=registerConversationNodes;exports.__orderDictionaries={zh,en};exports.__orderBind=()=>{sherlockBoardsPage.PersonalResearchHistory=()=>null;sherlockBoardsAdapter=null};return module.exports;')
 bundle=(await build({entryPoints:['test/fixtures/conversation-turn-order-browser.tsx'],bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent',loader:{'.css':'empty','.svg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
 const assets='node_modules/@deepseek-ai/dsh-web-frontend/dist/assets',names=(await readdir(assets)).filter(name=>/^index-.*\.css$/.test(name));css=(await Promise.all(names.map(name=>readFile(assets+'/'+name,'utf8')))).join('\n')+'\n'+(await Promise.all(['figma-reading','figma-refinements'].map(name=>readFile('src/preload/'+name+'.css','utf8')))).join('\n')
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await pw.chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'});await mkdir(evidence,{recursive:true})
},30000)
afterAll(async()=>browser?.close())
function eventsFixture(){
 const log=[],append=(type,data,extra={})=>log.push({seq:log.length,time:Date.now()+log.length,type,data,...extra})
 const human=(id,text)=>append('user/message',{id,role:'user',source:{kind:'user',rpcId:'rpc-'+id},content:[{type:'text',text}]},{surfaceOp:'append'})
 const prep=(plugin='fixture-file-context')=>append('user/message',{id:'prep-'+log.length,role:'user',source:{kind:'plugin',plugin,form:'notice'},content:[{type:'text',text:'已读取附件和任务上下文。'}]},{surfaceOp:'append'})
 const answer=(turn,step,text)=>append('assistant/message',{turn,step,message:{id:'assistant-'+log.length,role:'assistant',source:{kind:'model',provider:'fixture',model:'fixture'},content:[{type:'text',text}]}},{surfaceOp:'append'})
 return{log,append,human,prep,answer}
}
async function fixture(log,theme='dark'){
 const page=await browser.newPage({viewport:{width:1100,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.stack??error.message))
 await page.route('https://turn-order.test/**',route=>route.fulfill({contentType:new URL(route.request().url()).pathname==='/'?'text/html':'application/json',body:new URL(route.request().url()).pathname==='/'?'<!doctype html><html lang="zh"><main id="app" data-conversation-scroll></main>':'{"tasks":[],"plans":[]}'}));await page.goto('https://turn-order.test/')
 await page.addStyleTag({content:css+'\nbody{margin:0;background:'+(theme==='dark'?'#1f1f1f':'#fff')+'}#app{height:820px;width:1000px;margin:20px auto;overflow:auto} [data-chat-flow]{padding-top:12px!important}'});
 await page.evaluate(({runtime,conversation,log,theme})=>{if(theme==='dark')document.body.dataset.dsDarkTheme='';window.orderEvents=log;window.__ModuleLoader__={load:descriptor=>window.runtimeDescriptor=descriptor};new Function(runtime)();window.__ModuleLoader__={load:descriptor=>window.orderDescriptor=descriptor};new Function(conversation)()},{runtime,conversation,log,theme});await page.addScriptTag({content:bundle});await page.locator('[data-chat-flow]').waitFor({timeout:5000}).catch(async error=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText()})+' '+error)});return{page,errors,close:()=>page.close()}
}
const layout=page=>page.locator('[data-chat-flow] > [data-chat-flow-key]').evaluateAll(els=>els.map(el=>({key:el.dataset.chatFlowKey,kind:el.dataset.chatFlowKind,top:el.getBoundingClientRect().top,text:el.innerText})))
it.each(['light','dark'])('keeps a PPT attachment user before thinking/progress and the final response throughout streaming and reopen in %s',async theme=>{
 const g=eventsFixture();g.append('turn/start',{turn:1});g.append('step/start',{turn:1,step:1});g.prep();g.human('ppt','📎 研究汇报.pptx 请调整版式，所有文字保持不变。');g.answer(1,1,'我先读取附件并检查页面布局。');g.append('step/end',{turn:1,step:1});g.append('step/start',{turn:1,step:2});const initial=g.log.slice(),f=await fixture(initial,theme)
 try{
  const initialLayout=await layout(f.page);await writeFile(evidence+'/'+theme+(baseline?'-baseline':'-green')+'.json',JSON.stringify({initialLayout},null,2));await f.page.screenshot({path:evidence+'/'+theme+(baseline?'-baseline':'-green')+'.png'})
  expect(initialLayout[0].kind).toBe('user');expect(initialLayout[0].text).toContain('研究汇报.pptx');expect(initialLayout[1].kind).toBe('execution');expect(initialLayout.filter(row=>row.kind==='user')).toHaveLength(1)
  g.answer(1,2,'附件版式已完成检查，原始文字均已保留。');g.append('step/end',{turn:1,step:2});g.append('turn/end',{turn:1,reason:{kind:'completed'}});await f.page.evaluate(events=>window.turnOrderProbe.append(events),g.log.slice(initial.length))
  await expect.poll(()=>f.page.locator('[data-chat-flow]').innerText()).toContain('附件版式已完成检查');const completed=await layout(f.page);expect(completed[0].kind).toBe('user');expect(completed.filter(row=>row.kind==='user')).toHaveLength(1)
  await f.page.evaluate(()=>window.turnOrderProbe.reopen());await expect.poll(()=>f.page.locator('[data-chat-flow]').innerText()).toContain('附件版式已完成检查');expect((await layout(f.page)).map(row=>row.key)).toEqual(completed.map(row=>row.key));expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('retains two real user boundaries, claimed steering and task-progress plugin notices without duplicate bubbles or moved replies',async()=>{
 const g=eventsFixture();g.append('turn/start',{turn:1});g.append('step/start',{turn:1,step:1});g.prep();g.human('one','第一条请求');g.answer(1,1,'第一步处理进展。');g.append('step/end',{turn:1,step:1});g.append('step/start',{turn:1,step:2});g.human('two','第二条同轮请求');g.prep('sherlock-task-progress');g.answer(1,2,'第二步处理进展。');g.append('step/end',{turn:1,step:2});g.append('agent/inbox/spliced',{target:'next-step',start:0,removedCount:0,inserted:[{id:'steer'}]});g.append('agent/inbox/spliced',{target:'next-step',start:0,removedCount:1,inserted:[]});g.append('step/start',{turn:1,step:3});g.human('steer','中途补充要求');g.prep('sherlock-task-progress');g.answer(1,3,'补充要求已经完成。');g.append('step/end',{turn:1,step:3});g.append('turn/end',{turn:1,reason:{kind:'completed'}})
 const f=await fixture(g.log);try{const rows=await layout(f.page),humans=rows.filter(row=>['user','steering'].includes(row.kind));expect(humans).toHaveLength(3);expect(humans.map(row=>row.text)).toEqual(expect.arrayContaining([expect.stringContaining('第一条请求'),expect.stringContaining('第二条同轮请求'),expect.stringContaining('中途补充要求')]));expect(rows[0].kind).toBe('user');expect(rows.findIndex(row=>row===humans[1])).toBeGreaterThan(1);expect(rows.filter(row=>row.kind==='execution')).toHaveLength(3);expect(f.errors).toEqual([]);await writeFile(evidence+'/interjection-and-notices.json',JSON.stringify(rows,null,2))}finally{await f.close()}
},20000)
