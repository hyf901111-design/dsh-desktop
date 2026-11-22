import {expect,it} from 'vitest'
import {homeGuideNativeBoardWidgetSeed} from '../scripts/lib/home-guide-native.mjs'
import {financialWidgetDefaults,synchronizeFinancialLinks} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'

it('uses Tencent for the first linked Apple quote and subsequent watchlist selections in the board demo',()=>{
 const symbols=[{code:'AAPL',market:'US',name:'苹果'},{code:'600900',market:'SH',name:'长江电力'}]
 const watch=homeGuideNativeBoardWidgetSeed(financialWidgetDefaults('watchlist'),symbols)
 const quote=homeGuideNativeBoardWidgetSeed(financialWidgetDefaults('quote'),symbols)
 expect(financialWidgetDefaults('quote').dataSource).toBe('backup')
 for(const symbol of symbols){
  const nodes=synchronizeFinancialLinks([
   {id:'watch',containerSpec:{...watch,selectedSymbol:symbol.market+':'+symbol.code}},
   {id:'quote',containerSpec:{...quote,linkedWatchlistId:'watch'}},
  ])
  expect(nodes[1].containerSpec).toMatchObject({symbols:[symbol],dataSource:'default',period:'1d',adjustment:'none'})
 }
})
