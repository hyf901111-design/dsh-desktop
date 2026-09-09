import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('slash menu localized presentation', () => {
  it('translates built-in command labels and details without changing dispatch identities', async () => {
    const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js', 'utf8')
    const helper = source.slice(source.indexOf('function commandMenuText('), source.indexOf('function MenuView('))
    const dictionaries = source.slice(source.indexOf('const zh = {'), source.indexOf('//#endregion', source.indexOf('const zh = {')))
    const { commandMenuText, zh, en } = runInNewContext(`${helper}\n${dictionaries}\n({commandMenuText, zh, en})`)
    for (const name of ['compact', 'export', 'feedback', 'goal', 'permission', 'plan', 'model']) {
      const item = { name, description: 'original description' }
      const t = (key: string) => zh[key] ?? key
      expect(commandMenuText('command', item, 'name', t)).toMatch(/[\u4e00-\u9fff]/)
      expect(commandMenuText('command', item, 'description', t)).toMatch(/[\u4e00-\u9fff]/)
      expect(commandMenuText('command', item, 'name', (key: string) => en[key] ?? key)).toBe(name)
      expect(commandMenuText('skill', item, 'name', t)).toBe(name)
      expect(item).toEqual({ name, description: 'original description' })
    }
    const custom = { name: 'custom', description: 'Custom command' }
    expect(commandMenuText('command', custom, 'description', (key: string) => zh[key] ?? key)).toBe('Custom command')
    expect(source).toContain('onPick(group.source, index)')
  })
})
