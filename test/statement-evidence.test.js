import {expect,it} from 'vitest'
import {researchSearchEvidence} from '../packages/dsh-research-task-runtime/index.js'

const response={retCode:1,retMsg:'Success',data:[
 {ticker:'600011',publishDate:'2003-04-29',endDateRep:'2003-03-31',endDate:'2002-03-31',revenueYoy:12.5,unusualMetric:'old-first-page'},
 {ticker:'600011',publishDate:'2026-08-19',endDateRep:'2026-06-30',endDate:'2026-06-30',revenueYoy:-4.6,niAttrPYoy:-28.9,unusualMetric:'preserve-this-field'},
 {ticker:'600011',publishDate:'2025-08-20',endDateRep:'2025-06-30',endDate:'2025-06-30',revenueYoy:2.4},
 {ticker:'600011',publishDate:'2026-04-28',endDateRep:'2026-03-31',endDate:'2026-03-31',revenueYoy:-2.3},
 {ticker:'600011',publishDate:'2024-08-19',endDateRep:'2024-06-30',endDate:'2024-06-30',revenueYoy:1.2}
]}
const event=data=>({type:'tool/result',data:{message:{source:{callId:'financial'},content:[{type:'tool-result',toolCallId:'financial',content:[{type:'text',text:JSON.stringify(data)}]}]}}})

it('hands the actual newest reported rows and every field to synthesis instead of filling its context with the oldest financial history',()=>{
 const text=researchSearchEvidence(event(response),new Set(['financial']),{request:'600011.SH最新已披露财务指标，收入和归母净利润同比，来源和报告期。'})
 expect(text).toContain('2026-06-30');expect(text).toContain('2026-03-31')
 expect(text).toContain('preserve-this-field');expect(text).toContain('-28.9')
 expect(JSON.parse(text).data.some(row=>row.endDate==='2025-06-30'&&row.revenueYoy===2.4)).toBe(true)
 expect(text).not.toContain('old-first-page')
 expect(text).toContain('本次响应')
 expect(response.data[0].unusualMetric).toBe('old-first-page')
})

it.each(['600011.SH 2025年半年报财务指标','600011.SH 2003-01-01至2026-10-20财务序列','最新财务 20250101至20260331','比较历年财务指标变化','最新股价与交易日记录'])('preserves the full acquired rows for a different or explicit scope: %s',request=>{
 const text=researchSearchEvidence(event(response),new Set(['financial']),{request})
 expect(JSON.parse(text)).toEqual(response)
})

it('does not turn an error response or a page without genuine reporting dates into selected financial evidence',()=>{
 for(const data of [{...response,retCode:-1},{retCode:1,data:[{name:'example',value:5}]}])expect(JSON.parse(researchSearchEvidence(event(data),new Set(['financial']),{request:'最新已披露财务指标'}))).toEqual(data)
})

it.each([false,true])('does not hand a truncated oldest-first financial response or its private spill-file path to final synthesis as latest data (broken middle: %s)',brokenMiddle=>{
 const e=event(response)
 let textBody=JSON.stringify({...response,data:[response.data[0]]})
 if(brokenMiddle)textBody=textBody.replace('"revenueYoy":12.5','"revenueYoy"...omitted...:12.5')
 e.data.message.content[0].content[0].text=textBody+'\n\n(Omitted 144103 bytes. Full formatted result stored at: /tmp/private-model-spill/response.txt. Use read with offset/limit, or grep this path to search within it.)'
 const text=researchSearchEvidence(e,new Set(['financial']),{request:'最新已披露财务指标及同比'})
 expect(text).toContain('截断');expect(text).toContain('报告期')
 expect(text).not.toContain('old-first-page');expect(text).not.toContain('/tmp/private-model-spill')
})
