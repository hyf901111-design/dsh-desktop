import {it,expect} from 'vitest'
import {Window} from 'happy-dom'
import {validateWorkbench,layoutWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {renderMarketArtifact} from '../packages/dsh-research-task-runtime/market-artifact.js'
import {renderInteractiveArtifact} from '../packages/dsh-research-task-runtime/interactive-artifact.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import {ComponentDataRefresh} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {registerCanvasTools} from '../packages/dsh-research-task-runtime/canvas-tools.js'

const planned=()=>validateWorkbench({requestId:'ot-layout',title:'OpenTerminal 组件布局试用',dataMode:'simulated',preset:'openterminal-research',panels:[]})
const doc=html=>{const w=new Window();w.document.write(html);return w.document}

it('四组件预设直接生成专用布局，保留显著模拟标注和原始结构化数据',()=>{
 const plan=planned()
 expect(plan.panels).toHaveLength(4)
 expect(plan.panels.map(p=>p.artifact.variant??p.type)).toEqual(['ticker-information','price-volume','news','table'])
 for(const p of plan.panels){
  expect(p.artifact.layoutProfile).toBe('openterminal')
  expect(p.artifact.asOf).toContain('模拟')
  const output=JSON.parse(acceptArtifactOutput(JSON.stringify(p.artifact)))
  expect(readTemplateModel(output).data).toEqual(p.artifact)
  expect(doc(output.html).body.dataset.layoutProfile).toBe('openterminal')
  expect(workbenchDesignTemplate(p).provenance).toContain('OpenTerminal')
 }
 const layout=layoutWorkbench(plan.panels)
 expect(layout[1].x).toBe(layout[0].width+16)
 expect(layout[2].width).toBe(layout[0].width)
 expect(layout[3].width).toBe(layout[1].width)
})

it('行情使用独立报价主区、双列键值行和历史区，不复用原指标卡布局',()=>{
 const s=planned().panels[0].artifact,d=doc(renderMarketArtifact(s).html)
 expect(d.querySelector('.ot-quote-hero').textContent).toContain(String(s.price))
 expect(d.querySelectorAll('.ot-quote-facts > div')).toHaveLength(s.info.length)
 expect(d.querySelector('[data-ticker-spark]')).not.toBeNull()
 expect(d.querySelector('.ticker-summary')).toBeNull()
 expect(d.querySelector('.ot-quote').classList.contains('financial-profile')).toBe(true)
})

it('普通数据源映射刷新行情和新闻后仍保留显式布局 profile',async()=>{
 for(const original of planned().panels.filter(p=>['table','news'].includes(p.artifact.variant??p.type)).map(p=>p.artifact)){
  let spec=JSON.parse(acceptArtifactOutput(JSON.stringify(original)))
  const {layoutProfile,...mapping}=original;mapping.asOf='新的数据时点'
  const service=new ComponentDataRefresh({now:()=>100000,owner:()=> 'owner',load:async()=>[],save:async()=>{},execute:async()=>({}),
   inspect:async()=>({revision:'r1',spec,writable:true}),apply:async(_binding,_revision,next)=>{spec=next},
   validateRequest:async r=>({...r,connectionId:'c',connectionRevision:1,schemaDigest:'d'})})
  const binding=await service.bind({sessionId:'s',nodeId:'n',workspaceId:'w',requests:[{key:'data',toolId:'source',args:{}}],mapping,intervalMinutes:0})
  await service.refresh(binding.id)
  expect(readTemplateModel(spec).data.layoutProfile).toBe('openterminal')
  expect(doc(spec.html).body.dataset.layoutProfile).toBe('openterminal')
 }
})

it('量价图加入即时读数带，继续使用宿主双图、范围控件和完整原记录',()=>{
 const s=planned().panels[1].artifact,d=doc(renderMarketArtifact(s).html)
 expect(d.querySelector('.ot-chart-snapshot').textContent).toContain(String(s.prices.at(-1)))
 expect(d.querySelector('[data-series-viewport="v2"]')).not.toBeNull()
 expect(d.querySelectorAll('[data-price-volume-range]').length).toBeGreaterThan(1)
 expect(d.querySelectorAll('tbody tr')).toHaveLength(s.labels.length)
})

it('新闻直接呈现完整摘要和来源栏，筛选与展开保持可用且不隐藏原条目',()=>{
 const s=planned().panels[2].artifact,w=new Window({settings:{enableJavaScriptEvaluation:true}})
 w.document.write(renderInteractiveArtifact(s).html)
 expect(w.document.querySelectorAll('.ot-news-item')).toHaveLength(s.items.length)
 expect(w.document.querySelector('.ot-news-copy summary').textContent).toBe('收起摘要')
 const search=w.document.querySelector('#search');search.value='不存在的条目';search.dispatchEvent(new w.Event('input'))
 expect([...w.document.querySelectorAll('article')].every(a=>a.hidden)).toBe(true)
 search.value='';search.dispatchEvent(new w.Event('input'))
 expect(w.document.querySelectorAll('article:not([hidden])')).toHaveLength(s.items.length)
})

it('拒绝不认识的布局名，旧组件不隐式切换新布局',()=>{
 const s={version:1,type:'market',variant:'metrics',title:'原指标',asOf:'测试',items:[{label:'原指标',value:'0'}]}
 expect(renderMarketArtifact({...s,layoutProfile:'typo'})).toBeNull()
 expect(doc(renderMarketArtifact(s).html).body.hasAttribute('data-layout-profile')).toBe(false)
 expect(renderInteractiveArtifact({version:1,type:'news',title:'新闻',items:[{title:'示例',summary:'示例'}],layoutProfile:'typo'})).toBeNull()
})

it('原位刷新工具从原组件继承布局，不要求模型重复提供展示属性',async()=>{
 const original=planned().panels.find(p=>p.artifact.variant==='table').artifact
 const previous=JSON.parse(acceptArtifactOutput(JSON.stringify(original))),tools=new Map();let applied
 const dispose=registerCanvasTools({tools:{register:t=>{tools.set(t.name,t);return()=>{}}}}, {
  env:{SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:1234',SHERLOCK_RESEARCH_CONTEXT_TOKEN:'fixture'},
  fetch:async(_url,init)=>{const call=JSON.parse(init.body);if(call.method==='inspect')return Response.json({revision:'r1',nodes:[{id:'card',content:{containerSpec:previous}}]});applied=call.args.changes[0].fields.containerSpec;return Response.json({status:'applied'})}
 })
 const {layoutProfile,...market}=original;market.asOf='新的数据时点'
 try{await tools.get('research_canvas_update_market').execute({requestId:'update',revision:'r1',id:'card',market},{agent:{session:{id:'session'}},signal:new AbortController().signal})
  expect(readTemplateModel(applied).data.layoutProfile).toBe('openterminal')
 }finally{dispose()}
})
