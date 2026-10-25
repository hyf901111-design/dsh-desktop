import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Session} from '@deepseek-ai/dsh-session'
import {afterEach,expect,it,vi} from 'vitest'
import {createHomeNotesRuntime} from '../packages/dsh-research-task-runtime/home-notes-runtime.js'
import {HOME_NOTES_TASK_PROMPT,HOME_NOTES_REWRITE_PROMPT,HOME_NOTES_GUIDE_SELECTION,HOME_NOTES_TASK_RESULT,HOME_NOTES_REWRITE_RESULT} from '../packages/dsh-research-task-runtime/home-notes-guide-contract.js'
import {noteConversationRows,recordNoteConversation} from '../packages/dsh-research-task-runtime/notes-session.js'
const releases=[]
afterEach(async()=>{vi.useRealTimers();for(const off of releases.splice(0))await off()})
async function fixture(title='AI 护航研究笔记示例（演示案例）'){
 const root=await realpath(await mkdtemp(join(tmpdir(),'home-notes-runtime-'))),cwd=join(root,'note');await mkdir(cwd)
 await writeFile(join(root,'research-board-directories.json'),JSON.stringify({note:{sessionId:'note-session',path:cwd,title}}))
 const session=Session.create('note-session',undefined,{version:0,id:'note-session',createdAt:Date.now(),cwd}),agent={id:session.id,session,status:'idle'}
 const runtime=createHomeNotesRuntime({sessions:{get:id=>id===session.id?session:undefined},agents:{get:id=>id===session.id?agent:undefined}},{env:{DSH_HOME:root}})
 releases.push(async()=>{await runtime.dispose();await rm(root,{recursive:true,force:true})})
 const run={sessionId:session.id,runId:'note-run',cwd,fresh:true},input={sessionId:session.id,requestId:'task-1',prompt:HOME_NOTES_TASK_PROMPT,title:'研究笔记',markdown:'收入从120亿元增至132亿元，同比增长10%。',selection:'',context:{scope:'note',components:[]},images:[],mode:'write'}
 return{root,cwd,session,agent,runtime,run,input}
}
it.each(['AI 护航研究笔记示例','AI 护航研究笔记示例 · 练习副本','AI 护航研究笔记示例（演示案例）','AI 护航研究笔记示例 · 练习副本（演示案例）'])('prepares the registered native note session titled %s',async title=>{
 const f=await fixture(title)
 expect(await f.runtime.prepare(f.run)).toEqual({prompts:{note:HOME_NOTES_TASK_PROMPT,selection:HOME_NOTES_REWRITE_PROMPT}})
 expect(noteConversationRows(f.session)).toEqual([])
})
it('refuses a renamed note session before recording a task',async()=>{
 const f=await fixture('AI 护航研究笔记示例（演示案例） · 练习副本')
 await expect(f.runtime.prepare(f.run)).rejects.toThrow('尚未登记')
 expect(noteConversationRows(f.session)).toEqual([])
})
it('records two genuine native note tasks and restores their ready/adopted history without creating agent turns',async()=>{
 const f=await fixture();await f.runtime.prepare(f.run);await f.runtime.playback({...f.run,playing:true});vi.useFakeTimers()
 const progress=[],first=f.runtime.generate({...f.run,input:f.input},undefined,value=>progress.push(value));await vi.advanceTimersByTimeAsync(20000)
 expect(await first).toEqual({kind:'text',markdown:HOME_NOTES_TASK_RESULT});expect(await f.runtime.generate({...f.run,input:f.input})).toEqual(await first)
 expect(noteConversationRows(f.session)).toHaveLength(1);expect(progress.some(value=>value.stage==='thinking')).toBe(true);expect(progress.some(value=>value.stage==='writing'&&value.outputChars>0)).toBe(true)
 recordNoteConversation(f.session,{requestId:'task-1',phase:'accepted',finishedAt:Date.now()})
 const second=f.runtime.generate({...f.run,input:{...f.input,requestId:'task-2',prompt:HOME_NOTES_REWRITE_PROMPT,title:'',markdown:'',selection:HOME_NOTES_GUIDE_SELECTION,context:{scope:'selection',components:[]}}});await vi.advanceTimersByTimeAsync(20000)
 expect(await second).toEqual({kind:'text',markdown:HOME_NOTES_REWRITE_RESULT})
 const path=join(f.root,'history.json');await writeFile(path,JSON.stringify({header:f.session.header,events:f.session.events}));const disk=JSON.parse(await readFile(path,'utf8')),restored=Session.fromRestore('note-session',disk.events,disk.header)
 expect(noteConversationRows(restored).map(row=>row.phase)).toEqual(['accepted','ready'])
 expect(noteConversationRows(restored)[1].references).toEqual([{blockId:'text-selection',type:'text',title:HOME_NOTES_GUIDE_SELECTION}])
 expect(noteConversationRows(restored).every(row=>row.homeGuide?.localPresetOnly===true)).toBe(true)
 expect(restored.events.some(event=>['turn/start','assistant/message'].includes(event.type))).toBe(false)
})
it('rejects unregistered sessions, unrelated prompts and mismatched selections before recording a task',async()=>{
 const f=await fixture();await expect(f.runtime.prepare({...f.run,cwd:f.root})).rejects.toThrow()
 await f.runtime.prepare(f.run)
 for(const input of [{...f.input,sessionId:'other'},{...f.input,prompt:'操作其他笔记'},{...f.input,selection:'用户的新内容'},{...f.input,context:{scope:'none',components:[]}}])await expect(f.runtime.generate({...f.run,input})).rejects.toThrow()
 expect(noteConversationRows(f.session)).toEqual([])
})
it('refuses a supposedly fresh session that already contains prior note activity',async()=>{
 const f=await fixture();f.session.append('workspace-note/edited',{automatic:false,lastAutoSeq:-1,lastAutoTitle:''})
 await expect(f.runtime.prepare(f.run)).rejects.toThrow('独立')
 expect(noteConversationRows(f.session)).toEqual([])
})
it('keeps paused work pending and records cancellation without a ready result',async()=>{
 const f=await fixture();await f.runtime.prepare(f.run);vi.useFakeTimers();const abort=new AbortController()
 const result=f.runtime.generate({...f.run,input:f.input},abort.signal).catch(error=>error.name)
 await vi.advanceTimersByTimeAsync(120000);expect(noteConversationRows(f.session)[0]?.phase).toBe('preparing')
 await f.runtime.playback({...f.run,playing:true});await vi.advanceTimersByTimeAsync(300);abort.abort();await vi.advanceTimersByTimeAsync(0)
 expect(await result).toBe('AbortError');expect(noteConversationRows(f.session)[0]?.phase).toBe('stopped');expect(noteConversationRows(f.session)[0]?.result).toBeUndefined()
})
