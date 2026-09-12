import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { createFixtureZip, createLocalDownloadFixture } from '../scripts/local-update-download-fixture.mjs'
it('creates a deterministic non-installable stored ZIP with bounded synthetic text',()=>{
  const a=createFixtureZip(),b=createFixtureZip();expect(a.equals(b)).toBe(true)
  expect(a.readUInt32LE(0)).toBe(0x04034b50);expect(a.readUInt16LE(8)).toBe(0)
  const name=a.subarray(30,30+a.readUInt16LE(26)).toString();expect(name).toBe('LOCAL-ACCEPTANCE-ONLY.txt')
  expect(a.readUInt32LE(a.length-22)).toBe(0x06054b50);expect(a.readUInt16LE(a.length-14)).toBe(1)
  const fixture=createLocalDownloadFixture({currentVersion:'0.9.4'})
  expect(fixture.server.listening).toBe(false);expect(fixture.bytes).toBe(a.length)
  expect(fixture.sha512).toBe(createHash('sha512').update(a).digest('base64'));expect(fixture.metadata).toContain('version: 0.9.5')
})
it('rejects unsupported fixture modes and does not silently change the metadata-only fixture',()=>{
  expect(()=>createLocalDownloadFixture({currentVersion:'bad'})).toThrow()
  expect(()=>createLocalDownloadFixture({currentVersion:'0.9.4',scenario:'install'})).toThrow()
  expect(()=>createLocalDownloadFixture({currentVersion:'0.9.4',intervalMs:0})).toThrow()
  const fixture=createLocalDownloadFixture({currentVersion:'0.9.4',scenario:'bad-hash'})
  expect(fixture.metadata).not.toContain(fixture.sha512);expect(fixture.server.listening).toBe(false)
})
