import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyBundledSkillParity } from '../scripts/bundled-skill-parity.mjs'
import * as skillParity from '../scripts/bundled-skill-parity.mjs'

const scratchDirectories: string[] = []

function scratchDirectory(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'sherlock-skill-parity-'))
  scratchDirectories.push(directory)
  return directory
}

function writeSkill(directory: string, version: string, body: string, slug = 'efund-ppt-maker'): void {
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    path.join(directory, '_meta.json'),
    `${JSON.stringify({
      slug,
      cnName: 'PPT制作助手',
      version,
      source: 'eSkill'
    })}\n`,
    'utf8'
  )
  writeFileSync(path.join(directory, 'SKILL.md'), body, 'utf8')
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('packaged bundled skill parity', () => {
  it('reports the verified version when source and packaged contents match', () => {
    const root = scratchDirectory()
    const source = path.join(root, 'source')
    const packaged = path.join(root, 'packaged')
    writeSkill(source, 'v1.0.6', 'same-content')
    writeSkill(packaged, 'v1.0.6', 'same-content')

    expect(
      verifyBundledSkillParity({
        sourceSkillDirectory: source,
        packagedSkillDirectory: packaged
      })
    ).toMatchObject({ slug: 'efund-ppt-maker', version: 'v1.0.6' })
  })

  it('rejects a packaged copy whose files differ from the source', () => {
    const root = scratchDirectory()
    const source = path.join(root, 'source')
    const packaged = path.join(root, 'packaged')
    writeSkill(source, 'v1.0.6', 'current-content')
    writeSkill(packaged, 'v1.0.6', 'stale-content')

    expect(() =>
      verifyBundledSkillParity({
        sourceSkillDirectory: source,
        packagedSkillDirectory: packaged
      })
    ).toThrow('packaged bundled skill content does not match source')
  })

  it('requires the report skill and its bundled scripts in the client package check', () => {
    const root = scratchDirectory(), sourceSkillRoot = path.join(root, 'source'), packagedSkillRoot = path.join(root, 'packaged')
    const slugs = ['efund-ppt-maker', 'ework-workbench-components', 'ework-free-data-sources', 'ework-finance-analysis', 'ework-equity-research']
    for (const slug of slugs) {
      writeSkill(path.join(sourceSkillRoot, slug), 'v1.0.0', 'same-content', slug)
      if (slug !== 'ework-equity-research') writeSkill(path.join(packagedSkillRoot, slug), 'v1.0.0', 'same-content', slug)
    }
    const sourceScript = path.join(sourceSkillRoot, 'ework-equity-research', 'scripts')
    mkdirSync(sourceScript); writeFileSync(path.join(sourceScript, 'report.py'), 'print("report")\n')
    const verify = () => skillParity.verifyClientBundledSkillsParity({ sourceSkillRoot, packagedSkillRoot })
    expect(verify).toThrow('packaged bundled skill is missing')
    writeSkill(path.join(packagedSkillRoot, 'ework-equity-research'), 'v1.0.0', 'same-content', 'ework-equity-research')
    expect(verify).toThrow('packaged bundled skill content does not match source')
    const packagedScript = path.join(packagedSkillRoot, 'ework-equity-research', 'scripts')
    mkdirSync(packagedScript); writeFileSync(path.join(packagedScript, 'report.py'), 'print("report")\n')
    expect(verify()).toHaveLength(5)
    expect(verify()).toContainEqual(expect.objectContaining({ slug: 'ework-equity-research', version: 'v1.0.0' }))
  })
})
