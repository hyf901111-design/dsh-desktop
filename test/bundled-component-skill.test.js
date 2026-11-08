import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import { loadBundledComponentSkill } from '../packages/dsh-research-task-runtime/component-skill.js'
import { buildResearchTaskPrompt } from '../packages/dsh-research-task-runtime/index.js'
import { workbenchPanelPrompt } from '../packages/dsh-research-task-runtime/workbench-plan.js'

const projectRoot = path.resolve(import.meta.dirname, '..')
const bundledSkillRoot = path.join(projectRoot, 'skills')
const slug = 'ework-workbench-components'

describe('EWork bundled component skill', () => {
  it.each(['full','panel','selection'])('injects OpenTerminal layout priorities into the %s generation path',profile=>{
    const prompt=loadBundledComponentSkill(bundledSkillRoot,{profile})
    expect(prompt).toContain('【references/openterminal-layouts.md】')
    expect(prompt).toContain('市场指数、自选股、个股行情')
    expect(prompt).toContain('QuoteWidget')
    expect(prompt).toContain('RecapWidget')
    expect(prompt).toContain('不采用 ChartWidget 和 WatchlistWidget')
  })
  it('is an always available bundled skill with current version 1.39.24', async () => {
    const provider = new FileSystemSkillProvider(
      { get: () => undefined, logger: { warn: vi.fn() } },
      { signal: new AbortController().signal, invalidate: vi.fn() },
      { includeDefaultRoots: false, bundledSkillDir: bundledSkillRoot, watch: false }
    )
    try {
      const observation = await provider.list({})
      const candidates = Array.isArray(observation) ? observation : observation.candidates
      const candidate = candidates.find((entry) => entry.name === slug)
      expect(candidate).toMatchObject({
        name: slug,
        source: 'bundled',
        resourceBase: { kind: 'directory', path: path.join(bundledSkillRoot, slug) }
      })
      expect(candidate?.description).toContain('21M Figma')
      const loaded = candidate && await provider.get(candidate, {})
      expect(loaded?.content).toContain('320×220')
      const metadata = JSON.parse(readFileSync(path.join(bundledSkillRoot, slug, '_meta.json'), 'utf8'))
      expect(metadata).toEqual({ slug, cnName: '工作台组件生成', version: 'v1.39.24', source: 'eSkill' })
    } finally {
      await provider.dispose()
    }
  })

  it.each(['container', 'create'])('loads the entire built-in contract for %s generation', (kind) => {
    const base = { parentSessionId: 'session', canvasNodeId: 'node', kind, prompt: '展示合同到期与回款风险' }
    const request = kind === 'create'
      ? { ...base, sources: [{ id: 'data', type: 'artifact', title: '台账', text: '两份合同在30天内到期。' }] }
      : base
    const prompt = buildResearchTaskPrompt(request)
    expect(prompt).toContain('内置技能 ework-workbench-components v1.39.24')
    if(kind==='create'){
      expect(prompt).toContain('【references/selection-runtime.md】')
      expect(prompt).toContain('不提供额外搜索权限')
      expect(prompt).not.toContain('真实证券行情和K线优先复用')
    }else{
      expect(prompt).toContain('【references/figma-21m.md】')
      expect(prompt).toContain('【references/adaptation-and-acceptance.md】')
      expect(prompt).toContain('【references/runtime-v1.md】')
      expect(prompt).toContain('S 320×220、M 656×220、L 656×456')
    }
    expect(prompt).toContain('用户需求：展示合同到期与回款风险')
  })

  it('fails closed when the bundled instructions cannot be read', () => {
    expect(() => loadBundledComponentSkill(path.join(projectRoot, 'missing-bundled-skills')))
      .toThrow('内置组件生成技能不可用')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('DSH_BUNDLED_SKILL_DIR', path.join(projectRoot, 'missing-bundled-skills'))
    try {
      expect(() => buildResearchTaskPrompt({
        parentSessionId: 'session', canvasNodeId: 'node', kind: 'container', prompt: '展示风险'
      })).toThrow('内置组件生成技能不可用')
    } finally {
      vi.unstubAllEnvs()
      warning.mockRestore()
    }
  })

  it('keeps a full workbench panel request while applying the same skill', () => {
    const requirement = '展示即将到期合同、逾期回款和经办人，并保留每项风险的来源与日期。'.repeat(12)
    const panelPrompt = workbenchPanelPrompt(
      { title: '合同管理工作台' },
      { title: '风险明细', type: 'table', size: 'large', width: 656, height: 456, prompt: requirement }
    )
    const prompt = buildResearchTaskPrompt({
      parentSessionId: 'session', canvasNodeId: 'panel', kind: 'container', prompt: panelPrompt
    })
    expect(prompt).toContain(requirement)
    expect(prompt).toContain('内置技能 ework-workbench-components v1.39.24')
    expect(prompt).toContain('建议呈现结构（可按实际数据调整）')
    expect(prompt.match(/内置技能 ework-workbench-components v1\.39\.24/g)).toHaveLength(1)
    expect(prompt).not.toContain('market.candlestick')
    expect(prompt).toContain('S 320×220、M 656×220、L 656×456')
    expect(prompt.length).toBeLessThan(9000)
    expect(prompt).not.toContain('YouTube视频用panel.type=youtube')
    expect(prompt).not.toContain('音频使用 panel.type=audio')
    expect(panelPrompt).not.toContain('文字最多450字')
  })

  it('gives a market panel only its selected host template schema', () => {
    const panelPrompt = workbenchPanelPrompt({ title: '白酒工作台' }, {
      title: '龙头白酒股K线图', type: 'market', size: 'large',
      prompt: '展示近三个月 OHLC 和成交量，缺失成交量如实标注'
    })
    const prompt = buildResearchTaskPrompt({ parentSessionId: 'session', canvasNodeId: 'panel', kind: 'container', prompt: panelPrompt })
    expect(prompt).toContain('"variant":"candlestick"')
    expect(prompt).toContain('volume 可为 null')
    expect(prompt).not.toContain('fund-holdings')
  })

  it.each(['markdown', 'timeline', 'html'])('treats %s as a presentation suggestion for unresolved source content', type => {
    const panelPrompt = workbenchPanelPrompt({ title: '项目复盘', dataMode: 'source' }, {
      title: '事件脉络', type, size: 'large', prompt: '从会议记录中提取行动和依赖，保留实际出处'
    })
    const prompt = buildResearchTaskPrompt({ parentSessionId: 'session', canvasNodeId: 'panel', kind: 'container', prompt: panelPrompt })
    expect(panelPrompt).toContain('规划类型仅用于初始布局')
    expect(prompt).toContain('建议呈现结构（可按实际数据调整）')
    expect(prompt).not.toContain('唯一交付格式')
    expect(prompt).toContain('原生能力无法表达所需布局或交互')
  })
})
