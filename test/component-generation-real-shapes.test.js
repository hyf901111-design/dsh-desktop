import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {materializeComponentMapping} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
const base={version:1,type:'market',title:'真实取数结构回归',asOf:'2026-09-24'}
function documentFor(data){const output=acceptArtifactOutput(JSON.stringify({...base,...data}));expect(output).toBeDefined();const w=new Window();w.document.write(JSON.parse(output).html);return w.document}
it('preserves six independently selectable trend series instead of rejecting the full comparison',()=>{
 const d=documentFor({variant:'trend',labels:['09-23','09-24'],series:Array.from({length:6},(_,i)=>({name:'标的'+i,values:[100,99+i]}))})
 expect(d.querySelectorAll('.trend-line')).toHaveLength(6)
 d.defaultView.eval(d.querySelector('script').textContent)
 d.querySelector('[data-trend-series="5"]').click()
 expect(d.querySelectorAll('.trend-line')[5].style.display).toBe('none')
 expect(d.querySelectorAll('tbody tr')[1].cells).toHaveLength(7)
})
it('plots signed valuation and change values within both axes and preserves exact readings',()=>{
 const d=documentFor({variant:'scatter',xLabel:'PE',yLabel:'涨跌幅',items:[{label:'亏损公司',x:-12,y:-2.5},{label:'上涨公司',x:18,y:1.2},{label:'平盘',x:0,y:0}]})
 for(const p of d.querySelectorAll('[data-scatter-point] circle')){
  expect(Number(p.getAttribute('cx'))).toBeGreaterThanOrEqual(40);expect(Number(p.getAttribute('cx'))).toBeLessThanOrEqual(616)
  expect(Number(p.getAttribute('cy'))).toBeGreaterThanOrEqual(20);expect(Number(p.getAttribute('cy'))).toBeLessThanOrEqual(172)
 }
 d.defaultView.eval(d.querySelector('script').textContent)
 expect(d.querySelector('.scatter-readout').textContent).toContain('-2.5')
})
it('renders actual industry weights without inventing missing benchmark weights or deviation controls',()=>{
 const d=documentFor({variant:'fund-industry',items:[{label:'电子',weight:24.6},{label:'银行',weight:12.1,benchmark:null}]})
 d.defaultView.eval(d.querySelector('script').textContent)
 expect(d.querySelectorAll('.fund-industry')).toHaveLength(2)
 expect(d.querySelector('.fund-industry-filter option[value=over]')).toBeNull()
 expect(d.querySelector('.fund-industry-sort option[value=delta]')).toBeNull()
 expect(d.querySelector('.fund-callout').hidden).toBe(true)
 d.querySelector('[data-label=银行]').click()
 expect(d.querySelector('.fund-industry-readout').textContent).toContain('12.1%')
 expect(d.querySelector('.fund-industry-readout').textContent).not.toContain('基准 0')
})
it('retains nine fund metrics in a wrapping grid rather than failing the entire card',()=>{
 const d=documentFor({variant:'fund-kpi',items:Array.from({length:9},(_,i)=>({label:'指标'+i,value:String(i)}))})
 expect(d.querySelectorAll('.fund-kpi')).toHaveLength(9)
})
it('materializes per-value numeric conversions on a mapped list identically at generation and refresh',()=>{
 const tool='ework__t_123abc',args={nameEn:'fund_market_HK'},response={data:{kline:[{date:'09-24',close:'4.515',volume:'100'},{date:'09-23',close:'4.6',volume:null}]}}
 const select=field=>({$from:'q',$each:'data.kline',$sortBy:'date',$order:'asc',$take:-20,$map:{$path:field}})
 const mapping={...base,variant:'price-volume',labels:select('date'),prices:{...select('close'),$as:'number',$digits:3},volumes:{...select('volume'),$as:'number',$optional:true},priceUnit:'元',volumeUnit:'股'}
 const resolved=resolveBoundComponent(JSON.stringify({version:1,type:'data-bound',requests:[{key:'q',tool,args}],mapping}),[{tool,args,response}])
 expect(resolved.data.prices).toEqual([4.6,4.515]);expect(resolved.data.volumes).toEqual([null,100])
 expect(materializeComponentMapping(resolved.recipe.mapping,{q:response})).toEqual(resolved.data)
 const bad=structuredClone(response);bad.data.kline[0].close='not a price'
 expect(()=>materializeComponentMapping(mapping,{q:bad})).toThrow()
})
it('normalizes only contiguous indexed table cells and does not guess ambiguous column order',()=>{
 const mapping={...base,variant:'fund-holdings',columns:['证券','权重'],rows:{$from:'q',$each:'stocks',$map:{'0':{$path:'name'},'1':{$path:'weight',$as:'number'}}}}
 const data=materializeComponentMapping(mapping,{q:{stocks:[{name:'招行',weight:'3.5'}]}})
 expect(data.rows).toEqual([['招行','3.5']]);expect(acceptArtifactOutput(JSON.stringify(data))).toBeDefined()
 expect(acceptArtifactOutput(JSON.stringify({...data,rows:[{'0':'招行','2':'3.5'}]}))).toBeUndefined()
})
it('keeps a sourced bar chart as a refreshable fixed template with series and keyboard readings',async()=>{
 const {readTemplateModel}=await import('../packages/dsh-research-task-runtime/component-template-registry.js')
 const data={version:1,type:'chart',variant:'bar',title:'成交额',asOf:'2026-09-24',unit:'亿元',source:'通联 DataYes',labels:['甲','乙'],series:[{name:'成交额',values:[32.2,18.5]},{name:'前日',values:[30,20]}]}
 const out=acceptArtifactOutput(JSON.stringify(data))
 expect(readTemplateModel(JSON.parse(out))?.templateId).toBe('chart.bar')
 const w=new Window();w.document.write(JSON.parse(out).html);const d=w.document
 d.defaultView.eval(d.querySelector('script:not([type="application/json"])').textContent)
 d.querySelector('[data-chart-series="1"]').click()
 expect(d.querySelector('[data-series-group="1"]').style.display).toBe('none')
 d.querySelector('svg').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home'}))
 expect(d.querySelector('.chart-readout').textContent).toContain('甲')
 expect(d.querySelector('.chart-readout').textContent).toContain('32.2')
})

it('keeps explicit chart semantics when a planner mistakenly labels the panel as metrics',async()=>{
 const {validateWorkbench,workbenchPanelPrompt}=await import('../packages/dsh-research-task-runtime/workbench-plan.js')
 const {marketVariant}=await import('../packages/dsh-research-task-runtime/workbench-design-contract.js')
 const plan=validateWorkbench({requestId:'semantics',title:'股票工作台',panels:[
  {title:'估值与涨跌幅散点图',type:'market',size:'large',prompt:'variant: metrics；横轴PE纵轴涨跌幅'},
  {title:'六股成交额柱状图',type:'market',size:'large',prompt:'variant: metrics；柱状呈现成交额'}]})
 expect(marketVariant(plan.panels[0])).toBe('scatter')
 expect(plan.panels[1].type).toBe('chart')
 expect(workbenchPanelPrompt(plan,plan.panels[1])).toContain('chart.bar')
})
it('converts absolute heatmap sizing weights to labelled sample shares without mutating the source',()=>{
 const items=[{label:'甲',weight:300000000000,change:-1},{label:'乙',weight:100000000000,change:2}]
 const d=documentFor({variant:'heatmap',items})
 expect(d.body.textContent).toContain('样本内权重 75.00%')
 expect(d.body.textContent).not.toContain('300000000000%')
 expect(items[0].weight).toBe(300000000000)
})

it('unwraps one-row query results in a table while preserving multi-row results as invalid',()=>{
 const data=materializeComponentMapping({...base,variant:'table',columns:['代码','价格'],rows:[{$from:'a',$each:'rows',$take:1,$map:[{$path:'code'},{$path:'price'}]},{$from:'b',$each:'rows',$take:1,$map:[{$path:'code'},{$path:'price'}]}]}, {a:{rows:[{code:'510300',price:4.5}]},b:{rows:[{code:'510500',price:6.2}]}})
 expect(data.rows).toEqual([['510300','4.5'],['510500','6.2']])
 const d=documentFor(data);expect(d.querySelectorAll('tbody tr')).toHaveLength(2)
 expect(acceptArtifactOutput(JSON.stringify({...data,rows:[[['甲',1],['乙',2]]]}))).toBeUndefined()
})
