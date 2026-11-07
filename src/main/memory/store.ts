import { DatabaseSync } from 'node:sqlite'
import { mkdir, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export type MemoryEncryption = { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string }

/** Ciphertext is the sole persisted content. The SQLite journal contains no plaintext index. */
export class MemoryStore {
  private closed = false
  private constructor(private db: DatabaseSync, private encryption: MemoryEncryption) {}
  static async open(root: string, encryption: MemoryEncryption) {
    if (!encryption.isEncryptionAvailable()) throw Error('系统安全存储暂不可用，记忆原文件已保留。')
    await mkdir(root, { recursive: true, mode: 0o700 })
    const file = join(root, 'memory.sqlite'), db = new DatabaseSync(file)
    try {
      db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS memory_state (owner TEXT PRIMARY KEY, payload BLOB NOT NULL); CREATE TABLE IF NOT EXISTS memory_vectors (owner TEXT PRIMARY KEY, payload BLOB NOT NULL);')
      await chmod(file, 0o600)
      return new MemoryStore(db, encryption)
    } catch (error) { db.close(); throw error }
  }
  private ownerKey(owner: string) { return createHash('sha256').update(owner).digest('hex') }
  read<T>(owner: string): T | undefined {
    const row = this.db.prepare('SELECT payload FROM memory_state WHERE owner=?').get(this.ownerKey(owner))
    if (!row) return undefined
    if (!this.encryption.isEncryptionAvailable()) throw Error('系统安全存储暂不可用。')
    try { return JSON.parse(this.encryption.decryptString(Buffer.from(row.payload as Uint8Array))) as T }
    catch { throw Error('记忆数据读取失败，原文件已保留。') }
  }
  write(owner: string, value: unknown, purge = false) {
    if (!this.encryption.isEncryptionAvailable()) throw Error('系统安全存储暂不可用，未保存记忆。')
    const payload = this.encryption.encryptString(JSON.stringify(value))
    this.db.prepare('INSERT INTO memory_state(owner,payload) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET payload=excluded.payload').run(this.ownerKey(owner), payload)
    if (purge) {this.clearVectors(owner);try {this.db.exec('VACUUM')}catch {console.warn('[memory] 空间回收未完成；删除已提交。')}}
  }
  readVectors<T>(owner:string):T|undefined {
    const row=this.db.prepare('SELECT payload FROM memory_vectors WHERE owner=?').get(this.ownerKey(owner))
    if(!row)return undefined
    if(!this.encryption.isEncryptionAvailable())throw Error('系统安全存储暂不可用。')
    return JSON.parse(this.encryption.decryptString(Buffer.from(row.payload as Uint8Array))) as T
  }
  writeVectors(owner:string,value:unknown){
    if(!this.encryption.isEncryptionAvailable())throw Error('系统安全存储暂不可用。')
    const payload=this.encryption.encryptString(JSON.stringify(value))
    this.db.prepare('INSERT INTO memory_vectors(owner,payload) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET payload=excluded.payload').run(this.ownerKey(owner),payload)
  }
  clearVectors(owner:string){this.db.prepare('DELETE FROM memory_vectors WHERE owner=?').run(this.ownerKey(owner))}
  close() { if (!this.closed) { this.closed = true; this.db.close() } }
}
