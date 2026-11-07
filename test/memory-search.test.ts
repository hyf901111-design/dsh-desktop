import { expect, it } from 'vitest'
import type { MemoryRecord } from '../src/shared/memory'
import { MemoryRetriever } from '../src/main/memory/retriever'
const row=(id:string,content:string):MemoryRecord=>({id,title:content,content,kind:'background',scope:'project',projectId:'p',semanticKey:id,status:'active',revision:1,manualLocked:false,pinned:false,createdAt:1,updatedAt:1,lastConfirmedAt:1,sources:[]})
it('finds Chinese short words and English substrings without exposing a former identity index',()=>{
  const retriever=new MemoryRetriever()
  const rows=[row('a','这里采用SQLite本地数据库'),row('b','股票研究项目'),row('c','不相关的背景')]
  expect(retriever.select(rows,'SQLite','p',2).at(0)?.row.id).toBe('a')
  expect(retriever.select(rows,'股票','p',2).at(0)?.row.id).toBe('b')
  retriever.clear()
  expect(retriever.select([row('c','其他账户项目')],'SQLite','p',2).some(value=>value.row.id==='a')).toBe(false)
  retriever.close()
})
it('ranks long exact global candidates before packing without dropping them under the old injection budget',()=>{
 const retriever=new MemoryRetriever()
 const rows=Array.from({length:40},(_,i)=>({...row('other'+i,'过去食堂菜单与打印机维护记录'+i),scope:'global' as const}))
 const wanted={...row('wanted','目标项目预算编号为 YS-2066。'+'经财务确认，立项审批已经完成。'.repeat(8)),title:'目标项目预算编号',scope:'global' as const}
 try{expect(retriever.candidates([...rows,wanted],'目标项目预算编号',undefined,2)[0]?.id).toBe('wanted')}finally{retriever.close()}
})
