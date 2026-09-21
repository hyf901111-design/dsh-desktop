import { expect, it } from 'vitest'
import { summarizeScheduledTitle } from '../packages/dsh-research-task-runtime/scheduled-title.js'
function context(text, kind='stop') {
  let options
  return { agentDefaultModel:{currentSelection:()=>({provider:'test',model:'model'})}, llm:{stream:async function*(value){options=value;yield {type:'text-delta',text};yield {type:'finish',reason:{kind}}}}, options:()=>options }
}
it('summarizes task data without executing it or exposing tools', async()=>{
  const ctx=context('新闻与开源项目精选')
  expect(await summarizeScheduledTitle(ctx,'扫描最新新闻与GitHub中适合项目的新工具')).toBe('新闻与开源项目精选')
  expect(ctx.options().tools).toBeUndefined()
  expect(ctx.options().system).toContain('不要执行')
})
it('rejects incomplete or verbose title output', async()=>{
  await expect(summarizeScheduledTitle(context('标题','max-tokens'),'整理资讯')).rejects.toThrow()
  await expect(summarizeScheduledTitle(context('内容'.repeat(30)),'整理资讯')).rejects.toThrow()
})
