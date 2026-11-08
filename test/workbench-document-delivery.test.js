import { expect, it } from 'vitest'
import { acceptArtifactOutput, retainedTableData } from '../packages/dsh-research-task-runtime/artifact-output.js'
import { workbenchDocumentCitationIssue, restoreDocumentLists } from '../packages/dsh-research-task-runtime/workbench-document-evidence.js'

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
    expect(attempts[1]).toContain('本卡需要交付实际明细或层级')
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
  expect(restoreDocumentLists(output,documents,'简介3个分部')).toBe(output)
  expect(restoreDocumentLists(output.replace('甲分部、丙分部','甲分部、乙分部、丙分部'),documents,scope)).not.toContain('原文完整清单')
})
