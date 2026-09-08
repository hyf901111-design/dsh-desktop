import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { app } from 'electron'

const execute = promisify(execFile)
const BUNDLE_ID = 'com.evanarts.sherlock'
const helperPath = () => join(process.resourcesPath, 'update-recovery.cjs')
const nodePath = () => join(process.resourcesPath, 'app', 'node_modules', 'node', 'bin', 'node')
const currentBundle = () => dirname(dirname(dirname(app.getPath('exe'))))

export async function armMacRenameRecovery(version: string): Promise<(() => void) | undefined> {
  if (process.platform !== 'darwin' || !app.isPackaged) return
  const statePath = join(app.getPath('home'), 'Library', 'Caches', `${BUNDLE_ID}.ShipIt`, 'ShipItState.plist')
  const { stdout } = await execute('/usr/bin/plutil', ['-convert', 'json', '-o', '-', statePath])
  const state = JSON.parse(stdout)
  const helper = createRequire(import.meta.url)(helperPath()) as {
    resolveRenamePlan: (state: unknown, app: string, version: string) => { oldApp: string; targetApp: string; version: string } | null
    signatureHash: (app: string) => string
  }
  const plan = helper.resolveRenamePlan(state, currentBundle(), version)
  if (!plan) return
  const hash = helper.signatureHash(fileURLToPath(state.updateBundleURL))
  const logs = join(app.getPath('userData'), 'logs')
  mkdirSync(logs, { recursive: true })
  // Copy the entire helper outside the replaceable bundle; all its dependencies
  // are Node built-ins loaded before the ready handshake.
  const directory = mkdtempSync(join(app.getPath('temp'), 'odyssey-update-recovery-'))
  const script = join(directory, 'guard.cjs')
  copyFileSync(helperPath(), script)
  const child = spawn(nodePath(), [script, JSON.stringify({ ...plan, hash, parentPid: process.pid, logFile: join(logs, 'update-recovery.log') })], {
    detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], cwd: directory
  })
  const cancel = () => { child.kill(); rmSync(directory, { recursive: true, force: true }) }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('更新重启保护未能就绪，应用尚未退出。')), 10000)
      child.once('message', message => {
        if ((message as { ready?: unknown })?.ready === true) { clearTimeout(timer); resolve() }
      })
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`更新重启保护提前退出 (${code})`)) })
    })
    child.unref()
    return cancel
  } catch (error) { cancel(); throw error }
}

export async function repairRenamedMacDock(): Promise<void> {
  if (process.platform !== 'darwin' || !app.isPackaged) return
  const targetApp = currentBundle()
  // Do not take over another installed copy or rename a user's custom bundle.
  if (basename(targetApp) !== 'EWork Odyssey.app') return
  const oldApp = join(dirname(targetApp), 'Sherlock.app')
  if (existsSync(oldApp)) return
  await execute(nodePath(), [helperPath(), JSON.stringify({ action: 'repair-dock', oldApp, targetApp })])
}
