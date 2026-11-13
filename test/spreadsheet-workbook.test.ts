import { describe, expect, it } from 'vitest'
import { blankWorkbook, parseRange, address, applyOperations, inspectWorkbook, type Workbook } from '../src/shared/spreadsheet/workbook'

describe('spreadsheet workbook protocol', () => {
  it('normalizes absolute A1 ranges, rejects invalid or oversized selections', () => {
    expect(parseRange('$AA$4:ab7')).toEqual({r0:3,c0:26,r1:6,c1:27})
    expect(address(6,27)).toBe('AB7')
    for (const invalid of ['A0', 'B2:A1', 'Other!A1', 'A1:XFD1048576', 'A1,A2']) expect(() => parseRange(invalid)).toThrow()
  })
  it('creates sheets and applies values, formulas and formats without replacing neighboring cells', () => {
    const original = blankWorkbook('work', '财务分析', 'income')
    const work = applyOperations(original, [
      {op:'write',sheetId:'income',range:'A1:B2',cells:[[{value:'收入'},{value:'利润'}],[{value:120},{value:30}]]},
      {op:'addSheet',sheetId:'rates',name:'利润率'},
      {op:'write',sheetId:'rates',range:'A1',cells:[[{formula:"='Sheet1'!B2/'Sheet1'!A2"}]]},
      {op:'format',sheetId:'rates',range:'A1',format:{numberFormat:'0.00%',bold:true}}
    ])
    expect(original.sheets.income!.cellData).toEqual({})
    expect(inspectWorkbook(work, 'rates', 'A1').cells[0]![0]!).toMatchObject({formula:"='Sheet1'!B2/'Sheet1'!A2",format:{numberFormat:'0.00%',bold:true}})
    expect(inspectWorkbook(work,'income','B2').cells[0]![0]!.value).toBe(30)
  })
  it('allows the agent to size the analysis columns without changing neighboring metadata', () => {
    const original=blankWorkbook('work','估值','income')
    original.sheets.income!.columnData={2:{w:104,hd:1},5:{w:80}}
    const work=applyOperations(original,[{op:'setColumnWidth',sheetId:'income',range:'C1:D1',width:176}])
    expect(work.sheets.income!.columnData).toEqual({2:{w:176,hd:1},3:{w:176},5:{w:80}})
    expect(original.sheets.income!.columnData[2]!.w).toBe(104)
    expect(()=>applyOperations(original,[{op:'setColumnWidth',sheetId:'income',range:'C1:D1',width:0}])).toThrow()
  })
  it('rejects a whole batch if a cell targets a missing sheet or contains an external formula', () => {
    const work = blankWorkbook('work','工作簿','income')
    const write = {op:'write',sheetId:'income',range:'A1',cells:[[{value:120}]]} as const
    for (const bad of [
      {...write, sheetId:'other'},
      {...write, cells:[[{formula:'=WEBSERVICE("https://example.com")'}]]},
      {...write, cells:[[{formula:"='[private.xlsx]Sheet1'!A1"}]]},
      {...write, cells:[[{value:1, formula:'=1'}]]},
      {...write, range:'A1:B2'},
      {op:'format', sheetId:'income', range:'A1', format:{unexpected:'x'}},
    ]) expect(() => applyOperations(work,[write,bad])).toThrow()
    expect(work.sheets.income!.cellData).toEqual({})
  })
  it('clears contents independently of formatting', () => {
    const work = applyOperations(blankWorkbook('work','账','income'), [
      {op:'write',sheetId:'income',range:'A1',cells:[[{value:42}]]},
      {op:'format',sheetId:'income',range:'A1',format:{bold:true}},
      {op:'clear',sheetId:'income',range:'A1'}
    ])
    expect(inspectWorkbook(work,'income','A1').cells[0]![0]!).toMatchObject({value:null,format:{bold:true}})
  })
  it('does not accept prototype keys or bounds that exceed the worksheet', () => {
    const work: Workbook = blankWorkbook('work','账','income')
    expect(() => applyOperations(work,[{op:'addSheet',sheetId:'__proto__',name:'污染'}])).toThrow()
    expect(() => inspectWorkbook(work,'income','A10000')).toThrow()
  })
})
