import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'vitest'
import { prepareHomebrewCask, renderHomebrewCask, parseArguments } from '../scripts/update-homebrew-cask.mjs'

const roots = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function fixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'ework-homebrew-test-'))
  roots.push(root)
  const dmgPath = path.join(root, 'final.dmg')
  const body = Buffer.from('final signed and stapled disk image')
  await writeFile(dmgPath, body)
  const sha256 = createHash('sha256').update(body).digest('hex')
  const metadata = {
    version: '1.4.0', files: [{ url: '../../releases/v1.4.0/sherlock-mac-arm64.dmg',
      size: body.length, sha512: createHash('sha512').update(body).digest('base64'), ...overrides.entry }],
    ...overrides.metadata
  }
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push([url, options.method ?? 'GET'])
    if (url.endsWith('latest-mac.yml')) return new Response(JSON.stringify(metadata))
    return new Response(null, { status: overrides.headStatus ?? 200,
      headers: { 'content-length': String(overrides.headSize ?? body.length),
        'cache-control': 'public, max-age=31536000, immutable' } })
  }
  return { version: '1.4.0', dmgPath, tapDirectory: path.join(root, 'tap'), fetchImpl, sha256, calls }
}

test('renders a pinned arm64 Cask with auto-updates and macOS 12 support', () => {
  const cask = renderHomebrewCask({ version: '1.4.0', sha256: 'a'.repeat(64) })
  assert.match(cask, /releases\/v#\{version\}\/sherlock-mac-arm64\.dmg/)
  assert.match(cask, /auto_updates true/)
  assert.match(cask, /depends_on arch: :arm64/)
  assert.match(cask, /depends_on macos: :monterey/)
  assert.doesNotMatch(cask, /verified:/)
  assert.match(cask, /app "EWork Odyssey.app"/)
  assert.doesNotMatch(cask, /no_check|download\/|zap|rmdir/)
})

test('rejects malformed versions and checksums', () => {
  for (const version of ['latest', '1.4.0-beta.1', '01.4.0', '1.4.0"', '../1.4.0']) {
    assert.throws(() => renderHomebrewCask({ version, sha256: 'a'.repeat(64) }), /version/)
  }
  assert.throws(() => renderHomebrewCask({ version: '1.4.0', sha256: 'missing' }), /SHA-256/)
})

test('verifies local bytes against the live feed and HEAD before generating', async () => {
  const options = await fixture()
  const result = await prepareHomebrewCask(options)
  assert.equal(result.sha256, options.sha256)
  assert.equal(result.changed, true)
  assert.equal(await readFile(result.caskPath, 'utf8'), renderHomebrewCask(options))
  assert.deepEqual(options.calls.map(call => call[1]), ['GET', 'HEAD'])
  assert.equal((await prepareHomebrewCask(options)).changed, false)
})

for (const [name, overrides, error] of [
  ['not live or rolled back', { metadata: { version: '1.3.5' } }, /version/],
  ['wrong metadata checksum', { entry: { sha512: 'wrong' } }, /SHA-512/],
  ['wrong metadata size', { entry: { size: 1 } }, /size/],
  ['wrong release path', { entry: { url: '../../releases/v1.3.5/sherlock-mac-arm64.dmg' } }, /DMG/],
  ['resource missing', { headStatus: 404 }, /HEAD/],
  ['remote size mismatch', { headSize: 1 }, /size/]
]) {
  test(`leaves existing cask untouched when ${name}`, async () => {
    const options = await fixture(overrides)
    await mkdir(path.join(options.tapDirectory, 'Casks'), { recursive: true })
    const caskPath = path.join(options.tapDirectory, 'Casks/ework-odyssey.rb')
    const before = renderHomebrewCask({ version: '1.3.5', sha256: 'b'.repeat(64) })
    await writeFile(caskPath, before)
    await assert.rejects(prepareHomebrewCask(options), error)
    assert.equal(await readFile(caskPath, 'utf8'), before)
  })
}

test('rejects downgrades and replacement bytes for an existing version', async () => {
  const options = await fixture()
  const caskPath = path.join(options.tapDirectory, 'Casks/ework-odyssey.rb')
  await mkdir(path.dirname(caskPath), { recursive: true })
  await writeFile(caskPath, renderHomebrewCask({ version: '1.5.0', sha256: options.sha256 }))
  await assert.rejects(prepareHomebrewCask(options), /downgrade/)
  await writeFile(caskPath, renderHomebrewCask({ version: '1.4.0', sha256: 'b'.repeat(64) }))
  await assert.rejects(prepareHomebrewCask(options), /same version/)
})

test('network failure does not generate a cask', async () => {
  const options = await fixture()
  options.fetchImpl = async () => { throw Error('network unavailable') }
  await assert.rejects(prepareHomebrewCask(options), /network unavailable/)
  await assert.rejects(readFile(path.join(options.tapDirectory, 'Casks/ework-odyssey.rb')), { code: 'ENOENT' })
})

test('CLI rejects unknown, missing and repeated arguments', () => {
  const args = ['--version', '1.4.0', '--dmg', '/final.dmg', '--tap', '/tap']
  assert.equal(parseArguments(args).version, '1.4.0')
  for (const invalid of [[], [...args, '--publish'], [...args, '--version', '1.5.0'], args.slice(0, -1)]) {
    assert.throws(() => parseArguments(invalid), /Usage|argument/)
  }
})
