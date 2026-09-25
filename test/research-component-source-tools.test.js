import { expect, it } from 'vitest'
import { preferredComponentSourceTools, componentSourceInstruction } from '../packages/dsh-research-task-runtime/component-source-tools.js'

it('prefers visible DataYes tools for a financial component without naming unavailable tools', () => {
  const schemas = [
    { name: 'ework__t_search', description: '搜索 Datayes 平台中最匹配的金融数据 API' },
    { name: 'ework__t_call', description: '调用 Datayes 业务 API 并返回数据' },
    { name: 'financial_query', description: '查询股票行情' },
    { name: 'ework__t_other', description: '读取日历事项' }
  ]
  const selected = preferredComponentSourceTools(schemas, '白酒行业工作台：股票日 K 线与成交量')
  expect(selected.map(tool => tool.name)).toEqual(['ework__t_search', 'ework__t_call'])
  const instruction = componentSourceInstruction(selected)
  expect(instruction).toContain('ework__t_search')
  expect(instruction.indexOf('ework__t_search')).toBeLessThan(instruction.indexOf('financial_query'))
  expect(instruction).not.toContain('ework__t_other')
  expect(preferredComponentSourceTools(schemas, '整理会议待办')).toEqual([])
})
