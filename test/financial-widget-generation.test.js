import { expect, it, vi } from 'vitest'
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js'
import { validateWorkbench, layoutWorkbench, workbenchPanelPrompt } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { financialWidgetSpec } from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
import { ResearchTaskRuntime } from '../packages/dsh-research-task-runtime/index.js'

const quote={version:1,type:'financial-widget',widget:'quote',title:'工业富联行情',symbols:[{market:'SH',code:'601138',name:'工业富联'}]}
const input={requestId:'professional-quote',title:'个股研究',dataMode:'source',panels:[{title:quote.title,prompt:'显示工业富联实时行情和专业K线',type:'financial-widget',size:'large',artifact:quote}]}
it('prepares a configured library quote directly with its chart and data refresh rather than model-authored SVG',()=>{
 const plan=validateWorkbench(input),panel=layoutWorkbench(plan.panels)[0]
 const output=JSON.parse(acceptArtifactOutput(JSON.stringify(panel.artifact)))
 expect(financialWidgetSpec(output)).not.toBeNull()
 expect(output.widget).toBe('quote');expect(output.symbols).toEqual(quote.symbols)
 expect(output.indicators).toEqual(['MA','VOL','MACD']);expect(output.period).toBe('1d')
 expect(output.html).toBeUndefined();expect(panel.width).toBe(716);expect(panel.height).toBe(600)
 expect(workbenchPanelPrompt(plan,panel)).toContain('内置个股行情')
})
it('never labels a live library widget as a simulated snapshot or replaces unsupported assets with a guessed ticker',()=>{
 expect(()=>validateWorkbench({...input,dataMode:'simulated'})).toThrow(/真实行情|实时/)
 expect(acceptArtifactOutput(JSON.stringify({...quote,symbols:[{market:'CRYPTO',code:'BTC',name:'比特币'}]}))).toBeUndefined()
 expect(()=>validateWorkbench({...input,panels:[{...input.panels[0],artifact:undefined}]})).toThrow(/配置|artifact/)
})
it('completes quote configuration through the prepared runtime without opening a model session',async()=>{
 const plan=validateWorkbench(input),start=vi.fn(),saved=[]
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{load:async()=>({version:1,tasks:[]}),save:async value=>saved.push(value)},createId:()=> 'quote-task'})
 try{
  const receipts=await runtime.startPreparedBatch({parentSessionId:'quote-session',panels:plan.panels.map(panel=>({canvasNodeId:'quote-node',prompt:workbenchPanelPrompt(plan,panel),artifact:panel.artifact}))})
  expect(receipts[0].state).toBe('completed');expect(start).not.toHaveBeenCalled()
  const output=JSON.parse(saved.at(-1).tasks[0].finalOutput)
  expect(output.type).toBe('financial-widget');expect(output.symbols).toEqual(quote.symbols)
 }finally{await runtime.dispose()}
})
