import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {compileComponentContent} from '../packages/dsh-research-task-runtime/component-content.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

const captured = JSON.parse(readFileSync(new URL('./fixtures/workbench-ecb-currency-content.json',import.meta.url),'utf8'))
const retained = data => readTemplateModel(JSON.parse(acceptArtifactOutput(JSON.stringify(data)))).data
const plan = (panels,originalRequest) => validateWorkbench({requestId:'metric-views',title:'市场研究',panels,originalRequest})
const ranked = {
 title:'品种涨跌幅排名',columns:[{key:'name',label:'品种'},{key:'change',label:'涨跌幅（%）'},{key:'price',label:'结算价（元/吨）'}],
 rows:[{name:'铜',change:-1.2,price:85320,note:null,verified:false},{name:'铝',change:0,price:20100,note:'持平'},
  {name:'锌',change:2.4,price:23260,note:'盘后结算'}],sources:[{label:'来源交易日报'}],
}
const daily = {title:'结算价走势',columns:[{key:'date',label:'交易日'},{key:'price',label:'结算价（元/吨）'}],
 rows:[{date:'20261117',price:3},{date:'20261113',price:0},{date:'20261116',price:-1}]}

it('turns the captured five-day ECB table into a single USD/CNY line with its full exchange-rate evidence',()=>{
 const before = structuredClone(captured)
 const result = plan([captured],'观察美元与人民币汇率的变化')
 const {artifact} = result.panels[0], {content} = captured
 expect(captured).toEqual(before)
 expect(artifact).toMatchObject({type:'chart',variant:'line',labels:content.rows.map(row => row.date),
  unit:'CNY per USD',series:[{name:'USD/CNY（同日推算）',values:[6.6707,6.6683,6.6719,6.6665,6.6661]}],
  detailColumns:[...content.columns.map(col => col.label),'id'],detailRows:content.rows.map(row => [row.date,row.eurusd,row.eurcny,row.usdcny,row.id]),
  sources:content.sources,body:content.body,note:content.note,asOf:content.asOf})
 expect(retained(artifact)).toEqual(artifact)
 expect(validateWorkbench(result)).toEqual(result)
})

it('compares one real measure for the same categories and reorders the entire detail row with it',()=>{
 const before = structuredClone(ranked)
 const data = retained(compileComponentContent(ranked).data)
 expect(data).toMatchObject({variant:'horizontal',unit:'%',labels:['锌','铝','铜'],series:[{name:'涨跌幅（%）',values:[2.4,0,-1.2]}],
  detailRows:[['锌',2.4,23260,'盘后结算',null],['铝',0,20100,'持平',null],['铜',-1.2,85320,null,false]],sources:ranked.sources})
 expect(compileComponentContent(ranked,{panelRequest:'按涨跌幅由低到高排列。'}).data.labels).toEqual(['铜','铝','锌'])
 expect(ranked).toEqual(before)
})

it('orders actual daily observations including zero, and overlays only measures with the same declared units',()=>{
 expect(compileComponentContent(daily).data).toMatchObject({variant:'line',unit:'元/吨',labels:['20261113','20261116','20261117'],series:[{values:[0,-1,3]}]})
 const quarterly={title:'季度收入趋势',rows:[{quarter:'2026Q3',a:5,b:6},{quarter:'2026Q1',a:1,b:2},{quarter:'2026Q2',a:3,b:4}],
  columns:[{key:'a',label:'甲产品（亿元）'},{key:'b',label:'乙产品（亿元）'}]}
 expect(compileComponentContent(quarterly).data).toMatchObject({variant:'line',unit:'亿元',labels:['2026Q1','2026Q2','2026Q3'],series:[{values:[1,3,5]},{values:[2,4,6]}]})
})

it('respects table-only instructions at the panel and board level without applying a named restriction to other cards',()=>{
 const fx = structuredClone(captured)
 fx.content.visualization={kind:'line',label:'date',values:['usdcny']}
 expect(plan([fx],'只要表格').panels[0].type).toBe('table')
 expect(compileComponentContent(ranked,{panelRequest:'Only a table, please.'}).data.type).toBe('table')
 const panels = [{title:'结算价走势',type:'table',content:daily},{title:'品种涨跌幅排名',type:'table',content:ranked}]
 expect(plan(panels,'「结算价走势」只要表格；「品种涨跌幅排名」用于比较品种。').panels.map(panel => panel.type)).toEqual(['table','chart'])
 expect(plan(panels,'整个工作台仅显示完整数据表。').panels.map(panel => panel.type)).toEqual(['table','table'])
})

it.each([
 ['one category',{...ranked,rows:ranked.rows.slice(0,1)}],
 ['two dates',{...daily,rows:daily.rows.slice(0,2)}],
 ['a missing observation',{...daily,rows:daily.rows.map((row,i)=>i===1?{...row,price:null}:row)}],
 ['an absent target with valid ancillary numbers',{...daily,rows:daily.rows.map((row,i)=>({...row,price:null,volume:i+15}))}],
 ['an unlabelled missing measure next to a complete auxiliary measure',{title:'价格走势',rows:daily.rows.map((row,i)=>({date:row.date,price:null,volume:i+15}))}],
 ['numeric text in the target',{...daily,rows:daily.rows.map((row,i)=>({...row,price:String(row.price),volume:i+15}))}],
 ['duplicate dates',{...daily,rows:daily.rows.map((row,i)=>i===1?{...row,date:daily.rows[0].date}:row)}],
 ['invalid dates',{...daily,rows:daily.rows.map((row,i)=>i===1?{...row,date:'20260231'}:row)}],
 ['mixed subjects on different dates',{...daily,rows:daily.rows.map((row,i)=>({...row,symbol:['cu','al','zn'][i]}))}],
 ['different row currencies',{...ranked,rows:ranked.rows.map((row,i)=>({...row,unit:['人民币','美元','人民币'][i]}))}],
 ['ambiguous cross-unit comparison',{...ranked,title:'品种比较'}],
 ['explicit incompatible measures',{...ranked,visualization:{kind:'horizontal',label:'name',values:['price','change'],unit:'%'}}],
 ['a directory with numeric contract sizes',{title:'品种合约速查',rows:[{name:'铜',lotSize:5},{name:'铝',lotSize:5}]}],
])('keeps all rows as a table for %s',(_scenario,content)=>{
 const data=compileComponentContent(content).data
 expect(data.type).toBe('table')
 expect(data.rows).toHaveLength(content.rows.length)
 if (content.rows.some(row=>row.price===null)) expect(data.rows.some(row=>row.includes('—'))).toBe(true)
})
