import {expect,it} from 'vitest'
import {HOME_NOTES_GUIDE_TITLE,HOME_NOTES_GUIDE_BLOCKS,HOME_NOTES_GUIDE_WRITING_STAGES,homeNotesGuideChallengeResult} from '../src/preload/home-guide-notes-data'
import {HOME_NOTES_CHART_PROMPT,HOME_NOTES_CHART_SPEC,HOME_NOTES_GUIDE_STOCK,HOME_NOTES_GUIDE_SELECTION,HOME_NOTES_TASK_RESULT,HOME_NOTES_REPORT_SOURCES} from '../packages/dsh-research-task-runtime/home-notes-guide-contract.js'
import {challengeDocumentBlocks} from '../src/preload/notes/challenge-scheduler'
import {challengeReplacementScope} from '../src/shared/notes-challenge'

it('uses the official reinvested annual total-return table without turning it into strategy alpha',()=>{
 expect(HOME_NOTES_GUIDE_TITLE).toBe('微软｜持有回报复盘')
 expect(HOME_NOTES_CHART_PROMPT).toBe('画一张年度业绩回测折线图，和基准比较。')
 expect(HOME_NOTES_CHART_SPEC).toMatchObject({variant:'line',labels:['2020','2021','2022','2023','2024','2025']})
 expect(HOME_NOTES_CHART_SPEC.series.map(s=>s.values)).toEqual([[100,134.41,128.48,172.01,227.51,255.13],[100,140.79,125.85,150.51,187.47,215.89],[100,150.44,117.59,154.73,223.97,254.97]])
 expect(HOME_NOTES_CHART_SPEC.note).toContain('分红再投资');expect(HOME_NOTES_CHART_SPEC.note).toContain('非主动策略')
 expect((Math.pow(255.13/100,1/5)-1)*100).toBeCloseTo(20.601387912851,10)
 expect(HOME_NOTES_REPORT_SOURCES).toHaveLength(1)
 expect(HOME_NOTES_REPORT_SOURCES[0]!.url).toBe('https://www.microsoft.com/investor/reports/ar25/index.html')
 expect(JSON.stringify(HOME_NOTES_REPORT_SOURCES)).not.toMatch(/PDF|\.pdf|页码/i)
 expect(HOME_NOTES_GUIDE_STOCK).toEqual({code:'MSFT',market:'US',name:'微软'})
 expect(HOME_NOTES_TASK_RESULT).toContain('微软');expect(HOME_NOTES_TASK_RESULT.length).toBeLessThan(130)
})

it('keeps five personal paragraphs and three different self-review scopes',()=>{
 expect(HOME_NOTES_GUIDE_WRITING_STAGES.map(items=>items.length)).toEqual([2,1,2])
 expect(HOME_NOTES_GUIDE_BLOCKS[0]!.content).toContain('今天先不追目标价')
 const blocks=challengeDocumentBlocks(HOME_NOTES_GUIDE_BLOCKS),request={sessionId:'s',requestId:'r',action:'review' as const,level:3 as const,title:HOME_NOTES_GUIDE_TITLE,blocks}
 const issues=homeNotesGuideChallengeResult(request).issues
 expect(issues).toHaveLength(3)
 const logic=issues.find(i=>i.category==='logic')!,statistic=issues.find(i=>i.category==='contradiction')!,style=issues.find(i=>i.category==='grammar')!
 expect(logic.quote).toBe(blocks[2]!.text)
 expect(statistic.quote).toBe('年化收益31.03%')
 expect(style.quote).toBe('后续将持续密切关注相关业务及各项指标的进一步变化情况。')
 expect(HOME_NOTES_GUIDE_SELECTION).toBe(style.quote)
 const result=homeNotesGuideChallengeResult({...request,action:'optimize',thread:{...statistic,messages:[]}})
 const scope=challengeReplacementScope(blocks[1]!.text,statistic.quote)
 expect('error' in scope).toBe(false)
 if('error'in scope)throw Error(scope.error)
 expect(result.reply?.replacement).toBe(scope.quote.replace(statistic.quote,'年化收益约20.60%'))
 expect(JSON.stringify(statistic.evidence)).toContain('(255.13/100)^(1/5)-1')
})
