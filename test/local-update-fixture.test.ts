import { afterEach, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { request } from 'node:http'
let child: ChildProcess | undefined
async function launch(scenario: string) {
  child=spawn(process.execPath,[resolve('scripts/local-update-check-fixture.mjs'),'--port=0','--current-version=0.9.5',`--scenario=${scenario}`],{stdio:['ignore','pipe','pipe']})
  let output=''
  return new Promise<string>((accept,reject)=>{
    child!.stdout!.on('data',chunk=>{output+=chunk;const line=output.split('\n').find(s=>s.startsWith('{'));if(line){try{accept(JSON.parse(line).origin)}catch{}}})
    child!.stderr!.on('data',chunk=>reject(Error(String(chunk))))
    child!.on('exit',code=>reject(Error(`fixture exited ${code}`)))
  })
}
const get=(url:string)=>new Promise<{code:number;body:string}>( (accept,reject)=>{request(url,r=>{let body='';r.on('data',c=>body+=c);r.on('end',()=>accept({code:r.statusCode!,body}))}).on('error',reject).end()})
afterEach(async()=>{if(child && child.exitCode===null){child.kill();await once(child,'exit')}child=undefined})
it.each([['available','0.9.6'],['up-to-date','0.9.5']])('serves fixed %s metadata and refuses artifact/proxy paths',async(scenario,version)=>{
 const origin=await launch(scenario!);expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
 const r=await get(origin+'/latest-mac.yml?noCache=1');expect(r.code).toBe(200);expect(r.body).toContain(`version: ${version}`)
 expect((await get(origin+'/acceptance-unavailable.zip')).code).toBe(404)
 expect((await get(origin+'/https://example.invalid')).code).toBe(404)
})
it('returns a fixed local check failure without external retrieval',async()=>{const origin=await launch('error');const r=await get(origin+'/latest.yml');expect(r).toEqual({code:503,body:'Local acceptance update check failure.\n'})})
