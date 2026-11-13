import {describe,expect,it} from 'vitest'
import {readWorkbookFile,writeWorkbookFile} from '../src/main/spreadsheet/files'
import {applyOperations,blankWorkbook} from '../src/shared/spreadsheet/workbook'

describe('spreadsheet interchange',()=>{
 it('round trips Excel formulas, literal strings, sheets and financial formatting',async()=>{
  const book=applyOperations(blankWorkbook('book','Valuation'),[
   {op:'addSheet',sheetId:'forecast',name:'盈利预测'},
   {op:'write',sheetId:'forecast',range:'A1:C1',cells:[[{value:'=literal'},{value:125.25},{formula:'=B1/1000'}]]},
   {op:'format',sheetId:'forecast',range:'C1',format:{numberFormat:'0.00%',bold:true,color:'#92bcff'}}
  ])
  const textCell=book.sheets.forecast!.cellData[0]![0]!
  textCell.s={vt:3,ht:2}
  const file=await writeWorkbookFile(book,'xlsx','forecast')
  const imported=await readWorkbookFile(file,'valuation.xlsx','restored')
  expect(imported.sheetOrder.map(id=>imported.sheets[id]!.name)).toEqual(['Sheet1','盈利预测'])
  expect(imported.sheets[imported.sheetOrder[1]!]!.cellData[0]!).toMatchObject({0:{v:'=literal',s:{vt:3,ht:2}},1:{v:125.25},2:{f:'=B1/1000',s:{n:{pattern:'0.00%'},bl:1,cl:{rgb:'#92bcff'}}}})
 })
 it('preserves quoted CSV records and neutralizes executable CSV text on export',async()=>{
  const book=await readWorkbookFile(Buffer.from('\uFEFF证券代码,名称,价格\r\n000001,"名称,一\n二",12.5\r\n=SUM(A1),"""引号""",3\r\n'),'test.csv','csv')
  expect(book.sheets['sheet-1']!.cellData).toMatchObject({1:{0:{v:'000001'},1:{v:'名称,一\n二'},2:{v:12.5}},2:{0:{v:'=SUM(A1)'},1:{v:'"引号"'}}})
  expect((await writeWorkbookFile(book,'csv','sheet-1')).toString()).toContain("'=SUM(A1)")
  await expect(readWorkbookFile(Buffer.from('a,"b'),'bad.csv','csv')).rejects.toThrow()
  await expect(readWorkbookFile(Buffer.from('not a zip'),'bad.xlsx','csv')).rejects.toThrow()
 })
})
