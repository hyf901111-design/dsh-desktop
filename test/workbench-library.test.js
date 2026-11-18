import {it,expect,vi} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {validateWorkbench,layoutWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {bindWorkbenchLibraryLinks,includeFuturesInformationSources} from '../packages/dsh-research-task-runtime/workbench-library.js'
import {synchronizeFinancialLinks,changeWatchlist} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
import {componentLibraryBuiltins} from '../packages/dsh-research-task-runtime/component-library-catalog.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js'
const a={market:'SH',code:'688981',name:'中芯国际'},b={market:'SZ',code:'002371',name:'北方华创'}
it('binds a current exchange directory to daily products and preserves the original classification reference',()=>{
 const title='品种速查（上期所·能源中心）'
 const item={title,type:'table',size:'medium',prompt:'上期所与能源中心在市品种的代码、板块与报价单位速查。',content:{
  title,columns:[{key:'code',label:'品种代码'},{key:'name',label:'品种'},{key:'sector',label:'板块'}],
  rows:[{code:'CU',name:'铜',sector:'工业金属'},{code:'rb',name:'螺纹钢',sector:'钢材'}],
  note:'分类参考资料',sources:[{label:'上海期货交易所',url:'https://www.shfe.com.cn'}]}}
 const compile=(panel,request='生成一个期货衍生品研究工作台')=>validateWorkbench({requestId:'live-directory',title:'期货研究',dataMode:'source',originalRequest:request,panels:[panel]}).panels[0].artifact
 const live=compile(item)
 expect(live).toMatchObject({type:'financial-widget',widget:'futures',dataSource:'shfe',refreshMinutes:60,directory:{
  rows:[{code:'cu',name:'铜',sector:'工业金属'},{code:'rb',name:'螺纹钢',sector:'钢材'}],note:item.content.note,sources:item.content.sources}})
 for(const request of ['只用附件中的品种目录生成工作台','生成截至2020年的期货衍生品研究工作台']){
  expect(compile(item,request)).toMatchObject({type:'table'})
 }
 const extra={...item,content:{...item.content,body:'另有需要保留的比较说明'}}
 expect(compile(extra)).toMatchObject({type:'table',body:extra.content.body})
 for(const prompt of ['历史快照，只列以下品种。','只看铜和螺纹钢。','展示用户自选品种。','按固定清单展示，不自动刷新。']){
  expect(compile({...item,prompt}).type).toBe('table')
 }
})
it('开放式期货工作台保留可查询的信息入口、原有页签索引和历史计划',()=>{
 const basic={panels:[{title:'风险提示',type:'markdown'}]}, request='生成一个期货衍生品研究工作台'
 const next=includeFuturesInformationSources(basic,request,8)
 expect(next.panels.map(p=>p.library?.id)).toEqual(['builtin-futures','builtin-news',undefined])
 expect(includeFuturesInformationSources(next,request,8)).toBe(next)
 const tabbed={...basic,tabs:[{name:'研究',panelIndexes:[0]}]}
 expect(includeFuturesInformationSources(tabbed,request,8).tabs[0].panelIndexes).toEqual([0,1,2])
 expect(includeFuturesInformationSources(basic,request,8,basic)).toBe(basic)
 expect(includeFuturesInformationSources(basic,request,8,next)).toEqual(next)
 for(const text of ['创建只用附件的期货研究工作台','做一个中金所股指期货研究工作台','生成一个期货衍生品研究工作台，只看历史持仓','创建一个销售工作台'])expect(includeFuturesInformationSources(basic,text,8)).toBe(basic)
})
const native=(widget,options={})=>({title:widget,prompt:'显示该组件的真实内容',type:widget==='calendar'?'calendar-tool':'financial-widget',library:{id:'builtin-'+widget,options}})
const mixed={requestId:'library-links',title:'芯片研究',dataMode:'source',panels:[native('news'),native('quote'),native('watchlist',{symbols:[a,b]}),native('announcements'),{title:'经营与估值',prompt:'比较营收、研发、毛利率和估值，保留实际来源，缺失如实标注',type:'table'}],links:[{sourcePanel:1,targetPanel:0},{sourcePanel:2,targetPanel:1},{sourcePanel:2,targetPanel:3}],tabs:[{name:'监控',panelIndexes:[0,1,2,3]},{name:'基本面',panelIndexes:[4]}]}
it('keeps twelve complementary panels across three pages without dropping financial dimensions',()=>{
 const companies=[a,b,{market:'SH',code:'603501',name:'韦尔股份'}]
 const panels=companies.flatMap(company=>[
  ...['quote','news','announcements'].map(widget=>({...native(widget,{symbols:[company]}),title:company.name+widget})),
  {title:company.name+'财务估值',prompt:'读取真实财报并呈现营收、利润、研发与估值',type:'table'}
 ])
 const tabs=companies.map((company,i)=>({name:company.name,panelIndexes:[i*4,i*4+1,i*4+2,i*4+3]}))
 const plan=validateWorkbench({requestId:'twelve',title:'三龙头监控',dataMode:'source',panels,tabs})
 expect(plan.panels.filter(p=>p.artifact)).toHaveLength(9)
 expect(plan.panels.filter(p=>!p.artifact)).toHaveLength(3)
 const layout=layoutWorkbench(plan.panels,undefined,plan.tabs)
 expect(layout[0].y).toBe(layout[4].y);expect(layout[4].y).toBe(layout[8].y)
 expect(()=>validateWorkbench({...plan,panels:Array.from({length:31},(_,i)=>({...panels[0],title:'卡'+i}))})).toThrow('1–30')
})
it('uses every visible builtin directly without a model session or fabricated market values',async()=>{
 const plan=validateWorkbench({requestId:'catalog',title:'组件库能力',panels:componentLibraryBuiltins().map(item=>native(item.widget))})
 const start=vi.fn(),saved=[]
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{load:async()=>({version:1,tasks:[]}),save:async value=>saved.push(value)}})
 try{
  const receipts=await runtime.startPreparedBatch({parentSessionId:'native',panels:layoutWorkbench(plan.panels).map((p,i)=>({canvasNodeId:'node'+i,prompt:workbenchPanelPrompt(plan,p),artifact:p.artifact}))})
  expect(receipts.every(r=>r.state==='completed')).toBe(true)
  expect(start).not.toHaveBeenCalled()
  expect(saved.at(-1).tasks.map(t=>JSON.parse(t.finalOutput).type)).toContain('calendar-tool')
 }finally{await runtime.dispose()}
})
it('accepts a redundant display title without downgrading a linked native panel',()=>{
 const plan=validateWorkbench({...mixed,panels:mixed.panels.map((p,i)=>i===1?{...p,library:{...p.library,options:{title:'冗余标题'}}}:p)})
 expect(plan.panels[1].artifact).toMatchObject({type:'financial-widget',widget:'quote',title:'quote'})
 expect(plan.links).toEqual(mixed.links)
})
it('uses the built-in index list for multi-index quotes and preserves refresh configuration',()=>{
 const indices=[{code:'000001',market:'SH',name:'上证指数'},{code:'000300',market:'SH',name:'沪深300'}];
 const input={requestId:'index-quotes',title:'盘中指数研究',panels:[
  {...native('quote',{symbols:indices,refreshMinutes:1,refreshEnabled:true}),title:'盘中报价',prompt:'跟踪两只指数的实时报价和来源，60秒自动刷新。'}
 ]};
 const panel=validateWorkbench(input).panels[0];
 expect(panel.artifact).toMatchObject({type:'financial-widget',widget:'indices',symbols:indices,refreshMinutes:1,refreshEnabled:true});
 const kline=validateWorkbench({...input,panels:[{...input.panels[0],prompt:'展示两只指数的日K线和成交量。'}]}).panels[0];
 expect(kline.type).toBe('chart');
 expect(kline.artifact).toBeUndefined();
});
it('links actual IDs in dependency order and follows stock selection across dependent feeds',()=>{
 const plan=validateWorkbench(mixed)
 const panels=bindWorkbenchLibraryLinks(plan.panels.map((p,i)=>({...p,nodeId:'actual-'+i})),plan.links)
 let nodes=panels.map(p=>({id:p.nodeId,containerSpec:p.artifact,generationStatus:p.artifact?'completed':'queued'}))
 expect(nodes[1].containerSpec.linkedWatchlistId).toBe('actual-2')
 expect(nodes[0].containerSpec.linkedSourceId).toBe('actual-1')
 expect(nodes[0].containerSpec.symbols).toEqual([a])
 nodes[2].containerSpec=changeWatchlist(nodes[2].containerSpec,{op:'select',code:b.code,market:b.market})
 nodes=synchronizeFinancialLinks(nodes)
 for(const index of [0,1,3])expect(nodes[index].containerSpec.symbols).toEqual([b])
 expect(panels[4].artifact).toBeUndefined()
 const pending=nodes.map(n=>n.id==='actual-2'?{id:n.id,generationStatus:'queued'}:n)
 expect(synchronizeFinancialLinks(pending)[1].containerSpec.linkedWatchlistId).toBe('actual-2')
 expect(synchronizeFinancialLinks(pending.filter(n=>n.id!=='actual-2'))[1].containerSpec.linkedWatchlistId).toBeUndefined()
})
it('persists the authored default watchlist selection across every linked stock card',()=>{
 const plan=validateWorkbench({...mixed,originalRequest:'创建工作台，默认选北方华创，切换标的时联动行情、新闻和公告。'});
 expect(plan.panels[2].artifact.selectedSymbol).toBe('SZ:002371');
 const panels=bindWorkbenchLibraryLinks(plan.panels.map((panel,i)=>({...panel,nodeId:'selected-'+i})),plan.links);
 for(const index of [0,1,3])expect(panels[index].artifact.symbols).toEqual([b]);
 expect(validateWorkbench(plan)).toEqual(plan);
});
it('preserves unsupported library requirements as an independent data task instead of filling template fields',()=>{
 const input={requestId:'valuation',title:'估值观察',panels:[{...native('quote',{symbols:[a],fields:['PE','PB','研发费用率']}),prompt:'按真实财报展示市盈率、市净率和研发费用率'}]}
 const plan=validateWorkbench(input)
 expect(plan.panels[0].artifact).toBeUndefined()
 expect(plan.panels[0].prompt).toContain('研发费用率')
 expect(plan.panels[0].prompt).toContain('688981')
 expect(plan.panels[0].type).toBe('table')
 const withPrompt=validateWorkbench({...input,panels:[{...native('quote',{symbols:[a]}),prompt:'展示市盈率和研发费用率'}]})
 expect(withPrompt.panels[0].artifact).toBeUndefined()
 const crypto=validateWorkbench({...input,panels:[{...native('quote',{symbols:[{code:'BTC',market:'CRYPTO',name:'比特币'}]}),title:'比特币K线',prompt:'显示比特币K线'}]})
 expect(crypto.panels[0].type).toBe('chart');expect(crypto.panels[0].artifact).toBeUndefined()
 expect(crypto.panels[0].prompt).toContain('chart.candlestick')
 const pages=layoutWorkbench(plan.panels.concat(plan.panels),undefined,[{name:'一',panelIndexes:[0]},{name:'二',panelIndexes:[1]}])
 expect(pages[0].y).toBe(pages[1].y)
 expect(()=>validateWorkbench({...mixed,links:[{sourcePanel:0,targetPanel:1}]})).toThrow('兼容')
 expect(()=>validateWorkbench({...mixed,links:[{sourcePanel:2,targetPanel:1},{sourcePanel:2,targetPanel:1}]})).toThrow('一个来源')
 expect(()=>validateWorkbench({...mixed,links:[{sourcePanel:2,targetPanel:4}]})).toThrow('独立展示')
})
it('persists native configs, real links and tabs while dispatching only the uncovered data card',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'workbench-library-'));let tool,handler,body={parentSessionId:'parent'}
 const ctx={agents:{get:()=>({})},tools:{register:t=>{tool=t;return()=>{}}},webServer:{register:r=>{handler=r.handler;return()=>{}}}}
 const outputs=new Map(),start=vi.fn(async r=>({taskId:'generated-'+r.canvasNodeId}))
 const prepared=vi.fn(async({panels})=>panels.map(p=>{outputs.set(p.canvasNodeId,JSON.stringify(p.artifact));return {taskId:p.canvasNodeId}}))
 const runtime={start,startPreparedBatch:prepared,inspect:({taskId})=>({finalOutput:outputs.get(taskId)})}
 const options={filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>body}
 let dispose=await registerWorkbench(ctx,runtime,options)
 const read=async()=>{let result;await handler({method:'POST'},{writeHead(){},end:v=>{result=JSON.parse(v)}});return result}
 try{
  const receipt=await tool.execute(mixed,{agent:{session:{id:'parent'}}})
  expect(start).toHaveBeenCalledTimes(1);expect(prepared.mock.calls[0][0].panels).toHaveLength(4)
  const persisted=JSON.parse(await readFile(options.filePath,'utf8'))[0]
  expect(persisted.panels[0].artifact.linkedSourceId).toBe(persisted.panels[1].nodeId)
  expect(persisted.input.links).toEqual(mixed.links)
  await dispose();dispose=await registerWorkbench(ctx,runtime,options)
  const restored=(await read()).plans[0]
  expect(restored.tabs).toEqual(mixed.tabs)
  expect(JSON.parse(restored.panels[1].preparedOutput).linkedWatchlistId).toBe(restored.panels[2].nodeId)
  expect((await tool.execute(mixed,{agent:{session:{id:'parent'}}})).planId).toBe(receipt.planId)
  expect(start).toHaveBeenCalledTimes(1)
 }finally{await dispose();await rm(dir,{recursive:true,force:true})}
})

it('uses the exact index names in a panel instead of mounting an empty list',()=>{
 const panel={...native('indices',{symbols:[]}),prompt:'显示上证指数、深证成指、沪深300'}
 const result=validateWorkbench({requestId:'named-indices',title:'指数工作台',panels:[panel]})
 expect(result.panels[0].artifact.symbols.map(s=>s.code).sort()).toEqual(['000001','000300','399001'])
 expect(validateWorkbench({requestId:'generic-indices',title:'指数工作台',panels:[native('indices')]}).panels[0].artifact.symbols).toEqual([])
})

it('decodes exchange-suffixed A-share symbols and preserves a sixty-second index refresh',()=>{
 const symbols=[{code:'000001.SH',name:'上证指数'},{code:'000300.SH',name:'沪深300'}];
 const result=validateWorkbench({requestId:'suffix-indices',title:'行情工作台',
  originalRequest:'用组件库跟踪上证指数和沪深300的盘中报价，60秒自动刷新。',
  panels:[{...native('watchlist',{symbols,refreshMinutes:60}),title:'盘中报价',prompt:'指数盘中报价，自动刷新。'}]});
 expect(result.panels[0].artifact).toMatchObject({widget:'indices',refreshMinutes:1,refreshEnabled:true,
  symbols:[{code:'000001',market:'SH',name:'上证指数'},{code:'000300',market:'SH',name:'沪深300'}]});
});
