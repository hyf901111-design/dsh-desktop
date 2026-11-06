import {expect,it,vi} from 'vitest'
import {createEtfSnapshotCache} from '../services/fund-data/tushare-snapshot-cache.js'
const value={coverage:{complete:true},products:[{code:'test',sizeYi:1}],receivedAt:'original-time'}
function fixture(){let time=1000;const store=new Map(),edge={match:vi.fn(async key=>store.get(key.url)?.clone()),put:vi.fn(async(key,response)=>store.set(key.url,response))};return{edge,now:()=>time,advance:ms=>time+=ms,load:vi.fn(async()=>structuredClone(value))}}
it('reuses a snapshot across worker instances and views while retaining acquisition time',async()=>{
 const f=fixture(),one=createEtfSnapshotCache({now:f.now,edge:()=>f.edge}),two=createEtfSnapshotCache({now:f.now,edge:()=>f.edge})
 expect((await one('credential-hash:20261105:7',f.load)).cacheHit).toBe(false)
 expect(await two('credential-hash:20261105:7',f.load)).toEqual({snapshot:value,cacheHit:true})
 expect(f.load).toHaveBeenCalledOnce()
 expect((await two('rotated-hash:20261105:7',f.load)).cacheHit).toBe(false)
 expect(f.load).toHaveBeenCalledTimes(2)
 f.advance(120001)
 expect((await two('credential-hash:20261105:7',f.load)).cacheHit).toBe(false)
 expect(f.load).toHaveBeenCalledTimes(3)
})
it('coalesces concurrent calls, never caches failures, and tolerates cache outages',async()=>{
 const f=fixture(),read=createEtfSnapshotCache({now:f.now,edge:()=>f.edge})
 const results=await Promise.all([read('one',f.load),read('one',f.load)])
 expect(f.load).toHaveBeenCalledOnce();expect(results.map(r=>r.cacheHit)).toEqual([false,true])
 const fail=vi.fn().mockRejectedValueOnce(Error('source failed')).mockResolvedValue(value)
 await expect(read('failed',fail)).rejects.toThrow('source failed')
 expect((await read('failed',fail)).snapshot).toEqual(value)
 f.edge.match.mockRejectedValue(Error('cache unavailable'));f.edge.put.mockRejectedValue(Error('cache unavailable'))
 expect((await read('uncached',f.load)).snapshot).toEqual(value)
})
