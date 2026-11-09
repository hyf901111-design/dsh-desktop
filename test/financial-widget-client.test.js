import {afterEach,it,expect,vi} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import * as financialClient from '../scripts/lib/financial-widget-client.mjs'
const close=[];afterEach(async()=>{for(const fn of close.splice(0))await fn()})
const s={code:'600519',name:'贵州茅台',market:'SH'},other={code:'000001',name:'平安银行',market:'SZ'}
const bars=Array.from({length:80},(_,i)=>({date:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),open:100+i,high:105+i,low:98+i,close:102+i,volume:i%2?0:1000}))
const service=()=>({request:vi.fn(async q=>q.action==='search'?{symbols:[s,other]}:q.action==='history'?{bars,volumeUnit:'股',source:'测试通联',receivedAt:'2026-10-09T01:00:00Z'}:q.action==='news'?{news:[{id:'n',title:'本人原始新闻',source:'本人新闻来源',url:'https://example.org/news',time:'2026-10-09 10:00'}],source:'测试通联'}:{quotes:q.symbols.map(x=>({...x,price:100,changePercent:x.market==='SH'?0:-2,asOf:'2026-10-08'})),source:'测试通联',receivedAt:'2026-10-09T01:00:00Z'})})
async function fixture(desktop={}){const f=await financialClientFixture({financialWidget:service(),...desktop},{refreshState:true});close.push(f.dispose);return f}
it('备用行情在选择器中禁用不支持的复权选项，保留不复权和其他周期操作',async()=>{
 const f=await fixture();let quote
 await f.act(async()=>{quote=f.workspace.createFinancialWidget('quote')})
 const select=()=>f.host.querySelector('select[aria-label="复权方式"]')
 expect(select().querySelector('option[value="none"]').disabled).toBe(false)
 expect(select().querySelector('option[value="forward"]').disabled).toBe(true)
 expect(select().querySelector('option[value="backward"]').disabled).toBe(true)
 expect(f.host.querySelectorAll('.ew-quote-periods button')).toHaveLength(5)
 expect([...f.host.querySelectorAll('.ew-quote-periods button')].some(b=>b.disabled)).toBe(false)
 await f.act(async()=>f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map(n=>n.id===quote.id?{...n,containerSpec:{...n.containerSpec,dataSource:'default'}}:n)))
 expect(select().querySelector('option[value="forward"]').disabled).toBe(false)
},30000)
it('Shift 点击组件正文、图表和标题可追加或取消多选，不触发内部选股；搜索仍可编辑',async()=>{
 const f=await fixture();let watch,quote
 await f.act(async()=>{watch=f.workspace.createFinancialWidget('watchlist');quote=f.workspace.createFinancialWidget('quote');f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map(n=>({...n,containerSpec:{...n.containerSpec,symbols:n.id===watch.id?[s,other]:[s]}})));f.workspace.updateSelection([quote.id],'replace')})
 await vi.waitFor(()=>expect(f.host.querySelector('[data-financial-chart]')).not.toBeNull())
 const row=f.host.querySelector('[data-stock-code="000001"] .ew-watch-name'),chart=f.host.querySelector('[data-financial-chart]')
 // Native embedded controls can stop bubbling before the legacy canvas listener.
 row.addEventListener('pointerdown',e=>e.stopPropagation());chart.addEventListener('pointerdown',e=>e.stopPropagation())
 await f.event('pointerdown',row,{button:0,pointerId:1,shiftKey:true});await f.event('pointerup',row,{button:0,pointerId:1,shiftKey:true});await f.event('click',row,{button:0,shiftKey:true})
 expect(new Set(f.workspace.getSnapshot().selection.selectedNodeIds)).toEqual(new Set([watch.id,quote.id]));expect(f.workspace.getSnapshot().artifacts.find(n=>n.id===watch.id).containerSpec.selectedSymbol).toBeUndefined()
 await f.event('pointerdown',chart,{button:0,shiftKey:true});await f.event('click',chart,{button:0,shiftKey:true})
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual([watch.id])
 const title=f.host.querySelector('[data-research-node-id="'+quote.id+'"] .ew-grid-title')
 await f.event('pointerdown',title,{button:0,shiftKey:true});await f.event('click',title,{button:0,shiftKey:true})
 expect(f.workspace.getSnapshot().selection.selectedNodeIds).toHaveLength(2)
 const input=f.host.querySelector('input[role=combobox]');expect((await f.event('pointerdown',input,{button:0,shiftKey:true})).defaultPrevented).toBe(false);expect(f.workspace.getSnapshot().selection.selectedNodeIds).toHaveLength(2)
 await f.event('pointerdown',row,{button:0});await f.event('click',row,{button:0});expect(f.workspace.getSnapshot().artifacts.find(n=>n.id===watch.id).containerSpec.selectedSymbol).toBe('SZ:000001')
})
it('行情标注区分上游时刻、休市和获取时间，按各市场时区显示',()=>{
 const q={...s,source:'新浪财经',quotedAt:'2026-10-09T07:34:59Z',asOf:'2026-10-09'}
 const info=financialClient.financialQuoteInfo([q],new Date('2026-10-10T03:00:00Z'))
 expect(info.state).toBe('休市');expect(info.text).toContain('新浪财经 · 行情 10/09 15:34');expect(info.title).toContain('15:34:59');expect(info.title).toContain('Asia/Shanghai')
 const mainland=financialClient.financialQuoteInfo([q,{...other,source:'新浪财经',quotedAt:'2026-10-09T07:36:00Z'}],new Date('2026-10-10T03:00:00Z'))
 expect(mainland.text).toContain('行情 10/09 15:34');expect(mainland.text).not.toContain('各市场')
 const us={market:'US',code:'AAPL',name:'苹果',source:'腾讯财经',quotedAt:'2026-10-09T20:00:01Z'}
 expect(financialClient.financialQuoteInfo([us],new Date('2026-10-09T20:10:00Z')).text).toContain('10/09 16:00')
 expect(financialClient.financialQuoteInfo([us],new Date('2026-10-12T01:30:00Z')).state).toBe('休市')
 expect(financialClient.financialQuoteInfo([q,us],new Date('2026-10-10T03:00:00Z')).text).toContain('各市场')
})
it('盘中旧报价和缺失时刻不会冒充实时，报价时间不以获取时间替代',()=>{
 const now=new Date('2026-10-09T02:00:00Z'),q={...s,quotedAt:'2026-10-09T01:59:00Z',source:'腾讯财经'}
 expect(financialClient.financialQuoteInfo([q],now).state).toBe('更新中')
 expect(financialClient.financialQuoteInfo([{...q,quotedAt:'2026-10-08T07:00:00Z'}],now).state).toBe('时效待确认')
 const missing=financialClient.financialQuoteInfo([{...q,quotedAt:null,asOf:'2026-10-08'}],now)
 expect(missing.state).toBe('时效待确认');expect(missing.text).not.toContain('10:00');expect(missing.title).toContain('时刻未提供')
})
it('海外指数页脚使用交易所时区和上游交易状态，不套用A股交易时段',()=>{
 const q={market:'INDEX',code:'^N225',name:'日经225',source:'Yahoo Finance',quotedAt:'2026-10-09T06:00:00Z',timeZone:'Asia/Tokyo',marketState:'closed'}
 const info=financialClient.financialQuoteInfo([q],new Date('2026-10-09T06:05:00Z'))
 expect(info.state).toBe('休市');expect(info.text).toContain('10/09 15:00');expect(info.title).toContain('Asia/Tokyo')
 expect(financialClient.financialQuoteInfo([{...q,marketState:'open'}],new Date('2026-10-09T06:01:00Z')).state).toBe('更新中')
 expect(financialClient.financialQuoteInfo([{...q,marketState:'open'}],new Date('2026-10-09T06:10:00Z')).state).toBe('时效待确认')
})
it('组件页脚呈现实际报价来源和时刻，同时保留最近获取时间',async()=>{
 const bridge=service();bridge.request.mockResolvedValue({quotes:[{...s,price:1263,changePercent:.57,source:'新浪财经',quotedAt:'2026-10-09T07:34:59Z',asOf:'2026-10-09'}],source:'新浪财经',receivedAt:'2026-10-10T03:00:00Z'})
 const f=await fixture({financialWidget:bridge});await f.act(async()=>{const n=f.workspace.createFinancialWidget('watchlist');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s]}}])})
 await vi.waitFor(()=>expect(f.host.querySelector('.ew-financial-footer').textContent).toContain('行情 10/09 15:34'))
 expect(f.host.querySelector('.ew-financial-provenance').title).toContain('每60秒刷新');expect(f.host.querySelector('.ew-financial-footer').textContent).toContain('获取')
})
it('分时绘制实际价格折线和分钟时间，不显示伪造的开高低收',async()=>{
 const bridge=service(),points=[{date:'2026-10-09T09:30:00+08:00',open:100,high:100,low:100,close:100,volume:20},{date:'2026-10-09T09:31:00+08:00',open:102,high:102,low:102,close:102,volume:30}]
 bridge.request.mockImplementation(async q=>q.action==='history'?{bars:points,nativePeriod:true,source:'腾讯财经',volumeUnit:'手'}:{quotes:[{...s,price:102,changePercent:2}],source:'腾讯财经'})
 const f=await fixture({financialWidget:bridge});await f.act(async()=>{const n=f.workspace.createFinancialWidget('quote');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s],period:'1m'}}])})
 await vi.waitFor(()=>expect(f.host.querySelector('[data-financial-chart]')).not.toBeNull())
 expect(f.host.querySelector('[data-chart-series=intraday]')).not.toBeNull();expect(f.host.querySelector('.ew-quote-ohlc').textContent).toContain('09:31');expect(f.host.querySelector('.ew-quote-ohlc').textContent).not.toContain('开 ')
 expect(f.host.querySelector('[data-financial-chart]').textContent).toContain('09:30');expect(f.host.querySelector('[data-financial-chart] svg').getAttribute('aria-label')).toContain('分时')
})
it('新闻输入框Enter直接提交关键词，不依赖宿主的隐式表单提交；输入法确认不触发搜索',async()=>{
 const bridge=service(),f=await fixture({financialWidget:bridge});await f.act(async()=>f.workspace.createFinancialWidget('news'))
 const input=f.host.querySelector('input[aria-label="搜索相关新闻"]');await f.input(input,' 茅台 ')
 expect(input.closest('.ew-grid-header')).not.toBeNull();expect(f.host.querySelector('[data-financial-widget=news] input')).toBeNull()
 expect(f.host.contains(input)).toBe(true);expect(input.value).toBe(' 茅台 ')
 await f.event('focusin',input)
 await f.event('keydown',input,{key:'Enter',keyCode:229,isComposing:true});expect(f.workspace.getSnapshot().artifacts[0].containerSpec.query).toBe('')
 const entered=await f.event('keydown',f.host.querySelector('input[aria-label="搜索相关新闻"]'),{key:'Enter',keyCode:13,isComposing:false});expect(entered.defaultPrevented).toBe(true);expect(f.workspace.getSnapshot().artifacts[0].containerSpec.query).toBe('茅台')
 await vi.waitFor(()=>expect(bridge.request).toHaveBeenCalledWith(expect.objectContaining({action:'news',query:'茅台'})))
})
it('新闻和公告标题通过桌面桥打开原文，保留普通浏览器链接回退',async()=>{
 const openExternal=vi.fn(async()=>({ok:true})),bridge=service()
 bridge.openExternal=openExternal
 bridge.request.mockImplementation(async q=>q.action==='announcements'?{announcements:[{id:'a',title:'公司公告',date:'2026-10-10',url:'https://example.org/announcement.pdf'}]}:{news:[{id:'n',title:'市场新闻',url:'https://example.org/news'}]})
 const f=await fixture({financialWidget:bridge});await f.act(async()=>{f.workspace.createFinancialWidget('news');const n=f.workspace.createFinancialWidget('announcements');f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map(x=>x.id===n.id?{...x,containerSpec:{...x.containerSpec,symbols:[s]}}:x))})
 await vi.waitFor(()=>expect(f.host.querySelectorAll('a.ew-news-title')).toHaveLength(2))
 for(const link of f.host.querySelectorAll('a.ew-news-title')){const clicked=await f.event('click',link);expect(clicked.defaultPrevented).toBe(true);expect(openExternal).toHaveBeenCalledWith(link.href)}
 expect(openExternal).toHaveBeenCalledTimes(2)
 delete bridge.openExternal
 const fallback=f.host.querySelector('a.ew-news-title');expect((await f.event('click',fallback)).defaultPrevented).toBe(false);expect(fallback.target).toBe('_blank');expect(fallback.rel).toContain('noopener')
})
it('六项列表直接放置、选中和恢复，保留原节点，无配置面板及模型任务',async()=>{
 const f=await fixture();await f.event('click',f.document.querySelector('[data-financial-library]'));const items=[...f.document.querySelectorAll('[data-financial-place]')];expect(items.map(x=>x.dataset.financialPlace)).toEqual(['watchlist','quote','indices','news','announcements','calendar']);await f.event('click',items[0]);expect(f.workspace.getSnapshot().artifacts[0].containerSpec.widget).toBe('watchlist');expect(f.document.querySelector('[role=dialog][open]')).toBeNull()
 await f.act(async()=>['quote','indices','news'].forEach(k=>f.workspace.createFinancialWidget(k)));expect(f.workspace.getSnapshot().artifacts).toHaveLength(4);expect(f.workspace.getSnapshot().selection.selectedNodeIds).toEqual([f.workspace.getSnapshot().artifacts[3].id]);expect(f.host.querySelectorAll('[data-financial-widget]')).toHaveLength(4);expect(f.generation.generate).not.toHaveBeenCalled()
 const reopened=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test');expect(reopened.getSnapshot().artifacts.map(n=>n.containerSpec.widget)).toEqual(['watchlist','quote','indices','news'])
})
it('组件库六项菜单，关闭与加号独立对齐，点击加号直接放置',async()=>{
 const f=await fixture();await f.event('click',f.document.querySelector('[data-financial-library]'));
 const menu=f.document.querySelector('.ew-financial-library');expect(menu.querySelector('p')).toBeNull();expect(f.document.activeElement).toBe(menu);
 await f.event('keydown',menu,{key:'ArrowUp'});expect(f.document.activeElement.dataset.financialPlace).toBe('calendar');await f.event('keydown',menu,{key:'Home'});expect(f.document.activeElement.dataset.financialPlace).toBe('watchlist');
 expect(menu.querySelector('[aria-label="关闭组件库"] .ew-financial-icon').dataset.financialIcon).toBe('close');
 const action=menu.querySelector('[data-financial-place=watchlist] .ew-financial-place-action');expect(action.querySelector('[data-financial-icon=plus]')).not.toBeNull();
 await f.event('click',action);expect(f.workspace.getSnapshot().artifacts[0].containerSpec.widget).toBe('watchlist');expect(f.document.querySelector('.ew-financial-library')).toBeNull();
})
it('联想空输入不弹说明，候选只显示名称代码；键盘选择仍有效',async()=>{
 const f=await fixture();await f.act(async()=>f.workspace.createFinancialWidget('quote'));await f.event('focusin',f.host.querySelector('input[aria-label="搜索个股代码或名字"]'));
 const input=f.host.querySelector('input[role=combobox]');expect(input.getAttribute('aria-expanded')).toBe('false');expect(f.document.querySelector('.ew-financial-suggestions')).toBeNull();
 await f.input(input,'茅台');await vi.waitFor(()=>expect(f.document.querySelectorAll('.ew-financial-suggestions [role=option]')).toHaveLength(2));
 const popup=f.document.querySelector('.ew-financial-suggestions');expect(popup.querySelector('p')).toBeNull();expect(popup.textContent).not.toMatch(/输入代码|选择结果|Enter|Esc|匹配标的/);
 await f.event('keydown',input,{key:'ArrowDown'});await f.event('keydown',input,{key:'Enter'});expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toEqual([other]);
})
it('自选在组件内搜索添加、防重复、右键删除、拖拽并持久保存，未知数据为破折号',async()=>{
 const f=await fixture();await f.act(async()=>f.workspace.createFinancialWidget('watchlist'));let card=f.host.querySelector('[data-financial-widget=watchlist]');await f.event('click',card.querySelector('[aria-label=添加自选股]'));await f.input(card.querySelector('input'),'茅台');await vi.waitFor(()=>expect(f.document.querySelectorAll('.ew-financial-suggestions [role=option]')).toHaveLength(2));await f.event('keydown',card.querySelector('input'),{key:'Enter',isComposing:true});expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toHaveLength(0);await f.event('keydown',card.querySelector('input'),{key:'Enter'});expect(card.textContent).toContain('贵州茅台');expect(card.querySelector('[data-stock-code] strong').textContent).toBe('贵州茅台');expect(card.querySelector('[data-stock-code] small').textContent).toBe('SH')
 await f.event('click',card.querySelector('[aria-label=添加自选股]'));await f.input(card.querySelector('input'),'平安');await vi.waitFor(()=>expect(f.document.querySelectorAll('.ew-financial-suggestions [role=option]')).toHaveLength(2));await f.event('click',f.document.querySelectorAll('.ew-financial-suggestions [role=option]')[1]);expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toEqual([other,s])
 const row=card.querySelector('[data-stock-code="000001"]');await f.event('dragstart',row.querySelector('.ew-watch-name'),{dataTransfer:{setData(){}}});await f.event('drop',card.querySelector('[data-stock-code="600519"]'));expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toEqual([s,other])
 await f.event('contextmenu',card.querySelector('[data-stock-code="600519"]'),{clientX:20,clientY:80});await f.event('click',f.document.querySelector('.ew-financial-row-menu [role=menuitem]'));expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toEqual([other]);const reopened=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for('financial-test');expect(reopened.getSnapshot().artifacts[0].containerSpec.symbols).toEqual([other]);expect(card.textContent).not.toContain('各市场原币报价')
})
it('标题栏选股与周期配置在组件内完成，图表绘制真实输入与指标',async()=>{
 const f=await fixture();await f.act(async()=>f.workspace.createFinancialWidget('quote'));await f.event('focusin',f.host.querySelector('input[aria-label="搜索个股代码或名字"]'));await f.input(f.host.querySelector('input[role=combobox]'),'600519');await vi.waitFor(()=>expect(f.document.querySelectorAll('.ew-financial-suggestions [role=option]')).toHaveLength(2));await f.event('click',f.document.querySelector('.ew-financial-suggestions [role=option]'));await vi.waitFor(()=>expect(f.host.querySelector('[data-financial-chart]')).not.toBeNull());expect(f.host.querySelectorAll('[data-financial-chart] rect').length).toBeGreaterThan(100);expect(f.host.textContent).toContain('MA20');expect(f.host.textContent).toContain('MACD(12,26,9)');expect(f.document.querySelector('[role=dialog][open]')).toBeNull()
 await f.event('click',[...f.host.querySelectorAll('.ew-quote-controls button')].find(b=>b.textContent==='周K'));expect(f.workspace.getSnapshot().artifacts[0].containerSpec.period).toBe('1w')
})
it('只读画布禁用新增、内联变更及右键删除，不创建任务',async()=>{
 let shared=false;const f=await fixture({researchBoards:{isSharedSession:()=>shared}});await f.act(async()=>f.workspace.createFinancialWidget('watchlist'));shared=true;await f.render();expect(f.document.querySelector('[data-financial-library]').disabled).toBe(true);expect(f.host.querySelector('[aria-label=添加自选股]').disabled).toBe(true);expect(f.generation.generate).not.toHaveBeenCalled()
})
it('指数绘制输入行情曲线；刷新等待真实结果并绕过缓存',async()=>{
 const bridge=service();bridge.request.mockImplementation(async q=>({quotes:q.symbols.map(x=>({...x,price:100,changePercent:0,asOf:'2026-10-08',series:[98,99,100]})),source:'测试通联',receivedAt:'2026-10-09T01:00:00Z'}));const f=await fixture({financialWidget:bridge});await f.act(async()=>f.workspace.createFinancialWidget('indices'));await vi.waitFor(()=>expect(f.host.querySelectorAll('[data-financial-sparkline]')).toHaveLength(6));let refreshed;await f.act(async()=>{refreshed=await f.host.querySelector('[data-financial-widget]').__eworkRefreshFinancial()});expect(refreshed.message).toContain('已刷新');expect(bridge.request.mock.calls.at(-1)[0].refresh).toBe(true)
})
it('个股联想在外部点击后收起，旧搜索结果不能覆盖新关键词',async()=>{
 const waiting=[];const bridge=service();bridge.request.mockImplementation(q=>q.action==='search'?new Promise(release=>waiting.push({query:q.query,release})):Promise.resolve({quotes:[],source:'测试通联'}));const f=await fixture({financialWidget:bridge});await f.act(async()=>f.workspace.createFinancialWidget('quote'));await f.event('focusin',f.host.querySelector('input[aria-label="搜索个股代码或名字"]'));const input=f.host.querySelector('input[role=combobox]');await f.input(input,'600');await vi.waitFor(()=>expect(waiting).toHaveLength(1));await f.input(input,'000');await vi.waitFor(()=>expect(waiting).toHaveLength(2));await f.act(async()=>waiting[1].release({symbols:[other]}));await f.act(async()=>waiting[0].release({symbols:[s]}));expect(f.document.querySelector('.ew-financial-suggestions [role=option]').textContent).toContain('平安银行');expect(f.document.querySelector('.ew-financial-suggestions').textContent).not.toContain('贵州茅台');await f.event('pointerdown',f.document.body);expect(f.host.querySelector('input[role=combobox]')).toBe(input);expect(input.value).toBe('');expect(f.document.querySelector('.ew-financial-suggestions')).toBeNull()
})
it('周K原生周期不重复聚合；原生行情沿统一数据源入口配置',async()=>{
 const bridge=service();bridge.request.mockImplementation(async q=>q.action==='history'?{bars:bars.slice(0,8),nativePeriod:true,source:'测试通联'}:{quotes:[{...s,price:100,changePercent:0}],source:'测试通联'});const f=await fixture({financialWidget:bridge});await f.act(async()=>{const n=f.workspace.createFinancialWidget('quote');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s],period:'1w'}}])});await vi.waitFor(()=>expect(f.host.querySelector('[data-financial-chart]')).not.toBeNull());expect(f.host.querySelectorAll('[data-financial-chart] rect[width="48"]')).toHaveLength(1);expect(f.host.querySelectorAll('[data-financial-chart] line[stroke="var(--fw-positive)"]:not([stroke-dasharray])')).toHaveLength(8);await f.event('click',f.host.querySelector('[data-workbench-more]'));expect(f.document.querySelector('[role=menu][aria-label="组件更多操作"]').textContent).toContain('数据源与自动更新');expect(f.document.querySelector('[role=menu][aria-label="组件更多操作"]').textContent).toContain('刷新行情与资讯');await f.event('click',[...f.document.querySelectorAll('[role=menuitem]')].find(item=>item.textContent==='数据源与自动更新'));expect(f.document.querySelector('[role=dialog][aria-label="组件数据与自动更新"]')).not.toBeNull()
})
it('拖拽按证券身份处理并发新增，不移动错行',async()=>{
 const f=await fixture(),third={code:'00700',market:'HK',name:'腾讯控股'};await f.act(async()=>{const n=f.workspace.createFinancialWidget('watchlist');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s,other]}}])});const card=f.host.querySelector('[data-financial-widget=watchlist]');await f.event('dragstart',card.querySelector('[data-stock-code="600519"] .ew-watch-name'),{dataTransfer:{setData(){}}});await f.act(async()=>{const n=f.workspace.getSnapshot().artifacts[0];f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[third,s,other]}}])});await f.event('drop',card.querySelector('[data-stock-code="000001"]'));expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toEqual([third,other,s])
})
it('港股周K顶部OHLC与图表使用同一聚合结果',async()=>{
 const input=[{date:'2026-10-05',open:10,high:20,low:9,close:12,volume:100},{date:'2026-10-06',open:12,high:15,low:11,close:13,volume:200},{date:'2026-10-09',open:16,high:18,low:15,close:17,volume:300}],bridge=service();bridge.request.mockImplementation(async q=>q.action==='history'?{bars:input,nativePeriod:false,source:'测试通联'}:{quotes:[],source:'测试通联'});const f=await fixture({financialWidget:bridge});await f.act(async()=>{const n=f.workspace.createFinancialWidget('quote');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[{code:'00700',market:'HK',name:'腾讯控股'}],period:'1w'}}])});await vi.waitFor(()=>expect(f.host.querySelector('[data-financial-chart]')).not.toBeNull());expect(f.host.querySelector('.ew-quote-ohlc').textContent).toContain('开 10.000  高 20.000  低 9.000  收 17.000')
})
it('画布滚动被内容边界限制时仍保留已取得的报价',async()=>{
 const f=await fixture();await f.act(async()=>{const n=f.workspace.createFinancialWidget('watchlist');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s]}}]);['quote','indices','news'].forEach(k=>f.workspace.createFinancialWidget(k))});await vi.waitFor(()=>expect(f.host.querySelector('.ew-watch-price').textContent).toBe('100.00'))
 await f.act(async()=>f.workspace.setViewport({x:0,y:-1400,scale:1}));expect(f.workspace.getSnapshot().viewport.y).toBeLessThan(0);expect(f.host.querySelector('.ew-watch-price').textContent).toBe('100.00')
 await f.act(async()=>f.workspace.setViewport({x:0,y:0,scale:1}));await vi.waitFor(()=>expect(f.host.querySelector('.ew-watch-price').textContent).toBe('100.00'))
})
it('整理固定组件使用完整阅读高度，不按搜索框或当前SVG裁切高度压缩',async()=>{
 const {measureWorkbenchContents}=await import('../scripts/lib/research-grid-ui.mjs'),{researchOptimalDimensions}=await import('../packages/dsh-research-task-runtime/bento-layout.js'),{runInNewContext}=await import('node:vm');const f=await fixture();await f.act(async()=>['watchlist','quote','indices','news'].forEach(k=>f.workspace.createFinancialWidget(k)))
 const nodes=f.workspace.getSnapshot().artifacts;for(const n of nodes){const card=f.host.querySelector('[data-research-node-id="'+n.id+'"]');card.getBoundingClientRect=()=>({top:0,height:180,width:700});for(const el of card.querySelectorAll('input,svg,p,select'))el.getBoundingClientRect=()=>({top:42,bottom:66,width:200,height:24})}
 const measured=runInNewContext('('+measureWorkbenchContents.toString()+')',{researchOptimalDimensions,CSS:f.win.CSS})(f.canvas,nodes);expect(nodes.map(n=>measured.get(n.id)?.height)).toEqual([202,600,200,340])
})
it('新闻时间使用紧凑时分，完整发布日期保留在可访问属性中',async()=>{
 const bridge=service();bridge.request.mockImplementation(async()=>({news:[{id:'n',title:'本人新闻',source:'原始来源',time:'2026-10-09T18:34:20.515+0800'}],source:'测试通联'}));const f=await fixture({financialWidget:bridge});await f.act(async()=>f.workspace.createFinancialWidget('news'));await vi.waitFor(()=>expect(f.host.querySelector('time')).not.toBeNull());const time=f.host.querySelector('time');expect(time.querySelector('span').textContent).toBe('18:34');expect(time.querySelector('.ew-news-date').textContent).toBe('10/09');expect(time.title).toBe('2026-10-09T18:34:20.515+0800')
})
it('连续原生拖拽事件无需等待React渲染即可接受放下并排序',async()=>{
 const f=await fixture();await f.act(async()=>{const n=f.workspace.createFinancialWidget('watchlist');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s,other]}}])});const first=f.host.querySelector('[data-stock-code="600519"] .ew-watch-name'),second=f.host.querySelector('[data-stock-code="000001"]');let over
 await f.act(async()=>{const start=new f.win.Event('dragstart',{bubbles:true,cancelable:true});Object.defineProperty(start,'dataTransfer',{value:{setData(){}}});first.dispatchEvent(start);over=new f.win.Event('dragover',{bubbles:true,cancelable:true});second.dispatchEvent(over);second.dispatchEvent(new f.win.Event('drop',{bubbles:true,cancelable:true}))});expect(over.defaultPrevented).toBe(true);expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toEqual([other,s])
})
it('固定组件打开整框右键菜单不会落入普通正文导出并使画布崩溃',async()=>{
 const f=await fixture();await f.act(async()=>f.workspace.createFinancialWidget('watchlist'));await f.event('contextmenu',f.host.querySelector('[data-research-node-id]'),{clientX:100,clientY:100});expect(f.host.querySelector('[data-research-canvas]')).not.toBeNull();expect(f.document.querySelector('[role=menu]')).not.toBeNull()
})
it('自选行的原生右键仅显示股票菜单，不叠加整框菜单',async()=>{
 const f=await fixture();await f.act(async()=>{const n=f.workspace.createFinancialWidget('watchlist');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s,other]}}])});const stamp=f.document.createElement('div');stamp.setAttribute('data-research-generation-process','');f.host.querySelector('[data-research-node-id]').append(stamp);await f.event('contextmenu',f.host.querySelector('[data-stock-code="600519"]'),{clientX:20,clientY:80});const menus=[...f.document.querySelectorAll('[role=menu]')];expect(menus).toHaveLength(1);expect(menus[0].textContent).toBe('从自选中移除')
})
it('鼠标指针拖拽跨股票行排序，不依赖浏览器文件拖放',async()=>{
 const f=await fixture();await f.act(async()=>{const n=f.workspace.createFinancialWidget('watchlist');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s,other]}}])});const first=f.host.querySelector('[data-stock-code="600519"] .ew-watch-name'),second=f.host.querySelector('[data-stock-code="000001"]');f.document.elementFromPoint=()=>second
 await f.event('pointerdown',first,{button:0,pointerId:1,clientX:30,clientY:100});await f.event('pointermove',first,{pointerId:1,clientX:30,clientY:140});await f.event('pointerup',first,{pointerId:1,clientX:30,clientY:140});expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toEqual([other,s])
})

it('个股搜索使用标题栏唯一输入位置；联想浮层独立于卡片裁切并保留键盘选取',async()=>{
 const f=await fixture();await f.act(async()=>f.workspace.createFinancialWidget('quote'));await f.event('focusin',f.host.querySelector('input[aria-label="搜索个股代码或名字"]'));expect(f.host.querySelector('.ew-financial-header-selector [data-financial-icon=chevron]')).toBeNull();expect(f.host.querySelectorAll('input[role=combobox]')).toHaveLength(1);expect(f.host.querySelector('.ew-financial-header-selector input')).not.toBeNull();await f.input(f.host.querySelector('input[role=combobox]'),'600519');await vi.waitFor(()=>expect(f.document.querySelector('[role=listbox] [role=option]')).not.toBeNull());expect(f.host.querySelector('[role=listbox]')).toBeNull();await f.event('pointerdown',f.document.querySelector('.ew-financial-suggestions [role=option]'));expect(f.host.querySelector('input[role=combobox]')).not.toBeNull();await f.event('keydown',f.host.querySelector('input'),{key:'Enter'});expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toEqual([s])
})
it('自选自然高度保持原契约，标准整理同行拉齐且保留行情和列表宽度比例',async()=>{
 const {financialWidgetDimensions}=await import('../packages/dsh-research-task-runtime/financial-widget-contract.js'),{createResearchGrid}=await import('../packages/dsh-research-task-runtime/research-grid.js');const f=await fixture();await f.act(async()=>{const watch=f.workspace.createFinancialWidget('watchlist');f.workspace.setArtifacts([{...watch,containerSpec:{...watch.containerSpec,symbols:[s,other]}}]);f.workspace.createFinancialWidget('quote')});let nodes=f.workspace.getSnapshot().artifacts.map(n=>({...n,preferred:financialWidgetDimensions(n.containerSpec)}));expect(nodes[0].preferred).toEqual({width:320,height:202});expect(financialWidgetDimensions({...nodes[0].containerSpec,symbols:Array(20).fill(s)}).height).toBe(562)
 const grid=createResearchGrid(),items=nodes.map((n,i)=>({id:n.id,x:i?14:0,y:0,w:i?26:14,h:20})),width=1280,layout=grid.arrange(nodes,items,width),projected=grid.project(nodes,layout,width);expect(layout.map(c=>[c.x,c.w])).toEqual([[0,14],[14,26]]);expect(projected[0].height).toBe(projected[1].height);expect(projected[1].height).toBeGreaterThanOrEqual(600);expect(grid.overlap(layout[0],layout[1])).toBe(false);expect(grid.arrange(nodes,layout,width)).toEqual(layout)
})
it('行情图方向键同步当前OHLC和指标读数，离开后恢复末期',async()=>{
 const f=await fixture();await f.act(async()=>{const n=f.workspace.createFinancialWidget('quote');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s]}}])});await vi.waitFor(()=>expect(f.host.querySelector('[data-financial-chart]')).not.toBeNull());const svg=f.host.querySelector('[data-financial-chart] svg');await f.event('keydown',svg,{key:'Home'});expect(f.host.querySelector('.ew-quote-ohlc').textContent).toContain('开 100.00');await f.event('keydown',svg,{key:'End'});expect(f.host.querySelector('.ew-quote-ohlc').textContent).toContain('开 179.00')
})
it('未选中行情组件时滚轮滚动看板，选中后才缩放图表，取消选择立即恢复页面滚动',async()=>{
 const history=Array.from({length:240},(_,i)=>({date:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),open:100+i,high:105+i,low:98+i,close:102+i,volume:1000})),bridge=service()
 bridge.request.mockImplementation(async q=>q.action==='history'?{bars:history,nativePeriod:true,source:'测试行情'}:{quotes:q.symbols.map(x=>({...x,price:341,changePercent:1})),source:'测试行情'})
 const f=await fixture({financialWidget:bridge});let quote
 await f.act(async()=>{quote=f.workspace.createFinancialWidget('quote');f.workspace.setArtifacts([{...quote,containerSpec:{...quote.containerSpec,symbols:[s]}}]);f.workspace.applyWorkbenchCells([{id:quote.id,x:0,y:0,w:40,h:60}],true);f.workspace.updateSelection([],'replace')})
 await vi.waitFor(()=>expect(f.host.querySelector('[data-financial-chart]')).not.toBeNull())
 const chart=f.host.querySelector('[data-financial-chart]'),candles=()=>chart.querySelectorAll('rect[clip-path]').length
 Object.defineProperty(f.canvas,'scrollHeight',{value:2000});f.canvas.scrollTop=40
 const initial=candles();await f.event('wheel',chart,{deltaX:0,deltaY:120,deltaMode:0,clientX:315})
 expect(candles()).toBe(initial);expect(f.canvas.scrollTop).toBe(160)
 await f.act(async()=>f.workspace.updateSelection([quote.id],'replace'))
 await f.event('wheel',chart,{deltaX:0,deltaY:-120,deltaMode:0,clientX:315})
 expect(candles()).toBeLessThan(initial);expect(f.canvas.scrollTop).toBe(160)
 const zoomed=candles();await f.act(async()=>f.workspace.updateSelection([],'replace'))
 await f.event('wheel',chart,{deltaX:0,deltaY:120,deltaMode:0,clientX:315})
 expect(candles()).toBe(zoomed);expect(f.canvas.scrollTop).toBe(280)
})
it('蜡烛图滚轮以鼠标为中心缩放，横向滚动与拖拽浏览历史，双击恢复',async()=>{
 const history=Array.from({length:240},(_,i)=>({date:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),open:100+i,high:105+i,low:98+i,close:102+i,volume:1000})),bridge=service()
 bridge.request.mockImplementation(async q=>q.action==='history'?{bars:history,nativePeriod:true,source:'测试行情'}:{quotes:q.symbols.map(x=>({...x,price:341,changePercent:1})),source:'测试行情'})
 const f=await fixture({financialWidget:bridge});await f.act(async()=>{const n=f.workspace.createFinancialWidget('quote');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s]}}])})
 await vi.waitFor(()=>expect(f.host.querySelector('[data-financial-chart]')).not.toBeNull())
 const chart=f.host.querySelector('[data-financial-chart]'),candles=()=>chart.querySelectorAll('rect[clip-path]').length,last=()=>Number([...chart.querySelectorAll('text')].find(t=>t.getAttribute('fill')==='#fff').textContent)
 chart.getBoundingClientRect=()=>({left:0,top:0,right:684,bottom:452,width:684,height:452})
 const initial=candles(),latest=last();const wheel=await f.event('wheel',chart,{deltaX:0,deltaY:-120,deltaMode:0,clientX:315});expect(wheel.defaultPrevented).toBe(true)
 expect(candles()).toBeLessThan(initial);expect(last()).toBeLessThan(latest)
 const zoomed=candles(),zoomedLast=last();await f.event('wheel',chart,{deltaX:-100,deltaY:0,deltaMode:0,clientX:315});expect(candles()).toBe(zoomed);expect(last()).toBeLessThan(zoomedLast)
 await f.event('pointerdown',chart,{button:0,pointerId:5,clientX:100});await f.event('pointermove',chart,{pointerId:5,clientX:150});expect(chart.dataset.chartPanning).toBe('true');await f.event('pointerup',chart,{pointerId:5,clientX:150});expect(chart.dataset.chartPanning).toBeUndefined()
 await f.event('dblclick',chart);expect(candles()).toBe(initial);expect(last()).toBe(latest)
})

it.each(['pointerup','pointercancel'])('行情图连续移动后立即%s，延后更新仍保留最终历史位置和完整看板',async finish=>{
 const history=Array.from({length:200},(_,i)=>({date:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),open:100+i,high:105+i,low:98+i,close:102+i,volume:1000})),bridge=service()
 bridge.request.mockImplementation(async q=>q.action==='history'?{bars:history,nativePeriod:true,source:'测试行情'}:{quotes:q.symbols.map(x=>({...x,price:301,changePercent:1})),source:'测试行情'})
 const f=await fixture({financialWidget:bridge})
 await f.act(async()=>{f.workspace.createFinancialWidget('watchlist');const n=f.workspace.createFinancialWidget('quote');f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map(item=>item.id===n.id?{...item,containerSpec:{...item.containerSpec,symbols:[s]}}:item))})
 await vi.waitFor(()=>expect(f.host.querySelector('[data-financial-chart]')).not.toBeNull())
 const chart=f.host.querySelector('[data-financial-chart]'),dispatch=(type,x)=>{const event=new f.win.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(event,{button:{value:0},pointerId:{value:41},clientX:{value:x},clientY:{value:120}});chart.dispatchEvent(event)}
 expect(chart.textContent).toContain('301.00')
 await f.act(async()=>dispatch('pointerdown',100))
 // React can replay queued moves after the gesture's pointer state was cleared.
 await f.act(async()=>{dispatch('pointermove',163);dispatch('pointermove',226);dispatch(finish,226)})
 expect(f.host.querySelector('[data-financial-chart]').textContent).toContain('282.00')
 expect(f.host.querySelector('[data-financial-widget=watchlist]')).not.toBeNull()
 expect(f.host.querySelector('[data-research-canvas]')).not.toBeNull()
 expect(f.document.querySelector('[aria-label="画布全局功能"]')).not.toBeNull()
 await f.event('dblclick',chart)
 expect(f.host.querySelector('[data-financial-chart]').textContent).toContain('301.00')
})

it('离屏组件返回视野时不关闭刚打开的自选搜索',async()=>{
 const f=await fixture();await f.act(async()=>f.workspace.createFinancialWidget('watchlist'));await f.act(async()=>f.workspace.setViewport({x:0,y:-1400,scale:1}));await f.event('click',f.host.querySelector('[aria-label=添加自选股]'));await f.act(async()=>f.workspace.setViewport({x:0,y:0,scale:1}));expect(f.host.querySelector('input[role=combobox]')).not.toBeNull()
})
it('全零OHLC仍使用有效坐标显示，不能生成NaN或Infinity图形',async()=>{
 const bridge=service();bridge.request.mockImplementation(async q=>q.action==='history'?{bars:bars.slice(0,3).map(b=>({...b,open:0,high:0,low:0,close:0,volume:0})),source:'测试通联'}:{quotes:[{...s,price:0,changePercent:0}],source:'测试通联'});const f=await fixture({financialWidget:bridge});await f.act(async()=>{const n=f.workspace.createFinancialWidget('quote');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s]}}])});await vi.waitFor(()=>expect(f.host.querySelector('[data-financial-chart]')).not.toBeNull());expect(f.host.querySelector('[data-financial-chart]').innerHTML).not.toMatch(/NaN|Infinity/);expect(f.host.querySelector('.ew-quote-price-line strong').textContent).toBe('0.00')
})

it('自选排序不清空已获取报价，也不重复请求同一批标的',async()=>{
 const bridge=service(),f=await fixture({financialWidget:bridge});await f.act(async()=>{const n=f.workspace.createFinancialWidget('watchlist');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s,other]}}])});await vi.waitFor(()=>expect(f.host.querySelectorAll('.ew-watch-price')[0].textContent).toBe('100.00'));const calls=bridge.request.mock.calls.length;await f.event('dragstart',f.host.querySelector('[data-stock-code="600519"] .ew-watch-name'),{dataTransfer:{setData(){}}});await f.event('drop',f.host.querySelector('[data-stock-code="000001"]'));expect([...f.host.querySelectorAll('.ew-watch-price')].map(e=>e.textContent)).toEqual(['100.00','100.00']);expect(bridge.request.mock.calls).toHaveLength(calls)
})

it('长行情错误只占用现有页脚，不挤掉自选行，也不重复错误文案',async()=>{
 const bridge=service();bridge.request.mockResolvedValue({quotes:[],errors:[s,other].map(x=>({code:x.code,error:'通联未提供所需数据或接口权限，请稍后重试'})),source:'测试通联'});const f=await fixture({financialWidget:bridge});await f.act(async()=>{const n=f.workspace.createFinancialWidget('watchlist');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s,other]}}])});await vi.waitFor(()=>expect(f.host.querySelector('.ew-financial-footer [role=status]')).not.toBeNull());expect(f.host.querySelectorAll('.ew-watch-row')).toHaveLength(2);expect(f.host.querySelector('.ew-financial-status')).toBeNull();expect(f.host.querySelector('.ew-financial-footer').textContent).toContain('2 个标的未取得行情');expect(f.host.querySelector('.ew-financial-footer button[aria-label="重试获取数据"]').textContent).toBe('重试')
})
it('无行情和新闻时仅显示一次可重试错误，不泄漏IPC实现文案',async()=>{
 const bridge=service();bridge.request.mockRejectedValue(Error("Error invoking remote method 'research:financial-widget': Error: 通联服务暂不可用"));const f=await fixture({financialWidget:bridge});await f.act(async()=>f.workspace.createFinancialWidget('news'));await vi.waitFor(()=>expect(f.host.querySelector('.ew-financial-empty button')).not.toBeNull());expect(f.host.querySelectorAll('.ew-financial-empty')).toHaveLength(1);expect(f.host.textContent.match(/数据源暂不可用/g)).toHaveLength(1);expect(f.host.textContent).not.toContain('通联服务');expect(f.host.textContent).not.toContain('remote method');expect(f.host.textContent).not.toContain('暂无相关新闻')
})
it('自动刷新失败保留上次报价，状态明确提示刷新失败',async()=>{
 const bridge=service(),f=await fixture({financialWidget:bridge});await f.act(async()=>{const n=f.workspace.createFinancialWidget('watchlist');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s]}}])});await vi.waitFor(()=>expect(f.host.querySelector('.ew-watch-price').textContent).toBe('100.00'));bridge.request.mockResolvedValue({quotes:[],errors:[{code:s.code,error:'暂不可用'}]});await f.act(async()=>f.host.querySelector('[data-financial-widget]').__eworkRefreshFinancial());expect(f.host.querySelector('.ew-watch-price').textContent).toBe('100.00');expect(f.host.querySelector('.ew-financial-footer').textContent).toContain('刷新失败')
})
it('组件库使用真实DOMRect定位，菜单不会出现NaN坐标',async()=>{
 const f=await fixture(),trigger=f.document.querySelector('[data-financial-library]'),rect={left:450,top:640,bottom:676,width:36,height:36};trigger.getBoundingClientRect=()=>Object.create(rect)
 await f.event('click',trigger);const menu=f.document.querySelector('.ew-financial-library');expect(Number.isFinite(parseFloat(menu.style.top))).toBe(true);expect(Number.isFinite(parseFloat(menu.style.left))).toBe(true)
})
it('组件库沿用工具栏菜单，按实测内容高度展开，空间不足才滚动',async()=>{
 const f=await fixture(),trigger=f.document.querySelector('[data-financial-library]')
 trigger.getBoundingClientRect=()=>({left:450,top:640,bottom:676,width:36,height:36})
 let top=60
 f.canvas.getBoundingClientRect=()=>({left:100,right:800,top,bottom:700,width:700,height:700-top})
 await f.event('click',trigger)
 const menu=f.document.querySelector('.ew-financial-library')
 expect(menu.classList.contains('ew-grid-menu')).toBe(true)
 expect(menu.hasAttribute('data-financial-theme')).toBe(false)
 Object.defineProperties(menu,{scrollHeight:{value:384},clientHeight:{value:280},offsetHeight:{value:282}})
 await f.event('resize',f.win)
 expect(menu.style.getPropertyValue('--fw-popover-max-height')).toBe('386px')
 expect(parseFloat(menu.style.top)).toBe(246)
 top=380
 await f.event('resize',f.win)
 expect(menu.style.getPropertyValue('--fw-popover-max-height')).toBe('244px')
 expect(parseFloat(menu.style.top)).toBe(388)
})
it('固定组件排数和侧栏收窄遵守通用尺寸，仍可缩小并恢复阅读尺寸',async()=>{
 const f=await fixture(),w=f.workspace;await f.act(async()=>{const n=w.createFinancialWidget('watchlist');w.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s,other,{code:'000002',name:'万科A',market:'SZ'}]}}]);w.createFinancialWidget('quote');w.createFinancialWidget('indices');w.setCanvasSize({width:1000,height:700,availableWidth:1000});w.setWorkbenchWidth(1000);w.organizeCanvas()});const before=w.getWorkbenchCells()
 await f.event('click',f.document.querySelector('[data-workbench-arrange-toggle]'));await f.event('click',f.document.querySelector('[data-arrange-mode=three][role=menuitemradio]'));expect(w.getWorkbenchCells()).not.toEqual(before);expect(w.getWorkbenchCells().every(c=>c.arrangeColumns===3)).toBe(true)
 await f.act(async()=>{w.organizeCanvas(new Map(),'two');w.setCanvasSize({width:640,height:700,availableWidth:640});w.setWorkbenchWidth(640)});const nodes=w.getSnapshot().artifacts;expect(nodes.find(n=>n.containerSpec.widget==='quote').width).toBeLessThan(400);expect(nodes.find(n=>n.containerSpec.widget==='quote').height).toBeGreaterThanOrEqual(160)
})

it('新闻直接呈现摘要、来源和日期，组件内展开阅读并保留刷新后的阅读状态',async()=>{
 const summary='政策调整推动产业投资回升，企业订单与现金流改善。'.repeat(10),bridge=service();bridge.request.mockResolvedValue({news:[{id:'n',title:'产业投资与企业盈利观察',summary,source:'行业观察',time:'2026-10-09T18:00:00+08:00',url:'https://example.org/news'},{id:'no-time',title:'无日期资讯',source:'市场观察',time:''}],source:'测试通联',receivedAt:'2026-10-10T01:00:00Z'});const f=await fixture({financialWidget:bridge});await f.act(async()=>f.workspace.createFinancialWidget('news'));await vi.waitFor(()=>expect(f.host.querySelector('.ew-news-summary')).not.toBeNull());
 const article=f.host.querySelector('.ew-news-list article'),button=article.querySelector('.ew-news-summary');expect(button.textContent).toBe(summary);expect(button.getAttribute('aria-expanded')).toBe('false');expect(article.querySelector('time').textContent).toContain('10/09');expect(article.querySelector('time').textContent).toContain('18:00');expect(article.querySelector('a').href).toBe('https://example.org/news');expect(article.querySelector('small').textContent).toBe('行业观察');expect(f.host.textContent).not.toContain('查看内容');expect(f.host.querySelectorAll('time')[1].textContent).toBe('—');expect(f.host.querySelector('.ew-financial-footer').textContent).toContain('资讯 10/09 18:00');
 await f.event('click',button);expect(button.getAttribute('aria-expanded')).toBe('true');await f.act(async()=>article.closest('[data-financial-widget]').__eworkRefreshFinancial());expect(f.host.querySelector('.ew-news-summary')).toBe(button);expect(button.getAttribute('aria-expanded')).toBe('true');await f.event('click',button);expect(button.getAttribute('aria-expanded')).toBe('false');
})

it('实际标准整理按钮及延迟内容校准保持两列，重复整理没有重新分成三列',async()=>{
 const f=await fixture(),w=f.workspace;await f.act(async()=>{['indices','watchlist','quote','news'].forEach(k=>w.createFinancialWidget(k));const byType=Object.fromEntries(w.getSnapshot().artifacts.map(n=>[n.containerSpec.widget,n.id]));w.applyWorkbenchCells([{id:byType.indices,x:0,y:0,w:40,h:7},{id:byType.watchlist,x:0,y:18,w:20,h:9},{id:byType.quote,x:20,y:18,w:20,h:24},{id:byType.news,x:0,y:40,w:20,h:12}],true)});
 await f.event('click',f.document.querySelector('[data-research-global-arrange]'));await f.act(async()=>new Promise(r=>setTimeout(r,800)));const next=w.getWorkbenchCells(),byType=Object.fromEntries(w.getSnapshot().artifacts.map(n=>[n.containerSpec.widget,next.find(c=>c.id===n.id)]));expect(byType.indices).toMatchObject({x:0,w:40});expect(byType.quote).toMatchObject({x:20,w:20});expect(byType.watchlist).toMatchObject({x:0,w:20,h:byType.quote.h});expect(byType.news).toMatchObject({x:0,w:40,y:byType.watchlist.y+byType.watchlist.h});
 await f.event('click',f.document.querySelector('[data-research-global-arrange]'));await f.act(async()=>new Promise(r=>setTimeout(r,800)));expect(w.getWorkbenchCells()).toEqual(next);
})

it('悬浮工具栏按完整画布定位，近底部组件有可滚动的工具栏安全空间',async()=>{
 const f=await fixture(),w=f.workspace;await f.act(async()=>{const n=w.createFinancialWidget('news');w.applyWorkbenchCells([{id:n.id,x:0,y:20,w:20,h:7}],true)});await f.event('resize',f.win);const toolbar=f.document.querySelector('[data-ework-toolbar]');expect(parseFloat(toolbar.style.bottom)).toBe(f.win.innerHeight-700+20);const n=w.getSnapshot().artifacts[0],contentBottom=n.y+n.height/2;expect(contentBottom).toBeLessThan(700);expect(contentBottom+80).toBeGreaterThan(700);expect(parseFloat(f.canvas.querySelector('[data-research-content-layer]').style.height)).toBeGreaterThanOrEqual(contentBottom+80);
})
it('自选股错误不显示服务商或计费原因，保留缺失值和重试',async()=>{
 const bridge=service();bridge.request.mockResolvedValue({quotes:[],errors:[{code:s.code,error:'通联数据额度已用完，请联系管理员补充额度'}],source:'通联 DataYes'});const f=await fixture({financialWidget:bridge});await f.act(async()=>{const n=f.workspace.createFinancialWidget('watchlist');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s]}}])});await vi.waitFor(()=>expect(f.host.querySelector('.ew-financial-footer').textContent).toContain('1 个标的未取得行情'));expect(f.host.textContent).not.toMatch(/通联|额度|管理员/);expect(f.host.querySelector('.ew-financial-footer [role=status]').title).not.toMatch(/通联|额度|管理员/);expect(f.host.querySelector('.ew-watch-price').textContent).toBe('—');expect(f.host.querySelector('.ew-financial-footer button[aria-label="重试获取数据"]').textContent).toBe('重试');
})
it('易方达模式保留表头、数据和搜索状态，组件库沿用全局菜单主题',async()=>{
 const f=await fixture();await f.act(async()=>{const n=f.workspace.createFinancialWidget('watchlist');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s]}}])});await vi.waitFor(()=>expect(f.host.querySelector('.ew-watch-price').textContent).toBe('100.00'));
 const grid=f.host.querySelector('[data-ework-grid]');
 await f.act(async()=>{f.workspace.setWorkbenchStyle('enterprise')});
 expect(f.win.getComputedStyle(grid).getPropertyValue('--fw-heading')).toBe('#1eb9e1');expect(f.win.getComputedStyle(grid).getPropertyValue('--fw-heading-text')).toBe('#fff');
 await f.event('click',f.host.querySelector('[aria-label="添加自选股"]'));const input=f.host.querySelector('input[role=combobox]');await f.input(input,'茅台');await f.act(async()=>{await new Promise(r=>setTimeout(r,250))});expect(f.document.querySelector('.ew-financial-suggestions [role=option]')).not.toBeNull();
 expect(f.document.querySelector('.ew-financial-suggestions').dataset.financialTheme).toBe('enterprise');
 await f.act(async()=>{f.workspace.setWorkbenchStyle('dark');await new Promise(r=>setTimeout(r,20))});expect(f.document.querySelector('.ew-financial-suggestions').dataset.financialTheme).toBe('dark');expect(input.value).toBe('茅台');expect(f.host.querySelector('.ew-watch-price').textContent).toBe('100.00');
 await f.event('keydown',input,{key:'Escape'});await f.event('click',f.document.querySelector('[data-financial-library]'));await f.act(async()=>{f.workspace.setWorkbenchStyle('enterprise');await new Promise(r=>setTimeout(r,20))});expect(f.document.querySelector('.ew-financial-library').hasAttribute('data-financial-theme')).toBe(false);
})

it('个股始终使用同一个搜索输入框，取消恢复当前标的，选择结果后保持输入框',async()=>{
 const f=await fixture();await f.act(async()=>{const n=f.workspace.createFinancialWidget('quote');f.workspace.setArtifacts([{...n,containerSpec:{...n.containerSpec,symbols:[s]}}])});
 const input=f.host.querySelector('.ew-financial-header-selector input');expect(input).not.toBeNull();expect(input.value).toBe('600519 · 贵州茅台');expect(f.document.activeElement).not.toBe(input);expect(f.host.querySelector('.ew-financial-header-selector [data-financial-icon=chevron]')).toBeNull();
 await f.event('focusin',input);expect(input.value).toBe('600519 · 贵州茅台');expect(f.document.querySelector('.ew-financial-suggestions')).toBeNull();
 await f.input(input,'平安');await vi.waitFor(()=>expect(f.document.querySelectorAll('.ew-financial-suggestions [role=option]')).toHaveLength(2));
 await f.event('keydown',input,{key:'Escape'});expect(input.value).toBe('600519 · 贵州茅台');expect(f.document.querySelector('.ew-financial-suggestions')).toBeNull();expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toEqual([s]);
 await f.event('focusin',input);await f.input(input,'平安');await vi.waitFor(()=>expect(f.document.querySelectorAll('.ew-financial-suggestions [role=option]')).toHaveLength(2));await f.event('keydown',input,{key:'ArrowDown'});await f.event('keydown',input,{key:'Enter'});
 expect(f.host.querySelector('.ew-financial-header-selector input')).toBe(input);expect(input.value).toBe('000001 · 平安银行');expect(f.workspace.getSnapshot().artifacts[0].containerSpec.symbols).toEqual([other]);
})

it('放大阅读菜单跟随组件进入对话框顶层并可正常关闭',async()=>{
 const f=await fixture();await f.act(async()=>f.workspace.createFinancialWidget('watchlist'))
 const openMenu=async()=>f.event('click',f.host.querySelector('[data-workbench-more]'))
 const menu=()=>f.document.querySelector('[role="menu"][aria-label="组件更多操作"]')
 const action=()=>Array.from(menu().children).find(item=>item.querySelector('.ew-grid-icon-expand'))
 const card=f.host.querySelector('[data-research-node-id]')
 await openMenu()
 expect(menu().parentElement).toBe(f.document.body)
 expect(action().textContent).toBe('放大阅读')
 await f.event('click',action())
 expect(card.open).toBe(true)
 await openMenu()
 expect(menu().parentElement).toBe(card)
 expect(action().textContent).toBe('关闭放大阅读')
 await f.event('click',action())
 expect(card.open).toBe(false)
})
