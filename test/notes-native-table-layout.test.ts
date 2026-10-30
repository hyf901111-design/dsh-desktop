import {expect,it} from 'vitest'
import {chooseNativeTableColumnWidths,resizeNativeTableColumnWidths} from '../src/preload/notes/native-table-layout'
it('fits eight columns to the measured content and keeps a readable native floor in a narrow note',()=>{
 expect(chooseNativeTableColumnWidths(8,789)).toEqual([99,99,99,99,99,98,98,98])
 expect(chooseNativeTableColumnWidths(8,200)).toEqual([35,35,35,35,35,35,35,35])
})
it('preserves complete existing widths without mutating their array and replaces incomplete widths',()=>{
 const old=[180,90,65];expect(chooseNativeTableColumnWidths(3,700,old)).toEqual([180,90,65]);expect(chooseNativeTableColumnWidths(3,700,old)).not.toBe(old);expect(old).toEqual([180,90,65])
 expect(chooseNativeTableColumnWidths(3,300,[120,undefined,90])).toEqual([100,100,100])
})
it.each([[0,500],[2.5,500],[2,0],[2,NaN],[2,Infinity]])('rejects invalid dimensions %s/%s without manufacturing widths',(count,width)=>expect(()=>chooseNativeTableColumnWidths(count,width)).toThrow(RangeError))
it('resizes proportionally and distributes the exact requested total above the native floor',()=>{
 expect(resizeNativeTableColumnWidths([60,120],270)).toEqual([90,180]);expect(resizeNativeTableColumnWidths([10,100,100],140)).toEqual([35,53,52]);expect(resizeNativeTableColumnWidths([100,100],20)).toEqual([35,35])
})
