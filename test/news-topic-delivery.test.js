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

const homonyms=[
 ['BTC胆道癌药物获得资格（合成样例）','该药用于胆道系统恶性肿瘤，BTC为胆道癌缩写。'],
 ['FDA designates a biliary tract cancer (BTC) therapy (synthetic)','The report concerns biliary tract carcinoma.'],
 ['BTC胆管癌研究进展（合成样例）','BTC在此指胆管癌，与加密资产无关。'],
 ['BTC treatment study (synthetic)','Bile duct cancer (BTC), not about Bitcoin.'],
 ['苏黎世联邦理工学院（ETH）发布校园计划（合成样例）','ETH学院新增课程，与比特币、以太坊无关。'],
 ['ETH Zurich opens a laboratory (synthetic)','The university is expanding its research facilities.'],
 ['ETH Zürich campus news (synthetic)','Swiss Federal Institute of Technology; unrelated to cryptocurrency.'],
 ['ETH publishes admissions results (synthetic)','Eidgenössische Technische Hochschule announces student admissions.']
]
it.each(homonyms)('excludes an explicitly conflicting crypto acronym without substantive crypto evidence: %s', (title,summary)=>{
 const r=request('gdelt-news','Bitcoin Ethereum'),wrong={...article(title,'homonym',summary),publisher:'Bitcoin Media'}
 const model=draft(r);model.mapping.note='本次仅取得部分来源；其余研究对象尚缺独立报道，当前为手动快照。'
 const result=resolveBoundComponent(JSON.stringify(model),[observed(r,[wrong,btc,eth])],new Date(),{newsScope:scope})
 expect(result.data.items.map(item=>item.title)).toEqual([btc.title,eth.title])
 expect(result.data.note).toContain(model.mapping.note)
 expect(result.recipe.requests[0].args).toEqual(r.args)
})
it.each([
 ['ETH Zurich research update (synthetic)','The team studies Ethereum staking and blockchain transaction fees.'],
 ['苏黎世联邦理工学院（ETH）公布研究结果（合成样例）','研究涉及区块链和链上代币交易机制。'],
 ['BTC胆道癌慈善项目进展（合成样例）','项目公开了收到的Bitcoin捐款及BTC/USD兑换明细。'],
 ['BTC clinical study and market report (synthetic)','Biliary tract cancer research appears alongside BTC ETF flow data.'],
 ['BTC胆道癌慈善活动（合成样例）','基金购入0.4 BTC后转入活动公开的钱包地址。'],
 ['ETH Zurich donations report (synthetic)','The foundation donated 0.25 ETH for the university project.'],
 ['ETH Zurich finance study (synthetic)','The analysis includes ETH/USDT futures transactions.'],
 ['美股收盘：AI与芯片股回暖（合成样例）','公司披露本周购入267枚比特币（BTC）。'],
 ['高校发布数字经济研究（合成样例）','ETH院校研究中包含以太坊网络升级后的质押活动。'],
 ['BTC项目报告（合成歧义未决样例）','该片段没有明确给出另一种词义。']
])('keeps genuine crypto and mixed-domain evidence even without a coin in the headline: %s',(title,summary)=>{
 const r=request(),row=article(title,'crypto-context',summary)
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[row])],new Date(),{newsScope:scope})
 expect(result.data.items.map(item=>item.title)).toEqual([title])
})
it('does not apply the crypto-only homonym exclusion to an explicitly requested medical or university topic',()=>{
 for(const [newsScope,row]of [['胆道癌BTC药物相关新闻',article(homonyms[0][0],'medical-scope',homonyms[0][1])],['ETH Zurich院校相关新闻',article(homonyms[5][0],'university-scope',homonyms[5][1])]]){
  expect(filterScopedNewsArtifact({version:1,type:'news',title:'专题',items:[{...row,date:row.time}]},[],newsScope).items).toHaveLength(1)
 }
})
it.each([
 '比特币/BTC 与以太坊新闻，排除胆道癌(BTC)和ETH苏黎世联邦理工院校新闻。',
 '比特币/BTC 与以太坊新闻；排除胆道癌(BTC)，不要ETH Zurich院校新闻。',
 'Bitcoin and Ethereum news; exclude biliary tract cancer (BTC), ETH Zurich campus news.',
 '比特币/BTC 与以太坊新闻；也提及胆道癌(BTC)和ETH Zurich研究，只有涉及加密资产的报道才保留。',
 '稳定币新闻；同时关注ETH Zurich的相关研究。'
])('keeps explicit crypto disambiguation active in exclusion and mixed requests: %s',newsScope=>{
 const r=request('gdelt-news','Bitcoin Ethereum'),wrong=article(homonyms[0][0],'excluded-medical',homonyms[0][1]),university=article(homonyms[5][0],'excluded-university',homonyms[5][1]),mixed=article('ETH Zurich research (synthetic)','mixed-scope','The university studies Ethereum staking and stablecoin transactions.')
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[wrong,university,btc,eth,mixed])],new Date(),{newsScope})
 expect(result.data.items.map(item=>item.title)).toEqual([btc.title,eth.title,mixed.title])
})
it('uses an exact observed source excerpt as crypto context and ignores another article identity',()=>{
 const row=article('ETH Zurich research update (synthetic)','identity','ETH Zurich公布研究进展。'),r=request()
 const data={version:1,type:'news',title:'加密资产研究',items:[{...row,date:row.time}]}
 expect(filterScopedNewsArtifact(data,[observed(r,[{...row,summary:'Ethereum staking研究。'}])],scope).items).toHaveLength(1)
 expect(filterScopedNewsArtifact(data,[observed(r,[{...row,url:'https://example.org/another',summary:'Ethereum staking研究。'}])],scope).items).toHaveLength(0)
})
it('applies explicit acronym disambiguation to controlled HTML and aligned large-news table rows',()=>{
 const wrong=article(homonyms[0][0],'medical',homonyms[0][1]),mixed=article('ETH Zurich blockchain study (synthetic)','mixed','ETH Zurich研究Ethereum网络。'),r=request()
 const requirement=scope+'\n【新闻容量适配】',html=filterScopedNewsArtifact({version:1,type:'html',title:'专题',html:'<p>模型内容</p>'},[observed(r,[wrong,btc,mixed])],requirement)
 expect(html.html).not.toContain(wrong.title);expect(html.html).toContain(btc.title);expect(html.html).toContain(mixed.title)
 const table=filterScopedNewsArtifact({version:1,type:'table',title:'专题',columns:['标题','摘要'],rows:[[wrong.title,wrong.summary],[btc.title,btc.summary],[mixed.title,mixed.summary]],rowLinks:[wrong.url,btc.url,mixed.url]},[],requirement)
 expect(table.rows).toEqual([[btc.title,btc.summary],[mixed.title,mixed.summary]]);expect(table.rowLinks).toEqual([btc.url,mixed.url])
})
it('rechecks acronym meaning on refresh without changing the recipe or discarding the saved gap disclosure',async()=>{
 const r=request(),model=draft(r);model.mapping.note='另一指定来源仍未取得；当前仅展示本次可核验记录。'
 const initial=resolveBoundComponent(JSON.stringify(model),[observed(r,[btc])],new Date(),{newsScope:scope})
 const wrong=article(homonyms[0][0],'refresh-medical',homonyms[0][1]);let spec=JSON.parse(initial.output),saved=[]
 const service=new ComponentDataRefresh({owner:()=> 'o',load:async()=>saved,save:async value=>{saved=structuredClone(value)},validateRequest:async value=>value,execute:async()=>({sourceId:r.args.source,records:[wrong,eth]}),inspect:async()=>({spec,writable:true,revision:'r'}),apply:async(_b,_rev,value)=>{spec=value}})
 try{await service.load();const binding=await service.bind({sessionId:'s',nodeId:'n',workspaceId:'w',...initial.recipe});await service.refresh(binding.id)
  const updated=readTemplateModel(spec).data;expect(updated.items.map(item=>item.title)).toEqual([eth.title]);expect(updated.note).toContain(model.mapping.note);expect(saved[0].newsScope).toBe(scope)
 }finally{await service.dispose()}
})
it('removes explicit acronym conflicts from a completed static news task while retaining mixed research evidence',async()=>{
 const r=request(),wrong=article(homonyms[0][0],'runtime-medical',homonyms[0][1]),university=article(homonyms[5][0],'runtime-university',homonyms[5][1]),mixed=article('ETH Zurich research (synthetic)','runtime-mixed','ETH Zurich研究Ethereum质押机制。')
 const rows=[wrong,university,btc,mixed],data={version:1,type:'news',title:'加密资产专题',note:'仅覆盖合成来源记录，另一指定来源缺失；当前为手动快照。',items:rows.map(row=>({...row,date:row.time}))}
 const adapter={start:vi.fn(async()=>({childSessionId:'crypto-acronym-fixture',result:Promise.resolve({stopReason:'completed',sourceRecords:[observed(r,rows)],output:[{type:'text',text:JSON.stringify(data)}]}),dispose:async()=>{}}))}
 const runtime=new ResearchTaskRuntime({adapter,storage:{save:async()=>{}}})
 try{
  const receipt=await runtime.start({parentSessionId:'p',canvasNodeId:'n',kind:'container',prompt:scope+'\n仅生成本面板，优先使用 news 类型。'});await runtime.tasks.get(receipt.taskId).runPromise
  const result=runtime.inspect({parentSessionId:'p',taskId:receipt.taskId});expect(result.state,result.error).toBe('completed')
  const saved=readTemplateModel(JSON.parse(result.finalOutput)).data
  expect(saved.items.map(item=>item.title)).toEqual([btc.title,mixed.title]);expect(saved.note).toContain(data.note)
 }finally{await runtime.dispose()}
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

it.each(['只展示 News Corp 相关新闻','Only show News Corp news','Only Show News Corp News','only show news corp news'])('preserves the full entity in %s without broadening to its corporate suffix',newsScope=>{
 const r=request('gdelt-news','News Corp'),wanted=article('News Corp earnings rose','wanted'),unrelated=article('Intel Corp opens a new fab','unrelated'),word=article('Local news in a corporate office','word')
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[unrelated,wanted,word])],new Date(),{newsScope})
 expect(result.data.items.map(item=>item.title)).toEqual([wanted.title]);expect(newsTopicTerms(newsScope)).not.toContain('Corp')
})

it.each([['ONLY','“','”'],['Research In Motion','"','"'],['The Trade Desk','‘','’']])('retains the explicitly quoted name %s without keeping generic brand or suffix terms', (name,left,right)=>{
 const r=request('gdelt-news',name),wanted=article(`${name} business update`,'wanted'),other=article('Other brands publish a research news report','other','其他品牌的业务动态')
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[other,wanted])],new Date(),{newsScope:`只展示${left}${name}${right}品牌相关新闻`})
 expect(result.data.items.map(item=>item.title)).toEqual([wanted.title]);expect(result.data.note).not.toContain('未取得')
})

it.each(['只展示 ONLY 品牌相关新闻','Only show ONLY品牌相关新闻','只展示Only公司相关新闻'])('preserves the explicitly named single-word entity in %s',newsScope=>{
 const r=request('gdelt-news','ONLY'),wanted=article('ONLY opens a new store','wanted'),other=article('Other brands open stores','other','其他品牌的商业动态')
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[other,wanted])],new Date(),{newsScope})
 expect(result.data.items.map(item=>item.title)).toEqual([wanted.title])
})

it('keeps independently named entities and does not broaden a company name containing a sector alias',()=>{
 const r=request('gdelt-news','Semiconductor Manufacturing International Corp'),company=article('Semiconductor Manufacturing International Corp expands operations','company'),sector=article('Smartphone chip demand improves','sector'),intel=article('Intel Corp expands operations','intel')
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[sector,company,intel])],new Date(),{newsScope:'Only show Semiconductor Manufacturing International Corp and Intel Corp news'})
 expect(result.data.items.map(item=>item.title)).toEqual([company.title,intel.title])
})

it('does not promote entity-list conjunctions into topic evidence before a brand classifier',()=>{
 const r=request('gdelt-news','News Corp ONLY'),company=article('News Corp earnings update','company'),brand=article('ONLY opens a new store','brand'),other=article('Banks and lenders release new reports','other')
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[other,company,brand])],new Date(),{newsScope:'只展示 News Corp and ONLY品牌相关新闻'})
 expect(result.data.items.map(item=>item.title)).toEqual([company.title,brand.title])
})

it.each(['只展示光刻机行业相关新闻','只展示 光刻机 行业 新闻','Only show lithography industry news','Only show lithography sector news','只展示半导体领域的光刻机相关新闻','只展示半导体领域光刻机及EUV新闻','Only show lithography news in the semiconductor industry','Only Show Semiconductor Lithography News','Only show "lithography" news in the "semiconductor" industry'])('keeps %s narrower than the semiconductor sector while accepting precise equipment terms',newsScope=>{
 const r=request('gdelt-news','光刻机'),phone=article('手机芯片需求改善，半导体行业复苏','phone','Smartphone chip industry: sector demand update'),euv=article('极紫外曝光设备交付进展','euv','EUV曝光系统产能与交付情况'),duv=article('浸没式DUV曝光工艺进展','duv','深紫外光学系统制造进展')
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[phone,euv,duv])],new Date(),{newsScope})
 expect(result.data.items.map(item=>item.title)).toEqual([euv.title,duv.title])
})

it.each(['只展示半导体和光刻机相关新闻','只展示半导体新闻，重点关注光刻机','Show semiconductor and lithography news','Show "semiconductor" and "lithography" news'])('retains the parent sector when independently requested in %s',newsScope=>{
 const r=request('gdelt-news','半导体'),chip=article('手机芯片订单变化','chip'),wafer=article('晶圆产线扩建进展','wafer'),euv=article('EUV设备交付进展','euv')
 const result=resolveBoundComponent(JSON.stringify(draft(r)),[observed(r,[bank,chip,wafer,euv])],new Date(),{newsScope})
 expect(result.data.items.map(item=>item.title)).toEqual([chip.title,wafer.title,euv.title])
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

it('retains distinct obtained reports without usable URLs in the real task and deduplicates only actual duplicates',async()=>{
 const rows=[{...btc,url:''},{...eth,url:''},{...btc,url:''},{...article('Bitcoin third report','third'),url:'   '},{...article('Bitcoin fourth report','fourth'),url:'javascript:invalid'}],r=request()
 const adapter={start:vi.fn(async()=>({childSessionId:'empty-urls',result:Promise.resolve({stopReason:'completed',sourceRecords:[observed(r,rows)],output:[{type:'text',text:JSON.stringify({version:1,type:'html',title:'加密新闻',html:'<p>模型页面</p>'})}]}),dispose:async()=>{}}))}
 const runtime=new ResearchTaskRuntime({adapter,storage:{save:async()=>{}}})
 try{
  const receipt=await runtime.start({parentSessionId:'p',canvasNodeId:'empty-urls',kind:'container',prompt:scope+'\n【新闻容量适配】\n保留全部取得的相关新闻，使用html分页。'});await runtime.tasks.get(receipt.taskId).runPromise
  const result=runtime.inspect({parentSessionId:'p',taskId:receipt.taskId});expect(result.state,result.error).toBe('completed')
  const data=JSON.parse(result.finalOutput),window=new Window();window.document.body.innerHTML=data.html
  try{expect(window.document.querySelectorAll('article')).toHaveLength(4);for(const row of rows)expect(window.document.body.textContent).toContain(row.title);expect(window.document.body.textContent).not.toContain('未取得');expect(window.document.querySelectorAll('article a')).toHaveLength(0)}finally{await window.happyDOM.abort()}
 }finally{await runtime.dispose()}
})

it('counts missing-link records before the display budget and reports an obtained coverage gap accurately',()=>{
 const rows=Array.from({length:2001},(_,i)=>({title:'BTC '+i,summary:'',date:'',url:''})),r=request(),records=Array.from({length:21},(_,i)=>observed(r,rows.slice(i*100,(i+1)*100)))
 const data=filterScopedNewsArtifact({version:1,type:'html',title:'新闻',html:'<p>模型页面</p>'},records,scope+'\n【新闻容量适配】'),window=new Window();window.document.body.innerHTML=data.html
 try{expect(window.document.querySelectorAll('article')).toHaveLength(2000);expect(window.document.body.textContent).toContain('已取得 2001 条相关记录，当前展示 2000 条');expect(window.document.body.textContent).toContain('另 1 条超过组件展示容量');expect(window.document.body.textContent).not.toContain('未取得');expect(acceptArtifactOutput(JSON.stringify(data))).toBeTypeOf('string')}finally{window.happyDOM.abort()}
})
