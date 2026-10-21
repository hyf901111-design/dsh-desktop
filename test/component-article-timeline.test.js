import {expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {componentFeedEvidenceIssue,componentSnapshotEvidence,retainVerifiedFeedItems,fetchedWebPageRecord} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {acquireFeedSourceEvidence} from '../packages/dsh-research-task-runtime/component-feed-acquisition.js'
import {restoreWorkbenchHostContext} from '../packages/dsh-research-task-runtime/workbench-source-policy.js'

// All article bodies below are synthetic offline fixtures, never observed B facts.
const url='https://example.org/company/article'
const item={id:'article',title:'甲公司发布产品',time:'2026-10-15',actor:'甲公司',url,summary:'产品信息。'}
const data={version:1,type:'timeline',title:'公司新闻',range:'2026-10-01 至 2026-10-21',items:[item]}
const options={panelRequest:'查询公司真实新闻及原文链接。',workbenchRequest:{originalRequest:'创建真实公司新闻工作台，2026-10-01 至 2026-10-21。',dataMode:'source'}}
const text=value=>JSON.stringify(value)
const page=(value=item)=>({url:value.url,content:`${value.title}\n\n[网页读取状态：已滚动至文末，完成正文收集]\n\n[网页主文记录]\n${JSON.stringify({articles:[{title:value.title,date:value.time,url:value.url}]})}\n[/网页主文记录]\n\n合成原文正文。`})
const record=(value=item)=>fetchedWebPageRecord(value.url,page(value).content)

it('does not let one cited fetched URL establish an unread real article timeline',()=>{
 const records=[fetchedWebPageRecord(url,'仅获取到页面说明，没有主文身份')]
 expect(componentFeedEvidenceIssue(text(data),records,options)).toMatch(/同一条|同条/)
 expect(componentSnapshotEvidence(text(data),records,options)).toBe(false)
})
it('acquires an explicitly discovered timeline original once then preserves its original identity',async()=>{
 const readPage=vi.fn(async()=>page())
 const result=await acquireFeedSourceEvidence({text:text(data),observedUrls:[url],readPage,...options})
 expect(result.records).toHaveLength(1)
 expect(componentFeedEvidenceIssue(text(data),result.records,options)).toBeNull()
 expect(componentSnapshotEvidence(text(data),result.records,options)).toBe(true)
 await acquireFeedSourceEvidence({text:text(data),records:result.records,observedUrls:[url],readPage,...options})
 expect(readPage).toHaveBeenCalledOnce()
 expect(data.items[0].time).toBe('2026-10-15')
})
it.each([
 {time:'约2026-10-15'},{time:'2026-10-15 08:00'},{time:undefined},{time:'2026-10-16'},
 {title:'乙公司发布产品'},{actor:'乙公司'},{object:'999999.SZ'},{url:'https://example.org/company/other'}
])('rejects unproven date, company, title or URL: %j',change=>{
 expect(componentFeedEvidenceIssue(text({...data,items:[{...item,...change}]}),[record()],options)).toBeTruthy()
})
it('compares explicit equivalent calendar days without rewriting the timeline time',()=>{
 const candidate={...data,items:[{...item,time:'2026年10月15日'}]}
 expect(componentFeedEvidenceIssue(text(candidate),[record()],options)).toBeNull()
 expect(candidate.items[0].time).toBe('2026年10月15日')
})
it('rejects conflicting same-URL source identities rather than picking the first',()=>{
 expect(componentFeedEvidenceIssue(text(data),[record(),record({...item,title:'乙公司发布产品'})],options)).toBeTruthy()
})
it('keeps original human and declared windows and preserves complete gaps without counting backgrounds',()=>{
 const background={...item,id:'background',title:'乙公司历史政策',actor:'乙公司',time:'2026-09-10',url:'https://example.org/background',summary:'UNVERIFIED SUMMARY MUST NOT SURVIVE'}
 const missing={...item,id:'missing',title:'丙公司新闻',actor:'丙公司',url:'https://example.org/unread',summary:'UNVERIFIED SUMMARY MUST NOT SURVIVE'}
 const candidate={...data,range:'2026-01-01 至 2026-10-21',note:'完整覆盖三家公司共3条新闻；还需核查政策维度。',items:[item,background,missing]}
 const records=[record(),record(background)]
 expect(componentFeedEvidenceIssue(text(candidate),records,options)).toMatch(/窗口|范围/)
 const kept=JSON.parse(retainVerifiedFeedItems(text(candidate),records,options))
 expect(kept.items).toEqual([item])
 expect(kept.range).toBe(candidate.range)
 for(const value of ['乙公司','丙公司','政策维度','2026-09-10','https://example.org/background','https://example.org/unread','不计入','计数与覆盖声明已失效'])expect(kept.note).toContain(value)
 expect(kept.note).not.toContain('UNVERIFIED SUMMARY')
 expect(componentFeedEvidenceIssue(text(kept),records,options)).toBeNull()
 expect(retainVerifiedFeedItems(text({...candidate,items:[missing]}),records,options)).toBeUndefined()
})
it.each([
 {},{...options,panelRequest:'整理团队项目活动时间线。'},
 {...options,workbenchRequest:{...options.workbenchRequest,dataMode:'simulated'}},
 {...options,workbenchRequest:{originalRequest:'创建工作台，只用我提供的新闻原文整理时间线，不要联网。',dataMode:'source'}}
])('preserves ordinary, simulated and supplied-original timelines: %j',async scope=>{
 expect(componentFeedEvidenceIssue(text(data),[],scope)).toBeNull()
 const readPage=vi.fn()
 expect((await acquireFeedSourceEvidence({text:text(data),observedUrls:[url],readPage,...scope})).records).toEqual([])
 expect(readPage).not.toHaveBeenCalled()
})
it('cannot evade host source mode by labeling an artifact simulated',()=>{
 expect(componentFeedEvidenceIssue(text({...data,title:'模拟新闻',note:'全部模拟数据'}),[],options)).toBeTruthy()
})
it('validates, defaults and detaches the trusted original request while allowing old contexts',()=>{
 const base={sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:'新闻'},sourceRequirement:'查询新闻'}
 const input={...base,workbenchRequest:{originalRequest:'创建真实新闻工作台。'}}
 const restored=restoreWorkbenchHostContext(input)
 expect(restored.workbenchRequest).toEqual({originalRequest:'创建真实新闻工作台。',dataMode:'source'})
 input.workbenchRequest.originalRequest='changed'
 expect(restored.workbenchRequest.originalRequest).toBe('创建真实新闻工作台。')
 expect(restoreWorkbenchHostContext(base).workbenchRequest).toBeUndefined()
 for(const request of [{originalRequest:'x'.repeat(8001)},{originalRequest:7},{originalRequest:'x',dataMode:'fake'}])expect(()=>restoreWorkbenchHostContext({...base,workbenchRequest:request})).toThrow()
})
it('reproduces the actual B gap: all eleven observed links remain unverified and only six can be attempted',async()=>{
 const packet=JSON.parse(readFileSync(new URL('./fixtures/workbench-article-timeline-observed.json',import.meta.url),'utf8'))
 const scope={panelRequest:packet.prompt,workbenchRequest:{originalRequest:'创建真实算力工作台，汇总三家公司公告与相关新闻。',dataMode:'source'}}
 expect(packet.repairArtifact.items).toHaveLength(11)
 expect(packet.repairArtifact.items.every(i=>packet.observedUrls.includes(i.url))).toBe(true)
 expect(componentFeedEvidenceIssue(text(packet.repairArtifact),[],scope)).toBeTruthy()
 // Failed offline reads prove scheduling only, never validate model titles/dates.
 const readPage=vi.fn(async()=>{throw Error('offline observed-link scheduling test')})
 const result=await acquireFeedSourceEvidence({text:text(packet.repairArtifact),observedUrls:packet.observedUrls,readPage,...scope})
 expect(readPage).toHaveBeenCalledTimes(6)
 expect(result.records).toEqual([])
 expect(result.attempts).toHaveLength(6)
})
it('uses an explicit human name-code pair without requiring the ticker in an article headline',()=>{
 const scope={...options,workbenchRequest:{...options.workbenchRequest,originalRequest:'创建甲公司（300308.SZ）与乙公司（300502.SZ）真实新闻工作台。'}}
 expect(componentFeedEvidenceIssue(text({...data,items:[{...item,object:'300308.SZ'}]}),[record()],scope)).toBeNull()
 expect(componentFeedEvidenceIssue(text({...data,items:[{...item,object:'300502.SZ'}]}),[record()],scope)).toBeTruthy()
})
it('does not repeat a completed page read when its content conflicts with the draft',async()=>{
 const readPage=vi.fn()
 await acquireFeedSourceEvidence({text:text({...data,items:[{...item,title:'错误标题'}]}),records:[record()],observedUrls:[url],readPage,...options})
 expect(readPage).not.toHaveBeenCalled()
})
it('does not leave stale total counts or source coverage claims on a partial timeline',()=>{
 const candidate={...data,title:'2条已核验新闻',asOf:'全部来源已经核验',items:[item,{...item,id:'missing',title:'乙公司原文',actor:'乙公司',url:'https://example.org/missing'}]}
 const kept=JSON.parse(retainVerifiedFeedItems(text(candidate),[record()],options))
 expect(kept.title).not.toContain('2条')
 expect(kept.asOf).not.toBe(candidate.asOf)
 expect(kept.note).toContain(candidate.title)
 expect(kept.note).toContain(candidate.asOf)
 expect(kept.note).toContain('已失效')
})
it.each(['https://example.org/not-discovered','http://127.0.0.1/a','http://[::1]/a','https://u:p@example.org/a','https://example.org/a?access_token=secret'])('never supplements unsafe or undiscovered timeline URL %s',async address=>{
 const readPage=vi.fn(),candidate={...data,items:[{...item,url:address}]}
 await acquireFeedSourceEvidence({text:text(candidate),observedUrls:address.includes('not-discovered')?[]:[address],readPage,...options})
 expect(readPage).not.toHaveBeenCalled()
})
it('keeps the six-page, three-concurrent and 30KB shared evidence bounds for timelines',async()=>{
 const items=Array.from({length:8},(_,i)=>({...item,id:'article'+i,url:`https://example.org/article/${i}`}));let active=0,peak=0
 const readPage=vi.fn(async address=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;const p=page({...item,url:address});p.content+='长正文。'.repeat(10000);return p})
 const result=await acquireFeedSourceEvidence({text:text({...data,items}),observedUrls:items.map(i=>i.url),readPage,maxPages:99,concurrency:99,...options})
 expect(result.records).toHaveLength(6);expect(peak).toBeLessThanOrEqual(3);expect(readPage).toHaveBeenCalledTimes(6)
 expect(Buffer.byteLength(result.evidence)).toBeLessThanOrEqual(30000)
 expect(componentFeedEvidenceIssue(text({...data,items}),result.records,options)).toContain('第7条')
})
it('preserves partial timeline evidence, terminates hung reads, and honors parent cancellation',async()=>{
 const other={...item,id:'other',url:'https://example.org/other'},candidate={...data,items:[item,other]}
 const result=await acquireFeedSourceEvidence({text:text(candidate),observedUrls:[url,other.url],readPage:async address=>address===url?page():new Promise(()=>{}),timeoutMs:15,...options})
 expect(result.records).toHaveLength(1);expect(result.attempts.map(a=>a.status)).toEqual(['read','unavailable'])
 const controller=new AbortController()
 await expect(acquireFeedSourceEvidence({text:text(data),observedUrls:[url],readPage:async()=>{controller.abort(new Error('parent cancelled'));return new Promise(()=>{})},signal:controller.signal,...options})).rejects.toThrow('parent cancelled')
})
it('fails instead of truncating a complete gap note beyond the existing schema budget',()=>{
 const candidate={...data,note:'原研究范围'.repeat(399),items:[item,{...item,id:'other',title:'乙公司政策',actor:'乙公司',url:'https://example.org/other'}]}
 expect(retainVerifiedFeedItems(text(candidate),[record()],options)).toBeUndefined()
})
it('distinguishes supplied original text from supplied links that still require retrieval',()=>{
 const scope=originalRequest=>({...options,workbenchRequest:{dataMode:'source',originalRequest}})
 expect(componentFeedEvidenceIssue(text(data),[],scope('创建工作台，依据我提供的原文整理新闻时间线。'))).toBeNull()
 expect(componentFeedEvidenceIssue(text(data),[],scope('创建工作台，只用我提供的链接检索新闻原文。'))).toBeTruthy()
})
it('does not stringify a malformed article time into a successful gap note',()=>{
 const candidate={...data,items:[item,{...item,id:'bad',time:{date:'2026-10-15'},url:'https://example.org/bad'}]}
 expect(retainVerifiedFeedItems(text(candidate),[record()],options)).toBeUndefined()
})
