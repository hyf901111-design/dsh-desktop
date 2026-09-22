import { Window } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { IntegrationView } from '../src/preload/integrations/view'
import type { IntegrationCommand, IntegrationReply } from '../src/shared/integration-ui'

const cleanups: Array<() => void> = []
afterEach(() => { for (const close of cleanups.splice(0)) close() })
async function fixture() {
  const window = new Window(), document = window.document as unknown as Document
  document.body.innerHTML = '<aside data-dsh-sidebar-root></aside><main class="pI_x6G_centerCol"></main>'
  const calls: IntegrationCommand[] = [], revealSource = vi.fn(async (_path: string): Promise<void> => undefined)
  const reply: Extract<IntegrationReply, { type: 'legacy-preview' }> = { type: 'legacy-preview', eligibleCount: 0, items: [
    { name: 'efund-ppt-maker', kind: 'personal', status: 'failed', sourcePath: '/test/personal/efund-ppt-maker', message: '暂不能接入管理；原技能保持原方式使用。', diagnostic: { code: 'FILE_TOO_LARGE', reason: '单个文件超过限制。', resourcePath: 'assets/template.pptx', actual: 4576748, limit: 2097152, unit: 'bytes', guidance: '选择完整可导入包，不要删除必要资源。' } },
    { name: 'efund-ppt-maker', kind: 'bundled', status: 'compatibility', sourcePath: '/test/bundled/efund-ppt-maker', message: '仍由客户端内置管理，可继续使用，随客户端版本更新。' },
  ] }
  const view = new IntegrationView(document, { revealSource, request: async command => {
    calls.push(command)
    if (command.type === 'snapshot') return { type: 'snapshot', snapshot: { revision: 0, rows: [] } }
    if (command.type === 'legacy-preview') return reply
    if (command.type === 'preview-skill') return { type: 'preview', preview: null }
    throw Error('Unexpected command')
  } })
  cleanups.push(() => { view.dispose(); window.happyDOM.abort() })
  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
  const click = (selector: string) => { const button = document.querySelector<HTMLButtonElement>(selector); expect(button).not.toBeNull(); button!.click() }
  await view.open('integrations/skills'); click('[data-action=legacy-preview]'); await settle()
  return { view, document, calls, revealSource, reply, click, settle }
}

it('shows exact resource diagnostics, distinguishes bundled ownership and reveals the selected source', async () => {
  const f = await fixture(), dialog = f.document.querySelector('[role=dialog]')!
  expect(dialog.textContent).toContain('assets/template.pptx')
  expect(dialog.textContent).toContain('4.36 MiB')
  expect(dialog.textContent).toContain('2.00 MiB')
  expect(dialog.textContent).toContain('/test/personal/efund-ppt-maker')
  expect(dialog.textContent).toContain('内置管理')
  expect(dialog.textContent).toContain('不要删除')
  f.click('[data-legacy-reveal="0"]'); await f.settle()
  expect(f.revealSource).toHaveBeenCalledExactlyOnceWith('/test/personal/efund-ppt-maker')
  expect(f.calls.some(command => command.type === 'migrate-legacy-skills')).toBe(false)
})
it('rescans in place and reselects a complete package through the normal file chooser', async () => {
  const f = await fixture()
  f.click('[data-action=legacy-recheck]'); await f.settle()
  expect(f.calls.filter(command => command.type === 'legacy-preview')).toHaveLength(2)
  expect(f.document.querySelectorAll('[role=dialog]')).toHaveLength(1)
  f.click('[data-action=legacy-reselect]'); await f.settle()
  expect(f.calls.at(-1)).toEqual({ type: 'preview-skill' })
  expect(f.document.querySelector('[role=dialog]')).toBeNull()
  expect(f.document.querySelector('h1')?.textContent).toBe('导入技能')
})
it('does not publish a delayed source-open failure into a different account view', async () => {
  const f = await fixture(); let reject!: (reason: Error) => void
  f.revealSource.mockImplementation(() => new Promise<void>((_resolve, fail) => { reject = fail }))
  f.click('[data-legacy-reveal="0"]'); f.view.resetIdentity(); reject(new Error('previous-account-path')); await f.settle()
  expect(f.document.body.textContent).not.toContain('previous-account-path')
})
