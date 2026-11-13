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
  const spreadsheet=new SpreadsheetService(store,{flush:(..._args)=>flush(),changed:(_,record,position)=>changes.push({record,position})})
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
  const withRef={...source,turnId:'selection-turn',authorityId:'selection-user',sourceInstruction:'填写〔表格选区 "Sheet1"!B2 #f0123456789a〕'}
  spreadsheet.admit(key,withRef.sourceInstruction,store.load(key).workbook!.id,[{sessionId:key.sessionId,bookId:store.load(key).workbook!.id,sheetName:'Sheet1',sheetId:'sheet-1',range:'B2',id:'f0123456789a'}])
  await client.request({...withRef,method:'catalog'})
  expect(await client.request({...withRef,method:'execute',call:{requestId:'inspect',capability:'spreadsheet.inspect',arguments:{scope:'selected'}}})).toMatchObject({status:'succeeded',data:{range:'B2',cells:[[{value:42}]]}})
  flush=async()=>{ const current=store.load(key);current.workbook!.name='手动改名';store.save(key,current.revision,current.workbook!) }
  expect(await call('spreadsheet.apply',{revision:1,operations:[{op:'clear',sheetId:'sheet-1',range:'B2'}]},'race')).toMatchObject({status:'failed'})
  expect(store.load(key).workbook).toMatchObject({name:'手动改名',sheets:{'sheet-1':{cellData:{1:{1:{v:42}}}}}})
  expect(changes).toMatchObject([{record:{revision:1},position:{sheetId:'sheet-1',range:'B2'}}])
  flush=async()=>{writable=false}
  expect(await call('spreadsheet.apply',{revision:2,operations:[{op:'clear',sheetId:'sheet-1',range:'B2'}]},'revoked')).toMatchObject({status:'failed'})
  expect(store.load(key).revision).toBe(2)
  writable=true;flush=async()=>{}
  spreadsheet.admit(key,'不用当前选区',store.load(key).workbook!.id,[])
  const noSelection={...source,turnId:'without-range',authorityId:'new',sourceInstruction:'不用当前选区'}
  await client.request({...noSelection,method:'catalog'})
  expect(await client.request({...noSelection,method:'execute',call:{requestId:'excluded',capability:'spreadsheet.inspect',arguments:{scope:'selected'}}})).toMatchObject({status:'failed',message:expect.stringContaining('没有引用选区')})
  client.bind({sessionId:key.sessionId,mode:'notes',active:true})
  expect((await client.request({...source,method:'catalog'})).capabilities.find((c:any)=>c.id==='spreadsheet.apply').available).toBe(false)
 }finally{rmSync(dir,{recursive:true,force:true})}
})

it('binds two native inline references in submitted order, even after the live selection moves',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ework-sheet-refs-'))
 try{
  const store=new SpreadsheetStore(dir),key={owner:'test',sessionId:'session'}
  const spreadsheet=new SpreadsheetService(store,{flush:async()=>{},changed:()=>{}})
  const acquire=(instruction:string)=>spreadsheet.acquire({key,turnId:instruction,instruction,current:()=>true,canWrite:()=>true})
  const context={} as any
  const blank=await acquire('创建')
  await blank.handlers.applySpreadsheet({revision:0,createName:'估值',operations:[{op:'write',sheetId:'sheet-1',range:'B2:B3',cells:[[{value:20}],[{value:40}]]}]},context)
  const bookId=store.load(key).workbook!.id
  const a={sessionId:key.sessionId,bookId,sheetId:'sheet-1',sheetName:'Sheet1',range:'B2:B3',id:'0123456789ab'}
  const b={...a,range:'D2:D3',id:'abcdef012345'}
  const instruction='读取〔表格选区 "Sheet1"!B2:B3 #0123456789ab〕，写到〔表格选区 "Sheet1"!D2:D3 #abcdef012345〕'
  spreadsheet.admit(key,instruction,bookId,[a,b])
  spreadsheet.admit(key,'另一条消息',bookId,[])
  const lease=await acquire(instruction)
  await expect(lease.handlers.inspectSpreadsheet({scope:'selected'},context)).rejects.toThrow('多个')
  await expect(lease.handlers.inspectSpreadsheet({scope:'workbook'},context)).resolves.toMatchObject({data:{references:[{index:1,range:'B2:B3',offset:2},{index:2,range:'D2:D3',offset:instruction.indexOf('〔',3)}]}})
  await expect(lease.handlers.inspectSpreadsheet({scope:'reference',referenceIndex:1},context)).resolves.toMatchObject({data:{range:'B2:B3',cells:[[{value:20}],[{value:40}]]}})
  expect(()=>spreadsheet.admit(key,instruction,bookId,[{...a,bookId:'foreign'},b])).toThrow('工作簿')
  const spoof=await acquire(instruction+'。')
  await expect(spoof.handlers.inspectSpreadsheet({scope:'reference',referenceIndex:1},context)).rejects.toThrow('引用')
 }finally{rmSync(dir,{recursive:true,force:true})}
})
