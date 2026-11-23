import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { ResearchBoardsStore } from '../src/main/state/research-boards-store'
import { ResearchCanvasStorage } from '../src/main/state/research-canvas-storage'
import { ResearchBoardsService } from '../src/main/research-boards-service'
import { initializeFirstLaunchAppearance } from '../src/main/home-theme-preferences'
import { BoardDirectories } from '../packages/dsh-research-task-runtime/board-directories.js'
import { starterWatchlistDocument, starterWatchlistTitle } from '../packages/dsh-research-task-runtime/watchlist-board.js'
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
    expect(watchlist.containerSpec.symbols.map(s => s.market + ':' + s.code)).toEqual([
      'US:AAPL', 'SH:600900', 'SH:601138', 'SZ:000858', 'SZ:000425', 'SH:000300', 'SH:000001'
    ])
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

it('switches from a stock to both starter indices through the native watchlist rows', async () => {
  const prices = {'600900':25,'000300':4500,'000001':3500}
  const symbolData = s => ({...s, price: prices[s.code], source:'行情测试', asOf:'2026-11-20'})
  const bar = price => ({date:'2026-11-20', open:price, high:price, low:price, close:price, volume:100})
  const request = vi.fn(async q => {
    const s = q.symbols?.[0]
    if (q.action === 'history') return {bars:[bar(prices[s.code])], source:'行情测试'}
    if (q.action === 'news') return {news:[{id:q.query, title:q.query+'新闻', url:'https://example.org/news'}]}
    if (q.action === 'announcements') return {announcements:s.code === '600900' ? [
      {id:'long-power', title:'长江电力公司公告', date:'2026-11-20', url:'https://example.org/filing'}
    ] : []}
    return {quotes:q.symbols.map(symbolData)}
  })
  const ui = await financialClientFixture({financialWidget:{request}})
  try {
    // Keep the entire desktop board in the visible region of this DOM fixture.
    Object.defineProperty(ui.canvas, 'clientHeight', {configurable:true,value:2200})
    ui.canvas.getBoundingClientRect = () => ({left:0,top:0,right:1000,bottom:2200,width:1000,height:2200})
    await ui.act(async () => {
      ui.workspace.setCanvasSize({width:1000,height:2200,availableWidth:1000})
      ui.workspace.setArtifacts(starterWatchlistDocument('financial-test').artifacts)
    })
    const panel = widget => ui.host.querySelector('[data-financial-widget="'+widget+'"]')
    await vi.waitFor(() => expect(panel('announcements').textContent).toContain('长江电力公司公告'))
    for (const [code,name] of [['000300','沪深300'],['000001','上证指数']]) {
      await ui.event('click',ui.host.querySelector('[data-stock-code="'+code+'"]'))
      await vi.waitFor(() => {
        expect(panel('quote').querySelector('.ew-quote-price-line strong').textContent).toBe(prices[code].toLocaleString('en-US',{minimumFractionDigits:2}))
        expect(request).toHaveBeenCalledWith(expect.objectContaining({action:'history',symbols:[{market:'SH',code,name}]}))
        expect(panel('quote').querySelector('[data-financial-chart] svg').textContent).toContain(prices[code].toFixed(2))
        expect(panel('news').querySelector('a').textContent).toBe(name+'新闻')
        expect(panel('announcements').querySelector('a')).toBeNull()
        expect(panel('announcements').textContent).toContain('暂无相关公告')
      })
    }
    await ui.event('click',ui.host.querySelector('[data-stock-code="600900"]'))
    await vi.waitFor(() => expect(panel('announcements').textContent).toContain('长江电力公司公告'))
  } finally { await ui.dispose() }
})
