import {afterEach,expect,it,vi} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
const close=[];afterEach(async()=>{for(const dispose of close.splice(0))await dispose()})
async function indices(symbols,request){
 const f=await financialClientFixture({financialWidget:{request}},{refreshState:true});close.push(f.dispose)
 await f.act(async()=>{const node=f.workspace.createFinancialWidget('indices');f.workspace.setArtifacts([{...node,containerSpec:{...node.containerSpec,...symbols===undefined?{}:{symbols}}}])})
 return{...f,card:f.host.querySelector('[data-financial-widget="indices"]')}
}
it('shows a configuration state for a legally empty indices selection without requesting or claiming data',async()=>{
 const request=vi.fn(async()=>({quotes:[],source:'腾讯财经',receivedAt:'2026-10-28T11:51:00Z'})),f=await indices([],request)
 await vi.waitFor(()=>expect(f.card.querySelector('.ew-financial-empty')?.textContent).toContain('配置指数'))
 expect(request).not.toHaveBeenCalled();expect(f.card.querySelector('.ew-financial-footer').textContent).not.toMatch(/腾讯财经|获取 \d|已刷新/)
})
it('treats an empty quote response as missing index data with a retry instead of a successful fetch time',async()=>{
 const f=await indices(undefined,vi.fn(async()=>({quotes:[],source:'腾讯财经',receivedAt:'2026-10-28T11:51:00Z'})))
 await vi.waitFor(()=>expect(f.card.querySelector('.ew-financial-empty')?.textContent).toContain('未取得'))
 let result;await f.act(async()=>{result=await f.card.__eworkRefreshFinancial()})
 expect(result.error).toContain('未取得');expect(f.card.querySelector('.ew-financial-retry')).not.toBeNull();expect(f.card.querySelector('.ew-financial-footer').textContent).not.toMatch(/获取 \d|已刷新|腾讯财经/)
})
it('retains previous valid index quotes and their actual timestamp when a later response has no data',async()=>{
 let empty=false;const request=vi.fn(async q=>({quotes:empty?[]:q.symbols.map(s=>({...s,price:100,changePercent:1,quotedAt:'2026-10-28T07:00:00Z',source:'合成验收'})),source:'合成验收',receivedAt:empty?'2026-10-28T12:00:00Z':'2026-10-28T07:00:01Z'})),f=await indices(undefined,request)
 await vi.waitFor(()=>expect(f.card.querySelector('.ew-indices-grid')?.textContent).toContain('100.00'));empty=true
 let result;await f.act(async()=>{result=await f.card.__eworkRefreshFinancial()})
 expect(result.error).toContain('未取得');expect(f.card.querySelector('.ew-indices-grid').textContent).toContain('100.00');expect(f.card.querySelector('.ew-financial-footer').textContent).toContain('刷新失败');expect(f.card.querySelector('.ew-financial-footer').textContent).not.toContain('20:00')
})
