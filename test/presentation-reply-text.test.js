import { expect, it } from 'vitest'
import { visibleReplyText } from '../packages/presentation-editor/overlay/reply-text.js'

it('inserts the readable reply including lists and links, with code kept literally', () => {
  const reply = '## 已完成\n\n- **图表**已调整\n- 核对[原数据](https://example.org)和 `A ** B`\n\n1. 查看第八页'
  expect(visibleReplyText(reply)).toBe('已完成\n\n• 图表已调整\n• 核对原数据和 A ** B\n\n1. 查看第八页')
})

it('keeps table cells, blank lines, and literal angle brackets', () => {
  expect(visibleReplyText('| 名称 | 数值 |\n| --- | --- |\n| 增长 | 8% |\n\n\nA < B & C\n<svg onload="invalid">'))
    .toBe('名称\t数值\n增长\t8%\n\n\nA < B & C\n<svg onload="invalid">')
})
