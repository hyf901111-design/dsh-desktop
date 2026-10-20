import {expect,it,vi} from 'vitest'
import {catalog,prepareRequest,createQueryClient} from '../skills/ework-free-data-sources/scripts/query.mjs'

const announcement={art_code:'AN202610201830720785',title:'华能国际:华能国际关于第十四期超短期融资券发行的公告',display_time:'2026-10-20 17:34:18:892',notice_date:'2026-10-21 00:00:00',codes:[{stock_code:'600011',short_name:'华能国际',market_code:'1'}],columns:[{column_name:'其他'}]}
const body=list=>({success:1,error:'',data:{list,total_hits:list.length}})

it('exposes a fixed security-announcement source with one confirmed company per query',()=>{
 const source=catalog('news').sources.find(s=>s.id==='eastmoney-announcements')
 expect(source).toMatchObject({queryable:true,defaultEligible:true,access:'public-web-best-effort'})
 expect(catalog('disclosures').sources.some(s=>s.id===source.id)).toBe(true)
 const request=prepareRequest(source.id,{symbol:'sh600011',limit:12}),url=new URL(request.endpoint)
 expect(url.origin+url.pathname).toBe('https://np-anotice-stock.eastmoney.com/api/security/ann')
 expect(url.searchParams.get('stock_list')).toBe('600011')
 expect(url.searchParams.get('page_size')).toBe('12')
 expect(url.searchParams.get('page_index')).toBe('1')
})

it('keeps the original announcement, company, original link, display time and disclosure date distinct',()=>{
 const result=prepareRequest('eastmoney-announcements',{symbol:'sh600011',limit:12}).normalize(body([announcement]))
 expect(result.records).toHaveLength(1)
 expect(result.records[0]).toMatchObject({title:announcement.title,code:'600011',name:'华能国际',symbol:'sh600011',time:'2026-10-20T17:34:18.892+08:00',displayTime:announcement.display_time,noticeDate:'2026-10-21',url:'https://data.eastmoney.com/notices/detail/600011/AN202610201830720785.html'})
 expect(result.dataTime).toBe(result.records[0].time)
 expect(result.timeMeaning).toContain('noticeDate')
 expect(result.coverage).toMatchObject({symbol:'sh600011',scope:'first-page',returned:1})
 expect(result.records[0].summary).toBeNull()
})

it('does not substitute another issuer, fabricate publication time, or treat a failed response as empty business data',()=>{
 const normalize=prepareRequest('eastmoney-announcements',{symbol:'sh600011',limit:12}).normalize
 expect(normalize(body([])).records).toEqual([])
 expect(()=>normalize({success:0,error:'bad',data:{list:[]}})).toThrow()
 expect(()=>normalize(body([{...announcement,codes:[{stock_code:'600027',short_name:'华电国际'}]}]))).toThrow()
 expect(()=>normalize(body([{...announcement,art_code:'../../secret'}]))).toThrow()
 expect(normalize(body([{...announcement,display_time:''}])).records[0].time).toBeNull()
})

it.each([{symbol:'../secret'},{symbol:'sh600011',url:'https://127.0.0.1/'},{symbol:'sh600011',symbols:['sh600027']},{symbol:'sh600011',limit:101},{symbol:'sh600011',api_key:'secret'}])('rejects unsupported announcement arguments before network: %o',async parameters=>{
 const fetcher=vi.fn(),client=createQueryClient({fetcher})
 await expect(client.query({source:'eastmoney-announcements',parameters})).rejects.toThrow()
 expect(fetcher).not.toHaveBeenCalled()
})

it('uses the normal cache and retains actual fetch time independently of announcement dates',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify(body([announcement])))),now=()=>Date.parse('2026-10-20T18:00:00Z')
 const client=createQueryClient({fetcher,now}),args={source:'eastmoney-announcements',parameters:{symbol:'sh600011',limit:12}}
 const first=await client.query(args),second=await client.query(args)
 expect(fetcher).toHaveBeenCalledOnce()
 expect(first.receivedAt).not.toBe(first.dataTime)
 expect(second.cacheHit).toBe(true)
})
