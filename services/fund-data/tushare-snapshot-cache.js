// Only public market snapshots enter this cache. Authentication and per-user
// limits remain in the MCP handler, before this function is called.
export function createEtfSnapshotCache({now=Date.now,edge=()=>globalThis.caches?.default}={}) {
 const entries=new Map(),ttl=120000
 return async function snapshot(key,load) {
  const existing=entries.get(key)
  if(existing&&existing.expires>now())return {...await existing.promise,cacheHit:true}
  const entry={expires:now()+ttl}
  entry.promise=(async()=>{
   const cache=edge(),request=new Request('https://updates.evanarts.com/v1/tushare/mcp?internal-etf-cache=v3-'+encodeURIComponent(key))
   try {
    const response=await cache?.match(request),saved=response&&await response.json()
    if(saved?.expires>now()&&saved.expires<=now()+ttl&&saved.snapshot?.coverage?.complete===true&&Array.isArray(saved.snapshot.products)) {
     entry.expires=saved.expires
     return {snapshot:saved.snapshot,cacheHit:true}
    }
   }catch{/* Cache failure does not replace real acquisition. */}
   const value=await load()
   entry.expires=now()+ttl
   try {await cache?.put(request,Response.json({expires:entry.expires,snapshot:value},{headers:{'cache-control':'max-age=120'}}))}catch{/* Cache writes are best effort. */}
   return {snapshot:value,cacheHit:false}
  })()
  entries.set(key,entry);while(entries.size>8)entries.delete(entries.keys().next().value)
  try{return await entry.promise}catch(error){if(entries.get(key)===entry)entries.delete(key);throw error}
 }
}
