import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { legacyConnectionSources, previewLegacyConnections } from '../src/main/integrations/legacy-connections'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true }))) })
async function fixture(content: string) {
  const root = await mkdtemp(join(tmpdir(), 'ework-legacy-connections-')); roots.push(root)
  const sources = legacyConnectionSources({ userDataRoot: root })
  await mkdir(join(root, 'harness/profiles/web'), { recursive: true })
  await writeFile(sources[0]!.path, content)
  return { root, sources, content }
}
it('uses the actual profile and home patch files, excludes generated cordis.yml and model settings', () => {
  expect(legacyConnectionSources({ userDataRoot: '/data' })).toEqual([
    { path: '/data/harness/profiles/web/cordis.patch.yml', layer: 'profile', profile: 'web' },
    { path: '/data/harness/cordis.patch.yml', layer: 'home' }
  ])
  expect(() => legacyConnectionSources({ userDataRoot: '/data', profile: '../other' })).toThrow()
})
it('returns only redacted editable stdio drafts without executing scripts or granting tools', async () => {
  const f = await fixture(`- insert:\n  - id: reports\n    name: dsh-mcp-client\n    disabled: false\n    config:\n      transport: stdio\n      serverName: reports\n      command: node\n      args: [server.mjs, --token, super-secret-token]\n      env:\n        REPORT_KEY: super-secret-env\n        EXTERNAL_KEY: !!js process.env.EXTERNAL_KEY\n      cwd: /work\n`)
  const result = await previewLegacyConnections({ sources: f.sources })
  expect(result.items).toHaveLength(1)
  expect(result.items[0]).toMatchObject({ status: 'draft', legacyDisabled: false, draft: { type: 'mcp-stdio', name: 'reports', command: 'node', args: '[]', env: 'REPORT_KEY=\nEXTERNAL_KEY=', secret: '', allowPrivateNetwork: false, toolsJson: '[]', workspaceIds: '' } })
  expect(result.items[0]!.requiresInput).toContainEqual({ field: 'env.EXTERNAL_KEY', reason: 'environment-reference', reference: { kind: 'environment', name: 'EXTERNAL_KEY' } })
  expect(JSON.stringify(result)).not.toContain('super-secret')
  expect(result.items[0]).not.toHaveProperty('toolGrants')
  expect(await readFile(f.sources[0]!.path, 'utf8')).toBe(f.content)
})
it('strips HTTP credentials, URL query/userinfo, and requires explicit new authorization', async () => {
  const f = await fixture(`- insert:\n  - id: remote\n    name: '@deepseek-ai/dsh-mcp-client'\n    config:\n      transport: streamable-http\n      serverName: remote\n      url: https://user:url-secret@example.com/mcp?token=query-secret\n      headers:\n        Authorization: Bearer bearer-secret\n        X-API-Key: header-secret\n`)
  const item = (await previewLegacyConnections({ sources: f.sources })).items[0]!
  expect(item.draft).toMatchObject({ type: 'mcp-http', url: 'https://example.com/mcp', authType: 'bearer', secret: '' })
  expect(item.requiresInput.map(x => x.field)).toEqual(expect.arrayContaining(['secret', 'url', 'headers.X-API-Key']))
  expect(JSON.stringify(item)).not.toMatch(/url-secret|query-secret|bearer-secret|header-secret/)
  expect(item.message).toContain('旧连接')
})
it('does not evaluate expressions or guess partial, scoped and unknown API formats', async () => {
  const f = await fixture(`- id: inherited\n  name: dsh-mcp-client\n  config: {transport: stdio, command: node}\n- insert:\n  - id: dynamic\n    name: dsh-mcp-client\n    config:\n      transport: stdio\n      command: !!js "(()=>{throw Error('token-must-not-leak')})()"\n  - id: group\n    group: true\n    config:\n      - id: scoped\n        name: dsh-mcp-client\n        config: {transport: stdio, command: node}\n  - id: custom-api\n    name: old-api-plugin\n    config: {baseUrl: 'https://example.com', apiKey: dont-copy-api-key}\n`)
  const result = await previewLegacyConnections({ sources: f.sources })
  expect(result.items.map(x => x.status)).toEqual(['compatibility', 'compatibility', 'compatibility', 'compatibility'])
  expect(result.items.every(x => !x.draft)).toBe(true)
  expect(JSON.stringify(result)).not.toMatch(/token-must-not-leak|dont-copy-api-key/)
})
it('reports duplicate ids and partial overrides as ambiguous rather than silently merging activation state', async () => {
  const f = await fixture('- insert:\n  - id: duplicate\n    name: dsh-mcp-client\n    config: {transport: stdio, command: node, serverName: duplicate}\n')
  await writeFile(f.sources[1]!.path, '- id: duplicate\n  disabled: true\n')
  const result = await previewLegacyConnections({ sources: f.sources })
  expect(result.items[0]).toMatchObject({ status: 'compatibility' })
  expect(result.items[0]!.draft).toBeUndefined()
})
it('handles absent, malformed, aliased, oversized and symlinked files without leaking source text', async () => {
  const f = await fixture('- insert: [unterminated-source-secret')
  expect((await previewLegacyConnections({ sources: f.sources })).items[0]).toMatchObject({ status: 'compatibility' })
  expect(JSON.stringify(await previewLegacyConnections({ sources: f.sources }))).not.toContain('unterminated-source-secret')
  await writeFile(f.sources[0]!.path, '- &x {insert: [*x]}')
  expect((await previewLegacyConnections({ sources: f.sources })).items[0]!.status).toBe('compatibility')
  await writeFile(f.sources[0]!.path, 'x'.repeat(1024 * 1024 + 1))
  expect((await previewLegacyConnections({ sources: f.sources })).items[0]!.status).toBe('compatibility')
  await rm(f.sources[0]!.path); await symlink(f.sources[1]!.path, f.sources[0]!.path)
  expect((await previewLegacyConnections({ sources: f.sources })).items[0]!.status).toBe('compatibility')
})
