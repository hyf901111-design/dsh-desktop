import {afterEach,expect,it,vi} from 'vitest'
import {resolveBoundComponent,fetchedWebPageRecord} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {ComponentDataRefresh} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {filterScopedNewsArtifact,newsTopicTerms} from '../packages/dsh-research-task-runtime/news-topic-filter.js'
import {Window} from 'happy-dom'
import {runInNewContext} from 'node:vm'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'

// Synthetic records prove filtering and receipts, never live news coverage.
const scope='工作台：旧笔记\n本面板：加密市场资讯\n【原始工作台需求】\n只展示比特币BTC与以太坊ETH相关新闻，保留原文和实际摘要。'
const article=(title,id,summary='合成来源摘要')=>({title,summary,time:'2026-10-22',url:`https://example.org/${id}`})
const bank=article('某银行调整个人存款利率','bank','零售存款业务调整'),btc=article('Bitcoin ETF flows changed','btc','Bitcoin ETF业务动态'),eth=article('以太坊网络升级','eth','Ethereum network update')
const request=(source='eastmoney-news',query='比特币 以太坊')=>({key:'q',tool:'public_data_query',args:{operation:'query',source,parameters_json:JSON.stringify({query,limit:12})}})
const draft=r=>({version:1,type:'data-bound',requests:[r],mapping:{version:1,type:'news',title:'市场资讯',items:{$from:'q',$each:'records',$map:{title:{$path:'title'},summary:{$path:'summary'},date:{$path:'time'},url:{$path:'url'}}}}})
const observed=(r,rows)=>({tool:r.tool,args:r.args,response:{sourceId:r.args.source,records:rows}})
afterEach(()=>vi.restoreAllMocks())

it.each(['eastmoney-news','gdelt-news'])('filters actual %s rows by the human scope, keeping ticker and translated aliases',source=>{
 const r=request(source),result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[bank,btc,eth])],new Date(),{newsScope:scope})
 expect(result.data.items.map(item=>item.title)).toEqual([btc.title,eth.title])
 expect(result.recipe.newsScope).toBe(scope)
 expect(result.recipe.requests[0].args).toEqual(r.args)
})

it('delivers a real empty news state when the source has no matching articles',()=>{
 const r=request('eastmoney-news','银行'),result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[bank])],new Date(),{newsScope:scope})
 expect(result.data.items).toEqual([])
 expect(result.data.note).toContain('未取得与用户主题相关的新闻')
 expect(readTemplateModel(JSON.parse(result.output)).data.items).toEqual([])
})

it('uses the human request instead of an unrelated generated title or query as its scope',()=>{
 const r=request('eastmoney-news','银行'),value=draft(r);value.mapping.title='银行新闻'
 const result=resolveBoundComponent(JSON.stringify(value),[observed(r,[bank,btc])],new Date(),{newsScope:scope})
 expect(result.data.items.map(item=>item.title)).toEqual([btc.title])
})

it.each(['Ford','Theodore','Anderson','Showa'])('preserves the complete English entity %s instead of removing stopword prefixes',entity=>{
 const r=request('gdelt-news',entity),related=article(`${entity} business update`,entity),other=article('Unrelated business update','other')
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[other,related])],new Date(),{newsScope:`只展示 ${entity} 相关新闻`})
 expect(result.data.items.map(item=>item.title)).toEqual([related.title])
})

it.each(['只展示光刻机行业相关新闻','只展示 光刻机 行业 新闻','Only show lithography industry news','Only show lithography sector news'])('keeps %s narrower than the semiconductor sector while accepting precise equipment terms',newsScope=>{
 const r=request('gdelt-news','光刻机'),phone=article('手机芯片需求改善，半导体行业复苏','phone','Smartphone chip industry: sector demand update'),euv=article('极紫外曝光设备交付进展','euv','EUV曝光系统产能与交付情况'),duv=article('浸没式DUV曝光工艺进展','duv','深紫外光学系统制造进展')
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[phone,euv,duv])],new Date(),{newsScope})
 expect(result.data.items.map(item=>item.title)).toEqual([euv.title,duv.title])
})

it('admits chip and wafer coverage when the human explicitly requests the broader semiconductor sector',()=>{
 const r=request('gdelt-news','半导体'),chip=article('手机芯片订单变化','chip','消费电子芯片供需'),wafer=article('晶圆产线扩建进展','wafer','制造产能变化')
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[bank,chip,wafer])],new Date(),{newsScope:'只展示半导体行业相关新闻'})
 expect(result.data.items.map(item=>item.title)).toEqual([chip.title,wafer.title])
})

it('allows relevant industry and regulatory reports for a broad crypto-market request',()=>{
 const r=request(),regulation=article('数字资产交易平台监管新规','rules','加密货币行业监管变化')
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[bank,regulation])],new Date(),{newsScope:'【原始工作台需求】\n生成实时加密货币行情监控和行业相关新闻工作台'})
 expect(result.data.items.map(item=>item.title)).toEqual([regulation.title])
})

it('does not let a negative instruction consume the following positive scope or trust a publisher as topic evidence',()=>{
 const requirement='不要用无关新闻补齐，只展示BTC相关新闻。',r=request()
 expect(newsTopicTerms(requirement)).toContain('bitcoin')
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[{...bank,publisher:'Bitcoin Media'},btc,eth])],new Date(),{newsScope:requirement})
 expect(result.data.items.map(item=>item.title)).toEqual([btc.title])
})

it('retains all matching HTML source records and the existing web/DataYes identities without trusting model markup',()=>{
 const html={version:1,type:'html',title:'加密新闻',html:`<article><h2>${btc.title}</h2></article><script>throw Error('do not execute')</script>`}
 const requirement=scope+'\n【新闻容量适配】\n完整保留所有实际记录。',r=request()
 const direct=filterScopedNewsArtifact(html,[observed(r,[btc,eth,bank])],requirement)
 expect(direct.html).toContain(btc.title);expect(direct.html).toContain(eth.title);expect(direct.html).not.toContain(bank.title);expect(direct.html).not.toContain('do not execute')
 const web=fetchedWebPageRecord(btc.url,JSON.stringify({records:[btc]}))
 const fromWeb=filterScopedNewsArtifact(html,[web],requirement)
 expect(fromWeb.html).toContain(btc.title);expect(fromWeb.html).toContain(btc.url)
 const fromDataYes=filterScopedNewsArtifact(html,[{tool:'ework__t_fixture',args:{},response:{sources:[{id:'article',title:eth.title,date:eth.time,url:eth.url,summary:eth.summary}]}}],requirement)
 expect(fromDataYes.html).toContain(eth.title);expect(fromDataYes.html).toContain(eth.url)
})

it('keeps all 120 matching records in controlled HTML and supports shared search and paging',()=>{
 const r=request(),rows=Array.from({length:120},(_,i)=>article('Bitcoin 合成新闻'+i,'btc-'+i)),data=filterScopedNewsArtifact({version:1,type:'html',title:'新闻',html:'<p>不完整模型页面</p>'},[observed(r,[bank,...rows])],scope+'\n【新闻容量适配】')
 const window=new Window(),document=window.document;document.body.innerHTML=data.html
 let state;const shared={dispatch(action){state=options.reduce(state,action);options.render(state,{connected:true,readOnly:false})}};let options
 const script=document.querySelector('script').textContent
 try{
  runInNewContext(script,{document,window:{sherlockShared:{register(value){options=value;state=value.initialState;value.render(state,{connected:true,readOnly:false});return shared}}}})
  expect(document.querySelectorAll('article')).toHaveLength(120)
  for(let i=0;i<5;i++)document.getElementById('next').onclick()
  expect(document.querySelectorAll('article:not([hidden])')).toHaveLength(20)
  const search=document.querySelector('input');search.value='新闻119';search.oninput()
  expect(document.querySelectorAll('article:not([hidden])')).toHaveLength(1)
  expect(document.querySelector('article:not([hidden])').textContent).toContain('新闻119')
 }finally{window.happyDOM.abort()}
})

it('keeps large-news table row links aligned after filtering and renders zero matches as an empty table',()=>{
 const data={version:1,type:'market',variant:'table',title:'新闻',asOf:'2026-10-22',columns:['标题','摘要'],rows:[[bank.title,bank.summary],[btc.title,btc.summary]],rowLinks:[bank.url,btc.url],tones:[['',''],['','']]}
 const requirement=scope+'\n【新闻容量适配】',filtered=filterScopedNewsArtifact(data,[],requirement)
 expect(filtered.rows).toEqual([[btc.title,btc.summary]]);expect(filtered.rowLinks).toEqual([btc.url]);expect(acceptArtifactOutput(JSON.stringify(filtered))).toBeTypeOf('string')
 const empty=filterScopedNewsArtifact({...data,rows:[[bank.title,bank.summary]],rowLinks:[bank.url],tones:[['','']]},[],requirement)
 expect(empty.rows).toEqual([]);expect(empty.rowLinks).toEqual([]);expect(acceptArtifactOutput(JSON.stringify(empty))).toBeTypeOf('string')
})

it('filters every refresh and replaces a stale article with the honest empty state',async()=>{
 const r=request(),initial=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[btc])],new Date(),{newsScope:scope})
 let spec=JSON.parse(initial.output),saved=[]
 const service=new ComponentDataRefresh({owner:()=> 'o',load:async()=>saved,save:async value=>{saved=structuredClone(value)},validateRequest:async value=>value,execute:async()=>({sourceId:r.args.source,records:[bank]}),inspect:async()=>({spec,writable:true,revision:'r'}),apply:async(_b,_rev,value)=>{spec=value}})
 try{
  await service.load();const binding=await service.bind({sessionId:'s',nodeId:'n',workspaceId:'w',...initial.recipe});await service.refresh(binding.id)
  expect(readTemplateModel(spec).data.items).toEqual([])
  expect(readTemplateModel(spec).data.note).toContain('未取得与用户主题相关的新闻')
 }finally{await service.dispose()}
})

it('turns a capacity HTML feed into controlled scoped articles without executing or retaining model scripts',async()=>{
 const prompt=scope+'\n【新闻容量适配】\n完整保留120条新闻，使用HTML分页。\n仅生成本面板，优先使用 html 类型。'
 const html=`<style>article{color:var(--sherlock-text)}</style><input aria-label="搜索新闻"><article><h2>${bank.title}</h2><p>${bank.summary}</p><time>${bank.time}</time><a href="${bank.url}">原文</a></article><article><h2>${btc.title}</h2><p>${btc.summary}</p><time>${btc.time}</time><a href="${btc.url}">原文</a></article><script>window.PRIVATE_MODEL_SCRIPT=true</script>`
 const r={...request('sina-news'),args:{operation:'query',source:'sina-news',parameters_json:'{"limit":100}'}}
 const adapter={start:vi.fn(async()=>({childSessionId:'html-fixture',result:Promise.resolve({stopReason:'completed',sourceRecords:[observed(r,[bank,btc])],output:[{type:'text',text:JSON.stringify({version:1,type:'html',title:'加密新闻',html})}]}),dispose:async()=>{}}))}
 const runtime=new ResearchTaskRuntime({adapter,storage:{save:async()=>{}}})
 try{
  const receipt=await runtime.start({parentSessionId:'p',canvasNodeId:'n',kind:'container',prompt});await runtime.tasks.get(receipt.taskId).runPromise
  const result=runtime.inspect({parentSessionId:'p',taskId:receipt.taskId});expect(result.state,result.error).toBe('completed')
  expect(result.finalOutput).toContain(btc.title);expect(result.finalOutput).not.toContain(bank.title);expect(result.finalOutput).not.toContain('PRIVATE_MODEL_SCRIPT')
  expect(result.finalOutput).toContain('搜索新闻')
 }finally{await runtime.dispose()}
})

it('keeps matching records from later sources in the real runtime instead of truncating unrelated records first',async()=>{
 const prompt=scope+'\n【新闻容量适配】\n保留全部取得的相关新闻，优先使用 html 类型。'
 const sources=Array.from({length:20},(_,i)=>observed(request('gdelt-news','银行 '+i),Array.from({length:100},()=>bank)))
 sources.push(observed(request('gdelt-news','Bitcoin'),[btc]))
 const adapter={start:vi.fn(async()=>({childSessionId:'later-source',result:Promise.resolve({stopReason:'completed',sourceRecords:sources,output:[{type:'text',text:JSON.stringify({version:1,type:'html',title:'加密新闻',html:'<p>模型页面省略末条</p>'})}]}),dispose:async()=>{}}))}
 const runtime=new ResearchTaskRuntime({adapter,storage:{save:async()=>{}}})
 try{
  const receipt=await runtime.start({parentSessionId:'p',canvasNodeId:'later-source',kind:'container',prompt});await runtime.tasks.get(receipt.taskId).runPromise
  const result=runtime.inspect({parentSessionId:'p',taskId:receipt.taskId});expect(result.state,result.error).toBe('completed')
  expect(result.finalOutput).toContain(btc.title);expect(result.finalOutput).not.toContain(bank.title)
  expect(result.finalOutput).not.toContain('本次未取得与用户主题相关的新闻')
 }finally{await runtime.dispose()}
})

it('declares obtained but omitted matching records after the bounded HTML reading budget',()=>{
 const rows=Array.from({length:2001},(_,i)=>({title:'BTC '+i,summary:'',date:''})),r=request(),records=Array.from({length:21},(_,i)=>observed(r,rows.slice(i*100,(i+1)*100)))
 const data=filterScopedNewsArtifact({version:1,type:'html',title:'新闻',html:'<p>模型页面</p>'},records,scope+'\n【新闻容量适配】')
 const window=new Window();window.document.body.innerHTML=data.html
 try{
  expect(window.document.querySelectorAll('article')).toHaveLength(2000)
  expect(window.document.body.textContent).toContain('已取得 2001 条相关记录，当前展示 2000 条')
  expect(window.document.body.textContent).toContain('另 1 条超过组件展示容量')
  expect(Buffer.byteLength(data.html)).toBeLessThanOrEqual(200000)
 }finally{window.happyDOM.abort()}
})

it('keeps a usable later article and reports a byte-budget gap without claiming no news was obtained',()=>{
 const huge={...btc,summary:'已取得的来源长摘要。'.repeat(20000)},r=request()
 const data=filterScopedNewsArtifact({version:1,type:'html',title:'新闻',html:'<p>模型页面</p>'},[observed(r,[huge,eth])],scope+'\n【新闻容量适配】')
 expect(Buffer.byteLength(data.html)).toBeLessThanOrEqual(200000)
 expect(data.html).toContain(eth.title)
 expect(data.html).toContain('已取得 2 条相关记录，当前展示 1 条')
 expect(data.html).not.toContain('本次未取得与用户主题相关的新闻')
})
