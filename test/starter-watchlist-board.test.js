import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { ResearchBoardsStore } from '../src/main/state/research-boards-store'
import { ResearchCanvasStorage } from '../src/main/state/research-canvas-storage'
import { ResearchBoardsService } from '../src/main/research-boards-service'
import { initializeFirstLaunchAppearance } from '../src/main/home-theme-preferences'
import { BoardDirectories } from '../packages/dsh-research-task-runtime/board-directories.js'
import { starterWatchlistTitle } from '../packages/dsh-research-task-runtime/watchlist-board.js'
import { presentationHostFixture } from './fixtures/home-presentation-host.js'
import { financialClientFixture } from './helpers/financial-widget-client-fixture.js'

it('creates one editable native watchlist in a fresh profile and retains deletion after restart', async () => {
  const host = await presentationHostFixture({bindWorkspace: false})
  const profile = join(host.root, 'desktop')
  const entries = new BoardDirectories(host.ctx, host.home)
  const directory = vi.fn(async input => {
    const identity = await entries.run(input)
    if (directory.mock.calls.length === 1) throw Error('simulated lost host acknowledgement')
    return identity
  })
  const services = []
  const reopen = () => {
    ResearchBoardsStore.prepareFreshInstallation(profile)
    initializeFirstLaunchAppearance(profile)
    const store = new ResearchBoardsStore(profile), storage = new ResearchCanvasStorage(profile)
    const service = new ResearchBoardsService({store, storage, client: {stop() {}}, hooks: {directory},
      account: {authenticated: false, generation: 0, subscribeSessionChanged: () => () => {}}})
    services.push(service)
    return {service, store, storage}
  }
  let ui
  try {
    host.ctx.provide('apiProxy', host.api)
    const first = reopen()
    const id = first.store.pendingStarterBoard
    const retryLog = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await Promise.all([first.service.installStarterBoard(host.root), first.service.installStarterBoard(host.root)])
      expect(retryLog).toHaveBeenCalledTimes(1)
    } finally { retryLog.mockRestore() }
    expect(directory).toHaveBeenCalledTimes(1)
    expect(first.store.pendingStarterBoard).toBe(id)
    expect(first.service.getSnapshot().favorites).toEqual([])
    expect((await host.ctx.sessionPersistence.inspect(id)).events.some(e => e.type === 'session/title')).toBe(true)
    first.service.stop()

    const resumed = reopen()
    await resumed.service.installStarterBoard(host.root)
    const state = resumed.service.getSnapshot()
    expect(state.favorites).toHaveLength(1)
    expect(state.current).toBe(null)
    expect(state.favorites[0]).toMatchObject({sessionId: id, title: starterWatchlistTitle, dedicated: true, pinned: true})
    expect(resumed.store.pendingStarterBoard).toBeUndefined()
    const sessions = (await host.request(host.api.sessions.list, {})).items
    expect(sessions.filter(s => s.cwd === state.favorites[0].cwd).map(s => s.sessionId)).toEqual([id])
    expect((await host.ctx.sessionPersistence.inspect(id)).events.filter(e => e.type === 'session/title').map(e => e.data.title)).toEqual([starterWatchlistTitle])
    expect((await entries.run({mode: 'ensure', sessionId: id})).path).toBe(state.favorites[0].cwd)

    ui = await financialClientFixture()
    const client = new ui.bundle.ResearchWorkspaceRegistry(resumed.storage).for(id)
    client.setWorkbenchWidth(1000)
    const nodes = client.getSnapshot().artifacts
    expect(nodes.map(n => n.containerSpec.widget)).toEqual(['indices','watchlist','quote','news','announcements'])
    const [indices, watchlist, quote, news, announcements] = nodes
    expect(indices.containerSpec.symbols).toHaveLength(10)
    expect(watchlist.containerSpec.symbols).toHaveLength(5)
    expect(quote.containerSpec.linkedWatchlistId).toBe(watchlist.id)
    expect(news.containerSpec.linkedSourceId).toBe(quote.id)
    expect(announcements.containerSpec.linkedSourceId).toBe(quote.id)
    expect([quote, news, announcements].map(n => n.containerSpec.symbols[0].code)).toEqual(['600900','600900','600900'])
    const [top, left, right, lowerLeft, lowerRight] = client.getWorkbenchCells()
    expect(top.w).toBe(40)
    expect([left.y, lowerLeft.y]).toEqual([right.y, lowerRight.y])
    expect(left.w).toBeLessThan(right.w)
    client.setArtifacts(nodes.map(n => n.id === watchlist.id ? {...n, containerSpec: {...n.containerSpec, selectedSymbol: 'US:AAPL'}} : n))
    expect(client.persist()).toBe(true)
    const changed = reopen()
    await changed.service.installStarterBoard(host.root)
    const reopened = new ui.bundle.ResearchWorkspaceRegistry(changed.storage).for(id)
    expect(reopened.getSnapshot().artifacts.slice(2).map(n => n.containerSpec.symbols[0].code)).toEqual(['AAPL','AAPL','AAPL'])
    expect(changed.service.getSnapshot().favorites[0].favoriteId).toBe(state.favorites[0].favoriteId)
    expect(changed.service.getSnapshot().current).toBe(null)
    expect(await changed.service.invoke('favorite.remove', {favoriteId: state.favorites[0].favoriteId})).toMatchObject({ok: true})
    const afterDeletion = reopen()
    await afterDeletion.service.installStarterBoard(host.root)
    expect(afterDeletion.service.getSnapshot().favorites).toEqual([])
    expect(directory).toHaveBeenCalledTimes(2)
    expect(host.outside).toEqual([])
  } finally {
    await ui?.dispose()
    services.forEach(s => s.stop())
    entries.dispose()
    await host.dispose()
  }
}, 20000)

it('keeps an existing profile or previously saved board store intact', async () => {
  const root = await mkdtemp(join(tmpdir(),'starter-existing-'))
  try {
    for (const marker of ['launch-root','harness','state']) {
      const profile = join(root,marker)
      if (marker === 'state') {
        new ResearchBoardsStore(profile).addFavorite({sessionId: 'mine',title: starterWatchlistTitle})
      } else await mkdir(join(profile,marker), {recursive: true})
      ResearchBoardsStore.prepareFreshInstallation(profile)
      const store = new ResearchBoardsStore(profile)
      expect(store.pendingStarterBoard).toBeUndefined()
      expect(store.snapshot().favorites.map(f => f.sessionId)).toEqual(marker === 'state' ? ['mine'] : [])
    }
  } finally { await rm(root,{recursive:true,force:true}) }
})
