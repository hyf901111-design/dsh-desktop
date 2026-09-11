import { readFile } from 'node:fs/promises'
import { Script } from 'node:vm'
import { expect, it } from 'vitest'
import { patchFigmaAboutUpdates, patchFigmaUpdateWorkspace } from '../scripts/lib/figma-updates-client.mjs'
it('adds a durable workspace flush hook and adapts the actual About bundle idempotently', async () => {
  for (const [packageName, patch] of [['conversation', patchFigmaUpdateWorkspace], ['settings-general', patchFigmaAboutUpdates]] as const) {
    const input = await readFile(`node_modules/@deepseek-ai/dsh-client-ui-${packageName}/lib/client.js`, 'utf8')
    const output = patch(input)
    expect(patch(output)).toBe(output)
    if (packageName === 'settings-general') expect(patch(output.replace('.replace(/^EWork Odyssey\\s*/, "")', ''))).toBe(output)
    expect(() => new Script(output)).not.toThrow()
    expect(() => patch('unexpected bundle')).toThrow('anchor')
  }
})
it('waits for imports and rejects either failed local canvas write', async () => {
  const input = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  const output = patchFigmaUpdateWorkspace(input)
  const method = output.match(/async prepareForUpdate\(\) \{([\s\S]*?)\n                \},/)![1]
  let release!: () => void, persisted = 0
  const queue = new Promise<void>(resolve => { release = resolve })
  const make = (durable: boolean, gesture = false) => new Function('clipboardQueue', 'collaborationGesture', 'finalizeHistoryTransaction', 'persistSnapshot', `return async function(){${method}}`)(queue, gesture, () => {}, () => { persisted++; return durable })
  const done = make(true)()
  expect(persisted).toBe(0); release(); await done
  expect(persisted).toBe(1)
  await expect(make(false)()).rejects.toThrow('保存')
  await expect(make(true, true)()).rejects.toThrow('拖动')
})
