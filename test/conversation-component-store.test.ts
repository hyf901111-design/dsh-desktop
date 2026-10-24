import {afterEach,expect,it} from 'vitest'
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {ConversationComponentStore} from '../src/main/state/conversation-components'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
const dirs:string[]=[]
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))})
const args=()=>({artifact:{version:1,type:'table',title:'模拟表格',columns:['名称','数量'],rows:[['模拟',17]]}} as any)
const identity=(extra:any={})=>({ownerAccountId:'owner',sessionId:'s',turnId:'t',mode:'conversation' as const,windowGeneration:'window-1',authorityId:'human-1',authoritySeq:7,current:()=>true,...extra})
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'conversation-store-'));dirs.push(dir);const file=join(dir,'conversation-components.json'),store=new ConversationComponentStore(file);await store.load();return {file,store}}
const target=(receipt:any)=>({sessionId:'s',componentId:receipt.effect.componentId})
it('atomically deduplicates the owner/session/turn/request key, including restart after a lost acknowledgement',async()=>{
 const {file,store}=await fixture(),first=await store.create(args(),identity(),'r');
 expect(await store.create(args(),identity(),'r')).toEqual(first)
 const restart=new ConversationComponentStore(file);await restart.load();expect(await restart.create(args(),identity(),'r')).toEqual(first)
 const view=restart.read('owner',target(first));expect(view).toMatchObject({id:first.effect.componentId,sessionId:'s',revision:1,node:{id:first.effect.componentId,x:0,y:0,generationStatus:'completed'}})
 expect(view.node.containerSpec).toBeTruthy();expect(view.provenance).not.toHaveProperty('fetchedAt');expect(view).not.toHaveProperty('ownerAccountId');expect(view).not.toHaveProperty('requestId')
 expect((await stat(file)).mode&0o777).toBe(0o600)
 await expect(store.create({...args(),title:'不同内容'},identity(),'r')).rejects.toThrow(/冲突/)
 expect((JSON.parse(await readFile(file,'utf8'))).items).toHaveLength(1)
})
it('isolates owner/session/turn and serializes concurrent writes without duplicate IDs',async()=>{
 const {store}=await fixture(),receipts=await Promise.all(Array.from({length:12},()=>store.create(args(),identity(),'r')))
 expect(new Set(receipts.map(r=>r.effect.componentId)).size).toBe(1)
 for(const change of [{ownerAccountId:'other'},{sessionId:'other'},{turnId:'other'}])expect((await store.create(args(),identity(change),'r')).effect.componentId).not.toBe(receipts[0]!.effect.componentId)
 expect(()=>store.read('other',target(receipts[0]))).toThrow();expect(()=>store.read('owner',{...target(receipts[0]),sessionId:'other'})).toThrow()
 const distinct=await Promise.all(Array.from({length:8},(_,i)=>store.create(args(),identity(),'request-'+i)));expect(new Set(distinct.map(r=>r.effect.componentId)).size).toBe(8)
})
it('retains corrupt files and locks mutation after failed recovery',async()=>{
 const {file}=await fixture();for(const text of ['bad json',JSON.stringify({version:99,items:[]}),JSON.stringify({version:1,items:[{}]})]){
  await writeFile(file,text);const bad=new ConversationComponentStore(file);await expect(bad.load()).rejects.toThrow(/原文件已保留/);await expect(bad.create(args(),identity(),'r')).rejects.toThrow();expect(await readFile(file,'utf8')).toBe(text)
 }
})
it('rejects stale leases and does not publish a failed atomic rename',async()=>{
 const {file,store}=await fixture();await expect(store.create(args(),identity({current:()=>false}),'r')).rejects.toThrow(/失效|取消/)
 const {mkdir}=await import('node:fs/promises');await mkdir(file);await expect(store.create(args(),identity(),'r')).rejects.toThrow();await rm(file,{recursive:true});const saved=await store.create(args(),identity(),'r');expect(store.read('owner',target(saved)).revision).toBe(1)
})
it('enforces input, per-session, global and file byte limits without dropping existing items',async()=>{
 const {file,store}=await fixture();await expect(store.create({artifact:{version:1,type:'markdown',title:'模拟',content:'字'.repeat(360000)}},identity(),'huge')).rejects.toThrow()
 const first=await store.create(args(),identity(),'r'),state=JSON.parse(await readFile(file,'utf8')),base=state.items[0]
 const populate=(count:number,sessions:boolean)=>({version:1,items:Array.from({length:count},(_,i)=>({...base,id:'item-'+i,node:{...base.node,id:'item-'+i},requestId:'r-'+i,sessionId:sessions?'s-'+Math.floor(i/128):'s'}))})
 await writeFile(file,JSON.stringify(populate(128,false)));const fullSession=new ConversationComponentStore(file);await fullSession.load();await expect(fullSession.create(args(),identity(),'overflow')).rejects.toThrow(/128/);expect(JSON.parse(await readFile(file,'utf8')).items).toHaveLength(128)
 await writeFile(file,JSON.stringify(populate(1024,true)));const full=new ConversationComponentStore(file);await full.load();await expect(full.create(args(),identity({sessionId:'new'}),'overflow')).rejects.toThrow(/1024/);expect(JSON.parse(await readFile(file,'utf8')).items).toHaveLength(1024)
 await writeFile(file,' '.repeat(64*1024*1024+1));const oversized=new ConversationComponentStore(file);await expect(oversized.load()).rejects.toThrow(/64 MiB/);expect((await stat(file)).size).toBe(64*1024*1024+1)
 expect(first.status).toBe('succeeded')
})
it('CAS native spec updates invalidate old observations and keep IDs and creation time',async()=>{
 const {store}=await fixture(),spec={...financialWidgetDefaults('quote')!,symbols:[{code:'AAPL',market:'US',name:'模拟标的'}]},receipt=await store.create({artifact:spec as any},identity(),'native'),t=target(receipt),initial=store.read('owner',t)
 await store.observe('owner',t,1,{action:'quotes'},{source:'模拟来源',receivedAt:'2026-10-24T01:00:00Z',quotes:[{code:'AAPL',market:'US',price:17,asOf:'2026-10-23'}]})
 expect(store.read('owner',t)).toMatchObject({revision:1,provenance:{sourceState:'native-observed',dataAsOf:'2026-10-23'}})
 const next=await store.updateNativeSpec('owner',{...t,expectedRevision:1,spec:{...spec,symbols:[{code:'MSFT',market:'US',name:'模拟新标的'}]} as any})
 expect(next).toMatchObject({id:initial.id,revision:2,createdAt:initial.createdAt,provenance:{sourceState:'unspecified',sourceNames:[],refreshKind:'native'}});expect(next.provenance).not.toHaveProperty('fetchedAt')
 expect(await store.observe('owner',t,1,{action:'history'},{source:'旧来源',receivedAt:'2026-10-24T01:00:00Z',bars:[]})).toBe(false)
 expect(store.details('owner',t).observations).toEqual({})
 await expect(store.updateNativeSpec('owner',{...t,expectedRevision:1,spec:spec as any})).rejects.toThrow(/版本|revision/)
 await expect(store.updateNativeSpec('owner',{...t,expectedRevision:2,spec:{...spec,widget:'watchlist'} as any})).rejects.toThrow()
 await expect(store.updateNativeSpec('owner',{...t,expectedRevision:2,spec:{...spec,price:999} as any})).rejects.toThrow()
})
it('rejects extra persisted node fields instead of rendering unvalidated payload after recovery',async()=>{
 const {file,store}=await fixture();await store.create(args(),identity(),'r');const state=JSON.parse(await readFile(file,'utf8'));state.items[0].node.ownerAccountId='unexpected';const text=JSON.stringify(state);await writeFile(file,text);const restart=new ConversationComponentStore(file);await expect(restart.load()).rejects.toThrow(/原文件已保留/);expect(await readFile(file,'utf8')).toBe(text)
})
it('preserves revision when native spec keys are reordered without any configuration change',async()=>{
 const {store}=await fixture(),spec={...financialWidgetDefaults('quote')!,symbols:[{code:'AAPL',market:'US',name:'模拟标的'}]},saved=await store.create({artifact:spec as any},identity(),'native'),t=target(saved),view=store.read('owner',t),reordered=Object.fromEntries(Object.entries(view.node.containerSpec as any).reverse())
 expect((await store.updateNativeSpec('owner',{...t,expectedRevision:1,spec:reordered as any})).revision).toBe(1)
})
it('rejects an atomic mutation crossing 64 MiB while retaining every existing item and original bytes',async()=>{
 const {file,store}=await fixture();await store.create(args(),identity(),'base');const base=JSON.parse(await readFile(file,'utf8')).items[0],state={version:1,items:Array.from({length:64},(_,i)=>({...base,id:'full-'+i,node:{...base.node,id:'full-'+i},requestId:'full-'+i,readableText:'x'.repeat(1024*1024-4096)}))},text=JSON.stringify(state)
 expect(Buffer.byteLength(text)).toBeLessThan(64*1024*1024);await writeFile(file,text);const full=new ConversationComponentStore(file);await full.load();await expect(full.create({artifact:{version:1,type:'html',title:'模拟大组件',html:'<p>'+'x'.repeat(190000)+'</p>'}},identity(),'overflow')).rejects.toThrow(/64 MiB/);expect(await readFile(file,'utf8')).toBe(text)
},10000)
it('returns a persisted duplicate receipt without rewriting the saved file',async()=>{
 const {file,store}=await fixture(),saved=await store.create(args(),identity(),'r'),{utimes}=await import('node:fs/promises'),when=new Date('2001-01-01T00:00:00Z');await utimes(file,when,when);expect(await store.create(args(),identity(),'r')).toEqual(saved);expect((await stat(file)).mtimeMs).toBe(when.getTime())
})
