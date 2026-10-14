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
