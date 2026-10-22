import {expect,it} from 'vitest'
import {Window} from 'happy-dom'
import {filterScopedNewsArtifact} from '../packages/dsh-research-task-runtime/news-topic-filter.js'
import {resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'

// Public title/excerpt identities captured from the root-owned native task
// 65ba22c6-31d8-4a91-943e-46efee82f42d; no live transport is used.
const captured=[
 {
  "title": "中际旭创发生4笔大宗交易 合计成交2466.67万元",
  "summary": "中际旭创10月22日大宗交易平台共发生4笔成交，合计成交量4.18万股，成交金额2466.67万元。",
  "time": "2026-10-22T21:37:00+08:00",
  "url": "https://finance.eastmoney.com/a/202610223904453221.html"
 },
 {
  "title": "光模块龙头中际旭创跌超8%！公司称供应链稳定，产能利用率充足",
  "summary": "10月22日，有投资者向中际旭创股份有限公司（中际旭创，300308)提问称，“请介绍下公司目前产能利用率情况。”",
  "time": "2026-10-22T20:46:03+08:00",
  "url": "https://finance.eastmoney.com/a/202610223904378738.html"
 },
 {
  "title": "中际旭创成交额超200亿元",
  "summary": "数据宝统计，截至14:10，中际旭创成交额200.19亿元，超200亿元。最新股价下跌6.46%，换手率2.96%。",
  "time": "2026-10-22T14:33:00+08:00",
  "url": "https://finance.eastmoney.com/a/202610223904011480.html"
 },
 {
  "title": "中际旭创10月22日盘中跌幅达5%",
  "summary": "以下是中际旭创在北京时间10月22日09:44分盘口异动快照：10月22日，中际旭创盘中跌幅达5%，截至9点44分，报614",
  "time": "2026-10-22T09:53:16+08:00",
  "url": "https://finance.eastmoney.com/a/202610223903661369.html"
 },
 {
  "title": "新易盛大跌12%，光模块到了抄底时候吗",
  "summary": "额处于历史90%分位以上，意味着杠杆盘尚未充分出清；放量下跌（新易盛单日成交近197亿元）表明多空在当前位置分歧巨大",
  "time": "2026-10-22T18:41:25+08:00",
  "url": "https://finance.eastmoney.com/a/202610223904281865.html"
 },
 {
  "title": "新易盛：订单交付有序开展",
  "summary": "新易盛股价也出现大跌。针对市场关注的公司经营情况，记者从公司方面了解到，公司目前生产经营活动正常有序，",
  "time": "2026-10-22T14:23:28+08:00",
  "url": "https://finance.eastmoney.com/a/202610223903989210.html"
 },
 {
  "title": "工业富联：融资净偿还1412.39万元，融资余额68.64亿元",
  "summary": "交易所最新数据显示，工业富联于2026年10月21日获融资买入2.18亿元，融资偿还2.32亿元，当日融资净偿还1412.39",
  "time": "2026-10-22T07:41:06+08:00",
  "url": "https://finance.eastmoney.com/a/202610223903149373.html"
 },
 {
  "title": "美国启动337调查，工业富联、立讯精密受挫",
  "summary": "10月12日，盘中工业富联（601138.SH）、立讯精密（002475.SZ）仍双双走低，分别跌4.35%和1.24%",
  "time": "2026-10-12T10:38:35+08:00",
  "url": "https://finance.eastmoney.com/a/202610123892516470.html"
 }
]
const scope='分别展示中际旭创（300308）、新易盛（300502）、工业富联（601138）相关新闻。只收录与这些公司业务有关的内容。'
const record=(rows,query='中际旭创')=>({tool:'public_data_query',args:{operation:'query',source:'eastmoney-news',parameters_json:JSON.stringify({query,limit:20})},response:{source:'东方财富关键词新闻搜索',records:rows}})
const news=(rows=captured)=>({version:1,type:'news',title:'公司相关新闻',note:'已剔除纯行情，全部都是业务新闻。',items:rows.map(row=>({...row,date:row.time}))})
const keep=[captured[1],captured[5],captured[7]].map(row=>row.url)

it('filters the native pure trading records while keeping actual operating and legal content mixed with price moves',()=>{
 const result=filterScopedNewsArtifact(news(),[record(captured)],scope)
 expect(result.items.map(item=>item.url)).toEqual(keep)
})
it('does not accept model business summaries, notes, status or relevance labels over the actual source text',()=>{
 const data=news([captured[0]]);data.items[0].summary='中际旭创取得新订单，产能充足。';data.items[0].status='业务相关';data.items[0].relevanceFilters=['已核验主营业务']
 expect(filterScopedNewsArtifact(data,[record(captured)],scope).items).toEqual([])
})
it.each([
 '中际旭创、新易盛、工业富联全部相关新闻，包括股价和成交额。',
 '不要只展示中际旭创公司业务相关新闻，行情也要。',
 '不必仅保留中际旭创经营相关新闻，展示中际旭创全部相关新闻。',
 '并非只收录中际旭创业务相关新闻，也展示中际旭创全部相关新闻。',
 '不限于中际旭创业务相关新闻，展示中际旭创全部相关新闻。',
 '用户之前写过“只收录与公司业务有关的新闻”，这次展示中际旭创全部相关新闻。',
 '把“仅展示公司经营动态”当作引用，展示中际旭创全部相关新闻。',
 '文章原句是‘只展示公司业务新闻’，这次展示中际旭创全部相关新闻。',
 "The article says 'only business news'; show all 中际旭创 news.",
 '只展示中际旭创业务和行情相关新闻。',
 '只要中际旭创业务和行情相关新闻。',
 '中际旭创相关新闻。仅收录与公司业务、股价和成交有关的新闻。',
 'Only business and stock-price news about 中际旭创.',
 'Only business and market news about 中际旭创.',
 'Not only business news about 中际旭创; include market prices too.'
])('does not opt a broad, negated or quoted request into business-only: %s',request=>{
 const rows=[captured[0],captured[1],captured[2]]
 expect(filterScopedNewsArtifact(news(rows),[record(rows)],request).items).toHaveLength(3)
})
it('accepts an explicit English business-only scope while retaining source business facts mixed with a stock decline',()=>{
 const rows=[{title:'ACME Corp stock falls 5%',summary:'Trading volume reached a record.',time:'2026-10-22',url:'https://example.org/acme-quote'},
  {title:'ACME Corp stock falls; company confirms new orders',summary:'Production capacity and deliveries remain stable.',time:'2026-10-22',url:'https://example.org/acme-orders'}]
 expect(filterScopedNewsArtifact(news(rows),[record(rows,'ACME Corp')],'Only business-related news about "ACME Corp".').items.map(row=>row.url)).toEqual([rows[1].url])
})
it('takes the captured original human scope over panel guidance or model presentation metadata',()=>{
 const request='工作台：公司业务新闻\n本面板：只收录公司业务相关新闻\n仅生成本面板，优先使用 news 类型。\n【原始工作台需求】\n展示中际旭创全部相关新闻，包括成交额与行情。'
 const rows=[captured[0],captured[1]]
 expect(filterScopedNewsArtifact(news(rows),[record(rows)],request).items).toHaveLength(2)
})
it('keeps business-only materialization and full observed retain-all merging under the same filter, even when a company has zero retained articles',()=>{
 const rows=[captured[1],captured[5],captured[6]],names=['中际旭创','新易盛','工业富联'],records=rows.map((row,i)=>record([row],names[i]))
 const draft={version:1,type:'data-bound',requests:records.map((r,i)=>({key:'q'+i,tool:r.tool,args:r.args})),mapping:{version:1,type:'news',variant:'company-news-groups',title:'业务资讯',groups:records.map((_,i)=>({company:names[i],status:'全部相关',items:{$from:'q'+i,$each:'records',$map:{title:{$path:'title'},summary:{$path:'summary'},date:{$path:'time'},url:{$path:'url'}}}}))}}
 const human=scope+'保留全部实际取得且相关的记录。',result=resolveBoundComponent(JSON.stringify(draft),records,new Date('2026-10-22T15:40:00Z'),{newsScope:human,feedOptions:{workbenchRequest:{dataMode:'source',originalRequest:human}}}),window=new Window()
 try{
  window.document.body.innerHTML=JSON.parse(result.output).html
  expect(window.document.querySelectorAll('article')).toHaveLength(2)
  const coverage=window.document.querySelector('[data-news-query-coverage]').textContent
  expect(coverage).toContain('来源查询：工业富联 · 来源返回：1 · 已保留：0')
  expect(coverage).not.toContain('尚未证明独立查询：601138')
  expect(result.recipe).toBeUndefined()
 }finally{window.happyDOM.abort()}
})
it('applies business-only to a host rebuilt news HTML using actual source rows rather than model page text',()=>{
 const result=filterScopedNewsArtifact({version:1,type:'html',title:'新闻',html:'<p>已处理所有业务新闻</p>'},[record(captured)],scope+'【新闻容量适配】')
 const window=new Window();try{window.document.body.innerHTML=result.html;expect([...window.document.querySelectorAll('article a')].map(a=>a.href)).toEqual(keep)}finally{window.happyDOM.abort()}
})
it('keeps the existing supplied-text path when no actual source record matches',()=>{
 const data=news([captured[0]])
 expect(filterScopedNewsArtifact(data,[],scope).items).toEqual(data.items)
})
