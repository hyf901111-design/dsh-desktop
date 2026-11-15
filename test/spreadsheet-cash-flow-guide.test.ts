import {Window,type HTMLElement,type HTMLInputElement} from 'happy-dom'
import {describe,expect,it} from 'vitest'
import {applyOperations,inspectWorkbook} from '../src/shared/spreadsheet/workbook'
import {
  CASH_FLOW_GUIDE_ADJUSTMENTS,CASH_FLOW_GUIDE_ANALYSIS,CASH_FLOW_GUIDE_SOURCE,CASH_FLOW_GUIDE_TREND,
  cashFlowGuideAnalysisOperations,cashFlowGuideChartOperation,cashFlowGuideComponent,createCashFlowGuideWorkbook
} from '../src/shared/spreadsheet/cash-flow-guide'
import {readWorkbookFile,writeWorkbookFile} from '../src/main/spreadsheet/files'
import {HOME_SPREADSHEET_GUIDE_FILE} from '../packages/dsh-research-task-runtime/home-spreadsheet-guide-contract.js'
import {noteLibrarySpec} from '../src/main/notes/component-library'

describe('cash-flow spreadsheet tutorial',()=>{
  it('removes one duplicate while retaining audited source rows and editable formulas',()=>{
    const raw=createCashFlowGuideWorkbook('cash-demo')
    const source=inspectWorkbook(raw,CASH_FLOW_GUIDE_SOURCE.sheetId,CASH_FLOW_GUIDE_SOURCE.range)
    expect(source.cells).toHaveLength(26)
    expect(source.cells[25]!.map(cell=>cell.value)).toEqual(source.cells[8]!.map(cell=>cell.value))
    expect(source.cells[8]!.map(cell=>cell.value).slice(0,5)).toEqual(['澄川制造','2026Q3',24,2.5,1.6])
    const analysis=applyOperations(raw,cashFlowGuideAnalysisOperations(raw))
    expect(analysis.sheets[CASH_FLOW_GUIDE_SOURCE.sheetId]).toEqual(raw.sheets[CASH_FLOW_GUIDE_SOURCE.sheetId])
    const result=inspectWorkbook(analysis,CASH_FLOW_GUIDE_ANALYSIS.sheetId,CASH_FLOW_GUIDE_ANALYSIS.range)
    expect(result.cells).toHaveLength(25)
    expect(result.cells.filter(row=>row[0]?.value==='澄川制造'&&row[1]?.value==='2026Q3')).toHaveLength(1)
    expect(result.cells[8]![3]).toMatchObject({formula:"='原始数据'!D9"})
    expect(result.cells[8]![6]).toMatchObject({formula:'=IFERROR(D16/D12-1,"")'})
    expect(result.cells[8]![7]).toMatchObject({formula:'=IFERROR(E16/E12-1,"")'})
    expect(applyOperations(analysis,[cashFlowGuideChartOperation()]).charts?.[0]).toMatchObject({
      ...CASH_FLOW_GUIDE_TREND,kind:'line',series:[1,2]
    })
    const trend=inspectWorkbook(analysis,CASH_FLOW_GUIDE_TREND.sheetId,CASH_FLOW_GUIDE_TREND.range)
    expect(trend.cells.slice(1).map(row=>row[0]!.value)).toEqual(['2025Q4','2026Q1','2026Q2','2026Q3'])
    expect(trend.cells[4]!.slice(1).map(cell=>cell.formula)).toEqual(['=ROUND(G16*100,1)','=ROUND(H16*100,1)'])
  })

  it('loads the example through the Excel importer with the original values and detail rows',async()=>{
    for(const locale of ['zh','en'] as const){
      const fixture=createCashFlowGuideWorkbook('cash-demo',locale)
      const bytes=await writeWorkbookFile(fixture,'xlsx',CASH_FLOW_GUIDE_SOURCE.sheetId)
      const imported=await readWorkbookFile(bytes,HOME_SPREADSHEET_GUIDE_FILE[locale],fixture.id)
      expect(imported.name).toBe(HOME_SPREADSHEET_GUIDE_FILE[locale])
      const range=(book:typeof fixture)=>inspectWorkbook(book,CASH_FLOW_GUIDE_SOURCE.sheetId,CASH_FLOW_GUIDE_SOURCE.range).cells.map(row=>row.map(cell=>cell.value))
      expect(range(imported)).toEqual(range(fixture))
      expect(cashFlowGuideComponent(applyOperations(imported,cashFlowGuideAnalysisOperations(imported,locale)),locale)).toMatchObject(CASH_FLOW_GUIDE_ADJUSTMENTS)
    }
  })

  it('uses the native interactive HTML contract and recalculates without overwriting the actual values',async()=>{
    const raw=createCashFlowGuideWorkbook('cash-demo')
    const analysis=applyOperations(raw,cashFlowGuideAnalysisOperations(raw))
    const component=cashFlowGuideComponent(analysis)
    expect(component).toMatchObject(CASH_FLOW_GUIDE_ADJUSTMENTS)
    expect(noteLibrarySpec(component.node.containerSpec)).toEqual(component.node.containerSpec)
    const document=new Window({settings:{enableJavaScriptEvaluation:true}})
    try{
      document.document.write(String(component.node.containerSpec.html))
      const select=(selector:string)=>document.document.querySelector<HTMLElement>(selector)!
      expect(select('[data-flow]').textContent).toBe('1.60')
      expect(select('[data-ratio]').textContent).toBe('64%')
      select('[data-adjustment="receivables"]').click()
      expect(select('[data-source-detail]').textContent).toContain('经销渠道')
      const slider=select('input[type=range]') as HTMLInputElement
      slider.value='3000'
      slider.dispatchEvent(new document.Event('input'))
      expect(select('[data-flow]').textContent).toBe('1.90')
      expect(select('[data-actual-flow]').textContent).toContain('1.60')
      expect(select('[data-ratio]').textContent).toBe('76%')
      expect(select('[data-target]').textContent).toContain('达到 75%')
      expect(analysis.components).toBeUndefined()
    }finally{
      await document.happyDOM.close()
    }
  })
})
