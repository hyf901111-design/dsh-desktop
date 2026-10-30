import {afterEach, expect, it, vi} from 'vitest'
import {Window} from 'happy-dom'
import {installExploreSearch, type ExploreResult} from '../src/preload/explore-search'

const windows: Window[] = []
afterEach(() => windows.splice(0).forEach(window => window.happyDOM.abort()))

function fixture() {
  const window = new Window({url: 'https://explore.test/'})
  windows.push(window)
  const document = window.document as unknown as Document
  let owner = 1, changed = () => {}, active = true
  const rows: ExploreResult[] = [{key:'session:one',sessionId:'one',title:'真实笔记',area:'workspaces',time:1,kind:'note',location:'工作区'}]
  const replies: any[] = []
  document.addEventListener('sherlock:explore-search-reply', event => replies.push((event as CustomEvent).detail))
  const open = vi.fn(async (_row: ExploreResult) => {}), cancelOpen = vi.fn()
  const dispose = installExploreSearch(document, {
    results: query => rows.filter(row => row.title.includes(query)),
    generation: () => owner,
    subscribe: callback => {changed = callback; return () => {active = false}},
    open, cancelOpen
  })
  const request = (detail: Record<string,unknown>) => document.dispatchEvent(new window.CustomEvent('sherlock:explore-search-request', {detail}) as unknown as Event)
  return {request, rows, replies, open, cancelOpen, dispose, ownerChanged() {owner++; changed()}, active:()=>active}
}

it('queries current native rows and refuses stale or invented opening keys', async () => {
  const f = fixture()
  f.request({requestId:'find',action:'search',query:'笔记'})
  expect(f.replies[0].results).toEqual(f.rows)
  f.rows.length = 0
  f.request({requestId:'removed',action:'open',key:'session:one'})
  f.request({requestId:'invented',action:'open',key:'session:arbitrary'})
  expect(f.open).not.toHaveBeenCalled()
  expect(f.replies.slice(1).map(row => row.ok)).toEqual([false,false])
  f.dispose()
})

it('opens each request once, including replay after completion', async () => {
  const f = fixture(), request = {requestId:'once',action:'open',key:'session:one'}
  f.request(request); f.request(request)
  await vi.waitFor(() => expect(f.replies).toHaveLength(1))
  f.request(request)
  await Promise.resolve()
  expect(f.open).toHaveBeenCalledTimes(1)
  expect(f.replies[0].ok).toBe(true)
  f.dispose()
})

it('does not begin opening when cancelled in the same task and does not reply after cancellation', async () => {
  const f = fixture()
  f.request({requestId:'cancel',action:'open',key:'session:one'})
  f.request({requestId:'cancel',action:'cancel'})
  await Promise.resolve(); await Promise.resolve()
  expect(f.open).not.toHaveBeenCalled()
  expect(f.cancelOpen).toHaveBeenCalledTimes(1)
  expect(f.replies).toEqual([])
  f.dispose()
})

it('cancels native pending navigation when its data owner changes and ignores its late reply', async () => {
  const f = fixture()
  let finish!:()=>void
  f.open.mockImplementation(() => new Promise<void>(resolve => {finish = resolve}))
  f.request({requestId:'owner',action:'open',key:'session:one'})
  await Promise.resolve()
  expect(f.open).toHaveBeenCalledTimes(1)
  f.ownerChanged(); finish()
  await Promise.resolve(); await Promise.resolve()
  expect(f.cancelOpen).toHaveBeenCalledTimes(1)
  expect(f.replies).toEqual([])
  f.dispose()
  expect(f.active()).toBe(false)
})

it('returns an actionable failure and retires outstanding work on disposal', async () => {
  const f = fixture()
  f.open.mockRejectedValueOnce(Error('会话权限已变化'))
  f.request({requestId:'failure',action:'open',key:'session:one'})
  await vi.waitFor(() => expect(f.replies).toHaveLength(1))
  expect(f.replies[0]).toMatchObject({ok:false,error:'会话权限已变化'})
  f.request({requestId:'late',action:'open',key:'session:one'})
  f.dispose(); await Promise.resolve(); await Promise.resolve()
  expect(f.cancelOpen).toHaveBeenCalledTimes(1)
  expect(f.open).toHaveBeenCalledTimes(1)
  expect(f.replies).toHaveLength(1)
})
