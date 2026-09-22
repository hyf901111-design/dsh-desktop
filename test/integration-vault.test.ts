import { afterEach, expect, it } from 'vitest'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CredentialVault } from '../src/main/integrations/vault'
const roots: string[] = []
const key=randomBytes(32)
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString(value:string) { const iv=randomBytes(12), c=createCipheriv('aes-256-gcm',key,iv); const body=Buffer.concat([c.update(value,'utf8'),c.final()]); return Buffer.concat([iv,c.getAuthTag(),body]) },
  decryptString(value:Buffer) { const d=createDecipheriv('aes-256-gcm',key,value.subarray(0,12)); d.setAuthTag(value.subarray(12,28)); return Buffer.concat([d.update(value.subarray(28)),d.final()]).toString('utf8') },
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root,{recursive:true,force:true}))) })
it('persists encrypted credentials, replaces atomically, and rejects escaping references',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ework-vault-')); roots.push(root)
  const vault=new CredentialVault(root,encryption)
  await vault.put('example','test-secret-one')
  expect((await readFile(join(root,'example.bin'))).includes('test-secret-one')).toBe(false)
  expect(await new CredentialVault(root,encryption).read('example')).toBe('test-secret-one')
  await vault.put('example','test-secret-two')
  expect(await vault.read('example')).toBe('test-secret-two')
  await expect(vault.put('../escape','test')).rejects.toMatchObject({code:'INVALID_CONFIG'})
  await vault.remove('example'); expect(await readdir(root)).toEqual([])
})
it('never writes plaintext when system encryption is unavailable',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ework-vault-')); roots.push(root)
  const vault=new CredentialVault(root,{...encryption,isEncryptionAvailable:()=>false})
  await expect(vault.put('example','test-secret')).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE'})
  expect(await readdir(root)).toEqual([])
})
