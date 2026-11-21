import {expect,it} from 'vitest'
import {allowTaskOpening,registerModelTaskReplies} from '../packages/dsh-research-task-runtime/model-task-replies.js'
import {clientModeTurn} from '../packages/dsh-research-task-runtime/client-mode-profile.js'

// Raw public Treasury observations used by the real offline-workbench request.
const treasuryLines=[
 '给基金公司固收组创建一个研究工作台，在画布上放一张断网也能带走的美债收益率复盘网页。会上要切换基准日、观察日以及利差组合（10年减2年、30年减5年）；联动两条曲线、四个期限的明细、两日的利差及其变化（bp）。只用摘自美国财政部 Daily Treasury Par Yield Curve Rates 的真实年化收益率（%）。默认比较12月27日至31日，保留来源和全部精度。',
 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=202412',
 '日期\t2年\t5年\t10年\t30年','2024-12-27\t4.31\t4.45\t4.62\t4.82','2024-12-30\t4.24\t4.37\t4.55\t4.77','2024-12-31\t4.25\t4.38\t4.58\t4.78',
]
function requests(text,{mode='research',other=[]}={}){
 const message={id:'human-7',role:'user',source:{kind:'user',clientMode:mode,rpcId:'rpc-7'},content:[{type:'text',text},...other]}
 const session={events:[{type:'user/message',data:message}]}
 const current={provider:'selected-provider',model:'selected-model',maxTokens:16384,system:'INTERNAL CATALOG AND TOOL SCHEMAS '.repeat(180),messages:[{id:'older',role:'assistant',content:[{type:'text',text:'UNRELATED HISTORY'}]},message],tools:[{name:'existingTool'}]}
 let middleware
 registerModelTaskReplies({on:(_,cb)=>{middleware=cb}})
 allowTaskOpening(clientModeTurn(session))
 return {message,current,session,run:(step,request=current)=>middleware({agent:{session},turn:2,step},async()=>request)}
}
it('sends only the real user task and column semantics for the opening, then restores the exact Treasury source, precision and tool authority',async()=>{
 const {message,current,run}=requests(treasuryLines.join('\n'))
 const first=await run(1),text=first.messages[0].content[0].text
 expect(first.messages).toHaveLength(1)
 expect(first.messages[0]).toMatchObject({id:message.id,source:message.source,role:'user'})
 expect(text).toContain('断网');expect(text).toContain('10年减2年、30年减5年');expect(text).toContain('12月27日至31日')
 expect(text).toContain('日期、2年、5年、10年、30年');expect(text).toContain('home.treasury.gov')
 expect(text).not.toMatch(/4\.31|4\.62|data=daily/)
 expect(first.system.length+text.length).toBeLessThan(512)
 expect(first.system).toContain('用户的语言');expect(first.system).not.toContain('CATALOG')
 expect(first.tools).toEqual([])
 const executionInput={...current,messages:[...current.messages,{role:'assistant',content:[{type:'text',text:'我会按两个交易日复盘这四个期限。'}]}]}
 const second=await run(2,executionInput)
 expect(second.system).toBe(current.system);expect(second.tools).toBe(current.tools)
 expect(second.messages[0]).toBe(current.messages[0]);expect(second.messages[1]).toBe(message);expect(second.maxTokens).toBe(16384)
 expect(second.messages[1].content[0].text).toBe(treasuryLines.join('\n'))
})
it('preserves instructions after a long table and the requested language, while removing quoted document payloads and image bytes',async()=>{
 const body=['请比较附件里的两个年份。','Year,Flow,AUM',...Array.from({length:1000},(_,i)=>'Retail,'+i+',123456'),
  '<browser-source>PRIVATE_PAGE_METADATA</browser-source>','```js','fakeApi()','```',
  'Compare ETF, retail, and the two signed 2024 flows. Reply in English; do not save changes.'].join('\n')
 const {run}=requests(body,{other:[{type:'image',attachment:{id:'omitted-image',private:'BINARY'}}]})
 const first=await run(1),wire=JSON.stringify(first.messages)
 expect(wire).toContain('Reply in English');expect(wire).toContain('two signed 2024 flows')
 expect(wire).toContain('附有图片');expect(wire).not.toMatch(/Retail,\d|123456|PRIVATE_PAGE|BINARY|fakeApi|UNRELATED/)
 expect(wire.length).toBeLessThan(800)
})
it('preserves selected office reference labels with their range, without the internal reference ID',async()=>{
 const {run}=requests('请逐项核对收益率，再写出差额。〔表格选区 "收益率原表"!A1:B4 #aaaaaaaaaaaa〕',{mode:'spreadsheet'})
 const first=await run(1),text=first.messages[0].content[0].text
 expect(text).toContain('收益率原表');expect(text).toContain('A1:B4');expect(text).not.toContain('aaaaaaaaaaaa')
})

it('uses a short task outline on the hosted reasoning route and retains a requested response language',async()=>{
 const prompt=treasuryLines.join('\n')+'\nReply in English.'
 const {current,run}=requests(prompt)
 const route={...current,provider:'ework-ark',model:'deepseek-v4.1-flash'}
 const first=await run(1,route),text=first.messages[0].content[0].text
 expect(text).toContain('断网');expect(text).toContain('Reply in English')
 expect(text).toContain('日期、2年、5年、10年、30年');expect(first.system).toContain('已给事实足够时可直接点出结论');expect(text+' '+first.system).not.toMatch(/任务摘录|先核对什么/);expect(text.length).toBeLessThan(220)
 const second=await run(2,route)
 expect(second.messages.at(-1).content[0].text).toBe(prompt)
})

it('keeps the supplied decision or facts available without prescribing a verification receipt',async()=>{
 const actual='视觉执行E1：现在生成一张新的16:9基金晨会封面，主题是美国国债曲线复盘。深藏青底、右侧放一条细金色曲线，左侧三分之一纯净留给标题，整图不要出现任何文字、数字或水印。作为新素材加入这份验收画布。'
 const {current,run}=requests(actual,{mode:'image'})
 const first=await run(1,{...current,provider:'ework-ark',model:'deepseek-v4.1-flash'})
 expect(first.messages[0].content[0].text).toContain('左侧三分之一')
 expect(first.system).toContain('与目标有关的取舍')
 expect(first.system).toContain('执行结果等实际回执')
 expect(first.messages).toHaveLength(1)
 expect(first.tools).toEqual([])
})

it('keeps identifiers, units and decimal precision for each disclosed row in a short reconciliation opening',async()=>{
 const text=`我是估值核算岗，请把五笔持仓整理到研究看板，按原序逐笔核对。
序号	股票代码	股票名称	数量（股）	公允价值（元）	占基金资产净值比例（%）
1	300750	宁德时代	31173566	11448803849.16	3.81
2	600519	贵州茅台	7377868	10160652252.24	3.38
3	601318	中国平安	125580047	8589675214.80	2.86
4	300308	中际旭创	13089026	7984305860.00	2.66
5	601899	紫金矿业	194034163	6688357598.61	2.23`
 const {current,run}=requests(text)
 const first=await run(1,{...current,provider:'ework-ark',model:'deepseek-v4.1-flash'})
 const body=first.messages[0].content[0].text
 expect(body).toContain('已识别5行记录，表头6列')
 expect(body).toContain('已给出全部单元格')
 for (const row of text.split('\n').slice(1)) expect(body).toContain(row)
 const incomplete = requests(text.replace('13089026','—'))
 const partial = await incomplete.run(1)
 expect(partial.messages[0].content[0].text).toContain('300308\t中际旭创\t—\t7984305860.00')
 expect(partial.messages[0].content[0].text).toContain('缺失标记')
 const request = text.replace(text.split('\n')[0], '我是这只 ETF 的估值核算员，收盘后要照着季报和托管系统逐笔勾稽。请把下面五笔持仓整理到研究看板，我打开就按披露顺序从第一笔核到第五笔。每笔要对得上序号、代码、名称、股数、公允价值和占基金净值比例，公允价值按人民币元保留到分，包括末尾的零。若托管同事只报证券代码，我也需要快速定位该笔。\n\n来源为上交所披露的《易方达沪深300交易型开放式指数发起式证券投资基金2025年第4季度报告》，持仓日2025-12-31，第10页第5.3.1节前五行。\nhttps://www.sse.com.cn/disclosure/fund/announcement/c/new/2026-01-22/510310_20260122_JCA4.pdf\n')
 const ledgerOpening = async (prose,tool) => {
  const ctx = requests(prose)
  return ctx.run(1,{...ctx.current,tools:[{name:tool}]})
 }
 const ledger = await ledgerOpening(request,'research_workbench_create')
 expect(ledger.system).toContain('一张可检索的明细表')
 expect(ledger.messages[0].content[0].text).toContain('300750\t宁德时代\t31173566')
 expect((await ledgerOpening(request,'existingTool')).system).not.toContain('一张可检索的明细表')
 expect((await ledgerOpening(request+'\n我还需要为每只股票单独建一张组件卡。','research_workbench_create')).system).not.toContain('一张可检索的明细表')
 expect(first.system).toContain('无需用户重发')
 expect(first.tools).toEqual([])
})

it('reports the identified shape without assigning scalar examples to ambiguous columns',async()=>{
 const text='请根据以下原表建立研究看板。\n名称\t金额（元）\t金额（元）\n余额\t100.00\t0.10\n扣除\t110.00\t0.21'
 const {current,run}=requests(text)
 const first=await run(1,{...current,provider:'ework-ark',model:'deepseek-v4.1-flash'})
 expect(first.messages[0].content[0].text).toContain('已识别2行记录，表头3列')
 expect(first.messages[0].content[0].text).not.toContain('100.00')
})

it('describes only tools authorized on the execution request while the opening remains text-only',async()=>{
 const imageText='视觉执行E1：现在生成一张新的16:9基金晨会封面，主题是美国国债曲线复盘。深藏青底、右侧放一条细金色曲线，左侧三分之一纯净留给标题，作为新素材加入这份验收画布。'
 const image=requests(imageText,{mode:'image'})
 const call=await image.run(1,{...image.current,tools:[{name:'image_generate'}]})
 expect(call.tools).toEqual([{name:'image_generate'}])
 expect(call.messages).toBe(image.current.messages)
 expect(call.system).toContain('在这一步执行')
 expect(call[Symbol.for('ework.model-task-opening')]).toBeUndefined()
 expect((await image.run(1,{...image.current,tools:[{name:'existingTool'}]})).system).not.toContain('生成并交付实际图片')
 const office=requests('请核对工作簿的现有日期、再按实际观察日写入两组利差公式。',{mode:'spreadsheet'})
 const granted=ids=>[{name:'client_action',parameters:{properties:{capability:{enum:ids}}}}]
 const native=await office.run(1,{...office.current,tools:granted(['spreadsheet.inspect','spreadsheet.apply'])})
 expect(native.tools).toEqual([])
 expect(native.system).toContain('读取工作簿、在原生表格写入数据和公式')
 const read=await office.run(1,{...office.current,tools:granted(['spreadsheet.inspect'])})
 expect(read.system).toContain('读取工作簿')
 expect(read.system).not.toContain('写入数据和公式')
})

it('uses a prose-only first step only when the current request asks for an actionable saved conversation component',async()=>{
 const user='基金晨会执行E1：请直接在这段对话里创建一个可保存的对比组件，比较易方达沪深300ETF 2025年四季报披露的宁德时代3.81%与贵州茅台3.38%，注明单位是占净值比例，给出0.43个百分点的差额。使用已给这两个数。'
 for(const [text,grant,expected] of [[user,true,true],[user,false,false],[user+'不需要源码。',true,true],[user+'另外给我源码和代码示例。',true,false],['只讨论这种组件如何设计，请举一个代码示例。',true,false]]){
  const {run,current}=requests(text,{mode:'conversation'})
  current.tools=[{name:'client_action',parameters:{properties:{capability:{enum:grant?['conversation.components.create']:[]}}}}]
  const first=await run(1)
  expect(first[Symbol.for('ework.native-component-opening')]===true).toBe(expected)
  if(expected){expect(first.system).toContain('只用自然语言');expect(first.tools).toEqual([]);expect((await run(2)).tools).toEqual(current.tools)}
 }
})

it('preserves real service or reference status on an admitted image turn, and leaves independently discussed images alone',async()=>{
 const source='视觉执行E1：现在生成一张新的16:9基金晨会封面，主题是美国国债曲线复盘。深藏青底、右侧放一条细金色曲线，左侧三分之一纯净留给标题，整图不要出现任何文字、数字或水印。作为新素材加入这份验收画布。'
 for(const text of [source,'请修改当前这张图片，把主建筑移到右侧，保留左侧标题空间。']){
  const image=requests(text,{mode:'image'}),tools=[{name:'image_generate'}]
  const request={...image.current,system:'套餐生图服务暂时不可用。',tools}
  const first=await image.run(1,request)
  expect(first.tools).toBe(tools);expect(first.messages).toBe(request.messages)
  expect(first.system).toContain(request.system);expect(first.system).not.toContain('已具备')
  expect(first[Symbol.for('ework.model-task-opening')]).toBeUndefined()
 }
 const discussion=requests('这轮只讨论构图，不生成或修改图片。',{mode:'image'})
 const first=await discussion.run(1,{...discussion.current,tools:[{name:'image_generate'}]})
 expect(first.system).not.toContain('在这一步执行')
})

it('distinguishes a complete supplied column, a retained missing value and a preview of a longer table',async()=>{
 const goal='我是指数投资部的组合经理，请把下面的持仓做成研究看板，让我一眼比较五家公司的净值占比和排名，知道前五合计多少。'
 const head='序号\t股票代码\t股票名称\t数量（股）\t公允价值（元）\t占基金资产净值比例（%）'
 const rows=['1\t300750\t宁德时代\t31173566\t11448803849.16\t3.81','2\t600519\t贵州茅台\t7377868\t10160652252.24\t3.38','3\t601318\t中国平安\t125580047\t8589675214.80\t2.86','4\t300308\t中际旭创\t13089026\t7984305860.00\t2.66','5\t601899\t紫金矿业\t194034163\t6688357598.61\t2.23']
 const opening=async rs=>(await requests([goal,head,...rs].join('\n')).run(1)).messages[0].content[0].text
 const full=await opening(rows)
 expect(full).toContain('所提供的全部5行，仅摘数值列（占基金资产净值比例（%））')
 expect(full).toContain('宁德时代 / 3.81；贵州茅台 / 3.38；中国平安 / 2.86；中际旭创 / 2.66；紫金矿业 / 2.23')
 expect(full).not.toContain('11448803849.16')
 const absent=await opening(rows.map(r=>r.replace('2.86','—')))
 expect(absent).toContain('原文含空值');expect(absent).toContain('中国平安 / —')
 const long=await opening([...rows,...rows])
 expect(long).toContain('原文已包含这10行，仅摘首行示例');expect(long).not.toContain('贵州茅台 /')
})

it('keeps an explicit live page visit executable on the first call and keeps independent conversation and visiting advice outside that path',async()=>{
 const actual='浏览执行E1：请在当前浏览器打开美国财政部这个正式月度页面，告诉我实际页面标题，并读出 2024-12-31 的两年、十年国债收益率。https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve&field_tdr_date_value_month=202412'
 for(const [text,grant,live] of [[actual,true,true],[actual,false,false],['只讨论如何打开网站，不实际访问。',true,false],['不用打开网站，直接告诉我这两个数的差。',true,false],['收益率从4.62%到4.58%，变化多少个基点？',true,false]]){
  const {current,run}=requests(text,{mode:'browser'})
  const request={...current,tools:[{name:grant?'browser_use':'existingTool'}]}
  const first=await run(1,request)
  expect(first.system.includes('直接使用本轮提供的浏览器')).toBe(live)
  if(live){expect(first.tools).toBe(request.tools);expect(first.messages).toBe(request.messages);expect(first[Symbol.for('ework.model-task-opening')]).toBeUndefined()}
 }
})

it('works with the current native office file immediately and issues a public progress opportunity after its actual first read',async()=>{
 const asks=[
  ['spreadsheet','固收组收盘要复盘这张表里的 2024 年 12 月美国国债曲线。请把 10 年减 2 年、30 年减 5 年两组期限利差逐日写入右侧空白 F、G 列，单位基点，保留原来的观测值，用可以复算的公式。找出 10 年减 2 年利差单日变动绝对值最大的一次，并列的话都列出。最后用三句交接说明月初和月末两组利差各是多少、期间哪天变化最剧烈、怎样理解方向。只使用本工作簿的实际观察日，缺日期不要补。'],
  ['presentation','晨会执行E1：在本验收演示末尾追加一页，标题“美国国债12月30日两年与十年”，正文仅“2年期4.24%，10年期4.55%，期限利差31个基点。”保留已有页面和备注。请回读确认新页页码。'],
 ]
 for(const [mode,text] of asks){
  const {current,session,run}=requests(text,{mode})
  const tools=[{name:'client_action',parameters:{properties:{capability:{enum:[mode+'.inspect',mode+'.apply']}}}}]
  const first=await run(1,{...current,tools});expect(first.tools).toBe(tools);expect(first.messages).toBe(current.messages)
  expect(first.system).toContain('在同一步读取实际文档');expect(first[Symbol.for('ework.model-task-opening')]).toBeUndefined()
  const age=Date.now();session.events.push({type:'assistant/message',time:age,data:{message:{content:[{type:'text',text:'本轮公开分析。'}]}}})
  expect((await run(2,{...current,tools})).messages).toBe(current.messages)
  session.events.push({type:'tool/result',time:age,data:{message:{content:[{type:'tool-result',content:[{type:'text',text:'已读到文档'}]}]}}})
  const after=await run(2,{...current,tools})
  expect(after.tools).toBe(tools);expect(after.messages.at(-1).content[0].text).toContain('真实回执')
 }
 const h=requests(asks[0][1],{mode:'spreadsheet'})
 const noWrite=[{name:'client_action',parameters:{properties:{capability:{enum:['spreadsheet.inspect']}}}}]
 expect((await h.run(1,{...h.current,tools:noWrite})).system).not.toContain('在同一步读取实际文档')
 const ordinary=requests('只在对话解释这张表，不要改当前工作簿。',{mode:'spreadsheet'})
 expect((await ordinary.run(1)).system).not.toContain('在同一步读取实际文档')
})
