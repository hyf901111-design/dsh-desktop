import {expect,it} from 'vitest'
import {registerScheduledTaskTool} from '../packages/dsh-research-task-runtime/scheduled-task-tools.js'
const agent=text=>({session:{id:'board',events:[{type:'user/message',data:{id:'human-message',source:{kind:'user'},content:[{type:'text',text}]}}]}})
it('saves a scheduled alert through the trusted bridge and returns without waiting for a trigger',async()=>{
 let tool;const calls=[]
 const dispose=registerScheduledTaskTool({tools:{register:t=>{tool=t;return()=>{}}},systemPrompt:{context:()=>()=>{}}},{env:{SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:1234',SHERLOCK_RESEARCH_CONTEXT_TOKEN:'test'},request:async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});return {ok:true,json:async()=>({status:'saved',task:{id:'persisted',nextRun:123}})}}})
 const args={action:'create',nodeId:'watchlist',thresholdPercent:3}
 const exec={agent:agent('帮我设置一个定时任务，如果单日涨跌幅超过3%提醒我')}
 expect(await tool.execute(args,exec)).toContain('persisted')
 await tool.execute(args,exec)
 expect(calls.map(c=>c.body.requestId)).toEqual(['human-message','human-message'])
 expect(calls[0].url).toBe('http://127.0.0.1:1234/scheduled-tasks')
 expect(calls[0].body).toMatchObject({sessionId:'board',nodeId:'watchlist',thresholdPercent:3})
 expect(calls[0].init.headers.authorization).toBe('Bearer test')
 dispose()
})
it('rejects creation from a casual observation request or a delegated task',async()=>{
 let tool
 registerScheduledTaskTool({tools:{register:t=>{tool=t;return()=>{}}},systemPrompt:{context:()=>()=>{}}})
 for(const text of ['看看这张行情图','定时任务是什么','查看我的后台任务','解释一下涨跌幅提醒怎么做'])await expect(tool.execute({action:'create',thresholdPercent:3,humanRequest:'设置定时任务'},{agent:agent(text)})).rejects.toThrow(/明确/)
 const child=agent('设置定时任务');child.session.header={parentSession:'board'}
 await expect(tool.execute({action:'create',thresholdPercent:3},{agent:child})).rejects.toThrow(/主会话|子任务/)
})
it('keeps execution guidance private and prevents a scheduled prompt from scheduling itself', async () => {
 const {scheduledRunId, scheduledResultUnchanged} = await import('../packages/dsh-research-task-runtime/scheduled-run.js')
 let guidance, tool
 registerScheduledTaskTool({
   tools: {register: value => {tool = value; return () => {}}},
   systemPrompt: {context: value => {guidance = value.text; return () => {}}}
 })
 const current = agent('每天检查并提醒我')
 const source = current.session.events[0].data.source
 source.rpcId = scheduledRunId('89ea-776d', 'changes')
 expect(guidance({agent: current})).toContain('本次无新变化。')
 await expect(tool.execute({action: 'create'}, {agent: current})).rejects.toThrow(/明确/)
 source.rpcId = scheduledRunId('89ea-776e', 'always')
 expect(guidance({agent: current})).not.toMatch(/NO_CHANGE|本次无新变化/)
 expect(guidance({agent: current})).toContain('执行本次指令')
 current.session.events.push(...agent('帮我设置一个定时任务').session.events)
 expect(guidance({agent: current})).toContain('用 research_scheduled_task 创建')
 expect(scheduledResultUnchanged('市场情况平稳。\n\n本次无新变化。')).toBe(true)
 expect(scheduledResultUnchanged('余额有变。')).toBe(false)
 expect(scheduledResultUnchanged('旧版结果\n[NO_CHANGE]')).toBe(true)
})

it('projects stored scheduled conversations without changing raw events or ordinary replies', async () => {
 const {scheduledHistoryEntries} = await import('../scripts/lib/scheduled-task-history.mjs')
 const suffix = '\n\n这是定时任务的一次执行，请现在执行本次内容，不要再创建定时任务。与本对话上次结果比较。若没有值得提醒的新内容，在最终回复末尾单独写 [NO_CHANGE]；有重要变化则写 [CHANGED]。'
 const user = text => ({event: {type: 'user/message', data: {source: {kind: 'user', rpcId: 'old-uuid'}, content: [{type: 'text', text}]}}})
 const answer = text => ({event: {type: 'assistant/message', data: {message: {content: [{type: 'text', text}]}}}})
 const rows = [user('只回复闹钟已响。'+suffix), answer('闹钟已响\n\n[NO_CHANGE]'), user('解释这些标记'), answer('[CHANGED]')]
 const visible = scheduledHistoryEntries(rows)
 expect(visible[0]).toEqual(user('只回复闹钟已响。'))
 expect(visible[1]).toEqual(answer('闹钟已响'))
 expect(visible[3]).toBe(rows[3])
 expect(rows[1]).toEqual(answer('闹钟已响\n\n[NO_CHANGE]'))
})
