import { expect, it, vi } from 'vitest'
import { deployFundDataService } from '../scripts/deploy-fund-data-service.mjs'

it('refuses to deploy using only the currently logged-in default account', () => {
  const run = vi.fn()
  expect(() => deployFundDataService({ env: {}, run })).toThrow('正式发布账号')
  expect(() => deployFundDataService({ env: { CLOUDFLARE_ACCOUNT_ID: 'unknown' }, run })).toThrow('正式发布账号')
  expect(run).not.toHaveBeenCalled()
})

it('stops before deployment if the explicitly selected account cannot read the existing release bucket', () => {
  const run = vi.fn(() => { throw new Error('release bucket is inaccessible') })
  expect(() => deployFundDataService({ env: { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) }, run })).toThrow('inaccessible')
  expect(run).toHaveBeenCalledTimes(1)
  expect(run.mock.calls[0][1]).toContain('sherlock-releases')
  expect(run.mock.calls[0][1]).not.toContain('deploy')
})

it('checks the existing release bucket before deploying to the same explicit account', () => {
  const run = vi.fn()
  const accountId = 'b'.repeat(32)
  deployFundDataService({ env: { CLOUDFLARE_ACCOUNT_ID: accountId }, run })
  expect(run).toHaveBeenCalledTimes(2)
  expect(run.mock.calls[0][1]).toContain('info')
  expect(run.mock.calls[1][1]).toContain('deploy')
  expect(run.mock.calls.every(call => call[2].env.CLOUDFLARE_ACCOUNT_ID === accountId)).toBe(true)
})
