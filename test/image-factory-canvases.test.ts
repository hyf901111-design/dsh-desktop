import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ImageFactoryCanvases } from '../src/main/state/image-factory-canvases'
import { galleryTemplateLayers } from '../src/preload/image-factory/gallery-layout'
import { marketingExamples } from '../src/preload/image-factory/marketing-templates'
import type { StoredCanvas, TextLayer } from '../src/shared/image-factory-canvas'

const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=', 'base64'))
const canvas = (): StoredCanvas => {
  const id = randomUUID()
  return { id, version: 1, title: '工作坊验收', width: 1, height: 1, layers: [
    { kind: 'image', id: randomUUID(), assetId: id, mediaType: 'image/png' },
    { kind: 'text', id: randomUUID(), text: '独立图层', x: .1, y: .2, width: .6,
      fontSize: 42, family: 'Songti SC', weight: 700, align: 'right', color: '#FF6600' },
  ] }
}

it('restores original pixels and editable layers after restart and stores independent sessions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'odyssey-canvases-'))
  try {
    const identity = () => ({ owner: 'account-a', generation: 5 })
    const original = canvas()
    const persistence = new ImageFactoryCanvases(root, identity)
    const first = persistence.write({ scope: 'studio-a', epoch: 5, canvas: original, image: png })
    const moved = { ...original.layers[1] as TextLayer, text: '移出画框的标题', x: -.8, y: 1.25 }
    const revised: StoredCanvas = { ...original, layers: [moved, original.layers[0]!], aiWatermark: true }
    const second = persistence.write({ scope: 'studio-a', epoch: 5, canvas: revised })
    const other = canvas()
    const third = persistence.write({ scope: 'studio-b', epoch: 5, canvas: other, image: png })
    await persistence.drain()
    await Promise.all([first, second, third])
    const reopened = new ImageFactoryCanvases(root, identity)
    expect(await reopened.read('studio-a')).toEqual({ epoch: 5, canvas: revised, image: { data: png, mediaType: 'image/png' } })
    expect((await reopened.read('studio-b')).canvas).toEqual(other)
    expect((await reopened.read(null)).canvas).toBeUndefined()
    const [userDirectory] = await readdir(root)
    const subdirectories = await readdir(join(root, userDirectory!))
    expect(subdirectories).toHaveLength(2)
    for (const entry of subdirectories)
      expect(await readdir(join(root, userDirectory!, entry))).toHaveLength(2)
  } finally { await rm(root, { force: true, recursive: true }) }
})

it('moves a standalone canvas on first send without replacing a conversation canvas', async () => {
  const root = await mkdtemp(join(tmpdir(), 'odyssey-canvas-adopt-'))
  try {
    const persistence = new ImageFactoryCanvases(root, () => ({ owner: 'account-a', generation: 1 }))
    const draft = canvas(), occupied = canvas()
    await Promise.all([
      persistence.write({ scope: null, epoch: 1, canvas: draft, image: png }),
      persistence.write({ scope: 'existing', epoch: 1, canvas: occupied, image: png }),
    ])
    expect(await persistence.adopt('existing', 1)).toBe(false)
    expect((await persistence.read(null)).canvas).toEqual(draft)
    expect(await persistence.adopt('new-conversation', 1)).toBe(true)
    expect((await persistence.read(null)).canvas).toBeUndefined()
    expect((await persistence.read('existing')).canvas).toEqual(occupied)
    expect(await persistence.read('new-conversation')).toMatchObject({ canvas: draft, image: { data: png } })
  } finally { await rm(root, { force: true, recursive: true }) }
})

it('rejects an old account epoch and retains the original canvas if a new raster is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'odyssey-canvas-owner-'))
  try {
    let identity = { owner: 'account-a', generation: 1 }
    const persistence = new ImageFactoryCanvases(root, () => identity)
    const original = canvas()
    await persistence.write({ scope: 'studio', epoch: 1, canvas: original, image: png })
    await expect(persistence.write({ scope: 'studio', epoch: 1, canvas: canvas() })).rejects.toThrow('原图')
    expect((await persistence.read('studio')).canvas).toEqual(original)
    identity = { owner: 'account-b', generation: 2 }
    expect((await persistence.read('studio')).canvas).toBeUndefined()
    await expect(persistence.write({ scope: 'studio', epoch: 1, canvas: original, image: png })).rejects.toThrow('账号已切换')
    identity = { owner: 'account-a', generation: 3 }
    expect((await persistence.read('studio')).canvas).toEqual(original)
    await expect(persistence.read('../studio')).rejects.toThrow('会话无效')
  } finally { await rm(root, { force: true, recursive: true }) }
})

it('restores the same open task tabs for the account without sharing them across identities', async () => {
  const root = await mkdtemp(join(tmpdir(), 'odyssey-factory-tabs-'))
  try {
    let owner = { owner: 'account-a', generation: 1 }
    const studio = new ImageFactoryCanvases(root, () => owner)
    const tabs = [{ scope: 'image-task-first', title: '海报' }, { scope: 'image-task-next' }]
    await studio.writeTabs({ epoch: 1, tabs })
    const reopened = new ImageFactoryCanvases(root, () => owner)
    expect(await reopened.readTabs()).toEqual({ epoch: 1, tabs })
    await studio.write({ scope: tabs[1]!.scope, epoch: 1, canvas: canvas(), image: png })
    expect(await reopened.readTabs()).toEqual({ epoch: 1, tabs, canvasScopes: [tabs[1]!.scope] })
    const pinned = [{ ...tabs[0], pinned: true }]
    const closed = tabs.slice(1)
    await reopened.writeTabs({ epoch: 1, tabs: pinned, closed })
    expect(await studio.readTabs()).toEqual({ epoch: 1, tabs: pinned, closed })
    owner = { owner: 'account-b', generation: 2 }
    expect(await reopened.readTabs()).toEqual({ epoch: 2, tabs: [] })
    await expect(reopened.writeTabs({ epoch: 1, tabs })).rejects.toThrow('账号已切换')
    owner = { owner: 'account-a', generation: 3 }
    await reopened.writeTabs({ epoch: 3, tabs: tabs.slice(1) })
    expect(await reopened.readTabs()).toEqual({ epoch: 3, tabs: tabs.slice(1), canvasScopes: [tabs[1]!.scope] })
  } finally { await rm(root, { force: true, recursive: true }) }
})

it('recovers an untracked legacy draft only from closed history and preserves its data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'odyssey-factory-draft-tab-'))
  try {
    const identity = () => ({ owner: 'account-a', generation: 1 })
    const studio = new ImageFactoryCanvases(root, identity)
    const saved = canvas()
    const legacy = { scope: null, title: saved.title }
    const native = { scope: 'old-image-task', title: saved.title }
    await studio.write({ scope: null, epoch: 1, canvas: saved, image: png })
    await studio.writeTabs({ epoch: 1, tabs: [], closed: [native] })
    expect(await studio.readTabs()).toEqual({ epoch: 1, tabs: [], closed: [legacy, native] })
    await studio.writeTabs({ epoch: 1, tabs: [legacy], closed: [native] })
    expect(await studio.readTabs()).toEqual({ epoch: 1, tabs: [legacy], closed: [native] })
    await studio.writeTabs({ epoch: 1, tabs: [], closed: [legacy, native] })
    const reopened = new ImageFactoryCanvases(root, identity)
    expect(await reopened.readTabs()).toEqual({ epoch: 1, tabs: [], closed: [legacy, native] })
    expect((await reopened.read(null)).canvas).toEqual(saved)
  } finally { await rm(root, { force: true, recursive: true }) }
})

it('round-trips editable brand overlays alongside the original raster and rejects unknown artwork', async () => {
  const root = await mkdtemp(join(tmpdir(), 'odyssey-brand-assets-'))
  try {
    const storage = new ImageFactoryCanvases(root, () => ({ owner: 'brand-test', generation: 3 }))
    const original = canvas()
    const shape = { id: randomUUID(), kind: 'shape' as const, x: -.12, y: .78, width: 1.16, height: .42, color: '#005096' }
    const brand = { id: randomUUID(), kind: 'brand' as const, x: .73, y: .04, width: .2, height: .12, asset: 'graphic-top' as const }
    const revised: StoredCanvas = { ...original, layers: [original.layers[0]!, shape, brand, original.layers[1]!] }
    await storage.write({ scope: 'poster', epoch: 3, canvas: revised, image: png })
    expect((await storage.read('poster')).canvas).toEqual(revised)

    const invalid = { ...brand, asset: 'https://example.org/art.svg' } as unknown as typeof brand
    await expect(storage.write({ scope: 'poster', epoch: 3, canvas: { ...revised, layers: [invalid] } })).rejects.toThrow('画布图层无效')
    expect((await storage.read('poster')).canvas).toEqual(revised)
  } finally { await rm(root, { force: true, recursive: true }) }
})

it('persists and reopens every campaign with all editable layers and the original image', async () => {
  const root = await mkdtemp(join(tmpdir(), 'odyssey-marketing-canvases-'))
  try {
    const identity = () => ({ owner: 'account-a', generation: 1 })
    const store = new ImageFactoryCanvases(root, identity)
    for (const example of marketingExamples) {
      const [width, height] = example.format.split(':').map(part => Number(part) * 100) as [number, number]
      const base = { ...canvas(), width, height, title: example.title[0] }
      const project = { ...base, layers: [base.layers[0]!, ...galleryTemplateLayers(example, base, zh => zh, randomUUID)] }
      await store.write({ scope: example.id, epoch: 1, canvas: project, image: png })
      expect((await new ImageFactoryCanvases(root, identity).read(example.id)).canvas).toEqual(project)
    }
  } finally { await rm(root, { force: true, recursive: true }) }
})
