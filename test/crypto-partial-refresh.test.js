import {expect,it,vi} from 'vitest'
import {preparePublicDataPanel} from '../packages/dsh-research-task-runtime/workbench-public-data.js'
import {ComponentDataRefresh} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

const response=(pair,price)=>({sourceId:'kraken-ticker',source:'Kraken',units:{price:'USD',volume24h:pair.startsWith('ETH')?'ETH':pair.startsWith('XBT')?'BTC':'SOL'},records:[{pair,price,bid:price-1,ask:price+1,high24h:price+2,low24h:price-2,volume24h:1,changeTodayDetail:'日内涨跌幅0%（UTC 00:00 起）'}]})
it.each([2,3])('refreshes %i fixed crypto pairs through partial provider failure, recovery and all-missing preservation',async count=>{
 const pairs=['XBTUSD','ETHUSD','SOLUSD'].slice(0,count),panel={title:'BTC/ETH行情',type:'market',publicData:{profile:'crypto-metrics',requests:pairs.map(pair=>({source:'kraken-ticker',parameters_json:JSON.stringify({pair})})),intervalMinutes:1}}
 const initial=await preparePublicDataPanel(panel,{query:async args=>response(JSON.parse(args.parameters_json).pair,100)})
 let spec=JSON.parse(initial.output),mode='partial',saved=[]
 const apply=vi.fn(async(_binding,_revision,value)=>{spec=value})
 const service=new ComponentDataRefresh({owner:()=> 'o',load:async()=>saved,save:async value=>{saved=structuredClone(value)},validateRequest:async value=>value,execute:async(_b,_r,args)=>{
  const pair=JSON.parse(args.parameters_json).pair
  if(mode==='empty')return {...response(pair,999),records:[]}
  if(mode==='partial'&&pair==='ETHUSD')throw Object.assign(Error('synthetic network failure'),{code:'NETWORK_ERROR'})
  return response(pair,mode==='recovered'?120:110)
 },inspect:async()=>({spec,writable:true,revision:'r'}),apply})
 try{
  await service.load();const binding=await service.bind({sessionId:'s',nodeId:'n',workspaceId:'w',...initial.recipe})
  const partial=await service.refresh(binding.id),data=readTemplateModel(spec).data
  expect(partial.status).toBe('success');expect(JSON.stringify(data)).toContain('110')
  expect(JSON.stringify(data)).toContain('本次未取得');expect(JSON.stringify(data)).toContain('无法连接来源')
  expect(readTemplateModel(spec).templateId).toBe(count===2?'market.metrics':'market.table')
  expect(saved[0].requests).toHaveLength(count)
  mode='recovered';await service.refresh(binding.id);const recovered=readTemplateModel(spec).data
  expect(JSON.stringify(recovered)).toContain('120');expect(JSON.stringify(recovered)).not.toContain('本次未取得')
  const before=structuredClone(spec),calls=apply.mock.calls.length;mode='empty'
  const failed=await service.refresh(binding.id);expect(failed.status).toBe('error');expect(spec).toEqual(before);expect(apply).toHaveBeenCalledTimes(calls)
 }finally{await service.dispose()}
})
