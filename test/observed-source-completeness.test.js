import {expect,it} from 'vitest'
import {evaluateMapping} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {hostStructuredWebRecord,resolveComponentSnapshot} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {observedReleaseTimeline,readReleaseTimeline,releaseTimelineScope,releaseTimelineComplete,workbenchReleaseScope} from '../packages/dsh-research-task-runtime/observed-dated-feed.js'
import {commonPriceScope,observedCommonPriceComparison} from '../packages/dsh-research-task-runtime/observed-series-comparison.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'

const page=(url,data,truncated=false)=>({url,statusCode:200,truncated,body:{kind:'text',content:'[网页读取状态：已滚动至文末，完成正文收集]\n\n'+JSON.stringify(data)}})
const releaseRequest='只放一张发布动态卡。请使用公开 GitHub Releases，分别保留 example/vite 和 example/vue 最近各 4 条，保留完整发布说明。先按时间线呈现，超出容量时切换成可分页来源列表。'
const scope=releaseTimelineScope(releaseRequest)
const query='工作台：测试\n本面板：发布动态\n使用 GitHub Releases。\n仅生成本面板，优先使用 html 类型。'
const body='实际原始发布说明。'.repeat(400)
const rows=repo=>Array.from({length:4},(_,i)=>({tag_name:'v'+(4-i),published_at:`2026-11-0${4-i}T10:00:00Z`,html_url:`https://github.com/example/${repo}/releases/tag/v${4-i}`,draft:false,body:body+i}))

it('reads quoted and legacy dotted keys without changing nested or indexed paths',()=>{
 const data={data:{'usAAPL.OQ':{day:[['2026-11-06',12]]},nested:{x:{y:7},'x.y':8}}}
 const read=field=>evaluateMapping({$path:field},data,undefined,data)
 expect(read('data["usAAPL.OQ"].day[0][1]')).toBe(12)
 expect(read('data.usAAPL.OQ.day.0.1')).toBe(12)
 expect(read('data.nested.x.y')).toBe(7)
 expect(read('data.nested["x.y"]')).toBe(8)
 expect(()=>read('data["constructor"]')).toThrow('字段路径无效')
})

it('shrinks a truncated page and restarts at page one, preserving original bodies across pages',async()=>{
 const calls=[]
 const records=await readReleaseTimeline(scope,async url=>{
  const u=new URL(url),repo=u.pathname.split('/')[3],size=Number(u.searchParams.get('per_page')),index=Number(u.searchParams.get('page')??1)
  calls.push([repo,size,index])
  return page(url,rows(repo).slice((index-1)*size,index*size),size===4)
 })
 expect(calls.filter(([repo])=>repo==='vite')).toEqual([['vite',4,1],['vite',2,1],['vite',2,2]])
 expect(records).toHaveLength(4)
 const snapshot=resolveComponentSnapshot(observedReleaseTimeline(scope,records,'发布动态'),records)
 expect(snapshot.capacitySnapshot).toBe(true)
 expect(snapshot.data.items.map(item=>item.summary)).toEqual([...rows('vite'),...rows('vue')].map(row=>row.body))
 expect(new Set(snapshot.data.items.map(item=>item.url)).size).toBe(8)
 expect(releaseTimelineComplete(scope,snapshot.data,records)).toBe(true)
 const partial=structuredClone(snapshot.data)
 partial.items[0].summary='被缩短的说明'
 expect(releaseTimelineComplete(scope,partial,records)).toBe(false)
 partial.items.pop()
 expect(releaseTimelineComplete(scope,partial,records)).toBe(false)
})

it('restarts at page one when a later page truncates and rejects missing bodies or repeated rows',async()=>{
 const scope={repos:['example/vite'],count:5,includeBody:true},calls=[]
 const all=[...rows('vite'),{...rows('vite')[0],tag_name:'v0',html_url:'https://github.com/example/vite/releases/tag/v0'}]
 const fetched=await readReleaseTimeline(scope,async url=>{
  const u=new URL(url),size=Number(u.searchParams.get('per_page')),index=Number(u.searchParams.get('page')??1)
  calls.push([size,index])
  return page(url,all.slice((index-1)*size,index*size),size===5||size===2&&index===2)
 })
 expect(calls.slice(0,5)).toEqual([[5,1],[2,1],[2,2],[1,1],[1,2]])
 expect(fetched).toHaveLength(5)
 const broken=structuredClone(fetched);delete broken[1].response.records[0].body
 expect(observedReleaseTimeline(scope,broken,'发布动态')).toBeUndefined()
 broken[1].response.records[0]={...broken[0].response.records[0]}
 expect(observedReleaseTimeline(scope,broken,'发布动态')).toBeUndefined()
})

it('aligns two verified dotted-key histories on the actual common trading days',()=>{
 const scope=commonPriceScope('比较苹果 AAPL 和微软 MSFT 近 2 个共同交易日基期 100 走势','基期 100 对比','chart')
 const records=['AAPL','MSFT'].map((s,i)=>{
  const key='us'+s+'.OQ',url='https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='+key+',day,,,3,qfq'
  const pairs=i?[[2,10],[3,12],[4,8]]:[[1,20],[2,30],[4,45]]
  return hostStructuredWebRecord(page(url,{code:0,data:{[key]:{day:pairs.map(([day,close])=>[`2026-11-0${day}`,close,close])}}}),url)
 })
 expect(observedCommonPriceComparison(scope,records,'走势')).toMatchObject({
  labels:['2026-11-02','2026-11-04'],series:[{name:'AAPL',values:[100,150]},{name:'MSFT',values:[100,80]}]})
 expect(observedCommonPriceComparison(scope,records.slice(0,1),'走势')).toBeUndefined()
})

it('does not mark a one-record HTML artifact complete when the requested source cohort is missing',async()=>{
 const html='<html><body><p>只有一条发布说明，声称已经交付全部八条。</p></body></html>'
 const adapter={start:async()=>({childSessionId:'fixture-release',result:Promise.resolve({stopReason:'completed',sourceRecords:[],
  output:[{type:'text',text:JSON.stringify({version:1,type:'html',title:'发布动态',html})}]}),dispose:async()=>{}})}
 const runtime=new ResearchTaskRuntime({adapter,storage:{save:async()=>{}},retryDelayMs:0})
 try{
  const receipt=await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:query},{
   workbenchRequest:{originalRequest:releaseRequest,dataMode:'source'},
   sourceRequirement:'使用公开 GitHub Releases',
   sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:'使用公开 GitHub Releases'}
  })
  await runtime.tasks.get(receipt.taskId).runPromise
  const t=runtime.inspect({parentSessionId:'parent',taskId:receipt.taskId})
  expect(t.state).toBe('failed')
  expect(t.error).toContain('未取得要求的完整记录或正文')
  expect(t.finalOutput).toBeUndefined()
 }finally{await runtime.dispose()}
})


it('按用户的发布表需求无损映射完整来源行和长正文，缺行或改正文不能完成',async()=>{
 const request='做升级研究，用可搜索总表列出 example/vue 最近4条发布记录，包含版本、发布日期、变更要点和原始链接，只用 GitHub 和官网。'
 const scope=workbenchReleaseScope(request,'发布记录可搜索总表','table')
 expect(scope).toEqual({repos:['example/vue'],count:4,includeBody:true,presentation:'table'})
 expect(workbenchReleaseScope(request,'包关系图','html')).toBeUndefined()
 expect(workbenchReleaseScope(request+'只要稳定版','发布记录','table')).toMatchObject({stableOnly:true})
 const records=await readReleaseTimeline(scope,async url=>page(url,rows('vue')))
 const mapped=observedReleaseTimeline(scope,records,'最近发布')
 const snapshot=resolveComponentSnapshot(mapped,records)
 expect(snapshot.data.rows.map(row=>row[3])).toEqual(rows('vue').map(row=>row.body))
 expect(snapshot.data.rows.map(row=>row[2])).toEqual(rows('vue').map(row=>row.html_url))
 expect(releaseTimelineComplete(scope,snapshot.data,records)).toBe(true)
 const broken=structuredClone(snapshot.data);broken.rows[0][3]='缩略';expect(releaseTimelineComplete(scope,broken,records)).toBe(false)
 broken.rows.pop();expect(releaseTimelineComplete(scope,broken,records)).toBe(false)
})


it('allows one-record transport pages to finish a larger requested collection without a fixed twenty-read cutoff',async()=>{
 const scope={repos:['example/long'],count:40,includeBody:true},calls=[]
 const all=Array.from({length:40},(_,i)=>({tag_name:'v'+i,published_at:'2026-11-01T10:00:00Z',html_url:'https://github.com/example/long/releases/tag/v'+i,draft:false,body:'来源原始正文'.repeat(200)+i}))
 const records=await readReleaseTimeline(scope,async url=>{
  const u=new URL(url),size=Number(u.searchParams.get('per_page')),index=Number(u.searchParams.get('page')??1)
  calls.push([size,index]);return page(url,all.slice((index-1)*size,index*size),size>1)
 })
 expect(records).toHaveLength(40)
 expect(calls.length).toBeLessThanOrEqual(48)
 const snapshot=resolveComponentSnapshot(observedReleaseTimeline(scope,records,'长正文集合'),records)
 expect(releaseTimelineComplete(scope,snapshot.data,records)).toBe(true)
 expect(snapshot.data.items.map(row=>row.summary)).toEqual(all.map(row=>row.body))
})

it.each([1,10,30])('flattens %i-row transport pages into one complete source-backed table',async size=>{
 const scope={repos:['example/paged'],count:40,includeBody:true,presentation:'table'}
 const all=Array.from({length:60},(_,i)=>({tag_name:'v'+i,published_at:'2026-11-01T10:00:00Z',html_url:'https://github.com/example/paged/releases/tag/v'+i,draft:false,body:i===31?'完整长正文'.repeat(1800):'真实说明'+i}))
 const records=[]
 for(let i=0;i<Math.ceil(40/size);i++){
  const url=`https://api.github.com/repos/example/paged/releases?per_page=${size}&page=${i+1}`
  records.push(hostStructuredWebRecord(page(url,all.slice(i*size,(i+1)*size)),url))
 }
 const snapshot=resolveComponentSnapshot(observedReleaseTimeline(scope,records,'分页记录'),records)
 expect(snapshot?.data.rows).toEqual(all.slice(0,40).map(r=>[r.tag_name,r.published_at,r.html_url,r.body]))
 expect(releaseTimelineComplete(scope,snapshot.data,records)).toBe(true)
 expect(snapshot.output).toContain('完整长正文')
})

it('keeps shared collection counts off adjacent graph and analysis cards citing release sources',()=>{
 const request='用关系图梳理核心包，用可搜索总表列出 example/vue 最近40条发布记录，再总结升级事项。只用 GitHub 和官网。'
 const graph='本面板：核心包与生态关系图\n绘制包关系图并标注兼容版本。数据来源仅限官方文档与 GitHub 各仓库的 package.json/releases 信息，标注来源。'
 const citations='本面板：升级注意事项\n总结升级风险。Sources: GitHub Releases and official guides.'
 expect(workbenchReleaseScope(request,graph,'html')).toBeUndefined()
 expect(workbenchReleaseScope(request,citations,'html')).toBeUndefined()
 expect(workbenchReleaseScope(request,'本面板：发布记录总表\n保留每条版本和完整变更要点。来源：GitHub Releases','table')).toMatchObject({count:40,includeBody:true,presentation:'table'})
 expect(workbenchReleaseScope(request,'Release records\nList every release and its original notes','html')).toMatchObject({count:40})
})


it('retains a titled browser JSON response through adaptive pagination and complete delivery',async()=>{
 const scope={repos:['example/titled'],count:40,includeBody:true,presentation:'table'},calls=[]
 const all=Array.from({length:40},(_,i)=>({tag_name:'v'+i,published_at:'2026-11-01T10:00:00Z',html_url:'https://github.com/example/titled/releases/tag/v'+i,draft:false,body:'正文保留换行\n'+i}))
 const records=await readReleaseTimeline(scope,async url=>{
  const u=new URL(url),size=Number(u.searchParams.get('per_page')),index=Number(u.searchParams.get('page')??1)
  calls.push([size,index])
  const response=page(url,all.slice((index-1)*size,index*size),size>20)
  response.body.content=url+'\n\n'+response.body.content
  return response
 })
 const snapshot=resolveComponentSnapshot(observedReleaseTimeline(scope,records,'完整记录'),records)
 expect(calls).toEqual([[40,1],[20,1],[20,2]])
 expect(snapshot.data.rows).toEqual(all.map(row=>[row.tag_name,row.published_at,row.html_url,row.body]))
 expect(releaseTimelineComplete(scope,snapshot.data,records)).toBe(true)
})

it.each(['rate-limit-json','http-error','transport-error'])('switches %s to the same official website and retains all forty records and full bodies',async failure=>{
 const scope={repos:['example/paged'],count:40,includeBody:true,presentation:'table'},calls=[]
 const all=Array.from({length:40},(_,i)=>({tag_name:'v'+i,published_at:'2026-11-01T10:00:00Z',html_url:'https://github.com/example/paged/releases/tag/v'+i,draft:false,body:'网页全文与原始链接'.repeat(i===31?800:2)+i,body_format:'official-webpage-transcription',body_complete:true}))
 const records=await readReleaseTimeline(scope,async url=>{
  calls.push(url)
  const u=new URL(url)
  if(u.hostname==='api.github.com'){
   if(failure==='transport-error')throw Error('temporary failure')
   return failure==='http-error'?{url,statusCode:403,body:{kind:'text',content:'rate limited'}}:page(url,{message:'API rate limit exceeded'})
  }
  const n=Number(u.searchParams.get('page'));return page(url,all.slice((n-1)*10,n*10))
 })
 expect(calls).toHaveLength(5)
 expect(calls.slice(1)).toEqual([1,2,3,4].map(n=>'https://github.com/example/paged/releases?page='+n))
 const snapshot=resolveComponentSnapshot(observedReleaseTimeline(scope,records,'完整发布总表'),records)
 expect(releaseTimelineComplete(scope,snapshot.data,records)).toBe(true)
 expect(snapshot.data.rows).toEqual(all.map(r=>[r.tag_name,r.published_at,r.html_url,r.body]))
 const broken=structuredClone(records);broken[1].response.records[0].body_complete=false
 expect(observedReleaseTimeline(scope,broken,'不得静默丢失图片')).toBeUndefined()
 broken[1].response.records[0]=structuredClone(records[0].response.records[0])
 expect(observedReleaseTimeline(scope,broken,'不得重复前页')).toBeUndefined()
})

it('selects the latest stable release records across pages instead of treating a minor-version boundary as a release',async()=>{
 const request='给团队看 example/project 最近3个正式版本的日期和完整发布说明。'
 const selected=workbenchReleaseScope(request,'发布记录与版本日期','timeline')
 expect(selected).toMatchObject({repos:['example/project'],count:3,stableOnly:true,includeBody:true})
 const list=[
  ['v2.4.0-rc.1',true],['v2.3.9',false],['v2.3.8',false],['v2.3.8-beta.1',true],['v2.3.7',false]
 ].map(([tag_name,prerelease],i)=>({tag_name,prerelease,draft:false,published_at:`2026-11-0${8-i}T10:00:00Z`,html_url:'https://github.com/example/project/releases/tag/'+tag_name,body:'完整原始正文 '+tag_name}))
 const records=await readReleaseTimeline(selected,async url=>{const u=new URL(url),size=Number(u.searchParams.get('per_page')),pageIndex=Number(u.searchParams.get('page')??1);return page(url,list.slice((pageIndex-1)*size,pageIndex*size))})
 const snapshot=resolveComponentSnapshot(observedReleaseTimeline(selected,records,'正式版本'),records)
 expect(snapshot.data.items.map(item=>item.title)).toEqual(['v2.3.9','v2.3.8','v2.3.7'])
 expect(snapshot.data.items.map(item=>item.summary)).toEqual(['完整原始正文 v2.3.9','完整原始正文 v2.3.8','完整原始正文 v2.3.7'])
 expect(releaseTimelineComplete(selected,snapshot.data,records)).toBe(true)
})

it('uses one actually observed official repository without guessing a repository from a product name',async()=>{
 const {observedWorkbenchReleaseScope,releaseCohortIssue}=await import('../packages/dsh-research-task-runtime/observed-dated-feed.js')
 const url='https://api.github.com/repos/example/product/releases?per_page=4'
 const all=rows('product').map((row,i)=>({...row,prerelease:i===0}))
 const record=hostStructuredWebRecord(page(url,all),url)
 const original='给同事看 Product 最近3个正式版本的日期与主要变化，以及对应升级注意事项。'
 expect(observedWorkbenchReleaseScope(original,'版本日期与主要变化','timeline',[record])).toMatchObject({repos:['example/product'],count:3,stableOnly:true})
 const good={version:1,type:'table',title:'升级注意事项',columns:['版本','注意事项'],rows:[['v3','原注意事项'],['v2','原注意事项'],['v1','原注意事项']]}
 expect(releaseCohortIssue(good,[record],original,'升级注意事项')).toBeUndefined()
 expect(releaseCohortIssue({...good,rows:[['v4','预发布'],['v3','原注意事项'],['v2','原注意事项']]},[record],original,'升级注意事项')).toContain('正式发布集合')
 const another=hostStructuredWebRecord(page('https://api.github.com/repos/other/product/releases?per_page=4',all),'https://api.github.com/repos/other/product/releases?per_page=4')
 expect(observedWorkbenchReleaseScope(original,'版本日期','timeline',[record,another])).toBeUndefined()
 expect(releaseCohortIssue(good,[record],'只看旧版v1的迁移办法','升级注意事项')).toBeUndefined()
})
