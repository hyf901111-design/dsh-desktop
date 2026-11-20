import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SpreadsheetStore } from '../src/main/spreadsheet/store'
import { blankWorkbook, inspectWorkbook } from '../src/shared/spreadsheet/workbook'

const roots:string[]=[]
function open(){const root=mkdtempSync(join(tmpdir(),'ework-sheet-test-'));roots.push(root);return {root,store:new SpreadsheetStore(root)}}
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
describe('local spreadsheet persistence and concurrent edits',()=>{
 it('reports persistence after the workbook exists and skips empty loads or rejected writes',()=>{
  const {root}=open(),key={owner:'account',sessionId:'provisional'},notifications:number[]=[]
  const store=new SpreadsheetStore(root,saved=>notifications.push(new SpreadsheetStore(root).load(saved).revision))
  expect(store.load(key)).toEqual({revision:0,workbook:null})
  expect(()=>store.create(key,1,blankWorkbook('book'))).toThrow()
  expect(notifications).toEqual([])
  store.create(key,0,blankWorkbook('book'))
  expect(notifications).toEqual([1])
 })
 it('persists AI changes atomically, replaying the same action without duplicate effects',()=>{
  const {root,store}=open(), key={owner:'a',sessionId:'b'}
  const init=store.create(key,0,blankWorkbook('book'))
  const edit={revision:init.revision,operations:[{op:'write',sheetId:'sheet-1',range:'A1',cells:[[{value:45}]]}]}
  const applied=store.apply(key,'turn:request',edit)
  expect(new SpreadsheetStore(root).apply(key,'turn:request',edit)).toEqual(applied)
  expect(inspectWorkbook(new SpreadsheetStore(root).load(key).workbook!,'sheet-1','A1').cells[0]![0]!.value).toBe(45)
  expect(()=>store.apply(key,'turn:request',{...edit,operations:[{op:'clear',sheetId:'sheet-1',range:'A1'}]})).toThrow()
 })
 it('rejects stale writes and preserves a manual edit on the same cell',()=>{
  const {store}=open(),key={owner:'a',sessionId:'b'}
  const init=store.create(key,0,blankWorkbook('book'))
  const applied=store.apply(key,'t:1',{revision:init.revision,operations:[{op:'write',sheetId:'sheet-1',range:'A1',cells:[[{value:45}]]}]})
  const manual=structuredClone(applied.workbook!)
  manual.sheets['sheet-1']!.cellData[0]![0]!.v=60
  const saved=store.save(key,applied.revision,manual)
  expect(()=>store.undo(key,'t:2',{revision:saved.revision,actionId:'t:1'})).toThrow()
  expect(()=>store.save(key,init.revision,manual)).toThrow()
  expect(store.load(key).workbook?.sheets['sheet-1']!.cellData[0]![0]!.v).toBe(60)
 })
 it('undoes the confirmed latest edit and isolates account and session history',()=>{
  const {store}=open(),key={owner:'a',sessionId:'b'}
  const init=store.create(key,0,blankWorkbook('book'))
  const applied=store.apply(key,'t:1',{revision:init.revision,operations:[{op:'renameWorkbook',name:'AI 估值表'}]})
  const undone=store.undo(key,'t:2',{revision:applied.revision,actionId:'t:1'})
  expect(undone.workbook?.name).toBe(init.workbook?.name)
  expect(undone.revision).toBeGreaterThan(applied.revision)
  expect(store.load({...key,owner:'c'})).toMatchObject({workbook:null,revision:0})
  expect(store.load({...key,sessionId:'../b'})).toMatchObject({workbook:null,revision:0})
 })
})

it('retains the AI undo and revision when Univer later refreshes formula caches',()=>{
 const {store}=open(),key={owner:'a',sessionId:'formula-undo'}
 const base=store.create(key,0,blankWorkbook('formula'))
 const applied=store.apply(key,'new-formula',{revision:base.revision,operations:[{op:'write',sheetId:'sheet-1',range:'A1',cells:[[{formula:'=20+22'}]]}]})
 const computed=structuredClone(applied.workbook!)
 computed.sheets['sheet-1']!.cellData[0]![0]!.v=42
 computed.sheets['sheet-1']!.cellData[0]![0]!.t=2
 const updated=store.refreshCalculations(key,applied.revision,computed)
 expect(updated).toMatchObject({revision:applied.revision,lastAction:'new-formula'})
 expect(updated.workbook!.sheets['sheet-1']!.cellData[0]![0]).toMatchObject({v:42,f:'=20+22'})
 const undone=store.undo(key,'undo-formula',{revision:updated.revision,actionId:'new-formula'})
 expect(undone).toMatchObject({workbook:base.workbook,canRedoAI:true})
 expect(store.redo(key,undone.revision)).toMatchObject({lastAction:'new-formula',workbook:updated.workbook})
})

it('keeps the revision when a tool writes the same calculated formula',()=>{
 const {store}=open(),key={owner:'a',sessionId:'no-op'}
 const book=blankWorkbook('book')
 book.sheets['sheet-1']!.cellData[0]={0:{f:'=1+2',v:3,t:2}}
 const original=store.create(key,0,book)
 const result=store.apply(key,'same',{revision:original.revision,operations:[
  {op:'write',sheetId:'sheet-1',range:'A1',cells:[[{formula:'=1+2'}]]}
 ]})
 expect(result).toEqual(original)
})
