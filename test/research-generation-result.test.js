import { expect, it } from 'vitest'
import { generationContent } from '../packages/dsh-research-collaboration/generation-result.js'

it('ignores generated-container status captions but protects real content and prompts', () => {
  const baseline = { id: 'card', kind: 'generated-container', excerpt: '正在准备任务…', containerPrompt: '生成研究卡片', width: 720 }
  expect(generationContent({ ...baseline, excerpt: '画板更改尚未确认', generationStatus: 'failed', width: 800 })).toBe(generationContent(baseline))
  expect(generationContent({ ...baseline, containerPrompt: '用户修改了要求' })).not.toBe(generationContent(baseline))
  expect(generationContent({ ...baseline, containerSpec: { version: 1, type: 'markdown', content: '用户内容' } })).not.toBe(generationContent(baseline))
  for (const kind of ['pasted-text', 'generated-summary', 'generated-mind-map']) {
    expect(generationContent({ ...baseline, kind, excerpt: '手动修改正文' })).not.toBe(generationContent({ ...baseline, kind }))
  }
})
