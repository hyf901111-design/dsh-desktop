import {afterEach,expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import {createWorkbenchRefreshSurface,isWorkbenchViewState,installWorkbenchRefresh,workbenchContentRevision} from '../packages/dsh-research-task-runtime/workbench-refresh.js'
import {createComponentDataStatusMonitor,createComponentDataStatusStore,createComponentRefreshFeedback} from '../scripts/lib/component-data-status.mjs'
const clean=[]
afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn();vi.useRealTimers()})
function fixture(){
 const win=new Window(),body=win.document.body
 body.innerHTML='<input value="BTC"><div><table><tbody><tr><td>BTC</td><td>100</td></tr><tr><td>ETH</td><td>20</td></tr></tbody></table></div><details open><summary>完整数据</summary>说明</details>'
 const surface=createWorkbenchRefreshSurface(body)
 clean.push(async()=>{surface.dispose();await win.happyDOM.abort()})
 return {win,body,surface}
}
it('compares table values by row key through sorting and restores input, disclosure and scroll',()=>{
 vi.useFakeTimers();const f=fixture(),scroll=f.body.children[1];scroll.scrollLeft=180;scroll.scrollTop=90
 const state=f.surface.snapshot();expect(isWorkbenchViewState(state)).toBe(true)
 const rows=f.body.querySelector('tbody');rows.prepend(rows.lastElementChild);rows.lastElementChild.children[1].textContent='101'
 f.body.querySelector('input').value='';scroll.scrollLeft=0;scroll.scrollTop=0;f.body.querySelector('details').open=false
 f.surface.apply(state,true)
 expect(f.body.querySelector('input').value).toBe('BTC');expect(scroll.scrollLeft).toBe(180);expect(scroll.scrollTop).toBe(90);expect(f.body.querySelector('details').open).toBe(true)
 const changed=f.body.querySelectorAll('[data-workbench-value-changed]');expect(changed).toHaveLength(1);expect(changed[0].textContent).toBe('101')
 vi.advanceTimersByTime(1200);expect(f.body.querySelector('[data-workbench-value-changed]')).toBeNull()
})
it('does not highlight unchanged values or apply malformed sandbox view states',()=>{
 const f=fixture(),state=f.surface.snapshot();f.surface.apply(state,true);expect(f.body.querySelector('[data-workbench-value-changed]')).toBeNull()
 for(const bad of [{...state,controls:[null]},{...state,controls:[{path:['constructor'],tag:'INPUT',value:'x',checked:false}]},{...state,scroll:[{path:[],x:Infinity,y:0}]},{...state,values:[['x',123]]}])expect(isWorkbenchViewState(bad)).toBe(false)
})
it('pushes refreshing immediately, rejects a stale list and unsubscribes once',async()=>{
 let resolve,send;const off=vi.fn(),store=createComponentDataStatusStore()
 const bridge={setVisible:vi.fn(),request:vi.fn(()=>new Promise(r=>resolve=r)),subscribe:fn=>{send=fn;return off}}
 const monitor=createComponentDataStatusMonitor({sessionId:'s',bridge,store,isVisible:()=>true})
 send({sessionId:'s',rows:[{nodeId:'n',status:'refreshing',lastSuccess:1000}]})
 expect(store.read('s','n').status).toBe('refreshing')
 resolve([{nodeId:'n',status:'idle',lastSuccess:1000}]);await Promise.resolve();await Promise.resolve()
 expect(store.read('s','n').status).toBe('refreshing')
 monitor.dispose();expect(off).toHaveBeenCalledTimes(1)
})

it('rejects other iframe sources and late documents while retaining the prior successful value baseline',async()=>{
 const {createComponentRefreshFeedback}=await import('../scripts/lib/component-data-status.mjs'),{workbenchContentRevision}=await import('../packages/dsh-research-task-runtime/workbench-refresh.js')
 const win=new Window(),doc=win.document;doc.body.innerHTML='<article><div data-research-preview-body><iframe></iframe></div></article>'
 const card=doc.querySelector('article'),frame=doc.querySelector('iframe'),send=vi.spyOn(frame.contentWindow,'postMessage'),feedback=createComponentRefreshFeedback(card)
 clean.push(async()=>{feedback.dispose();await win.happyDOM.abort()})
 const before={values:[['price','100']],controls:[],scroll:[]},after={values:[['price','101']],controls:[],scroll:[]}
 const ready=(source,state,html)=>win.dispatchEvent(new win.MessageEvent('message',{source,data:{type:'sherlock-workbench-ready',state,revision:workbenchContentRevision(html)}}))
 feedback.update({status:'success',refreshSequence:0},'old','template:price:1');ready(frame.contentWindow,before,'old');send.mockClear()
 feedback.update({status:'success',refreshSequence:1},'new','template:price:1')
 ready(win,after,'new');ready(frame.contentWindow,after,'old');expect(send).not.toHaveBeenCalled()
 ready(frame.contentWindow,after,'new')
 expect(send).toHaveBeenCalledWith(expect.objectContaining({type:'sherlock-workbench-restore',animate:true,state:expect.objectContaining({values:[['price','100']]})}),'*')
})

it('keeps the changed-value highlight for 1200ms when the refreshed iframe reports ready before the host timer',()=>{
 vi.useFakeTimers();const win=new Window(),doc=win.document
 doc.body.innerHTML='<article><div data-research-preview-body><iframe></iframe></div></article>'
 const card=doc.querySelector('article'),inner=doc.querySelector('iframe').contentWindow,feedback=createComponentRefreshFeedback(card)
 inner.setTimeout=setTimeout;inner.clearTimeout=clearTimeout
 clean.push(async()=>{feedback.dispose();inner.dispatchEvent(new inner.Event('pagehide'));await win.happyDOM.abort()})
 const old={values:[['price','100']],controls:[],scroll:[]}
 feedback.update({status:'success',refreshSequence:0},'old','price-v1')
 win.dispatchEvent(new win.MessageEvent('message',{source:inner,data:{type:'sherlock-workbench-ready',state:old,revision:workbenchContentRevision('old')}}))
 inner.document.body.innerHTML='<strong data-refresh-key="price">101</strong>'
 vi.spyOn(inner,'postMessage').mockImplementation(data=>inner.dispatchEvent(new inner.MessageEvent('message',{source:inner.parent,data})))
 vi.spyOn(win,'postMessage').mockImplementation(data=>win.dispatchEvent(new win.MessageEvent('message',{source:inner,data})))
 feedback.update({status:'success',refreshSequence:1},'new','price-v1')
 inner.eval('('+installWorkbenchRefresh.toString()+')('+createWorkbenchRefreshSurface.toString()+','+isWorkbenchViewState.toString()+','+JSON.stringify(workbenchContentRevision('new'))+')')
 inner.document.dispatchEvent(new inner.Event('DOMContentLoaded'))
 vi.advanceTimersByTime(81);expect(inner.document.querySelector('[data-workbench-value-changed]')).not.toBeNull()
 vi.advanceTimersByTime(1100);expect(inner.document.querySelector('[data-workbench-value-changed]')).not.toBeNull()
 vi.advanceTimersByTime(100);expect(inner.document.querySelector('[data-workbench-value-changed]')).toBeNull()
})

it('initializes new templates and ordinary edits from their defaults without restoring old filters',()=>{
 const win=new Window(),doc=win.document;doc.body.innerHTML='<article><div data-research-preview-body><iframe></iframe></div></article>'
 const card=doc.querySelector('article'),inner=doc.querySelector('iframe').contentWindow,feedback=createComponentRefreshFeedback(card),send=vi.spyOn(inner,'postMessage')
 clean.push(async()=>{feedback.dispose();await win.happyDOM.abort()})
 const html=(id,n)=>'<select></select><strong>'+n+'</strong><script id="sherlock-template-data" type="application/json">'+JSON.stringify({templateId:id,version:'1'})+'</script>'
 const ready=(source,value)=>win.dispatchEvent(new win.MessageEvent('message',{source:inner,data:{type:'sherlock-workbench-ready',revision:workbenchContentRevision(source),state:{values:[['price','100']],controls:[{path:[0],tag:'SELECT',value,checked:false}],scroll:[]}}}))
 const before=html('old',100),changed=html('new',100),edited=html('new',101)
 feedback.update({status:'idle',refreshSequence:0},before);ready(before,'old-filter')
 send.mockClear();feedback.update({status:'idle',refreshSequence:0},changed);ready(changed,'new-default')
 expect(send).not.toHaveBeenCalled()
 feedback.update({status:'idle',refreshSequence:0},edited);ready(edited,'edited-default')
 expect(send).not.toHaveBeenCalled()
})

it('journal rollback clears cached controls only for the owning iframe',()=>{
 const win=new Window(),doc=win.document;doc.body.innerHTML='<article><div data-research-preview-body><iframe></iframe></div></article>'
 const inner=doc.querySelector('iframe').contentWindow,feedback=createComponentRefreshFeedback(doc.querySelector('article')),send=vi.spyOn(inner,'postMessage')
 clean.push(async()=>{feedback.dispose();await win.happyDOM.abort()})
 feedback.update(null,'histogram')
 const ready=value=>win.dispatchEvent(new win.MessageEvent('message',{source:inner,data:{type:'sherlock-workbench-ready',revision:workbenchContentRevision('histogram'),state:{values:[],controls:[{path:[0],tag:'SELECT',value,checked:false}],scroll:[]}}}))
 ready('4')
 win.dispatchEvent(new win.MessageEvent('message',{source:win,data:{type:'sherlock-interaction-reload'}}));ready('12')
 expect(send.mock.calls.at(-1)[0].state.controls[0].value).toBe('4')
 send.mockClear();win.dispatchEvent(new win.MessageEvent('message',{source:inner,data:{type:'sherlock-interaction-reload'}}));ready('12')
 expect(send).not.toHaveBeenCalled()
})

it('restores persisted semantic drawing anchors after the entire card is unmounted and mounted again',()=>{
 const win=new Window(),doc=win.document;doc.body.innerHTML='<article><div data-research-preview-body><iframe></iframe></div></article>'
 const inner=doc.querySelector('iframe').contentWindow,send=vi.spyOn(inner,'postMessage')
 const state={values:[['chart-view-key:technical-controls',JSON.stringify({dataset:'daily',configs:[{id:'s',kind:'sma',period:5,enabled:true}],drawings:Array.from({length:4},(_,i)=>({dataset:'daily',kind:'trend',points:[{date:'2026-09-03',value:10+i},{date:'2026-09-07',value:11+i}]})),locked:true})]],controls:[],scroll:[]}
 const saved=vi.fn(),feedback=createComponentRefreshFeedback(doc.querySelector('article'),{initialState:state,onState:saved})
 clean.push(async()=>{feedback.dispose();await win.happyDOM.abort()})
 feedback.update(null,'chart','template:market.charting:1')
 const defaults={values:[['chart-view-key:technical-controls','{"drawings":[]}']],controls:[],scroll:[]}
 win.dispatchEvent(new win.MessageEvent('message',{source:inner,data:{type:'sherlock-workbench-ready',revision:workbenchContentRevision('chart'),state:defaults}}))
 expect(send).toHaveBeenCalledWith(expect.objectContaining({state,animate:false}),'*')
 win.dispatchEvent(new win.MessageEvent('message',{source:inner,data:{type:'sherlock-workbench-view',revision:workbenchContentRevision('chart'),state}}))
 expect(saved).toHaveBeenCalledWith(state,workbenchContentRevision('chart'))
})

it('publishes completed pointer drawings and keyboard selections without relying on a following click',()=>{
 vi.useFakeTimers();const win=new Window(),doc=win.document
 doc.body.innerHTML='<section data-workbench-chart-view="{}" data-workbench-view-key="technical-controls"><svg></svg></section>'
 const changed=vi.fn(),surface=createWorkbenchRefreshSurface(doc.body,changed),root=doc.querySelector('section'),svg=doc.querySelector('svg')
 clean.push(async()=>{surface.dispose();await win.happyDOM.abort()})
 root.dataset.workbenchChartView='{"drawings":[{"kind":"trend"}]}'
 svg.dispatchEvent(new win.Event('pointerup',{bubbles:true}));vi.advanceTimersByTime(61)
 expect(changed.mock.calls.at(-1)[0].values).toContainEqual(['chart-view-key:technical-controls',root.dataset.workbenchChartView])
 root.dataset.workbenchChartView='{"selected":"2026-09-03"}'
 svg.dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));vi.advanceTimersByTime(61)
 expect(changed.mock.calls.at(-1)[0].values).toContainEqual(['chart-view-key:technical-controls',root.dataset.workbenchChartView])
})

it('waits for new iframe content when success status arrives before the replacement HTML',()=>{
 vi.useFakeTimers();const win=new Window(),doc=win.document;doc.body.innerHTML='<article><div data-research-preview-body><iframe></iframe></div></article>'
 const inner=doc.querySelector('iframe').contentWindow,feedback=createComponentRefreshFeedback(doc.querySelector('article')),send=vi.spyOn(inner,'postMessage')
 clean.push(async()=>{feedback.dispose();await win.happyDOM.abort()})
 const ready=(html,n)=>win.dispatchEvent(new win.MessageEvent('message',{source:inner,data:{type:'sherlock-workbench-ready',revision:workbenchContentRevision(html),state:{values:[['price',n]],controls:[],scroll:[]}}}))
 feedback.update({status:'idle',refreshSequence:0},'old','price-v1');ready('old','100');send.mockClear()
 feedback.update({status:'success',refreshSequence:1},'old','price-v1');vi.advanceTimersByTime(120);expect(send).not.toHaveBeenCalled()
 feedback.update({status:'success',refreshSequence:1},'new','price-v1');ready('new','101')
 expect(send).toHaveBeenLastCalledWith(expect.objectContaining({animate:true,state:expect.objectContaining({values:[['price','100']]})}),'*')
})

it('animates already loaded new content when HTML arrives before success status',()=>{
 vi.useFakeTimers();const win=new Window(),doc=win.document;doc.body.innerHTML='<article><div data-research-preview-body><iframe></iframe></div></article>'
 const inner=doc.querySelector('iframe').contentWindow,feedback=createComponentRefreshFeedback(doc.querySelector('article')),send=vi.spyOn(inner,'postMessage')
 clean.push(async()=>{feedback.dispose();await win.happyDOM.abort()})
 const ready=(html,n)=>win.dispatchEvent(new win.MessageEvent('message',{source:inner,data:{type:'sherlock-workbench-ready',revision:workbenchContentRevision(html),state:{values:[['price',n]],controls:[],scroll:[]}}}))
 feedback.update({status:'idle',refreshSequence:0},'old','price-v1');ready('old','100')
 feedback.update({status:'refreshing',refreshSequence:0},'old','price-v1')
 feedback.update({status:'refreshing',refreshSequence:0},'new','price-v1');ready('new','101');send.mockClear()
 feedback.update({status:'success',refreshSequence:1},'new','price-v1');vi.advanceTimersByTime(120)
 expect(send).toHaveBeenLastCalledWith(expect.objectContaining({animate:true,state:expect.objectContaining({values:[['price','100']]})}),'*')
})

it('identifies native market metrics by labels when reordered and does not treat chart coordinate changes as values',()=>{
 vi.useFakeTimers();const f=fixture()
 f.body.innerHTML='<div class="market-metrics"><div class="market-metric"><div class="market-label">营收</div><strong class="market-value">100</strong></div><div class="market-metric"><div class="market-label">利润</div><strong class="market-value">20</strong></div></div><svg><circle cx="1" cy="2" r="3"></circle></svg>'
 const state=f.surface.snapshot(),metrics=f.body.firstElementChild
 metrics.prepend(metrics.lastElementChild);f.body.querySelector('circle').setAttribute('cy','20');f.surface.apply(state,true)
 expect(f.body.querySelector('[data-workbench-value-changed]')).toBeNull()
 metrics.firstElementChild.querySelector('strong').textContent='21';f.surface.apply(state,true)
 expect([...f.body.querySelectorAll('[data-workbench-value-changed]')].map(el=>el.textContent)).toEqual(['21'])
})

it('restores chart viewport metadata while keeping it separate from value highlights',()=>{
 const f=fixture();f.body.innerHTML='<svg data-workbench-chart-view="{}"><circle data-refresh-key="price:day" data-refresh-value="100"></circle></svg>'
 const svg=f.body.firstElementChild;svg.setAttribute('data-workbench-chart-view',JSON.stringify({min:50,max:150,start:'01',end:'03'}))
 const state=f.surface.snapshot(),restore=vi.fn();svg.addEventListener('sherlock-chart-restore',event=>restore(event.detail))
 svg.setAttribute('data-workbench-chart-view',JSON.stringify({min:1,max:200,start:'01',end:'04'}));svg.querySelector('circle').setAttribute('data-refresh-value','101')
 f.surface.apply(state,true)
 expect(restore).toHaveBeenCalledWith({min:50,max:150,start:'01',end:'03'})
 expect(f.body.querySelectorAll('[data-workbench-value-changed]')).toHaveLength(1)
})

it('keys research and fund metrics by their visible labels instead of their reordered position',()=>{
 const f=fixture();f.body.innerHTML='<main><article><h2 class="research-metric-label">营收</h2><div class="research-metric-value">100</div></article><article><h2 class="research-metric-label">利润</h2><div class="research-metric-value">20</div></article><div><span class="fund-label">资产规模</span><strong class="fund-value">300</strong></div></main>'
 const state=f.surface.snapshot(),main=f.body.firstElementChild
 main.prepend(main.children[1]);f.surface.apply(state,true)
 expect(f.body.querySelector('[data-workbench-value-changed]')).toBeNull()
 main.firstElementChild.querySelector('.research-metric-value').textContent='21';f.body.querySelector('.fund-value').textContent='310'
 f.surface.apply(state,true)
 expect([...f.body.querySelectorAll('[data-workbench-value-changed]')].map(el=>el.textContent)).toEqual(['21','310'])
})

it('delays the loading stripe, keeps old content readable, and clears feedback immediately on failure and disposal',()=>{
 vi.useFakeTimers();const win=new Window(),doc=win.document;doc.body.innerHTML='<article><div data-research-preview-body><input value="保留筛选"><strong>100</strong></div></article>'
 const card=doc.querySelector('article'),body=doc.querySelector('[data-research-preview-body]'),feedback=createComponentRefreshFeedback(card),input=doc.querySelector('input')
 clean.push(async()=>{feedback.dispose();await win.happyDOM.abort()})
 feedback.update({status:'refreshing'});expect(body.getAttribute('aria-busy')).toBe('true')
 vi.advanceTimersByTime(299);expect(card.hasAttribute('data-component-updating')).toBe(false)
 vi.advanceTimersByTime(2);expect(card.hasAttribute('data-component-updating')).toBe(true)
 expect(input.disabled).toBe(false);expect(doc.querySelector('strong').textContent).toBe('100')
 feedback.update({status:'error'});expect(card.hasAttribute('data-component-updating')).toBe(false);expect(body.hasAttribute('aria-busy')).toBe(false)
 expect(doc.querySelector('input')).toBe(input);expect(doc.querySelector('strong').textContent).toBe('100')
 feedback.update({status:'refreshing'});feedback.dispose();vi.advanceTimersByTime(400)
 expect(card.hasAttribute('data-component-updating')).toBe(false);expect(body.hasAttribute('aria-busy')).toBe(false)
})

it('pending initial restoration keeps a newer user input',()=>{
 vi.useFakeTimers();const win=new Window();win.document.body.innerHTML='<iframe></iframe>'
 const inner=win.document.querySelector('iframe').contentWindow,doc=inner.document;inner.setTimeout=setTimeout;inner.clearTimeout=clearTimeout;doc.body.innerHTML='<input value=""><details><summary>Sources</summary></details>'
 clean.push(async()=>{inner.dispatchEvent(new inner.Event('pagehide'));await win.happyDOM.abort()})
 inner.eval('('+installWorkbenchRefresh.toString()+')('+createWorkbenchRefreshSurface.toString()+','+isWorkbenchViewState.toString()+',"revision")');doc.dispatchEvent(new inner.Event('DOMContentLoaded'))
 const state={values:[],controls:[{path:[0],tag:'INPUT',value:'saved search',checked:false}],scroll:[]}
 const restore=()=>inner.dispatchEvent(new inner.MessageEvent('message',{source:inner.parent,data:{type:'sherlock-workbench-restore',revision:'revision',animate:false,state}}))
 const input=doc.querySelector('input');restore();vi.advanceTimersByTime(81);expect(input.value).toBe('saved search')
 restore();input.value='new search';input.dispatchEvent(new inner.Event('input',{bubbles:true}));vi.advanceTimersByTime(81)
 expect(input.value).toBe('new search')
})

it('journal replay during pending restoration keeps saved scroll instead of treating replay as a new user edit',()=>{
 vi.useFakeTimers();const win=new Window();win.document.body.innerHTML='<iframe></iframe>'
 const inner=win.document.querySelector('iframe').contentWindow,doc=inner.document;inner.setTimeout=setTimeout;inner.clearTimeout=clearTimeout;doc.body.innerHTML='<input value=""><div style="overflow:auto">可滚动表格</div>'
 clean.push(async()=>{inner.dispatchEvent(new inner.Event('pagehide'));await win.happyDOM.abort()})
 inner.eval('('+installWorkbenchRefresh.toString()+')('+createWorkbenchRefreshSurface.toString()+','+isWorkbenchViewState.toString()+',"revision")');doc.dispatchEvent(new inner.Event('DOMContentLoaded'))
 const state={values:[],controls:[{path:[0],tag:'INPUT',value:'已保存筛选',checked:false}],scroll:[{path:[1],x:0,y:96}]}
 inner.dispatchEvent(new inner.MessageEvent('message',{source:inner.parent,data:{type:'sherlock-workbench-restore',state,animate:false,revision:'revision'}}))
 doc.documentElement.setAttribute('data-sherlock-interaction-replaying','');doc.querySelector('input').value='已保存筛选';doc.querySelector('input').dispatchEvent(new inner.Event('input',{bubbles:true}));doc.documentElement.removeAttribute('data-sherlock-interaction-replaying')
 vi.advanceTimersByTime(81)
 expect(doc.querySelector('input').value).toBe('已保存筛选');expect(doc.querySelector('div').scrollTop).toBe(96)
})
