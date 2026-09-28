import {it,expect} from 'vitest'
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {renderMarketArtifact} from '../packages/dsh-research-task-runtime/market-artifact.js'
import {applyTerminalPresentation} from '../packages/dsh-research-task-runtime/terminal-presentation.js'
import {applyWorkbenchPresentation,WORKBENCH_PRESENTATION_CSS} from '../packages/dsh-research-task-runtime/workbench-presentation.js'

it('新版预览移除旧终端主题，保留原始行情和表格交互',()=>{
  const spec={version:1,type:'market',variant:'table',title:'财务摘要',asOf:'模拟数据',columns:['报告期','收入'],rows:[['2026E','2,096.0']]}
  const original=renderMarketArtifact(spec).html,legacy=applyTerminalPresentation(original)
  expect(applyWorkbenchPresentation(legacy)).toBe(original)
  const preview=buildResearchHtmlPreview(legacy,spec.title,'dark',{notoFont:'runtime',workbench:true})
  expect(preview).toContain('EWORK_OPENBB_COMPONENT_V1')
  expect(preview).not.toContain('ODYSSEY_TERMINAL_20260926')
  expect(preview).toContain('2,096.0')
  expect(preview).toContain('data-market-search')
  expect(preview).toContain('data-column')
  expect(preview).toContain('sandbox="allow-scripts"')
  expect(preview).not.toContain('allow-same-origin')
  expect(buildResearchHtmlPreview(original,spec.title,'dark',{notoFont:'runtime'})).not.toContain('EWORK_OPENBB_COMPONENT_V1')
})

it('工作台展示层同时覆盖自定义 HTML 样式且不改动业务脚本',()=>{
  const html='<html><head><style>td{color:gold!important}</style></head><body><table><tr><td>1531.00</td></tr></table><script>document.querySelector("td").onclick=()=>console.log("行情")</script></body></html>'
  expect(applyWorkbenchPresentation(html)).toBe(html)
  const preview=buildResearchHtmlPreview(html,'行情','dark',{notoFont:'runtime',workbench:true})
  expect(preview.indexOf('@layer ework-workbench;')).toBeLessThan(preview.indexOf('td{color:gold!important}'))
  expect(preview).toContain('console.log')
  expect(WORKBENCH_PRESENTATION_CSS).toContain('repeat(auto-fit,minmax(min(150px,100%),1fr))')
})
