// Focused, local-only: real Workers D1/DO/WebSockets + two isolated Chromium
// clients rendering the production opaque HTML wrapper and shared-state SDK.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { hash } from '../services/accounts/auth.js'
import { componentVersion } from '../packages/dsh-research-collaboration/component-state.js'
import { sharedComponentIssue } from '../packages/dsh-research-task-runtime/shared-component-validation.js'
import { buildResearchHtmlPreview } from '../packages/dsh-research-task-runtime/html-artifact.js'
const html=`<!doctype html><html><body><h2>通用组件同步验收</h2><p>独立账号 · 本地协作服务 · 合成数据</p><label>姓名 <input id="name"></label><label>城市 <input id="city"></label><p><button id="add">累加</button> <button id="move">移动到 120,350</button> <button id="run">开始 / 暂停模拟</button></p><output id="state"></output><div id="status"></div><script>
const shared=window.sherlockShared.register({
 initialState:{count:0,fields:{name:'',city:''},position:{x:0,y:0},running:false,ticks:0,random:0},
 reduce:(s,a)=>a.type==='field'?{...s,fields:{...s.fields,[a.key]:a.value}}:a.type==='add'?{...s,count:s.count+1}:a.type==='move'?{...s,position:{x:120,y:350}}:{...s,running:!s.running},
 tick:(s)=>s.running?{...s,ticks:s.ticks+1,random:Math.random()}:s,tickMs:140,
 render:(s,c)=>{document.getElementById('state').textContent=JSON.stringify(s);document.getElementById('status').textContent=c.connected?(c.readOnly?'只读':c.isHost?'执行端':'协作端'):'等待同步';for(const id of ['name','city']){const e=document.getElementById(id);if(document.activeElement!==e)e.value=s.fields[id];e.disabled=!c.connected||c.readOnly;}for(const id of ['add','move','run'])document.getElementById(id).disabled=!c.connected||c.readOnly;}
});for(const key of ['name','city'])document.getElementById(key).onchange=e=>shared.dispatch({type:'field',key,value:e.target.value});for(const type of ['add','move','run'])document.getElementById(type).onclick=()=>shared.dispatch({type});
</script></body></html>`
assert.equal(sharedComponentIssue(html), undefined, 'browser component must pass generation acceptance')
const nodeId='generic-shared', version=componentVersion(html)
const bundle=await build({entryPoints:['services/collaboration/worker.js'],bundle:true,write:false,format:'esm',platform:'neutral',external:['cloudflare:*','node:*']})
const persist=mkdtempSync(join(tmpdir(),'component-worker-'))
const mf=new Miniflare(convertV4MiniflareOptions({resourcePersistencePath:persist,workers:[{modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-08-27',compatibilityFlags:['nodejs_compat'],d1Databases:{ACCOUNTS_DB:'test-component'},durableObjects:{RESEARCH_ROOMS:{className:'ResearchBoardRoom',useSQLite:true},RESEARCH_NOTIFICATIONS:{className:'ResearchNotifications',useSQLite:true}},r2Buckets:['RESEARCH_ASSETS']}]}))
const tokens=['1','2','3'].map(c=>c.repeat(64));let boardId,seq=0,browser
const sockets=[]
const call=async(user,path,body)=>{const r=await mf.dispatchFetch('http://local/v1/collaboration'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+tokens[user],'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200,await r.clone().text());return r.json()}
const command=(action,extra={})=>call(0,`/boards/${boardId}/commands`,{action,operationId:'command-'+(++seq),epoch:1,...extra})
const until=async(fn,label)=>{const deadline=Date.now()+15000;while(Date.now()<deadline){if(await fn())return;await new Promise(r=>setTimeout(r,50))}throw Error('Timeout: '+label)}
try {
 await mf.ready;const db=await mf.getD1Database('ACCOUNTS_DB')
 for(const file of ['0001_accounts.sql','0002_research_boards.sql'])await db.exec(readFileSync(new URL('../services/accounts/migrations/'+file,import.meta.url),'utf8').replaceAll('\n',' '))
 await db.prepare('INSERT INTO invites(hash,expires_at,max_uses) VALUES(?,?,10)').bind('seed',Math.floor(Date.now()/1000)+3600).run()
 for(let i=0;i<3;i++){await db.prepare('INSERT INTO users(id,username,password_hash,invite_hash,created_at) VALUES(?,?,?,?,?)').bind('u'+i,'user'+i,'unused','seed',Date.now()).run();await db.prepare('INSERT INTO sessions(hash,user_id,expires_at) VALUES(?,?,?)').bind(hash(tokens[i]),'u'+i,Math.floor(Date.now()/1000)+3600).run()}
 const people=await Promise.all(tokens.map((_,i)=>call(i,'/me')))
 const created=await call(0,'/boards',{operationId:'component-create',title:'通用状态验证',sourceRevision:'component',capturedAt:new Date().toISOString(),snapshot:{canvas:{files:[],artifacts:[{id:nodeId,kind:'generated-container',title:'通用状态',x:0,y:0,width:640,height:480,containerSpec:{version:1,type:'html',title:'通用状态',html}}]},history:[]}})
 boardId=created.board.boardId
 for(let i=1;i<3;i++){const r=await command('invite',{publicId:people[i].user.publicId,role:i===1?'editor':'viewer'});await call(i,`/invitations/${r.invitation.invitationId}/respond`,{operationId:'accept-'+i,version:1,decision:'accept'})}
 const {default:playwright}=await import('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
 browser=await playwright.chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 const clients=[],errors=[]
 async function client(i){
  const ticket=await call(i,'/tickets',{scope:'board',boardId});const r=await mf.dispatchFetch('http://local'+ticket.url,{headers:{Upgrade:'websocket'}});assert.equal(r.status,101)
  const ws=r.webSocket;sockets.push(ws);const context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',i,e.message)})
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='component')void page.evaluate(m=>document.querySelector('iframe')?.contentWindow?.postMessage({type:'sherlock-component-receive',message:m},'*'),m).catch(()=>{})});ws.accept()
  await page.exposeFunction('sendComponent',m=>{if(ws.readyState!==1)return false;ws.send(JSON.stringify({type:'component',message:{...m,nodeId,version}}));return true})
  await page.setContent('<h1>客户端 '+(i+1)+'</h1><iframe style="width:750px;height:450px;border:1px solid #bbb;border-radius:12px"></iframe>')
  await page.evaluate(({preview,i})=>{
   const frame=document.querySelector('iframe');window.addEventListener('message',e=>{if(e.source!==frame.contentWindow||e.data?.type!=='sherlock-component-send')return;const m=e.data.message;if(m.op==='join')frame.contentWindow.postMessage({type:'sherlock-component-context',shared:true,online:true,readOnly:i===2,userId:'u'+i},'*');void window.sendComponent(m).then(ok=>{if(!ok)frame.contentWindow.postMessage({type:'sherlock-component-context',shared:true,online:false,readOnly:i===2,userId:'u'+i},'*')})});frame.srcdoc=preview
  },{preview:buildResearchHtmlPreview(html,'通用组件','light',{notoFont:'runtime'}),i})
  const frame=page.frameLocator('iframe').frameLocator('#preview');await frame.locator('#state').waitFor({state:'attached'});await until(async()=>['执行端','协作端','只读'].includes(await frame.locator('#status').textContent()),'connected '+i)
  const c={page,frame,ws,state:async()=>JSON.parse(await frame.locator('#state').textContent())};clients.push(c);return c
 }
 const a=await client(0),b=await client(1)
 await Promise.all([a.frame.locator('#name').fill('Alice'),b.frame.locator('#city').fill('上海')]);await Promise.all([a.frame.locator('#name').press('Tab'),b.frame.locator('#city').press('Tab')]);await Promise.all([a.frame.locator('#add').click(),b.frame.locator('#add').click()]);await b.frame.locator('#move').click()
 await until(async()=>{const x=await a.state(),y=await b.state();return JSON.stringify(x)===JSON.stringify(y)&&x.count===2&&x.fields.name==='Alice'&&x.fields.city==='上海'&&x.position.y===350},'concurrent field edits, increments and movement')
 await a.frame.locator('#run').click();await until(async()=>(await b.state()).ticks>=8,'simulation');await b.frame.locator('#run').click();await until(async()=>!(await a.state()).running&&JSON.stringify(await a.state())===JSON.stringify(await b.state()),'same random simulation results')
 const viewer=await client(2);assert.deepEqual(await viewer.state(),await b.state());assert.equal(await viewer.frame.locator('#add').isDisabled(),true)
 // A forged viewer request is rejected by the service, independently of UI.
 const denied=new Promise(resolve=>viewer.ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='error')resolve(m)}));viewer.ws.send(JSON.stringify({type:'component',message:{op:'join',nodeId,version,peerId:'viewer-forged'}}));viewer.ws.send(JSON.stringify({type:'component',message:{op:'input',nodeId,version,peerId:'viewer-forged',inputId:'bad',sequence:1,payload:{type:'add'}}}));assert.equal((await denied).error.code,'ACCESS_DENIED')
 a.ws.close();await a.page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-component-context',shared:true,online:false,readOnly:false,userId:'u0'},'*'))
 await until(async()=>(await b.frame.locator('#status').textContent())==='执行端','leader takeover')
 await b.frame.locator('#add').click();await until(async()=>(await viewer.state()).count===3,'surviving editor continues')
 const reopened=await client(0);await until(async()=>JSON.stringify(await reopened.state())===JSON.stringify(await b.state()),'reconnect receives latest state')
 const exported=await browser.newPage();await exported.setContent('<iframe style="width:750px;height:450px"></iframe>');await exported.evaluate(preview=>document.querySelector('iframe').srcdoc=preview,buildResearchHtmlPreview(html,'导出组件'))
 const exportFrame=exported.frameLocator('iframe').frameLocator('#preview');await exportFrame.locator('#add').click();assert.equal(JSON.parse(await exportFrame.locator('#state').textContent()).count,1);await exported.close()
 assert.deepEqual(errors,[])
 mkdirSync('output/playwright/component-shared',{recursive:true});await b.page.screenshot({path:'output/playwright/component-shared/editor.png'});await reopened.page.screenshot({path:'output/playwright/component-shared/reconnected.png'});writeFileSync('output/playwright/component-shared/result.json',JSON.stringify({passed:true,state:await b.state(),checks:['independent accounts','opaque sandbox','concurrent forms','counter','position','timed/random state','late join','viewer rejection','executor takeover','reconnect','standalone export']},null,2))
 console.log('PASS: real D1/DO/WebSocket + independent Chromium clients; forms, counter, positions, timer/random, readonly, late join, takeover and reconnect')
} finally {for(const ws of sockets)try{ws.close()}catch{};await browser?.close();await mf.dispose();rmSync(persist,{recursive:true,force:true})}
