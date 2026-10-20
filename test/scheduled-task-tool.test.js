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
