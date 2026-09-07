import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

export function deployFundDataService({ env = process.env, run = execFileSync } = {}) {
  // Never infer Sherlock production ownership from whichever account is logged in locally.
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim()
  if (!accountId || !/^[a-f0-9]{32}$/u.test(accountId)) {
    throw new Error('请先确认 Sherlock 正式发布账号，并设置其 CLOUDFLARE_ACCOUNT_ID；不会使用本机默认账号部署。')
  }
  const cli = path.join(root, 'node_modules/wrangler/bin/wrangler.js')
  const config = path.join(root, 'services/fund-data/wrangler.jsonc')
  const options = { cwd: root, env: { ...env, CLOUDFLARE_ACCOUNT_ID: accountId }, stdio: 'inherit' }
  // The target must be able to read the existing Sherlock release bucket before any mutation.
  run(process.execPath, [cli, 'r2', 'bucket', 'info', 'sherlock-releases', '--config', config], options)
  run(process.execPath, [cli, 'deploy', '--config', config], options)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { deployFundDataService() } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
