import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect,it} from 'vitest'
import {SpreadsheetStore} from '../src/main/spreadsheet/store'
import {SpreadsheetService} from '../src/main/spreadsheet/service'
import {ClientCapabilityService} from '../src/main/state/client-capability-service'

it('uses the visible native client capability route and does not retarget selection or overwrite a concurrent save',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ework-sheet-tool-'))
 try{
  const store=new SpreadsheetStore(dir),changes:unknown[]=[]
  let writable=true,flush=async()=>{}
  const spreadsheet=new SpreadsheetService(store,{flush:(..._args)=>flush(),changed:(_,record)=>changes.push(record)})
  const client=new ClientCapabilityService({owner:()=> 'test',windowIdentity:()=>1,canRead:()=>true,canWrite:()=>writable,scheduled:()=>false,send:()=>{},canvasAvailable:()=>false,canvas:async()=>null,window:async()=>null,spreadsheet})
  const key={owner:'test',sessionId:'session'}
  client.bind({sessionId:key.sessionId,mode:'spreadsheet',active:true})
  const source={sessionId:key.sessionId,turnId:'turn',authorityId:'human',authoritySeq:1,sourceInstruction:'填写并格式化工作簿'}
  const catalog=await client.request({...source,method:'catalog'})
  expect(catalog.mode).toBe('spreadsheet')
  expect(catalog.capabilities.find((c:any)=>c.id==='spreadsheet.apply').available).toBe(true)
  const call=(capability:string,args:unknown,requestId:string)=>client.request({...source,method:'execute',call:{capability,arguments:args,requestId}})
  const created=await call('spreadsheet.apply',{revision:0,createName:'估值',operations:[{op:'write',sheetId:'sheet-1',range:'B2',cells:[[{value:42}]]}]},'create')
  expect(created).toMatchObject({status:'succeeded',data:{saved:true,revision:1}})
  spreadsheet.select(key,store.load(key).workbook!.id,{sheetId:'sheet-1',range:'B2'})
  await client.request({...source,method:'catalog'})
  spreadsheet.select(key,store.load(key).workbook!.id,{sheetId:'sheet-1',range:'C3'})
  expect(await call('spreadsheet.inspect',{scope:'selected'},'inspect')).toMatchObject({status:'succeeded',data:{range:'B2',cells:[[{value:42}]]}})
  flush=async()=>{ const current=store.load(key);current.workbook!.name='手动改名';store.save(key,current.revision,current.workbook!) }
  expect(await call('spreadsheet.apply',{revision:1,operations:[{op:'clear',sheetId:'sheet-1',range:'B2'}]},'race')).toMatchObject({status:'failed'})
  expect(store.load(key).workbook).toMatchObject({name:'手动改名',sheets:{'sheet-1':{cellData:{1:{1:{v:42}}}}}})
  expect(changes).toHaveLength(1)
  flush=async()=>{writable=false}
  expect(await call('spreadsheet.apply',{revision:2,operations:[{op:'clear',sheetId:'sheet-1',range:'B2'}]},'revoked')).toMatchObject({status:'failed'})
  expect(store.load(key).revision).toBe(2)
  writable=true;flush=async()=>{}
  spreadsheet.admit(key,'不用当前选区',store.load(key).workbook!.id,null)
  const noSelection={...source,turnId:'without-range',authorityId:'new',sourceInstruction:'不用当前选区'}
  await client.request({...noSelection,method:'catalog'})
  expect(await client.request({...noSelection,method:'execute',call:{requestId:'excluded',capability:'spreadsheet.inspect',arguments:{scope:'selected'}}})).toMatchObject({status:'failed',message:expect.stringContaining('没有引用选区')})
  client.bind({sessionId:key.sessionId,mode:'notes',active:true})
  expect((await client.request({...source,method:'catalog'})).capabilities.find((c:any)=>c.id==='spreadsheet.apply').available).toBe(false)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
