import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UpdateStatus } from '../../shared/contracts'

const filename = 'update-restart-receipt.json'
const validVersion = (value: unknown): value is string => typeof value === 'string' && value.length <= 96 && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)

/** Only the main-process installation path writes this receipt, immediately before quit. */
export function writeUpdateRestartReceipt(directory: string, from: string, target: string): void {
  if (!validVersion(from) || !validVersion(target) || from === target) throw Error('无效的更新版本记录')
  mkdirSync(directory, { recursive: true })
  const path = join(directory, filename)
  writeFileSync(path + '.tmp', JSON.stringify({ schema: 1, from, target }), { mode: 0o600, flush: true })
  renameSync(path + '.tmp', path)
}

export function cancelUpdateRestartReceipt(directory: string): void {
  rmSync(join(directory, filename), { force: true })
}

export function consumeUpdateRestartReceipt(directory: string, currentVersion: string): UpdateStatus | undefined {
  const path = join(directory, filename)
  try {
    const raw = readFileSync(path, 'utf8')
    if (raw.length > 512) return
    const receipt = JSON.parse(raw)
    if (receipt.schema !== 1 || !validVersion(receipt.from) || !validVersion(receipt.target) || receipt.from === receipt.target || receipt.target !== currentVersion) return
    // Consume before broadcasting: a fresh launch cannot display this completion twice.
    rmSync(path)
    return { phase: 'updated', currentVersion, availableVersion: currentVersion, manual: false }
  } catch { return }
}
