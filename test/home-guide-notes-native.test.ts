// @vitest-environment happy-dom
import {afterEach,expect,test} from 'vitest'
import {createHomeNotesNativeBridge} from '../src/preload/home-guide-notes-native'
const releases:Array<()=>void>=[]
afterEach(()=>{for(const off of releases.splice(0))off();document.body.innerHTML=''})
function fixture(){
 const host=document.createElement('div');host.id='note-native-host';document.body.append(host)
 const scope=new AbortController(),requests:any[]=[]
 let answer:(detail:any)=>void=detail=>reply(detail,{})
 const reply=(detail:any,result:any)=>window.dispatchEvent(new CustomEvent('sherlock:home-guide-notes-native-reply',{detail:{requestId:detail.requestId,runId:detail.runId,sessionId:detail.sessionId,ok:true,result}}))
 const receive=(event:Event)=>{const detail=(event as CustomEvent).detail;requests.push(detail);if(detail.command!=='dispose')answer(detail)}
 window.addEventListener('sherlock:home-guide-notes-native-request',receive);releases.push(()=>window.removeEventListener('sherlock:home-guide-notes-native-request',receive))
 return{host,scope,requests,reply,setAnswer:(fn:typeof answer)=>{answer=fn},options:{sessionId:'note-session',runId:'note-run',cwd:'/tmp/note-example',fresh:true,signal:scope.signal}}
}
test('uses correlated pure data commands for the real native note input and generation',async()=>{
 const f=fixture(),bridge=await createHomeNotesNativeBridge(document,f.host,f.options);releases.push(bridge.dispose)
 await bridge.configureQuote();await bridge.type('note');f.setAnswer(detail=>f.reply(detail,{kind:'text',markdown:'研究摘要'}))
 expect(await bridge.generate({sessionId:'note-session',requestId:'generation-1',prompt:'需求'})).toEqual({kind:'text',markdown:'研究摘要'})
 expect(f.requests.map(value=>value.command)).toEqual(['mount','configure-quote','type','generate'])
 expect(f.requests[2]).toMatchObject({stage:'note',sessionId:'note-session',runId:'note-run',hostId:'note-native-host'})
 expect(JSON.parse(JSON.stringify(f.requests))).toEqual(f.requests)
 bridge.dispose();bridge.dispose();expect(f.requests.filter(value=>value.command==='dispose')).toHaveLength(1)
})
test('ignores another run or session acknowledgement before accepting its own native reply',async()=>{
 const f=fixture(),bridge=await createHomeNotesNativeBridge(document,f.host,f.options);releases.push(bridge.dispose)
 let pending:any,finished=false;f.setAnswer(detail=>{pending=detail})
 const typing=bridge.type('selection').then(()=>{finished=true})
 for(const other of [{...pending,runId:'other-run'},{...pending,sessionId:'other-session'}])f.reply(other,{})
 await Promise.resolve();expect(finished).toBe(false)
 f.reply(pending,{});await typing;expect(finished).toBe(true)
})
test('cancels a pending native command without accepting a late reply or dispatching more writes',async()=>{
 const f=fixture(),bridge=await createHomeNotesNativeBridge(document,f.host,f.options);releases.push(bridge.dispose)
 let pending:any;f.setAnswer(detail=>{pending=detail})
 const typing=bridge.type('note').catch(error=>error.name);f.scope.abort()
 expect(await typing).toBe('AbortError');f.reply(pending,{})
 await expect(bridge.type('selection')).rejects.toMatchObject({name:'AbortError'})
 expect(f.requests.map(value=>value.command)).toEqual(['mount','type','dispose'])
})
