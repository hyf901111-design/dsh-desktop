import {afterEach,expect,it} from 'vitest'
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto'
import {MemoryStore} from '../src/main/memory/store'
import {LocalMemoryEngine} from '../src/main/memory/semantic'
const cleanups:(()=>Promise<unknown>)[]=[]
afterEach(async()=>{for(const f of cleanups.splice(0).reverse())await f()})
const key=randomBytes(32), encryption={isEncryptionAvailable:()=>true,encryptString(s:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(s),c.final(),c.getAuthTag()])},decryptString(b:Buffer){const d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(-16));return Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString()}}
async function store(){const dir=await mkdtemp(join(tmpdir(),'memory-semantic-'));cleanups.push(()=>rm(dir,{recursive:true,force:true}));const db=await MemoryStore.open(dir,encryption);cleanups.push(async()=>db.close());return {dir,db}}
const rows:any[]=[{id:'one',revision:1,title:'离线阅读',content:'飞舟允许断网阅读，但不能在离线状态下编辑。',status:'active',scope:'project',projectId:'p'}]
it('runs the real local worker with the shipped Node and verifies model assets, encrypted cache and idle release',async()=>{
 const {dir,db}=await store(),engine=new LocalMemoryEngine({node:resolve('node_modules/node/bin/node'),worker:resolve('packages/dsh-memory-runtime/local/worker.js'),model:resolve('build/memory-model'),idleMs:30},db)
 cleanups.push(async()=>engine.close())
 await expect(engine.select(rows,'没有网络可以修改吗','p',Date.now(),'alice')).rejects.toThrow(/准备/)
 for(let i=0;i<300&&engine.status().state==='loading';i++)await new Promise(r=>setTimeout(r,10))
 expect(await engine.select(rows,'没有网络可以修改吗','p',Date.now(),'alice')).toEqual([{id:'one',revision:1}])
 expect(db.readVectors('alice')).toHaveProperty('model')
 expect(db.readVectors('bob')).toBeUndefined()
 expect((await readFile(join(dir,'memory.sqlite'))).includes(Buffer.from('飞舟'))).toBe(false)
 await new Promise(r=>setTimeout(r,65));expect(engine.status().state).toBe('idle')
 await expect(engine.select(rows,'离线阅读','p',Date.now(),'alice')).rejects.toThrow(/准备/)
 for(let i=0;i<300&&engine.status().state==='loading';i++)await new Promise(r=>setTimeout(r,10))
 expect(await engine.select(rows,'离线阅读','p',Date.now(),'alice')).toEqual([{id:'one',revision:1}])
 db.write('alice',{},true);expect(db.readVectors('alice')).toBeUndefined()
},20000)
it('cancels in-flight and queued jobs on identity reset without writing a late cache',async()=>{
 const {dir,db}=await store(),worker=join(dir,'delayed.cjs')
 await writeFile(worker,"process.on('message',m=>setTimeout(()=>process.send({id:m.id,value:{cache:{model:'stale'},candidates:[]}}),200));")
 const engine=new LocalMemoryEngine({node:process.execPath,worker,model:'unused'},db);cleanups.push(async()=>engine.close())
 const first=engine.select(rows,'离线','p',Date.now(),'alice'),second=engine.select(rows,'离线','p',Date.now(),'alice')
 const results=Promise.allSettled([first,second]);await new Promise(r=>setTimeout(r,15));engine.clear()
 expect((await results).every(r=>r.status==='rejected')).toBe(true)
 expect(db.readVectors('alice')).toBeUndefined()
})

it('returns immediately while a slow cold index builds in the background, then uses it',async()=>{
 const {dir,db}=await store(),worker=join(dir,'slow-index.cjs')
 await writeFile(worker,"process.on('message',m=>{if(m.command.type==='index')setTimeout(()=>process.send({id:m.id,value:{cache:{model:'test'}}}),350);else process.send({id:m.id,value:{candidates:[{id:'one',revision:1}]}})});")
 const engine=new LocalMemoryEngine({node:process.execPath,worker,model:'unused'},db);cleanups.push(async()=>engine.close())
 const start=performance.now()
 await expect(engine.select(rows,'离线','p',Date.now(),'alice')).rejects.toThrow(/准备/)
 expect(performance.now()-start).toBeLessThan(150)
 expect(engine.status().state).toBe('loading')
 for(let i=0;i<40&&engine.status().state==='loading';i++)await new Promise(r=>setTimeout(r,20))
 expect(engine.status().state).toBe('ready')
 expect(await engine.select(rows,'离线','p',Date.now(),'alice')).toEqual([{id:'one',revision:1}])
})
