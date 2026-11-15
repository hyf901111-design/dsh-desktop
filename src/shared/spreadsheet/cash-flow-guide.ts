import { buildCashFlowGuideHtml, type CashFlowGuideLocale } from './cash-flow-guide-component'
import { applyOperations, blankWorkbook, inspectWorkbook, type InputCell, type Operation, type Workbook, type WorkbookComponent } from './workbook'

export const CASH_FLOW_GUIDE_SOURCE = {sheetId:'sheet-1',range:'A1:F26'} as const
export const CASH_FLOW_GUIDE_TREND = {sheetId:'cash-flow-analysis',range:'A1:C5'} as const
export const CASH_FLOW_GUIDE_ANALYSIS = {sheetId:CASH_FLOW_GUIDE_TREND.sheetId,range:'A8:H32'} as const
export const CASH_FLOW_GUIDE_ADJUSTMENTS = {sheetId:CASH_FLOW_GUIDE_ANALYSIS.sheetId,range:'A35:E41'} as const

const sourceAdjustments = 'A29:D33'
const chartId = 'cash-flow-guide-trend'
const componentId = 'cash-flow-guide-bridge'
const periods = ['2024Q4','2025Q1','2025Q2','2025Q3','2025Q4','2026Q1','2026Q2','2026Q3']
const samples = [
  [[16.4,1.72,1.79],[17.4,1.80,1.90],[18.8,1.91,1.99],[20,2,2],[18.5,1.96,2.10],[20.1,2.09,2.13],[21.7,2.30,2.07],[24,2.50,1.60]],
  [[14.3,1.21,1.46],[15.1,1.29,1.32],[15.7,1.44,1.56],[16.5,1.51,1.53],[15.8,1.37,1.54],[16.9,1.48,1.61],[17.8,1.54,1.77],[18.4,1.68,1.83]],
  [[11.2,1.03,1.25],[12.0,1.14,1.37],[12.8,1.26,1.51],[13.1,1.25,1.59],[12.3,1.18,1.43],[12.9,1.20,1.48],[13.5,1.33,1.53],[14.0,1.43,1.66]],
] as const
const copy = {
  zh:{
    title:'利润涨了，现金去哪了？（演示案例）', source:'原始数据', analysis:'季度分析',
    companies:['澄川制造','启衡制造','川岳装备'],
    columns:['公司','季度','营业收入','净利润','经营现金流'], units:'亿元',
    provenance:'数据来源', sample:'虚构演示样本',
    derived:['现金转化率','净利润同比','经营现金流同比'],
    chart:'澄川制造 · 利润与经营现金流同比', chartUnit:'同比（%）',
    adjustments:['现金流调整项','影响（亿元）','明细一（亿元）','明细二（亿元）','明细口径'],
    cashItems:['净利润','折旧及摊销','应收增加','存货增加','其他调整','经营现金流'],
    details:[['设备折旧','其他摊销'],['经销渠道','直营渠道'],['原材料','产成品'],['应付项目增加']],
    component:'现金流拆解台',
  },
  en:{
    title:'Profit Rose. Where Did the Cash Go? (Demo)', source:'Raw Data', analysis:'Quarterly Analysis',
    companies:['Chengchuan Manufacturing','Qiheng Manufacturing','Chuanyue Equipment'],
    columns:['Company','Quarter','Revenue','Net profit','Operating cash flow'], units:'CNY 100m',
    provenance:'Data source', sample:'Fictional demo data',
    derived:['Cash conversion','Net profit YoY','Operating cash flow YoY'],
    chart:'Chengchuan Manufacturing · Profit vs. Operating Cash Flow', chartUnit:'YoY (%)',
    adjustments:['Cash flow adjustment','Impact (CNY 100m)','Detail 1 (CNY 100m)','Detail 2 (CNY 100m)','Breakdown'],
    cashItems:['Net profit','Depreciation & amortization','Receivables increase','Inventory increase','Other adjustments','Operating cash flow'],
    details:[['Equipment depreciation','Other amortization'],['Distributors','Direct sales'],['Raw materials','Finished goods'],['Increase in payables']],
    component:'Cash Flow Bridge',
  },
} as const

const primaryHeader = {bold:true,background:'#dce9fa',color:'#223d63'} as const
const highlight = {bold:true,background:'#fff0dc',color:'#803a18'} as const
const adjustments = [[0.24,0.06],[-0.52,-0.28],[-0.18,-0.32],[0.1,null]] as const
const formula = (formula:string):InputCell => ({formula})
const sourceRef = (name:string,cell:string) => "'" + name + "'!" + cell
const finite = (value:unknown):value is number => typeof value==='number'&&Number.isFinite(value)

export function createCashFlowGuideWorkbook(id:string,locale:CashFlowGuideLocale='zh'):Workbook {
  const labels=copy[locale]
  const sheetId=CASH_FLOW_GUIDE_SOURCE.sheetId
  const records=samples.flatMap((company,index)=>company.map((values,period)=>[
    labels.companies[index]!,periods[period]!,...values,labels.sample
  ]))
  const rows=[
    [...labels.columns.map((name,index)=>index<2?name:name+' ('+labels.units+')'),labels.provenance],
    ...records,
    records[periods.length-1]!,
  ]
  return applyOperations(blankWorkbook(id,labels.title,sheetId),[
    {op:'renameSheet',sheetId,name:labels.source},
    {op:'write',...CASH_FLOW_GUIDE_SOURCE,cells:rows},
    {op:'write',sheetId,range:sourceAdjustments,cells:[
      [labels.adjustments[0],...labels.adjustments.slice(2)],
      ...adjustments.map(([first,second],index)=>[
        labels.cashItems[index+1]!,first,second,labels.details[index]!.join(' / ')
      ]),
    ]},
    {op:'format',sheetId,range:'A1:F1',format:primaryHeader},
    {op:'format',sheetId,range:'C2:E26',format:{numberFormat:'0.00'}},
    {op:'format',sheetId,range:'A29:D29',format:primaryHeader},
    {op:'format',sheetId,range:'B30:C33',format:{numberFormat:'0.00'}},
    {op:'setColumnWidth',sheetId,range:'A1',width:locale==='zh'?124:192},
    {op:'setColumnWidth',sheetId,range:'B1',width:84},
    {op:'setColumnWidth',sheetId,range:'C1:F1',width:locale==='zh'?128:176},
  ])
}

export function cashFlowGuideAnalysisOperations(workbook:Workbook,locale:CashFlowGuideLocale='zh'):Operation[] {
  const labels=copy[locale]
  const sheetId=CASH_FLOW_GUIDE_ANALYSIS.sheetId
  const source=inspectWorkbook(workbook,CASH_FLOW_GUIDE_SOURCE.sheetId,CASH_FLOW_GUIDE_SOURCE.range)
  const sourceName=workbook.sheets[source.sheetId]!.name
  const retained=new Map<string,number>()
  for(const [index,row] of source.cells.slice(1).entries()){
    const [company,quarter,revenue,profit,cash]=row.map(cell=>cell.value)
    if(typeof company!=='string'||typeof quarter!=='string'||![revenue,profit,cash].every(finite))continue
    const key=company+'|'+quarter
    if(!retained.has(key))retained.set(key,index+2)
  }
  const analysis=labels.companies.flatMap((company,companyIndex)=>periods.map((period,index)=>{
    const original=retained.get(company+'|'+period)
    if(original===undefined)throw Error('演示数据不完整，请重新打开用例。')
    const row=9+companyIndex*periods.length+index
    const yearAgo=row-4
    return [
      company,period,...['C','D','E'].map(col=>formula('='+sourceRef(sourceName,col+original))),
      formula('=IFERROR(E'+row+'/D'+row+',"")'),
      index<4?null:formula('=IFERROR(D'+row+'/D'+yearAgo+'-1,"")'),
      index<4?null:formula('=IFERROR(E'+row+'/E'+yearAgo+'-1,"")'),
    ]
  }))
  const focusRecord=retained.get(labels.companies[0]+'|2026Q3')!
  const focus=source.cells[focusRecord-1]!
  const detail=inspectWorkbook(workbook,source.sheetId,sourceAdjustments).cells.slice(1)
  // The materialized bridge rows are the precise source snapshot given to the
  // HTML component. The analysis and trend above retain native sheet formulas.
  return [
    {op:'addSheet',sheetId,name:labels.analysis},
    {op:'write',...CASH_FLOW_GUIDE_ANALYSIS,cells:[
      [...labels.columns.map((name,index)=>index<2?name:name+' ('+labels.units+')'),...labels.derived],...analysis
    ]},
    {op:'write',...CASH_FLOW_GUIDE_TREND,cells:[
      [labels.columns[1],...labels.derived.slice(1)],
      ...periods.slice(-4).map((period,index)=>[
        period,formula('=ROUND(G'+(index+13)+'*100,1)'),formula('=ROUND(H'+(index+13)+'*100,1)'),
      ]),
    ]},
    {op:'write',...CASH_FLOW_GUIDE_ADJUSTMENTS,cells:[
      [...labels.adjustments],
      [labels.cashItems[0],focus[3]!.value],
      ...detail.map(([name,first,second,caption])=>{
        const left=first!.value,right=second!.value
        if(!finite(left)||right!==null&&!finite(right))throw Error('现金流调整明细不完整，请重新打开用例。')
        const amount=Math.round((left+(right??0))*100)/100
        return [name!.value,amount,left,right,caption!.value]
      }),
      [labels.cashItems[5],focus[4]!.value],
    ]},
    {op:'format',sheetId,range:'A1:C1',format:primaryHeader},
    {op:'format',sheetId,range:'A8:H8',format:primaryHeader},
    {op:'format',sheetId,range:'A35:E35',format:primaryHeader},
    {op:'format',sheetId,range:'C9:E32',format:{numberFormat:'0.00'}},
    {op:'format',sheetId,range:'F9:H32',format:{numberFormat:'0.0%'}},
    {op:'format',sheetId,range:'B2:C5',format:{numberFormat:'0.0"%"'}},
    {op:'format',sheetId,range:'B36:D41',format:{numberFormat:'0.00'}},
    {op:'format',sheetId,range:'A5:C5',format:highlight},
    {op:'format',sheetId,range:'A16:H16',format:highlight},
    {op:'format',sheetId,range:'A38:B38',format:highlight},
    {op:'setColumnWidth',sheetId,range:'A1',width:locale==='zh'?122:192},
    {op:'setColumnWidth',sheetId,range:'B1:H1',width:locale==='zh'?127:174},
  ]
}

export function cashFlowGuideChartOperation(locale:CashFlowGuideLocale='zh'):Extract<Operation,{op:'addChart'|'updateChart'}> {
  const labels=copy[locale]
  return {
    op:'addChart',chartId,...CASH_FLOW_GUIDE_TREND,title:labels.chart,kind:'line',
    headers:true,seriesBy:'columns',category:0,series:[1,2],legend:true,gridlines:true,labels:false,
    axisY:labels.chartUnit,palette:'enterprise'
  }
}

export function cashFlowGuideComponent(workbook:Workbook,locale:CashFlowGuideLocale='zh'):WorkbookComponent {
  const labels=copy[locale]
  const {cells}=inspectWorkbook(workbook,CASH_FLOW_GUIDE_ADJUSTMENTS.sheetId,CASH_FLOW_GUIDE_ADJUSTMENTS.range)
  const keys=['profit','depreciation','receivables','inventory','other','cash'] as const
  const steps=cells.slice(1).map((row,index)=>{
    const [name,amount,first,second,caption]=row.map(cell=>cell.value)
    if(typeof name!=='string'||!finite(amount))throw Error('现金流拆解数据不完整，请先生成季度分析。')
    const detailNames=typeof caption==='string'?caption.split(' / '):[]
    return {
      id:keys[index]!,name,amount:Math.round(amount*10000),
      details:[first,second].flatMap((value,i)=>finite(value)?[
        {name:detailNames[i]||labels.adjustments[i+2]!,amount:Math.round(value*10000)}
      ]:[]),
    }
  })
  const modeledCash=steps.slice(0,-1).reduce((sum,step)=>sum+step.amount,0)
  if(steps[0]!.amount<=0||modeledCash!==steps.at(-1)!.amount)throw Error('现金流调整与实际值未能对账，请检查季度分析。')
  return {
    componentId,...CASH_FLOW_GUIDE_ADJUSTMENTS,
    placement:{mode:'docked',layout:{x:42,y:12,width:460,height:410,space:'sheet'}},
    node:{
      id:componentId,title:labels.component,kind:'generated-container',generationStatus:'completed',
      containerSpec:{version:1,type:'html',title:labels.component,html:buildCashFlowGuideHtml({
        locale,company:labels.companies[0],period:'2026Q3',steps
      })},
    }
  }
}
