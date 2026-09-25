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
  expect(instruction).toContain('先实际调用与面板字段最匹配的通联工具')
  expect(instruction).toContain('若 API 搜索超时或失败')
  expect(instruction).toContain('目录工具，从实际展示的条目选接口')
  expect(instruction).toContain('目录若只展示首行')
  expect(instruction).toContain('不要猜目录名称、ID 或循环枚举')
  expect(instruction).toContain('此时使用当前会话可见的 financial_query')
  expect(instruction).not.toContain('ework__t_other')
  expect(preferredComponentSourceTools(schemas, '整理会议待办')).toEqual([])
})

it('starts a latest-index query in the current China-market window instead of an unbounded first page', () => {
  const instruction = componentSourceInstruction(
    [{ name: 'ework__t_get_api_info', description: '读取通联 DataYes 接口定义' }],
    '沪深300指数最新日行情',
    new Date('2026-09-25T19:30:00Z')
  )
  expect(instruction).toContain('当前中国市场日期为 2026-09-26')
  expect(instruction).toContain('20260916 至 20260926')
  expect(instruction).toContain('先用接口定义工具读取 getMktIdxd')
  expect(instruction).toContain('不要先发无日期请求')
  expect(instruction).toContain('不可推断原因是尚未收盘')
})
