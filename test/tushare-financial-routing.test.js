import {it,expect,vi} from 'vitest'
import {createFinancialRouter} from '../services/fund-data/financial/router.js'
import {preferredComponentSourceTools,componentSourceInstruction} from '../packages/dsh-research-task-runtime/component-source-tools.js'
import {componentSourceCollector,componentBindingEvidence,resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {financialSourceGuidance} from '../packages/dsh-integration-runtime/financial-source-policy.js'
import tools from '../config/tushare-builtin-tools.json' with {type:'json'}

const env={TUSHARE_TOKEN:'server-only-test'},clock=()=>new Date('2026-11-07T12:00:00Z')
const fixture=(fields,items)=>vi.fn(async()=>Response.json({code:0,data:{fields,items}}))
it('通用基金净值查询优先 Tushare，按净值口径和日期取数，不访问其他收费源',async()=>{
 const fetchImpl=fixture(['ts_code','nav_date','accum_nav'],[['000001.OF','20261106',3.42]])
 const fund={research:vi.fn()},market={call:vi.fn()}
 const {value,provenance}=await createFinancialRouter({env,clock,fetchImpl,fund,market}).query({operation:'financial',intent:'nav',asset:'fund',symbols:['000001'],nav_basis:'accumulated',as_of:'2026-11-06'})
 expect(value.records[0]).toMatchObject({metric:'累计净值',value:3.42,as_of:'2026-11-06',quality_state:'dated'})
 expect(provenance[0].source).toBe('tushare');expect(fund.research).not.toHaveBeenCalled();expect(market.call).not.toHaveBeenCalled()
 expect(JSON.parse(fetchImpl.mock.calls[0][1].body).params).toMatchObject({ts_code:'000001.OF',nav_date:'20261106'})
 expect(JSON.stringify(value)).not.toContain(env.TUSHARE_TOKEN)
})
it('日线保留不复权与实际日期，拒绝错代码和重复日期；不把它当实时行情',async()=>{
 const fetchImpl=fixture(['ts_code','trade_date','open','high','low','close'],[['000300.SH','20261106',3900,4100,3800,4000]])
 const router=createFinancialRouter({env,clock,fetchImpl})
 const q={operation:'financial',intent:'history',asset:'index',symbols:['000300.SH'],start:'2026-11-01',end:'2026-11-06'}
 const r=await router.query(q)
 expect(r.value.records).toHaveLength(4);expect(r.value.records[3]).toMatchObject({value:4000,unit:'点',price_basis:'1d 不复权',quality_state:'dated'})
 fetchImpl.mockClear();await router.query({operation:'financial',intent:'quote',asset:'index',symbols:['000300.SH']});expect(fetchImpl).not.toHaveBeenCalled()
 fetchImpl.mockImplementation(fixture(['ts_code','trade_date','open','high','low','close'],[['000001.SH','20261106',1,2,1,2]]))
 expect((await router.query(q)).value.records).toHaveLength(0)
})
it('不把免费来源排他需求改为 Tushare；金融数据上下文可在对话与组件复用',()=>{
 const schemas=tools.map(t=>({...t,name:t.name==='tushare_catalog'?'ework__t_aaa':'ework__t_bbb'}))
 expect(preferredComponentSourceTools(schemas,'仅使用腾讯行情展示最新报价')).toEqual([])
 const preferred=preferredComponentSourceTools(schemas,'沪深300 ETF 本周份额和规模变化')
 expect(preferred).toHaveLength(2)
 expect(componentSourceInstruction(preferred,'沪深300 ETF 份额规模')).toContain('Tushare')
 expect(financialSourceGuidance(schemas)).toContain('分页未完成不能宣称全量')
 expect(financialSourceGuidance([])).toBe('')
})
it('Tushare 目录不能当数据，真实 records 可以映射成可刷新组件',()=>{
 const schemas=tools.map(t=>({...t,name:t.name==='tushare_catalog'?'ework__t_aaa':'ework__t_bbb'})),collector=componentSourceCollector(schemas.map(t=>t.name),schemas)
 const args={api_name:'daily_basic',params:{ts_code:'600519.SH'},fields:'ts_code,trade_date,pe_ttm'}
 for(const [name,payload] of [['tushare_catalog',{kind:'catalog',interfaces:[]}],['tushare_query',{records:[{ts_code:'600519.SH',trade_date:'20261106',pe_ttm:22.1}]}]]){
  const id=name==='tushare_catalog'?'ework__t_aaa':'ework__t_bbb'
  collector.accept({type:'tool/call',data:{callId:id,name:id,arguments:JSON.stringify(args)}})
  collector.accept({type:'tool/result',data:{message:{source:{callId:id},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify(payload)}]}]}}})
 }
 expect(componentBindingEvidence(collector.records)).not.toContain('interfaces')
 const binding={version:1,type:'data-bound',requests:[{key:'q',tool:'ework__t_bbb',args}],mapping:{version:1,type:'market',variant:'metrics',title:'估值',asOf:{$from:'q',$path:'records.0.trade_date'},items:{$from:'q',$each:'records',$map:{label:'市盈率 TTM',value:{$path:'pe_ttm',$as:'string',$suffix:' 倍'}}}}}
 const output=resolveBoundComponent(JSON.stringify(binding),collector.records,clock())
 expect(output.data.items[0].value).toBe('22.1 倍')
})
