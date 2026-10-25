import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {expect,it} from 'vitest'
import {presentationHostFixture} from './fixtures/home-presentation-host.js'

it.each(['公司风格演示示例','公司风格演示示例 · 练习副本','公司风格演示示例（演示案例）','公司风格演示示例 · 练习副本（演示案例）'])('prepares the actual PPT Host for a precisely registered session titled %s',async title=>{
 const f=await presentationHostFixture()
 try{
  const path=join(f.home,'research-board-directories.json'),rows=JSON.parse(await readFile(path,'utf8'));rows.example.title=title;await writeFile(path,JSON.stringify(rows))
  const prepared=await f.command('prepare');expect(prepared).toMatchObject({ok:true,ready:true});expect(f.outside).toEqual([])
 }finally{await f.dispose()}
},15000)
it('rejects a misplaced or repeated PPT suffix without starting a model',async()=>{
 const f=await presentationHostFixture()
 try{
  const path=join(f.home,'research-board-directories.json'),rows=JSON.parse(await readFile(path,'utf8'))
  for(const title of ['公司风格演示示例（演示案例） · 练习副本','公司风格演示示例（演示案例）（演示案例）']){
   rows.example.title=title;await writeFile(path,JSON.stringify(rows));await expect(f.command('prepare')).rejects.toThrow('专属目录')
  }
  expect(f.outside).toEqual([])
 }finally{await f.dispose()}
},15000)
