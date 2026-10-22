import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const load = () => import('../packages/dsh-research-task-runtime/notes-challenge-consensus.js')
const roots = []
afterEach(async () => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const row = { CONSEN_DATA_CYCLE_TYP:'263002000', S_INFO_WINDCODE:'600519.SH', EST_REPORT_DT:'20261231', EST_DT:'20261019', NUM_EST_INST:45, EPS_AVG:67.3481, EPS_MEDIAN:67.0908, EPS_MIN:64.7795, EPS_MAX:71.1026, EPS_DEV:1.6094 }
const input = { sessionId:'skill-session', blocks:[{id:'forecast',type:'paragraph',text:'600519.SH 报告基准日20261020。预计2026年EPS 76元。'}] }

async function fixture({ script, enabled = true, multiple = false } = {}) {
  const root = await mkdtemp(join(tmpdir(),'notes-infodb-skill-')); roots.push(root)
  await mkdir(join(root,'scripts'))
  const marker = join(root,'calls.jsonl')
  await writeFile(join(root,'SKILL.md'),'---\nname: infodb-skill-creator\n---\ninfo_db Oracle 数据查询，使用 scripts/connection.py 的 get_connection。')
  await writeFile(join(root,'scripts/connection.py'),script ?? `import json,os
from pathlib import Path
marker=Path(${JSON.stringify(marker)})
class Cursor:
 def execute(self,sql,*args,**kwargs):
  if sql=='SET TRANSACTION READ ONLY': self.readonly=True; return
  assert getattr(self,'readonly',False), 'must set read-only before SELECT'
  assert sql.lstrip().startswith('SELECT ') and 'TYDW_FILESYNC.ASHARECONSENSUSDATA' in sql
  with marker.open('a') as f: f.write(json.dumps({'sql':sql,'pid':os.getpid()})+'\\n')
  self.description=[(key,) for key in ${JSON.stringify(Object.keys(row))}]
 def fetchmany(self,n): return [list(${JSON.stringify(row)}.values())]
 def close(self): pass
class Connection:
 def cursor(self): return Cursor()
 def rollback(self): pass
 def close(self): pass
def get_connection():
 print('DO_NOT_FORWARD_CONFIG_OR_DRIVER_OUTPUT')
 return Connection()
`)
  const agent = { id:'skill-session', session:{ id:'skill-session', header:{cwd:root}, events:[] } }
  const candidate = { name:'ework-skill-infodb', provider:'ework-managed-skills', description:'infodb-skill-creator：info_db 数据读取', invocation:{modelInvocable:true,userInvocable:true}, resourceBase:{kind:'directory',path:root} }
  const state = { enabled, gets:0 }
  const ctx = { agents:{get:id=>id===agent.id?agent:undefined}, skills:{
    list: async options => { expect(options.scope).toBe(agent); return state.enabled ? [candidate,...multiple?[{...candidate,name:'second-infodb'}]:[]] : [] },
    get: async (name,options) => { expect(options.scope).toBe(agent); state.gets++; return state.enabled ? {...candidate,name,path:join(root,'SKILL.md'),content:await readFile(join(root,'SKILL.md'),'utf8')} : undefined }
  } }
  vi.stubEnv('EWORK_INFODB_PYTHON','/usr/bin/python3')
  return {root,marker,ctx,agent,state,candidate}
}

it('uses the enabled managed infodb connection script for a fixed read-only query and keeps driver output private', async () => {
  const f=await fixture(),{reviewNoteConsensus}=await load()
  const result=await reviewNoteConsensus(f.ctx,input,new AbortController().signal)
  expect(result.issues).toHaveLength(1)
  expect(result.issues[0].evidence[0].data).toMatchObject({source:'infodb',estDt:'20261019',rules:['C1','C3'],skillName:'ework-skill-infodb'})
  expect(JSON.stringify(result)).not.toContain('DO_NOT_FORWARD')
  const calls=(await readFile(f.marker,'utf8')).trim().split('\n').map(JSON.parse)
  expect(calls).toHaveLength(1)
  expect(calls[0].sql).toContain("S_INFO_WINDCODE = '600519.SH'")
  expect(calls[0].sql).toContain("EST_REPORT_DT = '20261231'")
  expect(calls[0].sql).toContain("EST_DT <= '20261020'")
  expect(f.state.gets).toBeGreaterThanOrEqual(2)
  expect(f.agent.session.events).toEqual([])
})

it.each(['disabled','unmanaged','ambiguous','dead-agent','wrong-script-path'])('does not execute the skill when %s',async kind=>{
  const f=await fixture({enabled:kind!=='disabled',multiple:kind==='ambiguous'})
  if(kind==='unmanaged')f.candidate.provider='custom'
  if(kind==='dead-agent')f.ctx.agents.get=()=>({...f.agent})
  if(kind==='wrong-script-path'){
    const outside=join(await mkdtemp(join(tmpdir(),'notes-infodb-outside-')),'connection.py'); roots.push(outside.slice(0,outside.lastIndexOf('/')))
    await writeFile(outside,'raise Exception("outside")')
    await rm(join(f.root,'scripts/connection.py'));await symlink(outside,join(f.root,'scripts/connection.py'))
  }
  const result=await (await load()).reviewNoteConsensus(f.ctx,input,new AbortController().signal)
  expect(result.issues).toEqual([]);expect(result.checks[0].status).toBe('unavailable')
  await expect(readFile(f.marker)).rejects.toMatchObject({code:'ENOENT'})
})

it('discards a completed read if the managed skill is disabled during the operation',async()=>{
  const f=await fixture(),get=f.ctx.skills.get
  f.ctx.skills.get=async(...args)=>{if(await readFile(f.marker).then(()=>true,()=>false)){f.state.enabled=false;return undefined}return get(...args)}
  const result=await (await load()).reviewNoteConsensus(f.ctx,input,new AbortController().signal)
  expect((await readFile(f.marker,'utf8')).length).toBeGreaterThan(0)
  expect(result.issues).toEqual([]);expect(result.checks[0].status).toBe('unavailable')
})

it('kills the connection process on cancellation and does not consume late rows',async()=>{
  const f=await fixture()
  await writeFile(join(f.root,'scripts/connection.py'),`import os,time\nfrom pathlib import Path\ndef get_connection():\n Path(${JSON.stringify(f.marker)}).write_text(str(os.getpid()))\n time.sleep(20)\n`)
  const controller=new AbortController(),pending=(await load()).reviewNoteConsensus(f.ctx,input,controller.signal)
  const settled=pending.then(value=>({value}),error=>({error}))
  await vi.waitFor(async()=>expect((await readFile(f.marker,'utf8')).length).toBeGreaterThan(0))
  const pid=Number(await readFile(f.marker,'utf8'));controller.abort(Error('cancel-test'))
  expect((await settled).error?.message).toBe('cancel-test')
  await vi.waitFor(()=>expect(()=>process.kill(pid,0)).toThrow())
})

it('never forwards exceptions that might contain connection credentials',async()=>{
  const f=await fixture({script:'def get_connection():\n raise RuntimeError("private-user:private-password@private-host")\n'})
  const result=await (await load()).reviewNoteConsensus(f.ctx,input,new AbortController().signal)
  expect(result.issues).toEqual([]);expect(result.checks[0].status).toBe('unavailable')
  expect(JSON.stringify(result)).not.toMatch(/private-user|private-password|private-host/)
})
it.each(['before-query','after-query'])('rechecks live agent identity after an asynchronous skill read %s',async phase=>{
  const f=await fixture(),get=f.ctx.skills.get
  f.ctx.skills.get=async(...args)=>{
    const definition=await get(...args)
    if(f.state.gets===(phase==='before-query'?2:3))f.ctx.agents.get=()=>undefined
    return definition
  }
  const result=await (await load()).reviewNoteConsensus(f.ctx,input,new AbortController().signal)
  expect(result.issues).toEqual([]);expect(result.checks[0].status).toBe('unavailable')
  if(phase==='before-query')await expect(readFile(f.marker)).rejects.toMatchObject({code:'ENOENT'})
  else expect((await readFile(f.marker,'utf8')).length).toBeGreaterThan(0)
})

it('reports only bounded source failure stages and driver codes for native diagnosis',async()=>{
  const f=await fixture({script:`class DriverError(Exception):\n pass\nclass Detail:\n full_code='ORA-12514'\n def __str__(self): return 'private-user:private-password@private-host'\ndef get_connection():\n raise DriverError(Detail())\n`}),warn=vi.spyOn(console,'warn').mockImplementation(()=>{})
  try{
    const result=await (await load()).reviewNoteConsensus(f.ctx,input,new AbortController().signal)
    expect(result.issues).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"phase":"connection"'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"driverCode":"ORA-12514"'))
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private-user|private-password|private-host/)
    expect(JSON.stringify(result)).not.toContain('ORA-12514')
  }finally{warn.mockRestore()}
})

it('keeps authorized reads usable when fresh pre and post skill checks require separate bridge round trips',async()=>{
  const f=await fixture(),get=f.ctx.skills.get
  f.ctx.skills.get=async(...args)=>{if(f.state.gets>=1)await new Promise(resolve=>setTimeout(resolve,2200));return get(...args)}
  const result=await (await load()).reviewNoteConsensus(f.ctx,input,AbortSignal.timeout(12000))
  expect(result.issues).toHaveLength(1)
  expect(result.issues[0].evidence[0].data).toMatchObject({source:'infodb',skillName:'ework-skill-infodb'})
},15000)

it('still kills a stalled database process within four seconds despite the authorization pipeline allowance',async()=>{
  const f=await fixture()
  await writeFile(join(f.root,'scripts/connection.py'),`import os,time\nfrom pathlib import Path\ndef get_connection():\n Path(${JSON.stringify(f.marker)}).write_text(str(os.getpid()))\n time.sleep(20)\n`)
  const at=Date.now(),result=await (await load()).reviewNoteConsensus(f.ctx,input,AbortSignal.timeout(12000))
  expect(result.issues).toEqual([])
  expect(result.checks[0].status).toBe('unavailable')
  expect(Date.now()-at).toBeLessThan(7000)
  const pid=Number(await readFile(f.marker,'utf8'))
  await vi.waitFor(()=>expect(()=>process.kill(pid,0)).toThrow())
},10000)
