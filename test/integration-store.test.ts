import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { IntegrationStore } from '../src/main/integrations/store'

const roots: string[] = []
async function directory() { const root = await mkdtemp(join(tmpdir(), 'ework-integrations-')); roots.push(root); return root }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, {recursive:true,force:true}))) })
describe('integration store', () => {
  it('serializes compare-and-swap commits and restores only the winning state', async () => {
    const root = await directory(), store = await IntegrationStore.open(root)
    const initial = store.snapshot()
    const results = await Promise.allSettled([store.commit(initial.revision, initial), store.commit(initial.revision, initial)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(r => r.status === 'rejected')).toMatchObject({reason:{code:'VERSION_CONFLICT'}})
    expect((await IntegrationStore.open(root)).snapshot().revision).toBe(1)
  })
  it('does not destroy corrupt or future-version metadata', async () => {
    const root = await directory(), file = join(root, 'state.json')
    for (const original of ['{"broken":', '{"schemaVersion":999}']) {
      await writeFile(file, original)
      await expect(IntegrationStore.open(root)).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE'})
      expect(await readFile(file,'utf8')).toBe(original)
    }
  })
  it('does not expose live mutable snapshots and rolls back failed mutations', async () => {
    const root = await directory(), store = await IntegrationStore.open(root)
    store.snapshot().revision = 99
    await expect(store.change(state => { state.revision = 88; throw Error('stop') })).rejects.toThrow('stop')
    expect(store.snapshot().revision).toBe(0)
    await store.change(() => undefined)
    expect((await IntegrationStore.open(root)).snapshot().revision).toBe(1)
  })
})
