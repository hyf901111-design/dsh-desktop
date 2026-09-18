import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { it, expect } from 'vitest'
import { FsError } from '@deepseek-ai/dsh-fs'
import { apply as applyObservationPolicy } from '@deepseek-ai/dsh-fs-observation-policy'
import { patchTodoRecovery, patchFileRecovery } from '../scripts/lib/tool-recovery-guidance.mjs'

it('patches both installed tool modules idempotently', () => {
  for (const [name, patch] of [['todo', patchTodoRecovery], ['fs', patchFileRecovery]]) {
    const source = readFileSync(`node_modules/@deepseek-ai/dsh-tool-${name}/lib/index.js`, 'utf8')
    expect(patch(patch(source))).toBe(patch(source))
  }
})

it('rejects the screenshot todo payload without changing state, and accepts a corrected complete list', async () => {
  const { apply } = await import('@deepseek-ai/dsh-tool-todo')
  let tool
  apply({ tools: { register: value => { tool = value } }, inject() {}, on() {} }, { allowParallelInProgress: false })
  const events = []
  const exec = { agent: { session: { append: (type, data) => events.push({ type, data }) } } }
  const invalid = { todos: [{ content: '读取技能参考文件', status: 'in_progress', pending: 'pending', completed: 'completed' }] }
  const original = JSON.stringify(invalid)
  await expect(tool.execute(invalid, exec)).rejects.toMatchObject({ code: 'INVALID_ARGS', message: expect.stringContaining('VALUES of status, not property names') })
  expect(JSON.stringify(invalid)).toBe(original)
  expect(events).toEqual([])
  const valid = { todos: [{ content: '读取技能参考文件', status: 'in_progress' }, { content: '生成文件', status: 'pending' }] }
  await tool.execute(valid, exec)
  expect(events).toEqual([{ type: 'todo/write', data: valid }])
  await expect(tool.execute({ todos: [{ content: '任务', status: 'finished' }] }, exec)).rejects.toMatchObject({ code: 'INVALID_ARGS' })
  expect(events).toHaveLength(1)
})

it('preserves file error codes and causes, with actionable read-tool recovery', () => {
  const source = patchFileRecovery(readFileSync('node_modules/@deepseek-ai/dsh-tool-fs/lib/index.js', 'utf8'))
  const start = source.indexOf('const REMEDIES =')
  const end = source.indexOf('//#endregion', start)
  const remediate = runInNewContext(source.slice(start, end) + ';remediateFsError', { FsError })
  for (const code of ['FS_NOT_OBSERVED', 'FS_STALE_VERSION']) {
    const original = new FsError('protected path', code)
    const error = remediate(original)
    expect(error.code).toBe(code)
    expect(error.cause).toBe(original)
    expect(error.message).toContain('read TOOL')
    expect(error.message).toContain('No file was changed')
  }
  const denied = new FsError('permission denied', 'FS_PERMISSION_DENIED')
  expect(remediate(denied)).toBe(denied)
})

it('keeps observation guards scoped to the current session and latest observed version', async () => {
  const hooks = {}
  applyObservationPolicy({ effect() {}, on: (name, callback) => { hooks[name] = callback } })
  const actor = { agent: { session: {} } }
  const other = { agent: { session: {} } }
  const target = { targetKey: '/tmp/test', displayPath: '/tmp/test' }
  await expect(hooks['fs/edit-intent'](target, actor)).rejects.toMatchObject({ code: 'FS_NOT_OBSERVED' })
  expect(await hooks['fs/write-intent'](target, actor)).toEqual({ kind: 'createIfAbsent' })
  hooks['fs/observed'](target, { kind: 'present', version: 'v1' }, actor)
  expect(await hooks['fs/edit-intent'](target, actor)).toEqual({ version: 'v1' })
  expect(await hooks['fs/write-intent'](target, actor)).toEqual({ kind: 'replaceIfVersion', version: 'v1' })
  await expect(hooks['fs/edit-intent'](target, other)).rejects.toMatchObject({ code: 'FS_NOT_OBSERVED' })
  hooks['fs/observed'](target, { kind: 'present', version: 'v2' }, actor)
  expect(await hooks['fs/edit-intent'](target, actor)).toEqual({ version: 'v2' })
})
