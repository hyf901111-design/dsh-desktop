import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {expect,it,vi} from 'vitest'
import {presentationHostFixture} from './fixtures/home-presentation-host.js'
import {HOME_NOTES_PATH} from '../packages/dsh-research-task-runtime/home-notes-runtime.js'
import {HOME_NOTES_CHART_PROMPT,HOME_NOTES_TASK_PROMPT,HOME_NOTES_REWRITE_PROMPT,HOME_NOTES_GUIDE_SELECTION,HOME_NOTES_REWRITE_RESULT,HOME_NOTES_TASK_RESULT} from '../packages/dsh-research-task-runtime/home-notes-guide-contract.js'
import {HOME_NOTES_GUIDE_WRITING_STAGES} from '../src/preload/home-guide-notes-data'
import {noteConversationRows,recordNoteConversation} from '../packages/dsh-research-task-runtime/notes-session.js'
async function fixture(){
 const f=await presentationHostFixture(),origin='http://127.0.0.1:'+f.ctx.webServer.port
 await writeFile(join(f.home,'research-board-directories.json'),JSON.stringify({note:{sessionId:'demo',path:f.cwd,title:'AI 护航研究笔记示例'}}))
 const run={sessionId:'demo',runId:'native-note-run',cwd:f.cwd,fresh:true}
 const post=(action,extra={},control={})=>fetch(origin+HOME_NOTES_PATH,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({...run,action,...extra}),...control})
 const input={sessionId:'demo',requestId:'native-note-request',prompt:HOME_NOTES_CHART_PROMPT,entryPoint:'inline',insertionAnchor:{documentId:'client',blockId:'chart-line',position:{item:{client:1,clock:2}}},title:'研究笔记',markdown:HOME_NOTES_GUIDE_WRITING_STAGES[0].map(block=>block.content).join('\n'),selection:'',context:{scope:'note',components:[]},images:[],mode:'write'}
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

it('accepts the real editor composer entry for paragraph rewrite and normal summary through the registered Host route',async()=>{
 const f=await fixture(),read=async input=>{const response=await f.post('generate',{input});expect(response.status).toBe(200);return(await response.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1)}
 try{
  await f.post('prepare');await f.post('playback',{playing:true})
  const chart=await read(f.input);expect(chart.type).toBe('result')
  recordNoteConversation(f.agent.session,{requestId:f.input.requestId,phase:'accepted',finishedAt:Date.now()})
  // NotesApp.generate now always supplies this entry marker for non-inline work.
  const rewrite={...f.input,requestId:'native-rewrite',entryPoint:'composer',insertionAnchor:undefined,prompt:HOME_NOTES_REWRITE_PROMPT,title:'',markdown:'',selection:HOME_NOTES_GUIDE_SELECTION,context:{scope:'selection',components:[]}}
  const rejected=await read({...rewrite,selection:HOME_NOTES_GUIDE_SELECTION+' foreign change'});expect(rejected).toMatchObject({type:'error',message:'示例需求或引用内容已变化，请重新播放。'})
  expect(noteConversationRows(f.agent.session)).toHaveLength(1)
  expect(await read(rewrite)).toEqual({type:'result',result:{kind:'text',markdown:HOME_NOTES_REWRITE_RESULT}})
  recordNoteConversation(f.agent.session,{requestId:rewrite.requestId,phase:'accepted',finishedAt:Date.now()})
  const refs=[{blockId:'chart-block',type:'research',title:'一年股价与基准表现',content:JSON.stringify({spec:chart.result.node.containerSpec})},{blockId:'quote-block',type:'research',title:'行情面板',content:JSON.stringify({spec:{version:1,type:'financial-widget',widget:'quote',title:'行情面板',symbols:[{code:'300308',market:'SZ',name:'中际旭创'}],period:'1d',adjustment:'none',indicators:['MA','VOL','MACD'],market:'all',query:''}})}]
  const summary={...rewrite,requestId:'native-summary',prompt:HOME_NOTES_TASK_PROMPT,selection:'',markdown:'环比增长14.29%；经营现金流净额18.00亿元，同比下降44.08%。不把单期业绩或历史涨幅当作确定性依据。沪深300同期下跌10.88%。',context:{scope:'note',components:refs}}
  expect(await read(summary)).toEqual({type:'result',result:{kind:'text',markdown:HOME_NOTES_TASK_RESULT}})
  await f.ctx.sessions.flush(f.agent.session)
  const persisted=await f.ctx.sessionPersistence.inspect('demo')
  expect(noteConversationRows({events:persisted.events}).map(row=>row.phase)).toEqual(['accepted','accepted','ready'])
  expect(f.outside).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.dispose()}
},45000)
