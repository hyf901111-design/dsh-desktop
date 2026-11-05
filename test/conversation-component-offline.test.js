import {afterEach,it,expect,vi} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {ConversationComponentStore} from '../src/main/state/conversation-components.ts'
import {createConversationComponentService} from '../src/main/conversation-components/service.ts'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
import {conversationComponentFixture,snapshotView} from './helpers/conversation-component-fixture.js'
const dirs=[];let current
const sample={market:'US',code:'AAPL',name:'模拟标的'},quotedAt='2026-10-23T20:00:00Z',receivedAt='2026-10-23T20:01:00Z'
const prices={source:'模拟持久行情源',receivedAt,quotes:[{...sample,price:47.21,changePercent:1.2,quotedAt,asOf:'2026-10-23'}]}
const history={source:'模拟持久历史源',receivedAt,bars:Array.from({length:8},(_,i)=>({date:'2026-10-'+String(16+i).padStart(2,'0'),open:40+i,high:42+i,low:39+i,close:41+i,volume:100+i})),volumeUnit:'股',nativePeriod:true}
afterEach(async()=>{if(current)await current.dispose();current=null;await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))})
for(const savedParts of [['quotes','history'],['quotes'],['history']])for(const failureMode of ['throw','empty-result'])it('reloads persisted Host quote/history into a cold offline card without advancing time or pulsing: '+savedParts.join('+')+' / '+failureMode,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'conversation-offline-render-'));dirs.push(directory);const file=join(directory,'components.json'),store=new ConversationComponentStore(file);await store.load()
 let online=true
 const nativeQuery=vi.fn(async query=>{if(!online){if(failureMode==='throw')throw Error('模拟断网');return query.action==='quotes'?{quotes:[],errors:[{code:'AAPL',error:'模拟断网'}],source:'模拟失败源',receivedAt:'2026-10-24T01:00:00Z'}:{bars:[],error:'模拟断网',source:'模拟失败源',receivedAt:'2026-10-24T01:00:00Z'}}return structuredClone(query.action==='quotes'?prices:history)})
 const options=store=>({store,owner:()=> 'owner',canReadSession:id=>id==='session-a',currentVisibleContext:()=>({ownerAccountId:'owner',sessionId:'session-a',mode:'conversation',generation:'g'}),nativeQuery,clipboard:()=>undefined,library:()=>undefined})
 const service=createConversationComponentService(options(store)),identity={ownerAccountId:'owner',sessionId:'session-a',turnId:'7',mode:'conversation',windowGeneration:'g',current:()=>true}
 const saved=await service.create({artifact:{...financialWidgetDefaults('quote'),symbols:[sample]}},identity,new AbortController().signal,'request-persisted'),target={sessionId:'session-a',componentId:saved.effect.componentId},spec=(await service.read(target)).node.containerSpec,query={action:'quotes',symbols:spec.symbols,source:spec.dataSource??'default'}
 if(savedParts.includes('quotes'))await service.queryNative({...target,expectedRevision:1,query});if(savedParts.includes('history'))await service.queryNative({...target,expectedRevision:1,query:{...query,action:'history',period:'1d',adjustment:'none'}})
 const disk=await readFile(file,'utf8');online=false
 const reloaded=new ConversationComponentStore(file);await reloaded.load();const offline=createConversationComponentService(options(reloaded)),view=await offline.read(target)
 current=await conversationComponentFixture(view,{read:offline.read,queryNative:offline.queryNative,readNativeSnapshot:offline.readNativeSnapshot});const f=current
 const expectedPrice=savedParts.includes('quotes')?'47.21':'48.00'
 await vi.waitFor(()=>expect(f.componentHost.querySelector('.ew-quote-price-line')?.textContent).toContain(expectedPrice))
 expect(Boolean(f.componentHost.querySelector('[data-financial-chart]'))).toBe(savedParts.includes('history'));expect(f.componentHost.querySelector('.ew-financial-footer').textContent).toContain(savedParts.includes('quotes')?'模拟持久行情源':'模拟持久历史源');expect(f.componentHost.textContent).toContain('保留上次数据')
 const fetched=f.componentHost.querySelector('.ew-financial-footer>span:last-child').textContent
 await f.event('click',f.componentHost.querySelector('[data-conversation-action=refresh]'))
 await vi.waitFor(()=>expect(f.componentHost.querySelector('[role=alert]').textContent).toContain('模拟断网'))
 expect(f.componentHost.querySelector('.ew-quote-price-line').textContent).toContain(expectedPrice);expect(f.componentHost.querySelector('.ew-financial-footer>span:last-child').textContent).toBe(fetched);expect(f.componentHost.querySelector('.ew-financial-data-pulse')).toBeNull()
 expect((await offline.read(target)).provenance.fetchedAt).toBe(Date.parse(receivedAt));expect(await readFile(file,'utf8')).toBe(disk);expect(f.workspace.getSnapshot().artifacts).toEqual([])
})
it('does not restore a snapshot from an old spec revision',async()=>{
 const view=snapshotView();view.node.containerSpec={...financialWidgetDefaults('quote'),symbols:[sample]};view.provenance={sourceNames:[],sourceState:'unspecified',refreshKind:'native'}
 const snapshot=vi.fn(async()=>({specRevision:0,receivedAt:Date.parse(receivedAt),querySignature:'fixture',result:prices}))
 current=await conversationComponentFixture(view,{queryNative:vi.fn(async()=>{throw Error('模拟离线且无当前快照')}),readNativeSnapshot:snapshot});const f=current
 await vi.waitFor(()=>expect(snapshot).toHaveBeenCalled());expect(f.componentHost.querySelector('.ew-quote-price-line').textContent).not.toContain('47.21')
 expect(f.componentHost.textContent).not.toContain('模拟持久行情源')
})
it('does not pulse a mixed quote result when its history branch was restored from a stale snapshot',async()=>{
 const view=snapshotView();view.node.containerSpec={...financialWidgetDefaults('quote'),symbols:[sample]};view.provenance={sourceNames:[],sourceState:'unspecified',refreshKind:'native'}
 let price=48.22
 const native=vi.fn(async input=>{if(input.query.action==='history')throw Error('模拟历史断网');return {...prices,stale:false,quotes:[{...prices.quotes[0],price}]}}),snapshot=vi.fn(async()=>({specRevision:1,receivedAt:Date.parse(receivedAt),querySignature:'fixture-history',result:history}))
 current=await conversationComponentFixture(view,{queryNative:native,readNativeSnapshot:snapshot});const f=current
 await vi.waitFor(()=>expect(f.componentHost.querySelector('.ew-quote-price-line')?.textContent).toContain('48.22'))
 price=50.18;await f.event('click',f.componentHost.querySelector('[data-conversation-action=refresh]'))
 await vi.waitFor(()=>expect(f.componentHost.querySelector('[role=alert]').textContent).toContain('模拟历史断网'))
 expect(f.componentHost.querySelector('.ew-quote-price-line').textContent).toContain('50.18');expect(f.componentHost.querySelector('.ew-financial-data-pulse')).toBeNull();expect(f.componentHost.querySelector('[data-financial-chart]')).not.toBeNull()
})
it('shows the actual failure for a watchlist with no successful observation instead of a silent empty-price card',async()=>{
 const view=snapshotView();view.node.containerSpec={...financialWidgetDefaults('watchlist'),symbols:[sample]};view.provenance={sourceNames:[],sourceState:'unspecified',refreshKind:'native'}
 current=await conversationComponentFixture(view,{queryNative:vi.fn(async()=>{throw Error('模拟无任何成功行情')}),readNativeSnapshot:vi.fn(async()=>null)});const f=current
 await vi.waitFor(()=>expect(f.componentHost.textContent).toContain('模拟无任何成功行情'))
 expect(f.componentHost.querySelector('.ew-financial-data-pulse')).toBeNull();expect(f.componentHost.textContent).not.toContain('已刷新数据')
})
