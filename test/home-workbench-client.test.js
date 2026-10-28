import {describe,it,expect} from 'vitest'
import {homeWorkbenchSnapshotProvider,patchHomeWorkbenchClient,stripHomeWorkbenchClient} from '../scripts/lib/home-workbench-client.mjs'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {Script} from 'node:vm'
import {parseResearchContainerSpec} from '../packages/dsh-research-task-runtime/artifact-validator.js'
import {homeWorkbenchStudySpec} from '../packages/dsh-research-task-runtime/home-workbench-study-contract.js'
import {financialCanLink,financialLinkSourceId} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
describe('workbench historical data and typed dependencies',()=>{
 it('reinstalls the production bundle with restore metadata without duplicating hooks',()=>{
  const require=createRequire(import.meta.url),{patchHomeWorkbenchClient:patch,stripHomeWorkbenchClient:strip}=require('../scripts/lib/home-workbench-client.mjs')
  const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),baseline=strip(source),once=patch(baseline)
  expect(patch(once)).toBe(once);expect(strip(once)).toBe(baseline);expect(()=>new Script(once)).not.toThrow()
 })
 it('keeps original close and daily volume units without live requests',async()=>{const p=homeWorkbenchSnapshotProvider();const s={market:'SH',code:'600519'};const q=await p.request({action:'quotes',symbols:[s]});expect(q.quotes[0].price).toBe(1384.79);expect(q.quotes[0].time).toBe('2026-04-30 15:00:00');const h=await p.request({action:'history',symbols:[s],period:'1d',adjustment:'none'});expect(h.bars.at(-1).close).toBe(q.quotes[0].price);expect(h.bars.at(-1).date).toBe('2026-04-30');expect(p.snapshotDate).toBe('2026-04-30');expect(q.receivedAt).not.toBe(new Date().toISOString())})
 it('does not invent missing stocks or unsupported intraday/adjusted bars',async()=>{const p=homeWorkbenchSnapshotProvider();expect((await p.request({action:'quotes',symbols:[{market:'US',code:'AAPL'}]})).quotes).toEqual([]);await expect(p.request({action:'history',symbols:[{market:'SH',code:'600519'}],period:'1m'})).rejects.toThrow();await expect(p.request({action:'history',symbols:[{market:'SH',code:'600519'}],period:'1d',adjustment:'forward'})).rejects.toThrow()})
 it('accepts strict study artifacts and only meaningful dependencies',()=>{const directory=homeWorkbenchStudySpec('directory'),reader=homeWorkbenchStudySpec('reader','600519',{linkedSourceId:'directory'}),matrix=homeWorkbenchStudySpec('matrix'),valuation=homeWorkbenchStudySpec('valuation');expect(parseResearchContainerSpec(reader)).toEqual(reader);expect(parseResearchContainerSpec({...reader,arbitrary:1})).toBeNull();expect(financialCanLink(directory,reader)).toBe(true);expect(financialCanLink(reader,homeWorkbenchStudySpec('analysis'))).toBe(false);expect(financialCanLink(valuation,matrix)).toBe(true);expect(financialCanLink(valuation,homeWorkbenchStudySpec('dividend'))).toBe(false);expect(financialLinkSourceId(reader)).toBe('directory')})
})
