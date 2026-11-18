import {it,expect} from 'vitest'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
// Strict installation bytes must use Node's untransformed function source.
const require=createRequire(import.meta.url)
const {conversationLiveActivity,patchConversationLiveActivity,stripConversationLiveActivity,workbenchConversationUpdate}=require('../scripts/lib/conversation-live-activity.mjs')
const {conversationActivityRecords,conversationToolFailureLabel,transformWorkbenchConversationPresentation}=require('../scripts/lib/conversation-status-presentation.mjs')
const tool=(name,done=false,turn=2)=>({kind:'tool-call',location:{turn:{turn}},data:{root:done?{kind:'tool-call',call:{name}}:{name}}})
const activity=(nodes=[],rest={})=>conversationLiveActivity({running:true,runningTurn:2,order:nodes.map((_,i)=>i),nodeStore:new Map(nodes.map((n,i)=>[i,n])),labelForNode:n=>'Working: '+n.data.root.name,...rest})
it('installs one reversible activity footer on both native conversation hosts',async()=>{
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),base=stripConversationLiveActivity(source),next=patchConversationLiveActivity(base)
 expect(patchConversationLiveActivity(next.replace('/* ework:conversation-live-activity:v6 */','/* ework:conversation-live-activity:v5 */'))).toBe(next);expect(patchConversationLiveActivity(next)).toBe(next);expect(stripConversationLiveActivity(next)).toBe(base)
 expect(next.match(/react.createElement\(ConversationLiveActivity,/g)).toHaveLength(2)
 expect(()=>stripConversationLiveActivity(next.replace('2.4s linear infinite','1s linear infinite'))).toThrow(/drifted/)
})
it('shows immediate preparation and never mistakes old completed tools for current work',()=>{
 expect(activity()).toEqual({kind:'thinking',label:'正在思考…'})
 expect(activity([tool('read',true),tool('bash',false,1)])).toEqual({kind:'thinking',label:'正在思考…'})
 expect(activity([tool('read',false)])).toMatchObject({kind:'tool',label:'Working: read',parallelCount:1})
 expect(activity([tool('read'),tool('bash')])).toMatchObject({kind:'tool',parallelCount:2})
})
it('publishes only phase labels while private reasoning and credentials stay in their original owner',()=>{
 const node={kind:'assistant-step',location:{turn:{turn:2}},data:{status:'streaming',blocks:[{kind:'reasoning',text:'secret Bearer xxx'}]}}
 expect(activity([node])).toMatchObject({kind:'thinking'});node.data.blocks.push({kind:'text',text:'The real answer'})
 expect(activity([node])).toEqual({kind:'reply',label:'正在整理回复…'})
 expect(JSON.stringify(activity([node]))).not.toMatch(/secret|Bearer|real answer/)
})
it('names explicit input waits, compaction and retries without a false running tool label',()=>{
 expect(activity([tool('request_user_input')])).toEqual({kind:'waiting',label:'等待你的回答'})
 expect(activity([tool('request_permissions')],{english:true})).toEqual({kind:'waiting',label:'Waiting for your approval'})
 expect(activity([{kind:'compaction',location:{turn:{turn:2}},data:{running:true}}])).toMatchObject({kind:'compaction'})
 expect(activity([{kind:'model-retry',location:{turn:{turn:2}}}],{english:true})).toEqual({kind:'retry',label:'Retrying connection…'})
})
it('hides at termination, failure, session loading and for queued messages alone',()=>{
 for(const rest of [{running:false},{openState:'error'},{openState:'loading'}])expect(activity([tool('read')],rest)).toBeNull()
 expect(activity([],{running:false,flow:[{kind:'pending-steering'}]})).toBeNull()
})
it('retains honest note and canvas activity when those owners run without a parent turn',()=>{
 expect(activity([],{running:false,noteRows:[{phase:'generating',stage:'writing'}]})).toEqual({kind:'note',label:'正在写入笔记…'})
 expect(activity([],{running:false,noteRows:[{phase:'completed'}]})).toBeNull()
 expect(activity([],{running:false,canvasTasks:[{state:'waiting'}],english:true})).toEqual({kind:'canvas',label:'Waiting for canvas updates…'})
 expect(activity([],{running:false,canvasTasks:[{state:'paused'}]})).toBeNull()
})

it('upgrades the exact installed v2 status layer while rejecting a changed historical definition',async()=>{
 const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),next=patchConversationLiveActivity(source)
 const frozen=JSON.parse(await readFile('test/fixtures/conversation-live-activity-v2.json','utf8')).definition
 const compatible=transformWorkbenchConversationPresentation(next,true)
 const start=compatible.indexOf('/* ework:conversation-live-activity:v6 */'),end=compatible.indexOf('/* ework:conversation-live-activity:end */',start)+'/* ework:conversation-live-activity:end */'.length+1
 const previous=compatible.slice(0,start)+frozen+compatible.slice(end)
 expect(patchConversationLiveActivity(previous)).toBe(next)
 expect(()=>patchConversationLiveActivity(previous.replace('2.4s linear infinite','1s linear infinite'))).toThrow('definition drifted')
})

const request='请创建一个工作台，包含行情与公告'
const user=(text=request,turn=4,kind='user')=>({key:'prompt',kind,location:{turn:{turn}},data:{content:[{type:'text',text}],source:{kind:'user'}}})
const result=(key,name,root={},turn=4)=>({key,kind:'tool-call',location:{turn:{turn}},data:{root:{kind:'tool-result',call:{name,argsRaw:'{}'},...root}}})
const update=(nodes,props={})=>workbenchConversationUpdate({running:true,runningTurn:4,openState:'open',order:nodes.map(n=>n.key),nodeStore:new Map(nodes.map(n=>[n.key,n])),flow:nodes.map(n=>({kind:'node',key:n.key})),readText:parts=>parts.map(part=>part.text).join(''),...props})
const pending=(props={})=>({kind:'native-submitted-user',key:'submitted:r1',submission:{mode:'queue',initialImmediate:true,accepted:true,content:user().data.content,...props}})

it('acknowledges only an accepted Workbench submission or its authoritative active turn',()=>{
 expect(update([], {running:false,runningTurn:null,flow:[pending()]})).toMatchObject({kind:'received',ownerKey:'submitted:r1'})
 expect(update([user()])).toMatchObject({kind:'received',ownerKey:'prompt'})
 for(const options of [{accepted:false},{initialImmediate:false},{mode:'steer'}])expect(update([],{flow:[pending(options)]})).toBeNull()
 expect(update([user('核对原有工作台的数据')])).toBeNull()
 expect(update([user(request,3)])).toBeNull()
 expect(update([user(request,4,'steering')])).toBeNull()
 expect(update([user()],{running:false})).toBeNull()
 expect(update([user()],{openState:'loading'})).toBeNull()
})

it('gives an actionable initial structure for the current request, then yields to public model text',()=>{
 const futures=user('生成一个期货衍生品研究工作台')
 expect(update([futures]).text).toMatch(/品种.*近远月结算价.*持仓分布.*明细.*交易日报.*事件/)
 expect(update([futures],{english:true}).text).toContain('open interest')
 const file=update([user('根据上传的期货附件创建一个研究工作台')]).text
 expect(file).toContain('指定材料');expect(file).not.toContain('上期所')
 expect(update([user('只看股指期货，创建一个研究工作台')]).text).not.toContain('上期所')
 const comparison=update([user('创建一个区域门店销售对比工作台')]).text
 expect(comparison).toContain('排序图');expect(comparison).not.toContain('行情')
 expect(update([user('弄个美元兑人民币的看板。')]).text).toContain('报价日期')
 expect(update([user('做个看板，每天扫一眼 AI 新闻。')]).text).toContain('点标题可读原文')
 expect(update([user('帮我弄个一周待办看板。')]).text).toContain('可添加、勾选')
 const step={key:'first-public-step',kind:'assistant-step',location:{turn:{turn:4}},data:{blocks:[{kind:'reasoning',text:'private'}]}}
 expect(update([futures,step])?.kind).toBe('received')
 expect(update([futures,{...step,data:{blocks:[{kind:'text',text:'按到期月份看价差'}]}}])).toBeNull()
})

it('reports actual source observations and verified plan acceptance without leaking payloads',()=>{
 const search=result('s','web_search'),old=result('old','web_fetch',{isError:true},3)
 const failure=result('failure','web_fetch',{isError:true,call:{name:'web_fetch',argsRaw:'{"url":"https://example.com?secret=123"}'}})
 const fetch=result('fetch','web_fetch',{meta:{statusCode:200,truncated:false},content:[{type:'text',text:'Fetched https://example.com/private (HTTP 200)\n\nactual source content'}]})
 const truncated=result('truncated','web_fetch',{meta:{statusCode:200,truncated:true},content:fetch.data.root.content})
 const plan=result('plan','research_workbench_create',{content:[{type:'text',text:'{"status":"accepted","planId":"id-1","panels":["private name","other"]}'}]})
 expect(update([user(),search,old])).toMatchObject({kind:'checking'})
 expect(update([user(),search,failure])).toMatchObject({kind:'sources',text:expect.stringMatching(/未能读取/)})
 expect(update([user(),fetch,truncated])).toMatchObject({kind:'sources',text:expect.stringMatching(/读取部分.*不完整/)})
 expect(update([user(),fetch])).toMatchObject({kind:'sources',text:expect.stringMatching(/已读取/)})
 expect(update([user(),{...tool('research_workbench_create',false,4),key:'creating-plan'}])).toMatchObject({kind:'submitting'})
 expect(update([user(),plan])).toMatchObject({kind:'submitted',text:expect.stringMatching(/已受理.*2 个组件/)})
 expect(update([user(),plan],{running:false,settledTurn:4})).toMatchObject({kind:'submitted'})
 expect(update([user(),plan],{running:false,settledTurn:5})).toBeNull()
 expect(update([user(),search],{running:false,settledTurn:4})).toBeNull()
 expect(update([user(),{...plan,data:{root:{...plan.data.root,isError:true}}}])).toMatchObject({kind:'plan-failed'})
 expect(update([user(),{...plan,data:{root:{...plan.data.root,content:[]}}}])).toMatchObject({kind:'received'})
 expect(JSON.stringify(update([user(),search,failure,fetch,plan]))).not.toMatch(/https|secret|private|id-1/)
})

it('distinguishes data queries from discovery calls and avoids a success claim for empty rows',()=>{
 const data=(operation,records)=>result('data','public_data_query',{call:{name:'public_data_query',argsRaw:JSON.stringify({operation})},content:[{type:'text',text:JSON.stringify({records})}]})
 expect(update([user(),data('catalog',[{value:1}])])).toMatchObject({kind:'checking'})
 expect(update([user(),data('query',[])])).toMatchObject({kind:'sources',text:expect.stringMatching(/未能读取/)})
 expect(update([user(),data('query',[{value:123456}])],{english:true})).toMatchObject({kind:'sources',text:expect.stringMatching(/Some source material was retrieved/)})
 expect(update([user(),data('query',[{value:123456}])]).text).not.toContain('123456')
})

it('groups adjacent webpage read failures and preserves each original activity record',()=>{
 const a=result('a','web_fetch',{isError:true,content:[{type:'text',text:'Error: The browser could not load readable webpage content. Open the URL in a research link component to inspect it.'}]}),b=result('b','web_fetch',{isError:true}),s=result('s','web_search'),c=result('c','web_fetch',{isError:true})
 expect(conversationToolFailureLabel(a.data.root)).toBe('网页读取失败，浏览器未取得可读内容')
 expect(conversationToolFailureLabel(b.data.root)).toBe('网页读取失败')
 expect(conversationToolFailureLabel(s.data.root)).toBeNull()
 expect(conversationActivityRecords([a,b,s,c]).map(group=>group.map(node=>node.key))).toEqual([['a','b'],['s'],['c']])
})
