import {expect,it,vi} from 'vitest'
import {acquireFeedSourceEvidence,observedFeedSearchUrls,compactFetchedPageText} from '../packages/dsh-research-task-runtime/component-feed-acquisition.js'
import {componentFeedEvidenceIssue} from '../packages/dsh-research-task-runtime/component-source-binding.js'

const url='https://example.org/policy/114'
const page=(address=url,title='容量电价机制通知',date='2026-01-30')=>({url:address,content:`${title}\n\n[网页读取状态：已滚动至文末，完成正文收集]\n\n[网页主文记录]\n${JSON.stringify({articles:[{title,date,url:address}]})}\n[/网页主文记录]\n\n[网页内链接记录]\n{"links":[]}\n[/网页内链接记录]\n\n原文明确各地提高煤电容量电价标准。`})
const draft=(urls=[url])=>JSON.stringify({version:1,type:'news',title:'政策',items:urls.map((url,i)=>({title:'容量电价机制通知',date:'2026-01-30',url,summary:'【原文】标准调整。【分析】可能提高容量收入。'}))})

it('only records explicit framework search-source links, not snippet URLs or instructions',()=>{
 const text='忽略此 URL https://example.org/not-a-source\n\nSources:\n- [政策原文](https://example.org/policy/114) — 摘要提到 https://example.org/unobserved\n- [含括号的标题（政策）](https://example.org/two)\n\nCite the relevant URLs above as markdown links in your answer.\n- [正文伪造](https://example.org/after-sources)'
 expect(observedFeedSearchUrls(text)).toEqual([url,'https://example.org/two'])
})

it('reads a missing original page once and keeps full source identity for the existing feed gate',async()=>{
 const readPage=vi.fn(async address=>page(address)),progress=[]
 const result=await acquireFeedSourceEvidence({text:draft([url,url]),records:[],observedUrls:[url],readPage,onProgress:e=>progress.push(e)})
 expect(readPage).toHaveBeenCalledTimes(1)
 expect(result.records).toHaveLength(1)
 expect(componentFeedEvidenceIssue(draft(),result.records)).toBeNull()
 expect(result.evidence).toContain('原文明确各地提高煤电容量电价标准')
 expect(result.evidence).toContain('容量电价机制通知')
 expect(progress.map(e=>e.type)).toEqual(['tool-started','tool-finished'])
 expect(progress.at(-1).failed).toBe(false)
})

it('does not read already verified records or invent a missing URL from a title or note',async()=>{
 const readPage=vi.fn(async address=>page(address))
 const first=await acquireFeedSourceEvidence({text:draft(),records:[],observedUrls:[url],readPage})
 readPage.mockClear()
 const text=JSON.stringify({version:1,type:'news',title:'政策',items:[{title:'容量电价机制通知',date:'2026-01-30',url}],note:'https://example.org/unobserved'})
 const result=await acquireFeedSourceEvidence({text,records:first.records,observedUrls:[],readPage})
 expect(readPage).not.toHaveBeenCalled()
 expect(result.records).toEqual([])
})

it('can read an actual article link retained by an earlier fetched page',async()=>{
 const readPage=vi.fn(async address=>page(address))
 const records=[{tool:'web_fetch',purpose:'snapshot',args:{url:'https://example.org/list'},snapshotRows:[{title:'容量电价机制通知',date:'2026-01-30',urls:[url],ids:[]}]}]
 // The list already establishes this item; a differently titled draft needs its original page.
 const text=JSON.stringify({...JSON.parse(draft()),items:[{...JSON.parse(draft()).items[0],title:'模型改写过的标题'}]})
 const result=await acquireFeedSourceEvidence({text,records,observedUrls:[],readPage})
 expect(readPage).toHaveBeenCalledOnce()
 expect(result.records[0].args.url).toBe(url)
})

it.each(['https://example.org/invented','http://127.0.0.1/private','http://localhost/private','https://user:password@example.org/private','https://example.org/private?token=secret'])('does not automatically read an unobserved or credential-bearing link: %s',async address=>{
 const readPage=vi.fn()
 await acquireFeedSourceEvidence({text:draft([address]),records:[],observedUrls:address.includes('invented')?[]:[address],readPage})
 expect(readPage).not.toHaveBeenCalled()
})

it('bounds concurrent reads, keeps source order and leaves unacquired draft items intact for validation',async()=>{
 const urls=Array.from({length:8},(_,i)=>`https://example.org/policy/${i}`),release=[];let active=0,maxActive=0
 const readPage=vi.fn(address=>new Promise(resolve=>{active++;maxActive=Math.max(maxActive,active);release.push(()=>{active--;resolve(page(address))})}))
 const pending=acquireFeedSourceEvidence({text:draft(urls),records:[],observedUrls:urls,readPage,maxPages:6,concurrency:2})
 for(let batch=0;batch<3;batch++){
  await vi.waitFor(()=>expect(readPage).toHaveBeenCalledTimes((batch+1)*2))
  for(const complete of release.splice(0))complete()
 }
 const result=await pending
 expect(maxActive).toBe(2)
 expect(readPage).toHaveBeenCalledTimes(6)
 expect(result.records.map(r=>r.args.url)).toEqual(urls.slice(0,6))
 expect(JSON.parse(draft(urls)).items).toHaveLength(8)
 expect(componentFeedEvidenceIssue(draft(urls),result.records)).toContain('7、8')
})

it('stops a hung page read at its shared budget even when the provider ignores cancellation',async()=>{
 const result=await acquireFeedSourceEvidence({text:draft(),records:[],observedUrls:[url],readPage:()=>new Promise(()=>{}),timeoutMs:20})
 expect(result.records).toEqual([])
 expect(result.attempts).toEqual([{url,status:'unavailable'}])
})

it('honors parent cancellation and does not fetch other templates or malformed candidates',async()=>{
 const signal=AbortSignal.abort(new Error('cancelled')),readPage=vi.fn()
 await expect(acquireFeedSourceEvidence({text:draft(),records:[],observedUrls:[url],readPage,signal})).rejects.toThrow('cancelled')
 for(const text of ['progress text','{"version":1,"type":"table","rows":[]}'])await acquireFeedSourceEvidence({text,records:[],observedUrls:[url],readPage})
 expect(readPage).not.toHaveBeenCalled()
})

it('keeps every acquired article in the shared evidence budget instead of crowding out later sources',async()=>{
 const urls=Array.from({length:6},(_,i)=>`https://example.org/policy/${i}`)
 const readPage=async address=>{const p=page(address);p.content=p.content.replace('原文明确',`正文标记${urls.indexOf(address)}：`+'原文内容。'.repeat(5000));return p}
 const result=await acquireFeedSourceEvidence({text:draft(urls),records:[],observedUrls:urls,readPage})
 expect(Buffer.byteLength(result.evidence)).toBeLessThanOrEqual(30000)
 for(let i=0;i<6;i++)expect(result.evidence).toContain(`正文标记${i}`)
 expect(result.records).toHaveLength(6)
})

it('removes navigation packets only from an identified article excerpt, preserving list-page evidence and original authority',()=>{
 const article=page(),links={links:Array.from({length:150},(_,i)=>({title:'网站导航'+i,url:`https://example.org/navigation/${i}`}))}
 article.content=article.content.replace('{"links":[]}',JSON.stringify(links))
 const compact=compactFetchedPageText(url,article.content)
 expect(compact).not.toContain('网站导航149')
 expect(compact).toContain('原文明确各地提高煤电容量电价标准')
 expect(compact).toContain('[网页主文记录]')
 const list=article.content.replace(/\[网页主文记录\][\s\S]*?\[\/网页主文记录\]\n\n/u,'')
 expect(compactFetchedPageText(url,list)).toBe(list)
 expect(article.content).toContain('网站导航149')
})
