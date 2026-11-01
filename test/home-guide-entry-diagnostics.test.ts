import {expect,it} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {HOME_GUIDE_ENTRY_DIAGNOSTIC_PREFIX as prefix,HOME_GUIDE_ENTRY_DENIALS,parseHomeGuideEntryDiagnostic} from '../src/shared/home-guide-entry-diagnostics'
import {createHomeGuideEntryDiagnosticLog,recordHomeGuideEntryConsoleMessage} from '../src/main/state/home-guide-entry-diagnostics'
const row={version:1,at:100,runId:'run-123',sessionId:'session-123',kind:'board',phase:'cancel',reason:'input'},message=(value:unknown)=>prefix+JSON.stringify(value)
it('records only closed entry metadata from the trusted main frame without drafts, tokens or raw errors',()=>{
 const rows:string[]=[],log={write:(text:string)=>{if(!parseHomeGuideEntryDiagnostic(text))return false;rows.push(text);return true}}
 for(const reason of HOME_GUIDE_ENTRY_DENIALS)expect(recordHomeGuideEntryConsoleMessage(log,{level:'info',message:message({...row,reason})},true)).toBe(true)
 for(const value of [{...row,draft:'private'},{...row,token:'secret'},{...row,error:'private'},{...row,reason:'private text'},{...row,phase:'foreign'},{...row,runId:'https://private.test'},{...row,sessionId:'private title'},{...row,at:-1},{...row,version:2},null,[]])expect(parseHomeGuideEntryDiagnostic(message(value))).toBeNull()
 expect(recordHomeGuideEntryConsoleMessage(log,{level:'info',message:message(row)},false)).toBe(false);expect(recordHomeGuideEntryConsoleMessage(log,{level:'warning',message:message(row)},true)).toBe(false)
 expect(parseHomeGuideEntryDiagnostic(prefix+'x'.repeat(513))).toBeNull();expect(rows).toHaveLength(HOME_GUIDE_ENTRY_DENIALS.length)
})
it('writes bounded local JSONL and tolerates unavailable diagnostics storage',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'entry-diagnostics-'));try{const log=createHomeGuideEntryDiagnosticLog(directory,{maxBytes:2048});for(let round=0;round<3;round++){for(let i=0;i<30;i++)log.write(message({...row,at:round*30+i}));await log.flush()}for(const name of ['home-guide-entry.jsonl','home-guide-entry.previous.jsonl']){const text=await readFile(join(directory,name),'utf8');expect(Buffer.byteLength(text)).toBeLessThanOrEqual(2048);expect(text.trim().split('\n').every(line=>parseHomeGuideEntryDiagnostic(prefix+line))).toBe(true)}const unavailable=createHomeGuideEntryDiagnosticLog('/dev/null/missing');expect(unavailable.write(message(row))).toBe(true);await expect(unavailable.flush()).resolves.toBeUndefined()}finally{await rm(directory,{recursive:true,force:true})}
})
