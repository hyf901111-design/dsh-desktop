import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { createSourceFile, forEachChild, isFunctionDeclaration, ScriptTarget } from 'typescript'
import { patchNoteSessionHost, patchNoteSessionCatalog } from '../scripts/lib/notes-session.mjs'
import {expect,it} from 'vitest'
import {registerImageSessionTitle} from '../packages/dsh-research-task-runtime/image-session-title.js'

const id='image-task-376490e6-b80f-404a-8f8c-f08413deb659'
function host(flush = async () => true) {
 const session={id,events:[],header:{},append(type,data){this.events.push({type,data})}}
 let handler,owned=true
 registerImageSessionTitle({sessions:{get:key=>key===id?session:undefined,flush},webServer:{register:r=>{handler=r.handler}}},
  {isTrustedRequest:r=>r.trusted,readJsonBody:async r=>r.body,readTitleEvidence:async()=>({owned,tabTitle:'主动有章法'})})
 const send=async(kind,title,opt={})=>{
  let status,body
  await handler({method:'POST',trusted:true,body:{sessionId:id,kind,title,...opt.body},...opt.req},
   {writeHead(code){status=code},end(value){body=JSON.parse(value)}})
  return {status,...body}
 }
 return {session,send,revoke:()=>{owned=false}}
}
it('seeds only the matching personal image tab and preserves existing and manually set names',async()=>{
 const {session,send,revoke}=host()
 expect((await send('blank','新图像',{req:{trusted:false}})).status).toBe(403)
 expect((await send('template','其他页签的名称')).status).toBe(409)
 expect((await send('blank','新图像',{body:{sessionId:'other'}})).status).toBe(400)
 expect(await send('blank','新图像')).toMatchObject({automatic:true})
 expect(await send('template','主动有章法')).toMatchObject({automatic:true})
 expect(await send('template','主动有章法')).toMatchObject({automatic:false})
 expect(session.events.at(-1).data).toEqual({title:'主动有章法',messageSeqs:[],source:{kind:'fallback'}})
 session.append('session/title',{title:'投委会自定名称',messageSeqs:[],source:{kind:'user'}})
 expect(await send('template','主动有章法')).toMatchObject({automatic:false})
 revoke()
 expect((await send('template','主动有章法')).status).toBe(409)
 expect(session.events.at(-1).data.title).toBe('投委会自定名称')
})
it('does not rewrite a prior topic or an already admitted human discussion',async()=>{
 const {session,send}=host()
 session.append('user/message',{source:{kind:'user',clientMode:'image'}})
 expect(await send('template','主动有章法')).toMatchObject({automatic:false})
 expect(session.events.filter(event=>event.type==='session/title')).toHaveLength(0)
 session.events.splice(0,1,{type:'workspace-research/title-context',data:{}})
 expect(await send('blank','新图像')).toMatchObject({automatic:false})
})

it('keeps a template-only session visible in native history after a switch and replay', async () => {
 const hostSource = patchNoteSessionHost(await readFile('node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js', 'utf8'))
 const sidebarSource = await readFile('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js', 'utf8')
 const names = ['sessionBlank', 'applySessionListMetadata', 'sessionListMetadata', 'sessionVisible']
 const functions = []
 for (const source of [hostSource, sidebarSource]) {
  const file = createSourceFile('sdk.js', source, ScriptTarget.Latest)
  function visit(node) {
   if (isFunctionDeclaration(node) && names.includes(node.name?.text)) functions.push(node.getText(file))
   forEachChild(node, visit)
  }
  visit(file)
 }
 const api = runInNewContext(functions.join('\n') + ';({sessionBlank,sessionListMetadata,sessionVisible})',
  { researchSessionEngaged: () => false })
 const {session, send} = host()
 const visibleAfterSwitch = events => api.sessionVisible({id, blank:api.sessionListMetadata(events).blank}, 'other', new Set())
 await send('blank', '新图像')
 expect(visibleAfterSwitch(session.events)).toBe(false)
 await send('template', '主动有章法')
 const replay = structuredClone(session.events)
 expect(visibleAfterSwitch(replay)).toBe(true)
 expect(api.sessionBlank({events:replay})).toBe(false)
 const catalog = patchNoteSessionCatalog(await readFile('node_modules/@deepseek-ai/dsh-session/lib/types/known-event-types.js', 'utf8'))
 const {KNOWN_SESSION_EVENT_TYPES} = await import('data:text/javascript,' + encodeURIComponent(catalog))
 expect(replay.every(event => KNOWN_SESSION_EVENT_TYPES.has(event.type))).toBe(true)
 await send('template', '主动有章法')
 expect(session.events).toEqual(replay)
})

it('retries a failed template flush without duplicating activity or replacing a manual title', async () => {
 let saved = false
 const {session, send} = host(async () => saved)
 session.append('session/title', {title:'我命名的画板', source:{kind:'user'}})
 expect((await send('template', '主动有章法')).status).toBe(503)
 saved = true
 expect(await send('template', '主动有章法')).toMatchObject({status:200, automatic:false})
 expect(session.events.map(event => event.type)).toEqual(['session/title', 'workspace-image/edited'])
 expect(session.events[0].data.title).toBe('我命名的画板')
})
