import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect,it} from 'vitest'
import {NOTES_GUIDE_DIAGNOSTIC_PREFIX as prefix,parseNotesGuideDiagnostic,notesGuideFailureReason} from '../src/shared/notes-guide-diagnostics'
import {createNotesGuideDiagnosticLog,recordNotesGuideConsoleMessage} from '../src/main/state/notes-guide-diagnostics'
const row={version:1,at:100,runId:'run-123',sessionId:'session-123',step:'note-rewrite',phase:'step-fail',reason:'target-not-ready',errorName:'Error'}
const message=(value:unknown)=>prefix+JSON.stringify(value)

it('admits only trusted main-frame closed metadata and rejects prose, draft, unknown fields and old raw warning payloads',()=>{
 const rows:string[]=[],log={write:(value:string)=>{const valid=parseNotesGuideDiagnostic(value);if(valid)rows.push(JSON.stringify(valid));return !!valid}}
 expect(recordNotesGuideConsoleMessage(log,{level:'info',message:message(row)},true)).toBe(true)
 for(const value of [{...row,prompt:'private draft'},{...row,message:'private note'},{...row,step:'private paragraph'},{...row,reason:'private error'},{...row,runId:'https://private.test'},{...row,sessionId:'private title with spaces'},{...row,at:-1},{...row,phase:'unknown'},{...row,errorName:'private'},{...row,version:2},{runId:'run-123',sessionId:'session-123',step:'note-rewrite',errorName:'Error',message:'old raw note error'}])expect(recordNotesGuideConsoleMessage(log,{level:'info',message:message(value)},true)).toBe(false)
 expect(recordNotesGuideConsoleMessage(log,{level:'warning',message:message(row)},true)).toBe(false)
 expect(recordNotesGuideConsoleMessage(log,{level:'info',message:message(row)},false)).toBe(false)
 expect(parseNotesGuideDiagnostic(prefix+'{')).toBeNull();expect(parseNotesGuideDiagnostic(prefix+'x'.repeat(769))).toBeNull()
 expect(parseNotesGuideDiagnostic(message({...row,phase:'guard-rejected',reason:'composer-occurrences-present',imageCount:0,occurrenceCount:1}))).not.toBeNull()
 for(const occurrenceCount of [-1,1001,1.5,'private'])expect(parseNotesGuideDiagnostic(message({...row,occurrenceCount}))).toBeNull()
 expect(rows).toEqual([JSON.stringify(row)])
 expect(notesGuideFailureReason(Error('演示选区未完成，请重新播放。'))).toBe('selection-changed')
 expect(notesGuideFailureReason(Error('private content'))).toBe('operation-failed')
 expect(notesGuideFailureReason(Error('输入内容已变化，已保留用户草稿。'))).toBe('native-input-changed')
 expect(notesGuideFailureReason(Error('原生笔记输入框尚未就绪。'))).toBe('target-not-ready')
})

it('persists only bounded sanitized metadata with rotation and never blocks playback on unavailable logs',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'notes-guide-diagnostics-'))
 try{
  const log=createNotesGuideDiagnosticLog(directory,{maxBytes:2048})
  for(let batch=0;batch<4;batch++){for(let i=0;i<64;i++)log.write(message({...row,at:batch*100+i}));await log.flush()}
  for(const name of ['notes-guide.jsonl','notes-guide.previous.jsonl']){const text=await readFile(join(directory,name),'utf8');expect(Buffer.byteLength(text)).toBeLessThanOrEqual(2048);expect(text.trim().split('\n').every(line=>parseNotesGuideDiagnostic(prefix+line))).toBe(true)}
  const unavailable=createNotesGuideDiagnosticLog('/dev/null/not-a-directory');expect(unavailable.write(message(row))).toBe(true);await expect(unavailable.flush()).resolves.toBeUndefined()
 }finally{await rm(directory,{recursive:true,force:true})}
})
