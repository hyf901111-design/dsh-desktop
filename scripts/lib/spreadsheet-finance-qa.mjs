// Synthetic cases for the isolated native composer acceptance. The formulas
// are fixture tool responses; expected answers are computed independently.
const write=(sheetId,range,rows)=>({op:'write',sheetId,range,cells:rows.map(row=>row.map(v=>typeof v==='string'&&v.startsWith('=')?{formula:v}:{value:v}))})
const format=(sheetId,range,numberFormat)=>({op:'format',sheetId,range,format:{numberFormat}})
const width=(sheetId,range,width)=>({op:'setColumnWidth',sheetId,range,width})
const addSheet=(sheetId,name)=>({op:'addSheet',sheetId,name})
export const financeCases=[
 {
  key:'估值验收',source:'用明确标注的演示数据搭一个消费行业可比公司估值表。按企业价值／EBITDA、净利率计算两家公司，保留公式，并增加数据来源工作表。',
  prepare:({revision})=>({revision,createName:'演示 · 消费行业估值',operations:[
   {op:'renameSheet',sheetId:'sheet-1',name:'可比估值'},addSheet('source','数据来源'),
   write('sheet-1','A1:H3',[
    ['公司（演示）','市值','有息债务','现金','EBITDA','企业价值 / EBITDA','营收','净利率'],
    ['甲公司',160,40,20,30,'=IFERROR((B2+C2-D2)/E2,0)',150,"='数据来源'!B2/G2"],
    ['乙公司',120,30,10,20,'=IFERROR((B3+C3-D3)/E3,0)',100,"='数据来源'!B3/G3"]
   ]),
   write('source','A1:C3',[['公司','净利润','数据来源'],['甲公司',24,'演示假设，单位：亿元'],['乙公司',18,'演示假设，单位：亿元']]),
   format('sheet-1','F2:F3','0.00"x"'),format('sheet-1','H2:H3','0.00%'),width('sheet-1','F1',160),width('source','C1',180)
  ]}),checks:[['sheet-1','F2',6],['sheet-1','F3',7],['sheet-1','H2',24/150],['sheet-1','H3',18/100]]
 },
 {
  key:'行情验收',source:'以这里的收盘价为输入，计算逐日收益率；写到这里，只改目标区域，首日留空并使用百分比格式。',
  prepare:({revision,references},inputs)=>{
   const [src,dst]=references
   if(inputs[0]?.cells[0][0].value!==100||inputs[1]?.cells.some(row=>row[0].value!==null))throw Error('验收区域与原话顺序不符')
   return {revision,operations:[write(dst.sheetId,dst.range,[[null],...inputs[0].cells.slice(1).map((row,i)=>['='+row[0].address+'/'+inputs[0].cells[i][0].address+'-1'])]),format(dst.sheetId,dst.range,'0.00%')]}
  },checks:[['sheet-1','D3',110/100-1],['sheet-1','D4',99/110-1],['sheet-1','D5',118.8/99-1]]
 },
 {
  key:'现金流验收',source:'用演示数据制作现金流折现，期初投资 100，三期现金流分别为 40、50、60，折现率 10%。把输入和计算分两张表，给出 NPV、IRR。',
  prepare:({revision})=>({revision,createName:'演示 · 现金流折现',operations:[
   {op:'renameSheet',sheetId:'sheet-1',name:'假设'},addSheet('valuation','折现结果'),
   write('sheet-1','A1:B6',[['演示假设','金额'],['折现率',0.1],['期初',-100],['第 1 期',40],['第 2 期',50],['第 3 期',60]]),
   write('valuation','A1:B3',[['指标','结果'],['净现值',"='假设'!B3+NPV('假设'!B2,'假设'!B4:B6)"],['内部收益率',"=IRR('假设'!B3:B6)"]]),
   format('valuation','B2','#,##0.00'),format('valuation','B3','0.00%')
  ]}),checks:[['valuation','B2',-100+40/1.1+50/1.1**2+60/1.1**3],['valuation','B3',0.2164778541841076]]
 }
]
