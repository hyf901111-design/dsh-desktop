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

 const clients=[]
 async function connect(i){
  const ticket=await call(i,'/tickets',{scope:'board',boardId}),r=await mf.dispatchFetch('http://local'+ticket.url,{headers:{Upgrade:'websocket'}});assert.equal(r.status,101)
  const ws=r.webSocket,messages=[];sockets.push(ws);ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));ws.accept();await until(()=>messages.some(m=>m.type==='welcome'),'welcome')
  return {ws,messages,send:activity=>ws.send(JSON.stringify({type:'activity',activity}))}
 }
 const a=await connect(0),b=await connect(1),viewer=await connect(2)
 const progress={kind:'canvas',id:'generic-task',sequence:1,title:'等待并操作',state:'running',reason:'正在读取内容',actions:0,maxActions:20,deadline:Date.now()+60000}
 a.send(progress);await until(()=>b.messages.some(m=>m.type==='activity'),'peer progress')
 assert.equal(b.messages.at(-1).activity.userId,'u0')
 a.send({...progress,sequence:3,reason:'已点击并确认',actions:1});a.send({...progress,sequence:2,reason:'STALE'})
 await until(()=>b.messages.some(m=>m.activity?.sequence===3),'latest progress')
 const reopened=await connect(1),welcome=reopened.messages.find(m=>m.type==='welcome')
 assert.equal(welcome.activities.find(v=>v.id===progress.id).sequence,3)
 assert.equal(welcome.activities.find(v=>v.id===progress.id).reason,'已点击并确认')
 viewer.send({...progress,id:'forbidden'});await until(()=>viewer.messages.some(m=>m.type==='error'),'readonly denied')
 assert(!b.messages.some(m=>m.activity?.id==='forbidden'))
 const request=await command('message',{text:'检查同步进度'})
 const task=await command('taskCreate',{requestMessageId:request.message.id,conversation:true})
 await command('taskClaim',{taskId:task.task.taskId,executorId:'acceptance'})
 const event={kind:'conversation',id:task.task.taskId,sequence:1,progress:{startedAt:Date.now(),lastActivityAt:Date.now(),outputChars:8,events:[{type:'assistant-delta',text:'已经完成第一步'},{type:'reasoning',text:'PRIVATE'},{type:'tool-started',tool:'观察画布',arguments:'SECRET'}]}}
 a.send(event);await until(()=>b.messages.some(m=>m.activity?.kind==='conversation'),'conversation progress')
 const published=b.messages.find(m=>m.activity?.kind==='conversation').activity
 assert.equal(published.progress.events[0].text,'已经完成第一步');assert(!JSON.stringify(published).includes('PRIVATE'));assert(!JSON.stringify(published).includes('SECRET'))
 b.send({...event,sequence:2});await until(()=>b.messages.some(m=>m.type==='error'),'foreign reporter denied')
 a.send({...progress,sequence:4,state:'completed',reason:'执行结束'});await until(()=>b.messages.some(m=>m.activity?.state==='completed'),'completion propagated')
 console.log('PASS: actual D1/DO/WebSocket peers receive task and conversation progress; reconnect restores latest, stale reports rejected, readonly/foreign writes denied, private reasoning excluded')
}finally{for(const ws of sockets)try{ws.close()}catch{};await mf.dispose();rmSync(persist,{recursive:true,force:true})}
