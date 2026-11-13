import {expect,it} from 'vitest'
import {spreadsheetRangeCodec, collectSpreadsheetReferences} from '../scripts/lib/spreadsheet-inline-references.mjs'

const source='spreadsheet-range'
const a={sessionId:'session',bookId:'book',sheetId:'prices',sheetName:'行情',range:'B2:B7',id:'0123456789ab'}
const b={...a,sheetId:'output',sheetName:'结果',range:'D2:D7',id:'abcdef012345'}
const occurrence=(offset,data)=>({source,offset,ref:JSON.stringify(data)})

it('keeps ranges beside their instructions even if another native reference is in the draft',async()=>{
 const codec=spreadsheetRangeCodec().codec
 const [from,to]=await Promise.all([codec.serialize(JSON.stringify(a)),codec.serialize(JSON.stringify(b))])
 const snapshot={draft:'读取\uFFFC，写到\uFFFC',occurrences:[occurrence(6,b),occurrence(2,a)]}
 expect(collectSpreadsheetReferences(snapshot)).toEqual([a,b])
 expect('读取'+from+'，写到'+to).toBe('读取〔表格选区 "行情"!B2:B7 #0123456789ab〕，写到〔表格选区 "结果"!D2:D7 #abcdef012345〕')
 expect(codec.clipboardText(JSON.stringify(a))).toBe('行情!B2:B7')
 expect(collectSpreadsheetReferences({draft:'普通文字',occurrences:[occurrence(2,a)]})).toEqual([])
})
