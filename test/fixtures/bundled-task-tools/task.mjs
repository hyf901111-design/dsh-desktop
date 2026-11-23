import assert from 'node:assert/strict'
import {realpathSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

const resources = process.argv[2]
const runtime = createRequire(path.join(resources, 'app/package.json'))
const load = (name) => import(pathToFileURL(runtime.resolve('@deepseek-ai/' + name)).href)
const {Context} = await load('cordis')
const {default: LocalSubprocess} = await load('dsh-subprocess-local')
const {default: LocalBash} = await load('dsh-bash-local')
const ctx = new Context()
try {
  new LocalSubprocess(ctx)
  const bash = new LocalBash(ctx, LocalBash.Config({cwd: process.cwd()}))
  writeFileSync('modules.cjs', `
    const assert = require('node:assert/strict')
    const {realpathSync} = require('node:fs')
    const path = require('node:path')
    assert.equal(realpathSync(process.execPath), realpathSync(process.argv[2]))
    for (const name of ['exceljs', 'docx', 'sharp']) {
      const prefix = realpathSync(process.argv[3]) + path.sep
      assert.ok(realpathSync(require.resolve(name)).startsWith(prefix), name)
      require(name)
    }
  `)
  const rg = path.join(resources, 'app/node_modules/@vscode/ripgrep-' + process.platform + '-' + process.arch, 'bin/rg')
  const commands = ['node modules.cjs "$TASK_NODE" "$TASK_MODULES"', 'test "$(command -v rg)" -ef "$TASK_RG"', 'rg -q LocalBash task.mjs']
  commands.push('test "$(command -v python3)" -ef "$TASK_PYTHON/bin/python3"', 'python office.py "$TASK_PYTHON"')
  const result = await bash.run(bash.resolve({
    command: commands.join(' && '),
    env: {
      TASK_NODE: realpathSync(process.execPath), TASK_MODULES: path.join(resources, 'app/node_modules'),
      TASK_RG: rg, TASK_PYTHON: path.join(resources, 'task-python')
    }
  }))
  assert.equal(result.exitCode, 0, result.stderr.text || 'Task tools failed to resolve inside the package')
  console.log('BUNDLED_TASK_TOOLS_OK')
} finally {
  await ctx.fiber.dispose()
}
