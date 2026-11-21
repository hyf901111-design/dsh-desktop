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
 return {message,current,run:(step,request=current)=>middleware({agent:{session},turn:2,step},async()=>request)}
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
 expect(text).toContain('日期、2年、5年、10年、30年');expect(text).toContain('完整表格留待执行时读取');expect(text.length).toBeLessThan(220)
 const second=await run(2,route)
 expect(second.messages.at(-1).content[0].text).toBe(prompt)
})
