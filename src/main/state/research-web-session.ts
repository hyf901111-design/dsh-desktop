import {readFileSync} from 'node:fs'
import {mkdir} from 'node:fs/promises'
import {dirname} from 'node:path'
import type {Cookie,Session} from 'electron'
import type {PlatformEncryption} from '../integrations/vault'
import {atomicWrite} from '../integrations/store'
import {normalizeResearchLinkUrl} from './research-link-frame'

type SavedCookie={cookie:Cookie; touched:number}
const cookieKey=(c:Cookie)=>JSON.stringify([c.domain,c.path,c.name])
const MAX_AGE=30*24*60*60*1000,MAX_COOKIES=512
function validCookie(c:Cookie):boolean {
  return !!c&&c.session===true&&typeof c.domain==='string'&&/^\.?[a-z0-9.-]+$/i.test(c.domain)&&
    typeof c.path==='string'&&c.path.startsWith('/')&&c.path.length<=4096&&
    typeof c.name==='string'&&c.name.length<=4096&&typeof c.value==='string'&&c.value.length<=8192&&
    typeof c.secure==='boolean'&&typeof c.httpOnly==='boolean'&&typeof c.hostOnly==='boolean'&&
    ['unspecified','no_restriction','lax','strict'].includes(c.sameSite)
}

// Chromium persist: partitions retain persistent cookies, not session cookies.
// Restore only this research browser's own session cookies, encrypted locally,
// with their original host/path/security attributes and no invented expiry.
export class ResearchWebSessionPersistence {
  private saved=new Map<string,SavedCookie>()
  private hosts=new Set<string>()
  private queue:Promise<unknown>=Promise.resolve()
  private writable=true
  private revision=0
  private captures=new Set<Promise<void>>()
  readonly ready:Promise<void>
  constructor(private session:Session,private file:string,private encryption:PlatformEncryption,private now=Date.now) {
    if(encryption.isEncryptionAvailable())try {
      const rows:unknown=JSON.parse(encryption.decryptString(readFileSync(file)))
      if(!Array.isArray(rows)||rows.length>MAX_COOKIES)throw Error('Invalid browser session store')
      for(const row of rows as SavedCookie[]) {
        if(!validCookie(row?.cookie)||!Number.isFinite(row.touched))throw Error('Invalid browser session cookie')
        if(now()-row.touched<MAX_AGE)this.saved.set(cookieKey(row.cookie),row)
      }
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')this.writable=false}
    this.ready=this.restore().then(()=>{
      session.cookies.on('changed',(_event,cookie,cause,removed)=>{
        this.revision++
        if(removed&&cause==='overwrite')return
        const key=cookieKey(cookie)
        if(removed||!cookie.session){if(this.saved.delete(key))this.persist();return}
        if(this.belongs(cookie))this.remember(cookie)
      })
    })
  }
  private belongs(c:Cookie):boolean {
    const domain=c.domain?.replace(/^\./,'');if(!domain)return false
    return [...this.hosts].some(host=>c.hostOnly?host===domain:host===domain||host.endsWith('.'+domain))
  }
  private async restore():Promise<void> {
    const present=new Set((await this.session.cookies.get({})).map(cookieKey))
    await Promise.allSettled([...this.saved].filter(([key])=>!present.has(key)).map(([, {cookie:c}])=>
      this.session.cookies.set({url:(c.secure?'https://':'http://')+c.domain!.replace(/^\./,'')+c.path,
        name:c.name,value:c.value,path:c.path,secure:c.secure,httpOnly:c.httpOnly,sameSite:c.sameSite,
        ...(c.hostOnly?{}:{domain:c.domain})})))
  }
  track(url:string):void {
    const normalized=normalizeResearchLinkUrl(url);if(!normalized)return
    const host=new URL(normalized).hostname;if(this.hosts.has(host))return
    this.hosts.add(host)
    const revision=this.revision
    const capture=this.ready.then(()=>this.session.cookies.get({url:normalized,session:true})).then(cookies=>{
      if(revision!==this.revision)return
      for(const cookie of cookies)if(this.belongs(cookie))this.remember(cookie)
    }).catch(()=>{})
    this.captures.add(capture);void capture.finally(()=>this.captures.delete(capture))
  }
  private remember(cookie:Cookie):void {
    if(!validCookie(cookie))return
    const key=cookieKey(cookie),old=this.saved.get(key)
    if(old&&JSON.stringify(old.cookie)===JSON.stringify(cookie))return
    this.saved.delete(key);this.saved.set(key,{cookie,touched:this.now()})
    while(this.saved.size>MAX_COOKIES)this.saved.delete(this.saved.keys().next().value!)
    this.persist()
  }
  private persist():void {
    if(!this.writable||!this.encryption.isEncryptionAvailable())return
    const contents=this.encryption.encryptString(JSON.stringify([...this.saved.values()]))
    this.queue=this.queue.catch(()=>{}).then(async()=>{await mkdir(dirname(this.file),{recursive:true,mode:0o700});await atomicWrite(this.file,contents)})
    void this.queue.catch(()=>{})
  }
  async flush():Promise<void> {await this.ready;await Promise.all(this.captures);await this.queue;await this.session.cookies.flushStore()}
}
