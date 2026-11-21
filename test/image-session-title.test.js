import {expect,it} from 'vitest'
import {registerImageSessionTitle} from '../packages/dsh-research-task-runtime/image-session-title.js'

const id='image-task-376490e6-b80f-404a-8f8c-f08413deb659'
function host() {
 const session={id,events:[],header:{},append(type,data){this.events.push({type,data})}}
 let handler,owned=true
 registerImageSessionTitle({sessions:{get:key=>key===id?session:undefined,flush:async()=>true},webServer:{register:r=>{handler=r.handler}}},
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
 expect(session.events).toHaveLength(1)
 session.events.splice(0,1,{type:'workspace-research/title-context',data:{}})
 expect(await send('blank','新图像')).toMatchObject({automatic:false})
})
