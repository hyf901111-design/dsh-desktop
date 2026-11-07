import {expect,it} from 'vitest'
import {LocalSemanticIndex} from '../packages/dsh-memory-runtime/local/index.js'
const v=new Float32Array(384);v[0]=1
const row={id:'a',revision:1,title:'离线',content:'离线可以读，不可以编辑。',status:'active',scope:'project',projectId:'p'}
it('reuses only matching model/text/revision vectors and clears removed records',async()=>{
 const index=new LocalSemanticIndex();let calls=0;const embed=async()=>{calls++;return v}
 try{
  const cache=await index.index([row],undefined,embed)
  await index.index([row],cache,embed);expect(calls).toBe(1)
  await index.index([{...row,revision:2,content:'仅能查看缓存。'}],cache,embed);expect(calls).toBe(2)
  await index.index([],cache,embed)
  expect(index.search('离线',v,'p',Date.now())).toEqual([])
 }finally{index.close()}
})
it('filters projects, inactive status and expiry before both search paths',async()=>{
 const index=new LocalSemanticIndex()
 try{
  await index.index([row,{...row,id:'other',projectId:'other'},{...row,id:'expired',expiresAt:1},{...row,id:'candidate',status:'candidate'}],undefined,async()=>v)
  expect(index.search('离线',v,'p',Date.now()).map(x=>x.id)).toEqual(['a'])
 }finally{index.close()}
})
