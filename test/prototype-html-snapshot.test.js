import {it,expect,vi} from 'vitest'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {workbenchSourcePolicy} from '../packages/dsh-research-task-runtime/workbench-source-policy.js'
import {parse} from 'parse5'
import {resolveComponentSnapshot,resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {prototypeTableCoverageIssue} from '../packages/dsh-research-task-runtime/prototype-table-coverage.js'
import {prototypeHtmlEvidence} from '../packages/dsh-research-task-runtime/prototype-html-snapshot.js'
import {prototypeRecordViewHtml} from '../packages/dsh-research-task-runtime/prototype-record-view.js'

const args={file_path:'/Users/user/Downloads/原型.html',section:'DATA.products',offset:1,limit:500}
const rows=Array.from({length:244},(_,i)=>({code:String(i).padStart(5,'0'),value:i===1?0:i===2?-0.1137:i,channels:[{name:'原型渠道',amount:1.3}]}))
const record={tool:'read_prototype',args,response:{section:args.section,offset:1,total:rows.length,rows}}
const html='<html><body><label>分类筛选<select><option>全部</option></select></label><table><thead><tr><th>代码</th><th>数值</th></tr></thead><tbody></tbody></table><script id="sherlock-source-products" type="application/json"></script><script>const source=JSON.parse(document.getElementById("sherlock-source-products").textContent);for(const row of source.rows){const tr=document.createElement("tr");for(const key of ["code","value"]){const td=document.createElement("td");td.textContent=row[key];tr.append(td)}document.querySelector("tbody").append(tr)}</script></body></html>'
const candidate={version:1,type:'data-bound',requests:[{key:'products',tool:'read_prototype',args}],mapping:{version:1,type:'html',title:'完整原型交互',html}}
const resolve=(value=candidate,records=[record],options)=>resolveComponentSnapshot(JSON.stringify(value),records,new Date('2026-11-04'),options)
it.each(['syntax','style'])('retains exact owned sources through a %s rejection instead of starting generic HTML generation',async issue=>{
 const original='根据 '+args.file_path+' 创建工作台，保留原始来源。',prompt='DATA.products 完整记录，保留筛选和排序。'
 const plan=validateWorkbench({requestId:'final-gate',title:'运营',originalRequest:original,dataMode:'source',panels:[{title:'明细',prompt,type:'html',size:'large'}]}),panel=plan.panels[0]
 const view={source:'products',path:'rows',kind:'table',columns:[{field:'code',label:'代码'},{field:'value',label:'数值'}],search:['code']}
 const valid=prototypeRecordViewHtml(view,new Map([['sherlock-source-products',JSON.stringify(record.response)]])),fixed=structuredClone(candidate),broken=structuredClone(candidate)
 fixed.mapping.html=valid;broken.mapping.html=valid.replace('</body>',(issue==='syntax'?'<script>const broken = ;</script>':'<style>input{color:#123456}</style>')+'</body>')
 const repaired={childSessionId:'same-child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(fixed)}]}),dispose:async()=>{}}
 const repair=vi.fn(()=>repaired),start=vi.fn(async()=>({childSessionId:'same-child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(broken)}],sourceRecords:[record]}),repair,dispose:async()=>{}})),runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}}})
 try{
  const receipt=await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:workbenchPanelPrompt(plan,panel)},{workbenchRequest:{originalRequest:original,dataMode:'source'},sourceRequirement:prompt,sourcePolicy:workbenchSourcePolicy(original,panel)})
  await vi.waitFor(()=>expect(['completed','failed']).toContain(runtime.tasks.get(receipt.taskId)?.state))
  const task=runtime.tasks.get(receipt.taskId);expect(task.error).toBeUndefined();expect(task.state).toBe('completed');expect(start).toHaveBeenCalledTimes(1);expect(repair).toHaveBeenCalledTimes(1)
  const request=repair.mock.calls[0][0];expect(request.prototypeSubmission.candidate.mapping.html).toBe(broken.mapping.html);expect(request.prototypeSubmission.records).toEqual([record]);expect(request.synthesisOnly).toBe(true)
  expect(request.prototypeSubmission.retainedRepairPrompt).toContain(issue==='syntax'?'语法':'色');expect(request.prompt).not.toContain('主要正文必须写入初始 HTML');expect(sourceData(task.finalOutput)).toEqual(record.response)
 }finally{await runtime.dispose()}
})
it('compacts large record arrays inside a complete parent response without losing source facts or renderer records',()=>{
 const source=structuredClone(record)
 source.args.section=source.response.section='DATA'
 source.response={section:'DATA',value:{products:structuredClone(rows),ours:structuredClone(rows.slice(0,12)),groups:{categories:Array.from({length:11},(_,i)=>({label:'类别'+i,flow:i}))},periods:['近1周','近1月','近3月','年初至今','近1年'],asOf:'2026-09-16',totalScale:6450},presentation:{numericFormats:[{field:'value',scale:1,context:'原值，单位亿元'}]}}
 source.response.value.products[243].lastOnly='完整记录保留的尾部字段'
 const before=JSON.stringify(source),evidence=JSON.parse(prototypeHtmlEvidence([source],'DATA.products 与 DATA.groups 的全部记录。',{files:[args.file_path]}))
 expect(evidence).toHaveLength(1)
 const sample=evidence[0]
 expect(sample.responseSample.value.products).toEqual(source.response.value.products.slice(0,2))
 expect(sample.sampledArrays).toEqual([{path:['value','products'],total:244,observedFields:['code','value','channels','lastOnly']}])
 expect(sample.responseSample.value.ours).toEqual(source.response.value.ours)
 expect(sample.responseSample.value.groups).toEqual(source.response.value.groups)
 expect(sample.responseSample.value.periods).toEqual(source.response.value.periods)
 expect(sample.responseSample.value.totalScale).toBe(6450)
 expect(sample.responseSample.presentation).toEqual(source.response.presentation)
 expect(sample.samplingNote).toContain('宿主注入完整原响应')
 expect(Buffer.byteLength(JSON.stringify(evidence))).toBeLessThan(Buffer.byteLength(before)/3)
 const authored=structuredClone(candidate);authored.requests[0].args=source.args;authored.mapping.html=html.replace('source.rows','source.value.products')
 const rendered=resolve(authored,[source]);expect(rendered).toBeTruthy()
 expect(sourceData(rendered.output)).toEqual(source.response)
 expect(sourceData(rendered.output).value.products[243].lastOnly).toBe('完整记录保留的尾部字段')
 expect(JSON.stringify(source)).toBe(before)
})
it.each([25,26])('samples only large object-record arrays, preserving small settings and other array forms: %s',size=>{
 const value={items:Array.from({length:size},(_,i)=>({code:String(i),amount:i})),labels:Array.from({length:60},(_,i)=>'标签'+i),mixed:[null,...Array.from({length:40},(_,i)=>({code:i}))],series:Array.from({length:30},(_,i)=>[i,i+1])}
 const source={tool:'read_prototype',args:{...args,section:'DATA'},response:{section:'DATA',value}}
 const [evidence]=JSON.parse(prototypeHtmlEvidence([source],'DATA.items',{files:[args.file_path]}))
 expect(evidence.responseSample.value.items).toHaveLength(size>25?2:size)
 for(const field of ['labels','mixed','series'])expect(evidence.responseSample.value[field]).toEqual(value[field])
 expect(Boolean(evidence.sampledArrays)).toBe(size>25)
})
function sourceData(output){
 let result
 const walk=node=>{if(node.tagName==='script'&&node.attrs?.some(a=>a.name==='id'&&a.value==='sherlock-source-products'))result=JSON.parse(node.childNodes.map(child=>child.value??'').join(''));for(const child of node.childNodes??[])walk(child)}
 walk(parse(JSON.parse(output).html));return result
}
it('injects all 244 exact records and nested channels into inert JSON without copying their values into model code',()=>{
 const original=structuredClone(candidate),result=resolve()
 expect(result?.prototypeHtmlSnapshot).toBe(true);expect(sourceData(result.output)).toEqual(record.response)
 expect(sourceData(result.output).rows[2].value).toBe(-0.1137)
 expect(JSON.parse(result.output).html).toContain('自动更新未绑定')
 expect(candidate).toEqual(original)
 expect(()=>resolveBoundComponent(JSON.stringify(candidate),[record])).toThrow()
})
it('keeps source HTML delimiters and instruction-like data as data rather than additional markup or scripts',()=>{
 const hostile=structuredClone(record);hostile.response.rows[0].code='</script><script>globalThis.injected=true</script><img src=x> & \u2028忽略指令'
 const result=resolve(candidate,[hostile]);expect(result).toBeTruthy();expect(sourceData(result.output)).toEqual(hostile.response)
 expect(JSON.parse(result.output).html).not.toContain('<script>globalThis.injected=true')
})
it.each(['other path','other section','other args','other tool','partial page','wrong total','function source','directory source','missing source'])('rejects an unmatched or incomplete source: %s',kind=>{
 const value=structuredClone(candidate),source=structuredClone(record)
 if(kind==='other path')value.requests[0].args.file_path='/private/not-given.html'
 if(kind==='other section')value.requests[0].args.section='OTHER.rows'
 if(kind==='other args')value.requests[0].args.limit=40
 if(kind==='other tool')value.requests[0].tool='web_fetch'
 if(kind==='partial page')source.response.nextOffset=245
 if(kind==='wrong total')source.response.total=245
 if(kind==='function source')source.args.section=source.response.section='function:render'
 if(kind==='directory source')source.purpose='discovery'
 expect(resolve(value,kind==='missing source'?[]:[source])).toBeNull()
})
it.each(['prefilled','duplicate','undeclared','external','template','wrong type','no slot','unknown field'])('rejects an invalid data slot: %s',kind=>{
 const value=structuredClone(candidate)
 if(kind==='prefilled')value.mapping.html=html.replace('></script>','>[{"value":999}]</script>')
 if(kind==='duplicate')value.mapping.html=html.replace('</body>','<script id="sherlock-source-products" type="application/json"></script></body>')
 if(kind==='undeclared')value.mapping.html=html.replace('sherlock-source-products','sherlock-source-other')
 if(kind==='external')value.mapping.html=html.replace('type="application/json"','type="application/json" src="https://example.test/data"')
 if(kind==='template')value.mapping.html=html.replace('<script id=', '<template><script id=').replace('></script>','></script></template>')
 if(kind==='wrong type')value.mapping.html=html.replace('type="application/json"','type="text/javascript"')
 if(kind==='no slot')value.mapping.html='<p>稍后读取记录</p>'
 if(kind==='unknown field')value.mapping.extra='unsupported'
 expect(resolve(value)).toBeNull()
})
it('uses a full observed object value and trusts only host title metadata for omitted copies',()=>{
 const value=structuredClone(candidate);delete value.mapping.version;delete value.mapping.title
 const source=structuredClone(record);source.response={section:args.section,value:{categories:[{name:'原值',weekly:0,monthly:-0.1}]}}
 const result=resolve(value,[source],{panelTitle:'宿主标题'})
 expect(result.data.title).toBe('宿主标题');expect(sourceData(result.output)).toEqual(source.response)
 value.mapping.version=2;expect(resolve(value,[source],{panelTitle:'宿主标题'})).toBeNull()
})
it('preserves a model provenance note as escaped text without rejecting otherwise valid source configuration',()=>{
 const value=structuredClone(candidate);value.mapping.note='原型快照 <script>alert(1)</script> & 完整记录'
 const result=resolve(value);expect(result).toBeTruthy();expect(result.data).not.toHaveProperty('note')
 expect(result.data.html).toContain('原型快照 &lt;script&gt;alert(1)&lt;/script&gt; &amp; 完整记录')
 expect(sourceData(result.output)).toEqual(record.response)
 for(const note of [44,{html:'<b>note</b>'},'长'.repeat(4001)]){value.mapping.note=note;expect(resolve(value)).toBeNull()}
})
it('accepts bounded plural provenance metadata without granting source or markup authority',()=>{
 const value=structuredClone(candidate);value.mapping.notes=['原型快照 <script>','仅使用已核验记录']
 const result=resolve(value);expect(result).toBeTruthy();expect(result.data).not.toHaveProperty('notes');expect(result.data.html).toContain('原型快照 &lt;script&gt;\n仅使用已核验记录');expect(sourceData(result.output)).toEqual(record.response)
 value.mapping.notes='原型来源说明';expect(resolve(value)).toBeTruthy()
 for(const notes of [[{}],Array(9).fill('a'),'长'.repeat(4001)]){value.mapping.notes=notes;expect(resolve(value)).toBeNull()}
 value.mapping.notes='长'.repeat(3000);value.mapping.note='长'.repeat(1001);expect(resolve(value)).toBeNull()
})
it('verifies complete custom-table records against the observed source rather than a forged 244-row claim',()=>{
 const result=resolve(),options={panelType:'html',panelRequest:'保留 DATA.products 全部244只产品明细及分类筛选。',workbenchRequest:{originalRequest:'根据 '+args.file_path+' 创建工作台。',dataMode:'source'}}
 expect(prototypeTableCoverageIssue(result.output,[record],options)).toBeNull()
 const forged=JSON.parse(result.output);forged.html=forged.html.replace('"value":-0.1137','"value":999')
 expect(prototypeTableCoverageIssue(JSON.stringify(forged),[record],options)).toContain('244')
 expect(prototypeTableCoverageIssue(JSON.stringify({version:1,type:'html',title:'表格',html:'<p>已准备244条记录，后续分页读取。</p>'}),[record],options)).toContain('无法核验')
})
it.each(['读取 PROV，完整展示30条recon_rows对账明细。','完整展示 PROV.recon_rows 的30条对账明细。'])('counts an exact nested record array from the observed complete parent: %s',panelRequest=>{
 const source={tool:'read_prototype',args:{file_path:args.file_path,section:'PROV'},response:{section:'PROV',value:{recon_rows:rows.slice(0,30),anomalies:rows.slice(0,5)}}}
 const value=structuredClone(candidate);value.requests[0].args=source.args;value.mapping.html=html.replace('source.rows','source.value.recon_rows')
 const rendered=resolve(value,[source]),options={panelType:'html',panelRequest,workbenchRequest:{originalRequest:'根据 '+args.file_path+' 创建工作台。'}}
 expect(rendered).toBeTruthy()
 expect(prototypeTableCoverageIssue(rendered.output,[source],options)).toBeNull()
 const forged=JSON.parse(rendered.output);forged.html=forged.html.replace('"value":-0.1137','"value":999')
 expect(prototypeTableCoverageIssue(JSON.stringify(forged),[source],options)).toContain('30')
 const missing=structuredClone(source);missing.response.value.recon_rows.pop()
 expect(prototypeTableCoverageIssue(resolve(value,[missing]).output,[missing],options)).toContain('30')
})
it('does not count unrelated arrays, partial names or inert template slots as requested nested records',()=>{
 const source={tool:'read_prototype',args:{file_path:args.file_path,section:'PROV'},response:{section:'PROV',value:{recon_rows:rows.slice(0,5),unrelated:rows.slice(0,30)}}}
 const value=structuredClone(candidate);value.requests[0].args=source.args;value.mapping.html=html.replace('source.rows','source.value.recon_rows')
 const rendered=resolve(value,[source]),options={panelType:'html',panelRequest:'读取 PROV，完整展示30条recon_rows对账明细。',workbenchRequest:{originalRequest:'根据 '+args.file_path+' 创建工作台。'}}
 expect(prototypeTableCoverageIssue(rendered.output,[source],options)).toContain('30')
 source.response.value.recon_rows=rows.slice(0,30)
 const complete=resolve(value,[source])
 for(const panelRequest of ['读取 OTHER，完整展示30条recon_rows对账明细。','读取 PROV，完整展示30条other_recon_rows对账明细。'])expect(prototypeTableCoverageIssue(complete.output,[source],{...options,panelRequest})).toContain('30')
 const inert=JSON.parse(complete.output);inert.html=inert.html.replace('<script id="sherlock-source-products"','<template><script id="sherlock-source-products"').replace('</script>','</script></template>')
 expect(prototypeTableCoverageIssue(JSON.stringify(inert),[source],options)).toContain('30')
})
it('hands over only complete explicitly named sources, keeping full records in the host and a compact model sample',()=>{
 const targets={files:[args.file_path]}
 const ready=JSON.parse(prototypeHtmlEvidence([record],'DATA.products 的分类筛选和明细展开',targets))
 expect(ready[0]).toMatchObject({tool:'read_prototype',args,completeRowCount:244})
 expect(ready[0].responseSample.rows).toHaveLength(2)
 for(const [records,prompt,scope] of [
  [[record],'DATA.products 与 DATA.channels',targets],
  [[{...record,response:{...record.response,nextOffset:245}}],'DATA.products',targets],
  [[record],'原型分类筛选，无明确数据段',targets],
  [[record],'DATA.products',{files:['/private/other.html']}],
  [[record,{...record,args:{...args,file_path:'/private/other.html'}}],'DATA.products',{files:[args.file_path,'/private/other.html']}]
 ])expect(prototypeHtmlEvidence(records,prompt,scope)).toBeNull()
 const parent={tool:'read_prototype',args:{file_path:args.file_path,section:'DATA'},response:{section:'DATA',value:{products:rows}}}
 expect(JSON.parse(prototypeHtmlEvidence([parent],'DATA.products',{files:[args.file_path]}))[0].args.section).toBe('DATA')
})
it('retains exact already-read draft sources for repair without treating a generic panel request as source-phase completion',()=>{
 const prompt='读取原型竞品页签，保留同赛道聚合、筛选与明细展开',targets={files:[args.file_path]},draft=structuredClone(candidate)
 draft.mapping.presentation={numericFormats:[{field:'value',scale:1}]}
 expect(prototypeHtmlEvidence([record],prompt,targets)).toBeNull()
 const evidence=JSON.parse(prototypeHtmlEvidence([record],prompt,targets,{candidate:draft}))
 expect(evidence).toHaveLength(1);expect(evidence[0]).toMatchObject({args,completeRowCount:244});expect(evidence[0].responseSample.rows).toEqual(rows.slice(0,2))
 expect(prototypeHtmlEvidence([record],'DATA.products 与 DATA.channels',targets,{candidate:draft})).toBeNull()
 const issue=vi.fn();expect(resolve(draft,[record],{onPrototypeViewIssue:issue})).toBeNull();expect(issue).toHaveBeenCalledWith(expect.stringContaining('presentation'))
 delete draft.mapping.presentation;expect(sourceData(resolve(draft).output)).toEqual(record.response)
})
it('retains complete observations for a draftless repair without treating them as source-phase completion',()=>{
 const prompt='读取 boardPeers 的相关数据与交互',targets={files:[args.file_path]}
 expect(prototypeHtmlEvidence([record],prompt,targets)).toBeNull()
 expect(JSON.parse(prototypeHtmlEvidence([record],prompt,targets,{observedSources:true}))[0]).toMatchObject({args,completeRowCount:244})
 expect(prototypeHtmlEvidence([record],'DATA.missing 与 DATA.products',targets,{observedSources:true})).toBeNull()
 expect(prototypeHtmlEvidence([{...record,response:{...record.response,nextOffset:245}}],prompt,targets,{observedSources:true})).toBeNull()
 const metadata={tool:'read_prototype',args:{file_path:args.file_path,section:'PROV.sources'},response:{section:'PROV.sources',value:{asOf:'原型快照'}}}
 expect(prototypeHtmlEvidence([{...record,response:{...record.response,nextOffset:245}},metadata],prompt,targets,{observedSources:true})).toBeNull()
 const rejected=structuredClone(candidate);rejected.requests[0].args.limit=40
 expect(prototypeHtmlEvidence([record],prompt,targets,{observedSources:true,candidate:rejected})).toBeNull()
})
it.each(['source-view','empty-excuse'])('keeps draftless timeout recovery tied to complete source data: %s',async mode=>{
 const original='根据 '+args.file_path+' 创建工作台，保留原型来源。',prompt='读取 boardPeers 的相关数据，保留同赛道筛选和明细展开。'
 const plan=validateWorkbench({requestId:'draftless-repair',title:'运营',originalRequest:original,dataMode:'source',panels:[{title:'竞品',prompt,type:'html',size:'large'}]})
 const fixed=structuredClone(candidate);delete fixed.mapping.html;fixed.mapping.view={source:'products',path:'rows',kind:'table',columns:[{field:'code',label:'代码'},{field:'value',label:'数值'}],search:['code']}
 const empty={version:1,type:'dashboard',title:'竞品',items:[{label:'完整记录',value:'—',detail:'未取得可核验数据'}]}
 const repair=vi.fn(()=>({childSessionId:'same-child',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(mode==='source-view'?fixed:empty)}]}),dispose:async()=>{}}))
 const start=vi.fn(async()=>({childSessionId:'same-child',result:Promise.resolve({stopReason:'timeout',localDeadlineExceeded:true,output:[{type:'text',text:'正在准备组件，请稍候。'}],sourceRecords:[record]}),repair,dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}}})
 try{
  const receipt=await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:workbenchPanelPrompt(plan,plan.panels[0])},{workbenchRequest:{originalRequest:original,dataMode:'source'},sourceRequirement:prompt,sourcePolicy:workbenchSourcePolicy(original,plan.panels[0])})
  await vi.waitFor(()=>expect(['completed','failed']).toContain(runtime.tasks.get(receipt.taskId)?.state))
  const task=runtime.tasks.get(receipt.taskId);expect(start).toHaveBeenCalledTimes(1);expect(repair).toHaveBeenCalledTimes(1)
  expect(repair.mock.calls[0][0].prototypeSubmission).toMatchObject({observedSources:true,records:[record],candidate:undefined})
  if(mode==='source-view'){expect(task.state).toBe('completed');expect(sourceData(task.finalOutput)).toEqual(record.response)}
  else{expect(task.state).toBe('failed');expect(task.finalOutput).toBeUndefined();expect(task.error).toContain('不能用未取得资料的说明')}
 }finally{await runtime.dispose()}
})
it.each(['unread file','unobserved args','partial page','discovery','function','duplicate key','extra request field'])('rejects widening repair source authority: %s',kind=>{
 const source=structuredClone(record),draft=structuredClone(candidate)
 if(kind==='unread file')draft.requests[0].args.file_path='/private/other.html'
 if(kind==='unobserved args')draft.requests[0].args.limit=40
 if(kind==='partial page')source.response.nextOffset=245
 if(kind==='discovery')source.purpose='discovery'
 if(kind==='function')source.args.section=source.response.section=draft.requests[0].args.section='function:render'
 if(kind==='duplicate key')draft.requests.push(structuredClone(draft.requests[0]))
 if(kind==='extra request field')draft.requests[0].url='https://example.test'
 expect(prototypeHtmlEvidence([source],'复刻竞品页签',{files:[args.file_path]},{candidate:draft})).toBeNull()
})
it('repairs a generic source-panel draft with an extra metadata field while preserving its full observed data and specific diagnostic',async()=>{
 const original='根据 '+args.file_path+' 创建工作台，不查询外部行情。',prompt='读取原型竞品页签，保留同赛道筛选及明细展开。'
 const plan=validateWorkbench({requestId:'generic-repair',title:'运营',originalRequest:original,dataMode:'source',panels:[{title:'竞品',prompt,type:'html',size:'large'}]}),draft=structuredClone(candidate)
 draft.mapping.presentation={numericFormats:[{field:'value',scale:1}]}
 draft.mapping.html+='<style>input{color:red}</style><input aria-label="筛选">'
 const repaired=structuredClone(candidate);delete repaired.mapping.html;repaired.mapping.view={source:'products',path:'rows',kind:'table',columns:[{field:'code',label:'代码'},{field:'value',label:'数值'}],search:['code'],details:{field:'channels',columns:[{field:'name',label:'渠道'},{field:'amount',label:'金额'}]}}
 const start=vi.fn(async()=>({childSessionId:'child-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(start.mock.calls.length===1?draft:repaired)}],...start.mock.calls.length===1?{sourceRecords:[record]}:{}}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}}})
 try{
  const receipt=await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:workbenchPanelPrompt(plan,plan.panels[0])},{workbenchRequest:{originalRequest:original,dataMode:'source'},sourceRequirement:prompt,sourcePolicy:workbenchSourcePolicy(original,plan.panels[0])})
  await vi.waitFor(()=>expect(['completed','failed']).toContain(runtime.tasks.get(receipt.taskId)?.state))
  const task=runtime.tasks.get(receipt.taskId);expect(task.error).toBeUndefined();expect(task.state).toBe('completed');expect(sourceData(task.finalOutput)).toEqual(record.response)
  expect(start).toHaveBeenCalledTimes(2)
  const repair=start.mock.calls[1][0];expect(repair.synthesisOnly).toBe(true);expect(repair.prototypeSubmission).toMatchObject({records:[record],candidate:draft})
  expect(repair.prompt).toContain('mapping 含未支持字段 "presentation"');expect(repair.prompt).toContain('completeRowCount');expect(repair.prompt).toContain('不要把已取得记录改成缺失')
  expect(repair.prompt).toContain('有脚本交互的组件必须实际注册一个共享状态容器');expect(repair.prompt).toContain('控件 color 必须使用')
  expect(repair.prompt).toContain('局部替换');expect(repair.prompt).not.toContain('view配置示意');expect(repair.prompt).not.toContain('多个数据视图')
  expect(repair.prompt.match(/Trusted Types（/gu)).toHaveLength(1);expect(repair.prompt).toContain('createElement/createElementNS')
 }finally{await runtime.dispose()}
})
it('renders reusable source-backed table controls and nested details without model-authored HTML',()=>{
 const value=structuredClone(candidate);delete value.mapping.html
 value.mapping.view={source:'products',path:'rows',kind:'table',key:'code',value:'value',columns:[{field:'code',label:'代码'},{field:'value',label:'数值'}],search:['code'],filters:[{field:'value',label:'方向',kind:'sign'}],details:{field:'channels',columns:[{field:'name',label:'渠道'},{field:'amount',label:'金额'}]}}
 const result=resolve(value);expect(result).toBeTruthy();expect(result.data).not.toHaveProperty('view');expect(result.data.html).toContain('window.sherlockShared.register');expect(sourceData(result.output)).toEqual(record.response)
 value.mapping.view.columns[1].field='invented';expect(resolve(value)).toBeNull()
})
it('renders a period-switching bar view over a complete observed object and rejects unobserved fields',()=>{
 const value=structuredClone(candidate);delete value.mapping.html
 const source=structuredClone(record);source.response={section:args.section,value:{groups:[{label:'原分类',week:0,month:-1.3}]}}
 value.mapping.view={source:'products',path:'value.groups',kind:'bars',label:'label',value:'week',unit:'亿',periods:[{field:'week',label:'近1周'},{field:'month',label:'近1月'}]}
 expect(resolve(value,[source])).toBeTruthy()
 value.mapping.view.periods.push({field:'fake',label:'假窗口'});expect(resolve(value,[source])).toBeNull()
})
it('rejects a guessed percentage scale against exact observed source formatting and exposes a repairable field issue',()=>{
 const value=structuredClone(candidate);delete value.mapping.html
 value.mapping.view={source:'products',path:'rows',kind:'table',columns:[{field:'value',label:'规模变化',scale:100,unit:'%'}]}
 const observed=structuredClone(record);observed.response.presentation={numericFormats:[{field:'value',scale:1,expression:'r.value.toFixed(2)'}]}
 const onPrototypeScaleIssue=vi.fn()
 expect(resolve(value,[observed],{onPrototypeScaleIssue})).toBeNull();expect(onPrototypeScaleIssue).toHaveBeenCalledWith(expect.stringContaining('r.value.toFixed(2)'))
 value.mapping.view.columns[0]={field:'value',label:'规模变化',unit:'亿'}
 expect(resolve(value,[observed])).toBeTruthy()
 value.mapping.view.columns[0]={field:'value',label:'规模变化',unit:'万',scale:10000}
 expect(resolve(value,[observed])).toBeTruthy()
 observed.response.presentation.numericFormats.push({field:'value',scale:100,expression:'(r.value*100).toFixed(2)'})
 value.mapping.view.columns[0].scale=100;expect(resolve(value,[observed])).toBeTruthy()
})
it('rejects changing a source-proven asset-scale metric into share counts while permitting renamed asset labels and unit conversion',()=>{
 const value=structuredClone(candidate);delete value.mapping.html
 value.mapping.view={source:'products',path:'rows',kind:'table',columns:[{field:'value',label:'份额变动',unit:'亿'}]}
 const observed=structuredClone(record);observed.response.presentation={numericFormats:[{field:'value',scale:1,expression:'mine.value.toFixed(2)',context:['规模变化（本周）']}]}
 const onPrototypeScaleIssue=vi.fn()
 expect(resolve(value,[observed],{onPrototypeScaleIssue})).toBeNull();expect(onPrototypeScaleIssue).toHaveBeenCalledWith(expect.stringContaining('资产规模'))
 value.mapping.view.columns[0]={field:'value',label:'本周资产规模变动',unit:'万港元',scale:10000};expect(resolve(value,[observed])).toBeTruthy()
 delete observed.response.presentation;value.mapping.view.columns[0].label='份额变动';expect(resolve(value,[observed])).toBeTruthy()
 observed.response.presentation={numericFormats:[{field:'value',scale:1,context:['AUM change']} ]};value.mapping.view.columns[0].label='Share count change';expect(resolve(value,[observed])).toBeNull()
 observed.response.presentation.numericFormats[0].context=['份额变动'];expect(resolve(value,[observed])).toBeTruthy()
})
it('keeps source records through the bounded synthesis and applies normal final component acceptance to a host view',async()=>{
 const original='根据 '+args.file_path+' 创建工作台；保留所有产品，不查询外部行情。',prompt='显示 DATA.products 全部244只产品，支持分类条件筛选和分组汇总，编号保留前导零。'
 const plan=validateWorkbench({requestId:'view',title:'运营',originalRequest:original,dataMode:'source',panels:[{title:'明细',prompt,type:'table',size:'large'}]}),panel=plan.panels[0]
 const value=structuredClone(candidate);delete value.mapping.html;value.mapping.view={source:'products',path:'rows',kind:'table',columns:[{field:'code',label:'代码'},{field:'value',label:'数值'}],search:['code']}
 const start=vi.fn(async()=>({childSessionId:'child-'+start.mock.calls.length,result:Promise.resolve(start.mock.calls.length===1?{stopReason:'timeout',localDeadlineExceeded:true,researchPhaseComplete:true,output:[],sourceRecords:[record]}:{stopReason:'completed',output:[{type:'text',text:JSON.stringify(value)}]}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}}})
 try{
  const receipt=await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:workbenchPanelPrompt(plan,panel)},{workbenchRequest:{originalRequest:original,dataMode:'source'},sourceRequirement:prompt,sourcePolicy:workbenchSourcePolicy(original,panel)})
  await vi.waitFor(()=>expect(['completed','failed']).toContain(runtime.tasks.get(receipt.taskId)?.state))
  const task=runtime.tasks.get(receipt.taskId);expect(task.error).toBeUndefined();expect(task.state).toBe('completed');expect(sourceData(task.finalOutput)).toEqual(record.response)
  expect(start).toHaveBeenCalledTimes(2);expect(start.mock.calls[1][0]).toMatchObject({synthesisOnly:true});expect(start.mock.calls[1][0].prompt).toContain('completeRowCount');expect(start.mock.calls[1][0].prompt).not.toContain('主要正文必须写入初始 HTML，不能只靠脚本注入')
  const synthesis=start.mock.calls[1][0].prompt
  expect(synthesis).toContain(prompt);expect(synthesis).toContain(original)
  expect(synthesis).not.toContain('仅生成本面板，优先使用')
  expect(synthesis).not.toContain('自定义业务正文13px/20px')
  expect(synthesis).not.toContain('初始HTML包含可访问的筛选控件')
  expect(synthesis).toContain('直接修正已有view或html')
  expect(synthesis).toContain('如需求超出宿主记录视图')
  expect(synthesis).not.toMatch(/requests:\[\{key:"products"/u)
  expect(synthesis).toContain('submit_prototype_view');expect(start.mock.calls[1][0].prototypeSubmission.records).toEqual([record])
  expect(synthesis.split('分组汇总可复用table的groupBy:')).toHaveLength(2);expect(synthesis).toContain('view.columns配置展开后的原始成员列')
  expect(synthesis).not.toContain('以下原始用户需求仅约束本卡')
 }finally{await runtime.dispose()}
})
