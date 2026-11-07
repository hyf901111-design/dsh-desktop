import { it, expect } from 'vitest'
import { registerCanvasTools, bindCanvasChild, normalizeCanvasChanges, summarizeMarketCanvasInspect } from '../packages/dsh-research-task-runtime/canvas-tools.js'
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js'
it('inspects complete editable chart data without loading rendered code, including legacy full requests',async()=>{
 const data={version:1,type:'chart',variant:'horizontal',title:'流入排名',unit:'亿元',labels:['甲','乙'],series:[{name:'流入',values:[20,10]}],detailColumns:['产品','代码','规模'],detailRows:[['甲','001',120],['乙','002',null]],sources:[{label:'资料来源',url:'https://example.com'}]}
 const spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)))
 const custom={version:1,type:'html',title:'自定义组件',html:'<div>独立交互</div>'}
 const original={revision:'r1',nodes:[{id:'chart',content:{title:data.title,containerSpec:spec}},{id:'custom',content:{containerSpec:custom}}]}
 const tools=new Map(),calls=[]
 const dispose=registerCanvasTools({tools:{register:t=>{tools.set(t.name,t);return()=>{}}}},{env:{SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:1234',SHERLOCK_RESEARCH_CONTEXT_TOKEN:'secret'},fetch:async(_url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify(original))}})
 const inspect=tools.get('research_canvas_inspect'),exec={agent:{session:{id:'session'}}}
 try{
  for(const detail of [undefined,'summary','full']){
   const out=JSON.parse(await inspect.execute({ids:['chart','custom'],...(detail?{detail}:{})},exec))
   expect(out.nodes[0].contentSummary.data).toEqual(data)
   expect(out.nodes[0].contentSummary.message).toContain('默认折叠')
   expect(out.nodes[0].content.containerSpec).toBeUndefined()
   expect(JSON.stringify(out).length).toBeLessThan(JSON.stringify(original).length/10)
   expect(out.revision).toBe('r1')
   if(detail==='full')expect(out.nodes[1].content.containerSpec).toEqual(custom)
   else expect(out.nodes[1].content.containerSpec).toBeUndefined()
  }
  const raw=JSON.parse(await inspect.execute({ids:['chart'],detail:'rendered'},exec))
  expect(raw).toEqual(original)
  expect(calls.every(call=>!Object.hasOwn(call.args,'detail'))).toBe(true)
  expect(spec.html).toContain('sherlock-template-data')
 }finally{dispose()}
})
it('derives board identity from execution and rejects model-supplied session IDs',async()=>{
 const tools=new Map(),calls=[]
 const dispose=registerCanvasTools({tools:{register:t=>{tools.set(t.name,t);return()=>tools.delete(t.name)}}},{env:{SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:1234',SHERLOCK_RESEARCH_CONTEXT_TOKEN:'secret'},fetch:async(url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify({revision:'r',nodes:[]}))}})
 const tool=tools.get('research_canvas_inspect'),exec={agent:{session:{id:'session'}},signal:new AbortController().signal}
 await tool.execute({},exec);expect(calls[0].sessionId).toBe('session')
 await expect(tool.execute({sessionId:'other'},exec)).rejects.toThrow()
 const release=bindCanvasChild('child','parent');await tool.execute({},{...exec,agent:{session:{id:'child'}}});expect(calls[1].sessionId).toBe('parent');release();dispose();expect(tools.size).toBe(0)
})
it('exposes schema-valid tool outputs',async()=>{
 const {validateJsonSchemaValue}=await import('@deepseek-ai/dsh-tools')
 const registered=[]
 const dispose=registerCanvasTools({tools:{register:t=>{registered.push(t);return()=>{}}}})
 for(const tool of registered)expect(validateJsonSchemaValue(tool.output.schema,'{"status":"applied"}')).toEqual([])
 dispose()
})
it('renders structured market data when updating an existing canvas card',()=>{
 const spec={version:1,type:'market',variant:'metrics',title:'申万农林牧渔指数',asOf:'2026-09-24 收盘',items:[{label:'收盘点位',value:'2538.15 点'}]}
 const changes=normalizeCanvasChanges([{op:'update',id:'existing-card',fields:{containerSpec:spec}}])
 expect(changes[0].fields.containerSpec).toMatchObject({type:'html',title:spec.title})
 expect(changes[0].fields.containerSpec.html).toContain('2538.15')
 expect(spec.type).toBe('market')
 expect(()=>normalizeCanvasChanges([{op:'update',id:'existing-card',fields:{containerSpec:{version:1,type:'market',market:{metrics:{items:[]}}}}}])).toThrow('"variant":"metrics"')
})
it('summarizes existing market cards without sending their full rendered HTML to the model',()=>{
 const html='<!doctype html><html><head><meta name="sherlock-header-note" content="2026-09-24 收盘"></head><body data-sherlock-market="metrics"><div>2538.15</div></body></html>'
 const result={revision:'revision',nodes:[{id:'card',content:{containerSpec:{version:1,type:'html',title:'行情指标',html}}}]}
 const summary=summarizeMarketCanvasInspect(result)
 expect(summary.nodes[0].contentSummary).toMatchObject({templateId:'market.metrics',asOf:'2026-09-24 收盘'})
 expect(summary.nodes[0].contentSummary.updateSchema).toContain('"items":[{"label":"指标"')
 expect(summary.nodes[0].content.containerSpec).toBeUndefined()
 expect(result.nodes[0].content.containerSpec.html).toBe(html)
})
it('updates an existing market card from an object without asking the model to escape changes JSON',async()=>{
 const tools=new Map(),calls=[]
 const dispose=registerCanvasTools({tools:{register:tool=>{tools.set(tool.name,tool);return()=>tools.delete(tool.name)}}},{
  env:{SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:1234',SHERLOCK_RESEARCH_CONTEXT_TOKEN:'secret'},
  fetch:async(_url,init)=>{calls.push(JSON.parse(init.body));return new Response(JSON.stringify({status:'applied',changedIds:['card']}))}
 })
 try{
  const market={version:1,type:'market',variant:'metrics',title:'申万农林牧渔行情（本次复核）',asOf:'2026-09-24 收盘',items:[{label:'收盘点位',value:'2538.15 点'}]}
  const result=JSON.parse(await tools.get('research_canvas_update_market').execute({requestId:'refresh',revision:'r1',id:'card',market},{agent:{session:{id:'session'}},signal:new AbortController().signal}))
  expect(result).toMatchObject({status:'applied',changedIds:['card']})
  expect(calls.find(call=>call.method==='apply')).toMatchObject({sessionId:'session',method:'apply',args:{requestId:'refresh',revision:'r1',changes:[{op:'update',id:'card',fields:{title:market.title,containerSpec:{type:'html',title:market.title}}}]}})
 }finally{dispose()}
})
