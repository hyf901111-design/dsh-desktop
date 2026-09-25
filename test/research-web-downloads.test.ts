import { expect, it, vi } from 'vitest'
import { guardResearchWebDownloads, guardUnexpectedErrorDownloads } from '../src/main/search/research-web-downloads'

it('cancels unsolicited research-page downloads before Electron opens a save dialog', () => {
  let handler: ((event: { preventDefault(): void }) => void) | undefined
  const browserSession = {
    on: vi.fn((_event: string, callback: typeof handler) => { handler = callback })
  }

  guardResearchWebDownloads(browserSession)
  guardResearchWebDownloads(browserSession)

  expect(browserSession.on).toHaveBeenCalledTimes(1)
  expect(browserSession.on).toHaveBeenCalledWith('will-download', expect.any(Function))
  const preventDefault = vi.fn()
  handler?.({ preventDefault })
  expect(preventDefault).toHaveBeenCalledOnce()
})

it('suppresses repeated error.txt responses without blocking ordinary downloads', () => {
  let handler: ((event: { preventDefault(): void }, item: { getFilename(): string }) => void) | undefined
  const browserSession = {
    on: vi.fn((_event: string, callback: typeof handler) => { handler = callback })
  }
  guardUnexpectedErrorDownloads(browserSession)
  guardUnexpectedErrorDownloads(browserSession)
  expect(browserSession.on).toHaveBeenCalledTimes(1)
  const preventDefault = vi.fn()
  handler?.({ preventDefault }, { getFilename: () => 'error.txt' })
  expect(preventDefault).toHaveBeenCalledOnce()
  handler?.({ preventDefault }, { getFilename: () => 'report.pdf' })
  expect(preventDefault).toHaveBeenCalledOnce()
})
