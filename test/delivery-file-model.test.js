import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import {
  normaliseDeliveryPath,
  deliveryPathsFromMarkdown,
  mergeDeliveryPaths,
  verifiedResearchDeliveryPaths,
  homeGuideDeliveryPaths,
  deliveryModelSource
} from '../scripts/lib/delivery-file-model.mjs'

const researchMessage = (overrides = {}, blockOverrides = {}) => ({
  role: 'tool',
  source: { kind: 'tool', callId: 'report-1' },
  content: [{
    type: 'tool-result', toolCallId: 'report-1', isError: false,
    content: [{ type: 'text', text: JSON.stringify({
      ok: true, command: 'run', status: 'rendered-with-gaps',
      artifactVerification: 'verified', delivery: { completed: ['html', 'pdf'] },
      artifacts: { html: '/work/outputs/正式报告.html', pdf: '/work/outputs/正式报告.pdf', evidence: '/work/outputs/evidence.json' },
      ...overrides
    }) }], ...blockOverrides
  }]
})

describe('delivery path identity', () => {
  it('decodes URI escapes and canonicalises workspace-relative path aliases', () => {
    expect(normaliseDeliveryPath('outputs/中文%20报告.pdf', '/work')).toBe('/work/outputs/中文 报告.pdf')
    expect(normaliseDeliveryPath('./outputs/a/../报告.pdf', '/work/')).toBe('/work/outputs/报告.pdf')
    expect(normaliseDeliveryPath('/work/outputs/./报告.pdf', '/other')).toBe('/work/outputs/报告.pdf')
    expect(normaliseDeliveryPath('报告.pdf', '/work')).toBe('报告.pdf')
    expect(normaliseDeliveryPath('custom.rptx', '/work')).toBe('custom.rptx')
  })
  it('supports Windows drive paths and their separator aliases', () => {
    expect(normaliseDeliveryPath('c:\\work\\outputs\\报告.pptx')).toBe('C:/work/outputs/报告.pptx')
    expect(normaliseDeliveryPath('.\\outputs\\报告.pptx', 'c:\\work')).toBe('C:/work/outputs/报告.pptx')
    expect(normaliseDeliveryPath('C:/work/./outputs/报告.pptx')).toBe('C:/work/outputs/报告.pptx')
  })
  it.each([
    '', null, {}, 'https://example.com/a.pdf', 'file:///work/a.pdf', 'javascript:alert.pdf',
    'data:application/pdf,a', '//example.com/a.pdf', '%68ttps%3A%2F%2Fevil.test/a.pdf',
    '/work/a%00.pdf', '/work/a\n.pdf', '\n/work/a.pdf', '/work/a.pdf\t', 'outputs/%E0%A4%A.pdf', 'C:report.pdf'
  ])('rejects malformed or non-local value %j', value => {
    expect(normaliseDeliveryPath(value, '/work')).toBeUndefined()
  })
})

describe('explicit final-message delivery links', () => {
  it('keeps complete Chinese names, spaces, balanced parentheses and optional titles', () => {
    const text = '[PDF](<outputs/贵州茅台（600519.SH）报告 (正式版).pdf>) · [PPT](outputs/方案(终稿(二)).pptx "打开演示文稿")\n[数据](<outputs/研究数据.csv> \'数据文件\')'
    expect(deliveryPathsFromMarkdown(text, '/work')).toEqual([
      '/work/outputs/贵州茅台（600519.SH）报告 (正式版).pdf',
      '/work/outputs/方案(终稿(二)).pptx', '/work/outputs/研究数据.csv'
    ])
  })
  it('accepts custom file extensions and link labels containing inline-code names', () => {
    expect(deliveryPathsFromMarkdown('[`模型.custom-format`](outputs/模型.custom-format) [结果](<out/data.myext> "custom")', '/work'))
      .toEqual(['/work/outputs/模型.custom-format', '/work/out/data.myext'])
  })
  it('ignores code, images, raw names, URLs, schemes and directory links', () => {
    const text = '[文档](outputs/真实.pdf) ` [假](outputs/inline.pdf) `\n```md\n[假](outputs/fenced.pptx)\n```\n~~~\n[假](outputs/tilde.xlsx)\n~~~\n![图](out/image.png) ![嵌套 [标签](out/alt.pdf)](out/picture.png) [网站](https://example.com/a.pdf) [危险](javascript:evil.pdf) [目录](outputs/) [目录](outputs) 报告.pdf'
    expect(deliveryPathsFromMarkdown(text, '/work')).toEqual(['/work/outputs/真实.pdf'])
  })
  it('does not consume ordinary Markdown after a malformed link', () => {
    expect(deliveryPathsFromMarkdown('[坏](bad( [好](out/good.pdf)\n[另好](out/second.pdf)', '/work'))
      .toEqual(['/work/out/good.pdf', '/work/out/second.pdf'])
  })
  it('handles parenthesised link titles', () => {
    expect(deliveryPathsFromMarkdown('[结果](out/report.pdf (正式交付))', '/work'))
      .toEqual(['/work/out/report.pdf'])
  })
  it('only ends an inline-code span with a matching backtick run', () => {
    expect(deliveryPathsFromMarkdown('``ignore ``` [假](out/no.pdf) `` [好](out/yes.pdf)', '/work'))
      .toEqual(['/work/out/yes.pdf'])
  })
  it('deduplicates decoded aliases and preserves names in distinct directories', () => {
    expect(deliveryPathsFromMarkdown('[A](out/报告%20A.pdf) [B](./out/报告%20A.pdf) [C](other/报告%20A.pdf)', '/work'))
      .toEqual(['/work/out/报告 A.pdf', '/work/other/报告 A.pdf'])
  })
  it('handles escaped punctuation in destinations without treating escaped labels as links', () => {
    expect(deliveryPathsFromMarkdown('\\[不是链接](out/no.pdf) [附件](out/报告\\(终稿\\).pdf)', '/work'))
      .toEqual(['/work/out/报告(终稿).pdf'])
  })
  it('fails closed for non-strings and incomplete links', () => {
    for (const text of [null, {}, '[结果](', '[结果](<bad.pdf)', '[结果](out/a.pdf "unterminated)']) {
      expect(deliveryPathsFromMarkdown(text, '/work')).toEqual([])
    }
  })
})

describe('delivery path merging', () => {
  it('recognises explicit final delivery inline-code paths without changing Markdown parsing', () => {
    const text = '已完成，交付文件如下：\n- PPTX：`/work/out/正式报告（完整版）.pptx`\n- PDF 预览：`out/正式报告.pdf`'
    expect(deliveryPathsFromMarkdown(text, '/work')).toEqual([])
    expect(mergeDeliveryPaths([], text, '/work')).toEqual(['/work/out/正式报告（完整版）.pptx', '/work/out/正式报告.pdf'])
  })
  it.each([
    ['交付文件：`out/模型.custom-format`', '/work/out/模型.custom-format'],
    ['已完成，交付文件如下：\n\n- `out/final.pptx`', '/work/out/final.pptx'],
    ['交付文件：\n\n- 执行摘要：`out/年度 报告.pdf`', '/work/out/年度 报告.pdf'],
    ['Final deliverables:\n- PPTX: `out/final.pptx`', '/work/out/final.pptx'],
    ['已完成。PPTX：`out/final.pptx`', '/work/out/final.pptx'],
    ['已完成。**PPTX**：`out/final.pptx`', '/work/out/final.pptx'],
    ['**交付文件**：`out/final.pptx`', '/work/out/final.pptx'],
    ['Finished. **PPTX**: `out/final.pptx`', '/work/out/final.pptx'],
    ['已完成，交付文件：``out/收益100%.pdf``', '/work/out/收益100%.pdf'],
    ['交付文件：`out/a%20b.pdf`', '/work/out/a%20b.pdf'],
    ['交付文件：`out/年度 预测😀/正式报告 (终稿).pptx`', '/work/out/年度 预测😀/正式报告 (终稿).pptx'],
    ['交付文件：`C:\\work\\out\\final.pptx`', 'C:/work/out/final.pptx'],
    ['交付文件：`.\\out\\final.pptx`', '/work/out/final.pptx']
  ])('recognises an explicitly delivered local path: %s', (text, path) => {
    expect(mergeDeliveryPaths([], text, '/work')).toEqual([path])
  })
  it.each([
    '当前候选文件：`out/候选.pptx`，尚未通过原生验收，本轮不正式交付。',
    '已完成结构校验，尚未正式交付。\n交付文件：`out/候选.pptx`',
    '交付文件：`out/候选.pptx`，仍待验收。',
    '交付文件：`out/候选.pptx`，还没通过检查。',
    '已完成文件生成。\n\n交付文件：`out/候选.pptx`\n\n注意：当前仍待原生验收，暂不能正式交付。',
    '已完成，交付文件如下：\n- PPT：`out/候选.pptx`\n\n原生验收尚未完成，不能正式交付。',
    '非交付文件：`out/review.pptx`',
    '已完成文件生成，暂不作为正式交付文件：`out/review.pptx`',
    '交付文件：`out/review.pptx`，等待 PowerPoint 原生验收。',
    '交付文件：`out/review.pptx`（待 PowerPoint 原生逐页验收）',
    '交付文件：`out/review.pptx`，尚未做原生验收。',
    '交付文件：`out/review.pptx`，仍需在 PowerPoint 中打开检查。',
    '交付文件：`out/review.pptx`，还需在 Microsoft PowerPoint 里打开并逐页检查。',
    '交付文件：`out/review.pptx`，原生验收仍待完成。',
    'Deliverables: `out/review.pptx`, awaiting native QA.',
    'Candidate deliverables: `out/draft.pptx`, not yet ready.',
    '已完成。参考文件：`out/source.pdf`',
    '已完成。参考报告：`out/source.pdf`',
    '已完成。原始PPT：`out/source.pptx`',
    '已完成。输入 PDF：`out/source.pdf`',
    '已完成。\n\n> 交付文件：`out/quoted.pdf`',
    '已完成。运行命令：`python out/generate.py`',
    '交付文件：`python out/generate.py`',
    '交付文件：`/usr/bin/python /work/out/final.pptx`',
    '交付文件：`./generate.py out/final.pptx`',
    '交付文件：\n- 下载前请执行 `/usr/bin/cat outputs/final.pptx`',
    '交付文件：\n- 执行以下命令查看文件：`/usr/bin/cat outputs/final.pptx`',
    '交付文件：`https://example.com/report.pdf`',
    '交付文件：`file:///work/report.pdf`',
    '交付文件：`out/folder/`',
    '交付文件：`report.pdf`',
    '交付文件：\n```text\n`out/fenced.pptx`\n```',
    '交付文件：`out/report.pptx',
    '交付文件：\n- PPTX: `out/one\ntwo.pptx`'
  ])('does not infer delivery from candidate, reference, command or invalid code paths: %s', text => {
    expect(mergeDeliveryPaths([], text, '/work')).toEqual([])
  })
  it('keeps a delivery list across blank lines without leaking into following prose', () => {
    const text = '交付文件：\n\n- `out/报告.pdf`\n\n- `out/方案.pptx`\n\n后续参考：\n- `out/源资料.pdf`'
    expect(mergeDeliveryPaths([], text, '/work')).toEqual(['/work/out/报告.pdf', '/work/out/方案.pptx'])
  })
  it('deduplicates inline paths with produced files and explicit links and respects the link destination', () => {
    const text = '已完成，交付文件如下：\n- PPTX：`out/final.pptx` [下载](out/final.pptx)\n- PDF：[`out/label.pdf`](out/actual.pdf)'
    expect(mergeDeliveryPaths(['out/final.pptx'], text, '/work')).toEqual(['/work/out/final.pptx', '/work/out/actual.pdf'])
  })
  it('keeps produced order, then final-link order, with canonical deduplication', () => {
    expect(mergeDeliveryPaths(['out/报告.pdf', '/work/out/报告.pdf', 'out/自定义.abc'], '[PDF](./out/报告.pdf) [PPT](out/方案.pptx)', '/work'))
      .toEqual(['/work/out/报告.pdf', '/work/out/自定义.abc', '/work/out/方案.pptx'])
  })
  it('folds a final naked filename into its unique known produced file', () => {
    expect(mergeDeliveryPaths(['/work/out/report.pdf'], '[PDF](report.pdf)', '/work'))
      .toEqual(['/work/out/report.pdf'])
    expect(mergeDeliveryPaths(['out/收益100%.pdf'], '[PDF](收益100%25.pdf)', '/work'))
      .toEqual(['/work/out/收益100%.pdf'])
  })
  it('retains distinct known directories without adding an ambiguous naked card', () => {
    expect(mergeDeliveryPaths(['a/报告.pdf', 'b/报告.pdf'], '[下载](报告.pdf)', '/work'))
      .toEqual(['/work/a/报告.pdf', '/work/b/报告.pdf'])
  })
  it('keeps an unknown naked filename available for the existing lookup', () => {
    expect(mergeDeliveryPaths(['out/已知.pdf'], '[下载](未知.pdf)', '/work'))
      .toEqual(['/work/out/已知.pdf', '未知.pdf'])
  })
  it('preserves literal percent characters in filesystem-produced paths', () => {
    expect(mergeDeliveryPaths(['outputs/收益100%.pdf', 'outputs/a%20b.pdf'], '', '/work'))
      .toEqual(['/work/outputs/收益100%.pdf', '/work/outputs/a%20b.pdf'])
    expect(mergeDeliveryPaths(['out/a%20b.pdf'], '[结果](out/a%2520b.pdf)', '/work'))
      .toEqual(['/work/out/a%20b.pdf'])
  })
  it('does not decode percent-encoded Markdown identities twice', () => {
    expect(mergeDeliveryPaths([], '[结果](out/100%25.pdf) [编码](out/a%2520b.pdf)', '/work'))
      .toEqual(['/work/out/100%.pdf', '/work/out/a%20b.pdf'])
  })
  it('keeps proven extensionless outputs without guessing directory links', () => {
    expect(mergeDeliveryPaths(['README', 'out/Makefile', 'out/'], '[目录](out/folder)', '/work'))
      .toEqual(['README', '/work/out/Makefile'])
  })
  it('does not throw on malformed collections', () => {
    expect(mergeDeliveryPaths(null, null, '/work')).toEqual([])
    expect(mergeDeliveryPaths([null, {}], '[结果](out/a.foo)', '/work')).toEqual(['/work/out/a.foo'])
  })
})

describe('verified research tool result delivery', () => {
  it('reads the real nested tool message shape and returns HTML and PDF only', () => {
    expect(verifiedResearchDeliveryPaths(researchMessage())).toEqual(['/work/outputs/正式报告.html', '/work/outputs/正式报告.pdf'])
  })
  it('preserves literal filesystem percent signs in verified artifact paths', () => {
    expect(verifiedResearchDeliveryPaths(researchMessage({ artifacts: {
      html: '/work/outputs/收益100%.html', pdf: '/work/outputs/收益100%.pdf'
    } }))).toEqual(['/work/outputs/收益100%.html', '/work/outputs/收益100%.pdf'])
    expect(verifiedResearchDeliveryPaths(researchMessage({ artifacts: {
      html: '/work/outputs/a%20b.html', pdf: '/work/outputs/a%20b.pdf'
    } }))).toEqual(['/work/outputs/a%20b.html', '/work/outputs/a%20b.pdf'])
  })
  it.each([
    { ok: false }, { command: 'validate' }, { artifactVerification: 'unverified' },
    { status: 'cancelled' }, { status: 'timeout' }, { status: 'integrity-failed' },
    { delivery: { completed: ['html'] } }, { artifacts: { html: '/work/report.html' } }
  ])('rejects incomplete or failed research outcome %j', outcome => {
    expect(verifiedResearchDeliveryPaths(researchMessage(outcome))).toEqual([])
  })
  it('rejects outer failed blocks, assistant messages, plain JSON and unsafe file paths', () => {
    expect(verifiedResearchDeliveryPaths(researchMessage({}, { isError: true }))).toEqual([])
    expect(verifiedResearchDeliveryPaths({ ...researchMessage(), source: { kind: 'assistant' } })).toEqual([])
    expect(verifiedResearchDeliveryPaths({ ok: true, artifacts: { pdf: '/work/a.pdf' } })).toEqual([])
    expect(verifiedResearchDeliveryPaths(researchMessage({ artifacts: { html: '/work/report.html', pdf: 'https://example.com/report.pdf' } }))).toEqual([])
    for (const message of [null, {}, { source: { kind: 'tool' }, content: [{ type: 'tool-result', content: [{ type: 'text', text: '{bad json' }] }] }]) {
      expect(verifiedResearchDeliveryPaths(message)).toEqual([])
    }
  })
})

describe('private home guide durable delivery', () => {
  const message = (tool='home_presentation_publish', overrides={}, error=false) => ({source:{kind:'tool',callId:'publish-1'},content:[{type:'tool-result',toolCallId:'publish-1',isError:error,content:[{type:'text',text:JSON.stringify({kind:'ework-home-guide-delivery',version:1,tool,ok:true,status:'completed',files:tool==='home_presentation_publish'?[{format:'pptx',path:'/work/收益100% a%20b.pptx'},{format:'pdf',path:'/work/原始 (中文) 研报.pdf'}]:[{format:'html',path:'/work/研究 (中文) #1.html'},{format:'pdf',path:'/work/研究 (中文) #1.pdf'}],...overrides})}]}]})
  it.each(['home_presentation_publish','home_report_publish'])('recognizes only the successful paired %s result after its presenter is gone',tool=>{
    const result=homeGuideDeliveryPaths(message(tool),tool)
    expect(result).toEqual(tool==='home_presentation_publish'?['/work/收益100% a%20b.pptx','/work/原始 (中文) 研报.pdf']:['/work/研究 (中文) #1.html','/work/研究 (中文) #1.pdf'])
    expect(homeGuideDeliveryPaths(message(tool),'ordinary_tool')).toEqual([])
    expect(homeGuideDeliveryPaths(message(tool),tool==='home_report_publish'?'home_presentation_publish':'home_report_publish')).toEqual([])
  })
  it.each([{ok:false},{version:2},{status:'failed'},{status:'cancelled'},{status:'pending'},{files:[]},{files:[{format:'pptx',path:'/work/a.pptx'}]},{files:[{format:'pptx',path:'https://example.com/a.pptx'},{format:'pdf',path:'/work/a.pdf'}]},{files:[{format:'pptx',path:'/work/../a.pptx'},{format:'pdf',path:'/work/a.pdf'}]},{files:[{format:'html',path:'/work/a.html'},{format:'pdf',path:'/work/a.pdf'}]}])('declines incomplete or unsafe demo output %j',overrides=>{
    expect(homeGuideDeliveryPaths(message('home_presentation_publish',overrides),'home_presentation_publish')).toEqual([])
  })
  it('rejects failed, unpaired, assistant and naked JSON messages',()=>{
    expect(homeGuideDeliveryPaths(message('home_presentation_publish',{},true),'home_presentation_publish')).toEqual([])
    const wrong=message();wrong.content[0].toolCallId='different-call';expect(homeGuideDeliveryPaths(wrong,'home_presentation_publish')).toEqual([])
    const assistant=message();assistant.source.kind='assistant';expect(homeGuideDeliveryPaths(assistant,'home_presentation_publish')).toEqual([])
    expect(homeGuideDeliveryPaths({kind:'ework-home-guide-delivery',ok:true},'home_presentation_publish')).toEqual([])
  })
})

it('ships self-contained injected functions with identical behavior', () => {
  const model = runInNewContext(deliveryModelSource + ';({normaliseDeliveryPath,deliveryPathsFromMarkdown,mergeDeliveryPaths,verifiedResearchDeliveryPaths})')
  expect(Array.from(model.mergeDeliveryPaths(['out/报告.pdf'], '[PDF](out/报告.pdf) [PPT](out/方案.pptx)', '/work')))
    .toEqual(['/work/out/报告.pdf', '/work/out/方案.pptx'])
  expect(Array.from(model.mergeDeliveryPaths([], '已完成，交付文件如下：\n- PPT：`out/方案.pptx`', '/work')))
    .toEqual(['/work/out/方案.pptx'])
  expect(Array.from(model.verifiedResearchDeliveryPaths(researchMessage())))
    .toEqual(['/work/outputs/正式报告.html', '/work/outputs/正式报告.pdf'])
})
