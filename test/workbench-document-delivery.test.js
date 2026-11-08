import { expect, it } from 'vitest'
import { acceptArtifactOutput, retainedTableData } from '../packages/dsh-research-task-runtime/artifact-output.js'
import { workbenchDocumentCitationIssue, restoreDocumentLists, documentTableOutput,workbenchDocumentScope } from '../packages/dsh-research-task-runtime/workbench-document-evidence.js'

it('核对 Word 表格中的裸编号、组合与范围，不因格式误拦也不接受未知出处',()=>{
 const docs=[{blocks:['T8','P36','P37','P38'].map(id=>({id}))}]
 for(const text of ['"T8"','"T8、P36"','"P36–P38"','[T8]、【P36】'])expect(workbenchDocumentCitationIssue(text,docs)).toBeUndefined()
 for(const text of ['"P35–P38"','[T9]','"P38–P36"','正文没有出处','ATP36x'])expect(workbenchDocumentCitationIssue(text,docs)).toBeTruthy()
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
