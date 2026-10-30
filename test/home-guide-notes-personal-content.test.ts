import {expect,it} from 'vitest'
import {HOME_NOTES_GUIDE_TITLE,HOME_NOTES_GUIDE_BLOCKS,HOME_NOTES_GUIDE_WRITING_STAGES,homeNotesGuideChallengeResult} from '../src/preload/home-guide-notes-data'
import {HOME_NOTES_CHART_PROMPT,HOME_NOTES_CHART_SPEC,HOME_NOTES_GUIDE_STOCK,HOME_NOTES_GUIDE_SELECTION,HOME_NOTES_TASK_RESULT,HOME_NOTES_REPORT_SOURCES} from '../packages/dsh-research-task-runtime/home-notes-guide-contract.js'
import {challengeDocumentBlocks} from '../src/preload/notes/challenge-scheduler'
import {challengeReplacementScope} from '../src/shared/notes-challenge'

it('uses verified daily price observations without representing them as a total-return strategy',()=>{
 expect(HOME_NOTES_GUIDE_TITLE).toBe('中际旭创｜增长兑现与估值复盘');expect(HOME_NOTES_CHART_PROMPT.length).toBeLessThan(32)
 expect(HOME_NOTES_CHART_SPEC.labels).toHaveLength(243);expect(HOME_NOTES_CHART_SPEC.series).toHaveLength(2);expect(HOME_NOTES_CHART_SPEC.note).toContain('非含息')
 expect(HOME_NOTES_REPORT_SOURCES).toHaveLength(3);expect(HOME_NOTES_REPORT_SOURCES.every(source=>/\.PDF$/i.test(source.url))).toBe(true)
 expect(HOME_NOTES_GUIDE_STOCK).toEqual({code:'300308',market:'SZ',name:'中际旭创'});expect(HOME_NOTES_TASK_RESULT).toContain('中际旭创');expect(HOME_NOTES_TASK_RESULT.length).toBeLessThan(130)
})

it('keeps five personal paragraphs and three different self-review scopes',()=>{
 expect(HOME_NOTES_GUIDE_WRITING_STAGES.map(items=>items.length)).toEqual([2,1,2])
 expect(HOME_NOTES_GUIDE_BLOCKS[0]!.content).toContain('增长兑现与估值')
 const blocks=challengeDocumentBlocks(HOME_NOTES_GUIDE_BLOCKS),request={sessionId:'s',requestId:'r',action:'review' as const,level:3 as const,title:HOME_NOTES_GUIDE_TITLE,blocks}
 const issues=homeNotesGuideChallengeResult(request).issues
 expect(issues).toHaveLength(3)
 const logic=issues.find(i=>i.category==='logic')!,statistic=issues.find(i=>i.category==='contradiction')!,style=issues.find(i=>i.category==='grammar')!
 expect(logic.quote).toBe(blocks[2]!.text)
 expect(statistic.quote).toBe('环比增长174.57%')
 expect(style.quote).toBe('后续将持续密切关注相关业务及各项指标的进一步变化情况。')
 expect(HOME_NOTES_GUIDE_SELECTION).toBe(blocks[4]!.text);expect(HOME_NOTES_GUIDE_SELECTION).toContain(style.quote)
 const result=homeNotesGuideChallengeResult({...request,action:'optimize',thread:{...statistic,messages:[]}})
 const scope=challengeReplacementScope(blocks[1]!.text,statistic.quote)
 expect('error' in scope).toBe(false)
 if('error'in scope)throw Error(scope.error)
 expect(result.reply?.replacement).toBe(scope.quote.replace(statistic.quote,'环比增长14.29%'))
 expect(JSON.stringify(statistic.evidence)).toContain('22281463711.08 / 19496398083.95')
})
