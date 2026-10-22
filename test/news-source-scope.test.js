import {describe,it,expect,vi} from 'vitest'
import {validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {preparePublicDataPanel} from '../packages/dsh-research-task-runtime/workbench-public-data.js'
import {resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {ComponentDataRefresh} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {prepareRequest,createQueryClient} from '../skills/ework-free-data-sources/scripts/query.mjs'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {Window} from 'happy-dom'
import {runInNewContext} from 'node:vm'

// Synthetic provider rows: these exercise routing and persistence, not live news.
const newsPanel=(title,prompt)=>({title,prompt,type:'news',size:'large',publicData:{profile:'news',requests:[{source:'sina-news',parameters_json:'{"limit":12}'}],intervalMinutes:1}})
const general={version:1,type:'news',title:'全市场财经资讯',items:[{title:'港股市场成交额上升',summary:'合成测试记录',date:'2026-10-22',url:'https://example.org/general'}]}
const broadRequest={key:'q',tool:'public_data_query',args:{operation:'query',source:'sina-news',parameters_json:'{"limit":12}'}}
const mapping=title=>({version:1,type:'news',title,items:{$from:'q',$each:'records',$map:{title:{$path:'title'},summary:{$path:'summary'},date:{$path:'time'},url:{$path:'url'}}}})
const record=(request,rows)=>({tool:request.tool,args:request.args,response:{sourceId:request.args.source,records:rows}})
const broadRows=general.items.map(item=>({...item,time:item.date}))

describe('news research scope',()=>{
 it.each([
  ['加密市场最新资讯','最新加密货币相关财经资讯流（新浪财经新闻，limit:12），每分钟自动刷新'],
  ['航司动态','南方航空、中国国航与春秋航空最近事件'],
  ['半导体观察','存储芯片供需与设备出口变化'],
  ['古籍修复进展','纸张修复、脱酸技术与馆藏保护最新报道'],
  ['Climate research updates','Recent climate research and adaptation stories']
 ])('routes %s to scoped retrieval instead of relabeling a total feed', (title,prompt)=>{
  const input={requestId:'scoped-news',title:'研究工作台',originalRequest:`围绕${title}创建研究工作台`,panels:[newsPanel(title,prompt)]}
  const panel=validateWorkbench(input).panels[0]
  expect(panel.publicData).toBeUndefined()
  expect(panel.prompt).toContain(prompt)
  expect(panel.prompt).toContain('不得扩大为全市场新闻')
  expect(workbenchPanelPrompt(input,panel)).toContain(input.originalRequest)
  expect(workbenchPanelPrompt(input,panel)).toContain('gdelt-news')
  expect(workbenchPanelPrompt(input,panel)).toContain('别名')
  expect(validateWorkbench({...input,panels:[panel]}).panels[0]).toEqual(panel)
 })

 it('retains a parent subject when the child title and prompt are generic',()=>{
  const input={requestId:'parent-topic',title:'古籍保护监测',originalRequest:'为古籍保护和纸张脱酸建立实时研究工作台',panels:[newsPanel('最新新闻','展示12条新闻标题、日期、原文') ]}
  const panel=validateWorkbench(input).panels[0]
  expect(panel.publicData).toBeUndefined()
  expect(panel.prompt).toContain('古籍保护')
  expect(workbenchPanelPrompt(input,panel)).toContain('纸张脱酸')
 })

 it('uses this request rather than an unrelated old notebook title and does not broaden a negated general feed',()=>{
  const input={requestId:'winter-notebook',title:'冬日山茶',originalRequest:'生成一个实时加密货币行情监控工作台，不要全市场财经资讯',panels:[newsPanel('全市场财经资讯','新闻列表')]}
  const panel=validateWorkbench(input).panels[0]
  expect(panel.publicData).toBeUndefined()
  const prompt=workbenchPanelPrompt(input,panel)
  expect(prompt).toContain(input.originalRequest)
  expect(prompt).toContain('本轮originalRequest与本面板规划优先于会话名、笔记标题')
 })

 it('retains a declared targeted provider query without rejecting the workbench',()=>{
  const panel=newsPanel('半导体新闻','芯片产业动态');panel.publicData.requests=[{source:'eastmoney-news',parameters_json:'{"query":"半导体","limit":12}'}]
  const result=validateWorkbench({requestId:'targeted-provider',title:'半导体产业观察',panels:[panel]}).panels[0]
  expect(result.publicData).toBeUndefined();expect(result.prompt).toContain('"source":"eastmoney-news"');expect(result.prompt).toContain('"query":"半导体"')
 })

 it('normalizes the fixed keyword provider and preserves empty results without a general-feed fallback',async()=>{
  const request=prepareRequest('eastmoney-news',{query:'古籍修复',limit:5}),endpoint=new URL(request.endpoint),parameters=JSON.parse(endpoint.searchParams.get('param'))
  expect(endpoint.origin).toBe('https://search-api-web.eastmoney.com');expect(parameters.keyword).toBe('古籍修复')
  const fetcher=vi.fn(async()=>new Response('ework({"code":0,"result":{"cmsArticle":[]}})'))
  const result=await createQueryClient({fetcher}).query({source:'eastmoney-news',parameters:{query:'古籍修复',limit:5}})
  expect(result.records).toEqual([]);expect(result.coverage.query).toBe('古籍修复');expect(fetcher).toHaveBeenCalledTimes(1)
  const parsed=prepareRequest('eastmoney-news',{query:'半导体',limit:5}).normalize('ework({"code":0,"result":{"cmsArticle":[{"title":"半导体供需变化（合成样本）","content":"芯片产业研究片段（合成样本）","date":"2026-10-22 08:00:00","code":"202610221234567890","mediaName":"合成样本媒体"}]}})')
  expect(parsed.records[0]).toMatchObject({title:'半导体供需变化（合成样本）',time:'2026-10-22T08:00:00+08:00',summary:'芯片产业研究片段（合成样本）',url:'https://finance.eastmoney.com/a/202610221234567890.html'})
  for(const parameters of [{query:'半导体',url:'http://private.test'},{query:'半导体',headers:{authorization:'secret'}},{query:'',limit:5}])expect(()=>prepareRequest('eastmoney-news',parameters)).toThrow()
 })

 it('keeps an explicitly requested whole-market finance feed executable',()=>{
  const panel=validateWorkbench({requestId:'general-news',title:'全市场财经资讯',originalRequest:'生成全市场财经资讯总流',panels:[newsPanel('全市场财经资讯','读取财经总流，不按公司或主题筛选')]}).panels[0]
  expect(panel.publicData.requests[0].source).toBe('sina-news')
 })

 it.each([41,50,100])('preserves a valid %i-record total-feed request in a full-capacity table worker',limit=>{
  const source=newsPanel('全市场财经资讯',`展示实际取得的${limit}条全市场财经资讯`);source.publicData.requests[0].parameters_json=JSON.stringify({limit})
  const input={requestId:'news-capacity-'+limit,title:'财经总流',originalRequest:`生成全市场财经资讯总流，保留${limit}条原始报道`,panels:[source]}
  const panel=validateWorkbench(input).panels[0]
  expect(panel.type).toBe('table');expect(panel.publicData).toBeUndefined()
  expect(panel.prompt).toContain(`"limit":${limit}`);expect(panel.prompt).toContain('不用slice/$take裁为40条')
  expect(panel.prompt).toContain('排序分组');expect(workbenchPanelPrompt(input,panel)).toContain('优先使用 table 类型')
  expect(validateWorkbench({...input,panels:[panel]}).panels[0]).toEqual(panel)
 })

 it('keeps OpenTerminal news capacity in its table variant and retains topic safeguards',()=>{
  const source=newsPanel('半导体产业新闻','半导体新闻，最多50条');source.publicData.requests=[{source:'eastmoney-news',parameters_json:'{"query":"半导体","limit":50}'}];source.publicData.layoutProfile='openterminal'
  const input={requestId:'topic-capacity-layout',title:'半导体研究',originalRequest:'半导体产业相关新闻，保留最多50条',panels:[source]},panel=validateWorkbench(input).panels[0]
  expect(panel.type).toBe('market');expect(panel.prompt).toContain('market.table');expect(panel.prompt).toContain('layoutProfile:openterminal')
  expect(workbenchPanelPrompt(input,panel)).toContain('【新闻主题约束】')
  expect(workbenchPanelPrompt(input,panel)).toContain('旧publicData配方的选源不代表用户指定来源')
 })

 it('materializes all 100 source records after capacity routing, including the final article',()=>{
  const source=newsPanel('全市场财经资讯','完整100条财经总流');source.publicData.requests[0].parameters_json='{"limit":100}'
  const input={requestId:'full-news-capacity',title:'财经总流',originalRequest:'全市场财经资讯100条',panels:[source]},panel=validateWorkbench(input).panels[0],scope=workbenchPanelPrompt(input,panel)
  const request={...broadRequest,args:{...broadRequest.args,parameters_json:'{"limit":100}'}}
  const rows=Array.from({length:100},(_,i)=>({title:`合成财经报道${i+1}`,time:'2026-10-22',publisher:'合成媒体',url:`https://example.org/news-${i+1}`}))
  const draft={version:1,type:'data-bound',requests:[request],mapping:{version:1,type:'table',title:panel.title,columns:['标题','时间','媒体','原文'],rows:{$from:'q',$each:'records',$map:[{$path:'title'},{$path:'time'},{$path:'publisher'},{$path:'url'}]}}}
  const result=resolveBoundComponent(JSON.stringify(draft),[record(request,rows)],new Date(),{newsScope:scope})
  expect(result.data.rows).toHaveLength(100);expect(result.data.rows.at(-1)[0]).toBe('合成财经报道100');expect(result.recipe.requests[0].args.parameters_json).toBe('{"limit":100}')
  expect(result.recipe.newsScope).toBe(scope)
 })

 it.each([undefined,'openterminal'])('routes 120 queried articles to an accepted complete HTML search/pagination view (layout=%s)',layoutProfile=>{
  const source=newsPanel('半导体产业资讯','两组查询各最多60条，完整保留所有相关新闻，每分钟更新')
  source.publicData.requests=['半导体','芯片'].map(query=>({source:'eastmoney-news',parameters_json:JSON.stringify({query,limit:60})}))
  if(layoutProfile)source.publicData.layoutProfile=layoutProfile
  const input={requestId:'news-120-'+String(layoutProfile),title:'半导体研究',originalRequest:'完整保留半导体及芯片相关新闻，按主题分类并每分钟更新',panels:[source]},panel=validateWorkbench(input).panels[0]
  expect(panel.type).toBe('html');expect(panel.publicData).toBeUndefined();expect(panel.prompt).toContain('"limit":60');expect(panel.prompt).toContain('分页')
  expect(panel.prompt).toContain('当前为快照');expect(panel.prompt).toContain('周期更新要求仍保留')
  if(layoutProfile)expect(panel.prompt).toContain('不要设置HTML不支持的artifact.layoutProfile')
  expect(workbenchPanelPrompt(input,panel)).toContain('【新闻主题约束】');expect(validateWorkbench({...input,panels:[panel]}).panels[0]).toEqual(panel)

  // Synthetic contract fixture: all 120 records live in the accepted artifact;
  // paging only changes visibility and never truncates the underlying dataset.
  const articles=Array.from({length:120},(_,i)=>`<article data-group="${i<60?'半导体':'芯片'}"><h2>合成报道${i+1}</h2><time>2026-10-22</time><p>合成媒体 · ${i<60?'半导体':'芯片'} · 合成匹配片段</p><a href="https://example.org/news-${i+1}">原文</a></article>`).join('')
  const code=`const rows=Array.from(document.querySelectorAll('article')),search=document.getElementById('search'),group=document.getElementById('group'),prev=document.getElementById('prev'),next=document.getElementById('next');let page=0;function draw(){const found=rows.filter(row=>Array.from(row.children).map(cell=>cell.textContent).join(' ').includes(search.value)&&(!group.value||row.dataset.group===group.value));rows.forEach(row=>row.hidden=true);found.forEach((row,i)=>row.hidden=Math.floor(i/10)!==page);prev.disabled=page===0;next.disabled=(page+1)*10>=found.length;document.getElementById('count').textContent=found.length+'条，第'+(page+1)+'页';}search.oninput=group.onchange=()=>{page=0;draw()};prev.onclick=()=>{if(page>0)page--;draw()};next.onclick=()=>{if(!next.disabled)page++;draw()};draw();`
  const html=`<style>body{color:var(--sherlock-text);background:var(--sherlock-surface)}article[hidden]{display:none}</style><p>原需求每分钟更新；当前为快照，尚未绑定自动更新</p><input id="search" aria-label="搜索新闻"><select id="group" aria-label="主题分组"><option value="">全部</option><option>半导体</option><option>芯片</option></select><button id="prev">上一页</button><button id="next">下一页</button><p id="count" role="status"></p>${articles}<script>${code}</script>`
  const output=acceptArtifactOutput(JSON.stringify({version:1,type:'html',title:panel.title,html}))
  expect(output).toBeTypeOf('string')
  const spec=JSON.parse(output),window=new Window();window.document.body.innerHTML=spec.html;runInNewContext(code,{document:window.document})
  try{
   expect(window.document.querySelectorAll('article')).toHaveLength(120)
   for(let i=0;i<11;i++)window.document.getElementById('next').onclick()
   expect(window.document.querySelector('article:not([hidden]):last-of-type')?.textContent).toContain('合成报道120')
   window.document.getElementById('search').value='合成报道120';window.document.getElementById('search').oninput()
   expect(Array.from(window.document.querySelectorAll('article:not([hidden])')).map(row=>row.querySelector('h2')?.textContent)).toEqual(['合成报道120'])
   expect(window.document.querySelector('article:not([hidden]) a').href).toBe('https://example.org/news-120')
  }finally{window.happyDOM.abort()}
 })

 it.each([{query:'半导体',limit:101},{query:'半导体',limit:60,url:'https://private.test'},{query:'芯片',limit:60,headers:{authorization:'secret'}}])('does not hide malformed parameters behind the large-news capacity route: %j',parameters=>{
  const source=newsPanel('半导体资讯','完整记录');source.publicData.requests=[{source:'eastmoney-news',parameters_json:'{"query":"芯片","limit":60}'},{source:'eastmoney-news',parameters_json:JSON.stringify(parameters)}]
  expect(()=>validateWorkbench({requestId:'invalid-large-news',title:'半导体',panels:[source]})).toThrow()
 })

 it('rejects an old scoped direct recipe before fetching unrelated total-feed records',async()=>{
  const query=vi.fn(async()=>({sourceId:'sina-news',records:broadRows}))
  await expect(preparePublicDataPanel(newsPanel('加密市场最新资讯','加密货币相关新闻'),{query},new AbortController().signal)).rejects.toThrow('主题')
  expect(query).not.toHaveBeenCalled()
 })

 it('does not accept or bind a total feed as a scoped component even when the model omits its title',()=>{
  for(const title of ['加密市场最新资讯','古籍保护动态']){
   const draft={version:1,type:'data-bound',requests:[broadRequest],mapping:mapping(title)}
   expect(()=>resolveBoundComponent(JSON.stringify(draft),[record(broadRequest,broadRows)],new Date(),{newsScope:`只关注${title}`})).toThrow('主题')
  }
 })

 it('checks the evaluated source identity while preserving legal source argument mappings',async()=>{
  const request={...broadRequest,args:{...broadRequest.args,source:{$default:'sina-news'}}}
  const draft={version:1,type:'data-bound',requests:[request],mapping:mapping('加密市场新闻')}
  expect(()=>resolveBoundComponent(JSON.stringify(draft),[record(broadRequest,broadRows)],new Date(),{newsScope:'只展示加密货币相关新闻'})).toThrow('主题')
  const spec=JSON.parse(acceptArtifactOutput(JSON.stringify({...general,title:'加密市场新闻'})))
  const service=new ComponentDataRefresh({owner:()=> 'owner',load:async()=>[],save:async()=>{},validateRequest:async row=>row,inspect:async()=>({spec,writable:true,revision:'r'}),apply:async()=>{},execute:async()=>{}})
  await service.load()
  await expect(service.bind({sessionId:'s',nodeId:'n',workspaceId:'w',requests:[{key:'q',toolId:'public_data_query',args:request.args}],mapping:draft.mapping,newsScope:'只展示加密货币相关新闻'})).rejects.toThrow('主题')
  const targeted={...request,args:{...request.args,source:{$default:'eastmoney-news'},parameters_json:'{"query":"加密货币","limit":12}'}}
  const actual={...targeted,args:{...targeted.args,source:'eastmoney-news'}}
  const result=resolveBoundComponent(JSON.stringify({...draft,requests:[targeted]}),[record(actual,broadRows)],new Date(),{newsScope:'只展示加密货币相关新闻'})
  expect(result.recipe.requests[0].args.source).toEqual({$default:'eastmoney-news'})
  await service.dispose()
 })

 it('keeps the successful targeted query and parent scope in the refresh recipe',async()=>{
  const targeted={...broadRequest,args:{operation:'query',source:'gdelt-news',parameters_json:'{"query":"(Bitcoin OR BTC OR Ethereum OR ETH)","limit":12}'}}
  const rows=[{title:'Bitcoin ETF market activity',summary:'Synthetic source summary',time:'2026-10-22',url:'https://example.org/bitcoin'}]
  const scope='工作台：加密货币行情监控\n本面板：加密市场新闻\n只检索加密货币相关报道，保留BTC/Bitcoin等别名。'
  const result=resolveBoundComponent(JSON.stringify({version:1,type:'data-bound',requests:[targeted],mapping:mapping('加密市场新闻')}),[record(targeted,rows)],new Date(),{newsScope:scope})
  expect(result.recipe.newsScope).toBe(scope)
  expect(result.recipe.requests[0].args).toEqual(targeted.args)
  let spec=JSON.parse(result.output),stored=[]
  const execute=vi.fn(async()=>({sourceId:'gdelt-news',records:[{...rows[0],title:'Ethereum network update'}]}))
  const service=new ComponentDataRefresh({owner:()=> 'owner',load:async()=>stored,save:async value=>{stored=structuredClone(value)},validateRequest:async request=>request,execute,inspect:async()=>({spec,writable:true,revision:'r'}),apply:async(_b,_rev,value)=>{spec=value}})
  await service.load()
  const binding=await service.bind({sessionId:'s',nodeId:'n',workspaceId:'w',...result.recipe})
  await service.refresh(binding.id)
  expect(execute.mock.calls[0][2]).toEqual(targeted.args)
  expect(readTemplateModel(spec).data.items[0].title).toBe('Ethereum network update')
  expect(stored[0].newsScope).toBe(scope)
 })

 it.each(['sina-news',{$default:'sina-news'}])('refuses a restored legacy thematic total-feed binding and preserves the existing card (%j)',async source=>{
  let spec=JSON.parse(acceptArtifactOutput(JSON.stringify({...general,title:'加密市场新闻'})))
  const before=structuredClone(spec),execute=vi.fn(async()=>({sourceId:'sina-news',records:broadRows})),apply=vi.fn()
  const stored=[{id:'b',sessionId:'s',nodeId:'n',workspaceId:'w',ownerAccountId:'owner',templateId:'news',templateVersion:readTemplateModel(spec).version,requests:[{key:'q',toolId:'public_data_query',args:{...broadRequest.args,source}}],mapping:mapping('加密市场新闻'),intervalMinutes:1,enabled:true}]
  const service=new ComponentDataRefresh({owner:()=> 'owner',load:async()=>stored,save:async()=>{},validateRequest:async request=>request,execute,inspect:async()=>({spec,writable:true,revision:'r'}),apply})
  await service.load();const status=await service.refresh('b')
  expect(status.status).toBe('error');expect(status.error).toContain('主题')
  expect(execute).not.toHaveBeenCalled();expect(apply).not.toHaveBeenCalled();expect(spec).toEqual(before)
 })

 it('regenerates the actual completed legacy recipe through a scoped worker instead of replaying the total feed',async()=>{
  const publicData=newsPanel('加密市场最新资讯','加密货币相关新闻').publicData
  const prompt='工作台：实时加密货币行情监控\n本面板：加密市场最新资讯\n最新加密货币相关财经资讯流，每分钟自动刷新。\n仅生成本面板，优先使用 news 类型。'
  const publicDataPrompt='最新加密货币相关财经资讯流（新浪财经新闻，limit:12），每分钟自动刷新，展示标题、来源与时间。'
  const stored={version:1,tasks:[{taskId:'old-completed',parentSessionId:'winter-session',canvasNodeId:'old-news',kind:'container',state:'completed',createdAt:1,lastSeq:3,title:'加密市场最新资讯',type:'news',prompt,publicDataPrompt,publicData,finalOutput:JSON.stringify({...general,title:'加密市场最新资讯'})}]}
  const query=vi.fn(),start=vi.fn(async()=>({childSessionId:'scoped-worker',result:Promise.resolve({output:[{type:'text',text:JSON.stringify({version:1,type:'news',title:'加密市场最新资讯',note:'合成测试，仅验证重试路由。',items:[{title:'Bitcoin ETF业务变化（合成测试）',summary:'加密资产专题测试记录',date:'2026-10-22',url:'https://example.org/scoped-fixture'}]})}],stopReason:'completed'}),dispose:async()=>{}}))
  const runtime=new ResearchTaskRuntime({adapter:{start},publicDataClient:{query},storage:{load:async()=>stored,save:async()=>{}}})
  try{
   await runtime.restore();const receipt=await runtime.start({parentSessionId:'winter-session',canvasNodeId:'old-news',kind:'container',prompt:publicDataPrompt})
   await runtime.tasks.get(receipt.taskId).runPromise
   expect(query).not.toHaveBeenCalled();expect(start).toHaveBeenCalledOnce()
   const request=start.mock.calls[0][0].query
   expect(request).toContain(prompt);expect(request).toContain('eastmoney-news');expect(request).toContain('别名');expect(request).toContain('不得扩大为全市场新闻')
   expect(runtime.inspect({parentSessionId:'winter-session',taskId:receipt.taskId}).state).toBe('completed')
  }finally{await runtime.dispose()}
 })
})
