import { expect, it } from 'vitest'
const load=()=>import('../packages/dsh-research-task-runtime/notes-challenge-consensus.js')
const row={S_INFO_WINDCODE:'600519.SH',EST_REPORT_DT:'20261231',EST_DT:'20261019',NUM_EST_INST:45,EPS_AVG:67.3481,EPS_MEDIAN:67.0908,EPS_MIN:64.7795,EPS_MAX:71.1026,EPS_DEV:1.6094,S_EST_BASESHARE:125008.1601,NET_PROFIT_MEDIAN:8386900,NET_PROFIT_MIN:8097961,NET_PROFIT_MAX:8888400,NET_PROFIT_DEV:201182.2346,NET_PROFIT_UPGRADE:0,NET_PROFIT_DOWNGRADE:35,NET_PROFIT_MAINTAIN:8}
const claim={blockId:'forecast',quote:'EPS76元',windCode:'600519.SH',baseDate:'20261020',year:2026,metric:'EPS',value:76,unit:'元'}

it('applies a configured mature-industry threshold and retains explicit capital-basis evidence',async()=>{
  const {compareConsensusClaim}=await load(),r=compareConsensusClaim(claim,[row],{threshold:.12})
  expect(r.rules).toEqual(['C1','C2','C3'])
  expect(r.evidence.data).toMatchObject({threshold:.12,baseShare:125008.1601,baseShareUnit:'万股',deviationPct:expect.closeTo(13.2793,3)})
})
it('reads one explicit report-level comparison threshold without guessing an industry',async()=>{
  const m=await load();expect(typeof m.consensusPolicyFromBlocks).toBe('function')
  expect(m.consensusPolicyFromBlocks([{text:'一致预期偏离阈值：12%'}])).toMatchObject({threshold:.12})
  expect(m.consensusPolicyFromBlocks([{text:'贵州茅台是一家成熟行业公司。'}])).toMatchObject({threshold:.2})
  expect(()=>m.consensusPolicyFromBlocks([{text:'一致预期偏离阈值：12%\n一致预期偏离阈值：20%'}])).toThrow()
  expect(()=>m.consensusPolicyFromBlocks([{text:'一致预期偏离阈值：0%'}])).toThrow()
})
it('uses an absolute median denominator and keeps standard-deviation comparisons independent of median sign',async()=>{
  const {compareConsensusClaim}=await load()
  const r=compareConsensusClaim({...claim,value:-100},[{...row,EPS_MEDIAN:-200,EPS_MIN:-500,EPS_MAX:0,EPS_DEV:50}])
  expect(r.rules).toEqual(['C2','C3']);expect(r.evidence.data.deviationPct).toBe(50)
  expect(compareConsensusClaim({...claim,value:100},[{...row,EPS_MEDIAN:0,EPS_MIN:-200,EPS_MAX:200,EPS_DEV:50}]).rules).toEqual(['C3'])
})
it('compares a latest-only fallback with a prominent warning, without judging the historical forecast wrong',async()=>{
  const r=(await load()).compareConsensusClaim(claim,[{...row,EST_DT:'20261021'}],{threshold:.12})
  expect(r.rules).toEqual(['C1','C2','C3']);expect(r.status).toBe('partial')
  expect(r.evidence.data).toMatchObject({fallback:true,estDt:'20261021'})
  expect(r.detail).toMatch(/回退/);expect(r.detail).toMatch(/不能.*历史/)
})
it('detects opposite adjacent-year growth using both report forecasts and same-cutoff consensus rows',async()=>{
  const {compareConsensusClaim}=await load(),previous={...claim,year:2025,value:70},prior={...row,EST_REPORT_DT:'20251231',EPS_MEDIAN:72,EPS_MIN:60,EPS_MAX:80}
  const r=compareConsensusClaim(claim,[row,prior],{claims:[previous,claim]})
  expect(r.rules).toContain('C4');expect(r.evidence.data.direction).toMatchObject({kind:'adjacent-year',previousYear:2025,reportedChange:6,consensusChange:expect.closeTo(-4.9092,3)})
  expect(compareConsensusClaim(claim,[row,prior],{claims:[{...previous,windCode:'000001.SZ'},claim]}).rules).not.toContain('C4')
  expect(compareConsensusClaim(claim,[row,{...prior,EST_DT:'20261021'}],{claims:[previous,claim]}).rules).not.toContain('C4')
})
it('uses a clearly dated monthly upward revision against actual downward revision counts',async()=>{
  const {extractConsensusClaims,compareConsensusClaim}=await load()
  const claims=extractConsensusClaims([{id:'p',text:'600519.SH 报告基准日20261020。较上月上调2026年归母净利润预测至950亿元。'}])
  expect(claims).toHaveLength(1)
  const r=compareConsensusClaim(claims[0],[row])
  expect(r.rules).toContain('C4');expect(r.evidence.data).toMatchObject({upgrade:0,downgrade:35,maintain:8,direction:{kind:'monthly-revision',reportedDirection:1,consensusDirection:-1}})
  expect(compareConsensusClaim({...claims[0],revisionDirection:undefined},[row]).rules).not.toContain('C4')
})
it('does not transfer one metric monthly revision to another metric in the same sentence',async()=>{
  const claims=(await load()).extractConsensusClaims([{id:'p',text:'600519.SH 报告基准日20261020。较上月上调2026年归母净利润预测至950亿元，主营业务收入1000亿元。'}])
  expect(claims).toHaveLength(2)
  expect(claims[0].revisionDirection).toBe(1)
  expect(claims[1].revisionDirection).toBeUndefined()
})
it('does not infer a growth conflict from fractional samples or inconsistent comparison medians',async()=>{
  const {compareConsensusClaim}=await load(),previous={...claim,year:2025,value:70},prior={...row,EST_REPORT_DT:'20251231',EPS_MEDIAN:72,EPS_MIN:60,EPS_MAX:80}
  for(const rows of [[{...row,NUM_EST_INST:5.5},prior],[row,{...prior,NUM_EST_INST:5.5}],[row,{...prior,EPS_MIN:74}]])
    expect(compareConsensusClaim(claim,rows,{claims:[previous,claim]}).rules).not.toContain('C4')
})
it('does not use impossible monthly revision counts to create a C4 conflict',async()=>{
  const {compareConsensusClaim}=await load()
  const r=compareConsensusClaim({...claim,metric:'NET_PROFIT',value:950,unit:'亿元',revisionDirection:1},[{...row,NET_PROFIT_DOWNGRADE:100}])
  expect(r.rules).not.toContain('C4')
})
it.each(['营业收入增速','行业景气假设'])('does not transfer a revision of %s to a following profit forecast',async other=>{
  const {extractConsensusClaims,compareConsensusClaim}=await load()
  const claims=extractConsensusClaims([{id:'p',text:`600519.SH 报告基准日20261020。较上月上调${other}，预计2026年归母净利润838.69亿元。`}])
  expect(claims).toHaveLength(1);expect(claims[0].revisionDirection).toBeUndefined()
  expect(compareConsensusClaim(claims[0],[row]).rules).not.toContain('C4')
})
it('does not hide a monthly revision conflict when annual growth agrees with the market',async()=>{
  const {compareConsensusClaim}=await load(),current={...claim,metric:'NET_PROFIT',value:950,unit:'亿元',revisionDirection:1},previous={...current,year:2025,value:900,revisionDirection:undefined}
  const currentRow={...row,NET_PROFIT_MEDIAN:9500000,NET_PROFIT_MIN:9000000,NET_PROFIT_MAX:10000000,NET_PROFIT_DEV:1000000},priorRow={...currentRow,EST_REPORT_DT:'20251231',NET_PROFIT_MEDIAN:9000000,NET_PROFIT_MIN:8000000}
  const r=compareConsensusClaim(current,[currentRow,priorRow],{claims:[previous,current]})
  expect(r.rules).toEqual(['C4'])
  expect(r.evidence.data.direction.comparisons).toEqual(expect.arrayContaining([expect.objectContaining({kind:'adjacent-year',conflict:false}),expect.objectContaining({kind:'monthly-revision',conflict:true})]))
})
it('treats zero standard deviation as valid unanimous forecasts for the C3 formula',async()=>{
  const {compareConsensusClaim}=await load(),base={...row,EPS_MEDIAN:100,EPS_MIN:null,EPS_MAX:null,EPS_DEV:0,NUM_EST_INST:5}
  expect(compareConsensusClaim({...claim,value:110},[base]).rules).toEqual(['C3'])
  expect(compareConsensusClaim({...claim,value:100},[base]).rules).toEqual([])
  expect(compareConsensusClaim({...claim,value:110},[{...base,EPS_DEV:-1}]).rules).toEqual([])
})
