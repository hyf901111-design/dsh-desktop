import {it,expect,vi} from 'vitest'
import {createFinancialWidgetData,normalizeFinancialBars,parseFinancialApiDefinition} from '../src/main/financial/widget-data'
const symbol={market:'SH',code:'600519',name:'贵州茅台'}
const info=(method='GET',url='https://gw.datayes.com/aladdin_proxy/read',fields=['ticker'])=>`调用: ${method} ${url}\n【入参 ${fields.length} 个】格式: 参数名 | 中文名 | 必填? | 位置/类型 | 说明\n${fields.map(f=>`  ${f} | 参数 | 必填 | ${method==='GET'?'Query':'Body'}/string | 不使用默认值`).join('\n')}\n【出参 1 个】`
const provider=(definition:string,result:any)=>{const calls:any[]=[];return {calls,request:vi.fn(async(body:string)=>{const b=JSON.parse(body);calls.push(b.params);return Response.json({jsonrpc:'2.0',id:b.id,result:{content:[{type:'text',text:b.params.name==='get_api_info'?definition:'接口返回及溯源\n'+JSON.stringify({provenance:{provider:'DataYes'},data:result})}]}})})}}
it('登录门禁，不执行匿名通联调用',async()=>{const request=vi.fn();const service=createFinancialWidgetData({request,identity:()=>null});await expect(service.query({action:'search',query:'苹果'})).rejects.toThrow('登录');expect(request).not.toHaveBeenCalled()})
it('严校验日期/OHLC；零成交量保留，缺失成交量不填0',()=>{
 expect(normalizeFinancialBars([{date:'2026-01-01',open:10,high:11,low:9,close:10,volume:0},{date:'2026-01-02',open:10,high:11,low:9,close:11},{date:'2026-02-30',open:10,high:11,low:9,close:11},{date:'2026-01-03',open:10,high:9,low:9,close:11}])).toEqual([{date:'2026-01-01',open:10,high:11,low:9,close:10,volume:0},{date:'2026-01-02',open:10,high:11,low:9,close:11,volume:null}])
})
it('解析实际文本接口定义，不复制样例与默认参数；溯源前缀下正确读取涨跌比例',async()=>{
 const definition=info('GET',undefined,['ticker','type']);expect(parseFinancialApiDefinition(definition)?.parametersInput).toHaveLength(2)
 const p=provider(definition,{code:1,data:{ticker:'600519',lastPrice:100,changePct:.00574,date:'2026-10-09',status:'已收盘'}}),service=createFinancialWidgetData({...p,identity:()=> 'own'}),q={action:'quotes',symbols:[symbol]}
 const result=await service.query(q);expect(p.calls.map(x=>x.name)).toEqual(['get_api_info','call_api']);expect(p.calls[1].arguments.url_params).toEqual({ticker:'600519',type:'stock'});expect(result.quotes[0]).toMatchObject({price:100,asOf:'2026-10-09',quality:'已收盘'});expect(result.quotes[0].changePercent).toBeCloseTo(.574)
 await service.query(q);expect(p.calls).toHaveLength(2);await service.query({...q,refresh:true});expect(p.calls).toHaveLength(3)
})
it.each([info('GET','https://evil.example/read'),info('GET',undefined,['ticker','unknownRequired']),info('POST')])('不执行不可信网址、未知必填参数或写接口',async definition=>{
 const p=provider(definition,{}),service=createFinancialWidgetData({...p,identity:()=> 'own'});const r=await service.query({action:'quotes',symbols:[symbol]});expect(r.quotes).toHaveLength(0);expect(r.errors).toHaveLength(1);expect(p.calls).toHaveLength(1)
})
it('只读新闻 POST 使用已声明字段，拒绝危险原文链接',async()=>{
 const p=provider(info('POST',undefined,['onlyChannel','publishTimeStart','publishTimeEnd','pageSize']),{code:1,data:{feeds:[{mongoId:'n',title:'新闻',channel:'原始来源',redirect:{url:'javascript:alert(1)'}}]}}),service=createFinancialWidgetData({...p,identity:()=> 'own'});const r=await service.query({action:'news',query:'科技'});expect(r.news[0]).toMatchObject({title:'新闻',source:'原始来源',url:null});expect(p.calls[1].arguments.body).toMatchObject({onlyChannel:false,pageSize:3});expect(p.calls[1].arguments.url_params).toBeUndefined()
})
it('业务错误不伪造成空搜索或零价格；并行行共享接口定义',async()=>{
 const p=provider(info(),{code:-1,message:'no permission'}),service=createFinancialWidgetData({...p,identity:()=> 'own'});const r=await service.query({action:'quotes',symbols:[symbol,{...symbol,code:'000001',market:'SZ'}]});expect(r.quotes).toEqual([]);expect(r.errors).toHaveLength(2);expect(p.calls.filter(x=>x.name==='get_api_info')).toHaveLength(1)
})
it('账户切换不能交付旧结果；非法请求不能触发服务',async()=>{
 let identity:string|null='one';const pending:Array<{id:number;release:(r:Response)=>void}>=[],request=vi.fn((body:string)=>new Promise<Response>(release=>pending.push({id:JSON.parse(body).id,release}))),service=createFinancialWidgetData({request,identity:()=>identity});const result=service.query({action:'search',query:'茅台'});await vi.waitFor(()=>expect(request).toHaveBeenCalled());identity='two';pending.forEach(p=>p.release(Response.json({jsonrpc:'2.0',id:p.id,result:{structuredContent:{}}})));await expect(result).rejects.toThrow('账户');await expect(service.query({action:'quotes',symbols:[{market:'SH',code:'https://evil'}]})).rejects.toThrow('参数');await expect(service.query({action:'quotes',symbols:[symbol],asset:'evil'})).rejects.toThrow('参数')
})
it('指数使用 closeIndex/preCloseIndex 与指数 OHLC 字段，不误当股票缺失值',async()=>{
 const p=provider(info(),{retCode:1,data:[{ticker:'000300',tradeDate:'2026-10-09',openIndex:100,highestIndex:103,lowestIndex:99,closeIndex:102,preCloseIndex:100,turnoverVol:0},{ticker:'000300',tradeDate:'2026-10-08',openIndex:99,highestIndex:102,lowestIndex:98,closeIndex:100,preCloseIndex:99}]}),service=createFinancialWidgetData({...p,identity:()=> 'own'});const r=await service.query({action:'quotes',symbols:[{market:'SH',code:'000300',name:'沪深300'}],asset:'index'});expect(r.quotes[0]).toMatchObject({price:102,asOf:'2026-10-09',series:[100,102]});expect(r.quotes[0].changePercent).toBeCloseTo(2)
})
it('MCP 截断的 JSON 明确报错，不能显示成暂无新闻',async()=>{
 const p=provider(info('POST',undefined,['onlyChannel','publishTimeStart','publishTimeEnd','pageSize']),{});p.request.mockImplementation(async(body:string)=>{const b=JSON.parse(body);return Response.json({id:b.id,result:{content:[{type:'text',text:b.params.name==='get_api_info'?info('POST',undefined,['onlyChannel','publishTimeStart','publishTimeEnd','pageSize']):'…结果已截断，下方 JSON 不完整'}]}})});const service=createFinancialWidgetData({...p,identity:()=> 'own'});await expect(service.query({action:'news',query:''})).rejects.toThrow('数据过多')
})
