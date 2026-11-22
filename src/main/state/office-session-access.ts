import { createHash } from 'node:crypto'

export type OfficeMode = 'note' | 'spreadsheet' | 'presentation'
type Scope = Partial<Record<OfficeMode | 'unavailable' | 'copy', string>>
type Access = {reason: OfficeAccessReason; title?: string}
export type OfficeAccessReason = '' | 'guest' | 'account' | 'loading' | 'unavailable'
const modes = ['note', 'spreadsheet', 'presentation'] as const
export const officeOwnerSlot = (owner: string) => createHash('sha256').update('ework-office-session:' + owner).digest('hex')

export class OfficeSessionAccess {
  private readonly scopes = new Map<string, Scope>()
  private readonly observed = new Set(['local'])
  constructor(private readonly owner: () => string | undefined,
    private readonly hasRecord: (owner: string, sessionId: string, mode: OfficeMode) => boolean,
    private readonly knownAccounts: () => string[] = () => [],
    private readonly documentTitle?: (owner: string, id: string, mode: OfficeMode) => string,
    private readonly savedView?: (id: string) => string | null) {}

  identity() { const owner = this.owner(); return owner ? officeOwnerSlot(owner) : null }

  check(rows: unknown) {
    if (!Array.isArray(rows)) throw Error('文档会话列表无效。')
    const owner = this.owner()
    if (owner) this.observed.add(owner)
    const accounts = [...new Set([...this.observed, ...this.knownAccounts()])]
    const result: Record<string, Access> = Object.create(null)
    for (const row of rows) {
      if (!Array.isArray(row)) continue
      const [id, scope, needsDeckTitle] = row
      if (typeof id !== 'string' || !id || id.length > 256 || !scope || typeof scope !== 'object' ||
          !Object.entries(scope).every(([mode, value]) => (modes.some(m => m === mode) || mode === 'unavailable' || mode === 'copy') &&
            (value === 'legacy' || typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)))) continue
      try {
        result[id] = this.project(id, scope, owner, accounts, needsDeckTitle === true)
      } catch {
        this.scopes.set(id, {unavailable:'legacy'})
        result[id] = {reason:'unavailable'}
      }
    }
    return result
  }

  private project(id: string, scope: Scope, owner: string | undefined, accounts: string[], needsDeckTitle: boolean): Access {
    const {copy, ...documents} = scope
    if (copy) {
      const view = this.savedView?.(id)
      for (const mode of modes) {
        if (!documents[mode] && (view === (mode === 'note' ? 'notes' : mode) ||
            accounts.some(account => this.hasRecord(account, id, mode)))) documents[mode] = 'legacy'
      }
    }
    if (Object.keys(documents).length) this.scopes.set(id, documents)
    else this.scopes.delete(id)

    const reason = this.reason(id)
    if (!owner || reason || !this.documentTitle) return {reason}
    // Older clients could write different documents into the same native
    // session id. That session has just one global title. For those rows,
    // derive the label exclusively from this identity's document.
    const mode = modes.find(kind => documents[kind] && this.hasRecord(owner, id, kind))
    if (needsDeckTitle && documents.presentation && this.hasRecord(owner, id, 'presentation')) {
      const title = this.documentTitle(owner, id, 'presentation')
      if (title && title !== '未命名演示文稿') return {reason, title}
    }
    if (mode && accounts.some(other => other !== owner && modes.some(kind => this.hasRecord(other, id, kind))))
      return {reason, title:this.documentTitle(owner, id, mode)}
    return {reason}
  }

  reason(id: string, mode?: OfficeMode): OfficeAccessReason {
    const owner = this.owner()
    if (!owner) return 'loading'
    const scope = this.scopes.get(id)
    if (!scope) return ''
    const has = (candidate: string, kind: OfficeMode) =>
      scope[kind] === officeOwnerSlot(candidate) || this.hasRecord(candidate, id, kind)
    const ownsDocument = mode && scope[mode] ? has(owner, mode) : modes.some(kind => has(owner, kind))
    if (ownsDocument) return ''
    if (scope.unavailable) return 'unavailable'
    return owner !== 'local' && modes.some(kind => has('local', kind)) ? 'guest' : 'account'
  }

  assert(id: string, mode: OfficeMode) {
    const reason = this.reason(id, mode)
    if (reason === 'guest') throw Error('这份文档保存在本机访客空间。退出当前账号后即可打开。')
    if (reason === 'account') throw Error('这份文档属于其他账号。请登录创建文档时使用的账号。')
    if (reason === 'unavailable') throw Error('暂时无法读取文档归属，请重新打开工作区后再试。')
    if (reason === 'loading') throw Error('账号正在切换，请稍后重新打开文档。')
  }
}
