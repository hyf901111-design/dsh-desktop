import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {renderCartesianChart} from '../packages/dsh-research-task-runtime/cartesian-chart-artifact.js'
import {chartDataIssue} from '../packages/dsh-research-task-runtime/chart-template-contract.js'
const sample=()=>({version:1,type:'chart',variant:'line',title:'存量精度回归',unit:'亿元',labels:['A','B'],series:[{name:'数值',values:[92.243,262.89]}]})
it('rejects invalid optional axis decimals instead of accepting an unknown formatter',()=>{
 for(const axisDecimals of [-1,5,1.1,'2',null])expect(chartDataIssue({...sample(),axisDecimals})).toContain('axisDecimals')
 for(const axisDecimals of [0,1,2,3,4])expect(chartDataIssue({...sample(),axisDecimals})).toBeNull()
})
it('keeps existing default artifacts byte identical while explicitly serializing the new precision wrapper',()=>{
 const original=renderCartesianChart(sample()),precise=renderCartesianChart({...sample(),axisDecimals:2})
 expect(createHash('sha256').update(original.html).digest('hex')).toBe('73d67058c304c03fe20db24dfbb4a3f27cf002fe452765be90ebc6d535b2c34e')
 expect(precise).toBeDefined();expect(precise.html).toContain('cartesianChartAxisPrecision');expect(original.html).not.toContain('cartesianChartAxisPrecision')
 expect(precise.html).not.toContain('>262.89%<')
})

it('honors an explicit precision opt-in even on a short chart without other metadata',()=>{expect(renderCartesianChart({version:1,type:'chart',variant:'line',title:'精度',axisDecimals:2,labels:['A','B'],series:[{name:'值',values:[1,2]}]})?.html).toContain('preciseCartesianChart')})
