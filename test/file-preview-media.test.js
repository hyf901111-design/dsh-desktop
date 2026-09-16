import {readFileSync} from 'node:fs'
import {resolve,relative,basename} from 'node:path'
import {runInNewContext} from 'node:vm'
import {it,expect,vi} from 'vitest'
import {patchBetterSidebarServer} from '../scripts/lib/patch-sherlock-better-sidebar.mjs'
const source=patchBetterSidebarServer(readFileSync('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/index.js','utf8'))
const start=source.indexOf('handler: async (req, res) => {',source.indexOf('path: "/sidebar/file"'))
const end=source.indexOf('\n\t}), "dsh-better-sidebar: /sidebar/file media route"',start)
async function request(path){
 const readFile=vi.fn(async()=>Buffer.from('image bytes'))
 class SidebarError extends Error{constructor(code,message,status=400){super(message);this.status=status}}
 const handler=runInNewContext('('+source.slice(start+'handler: '.length,end).trim()+')',{
 URL,resolve,basename,SidebarError,ctx:{sessions:{get:()=>({})}},fence:()=>true,
 sessionCwdOf:()=>'/workspace/研究',isWithin:(cwd,p)=>!relative(cwd,p).startsWith('..'),
 sherlockSessionHasChatFile:()=>false,stat:async()=>({isFile:()=>true,size:11}),
 resolved:{mediaLimit:1024},mediaTypeForPath:()=> 'image/png',readFile,
 writeError:(res,e)=>{res.status=e.status;res.body=e.message}
 })
 const response={writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=body}}
 await handler({method:'GET',url:'/sidebar/file?'+new URLSearchParams({sessionId:'session',path})},response)
 return {response,readFile}
}
it.each(['frontrow-logo.svg.png','./frontrow-logo.svg.png','/workspace/研究/frontrow-logo.svg.png'])('serves session file %s',async path=>{
 const {response,readFile}=await request(path)
 expect(response.status).toBe(200);expect(readFile).toHaveBeenCalledWith('/workspace/研究/frontrow-logo.svg.png')
 expect(response.headers['content-type']).toBe('image/png')
})
it.each(['../outside.png','/outside.png'])('retains directory guard for %s',async path=>{
 const {response,readFile}=await request(path);expect(response.status).toBe(403);expect(readFile).not.toHaveBeenCalled()
})
it('patch is idempotent',()=>expect(patchBetterSidebarServer(source)).toBe(source))
