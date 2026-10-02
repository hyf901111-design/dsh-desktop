import {expect,it,vi} from 'vitest'
import {mkdtemp,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto'
import {ResearchWebSessionPersistence} from '../src/main/state/research-web-session'

const key=randomBytes(32),encryption={isEncryptionAvailable:()=>true,encryptString:(s:string)=>{
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(s),c.final(),c.getAuthTag()])
},decryptString:(b:Buffer)=>{const d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(-16));return Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString()}}
const cookie={name:'mail_session',value:'synthetic-only',domain:'mail.example.test',path:'/mail',hostOnly:true,session:true,secure:true,httpOnly:true,sameSite:'strict' as const}
function browser(initial:any[]=[]) {
 let change:Function=()=>{}
 const cookies={get:vi.fn(async()=>initial),set:vi.fn(async(_details:any)=>{}),flushStore:vi.fn(async()=>{}),on:vi.fn((_n:string,cb:Function)=>{change=cb})}
 return {session:{cookies} as any,change:(c:any,cause:string,removed:boolean)=>change({},c,cause,removed),cookies}
}
it('只保存研究网页自身的会话Cookie；加密恢复时保留hostOnly/HttpOnly/SameSite，不延长期限',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'web-session-')),'session.bin'),first=browser()
 const store=new ResearchWebSessionPersistence(first.session,file,encryption);await store.ready;store.track('https://mail.example.test/mail')
 first.change({...cookie,domain:'unrelated.test'},'inserted',false)
 first.change(cookie,'inserted',false);await store.flush()
 expect((await readFile(file)).includes(Buffer.from('synthetic-only'))).toBe(false)
 const reopened=browser();await new ResearchWebSessionPersistence(reopened.session,file,encryption).ready
 expect(reopened.cookies.set).toHaveBeenCalledExactlyOnceWith({url:'https://mail.example.test/mail',name:'mail_session',value:'synthetic-only',path:'/mail',secure:true,httpOnly:true,sameSite:'strict'})
 expect(reopened.cookies.set.mock.calls[0]![0]).not.toHaveProperty('expirationDate')
 expect(reopened.cookies.set.mock.calls[0]![0]).not.toHaveProperty('domain')
})
it('登出删除及持久Cookie替换会同步清理，重启不复活旧登录；不覆盖现有Cookie',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'web-session-')),'session.bin'),b=browser(),store=new ResearchWebSessionPersistence(b.session,file,encryption)
 await store.ready;store.track('https://mail.example.test/mail');b.change(cookie,'inserted',false);await store.flush()
 const present=browser([cookie]);await new ResearchWebSessionPersistence(present.session,file,encryption).ready
 expect(present.cookies.set).not.toHaveBeenCalled()
 b.change(cookie,'explicit',true);await store.flush()
 const loggedOut=browser();await new ResearchWebSessionPersistence(loggedOut.session,file,encryption).ready
 expect(loggedOut.cookies.set).not.toHaveBeenCalled()
 b.change(cookie,'inserted',false);b.change(cookie,'overwrite',true);b.change({...cookie,session:false,expirationDate:9999999999},'inserted',false);await store.flush()
 const replaced=browser();await new ResearchWebSessionPersistence(replaced.session,file,encryption).ready
 expect(replaced.cookies.set).not.toHaveBeenCalled()
})
it('不恢复超过本地保留期限的会话Cookie，延迟读取不覆盖登出事件',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'web-session-')),'session.bin'),b=browser(),store=new ResearchWebSessionPersistence(b.session,file,encryption,()=>1)
 await store.ready
 let resolve:(cookies:any[])=>void
 b.cookies.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 store.track('https://mail.example.test/mail');await Promise.resolve();await Promise.resolve()
 b.change(cookie,'inserted',false);b.change(cookie,'explicit',true);resolve!([cookie]);await store.flush()
 const next=browser();await new ResearchWebSessionPersistence(next.session,file,encryption).ready;expect(next.cookies.set).not.toHaveBeenCalled()
 b.change(cookie,'inserted',false);await store.flush()
 const expired=browser();await new ResearchWebSessionPersistence(expired.session,file,encryption,()=>31*24*60*60*1000).ready
 expect(expired.cookies.set).not.toHaveBeenCalled()
})
