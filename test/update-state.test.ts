import { describe, expect, it } from 'vitest'
import {
  initialUpdateStatus,
  reduceUpdateStatus
} from '../src/main/update/update-state'

describe('desktop update state', () => {
  it('keeps observable installation stages and the failed target without inventing progress', () => {
    let status = reduceUpdateStatus(initialUpdateStatus('1.0.0'), { type: 'downloaded', version: '1.1.0' })
    for (const stage of ['preparing', 'saving', 'restarting'] as const) {
      status = reduceUpdateStatus(status, { type: 'install', stage })
      expect(status).toMatchObject({ phase: 'installing', installStage: stage, availableVersion: '1.1.0' })
      expect(status.percent).toBeUndefined()
    }
    expect(reduceUpdateStatus(status, { type: 'error', message: '保存失败' })).toMatchObject({ phase: 'error', availableVersion: '1.1.0', message: '保存失败' })
  })
  it('tracks an automatic download from discovery through completion', () => {
    let status = initialUpdateStatus('1.0.0')
    status = reduceUpdateStatus(status, { type: 'check', manual: false })
    status = reduceUpdateStatus(status, { type: 'available', version: '1.1.0' })
    status = reduceUpdateStatus(status, { type: 'progress', percent: 52.37 })

    expect(status).toEqual({
      phase: 'downloading',
      currentVersion: '1.0.0',
      availableVersion: '1.1.0',
      percent: 52.4,
      manual: false
    })

    status = reduceUpdateStatus(status, { type: 'downloaded', version: '1.1.0' })
    expect(status).toEqual({
      phase: 'downloaded',
      currentVersion: '1.0.0',
      availableVersion: '1.1.0',
      manual: false
    })
  })

  it('preserves whether a check was initiated from the application menu', () => {
    let status = initialUpdateStatus('1.0.0')
    status = reduceUpdateStatus(status, { type: 'check', manual: true })
    status = reduceUpdateStatus(status, { type: 'not-available' })

    expect(status.phase).toBe('up-to-date')
    expect(status.manual).toBe(true)
  })

  it('clamps invalid download percentages', () => {
    const status = {
      ...initialUpdateStatus('1.0.0'),
      availableVersion: '1.1.0'
    }

    expect(reduceUpdateStatus(status, { type: 'progress', percent: -5 }).percent).toBe(0)
    expect(reduceUpdateStatus(status, { type: 'progress', percent: 140 }).percent).toBe(100)
    expect(
      reduceUpdateStatus(status, { type: 'progress', percent: Number.NaN }).percent
    ).toBe(0)
  })
})

 it('carries actual transfer bytes and clears stale sizes on reset or missing counters', () => {
  const initial = initialUpdateStatus('1.0.0')
  const progress = reduceUpdateStatus(initial, { type: 'progress', percent: 42, transferredBytes: 42000000, totalBytes: 100000000, bytesPerSecond: 3600000 })
  expect(progress.transferredBytes).toBe(42000000)
  expect(progress.totalBytes).toBe(100000000)
  expect(progress.bytesPerSecond).toBe(3600000)
  expect(reduceUpdateStatus(progress, {type:'reset'}).totalBytes).toBeUndefined()
  const unknown = reduceUpdateStatus(progress, {type:'progress',percent:0, transferredBytes:NaN,totalBytes:-1,bytesPerSecond:NaN})
  expect(unknown.totalBytes).toBeUndefined()
  expect(unknown.transferredBytes).toBeUndefined()
  expect(unknown.bytesPerSecond).toBeUndefined()
 })

it('keeps the release notes with their target throughout download and preparation', () => {
  let status = reduceUpdateStatus(initialUpdateStatus('1.0.0'), {
    type: 'available', version: '1.1.0', releaseNotes: '- 新功能'
  })
  status = reduceUpdateStatus(status, { type: 'progress', percent: 50 })
  expect(status.releaseNotes).toBe('- 新功能')
  status = reduceUpdateStatus(status, { type: 'prepare', version: '1.1.0' })
  expect(status.releaseNotes).toBe('- 新功能')
  status = reduceUpdateStatus(status, { type: 'downloaded', version: '1.1.0' })
  expect(status.releaseNotes).toBe('- 新功能')
  expect(reduceUpdateStatus(status, { type: 'available', version: '1.2.0' }).releaseNotes).toBeUndefined()
})
