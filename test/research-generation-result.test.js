import { expect, it } from 'vitest'
import { generationContent, mergeGenerationResult } from '../packages/dsh-research-collaboration/generation-result.js'
import { validateCanvas } from '../packages/dsh-research-collaboration/document.js'

it('工作台自定义生成尺寸作为共享布局保留，结果提交不会覆盖当前框选大小',()=>{
 const node={id:'drawn',kind:'generated-container',width:420,height:230,preserveGenerationSize:true}
 expect(()=>validateCanvas({files:[],artifacts:[node]})).not.toThrow()
 expect(generationContent(node)).toBe(generationContent({...node,preserveGenerationSize:false}))
 expect(mergeGenerationResult(node,{...node,width:800,height:600,preserveGenerationSize:false})).toMatchObject(node)
})

it('ignores generated-container status captions but protects real content and prompts', () => {
  const baseline = { id: 'card', kind: 'generated-container', excerpt: '正在准备任务…', containerPrompt: '生成研究卡片', width: 720 }
  expect(generationContent({ ...baseline, excerpt: '画板更改尚未确认', generationStatus: 'failed', width: 800 })).toBe(generationContent(baseline))
  expect(generationContent({ ...baseline, containerPrompt: '用户修改了要求' })).not.toBe(generationContent(baseline))
  expect(generationContent({ ...baseline, containerSpec: { version: 1, type: 'markdown', content: '用户内容' } })).not.toBe(generationContent(baseline))
  for (const kind of ['pasted-text', 'generated-summary', 'generated-mind-map']) {
    expect(generationContent({ ...baseline, kind, excerpt: '手动修改正文' })).not.toBe(generationContent({ ...baseline, kind }))
  }
})
