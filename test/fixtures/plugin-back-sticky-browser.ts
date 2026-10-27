import { IntegrationView } from '../../src/preload/integrations/view'
import { WorkspaceSurfaceHost } from '../../src/preload/workspace-surface-host'
import type { IntegrationBridge, IntegrationSnapshot } from '../../src/preload/integrations/bridge'

const host = new WorkspaceSurfaceHost(document)
const rows: IntegrationSnapshot['rows'] = Array.from({ length: 36 }, (_, index) => ({
  id: `plugin-${index + 1}`, kind: 'plugin', tab: 'plugins', name: `研究资料插件 ${index + 1}`,
  description: '管理研究资料和可复用能力，核对来源并保存个人工作方法。',
  enabled: true, status: '已启用', source: '个人', revision: 1, removable: true
}))
rows.push({ id: 'skill', kind: 'skill', tab: 'skills', name: '研究写作技能', description: '查看完整制作要求',
  enabled: true, status: '已启用', source: '个人', revision: 1, removable: true })
const bridge: IntegrationBridge = {
  async request(command) {
    if (command.type === 'snapshot') return { type: 'snapshot', snapshot: { revision: 1, rows } }
    if (command.type === 'market') return { type: 'market', entries: [] }
    if (command.type === 'dependencies') return { type: 'dependencies', descriptions: [] }
    if (command.type === 'skill-detail') return { type: 'skill-detail', id: 'skill', revision: 1,
      enabled: true, invocationName: 'research', content: '# 写作要求\n\n' + Array.from({ length: 45 }, (_, i) => `## 章节 ${i + 1}\n\n以数据和来源支持观点，保留可核对的研究说明。\n\n`).join('') }
    throw new Error(`Fixture forbids mutation: ${command.type}`)
  }
}
const view = new IntegrationView(document, bridge, host)
const nativePane = document.querySelector<HTMLButtonElement>('[data-odyssey-panel-entry=right]')!
let paneClicks = 0
nativePane.addEventListener('click', () => { paneClicks++ })

const fixture = {
  host, view,
  async open() { await view.open('integrations/plugins') },
  setSidebar(width: number) { document.querySelector<HTMLElement>('[data-dsh-sidebar-root]')!.style.width = `${width}px` },
  setRight(width: number) { document.documentElement.style.setProperty('--odyssey-right-occupancy', `${width}px`); window.dispatchEvent(new Event('resize')) },
  get paneClicks() { return paneClicks },
  dispose() { view.dispose(); host.dispose() }
}
Object.assign(window, { pluginBackFixture: fixture })
void fixture.open()
