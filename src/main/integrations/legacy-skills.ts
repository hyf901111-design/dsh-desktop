import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { SkillImportManager, SkillImportError, readSkillResource, skillImportDiagnostic, type ImportedSkill } from './skill-import'
import { atomicWrite } from './store'
import type { SkillImportDiagnostic } from '../../shared/integration-ui'

export type LegacySkillRoot = { path: string; kind: 'personal' | 'project' | 'custom' | 'bundled' }
export interface LegacySkillMigrationItem {
  id: string
  sourcePath: string
  kind: LegacySkillRoot['kind']
  name: string
  status: 'eligible' | 'migrated' | 'compatibility' | 'skipped' | 'failed'
  message?: string
  skillId?: string
  sourceId?: string
  diagnostic?: SkillImportDiagnostic
}
export interface LegacySkillMigrationReport {
  version: 1
  ownerAccountId: string
  status: 'preview' | 'complete' | 'partial'
  items: LegacySkillMigrationItem[]
}

/** Mirrors dsh-skill-filesystem 0.1.0-rc.7 roots; callers pass trusted workspace roots, not model arguments. */
export function legacySkillRoots(options: {
  userDataRoot: string
  agentsHome?: string
  workspaceRoots?: string[]
  customRoots?: string[]
  bundledSkillDirectory?: string
}): LegacySkillRoot[] {
  const roots: LegacySkillRoot[] = [
    { path: join(options.userDataRoot, 'harness', 'skills'), kind: 'personal' },
    { path: join(options.agentsHome ?? process.env.DSH_AGENTS_HOME ?? join(homedir(), '.agents'), 'skills'), kind: 'personal' },
    ...(options.workspaceRoots ?? []).flatMap(root => [{ path: join(root, '.dsh/skills'), kind: 'project' as const }, { path: join(root, '.agents/skills'), kind: 'project' as const }]),
    ...(options.customRoots ?? []).map(path => ({ path, kind: 'custom' as const })),
    ...(options.bundledSkillDirectory ? [{ path: options.bundledSkillDirectory, kind: 'bundled' as const }] : [])
  ]
  const unique = new Map<string, LegacySkillRoot>()
  for (const root of roots) unique.set(resolve(root.path), { ...root, path: resolve(root.path) })
  return [...unique.values()]
}

/** Copy-only migration. Existing filesystem sources are never moved, rewritten or deleted. */
export class LegacySkillMigration {
  private readonly fileName: string
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly options: {
    root: string
    ownerAccountId: string
    manager: SkillImportManager
    roots: LegacySkillRoot[]
  }) {
    if (!options.ownerAccountId || options.ownerAccountId.length > 512 || options.roots.length > 64) throw new Error('旧技能迁移配置无效')
    this.fileName = `legacy-skills-v1-${createHash('sha256').update(options.ownerAccountId).digest('hex').slice(0, 32)}.json`
  }

  async preview(): Promise<LegacySkillMigrationReport> {
    const items: LegacySkillMigrationItem[] = []
    for (const root of this.options.roots) {
      let entries: string[]
      try {
        const stat = await lstat(root.path)
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          items.push({ ...this.item(root, root.path, 'skipped', '目录未接入；原文件保持不变。'), diagnostic: skillImportDiagnostic(new SkillImportError('UNSAFE_PATH', '旧技能目录是链接或不是目录，未读取内容。')) })
          continue
        }
        entries = (await readdir(root.path)).sort()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        items.push({ ...this.item(root, root.path, 'failed', '旧技能目录不可读取；原文件保持不变。'), diagnostic: skillImportDiagnostic(error) })
        continue
      }
      for (const name of entries) {
        if (name === '.system' || name.startsWith('.')) continue
        if (items.length >= 1000) throw new Error('旧技能条目超过 1000 项，请分批迁移')
        const sourcePath = join(root.path, name)
        let info
        try { info = await lstat(sourcePath) }
        catch (error) { items.push({ ...this.item(root, sourcePath, 'failed', '此来源暂不可读取，其他技能仍可检查。'), diagnostic: skillImportDiagnostic(error) }); continue }
        if (info.isSymbolicLink()) { items.push({ ...this.item(root, sourcePath, 'skipped', '未导入符号链接，原文件保持不变。'), diagnostic: skillImportDiagnostic(new SkillImportError('UNSAFE_PATH', '所选技能来源是符号链接。')) }); continue }
        if (info.isFile() && name.endsWith('.md')) {
          items.push(this.item(root, sourcePath, 'compatibility', '独立 Markdown 技能保留原提供者兼容；整理为含 SKILL.md 的独立目录后可导入管理。'))
          continue
        }
        if (!info.isDirectory()) continue
        try { if (!(await lstat(join(sourcePath, 'SKILL.md'))).isFile()) continue }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; items.push({ ...this.item(root, sourcePath, 'failed', '技能定义暂不可读取；原文件保持不变。'), diagnostic: skillImportDiagnostic(error) }); continue }
        if (root.kind === 'bundled') {
          items.push(this.item(root, sourcePath, 'compatibility', '仍由客户端内置管理，可继续在对话中按原方式使用；随客户端版本更新，不复制为个人技能，也不会因本次接入被停用。'))
          continue
        }
        try {
          const preview = await this.options.manager.previewSkillImport(sourcePath)
          items.push({ ...this.item(root, sourcePath, 'eligible'), name: preview.name, sourceId: preview.sourceId })
        } catch (error) {
          items.push({ ...this.item(root, sourcePath, 'failed', '暂不能接入管理；原技能保持原方式使用，原文件和依赖不变。'), diagnostic: skillImportDiagnostic(error) })
        }
      }
    }
    return { version: 1, ownerAccountId: this.options.ownerAccountId, status: 'preview', items }
  }

  /** Register callback must durably upsert by receipt.id before resolving; failures compensate only the new copy. */
  migrateOnce(register: (receipt: ImportedSkill, source: LegacySkillMigrationItem) => Promise<void>): Promise<LegacySkillMigrationReport> {
    const operation = this.queue.then(async () => {
      const previous = await this.readReport()
      // A completed earlier pass must not hide newly added or repaired sources.
      const report = await this.preview()
      const completed = new Map((previous?.items ?? []).filter(item => item.status === 'migrated').map(item => [item.id, item]))
      for (let index = 0; index < report.items.length; index++) {
        let item = report.items[index]!
        if (completed.has(item.id)) { report.items[index] = completed.get(item.id)!; continue }
        if (item.status !== 'eligible') continue
        let receipt: ImportedSkill | undefined
        let registered = false
        try {
          const preview = await this.options.manager.previewSkillImport(item.sourcePath)
          const mode = preview.conflicts.length && !preview.conflicts.some(conflict => conflict.sameSource) ? 'copy' : 'replace'
          receipt = await this.options.manager.commitSkillImport(preview.previewId, mode)
          await register(receipt, item)
          registered = true
          this.options.manager.finalizeSkillImport(receipt)
          item = { ...item, status: 'migrated', skillId: receipt.id, sourceId: receipt.sourceId, message: '已复制到当前账户的受管理目录，原文件保持不变。' }
        } catch (error) {
          if (receipt && !registered) await this.options.manager.rollbackSkillImport(receipt)
          item = { ...item, status: 'failed', message: '迁移未完成；原技能保持原方式使用，原文件不变。', diagnostic: skillImportDiagnostic(error) }
        }
        report.items[index] = item
        report.status = 'partial'
        await this.writeReport(report)
      }
      report.status = report.items.some(item => item.status === 'failed' || item.status === 'eligible') ? 'partial' : 'complete'
      await this.writeReport(report)
      return structuredClone(report)
    })
    this.queue = operation.catch(() => undefined)
    return operation
  }

  private item(root: LegacySkillRoot, sourcePath: string, status: LegacySkillMigrationItem['status'], message?: string): LegacySkillMigrationItem {
    return { id: createHash('sha256').update(resolve(sourcePath)).digest('hex'), sourcePath, kind: root.kind, name: sourcePath.split(/[\\/]/u).pop() ?? sourcePath, status, ...(message ? { message } : {}) }
  }

  private async readReport(): Promise<LegacySkillMigrationReport | undefined> {
    try {
      const value = JSON.parse((await readSkillResource(this.options.root, this.fileName)).toString('utf8')) as LegacySkillMigrationReport
      if (value.version !== 1 || value.ownerAccountId !== this.options.ownerAccountId || !Array.isArray(value.items) || !['complete', 'partial'].includes(value.status)) throw new Error('旧技能迁移记录无效')
      return value
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  }

  private async writeReport(report: LegacySkillMigrationReport): Promise<void> {
    await mkdir(this.options.root, { recursive: true, mode: 0o700 })
    if ((await lstat(this.options.root)).isSymbolicLink()) throw new Error('旧技能迁移记录目录不能是链接')
    await atomicWrite(join(this.options.root, this.fileName), JSON.stringify(report))
  }
}
