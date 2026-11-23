import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {cpSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

export function verifyBundledTaskTools(resources) {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'ework-clean-install-'))
  try {
    const home = path.join(scratch, 'home')
    const workspace = path.join(scratch, '工作区 with spaces')
    mkdirSync(home)
    cpSync(fileURLToPath(new URL('../../test/fixtures/bundled-task-tools/', import.meta.url)), workspace, {recursive: true})
    const node = path.join(resources, 'app/node_modules/node/bin/node')
    const output = execFileSync(node, [
      path.join(resources, 'harness-node-entry.mjs'), path.join(workspace, 'task.mjs'), resources
    ], {
      cwd: workspace, encoding: 'utf8', timeout: 120_000,
      env: {
        HOME: home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: scratch, LANG: 'en_US.UTF-8',
        PYTHONHOME: path.join(scratch, 'stale-python'), PYTHONPATH: path.join(scratch, 'stale-modules')
      }
    })
    assert.ok(output.includes('BUNDLED_TASK_TOOLS_OK'), output)
    console.log('Task tools passed in a clean home and workspace with only macOS system paths.')
  } finally {
    rmSync(scratch, {recursive: true, force: true})
  }
}
