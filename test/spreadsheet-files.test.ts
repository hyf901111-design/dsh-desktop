import {describe,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {strFromU8,strToU8,unzipSync,zipSync} from 'fflate'
import {readWorkbookFile,readWorkbookPath,writeWorkbookFile} from '../src/main/spreadsheet/files'
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
 it('opens the source workbook with namespace-prefixed SpreadsheetML from the native file picker',async()=>{
  const path=fileURLToPath(new URL('./fixtures/treasury-rate-curve-december-2024.xlsx',import.meta.url))
  const book=await readWorkbookPath(path,'美国财政部曲线.xlsx','treasury')
  const [rates,source]=book.sheetOrder.map(id=>book.sheets[id]!)
  expect([rates!.name,source!.name]).toEqual(['国债日报','出处'])
  expect(Object.keys(rates!.cellData)).toHaveLength(22)
  expect(rates!.cellData[0]![3]!.v).toContain('10 年期')
  expect([1,13,14,21].map(row=>[0,1,2,3,4].map(col=>rates!.cellData[row]![col]!.v))).toEqual([
   [45628,4.17,4.08,4.19,4.36],[45644,4.35,4.40,4.50,4.65],[45645,4.32,4.43,4.57,4.74],[45657,4.25,4.38,4.58,4.78]
  ])
  expect(rates!.cellData[1]![0]).toMatchObject({s:{n:{pattern:'yyyy-mm-dd'}}})
  expect(rates!.cellData[1]![3]).toMatchObject({s:{n:{pattern:'0.00'}}})
  expect(source!.cellData[4]![1]!.v).toContain('home.treasury.gov')
  const roundtrip=await readWorkbookFile(await writeWorkbookFile(book,'xlsx',rates!.id),'新底稿.xlsx','restored')
  expect(roundtrip.sheets[roundtrip.sheetOrder[0]!]!.cellData[21]![3]!.v).toBe(4.58)
 })
 it('resolves equivalent element and relationship prefixes by namespace',async()=>{
  const file=await readFile(new URL('./fixtures/treasury-rate-curve-december-2024.xlsx',import.meta.url)),parts=unzipSync(file)
  const name='xl/workbook.xml'
  parts[name]=strToU8(strFromU8(parts[name]!).replace(/(<\/?|xmlns:)x(?=[:=])/gu,'$1ss').replace(/(xmlns:)r=|\br:id=/gu,m=>m==='r:id='?'link:id=':'xmlns:link='))
  const book=await readWorkbookFile(Buffer.from(zipSync(parts)),'债券.xlsx','tree')
  expect(book.sheetOrder.map(id=>book.sheets[id]!.name)).toEqual(['国债日报','出处'])
 })
 it('preserves quoted CSV records and neutralizes executable CSV text on export',async()=>{
  const book=await readWorkbookFile(Buffer.from('\uFEFF证券代码,名称,价格\r\n000001,"名称,一\n二",12.5\r\n=SUM(A1),"""引号""",3\r\n'),'test.csv','csv')
  expect(book.sheets['sheet-1']!.cellData).toMatchObject({1:{0:{v:'000001'},1:{v:'名称,一\n二'},2:{v:12.5}},2:{0:{v:'=SUM(A1)'},1:{v:'"引号"'}}})
  expect((await writeWorkbookFile(book,'csv','sheet-1')).toString()).toContain("'=SUM(A1)")
  await expect(readWorkbookFile(Buffer.from('a,"b'),'bad.csv','csv')).rejects.toThrow()
  await expect(readWorkbookFile(Buffer.from('not a zip'),'bad.xlsx','csv')).rejects.toThrow()
 })
})
