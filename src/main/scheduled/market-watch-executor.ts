import type {MarketWatchResult,ScheduledTask,TaskRun} from '../../shared/scheduled-tasks'

export type MarketWatchExecutor = {execute(task:ScheduledTask,run:TaskRun):Promise<MarketWatchResult>;isOwner(task:ScheduledTask):boolean}
export class ScheduledMarketWatchExecutor implements MarketWatchExecutor {
  constructor(private options:{owner:()=>string;publicData:{query(args:unknown,signal:AbortSignal):Promise<any>};now?:()=>number}){}
  isOwner(task:ScheduledTask){return task.watch?.ownerAccountId===this.options.owner()}
  async execute(task:ScheduledTask,_run:TaskRun):Promise<MarketWatchResult>{
    const watch=task.watch
    if(!watch||watch.ownerAccountId!==this.options.owner())throw Error('行情提醒所属账户已变化，请切回原账户后继续')
    const data=await this.options.publicData.query({operation:'query',source:watch.source,parameters_json:JSON.stringify({symbols:watch.symbols})},AbortSignal.timeout(30000))
    if(watch.ownerAccountId!==this.options.owner())throw Error('行情查询期间账户已变化，本次结果已丢弃')
    const fetchedAt=(this.options.now??Date.now)()
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(fetchedAt)
    const quotes=watch.symbols.map(symbol=>{
      const row=data?.records?.find((r:any)=>r.symbol===symbol)
      if(!row||typeof row.changePercent!=='number'||!Number.isFinite(row.changePercent))throw Error(`${symbol} 未返回有效涨跌幅，无法判断是否触发`)
      if(typeof row.time!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.time)||row.timezone!=='Asia/Shanghai')throw Error(`${symbol} 报价时间或时区缺失，无法判断是否触发`)
      const quotedAt=Date.parse(row.time.replace(' ','T')+'+08:00')
      if(!Number.isFinite(quotedAt)||quotedAt>fetchedAt+60000)throw Error(`${symbol} 报价时点无效或位于未来（${row.time}）`)
      return {symbol,changePercent:row.changePercent,time:row.time}
    })
    // A valid closing/stationary quote is not evidence of a broken source or
    // of market closure. Retain its provenance and wait without judging it.
    if(quotes.some(q=>q.time.slice(0,10)!==today||fetchedAt-Date.parse(q.time.replace(' ','T')+'+08:00')>20*60000))return {source:watch.source,fetchedAt,quotes,summary:'等待新报价，本次未判断阈值；保留最近报价与时点，不推断市场是否休市。',alertKeys:[],noChange:true,waitingForQuote:true}
    const previous=new Set(task.watchAlertKeys??[])
    const matched=quotes.filter(q=>Math.abs(q.changePercent)>watch.thresholdPercent&&!previous.has(`${q.time.slice(0,10)}:${q.symbol}`))
    const summary=matched.length?matched.map(q=>`${q.symbol} 单日涨跌幅 ${q.changePercent>0?'+':''}${q.changePercent}%（报价 ${q.time}）`).join('；'):'已检查最新报价，本次没有新的阈值提醒'
    return {source:watch.source,fetchedAt,quotes,summary,alertKeys:matched.map(q=>`${q.time.slice(0,10)}:${q.symbol}`),noChange:!matched.length}
  }
}
