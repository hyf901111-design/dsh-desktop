import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { classifyResearchCreationRequest, workbenchDealMotion, planningCardPosition, patchResearchCreationProgress } from '../scripts/lib/research-creation-progress.mjs'
import { AFFIRMATIVE_WORKBENCH_REQUESTS, NON_CREATION_WORKBENCH_REQUESTS } from './fixtures/workbench-creation-requests.js'
import {restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
import {stripHomeGuideNative} from '../scripts/lib/home-guide-native.mjs'
import {stripHomeGuidePresentationNative} from '../scripts/lib/home-guide-presentation-native.mjs'
import {Window} from 'happy-dom'
const currentClient=()=>restoreResearchGridWorkbench(stripHomeGuideNative(stripHomeGuidePresentationNative(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))))

function paintAckFixture(painted = false) {
  const installed = currentClient()
  const source = patchResearchCreationProgress(installed)
  const start = source.indexOf('const odysseyPlannedCardsPainted = plan => new Promise(resolve => {')
  const helper = source.slice(start, source.indexOf('const acknowledged = [], mounted = [];', start))
  const frames = new Map(), timers = new Map()
  let nextId = 0, scans = 0
  const document = { querySelectorAll: () => {
    scans++
    return painted ? [{ querySelector: () => ({}), getAttribute: () => 'card' }] : []
  } }
  const schedule = queue => callback => { const id = ++nextId; queue.set(id, callback); return id }
  const runNext = queue => {
    const [id, callback] = queue.entries().next().value
    queue.delete(id); callback()
  }
  const api = new Function('document', 'requestAnimationFrame', 'setTimeout', 'clearTimeout', `
    let active = true;
    ${helper}
    return { paint: odysseyPlannedCardsPainted, deactivate: () => { active = false; } };
  `)(document, schedule(frames), schedule(timers), id => timers.delete(id))
  return { ...api, source, scans: () => scans, frames, timers, frame: () => runNext(frames), timeout: () => runNext(timers) }
}

it('stops the installed paint-ack RAF loop after its bounded wait expires', async () => {
  const f = paintAckFixture(), result = f.paint({ panels: [{ nodeId: 'card' }] })
  f.frame(); expect(f.scans()).toBe(1)
  f.timeout(); expect(await result).toBe(false)
  f.frame()
  expect(f.scans()).toBe(1)
  expect(f.frames.size).toBe(0)
  expect(f.timers.size).toBe(0)
  expect(patchResearchCreationProgress(f.source)).toBe(f.source)
})

it('acknowledges a normal painted frame once and stops after effect cleanup', async () => {
  const success = paintAckFixture(true), painted = success.paint({ panels: [{ nodeId: 'card' }] })
  success.frame(); expect(success.scans()).toBe(1)
  success.frame(); expect(await painted).toBe(true)
  expect(success.frames.size).toBe(0); expect(success.timers.size).toBe(0)
  const cleanup = paintAckFixture(), pending = cleanup.paint({ panels: [{ nodeId: 'card' }] })
  cleanup.deactivate(); cleanup.frame(); expect(await pending).toBe(false)
  expect(cleanup.scans()).toBe(0)
  expect(cleanup.frames.size).toBe(0); expect(cleanup.timers.size).toBe(0)
})

it('主会话结束推断仅显示结果待同步，明确错误和停止文案保持原样',()=>{
  const source=patchResearchCreationProgress(currentClient())
  expect(source).toContain("intent.state === 'stopping' ? 'stopped' : 'ended'); }, 3000);")
  const extract=name=>{const at=source.indexOf('function '+name+'(');return source.slice(at,source.indexOf('\n}',at)+2)}
  const intents=new Map([['s',{id:'intent',kind:'component',types:[],state:'planning',startedAt:1,sawRunning:true}]])
  const finish=new Function('odysseyCreationIntents','odysseyCreationEmit','return '+extract('odysseyCreationFinish'))(intents,()=>{})
  const react={useState:value=>[typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value}),useEffect(){},useLayoutEffect(){}}
  const jsx={jsx:(_type,props)=>props,jsxs:(_type,props)=>props}
  const Card=new Function('react','react_jsx_runtime','ResearchGenerationProcess',planningCardPosition.toString()+';return '+extract('ResearchCreationPlanningCard'))(react,jsx,'process')
  const render=()=>Card({intent:intents.get('s'),sessionId:'s',viewport:{x:0,y:0,scale:1},canvasSize:{width:800,height:600}}).children[1]
  finish('s','ended')
  expect(render()).toMatchObject({phaseOverride:'本轮执行已结束，组件暂未显示',detailOverride:'可查看右侧对话，生成结果会继续同步'})
  finish('s',true);expect(render().phaseOverride).toBe('生成失败 · 未形成组件计划')
  finish('s','stopped');expect(render().phaseOverride).toBe('已停止生成')
})

it('规划卡片缩放时沿用网格坐标，仅移动时采用浮动坐标',async()=>{
  const source=currentClient()
  const patched=patchResearchCreationProgress(source),styleScript=patched.match(/\/\* ODYSSEY_CREATION_PROGRESS_CSS \*\/\n([^\n]+)/)[1]
  const win=new Window(),doc=win.document
  try{
    new Function('document',styleScript)(doc)
    doc.body.innerHTML='<main data-ework-grid data-grid-operation="resize"><section class="odyssey-creation-planning-card" data-planning-grid data-grid-active></section></main>'
    const root=doc.querySelector('main'),card=root.firstElementChild
    // Resize must ignore floating coordinates, including any inherited or stale values.
    // Happy DOM falls back to inline left/top for unresolved variables, unlike Chromium.
    card.style.setProperty('--grid-float-left','0px');card.style.setProperty('--grid-float-top','0px')
    for(const mode of ['light','dark','openterminal','enterprise']){
      root.dataset.workbenchStyle=mode
      for(const [x,y,width,height] of [[640,360,320,220],[720,430,480,360]]){
        Object.assign(card.style,{left:x+'px',top:y+'px',width:width+'px',height:height+'px',transform:'translate(-50%, -50%)'})
        const style=win.getComputedStyle(card)
        expect([style.left,style.top,style.width,style.height]).toEqual([x+'px',y+'px',width+'px',height+'px'])
      }
    }
    root.dataset.gridOperation='move';card.style.setProperty('--grid-float-left','810px');card.style.setProperty('--grid-float-top','510px')
    expect([win.getComputedStyle(card).left,win.getComputedStyle(card).top]).toEqual(['810px','510px'])
    root.removeAttribute('data-grid-operation');card.removeAttribute('data-grid-active');card.style.removeProperty('--grid-float-left');card.style.removeProperty('--grid-float-top')
    expect([win.getComputedStyle(card).left,win.getComputedStyle(card).top]).toEqual(['720px','430px'])
  }finally{await win.happyDOM.abort()}
})

it.each(AFFIRMATIVE_WORKBENCH_REQUESTS)('recognizes natural-language creation in the installed planning-card classifier: %s', text => {
  const installed = new Function('return ' + classifyResearchCreationRequest.toString())()
  for (const classify of [classifyResearchCreationRequest, installed]) expect(classify(text)?.request).toBe(text)
})

it.each(NON_CREATION_WORKBENCH_REQUESTS)('does not announce creation for existing-board requests: %s', text => {
  const installed = new Function('return ' + classifyResearchCreationRequest.toString())()
  for (const classify of [classifyResearchCreationRequest, installed]) expect(classify(text)).toBeNull()
})

it('shows early progress for explicit workbench and component creation, not product questions', () => {
  expect(classifyResearchCreationRequest('请用模拟数据创建金融行情工作台，包含K线、热力图和新闻列表')).toMatchObject({
    kind: 'workbench', types: ['K线', '热力图', '新闻列表']
  })
  expect(classifyResearchCreationRequest('给我生成一张蜡烛图组件')).toMatchObject({ kind: 'component', types: ['蜡烛图'] })
  for (const question of ['为什么组件生成失败？', '如何创建工作台？', '请优化组件生成逻辑', '不要创建工作台', '补齐持仓组件自动刷新，不创建新的工作台', '只更新这张卡，不重新生成工作台', '帮我解释这个组件', '只修正现有资讯组件绑定，读取原绑定做最小修改，不新建卡片', '仅配置现有组件，每分钟更新，不用新建工作台']) {
    expect(classifyResearchCreationRequest(question)).toBeNull()
  }
})

it('does not show a new planning card when repairing failed existing components',()=>{
  for(const text of [
    '继续修复当前这个工作台，估值组件生成失败，请先做静态展示。不要新增工作台和重复组件。',
    '修复现有工作台的图表生成失败问题，保留原组件和数据。',
    '补充：不要新增组件，只修复已有图表。'
  ])expect(classifyResearchCreationRequest(text)).toBeNull()
  expect(classifyResearchCreationRequest('修复现有工作台的图表，另外创建一个新的行业研究工作台。')).toMatchObject({kind:'workbench'})
})

it('does not announce creation for read-only status checks and scopes temporary negation to its own clause', () => {
  const installed = new Function('return ' + classifyResearchCreationRequest.toString())()
  for (const classify of [classifyResearchCreationRequest, installed]) {
    for (const text of [
      '请检查当前工作台各组件的生成状态与数据日期，说明仍需处理的缺失和错误，暂不修改或新建组件。',
      '查看当前工作台组件生成状态和数据日期。',
      '只读检查已有工作台中生成的组件，不做修改。',
      '请检查当前工作台生成的图表，并列出缺失。',
      '请检查当前工作台，暂不新建组件。',
      '请检查当前工作台，先不生成新卡片。',
      '本轮不创建工作台，只检查组件生成情况。'
    ]) expect(classify(text), text).toBeNull()
    for (const text of [
      '请检查当前工作台组件生成状态，另外新建一个预算组件。',
      '暂不修改或新建组件，但另外创建一个独立的行业工作台。',
      '暂不新建工作台；另外创建一张排期卡片。',
      '本轮不新建工作台\n请创建一张排期卡片。',
      '本轮不修改当前工作台，同时新建一个独立行业研究工作台。',
      '请检查当前已有工作台，并创建一张折线图组件。'
    ]) expect(classify(text), text).not.toBeNull()
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
  const source = currentClient()
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
  expect(patched).toContain('关闭生成提示')
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
