import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { classifyResearchCreationRequest, workbenchDealMotion, planningCardPosition, patchResearchCreationProgress } from '../scripts/lib/research-creation-progress.mjs'
import {restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'

it('shows early progress for explicit workbench and component creation, not product questions', () => {
  expect(classifyResearchCreationRequest('请用模拟数据创建金融行情工作台，包含K线、热力图和新闻列表')).toMatchObject({
    kind: 'workbench', types: ['K线', '热力图', '新闻列表']
  })
  expect(classifyResearchCreationRequest('给我生成一张蜡烛图组件')).toMatchObject({ kind: 'component', types: ['蜡烛图'] })
  for (const question of ['为什么组件生成失败？', '如何创建工作台？', '请优化组件生成逻辑', '不要创建工作台', '补齐持仓组件自动刷新，不创建新的工作台', '只更新这张卡，不重新生成工作台', '帮我解释这个组件']) {
    expect(classifyResearchCreationRequest(question)).toBeNull()
  }
})

it('deals new cards outward from the planning card at the current canvas zoom', () => {
  const [start, end] = workbenchDealMotion(
    {left:100,top:100,width:160,height:110},
    {left:400,top:260,width:268,height:132}, 536)
  expect(start.transform).toContain('translate(-708px, -342px)')
  expect(start.opacity).toBe(0)
  expect(end).toEqual({opacity:1,transform:'translate(0, 0) scale(1)'})
})

it('centers the first planning card in the visible research canvas', () => {
  const viewport = { x:-280, y:-90, scale:.8 }
  const position = planningCardPosition(viewport, { width:900, availableWidth:720, height:800, visibleHeight:740 })
  expect(position.x * viewport.scale + viewport.x).toBeCloseTo((720 - 320 * .8) / 2)
  expect(position.y * viewport.scale + viewport.y).toBeCloseTo((740 - 88 - 220 * .8) / 2)
})

it('keeps the submit, canvas and workbench handoff patch stable on reinstall', () => {
  const source = restoreResearchGridWorkbench(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
  const patched = patchResearchCreationProgress(source)
  expect(patched.includes('ODYSSEY_CREATION_PROGRESS_V3')).toBe(true)
  expect(patched.includes('ODYSSEY_CREATION_PROGRESS_V2')).toBe(false)
  expect(patched.includes('ODYSSEY_CREATION_PROGRESS_V1')).toBe(false)
  expect(patched).toContain('data-research-creation-planning')
  expect(patched.includes('ODYSSEY_CREATION_CANVAS_CARD_V3')).toBe(true)
  expect(patched).toContain("/* ODYSSEY_CREATION_POINTER_ISOLATION */ if (event.target?.closest?.('[data-research-create-popover],[data-research-voice-feedback],[data-research-creation-planning]')) return;")
  expect(patched.includes('sessionId, viewport, canvasSize:snapshot.canvasSize, workspace, onDismiss: () => odysseyCreationFinish(sessionId)')).toBe(true)
  expect(patched.includes('onPointerMove: event => {')).toBe(true)
  expect(patched).toContain('ResearchGenerationProcess, { node, sessionId, phaseOverride: phase')
  expect(patched).toContain('ODYSSEY_CREATION_CARD_ACTIONS')
  expect(patched).toContain('ODYSSEY_WORKBENCH_MOUNT_ACK')
  expect(patched).toContain('odysseyCreationDeal(sessionId, plan, dealOrigin)')
  expect(patched).toContain('card.animate(workbenchDealMotion(origin, rect, card.offsetWidth || rect.width)')
  expect(patched).toContain('data-research-creation-planning=dealing')
  expect(patched).toContain('执行者正在确定面板清单；确认后会按实际数量放入画布')
  expect(patched).not.toContain('计划包含：')
  expect(patched).toContain('ODYSSEY_WORKBENCH_PAINT_ACK')
  expect(patched).toContain('if (plan.ready) acknowledged.push(plan.id); else if (await odysseyPlannedCardsPainted(plan)) mounted.push(plan.id);')
  expect(patched).toContain('workbenchRevealAt: Date.now() + plan.panels.indexOf(p) * 120')
  expect(patched).toContain('[sessionId, researchWorkspace, session?.running]')
  expect(patched).toContain('ODYSSEY_WORKBENCH_PLAN_HYDRATION')
  expect(patched).toContain('ODYSSEY_QUEUED_ELAPSED_CLOCK')
  expect(patched).toContain('ODYSSEY_CREATION_THEME_CSS')
  expect(patched).toContain('body[data-ds-dark-theme] .odyssey-creation-planning-card')
  expect(patched).toContain('if (session?.running) { if (!intent.sawRunning)')
  expect(patched).toContain('[sessionId, session?.running]')
  expect(patched).not.toContain('[sessionId, session.running]')
  expect(patchResearchCreationProgress(patched)).toBe(patched)
})
