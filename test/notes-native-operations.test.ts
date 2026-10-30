// @vitest-environment happy-dom
import {expect,it} from 'vitest'
import {nativeBlankTableIntent,nativeBlankTable} from '../src/preload/notes/native-operations'
it.each(['创建一个8乘8的表格','请帮我创建8×8空白表格。','插入一张8x8表格','生成8X8的空表格','做一个8*8表格吧！'])('recognizes only the complete unambiguous empty table structure: %s',prompt=>{
 expect(nativeBlankTableIntent(prompt)).toEqual({rows:8,columns:8})
})
it.each(['创建一个3乘3的表格','请创建一个3乘3的原生表格。','麻烦你帮我插入一张原生可编辑3×3空白表格，谢谢','请帮我新建一个可编辑的3乘以3表格'])('recognizes the actual three-by-three request and empty native/editable modifiers: %s',prompt=>{
 expect(nativeBlankTableIntent(prompt)).toEqual({rows:3,columns:3})
})
it.each(['创建8×8表格，填入上文收入数据','创建一个8乘8的表格并分析','不要创建8×8表格','创建8×8表格，第一行写标题','创建一个3乘3的可编辑表格，填入上文数据','修改一个3乘3的原生表格','创建0×8表格','创建8×0表格','创建900000×900000表格','创建8.5×8表格','做一个交互图表','将这份8×8表格改成10×10'])('leaves other legitimate needs on the ordinary planner: %s',prompt=>{
 expect(nativeBlankTableIntent(prompt)).toBeUndefined()
})
it('keeps attached evidence out of the empty-table shortcut and constructs exactly sixty-four empty editable cells',()=>{
 expect(nativeBlankTableIntent('创建8×8表格',[{id:'attachment'}])).toBeUndefined()
 const table=nativeBlankTable(8,8,789)
 expect(table.type).toBe('table');expect(table.content.headerRows).toBe(0)
 expect(table.content.rows).toHaveLength(8);expect(table.content.rows.flatMap(row=>row.cells)).toEqual(Array(64).fill(''))
 expect(table.content.columnWidths.reduce((sum,width)=>sum+width,0)).toBe(789)
})
