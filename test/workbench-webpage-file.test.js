import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, expect, it} from 'vitest'
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js'
import {prepareWorkbenchWebpages} from '../packages/dsh-research-task-runtime/workbench-webpage.js'
import {parseAttachmentSpec} from '../packages/dsh-research-task-runtime/attachment-template-contract.js'
import {workbenchScopeDeficits} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'

const html='<!doctype html><html lang="zh"><body><button>增加人数</button><output>1</output><script>document.querySelector("button").onclick=()=>document.querySelector("output").value++</script></body></html>'
const spec={requestId:'trip-page',title:'旅行预算',panels:[{type:'files',title:'方案对比',htmlFile:{name:'旅行预算.html',html}}]}
const cleanups=[]
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup()})

async function host(mode='workspace-write'){
  const root=await mkdtemp(join(tmpdir(),'odyssey-page-'))
  cleanups.push(()=>rm(root,{recursive:true,force:true}))
  const session={id:'trip',header:{cwd:root}},agent={id:'trip',session},prepared=[]
  let tool, route, onEvent
  const ctx={
    agents:{get:()=>agent},tools:{register:t=>{if(t.name==='research_workbench_create')tool=t;return()=>{}}},webServer:{register:spec=>{route=spec.handler;return()=>{}}},
    on:(_,listener)=>{onEvent=listener;return()=>{}},
    workspaceRegistry:{resolveByPath:async()=>({id:'project',path:root})},
    get:key=>key==='sandboxPolicy'?{resolve:async()=>({mode,workspaceRoot:root,sessionId:'trip'})}:undefined
  }
  const runtime={inspect:()=>({finalOutput:prepared[0]?.artifact}),startPreparedBatch:async({panels})=>{prepared.push(...panels);return panels.map(p=>({taskId:p.canvasNodeId}))}}
  cleanups.push(await registerWorkbench(ctx,runtime,{filePath:join(root,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async req=>req.body}))
  async function list(body) {
    let value
    await route({method:'POST',body:{parentSessionId:session.id,...body}},{writeHead(){},end(json){value=JSON.parse(json)}})
    return value
  }
  return {root,session,prepared,list,event:e=>{session.events.push(e);onEvent(session,e)},create:args=>tool.execute(args,{agent})}
}

it('saves a portable file before reporting its inline panel prepared and reuses it on retry',async()=>{
  const {root,prepared,create}=await host()
  const first=await create(spec)
  expect(first.status).toBe('prepared')
  const page=prepared[0].artifact
  expect(parseAttachmentSpec(page)).toEqual(page)
  expect(page.presentation).toBe('webpage')
  const path=join(root,page.items[0].relativePath)
  expect(await readFile(path,'utf8')).toBe(html)
  expect((await create(spec)).planId).toBe(first.planId)
  expect(prepared).toHaveLength(1)
  expect(JSON.parse(await readFile(join(root,'plans.json'),'utf8'))[0].panels[0].artifact).toEqual(page)
  await writeFile(path,'edited by the user')
  await expect(create(spec)).rejects.toThrow('保留原文件')
  expect(await readFile(path,'utf8')).toBe('edited by the user')
  expect(await readdir(root)).toHaveLength(2)
})

it('writes the source-bound observation comparison as one real file in the research workspace',async()=>{
  const app=await host()
  const request=await readFile(new URL('./fixtures/workbench-yield-comparison.tsv.txt',import.meta.url),'utf8')
  app.session.events=[{type:'user/message',data:{id:'observations',role:'user',source:{kind:'user'},content:[{type:'text',text:request}]}}]
  const result=await app.create({title:'收益率复盘',panels:[{title:'利差比较',type:'files',htmlFile:{name:'利差比较.html',observationComparison:true}}]})
  expect(result.status).toBe('prepared')
  expect(app.prepared).toHaveLength(1)
  const artifact=app.prepared[0].artifact
  expect(artifact).toMatchObject({type:'files',presentation:'webpage'})
  const saved=await readFile(join(app.root,artifact.items[0].relativePath),'utf8')
  expect(saved).toContain('select name="baseline"')
  expect(saved).toContain('美国财政部 Daily Treasury Par Yield Curve Rates')
})

it('keeps native and referenced-file requests native and rejects unmounted URLs or invalid generated pages',()=>{
  const native={panels:[{type:'tasks',title:'待办'}]}
  expect(prepareWorkbenchWebpages(native,'s','参考网页来个待办看板').args).toBe(native)
  expect(()=>prepareWorkbenchWebpages(spec,'s','旅行看板，只用原生组件')).toThrow('原生')
  for(const htmlFile of [{name:'../escape.html',html},{name:'valid.html',html:'<div>draft</div>'},{name:'portable.html',html:html.replace('<script>','<script src="https://example.org/remote.js">')}])
    expect(()=>prepareWorkbenchWebpages({...spec,panels:[{...spec.panels[0],htmlFile}]},'s','')).toThrow()
  const artifact=prepareWorkbenchWebpages(spec,'s','').args.panels[0].artifact
  expect(parseAttachmentSpec({...artifact,items:[]})).toBeNull()
  expect(parseAttachmentSpec({...artifact,items:[{id:'remote',name:'外部.html',url:'https://example.org'}]})).toBeNull()
  expect(()=>prepareWorkbenchWebpages({panels:[{artifact}]},'s','')).toThrow()
})

it('writes no file on invalid plans or read-only projects',async()=>{
  const {root,create}=await host('read-only')
  await expect(create({...spec,panels:[...spec.panels,{title:'缺失类型'}]})).rejects.toThrow()
  await expect(create(spec)).rejects.toThrow('权限')
  expect(await readdir(root)).toEqual([])
})

it('embeds the compact stylesheet in the portable file, with stable metadata on retry',async()=>{
  const {root,prepared,create}=await host()
  const styled={...spec,panels:[{...spec.panels[0],htmlFile:{...spec.panels[0].htmlFile,stylePreset:'compact-v1'}}]}
  const receipt=await create(styled)
  const item=prepared[0].artifact.items[0]
  const saved=await readFile(join(root,item.relativePath),'utf8')
  expect(saved).toContain('@layer workbench-compact')
  expect(saved).toContain('<button>增加人数</button>')
  expect(item.sizeBytes).toBe(Buffer.byteLength(saved))
  expect((await create(styled)).planId).toBe(receipt.planId)
  const pageWith=html=>({...styled,panels:[{...styled.panels[0],htmlFile:{...styled.panels[0].htmlFile,html}}]})
  expect(prepareWorkbenchWebpages(pageWith(saved),'trip','').pages[0].html).toBe(saved)
  const explicitHead=html.replace('<body>', '<head><meta charset="utf-8"><title>预算</title></head><body>')
  const withHead=prepareWorkbenchWebpages(pageWith(explicitHead),'trip','').pages[0].html
  expect(withHead).toContain('<title>预算</title><style')
  expect(withHead).toContain('</style></head><body>')
  expect(()=>prepareWorkbenchWebpages(pageWith(html.replace('增加人数','a'.repeat(255000))),'trip','')).toThrow('256 KB')
})

it('saves a portable comparison from costs alone, preserving missing amounts, labels and retry identity',async()=>{
  const {root,prepared,create}=await host()
  const costs={unit:'人',currency:'元',plans:[
    {name:'A&B <团餐>',costs:[{label:'包间',basis:'fixed'},{label:'套餐',basis:'perUnit',amount:0}]},
    {name:'另一家',costs:[{label:'包间',basis:'fixed',amount:100}]}]}
  const input=page=>({...spec,panels:[{type:'files',title:'预算',htmlFile:{name:'聚餐.html',...page}}]})
  const receipt=await create(input({costComparison:costs}))
  const item=prepared[0].artifact.items[0],saved=await readFile(join(root,item.relativePath),'utf8')
  const data=JSON.parse(saved.match(/<script type="application\/json" id="budget-data">([^<]+)<\/script>/)[1])
  expect(data.plans).toEqual(costs.plans);expect(saved).toContain('@layer workbench-compact')
  expect(item.sizeBytes).toBe(Buffer.byteLength(saved))
  expect((await create(input({costComparison:costs}))).planId).toBe(receipt.planId)
  expect(()=>prepareWorkbenchWebpages(input({costComparison:costs,html}),'trip','')).toThrow('只提交其中一项')
  for(const invalid of [{plans:[]},{...costs,quantity:0},{...costs,plans:[costs.plans[0],{name:'B',costs:[{label:'包间',basis:'fixed',amount:-1}]}]}])
    expect(()=>prepareWorkbenchWebpages(input({costComparison:invalid}),'trip','')).toThrow('费用比较')
})

it('counts the options in a portable budget when its workbench receipt checks the number of businesses',async()=>{
  const makePage=names=>prepareWorkbenchWebpages({panels:[{type:'files',title:'预算对比',htmlFile:{name:'预算.html',
    costComparison:{plans:names.map(name=>({name,costs:[{label:'包间费',basis:'fixed'}]}))}}}]},'trip','聚餐预算').args.panels[0].artifact
  const artifact=makePage(['门店A','门店B']), originalRequest='做个聚餐预算看板，两家店比比，改人数就能算人均，还能把网页带走。'
  const prompt='比较至少两家餐厅聚餐预算，改人数后重算。'
  const plan=(page,request)=>({originalRequest,panels:[{type:'files',title:'预算对比',prompt:request,artifact:page}]})
  expect(parseAttachmentSpec(artifact)).toEqual(artifact)
  expect(workbenchScopeDeficits(plan(artifact,prompt))).toEqual([])
  expect(workbenchScopeDeficits(plan(makePage(['门店A','门店A']),prompt))[0]).toMatchObject({actual:1,expected:2})
  expect(workbenchScopeDeficits(plan(artifact,'交付两个文件。'))[0]).toMatchObject({actual:1,expected:2})
  const runtime=new ResearchTaskRuntime({adapter:{start:async()=>{throw Error('prepared budget should not call a model')}},storage:{save:async()=>{}}})
  try {
    const [receipt]=await runtime.startPreparedBatch({parentSessionId:'parent',panels:[{canvasNodeId:'budget',prompt,artifact,
      hostContext:{workbenchRequest:{originalRequest,dataMode:'source'},sourceRequirement:prompt,
        sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:prompt}}}]})
    expect(receipt.state).toBe('completed')
    expect(receipt.deliveryStatus).not.toBe('partial')
  }finally{await runtime.dispose()}
})

it('delivers a finished webpage to the board that sent the prompt, including after a tab switch and reopening',async()=>{
  const app=await host()
  // Official FOMC calendar as observed on 2026-11-21. Keep this turn's
  // source snapshot deterministic when the live calendar advances.
  const official='https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'
  const meetings=['2026-12-08 至 2026-12-09','2027-01-26 至 2027-01-27','2027-03-16 至 2027-03-17']
  const html='<!doctype html><html lang="zh"><body><h1>美联储议息日历</h1><p>截至 2026-11-21 的三次预定会议</p><ol>'+
    meetings.map(dates=>'<li>'+dates+'</li>').join('')+'</ol><a href="'+official+'">美联储官方会议日历</a></body></html>'
  const request='做个美联储议息日历，我只想看接下来三次会议，能点到官网。'
  const delivery={request,startedAt:Date.now()}
  let time=delivery.startedAt
  const event=(type,data)=>app.event({type,data,time:++time})
  app.session.events=[]
  expect((await app.list({delivery})).deliveryStatus).toBe('pending')
  event('turn/start',{turn:1})
  event('user/message',{id:'author',source:{kind:'user'},content:[{type:'text',text:request}]})
  event('tool/call',{turn:1,callId:'file',name:'write',arguments:{file_path:'日历.html',content:html}})
  event('tool/result',{turn:1,message:{source:{kind:'tool',callId:'file'},content:[{type:'tool-result',toolCallId:'file',isError:false}]}})
  event('assistant/message',{turn:1,message:{content:[{type:'text',text:'已完成：日历.html'}]}})
  event('turn/end',{turn:1,reason:{kind:'completed'}})
  // No renderer is polling this board while the other tab is visible.
  await expect.poll(()=>app.prepared.length,{timeout:5000}).toBe(1)
  const [a,b]=await Promise.all([app.list({delivery}),app.list({delivery})])
  expect(a.deliveryStatus).toBe('accepted')
  expect(b.plans[0].id).toBe(a.plans[0].id)
  expect(app.prepared[0].artifact.presentation).toBe('webpage')
  const delivered=await readFile(join(app.root,app.prepared[0].artifact.items[0].relativePath),'utf8')
  expect(delivered).toBe(html)
  expect(delivered).toContain('href="'+official+'"')
  for (const meeting of meetings) expect(delivered).toContain(meeting)
  await app.list({acknowledged:[a.plans[0].id]})
  expect(await app.list({delivery})).toMatchObject({plans:[],deliveryStatus:'mounted'})
  expect(app.prepared).toHaveLength(1)
})

it('replays a confirmed edit to the original turn-specific HTML after a same-name file conflict',async()=>{
  const {completedResearchWebpages}=await import('../packages/dsh-research-task-runtime/workbench-webpage-delivery.js')
  const cwd='/research', file_path='/research/日历.html'
  const events=[]
  function tool(name,callId,arguments_,isError,content=[]) {
    events.push({type:'tool/call',data:{turn:1,name,callId,arguments:arguments_}},
      {type:'tool/result',data:{turn:1,message:{source:{kind:'tool',callId},content:[{type:'tool-result',toolCallId:callId,isError,content}]}}})
  }
  const envelope=[{type:'text',text:'Error: write blocked\n<path>'+file_path+'</path>\n<type>file</type>\n<content>\n1: <html>原稿</html>\n\n(End of file - total 1 lines)\n</content>'}]
  tool('write','blocked',{file_path,content:'错误草稿'},true,envelope)
  tool('edit','changed',{file_path,old_string:'原稿',new_string:'已修订'},false)
  tool('write','outside',{file_path:'../其他.html',content:'外部文件'},false)
  tool('read','readonly',{file_path:'/research/材料.html'},false,[{type:'text',text:envelope[0].text.replace(file_path,'/research/材料.html')}])
  const final={type:'assistant/message',data:{turn:1,message:{content:[{type:'text',text:'日历.html。材料.html 和 其他.html 是参考文件。'}]}}}
  const end={type:'turn/end',data:{turn:1,reason:{kind:'completed'}}}
  const pages=list=>completedResearchWebpages({turn:1,cwd,events:list})
  expect(pages([...events,final])).toBeUndefined()
  expect(pages([...events,final,end]).map(p=>p.htmlFile)).toEqual([{name:'日历.html',html:'<html>已修订</html>'}])
  const receipt=text=>({...final,data:{turn:1,message:{content:[{type:'text',text}]}}})
  expect(pages([...events,receipt('议息日历已生成。'),end])).toHaveLength(1)
  expect(pages([...events,receipt('请打开 '+encodeURI(file_path)),end])).toHaveLength(1)
  expect(pages([...events,receipt('将继续查阅资料。'),end])).toEqual([])
  expect(pages([...events,end])).toEqual([])
  expect(pages([...events,final,{...end,data:{turn:1,reason:{kind:'cancelled'}}}])).toEqual([])
})
