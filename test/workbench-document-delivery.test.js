import { expect, it } from 'vitest'
import { acceptArtifactOutput, retainedTableData } from '../packages/dsh-research-task-runtime/artifact-output.js'
import { workbenchDocumentCitationIssue, restoreDocumentLists, documentTableOutput,workbenchDocumentScope,workbenchDocumentInputs,workbenchDocumentPrompt,documentTableEntityCoverageIssue } from '../packages/dsh-research-task-runtime/workbench-document-evidence.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

it('accepts complete editable notes with source aliases without retranscribing or dropping the content or references',()=>{
 const content='# 使用建议\n\n'+('完整业务原文和必须保留的使用条件。\n'.repeat(240))
 const note={version:1,type:'note',title:'有依据的使用建议',asOf:'2026-11-09',content}
 const reference={label:'实际原始来源',url:'https://example.com/original',text:'第4节，完整参考说明'}
 for(const extra of [{sources:[reference]},{source:[reference]},{source:reference}]){
  const result=JSON.parse(acceptArtifactOutput(JSON.stringify({...note,...extra})))
  expect(readTemplateModel(result)?.data).toEqual(note)
  expect(result.html).toContain('data-note-view="edit"')
  expect(result.html).toContain('hidden data-component-source-info')
  for(const text of Object.values(reference))expect(result.html).toContain(text)
 }
 expect(acceptArtifactOutput(JSON.stringify({...note,source:[{...reference,unrecognized:'not discarded'}]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...note,source:[reference],sources:[reference]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...note,content:'长'.repeat(17000),sources:[reference]}))).toBeUndefined()
})

it('checks unknown entities in a complete cited card-grid projection without imposing unrelated document scope',()=>{
 const documents=[{blocks:[{id:'T2',rows:[['模块甲\n负责人甲','','模块乙\n—'],['模块丙\n负责人丙','','模块丁\n—']]}]}]
 const rows=[['模块甲','负责人甲','[T2]'],['模块乙','—','[T2]'],['模块丙','负责人丙','[T2]']]
 const output=rows=>documentTableOutput(JSON.stringify({version:1,type:'table',title:'模块明细',columns:['模块','负责人','出处'],rows}))
 expect(documentTableEntityCoverageIssue(output(rows),documents,'完整模块明细')).toContain('模块丁')
 expect(documentTableEntityCoverageIssue(output(rows),documents,'指定三个模块的明细')).toBeUndefined()
 expect(documentTableEntityCoverageIssue(output(rows.map(row=>[row[0],row[1],'[T4]'])),documents,'完整模块明细')).toBeUndefined()
 expect(documentTableEntityCoverageIssue(output([...rows,['模块丁','—','[T2]']]),documents,'完整模块明细')).toBeUndefined()
 expect(documentTableEntityCoverageIssue(output([['其他实体','未知','[T2]']]),documents,'完整明细')).toBeUndefined()
 expect(documentTableEntityCoverageIssue(output(rows),[{blocks:[{id:'T2',rows:[['模块甲','负责人甲','说明\n两行'],['模块丁','—','说明\n两行']]}]}],'完整模块明细')).toBeUndefined()
})

it('核对 Word 表格中的裸编号、组合与范围，不因格式误拦也不接受未知出处',()=>{
 const docs=[{blocks:['T8','P36','P37','P38'].map(id=>({id}))}]
 for(const text of ['"T8"','"T8、P36"','"P36–P38"','[T8]、【P36】'])expect(workbenchDocumentCitationIssue(text,docs)).toBeUndefined()
 for(const text of ['"P35–P38"','[T9]','"P38–P36"','正文没有出处','ATP36x'])expect(workbenchDocumentCitationIssue(text,docs)).toBeTruthy()
})

it('checks citations in delivered text and source footnotes instead of HTML implementation identifiers',()=>{
 const docs=[{blocks:[{id:'P1'},{id:'T2'}]}]
 const card=html=>JSON.stringify({version:1,type:'html',title:'来源对照',html})
 const markup='<style>.p99{color:red}</style><script>const p0="[P999]"</script><section id="p0"><p class="P444">正文 [P1]</p></section>'
 expect(workbenchDocumentCitationIssue(card(markup),docs)).toBeUndefined()
 expect(workbenchDocumentCitationIssue(card('<p>文件说明</p><aside hidden data-component-source-info>[T2]</aside>'),docs)).toBeUndefined()
 for(const html of ['<p id="P1">没有正文出处</p>','<script>const source="[P1]"</script><p>缺少来源</p>','<template>[P1]</template><p>缺少来源</p>','<p>错误出处 [P999]</p>','<p>错误范围 [P1–P3]</p>'])expect(workbenchDocumentCitationIssue(card(html),docs)).toBeTruthy()
 const pdf=[{pages:[{page:3}]}]
 expect(workbenchDocumentCitationIssue(card('<p>结论 第3页</p><script>const s="第999页"</script>'),pdf)).toBeUndefined()
 expect(workbenchDocumentCitationIssue(card('<p title="第3页">缺少出处</p>'),pdf)).toBeTruthy()
})

it('保留带空单元格的全部文档行、数值、链接和出处', () => {
  const table = {
    version: 1, type: 'table', title: '人员明细',
    columns: [{key:'team',label:'部门'},{key:'count',label:'人数'},{key:'note',label:'待核'},{key:'ref',label:'出处'}],
    rows: [
      {team:'业务甲',count:0,note:'',ref:'[T1]'},
      {team:'业务乙',count:2,note:'待核',ref:'[T1]'},
      {team:'业务丙',count:3,note:null,ref:'[T1]'}
    ],
    asOf: '核查日期 2026-11-05',
    sources: [{label:'报告原链接',url:'https://example.com/report'}]
  }
  const output = acceptArtifactOutput(JSON.stringify(table))
  const result = JSON.parse(output)
  expect(result.type).toBe('html')
  expect(retainedTableData(result).rows).toEqual([
    ['业务甲',0,'—','[T1]'],['业务乙',2,'待核','[T1]'],['业务丙',3,'—','[T1]']
  ])
  expect(result.html).toContain('https://example.com/report')
  expect(workbenchDocumentCitationIssue(output,[{blocks:[{id:'T1'}]}])).toBeUndefined()
  expect(acceptArtifactOutput(JSON.stringify({...table, rows:[{team:'业务甲',count:0,ref:'[T1]'}]}))).toBeUndefined()
})

it('附注和核查日期与层级同时保留在原生思维导图中', () => {
  const content = '# 组织架构\n- 管理层 [P2]\n  - 负责人 [P2]'
  const map = {version:1,type:'mind-map',title:'组织架构',content,asOf:'示例.docx · 核查日期 2026-11-05',note:'职务待核 [P3]'}
  const output = acceptArtifactOutput(JSON.stringify(map))
  expect(JSON.parse(output)).toEqual({
    version:1,type:'mind-map',title:'组织架构',content,
    source:{title:'来源与说明',text:'示例.docx · 核查日期 2026-11-05\n\n职务待核 [P3]'}
  })
  expect(workbenchDocumentCitationIssue(output,[{blocks:[{id:'P2'},{id:'P3'}]}])).toBeUndefined()
  expect(acceptArtifactOutput(JSON.stringify({...map,content:content+'\n未呈现的正文'}))).toBeUndefined()
})

it('文档明细失败后自动尝试换一种呈现，只有说明时保持未完成', async () => {
  const { ResearchTaskRuntime } = await import('../packages/dsh-research-task-runtime/index.js')
  const { workbenchPanelPrompt } = await import('../packages/dsh-research-task-runtime/workbench-plan.js')
  const request = '📎 文件：`/workspace/report.docx`\n帮我把文档整理成看板'
  const title = '部门明细'
  const prompt = workbenchPanelPrompt({title:'组织资料',originalRequest:request,dataMode:'source'},
    {title,type:'table',size:'medium',prompt:'呈现 [T1] 的完整部门明细。'})
  const attempts = []
  const adapter = {
    async start({prompt}) {
      attempts.push(prompt)
      const draft = attempts.length===1
        ? {version:1,type:'markdown',title,content:'资料中的空缺标记需要查看原文 [T1]。'}
        : {version:1,type:'table',title,columns:['部门','出处'],rows:[['部门甲']],note:'原始资料的解释说明和出处仅见 [T1]。'}
      return {
        childSessionId:'child-'+attempts.length,
        result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(draft)}],documentEvidence:[{blocks:[{id:'T1'}]}]}),
        async dispose() {}
      }
    }
  }
  const runtime = new ResearchTaskRuntime({adapter,storage:{async save() {}},createId:()=> 'document-task'})
  try {
    const task = await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt},
      {workbenchRequest:{originalRequest:request,dataMode:'source'},sourceRequirement:'部门明细',
        sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:'部门明细'}})
    const inspect = () => runtime.inspect({parentSessionId:'parent',taskId:task.taskId})
    await expect.poll(() => inspect().state).toBe('failed')
    expect(attempts).toHaveLength(2)
    expect(attempts[1]).toContain('明细表缺少可核验的结构化行')
    expect(inspect()).not.toHaveProperty('finalOutput')
  } finally {
    await runtime.dispose()
  }
})


it.each(['markdown','html'])('根据可核验的原文补足 %s 卡中漏掉的条目', type => {
  const documents = [{blocks:[{id:'P8',text:'3个分部：甲分部、乙分部、丙分部。另设办公室。'}]}]
  const scope = '展示3个分部的完整名单'
  const content = '3个分部：甲分部、丙分部 [P8]。'
  const output = JSON.stringify({version:1,type,title:'机构',...(type==='html'?{html:'<main>'+content+'</main>'}:{content})})
  expect(restoreDocumentLists(output,documents,scope)).toContain('甲分部、乙分部、丙分部。')
  expect(restoreDocumentLists(output,documents,scope)).toContain('原文完整清单 [P8]')
  expect(restoreDocumentLists(output,documents,scope,{searchable:true})).toBeUndefined()
  expect(restoreDocumentLists(output,documents,'按 [P8] 展示3个分支机构的完整名单')).toContain('甲分部、乙分部、丙分部。')
  expect(restoreDocumentLists(output,documents,'简介3个分部')).toBe(output)
  expect(restoreDocumentLists(output.replace('甲分部、丙分部','甲分部、乙分部、丙分部'),documents,scope)).not.toContain('原文完整清单')
})

it('document tables reject script-only shells and keep every oversized row searchable', () => {
  const title='来源明细'
  const shell={version:1,type:'html',title,html:'<input placeholder="搜索"><table><thead><tr><th>名称</th></tr></thead><tbody></tbody></table><button>返回交互视图</button>'}
  expect(documentTableOutput(JSON.stringify(shell))).toBeUndefined()
  const rows=Array.from({length:107},(_,i)=>['实际记录'+i,'[T1]'])
  const table={version:1,type:'table',title,columns:['名称','出处'],rows,asOf:'文件时点',sources:[{label:'资料.docx'}]}
  const result=JSON.parse(documentTableOutput(JSON.stringify(table)))
  expect(result.html).toContain('data-readable-search')
  expect(result.html).toContain('sherlockShared.register')
  expect(result.html).toContain('107 / 107')
  expect(result.html.match(/<tbody>([\s\S]*?)<\/tbody>/u)[1].match(/<tr>/gu)).toHaveLength(107)
  expect(result.html).toContain('实际记录106')
  expect(workbenchDocumentCitationIssue(JSON.stringify(result),[{blocks:[{id:'T1'}]}])).toBeUndefined()
  expect(documentTableOutput(JSON.stringify({...table,sources:[{label:'资料',url:'javascript:alert(1)'}]}))).toBeUndefined()
})

it('文档结构卡保留原文与附注，重复画布尺寸无需再次生成', async () => {
  const { ResearchTaskRuntime } = await import('../packages/dsh-research-task-runtime/index.js')
  const request = '📎 文件：`/workspace/report.docx`\n根据附件整理组织层级'
  const title = '机构治理层级'
  const source = {title:'report.docx',text:'会员大会下设理事会、监事会 [P2]。'}
  const content = '# 机构\n- 会员大会 [P2]\n  - 理事会 [P2]\n  - 监事会 [P2]'
  const draft = {version:1,type:'mind-map',title,content,layout:{width:980,height:280},source,notes:'换届日期见原文 [P2]。'}
  let attempts = 0
  const runtime = new ResearchTaskRuntime({
    adapter:{async start(){
      attempts++
      return {
        childSessionId:'derived-child',
        result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(draft)}],documentEvidence:[{blocks:[{id:'P2',text:source.text}]}]}),
        async dispose() {}
      }
    }},
    storage:{async save() {}},createId:()=> 'derived-task'
  })
  try {
    const task = await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',
      prompt:'工作台：组织资料\n本面板：机构治理层级\n按原文呈现父子关系，优先使用 mind-map 类型。'},
    {workbenchRequest:{originalRequest:request,dataMode:'source'},sourceRequirement:'组织层级',
      sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:'组织层级'}})
    const inspect = () => runtime.inspect({parentSessionId:'parent',taskId:task.taskId})
    await expect.poll(() => inspect().state).toBe('completed')
    expect(attempts).toBe(1)
    expect(JSON.parse(inspect().finalOutput)).toEqual({version:1,type:'mind-map',title,content,source,note:draft.notes})
  } finally {
    await runtime.dispose()
  }
})


it('HTML 来源元信息无损收到底栏数据，不重写关系图和交互代码',()=>{
 const html='<main><svg aria-label="关系"><text>根节点</text><path d="M0 0L10 10"/></svg><button>筛选</button></main><script>const same="untouched";</script>'
 const draft={version:1,type:'html',title:'关系图',html,asOf:'核查日期 2026-11-09',note:'材料只包含公开信息',sources:[{label:'原始记录',url:'https://example.com/source?a=1&b=2',text:'精确出处 <P3>'}]}
 const result=JSON.parse(acceptArtifactOutput(JSON.stringify(draft)))
 expect(result.html.startsWith(html)).toBe(true)
 expect(result.html).toContain('hidden data-component-source-info')
 expect(result.html).toContain('核查日期 2026-11-09')
 expect(result.html).toContain('href="https://example.com/source?a=1&amp;b=2"')
 expect(result.html).toContain('&lt;P3&gt;')
 expect(acceptArtifactOutput(JSON.stringify({...draft,unknown:'不可静默丢失的字段'}))).toBeUndefined()
})

it('阅读指引把明确的来源章节移到来源信息，业务说明与所有原文保留',()=>{
 const draft={version:1,type:'summary',title:'指引',content:'# 阅读指引\n先搜索部门，再核对日期。\n\n## 六、主要资料来源\n报告.docx [T8]\nhttps://example.com/a\n\n## 使用说明\n不要将历史任职当成现任。',source:{title:'报告.docx',text:'原始材料 [P1]'}}
 const result=JSON.parse(acceptArtifactOutput(JSON.stringify(draft)))
 expect(result.content).not.toContain('主要资料来源')
 expect(result.content).toContain('不要将历史任职当成现任')
 expect(result.source.text).toContain('报告.docx [T8]')
 expect(result.source.text).toContain('https://example.com/a')
 expect(result.source.text).toContain('原始材料 [P1]')
})

it('规划为 HTML 的关系图也不能以文字回退标记完成，自动修复保留图形约束',async()=>{
 const {ResearchTaskRuntime}=await import('../packages/dsh-research-task-runtime/index.js')
 const {workbenchPanelPrompt}=await import('../packages/dsh-research-task-runtime/workbench-plan.js')
 const prompt=workbenchPanelPrompt({title:'关系研究',originalRequest:'梳理组件之间的关系图',dataMode:'source'},{title:'组件关系图',type:'html',size:'medium',prompt:'用关系图梳理实际依赖，保留来源。'})
 const attempts=[]
 const runtime=new ResearchTaskRuntime({adapter:{async start({prompt}){attempts.push(prompt);return {childSessionId:'graph-'+attempts.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify({version:1,type:'markdown',title:'组件关系图',content:'甲依赖乙，乙依赖丙。这些是实际取得的关系说明，但并未交付要求的关系图，不能把本说明标记完成。'})}]}),async dispose(){}}}},storage:{async save(){}},createId:()=> 'graph-required'})
 try{
 const task=await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt})
 await expect.poll(()=>runtime.inspect({parentSessionId:'parent',taskId:task.taskId}).state).toBe('failed')
 expect(attempts).toHaveLength(2)
 expect(attempts[1]).toContain('必须保留可视化关系')
 expect(runtime.inspect({parentSessionId:'parent',taskId:task.taskId})).not.toHaveProperty('finalOutput')
 }finally{await runtime.dispose()}
})


it('资料来源数量不再误拒有完整明细的表格，仍校验每条链接',()=>{
 const sources=Array.from({length:18},(_,i)=>({label:'来源'+i,url:'https://example.com/'+i}))
 const data={version:1,type:'table',title:'多来源明细',columns:['记录','出处'],rows:Array.from({length:60},(_,i)=>['第'+i+'条','[T1]']),sources}
 const output=JSON.parse(documentTableOutput(JSON.stringify(data)))
 expect(retainedTableData(output).rows).toEqual(data.rows)
 for(const source of sources)expect(output.html).toContain(source.url)
 expect(documentTableOutput(JSON.stringify({...data,sources:[{label:'错误',url:'javascript:alert(1)'}]}))).toBeUndefined()
})

it('不把省略号空网页当交付，也不把明确要求补充官网的请求锁成文档独占',()=>{
 for(const html of ['<!DOCTYPE html>...','<main> … </main>','<body>⋯</body>'])expect(acceptArtifactOutput(JSON.stringify({version:1,type:'html',title:'空卡',html}))).toBeUndefined()
 const request='根据附件做看板，再从两家官网补充职责说明。 📎 文件：`/workspace/report.docx`'
 expect(workbenchDocumentScope(request)).toBeUndefined()
 expect(workbenchDocumentScope('只参考附件内容。 📎 文件：`/workspace/report.docx`')).toEqual(['/workspace/report.docx'])
})


it('混合来源保留附件读取且不把外部来源强制伪装成文档引用',()=>{
 const request='使用附件整理层级，再从官网补充职责。 📎 文件：`/workspace/report.docx`'
 expect(workbenchDocumentScope(request)).toBeUndefined()
 expect(workbenchDocumentInputs(request)).toEqual(['/workspace/report.docx'])
 expect(workbenchDocumentInputs('不要读取附件。 📎 文件：`/workspace/report.docx`')).toBeUndefined()
 const docs=[{name:'report.docx',blocks:[{id:'P1',text:'真实组织'}]}]
 const prompt=workbenchDocumentPrompt(docs,false,{exclusive:false})
 expect(prompt).toContain('附件正文已经由宿主成功读取')
 expect(prompt).not.toContain('只使用下面的原文作为事实')
 expect(workbenchDocumentCitationIssue('官网职责与真实链接',docs,{required:false})).toBeUndefined()
 expect(workbenchDocumentCitationIssue('附件 [P1]',docs,{required:false})).toBeUndefined()
 expect(workbenchDocumentCitationIssue('伪造 [P999]',docs,{required:false})).toBeTruthy()
})


it('样式修复可自动换为保留全部层级和来源的原生图，不被原 HTML 格式锁死',async()=>{
 const {ResearchTaskRuntime}=await import('../packages/dsh-research-task-runtime/index.js')
 const {workbenchPanelPrompt}=await import('../packages/dsh-research-task-runtime/workbench-plan.js')
 const prompt=workbenchPanelPrompt({title:'机构研究',originalRequest:'梳理组织架构图',dataMode:'source'},{title:'机构关系图',type:'html',size:'medium',prompt:'用组织架构图展示真实层级并保留来源。'})
 const attempts=[]
 const drafts=[{version:1,type:'html',title:'机构关系图',html:'<div class="leaders" style="color:rgba(255,255,255,.75)">总会 → 分会 → 部门 → 岗位</div>'},{version:1,type:'mind-map',title:'机构关系图',content:'# 总会\n## 分会\n### 部门\n#### 岗位',source:{title:'公开材料',text:'真实层级依据 https://example.com/structure'}}]
 const runtime=new ResearchTaskRuntime({adapter:{async start({prompt}){attempts.push(prompt);return {childSessionId:'style-graph-'+attempts.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(drafts[attempts.length-1])}]}),async dispose(){}}}},storage:{async save(){}},createId:()=> 'style-graph'})
 try{
 const task=await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt})
 const inspect=()=>runtime.inspect({parentSessionId:'parent',taskId:task.taskId})
 await expect.poll(()=>inspect().state).toBe('completed')
 expect(attempts).toHaveLength(2)
 const output=JSON.parse(inspect().finalOutput)
 expect(output.type).toBe('mind-map')
 expect(output.content).toBe('# 总会\n- 分会\n  - 部门\n    - 岗位')
 expect(output.source).toEqual(drafts[1].source)
 }finally{await runtime.dispose()}
})

it('文本来源列表无损转入底栏来源契约，未知字段与危险链接仍不能通过',()=>{
 const data={version:1,type:'markdown',title:'依据来源说明',content:'文件依据与网络依据分开，未复核部分明确标注。',sources:[{name:'附件.docx',text:'定位 [T8]'}, {label:'官方网站',url:'https://example.com/source'}],asOf:'2026-11-09',note:'静态快照'}
 const output=JSON.parse(acceptArtifactOutput(JSON.stringify(data)))
 expect(output.type).toBe('summary')
 expect(output.content).toBe(data.content)
 for(const row of data.sources)for(const text of Object.values(row))expect(output.source.text).toContain(text)
 expect(output.asOf).toBe(data.asOf)
 expect(output.note).toBe(data.note)
 expect(acceptArtifactOutput(JSON.stringify({...data,sources:[{name:'来源',unknown:'不可丢失'}]}))).toBeUndefined()
 expect(acceptArtifactOutput(JSON.stringify({...data,sources:[{name:'来源',url:'javascript:alert(1)'}]}))).toBeUndefined()
})


it.each(['markdown','summary'])('moves explicit original-source sections into the footer for %s without requiring pre-existing metadata',type=>{
 const content='# 职责对照\n## 官网依据 vs 文件依据\n这段是需要阅读的业务对照。\n## 四、原始出处（每条可点击）\n- 官网：https://example.org/source\n- 附件：原始文件.docx [T8]\n## 使用说明\n保留待核状态。'
 const result=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type,title:'职责对照',content})))
 expect(result.type).toBe('summary');expect(result.content).toContain('官网依据 vs 文件依据');expect(result.content).toContain('保留待核状态');expect(result.content).not.toContain('原始出处')
 expect(result.source.text).toContain('https://example.org/source');expect(result.source.text).toContain('原始文件.docx [T8]')
})
it('keeps a provenance-only document visible and does not hide a business section containing source keywords',()=>{
 for(const content of ['## 原始出处\nhttps://example.org/source','## 官网职责与来源对照\n完整业务内容https://example.org/source']){
  const result=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'markdown',title:'资料',content})))
  expect(result.content).toBe(content)
 }
})
