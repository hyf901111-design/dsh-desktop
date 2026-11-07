import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { MemoryIndex, EncryptedStore } from './engine.mjs'

const runtime = process.env.LOCAL_MEMORY_RUNTIME
if (!runtime) throw Error('Set LOCAL_MEMORY_RUNTIME to the isolated dependency directory')
const vector = new Float32Array(384); vector[0] = 1
const row = { id: 'same', owner: 'a', scope: 'project', projectId: 'alpha', status: 'active', title: '独有标题', content: '合成保密测试内容SYNTHETIC_SENTINEL' }

test('same ID remains isolated across owners and projects in read, update, delete', () => {
  const a = new MemoryIndex(runtime, 'a', ['alpha', 'beta']), b = new MemoryIndex(runtime, 'b', ['alpha'])
  try {
    a.put(row, vector); a.put({ ...row, projectId: 'beta', content: '另一项目' }, vector)
    b.put({ ...row, owner: 'b', content: '另一账户' }, vector)
    a.put({ ...row, content: '当前项目更新' }, vector)
    assert.equal(a.search('内容', vector, { projectId: 'alpha' }).candidates[0].row.content, '当前项目更新')
    assert.throws(() => a.put({ ...row, owner: 'b' }, vector), /Owner mismatch/)
    assert.throws(() => b.search('内容', vector, { projectId: 'beta' }), /not authorized/)
    a.remove(row)
    assert.equal(a.search('内容', vector, { projectId: 'alpha' }).ids.length, 0)
    assert.equal(a.search('内容', vector, { projectId: 'beta' }).candidates[0].row.content, '另一项目')
    assert.equal(b.search('内容', vector, { projectId: 'alpha' }).candidates[0].row.content, '另一账户')
  } finally { a.close(); b.close() }
})

test('state and expiry filters apply before both retrieval arms; history is explicit', () => {
  const index = new MemoryIndex(runtime, 'a', ['alpha'])
  try {
    for (const status of ['active', 'superseded', 'candidate', 'disabled']) index.put({ ...row, id: status, status }, vector)
    index.put({ ...row, id: 'expired', expiresAt: 1 }, vector)
    for (const strategy of ['semantic', 'lexical', 'hybrid']) {
      assert.deepEqual(index.search('保密测试', vector, { projectId: 'alpha', strategy }).ids, ['active'])
      assert.deepEqual(index.search('保密测试', vector, { projectId: 'alpha', mode: 'history', strategy }).ids.sort(), ['active', 'superseded'])
    }
  } finally { index.close() }
})

test('edited and deleted text disappears from the lexical index', () => {
  const index = new MemoryIndex(runtime, 'a', ['alpha'])
  try {
    index.put({ ...row, content: 'obsolete_identifier' }, vector)
    index.put({ ...row, content: 'replacement_identifier' }, vector)
    assert.deepEqual(index.search('obsolete_identifier', vector, { projectId: 'alpha', strategy: 'lexical' }).ids, [])
    assert.deepEqual(index.search('replacement_identifier', vector, { projectId: 'alpha', strategy: 'lexical' }).ids, ['same'])
    index.remove(row)
    assert.deepEqual(index.search('replacement_identifier', vector, { projectId: 'alpha', strategy: 'lexical' }).ids, [])
  } finally { index.close() }
})

test('encrypted records and vectors survive reopening; deletion and owner isolation persist', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ework-memory-')), path = join(directory, 'test.sqlite'), key = randomBytes(32)
  let store = new EncryptedStore(path, key)
  try {
    store.put('a', row, vector); store.put('b', { ...row, owner: 'b' }, vector)
    store.close(); store = new EncryptedStore(path, key)
    assert.equal(store.read('a')[0].row.owner, 'a')
    assert.deepEqual(store.read('a')[0].vector, vector)
    assert.equal(readFileSync(path).includes(Buffer.from(row.content)), false)
    assert.equal(readFileSync(path).includes(Buffer.from('SYNTHETIC_SENTINEL')), false)
    assert.throws(() => store.remove('a', { ...row, owner: 'b' }), /Owner mismatch/)
    store.remove('a', row); store.close(); store = new EncryptedStore(path, key)
    assert.equal(store.read('a').length, 0)
    assert.equal(store.read('b').length, 1)
    store.close(); store = new EncryptedStore(path, randomBytes(32))
    assert.throws(() => store.read('b'))
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }) }
})
