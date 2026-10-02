import {expect,it} from 'vitest'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto'
import {ResearchWebNavigationStore} from '../src/main/state/research-web-navigation'

const key=randomBytes(32)
const encryption={isEncryptionAvailable:()=>true,encryptString:(value:string)=>{
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv)
 return Buffer.concat([iv,c.update(value),c.final(),c.getAuthTag()])
},decryptString:(value:Buffer)=>{
 const d=createDecipheriv('aes-256-gcm',key,value.subarray(0,12));d.setAuthTag(value.subarray(-16))
 return Buffer.concat([d.update(value.subarray(12,-16)),d.final()]).toString()
}}
it('登录跳转地址加密保存，重开恢复当前会话而不复用旧 SID，登出也覆盖恢复地址',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'web-navigation-')),'state.bin'),initial='https://mail.example.test/mail?sid=old'
 const first=new ResearchWebNavigationStore(file,encryption)
 first.remember('card',initial,'https://mail.example.test/mail?sid=new#inbox');await first.flush()
 expect((await readFile(file)).includes(Buffer.from('sid=new'))).toBe(false)
 const reopened=new ResearchWebNavigationStore(file,encryption)
 expect(reopened.restore('card',initial)).toBe('https://mail.example.test/mail?sid=new#inbox')
 reopened.remember('card',initial,'https://mail.example.test/login');await reopened.flush()
 expect(new ResearchWebNavigationStore(file,encryption).restore('card',initial)).toBe('https://mail.example.test/login')
 reopened.forget('card');await reopened.flush()
 expect(new ResearchWebNavigationStore(file,encryption).restore('card',initial)).toBe(initial)
})
it('不恢复被编辑的链接、其他卡片、跨来源跳转、授权码或过期的浏览状态',()=>{
 let now=1;const store=new ResearchWebNavigationStore(undefined,undefined,()=>now),initial='https://example.test/'
 store.remember('card',initial,initial+'account')
 expect(store.restore('card',initial)).toBe(initial+'account')
 expect(store.restore('other',initial)).toBe(initial)
 expect(store.restore('card',initial+'edited')).toBe(initial+'edited')
 for(const target of ['https://other.test/','http://example.test/','https://example.test/?code=secret','javascript:alert(1)'])store.remember('card',initial,target)
 expect(store.restore('card',initial)).toBe(initial+'account')
 now+=31*24*60*60*1000;expect(store.restore('card',initial)).toBe(initial)
})
it('系统加密不可用不写明文，损坏的原文件保留且不阻塞浏览',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'web-navigation-')),'state.bin'),initial='https://example.test/'
 const unavailable=new ResearchWebNavigationStore(file,{...encryption,isEncryptionAvailable:()=>false})
 unavailable.remember('card',initial,initial+'account');await unavailable.flush()
 await expect(readFile(file)).rejects.toMatchObject({code:'ENOENT'})
 await writeFile(file,'unreadable original')
 const corrupt=new ResearchWebNavigationStore(file,encryption)
 corrupt.remember('card',initial,initial+'account');await corrupt.flush()
 expect(await readFile(file,'utf8')).toBe('unreadable original')
 expect(corrupt.restore('card',initial)).toBe(initial+'account')
})
