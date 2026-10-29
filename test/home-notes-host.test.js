import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {expect,it,vi} from 'vitest'
import {presentationHostFixture} from './fixtures/home-presentation-host.js'
import {HOME_NOTES_PATH} from '../packages/dsh-research-task-runtime/home-notes-runtime.js'
import {HOME_NOTES_CHART_PROMPT} from '../packages/dsh-research-task-runtime/home-notes-guide-contract.js'
import {noteConversationRows} from '../packages/dsh-research-task-runtime/notes-session.js'
async function fixture(){
 const f=await presentationHostFixture(),origin='http://127.0.0.1:'+f.ctx.webServer.port
 await writeFile(join(f.home,'research-board-directories.json'),JSON.stringify({note:{sessionId:'demo',path:f.cwd,title:'AI 护航研究笔记示例'}}))
 const run={sessionId:'demo',runId:'native-note-run',cwd:f.cwd,fresh:true}
 const post=(action,extra={},control={})=>fetch(origin+HOME_NOTES_PATH,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({...run,action,...extra}),...control})
 const input={sessionId:'demo',requestId:'native-note-request',prompt:HOME_NOTES_CHART_PROMPT,entryPoint:'inline',insertionAnchor:{documentId:'client',blockId:'chart-line',position:{item:{client:1,clock:2}}},title:'研究笔记',markdown:'收入由120亿元增至132亿元，同比增长10%。',selection:'',context:{scope:'note',components:[]},images:[],mode:'write'}
 return{...f,origin,run,post,input}
}
it('uses the real registered Host route and JSONL note history without changing the ordinary model or PPT assets',async()=>{
 const f=await fixture()
 try{
  expect((await f.post('prepare')).status).toBe(200);await f.post('playback',{playing:true})
  const response=await f.post('generate',{input:f.input}),stream=(await response.text()).trim().split('\n').map(line=>JSON.parse(line))
  expect(stream.some(value=>value.type==='progress'&&value.progress.stage==='writing')).toBe(true)
  expect(stream.at(-1)).toMatchObject({type:'result',result:{kind:'component',node:{id:'home-note-chart-native-note-run',containerSpec:{type:'html'}}}})
  await f.ctx.sessions.flush(f.agent.session)
  const persisted=await f.ctx.sessionPersistence.inspect('demo')
  expect(persisted.events.filter(event=>event.type==='workspace-note/conversation').map(event=>event.data.phase)).toEqual(['preparing','ready'])
  expect(noteConversationRows(f.agent.session)[0].homeGuide).toMatchObject({localPresetOnly:true,provider:'home-notes-script'})
  expect((await f.request(f.api.sessions.models,{sessionId:'demo'})).current).toMatchObject({provider:'outside',model:'normal'})
  expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.dispose()}
},20000)
it('persists a stopped task when the actual HTTP consumer disconnects during the prepared reply',async()=>{
 const f=await fixture(),abort=new AbortController()
 try{
  await f.post('prepare');await f.post('playback',{playing:true})
  const response=await f.post('generate',{input:f.input},{signal:abort.signal}),reader=response.body.getReader()
  await reader.read();abort.abort();await reader.cancel().catch(()=>{})
  await vi.waitFor(()=>expect(noteConversationRows(f.agent.session)[0]?.phase).toBe('stopped'))
  expect(noteConversationRows(f.agent.session)[0]?.result).toBeUndefined();expect(f.outside).toEqual([])
 }finally{await f.dispose()}
},15000)
