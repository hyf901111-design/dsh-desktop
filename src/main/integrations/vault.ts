import {mkdir,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {IntegrationError} from '../../shared/integrations'
import {atomicWrite} from './store'
export interface PlatformEncryption {isEncryptionAvailable():boolean;encryptString(value:string):Buffer;decryptString(value:Buffer):string}
export class CredentialVault {
  constructor(private root:string,private encryption:PlatformEncryption) {}
  private file(id:string) { if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new IntegrationError('INVALID_CONFIG','凭据引用无效'); return join(this.root,`${id}.bin`) }
  async put(id:string,secret:string):Promise<void> {
    const file=this.file(id)
    if(typeof secret!=='string' || secret.length>32768) throw new IntegrationError('INVALID_CONFIG','凭据格式无效')
    if(!this.encryption.isEncryptionAvailable()) throw new IntegrationError('STORAGE_UNAVAILABLE','系统安全存储不可用，未保存凭据')
    const encrypted=this.encryption.encryptString(secret)
    await mkdir(this.root,{recursive:true,mode:0o700}); await atomicWrite(file,encrypted)
  }
  async read(id:string):Promise<string> {
    const file=this.file(id)
    if(!this.encryption.isEncryptionAvailable()) throw new IntegrationError('STORAGE_UNAVAILABLE','系统安全存储不可用')
    try{return this.encryption.decryptString(await readFile(file))}catch{throw new IntegrationError('AUTH_REQUIRED','凭据不可用，请重新输入或授权')}
  }
  async remove(id:string):Promise<void> {await rm(this.file(id),{force:true})}
}
