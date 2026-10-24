import {afterEach,it,expect,vi} from 'vitest'
import {conversationComponentFixture,snapshotView} from './helpers/conversation-component-fixture.js'
let current;afterEach(async()=>{if(current)await current.dispose();current=null})
const fixture=async(overrides)=>{current=await conversationComponentFixture(snapshotView(),overrides);await vi.waitFor(()=>expect(current.componentHost.querySelector('[data-conversation-component-id]')).not.toBeNull());return current}
it('renders a static reply card with source and data date, no close, refresh, ports or canvas identity',async()=>{
 const f=await fixture(),card=f.componentHost.querySelector('[data-conversation-component-id]')
 expect(card.textContent).toContain('12.34');expect(card.textContent).toContain('模拟来源');expect(card.textContent).toContain('2026-10-23')
 expect(card.querySelector('[data-conversation-component-refresh],[data-financial-port],[data-workbench-drag-handle],[aria-label="移除组件"],[data-research-canvas]')).toBeNull()
 expect([...card.querySelector('header').children].map(el=>el.getAttribute('data-conversation-action')||el.tagName)).toEqual(['SPAN','reference','more'])
})
it('copy and save menu actions call only their Host methods and show visible feedback',async()=>{
 const f=await fixture();await f.event('click',f.componentHost.querySelector('[data-conversation-action=more]'))
 const copy=f.componentHost.querySelector('[data-conversation-action=copy]');expect(copy).not.toBeNull();await f.event('click',copy)
 expect(f.bridge.copy).toHaveBeenCalledWith({sessionId:'session-a',componentId:'component-a'});expect(f.bridge.saveLibrary).not.toHaveBeenCalled();expect(f.componentHost.textContent).toContain('已复制')
 await f.event('click',f.componentHost.querySelector('[data-conversation-action=more]'));await f.event('click',f.componentHost.querySelector('[data-conversation-action=save]'))
 expect(f.bridge.saveLibrary).toHaveBeenCalledWith({sessionId:'session-a',componentId:'component-a'});expect(f.componentHost.textContent).toContain('已添加至组件库');expect(f.workspace.getSnapshot().artifacts).toEqual([])
})
it('Cmd+C copies a focused selected frame once while text selections and editors retain native copy',async()=>{
 const f=await fixture(),card=f.componentHost.querySelector('[data-conversation-component-id]'),title=card.querySelector('header')
 await f.event('pointerdown',title,{button:0});expect(f.document.activeElement).toBe(card)
 const key=await f.event('keydown',card,{key:'c',metaKey:true});expect(key.defaultPrevented).toBe(true);await f.event('copy',card);expect(f.bridge.copy).toHaveBeenCalledTimes(1)
 const text=card.querySelector('td').firstChild,selection=f.win.getSelection(),range=f.document.createRange();range.selectNodeContents(text);selection.addRange(range)
 const selected=await f.event('keydown',card,{key:'c',metaKey:true});expect(selected.defaultPrevented).toBe(false);selection.removeAllRanges()
 const input=f.document.createElement('textarea');card.append(input);input.focus();expect((await f.event('keydown',input,{key:'c',metaKey:true})).defaultPrevented).toBe(false);expect(f.bridge.copy).toHaveBeenCalledTimes(1)
 await f.event('pointerdown',f.document.body,{button:0});expect(card.dataset.selected).not.toBe('true')
})
it('menu errors remain visible and reference inserts into the resident input without submitting',async()=>{
 const f=await fixture({copy:vi.fn(async()=>({ok:false,error:'模拟剪贴板失败'}))}),shell={snapshot:{draft:'保留草稿',draftRev:1,imageIds:['img']},insertReference:vi.fn(()=>true),submit:vi.fn()}
 f.setInputs({sessions:{list:{getSnapshot:()=>({current:'session-a'})}},inputHub:{shell:()=>shell}})
 await f.event('click',f.componentHost.querySelector('[data-conversation-action=more]'));await f.event('click',f.componentHost.querySelector('[data-conversation-action=copy]'));expect(f.componentHost.querySelector('[role=alert]').textContent).toContain('模拟剪贴板失败')
 await f.event('click',f.componentHost.querySelector('[data-conversation-action=reference]'));expect(shell.insertReference).toHaveBeenCalled();expect(shell.snapshot.draft).toBe('保留草稿');expect(shell.submit).not.toHaveBeenCalled()
})
it('native cards use the instance provider, omit both ports, persist controls by revision CAS and preserve old state on failure',async()=>{
 const view=snapshotView();view.node.title='模拟行情';view.node.containerSpec={version:1,type:'financial-widget',widget:'quote',title:'模拟行情',symbols:[{market:'SH',code:'600000',name:'模拟标的'}],period:'1d',adjustment:'none',indicators:['VOL','MACD','MA'],market:'all',query:'',refreshMinutes:1,refreshEnabled:true};view.provenance={sourceNames:[],sourceState:'unspecified',refreshKind:'native'}
 current=await conversationComponentFixture(view);const f=current
 await vi.waitFor(()=>expect(f.bridge.queryNative).toHaveBeenCalledWith(expect.objectContaining({sessionId:'session-a',componentId:'component-a',expectedRevision:1,query:expect.objectContaining({action:'quotes',symbols:[{market:'SH',code:'600000',name:'模拟标的'}]})})))
 expect(f.componentHost.querySelector('[data-financial-port]')).toBeNull();expect(f.componentHost.querySelectorAll('.ew-financial-footer')).toHaveLength(1)
 expect(f.componentHost.querySelector('[data-conversation-component-refresh]')).not.toBeNull()
 const week=[...f.componentHost.querySelectorAll('.ew-quote-periods button')].find(b=>b.textContent==='周K');await f.event('click',week)
 await vi.waitFor(()=>expect(f.bridge.updateNativeSpec).toHaveBeenCalledWith(expect.objectContaining({expectedRevision:1,spec:expect.objectContaining({period:'1w'})})))
 await vi.waitFor(()=>expect(f.bridge.queryNative).toHaveBeenCalledWith(expect.objectContaining({expectedRevision:2,query:expect.objectContaining({action:'history',period:'1w'})})))
 f.bridge.updateNativeSpec.mockRejectedValueOnce(Error('模拟保存失败'));await f.event('click',[...f.componentHost.querySelectorAll('.ew-quote-periods button')].find(b=>b.textContent==='月K'))
 await vi.waitFor(()=>expect(f.componentHost.querySelector('[role=alert]').textContent).toContain('模拟保存失败'));expect(f.getView().node.containerSpec.period).toBe('1w');expect(f.workspace.getSnapshot().artifacts).toEqual([])
})
it('native library predicate accepts validated configuration while rejecting payload prices and calendar tools',async()=>{
 const {canSaveCustomComponent}=await import('../scripts/lib/custom-component-library.mjs'),{financialWidgetDefaults}=await import('../packages/dsh-research-task-runtime/financial-widget-contract.js')
 const node={id:'native',kind:'generated-container',generationStatus:'completed',containerSpec:financialWidgetDefaults('quote')}
 expect(canSaveCustomComponent(node)).toBe(true);expect(canSaveCustomComponent({...node,generationStatus:'running'})).toBe(false);expect(canSaveCustomComponent({...node,containerSpec:{...node.containerSpec,price:12.34}})).toBe(false);expect(canSaveCustomComponent({...node,containerSpec:{version:1,type:'calendar-tool'}})).toBe(false)
})
it('updates theme immediately and does not keep selection or menus on a different session',async()=>{
 const f=await fixture(),card=f.componentHost.querySelector('[data-conversation-component-id]')
 await f.event('pointerdown',card.querySelector('header'),{button:0});await f.event('click',card.querySelector('[data-conversation-action=more]'))
 await f.act(async()=>f.document.body.setAttribute('data-ds-dark-theme',''))
 await vi.waitFor(()=>expect(card.dataset.financialTheme).toBe('dark'))
 await f.renderComponent('other-session');expect(f.componentHost.querySelector('[data-conversation-component-id]')).toBeNull()
})
it('never steals editor, iframe, menu or dialog copy gestures',async()=>{
 const f=await fixture(),card=f.componentHost.querySelector('[data-conversation-component-id]')
 for(const kind of ['input','textarea','iframe','contenteditable','menu','dialog']){
  await f.event('pointerdown',card.querySelector('header'),{button:0});const el=f.document.createElement(['contenteditable','menu','dialog'].includes(kind)?'div':kind);el.tabIndex=0;if(kind==='contenteditable')el.setAttribute('contenteditable','true');if(['menu','dialog'].includes(kind))el.setAttribute('role',kind);card.append(el);el.focus()
  expect((await f.event('keydown',el,{key:'c',metaKey:true})).defaultPrevented).toBe(false);expect((await f.event('copy',el)).defaultPrevented).toBe(false);el.remove()
 }
 expect(f.bridge.copy).not.toHaveBeenCalled();expect(f.workspace.getSnapshot().artifacts).toEqual([])
})
it('a manual native refresh uses actual results and a failure preserves the last displayed price and time',async()=>{
 const {financialWidgetDefaults}=await import('../packages/dsh-research-task-runtime/financial-widget-contract.js'),view=snapshotView();view.node.containerSpec={...financialWidgetDefaults('quote'),symbols:[{market:'SH',code:'600000',name:'模拟标的'}]};view.provenance={sourceNames:[],sourceState:'unspecified',refreshKind:'native'}
 current=await conversationComponentFixture(view);const f=current
 await vi.waitFor(()=>expect(f.componentHost.querySelector('.ew-quote-price-line')?.textContent).toContain('12.34'))
 const footer=f.componentHost.querySelector('.ew-financial-footer').textContent
 f.bridge.queryNative.mockRejectedValue(Error('模拟网络中断'));await f.event('click',f.componentHost.querySelector('[data-conversation-action=refresh]'))
 await vi.waitFor(()=>expect(f.componentHost.querySelector('[role=alert]').textContent).toContain('模拟网络中断'))
 expect(f.componentHost.querySelector('.ew-quote-price-line').textContent).toContain('12.34');expect(f.componentHost.querySelector('.ew-financial-footer').textContent).toContain('获取');expect(footer).toContain('获取')
})
it('the default research surface still fetches through the existing financial bridge',async()=>{
 const f=await fixture(),financial=f.win.dshDesktop.financialWidget
 financial.request.mockResolvedValue({quotes:[{market:'SH',code:'600000',name:'模拟标的',price:18.76,changePercent:0}],bars:[],source:'模拟研究数据源',receivedAt:'2026-10-24T01:30:00Z'})
 await f.act(async()=>{const node=f.workspace.createFinancialWidget('quote');f.workspace.setArtifacts([{...node,containerSpec:{...node.containerSpec,symbols:[{market:'SH',code:'600000',name:'模拟标的'}]}}])})
 await vi.waitFor(()=>expect(f.host.querySelector('.ew-quote-price-line')?.textContent).toContain('18.76'))
 expect(financial.request).toHaveBeenCalledWith(expect.objectContaining({action:'quotes',symbols:[{market:'SH',code:'600000',name:'模拟标的'}]}));expect(f.bridge.queryNative).not.toHaveBeenCalled()
})
it('drops a late read after the displayed session changes',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve}),view=snapshotView()
 current=await conversationComponentFixture(view,{read:vi.fn(()=>pending)});const f=current
 await f.renderComponent('other-session');await f.act(async()=>finish(view))
 expect(f.componentHost.querySelector('[data-conversation-component-id]')).toBeNull();expect(f.componentHost.textContent).toBe('')
})
it('clears the previous owner card and its pending menu when the account generation changes',async()=>{
 let version=0,account={generation:1,user:{userId:'owner-a'}};const listeners=new Set(),ownerAdapter={subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},version:()=>version,getState:()=>({account}),getView:()=>undefined,isLoading:()=>false,activationError:()=>null,editorError:()=>null,finishGesture:()=>{},clearPresence:()=>{},presence:()=>{}}
 current=await conversationComponentFixture(snapshotView(),{}, {ownerAdapter});const f=current
 await vi.waitFor(()=>expect(f.componentHost.querySelector('[data-conversation-component-id]')).not.toBeNull());await f.event('click',f.componentHost.querySelector('[data-conversation-action=more]'))
 f.bridge.read.mockRejectedValueOnce(Error('模拟新账户无法读取旧组件'))
 await f.act(async()=>{account={generation:2,user:{userId:'owner-b'}};version++;for(const fn of listeners)fn()})
 await vi.waitFor(()=>expect(f.componentHost.querySelector('[data-conversation-component-id]')).toBeNull());expect(f.componentHost.querySelector('[role=menu]')).toBeNull()
})
