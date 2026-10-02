import {readFileSync} from 'node:fs'
import {mkdir} from 'node:fs/promises'
import {dirname} from 'node:path'
import {atomicWrite} from '../integrations/store'
import type {PlatformEncryption} from '../integrations/vault'
import {normalizeResearchLinkUrl} from './research-link-frame'

type Navigation = {initialUrl:string; currentUrl:string; touched:number}
const MAX_ENTRIES=512, MAX_AGE=30*24*60*60*1000

// A mail login may rotate the SID in its URL without changing the card's link.
// Keep this browsing state private to the desktop, rather than copying session
// URLs to a shared board or persisting them as plaintext in the workspace.
export class ResearchWebNavigationStore {
  private entries=new Map<string,Navigation>()
  private queue:Promise<unknown>=Promise.resolve()
  private writable=true
  constructor(private file?:string,private encryption?:PlatformEncryption,private now=Date.now) {
    if(!file||!encryption?.isEncryptionAvailable())return
    try {
      const rows:unknown=JSON.parse(encryption.decryptString(readFileSync(file)))
      if(!Array.isArray(rows)||rows.length>MAX_ENTRIES)throw Error('Invalid navigation store')
      for(const row of rows) {
        if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||row[0].length>1024)throw Error('Invalid navigation entry')
        const v=row[1] as Navigation
        if(!v||normalizeResearchLinkUrl(v.initialUrl)!==v.initialUrl||!this.valid(v.initialUrl,v.currentUrl)||!Number.isFinite(v.touched))throw Error('Invalid navigation entry')
        if(this.now()-v.touched<MAX_AGE)this.entries.set(row[0],v)
      }
    } catch(error) {
      // Preserve an unreadable file; never replace it with an empty store.
      if((error as NodeJS.ErrnoException).code!=='ENOENT')this.writable=false
    }
  }
  private valid(initialUrl:string,currentUrl:string):boolean {
    if(normalizeResearchLinkUrl(currentUrl)!==currentUrl)return false
    const initial=new URL(initialUrl),current=new URL(currentUrl)
    return initial.origin===current.origin && !['code','access_token','id_token','oauth_token'].some(k=>current.searchParams.has(k))
  }
  restore(id:string,initialUrl:string):string {
    const entry=this.entries.get(id)
    return entry?.initialUrl===initialUrl&&this.now()-entry.touched<MAX_AGE&&this.valid(initialUrl,entry.currentUrl)?entry.currentUrl:initialUrl
  }
  remember(id:string,initialUrl:string,currentUrl:string):void {
    if(!this.valid(initialUrl,currentUrl))return
    const old=this.entries.get(id)
    if(old?.initialUrl===initialUrl&&old.currentUrl===currentUrl)return
    this.entries.delete(id);this.entries.set(id,{initialUrl,currentUrl,touched:this.now()})
    while(this.entries.size>MAX_ENTRIES)this.entries.delete(this.entries.keys().next().value!)
    this.persist()
  }
  forget(id:string):void {if(this.entries.delete(id))this.persist()}
  private persist():void {
    if(!this.file||!this.writable||!this.encryption?.isEncryptionAvailable())return
    const contents=this.encryption.encryptString(JSON.stringify([...this.entries]))
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      await mkdir(dirname(this.file!),{recursive:true,mode:0o700})
      await atomicWrite(this.file!,contents)
    })
    // No URL or session information should enter diagnostics on a write error.
    void this.queue.catch(()=>{})
  }
  async flush():Promise<void> {await this.queue}
}
