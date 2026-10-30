import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {HOME_NOTES_CHART_SPEC,HOME_NOTES_GUIDE_STOCK,HOME_NOTES_GUIDE_SELECTION,HOME_NOTES_REWRITE_RESULT,HOME_NOTES_TASK_RESULT} from '../packages/dsh-research-task-runtime/home-notes-guide-contract.js'
import {HOME_NOTES_GUIDE_TITLE,HOME_NOTES_GUIDE_WRITING_STAGES,HOME_NOTES_REPORT_EVIDENCE,homeNotesGuideChallengeResult} from '../src/preload/home-guide-notes-data'
import {homeNotesGuideChart} from '../packages/dsh-research-task-runtime/home-notes-guide-artifacts.js'

it('fits the unmodified 30000-character Notes reference budget without dropping any daily data',()=>{
 const chart=homeNotesGuideChart('reference-budget').node
 const context=JSON.stringify({spec:chart.containerSpec,sourceText:chart.sourceText,visibleText:'一年股价与基准表现 · 查看完整数据',status:'completed'})
 expect(context.length).toBeLessThan(30000)
 expect(JSON.parse(context).spec.html).toContain('2026-10-23')
})

it('preserves all 243 independently retrieved daily observations and the actual two security identities',()=>{
 expect(HOME_NOTES_GUIDE_STOCK).toEqual({code:'300308',market:'SZ',name:'中际旭创'})
 expect(HOME_NOTES_CHART_SPEC.labels).toHaveLength(243);expect(HOME_NOTES_CHART_SPEC.series).toHaveLength(2)
 expect([HOME_NOTES_CHART_SPEC.labels[0],HOME_NOTES_CHART_SPEC.labels.at(-1)]).toEqual(['2025-10-23','2026-10-23'])
 expect(new Set(HOME_NOTES_CHART_SPEC.labels).size).toBe(243)
 const projection=JSON.stringify([HOME_NOTES_CHART_SPEC.labels,HOME_NOTES_CHART_SPEC.series.map(s=>s.values)])
 expect(createHash('sha256').update(projection).digest('hex')).toBe('c1aa5528606a621bb5d06b891b52a231e6e4ea0e4f0ab5d2bdd3306ff804a4b6')
 expect(HOME_NOTES_CHART_SPEC.note).toContain('价格');expect(HOME_NOTES_CHART_SPEC.note).toContain('非含息')
})
it('uses restrained research prose and keeps a full logic paragraph, a small calculation issue and a sentence issue distinct',()=>{
 const stages=HOME_NOTES_GUIDE_WRITING_STAGES,blocks=stages.flat().map(b=>({...b,text:b.content})),review=homeNotesGuideChallengeResult({action:'review',blocks} as any)
 expect(stages.map(s=>s.length)).toEqual([2,1,2]);expect(HOME_NOTES_GUIDE_TITLE).toContain('中际旭创')
 expect(blocks.map(b=>b.text).join('')).not.toMatch(/今天先不追|粗算下来|我先记|自己的判断|微软|NASDAQ/)
 expect(review.issues).toHaveLength(3)
 expect(review.issues.find(i=>i.category==='logic')!.quote).toBe(blocks[2]!.text)
 expect(review.issues.find(i=>i.category==='contradiction')!.quote).toBe('环比增长174.57%')
 const sentence=review.issues.find(i=>i.category==='grammar')!.quote
 expect(blocks[4]!.text).toContain(sentence);expect(sentence.length).toBeLessThan(blocks[4]!.text.length)
 expect(HOME_NOTES_GUIDE_SELECTION).toBe(blocks[4]!.text);expect(HOME_NOTES_REWRITE_RESULT.length).toBeGreaterThan(sentence.length)
 expect(HOME_NOTES_TASK_RESULT).toContain('中际旭创');expect(HOME_NOTES_TASK_RESULT.length).toBeLessThan(150)
 expect(HOME_NOTES_REPORT_EVIDENCE).toHaveLength(3);expect(JSON.stringify(HOME_NOTES_REPORT_EVIDENCE)).toContain('14.29')
})
