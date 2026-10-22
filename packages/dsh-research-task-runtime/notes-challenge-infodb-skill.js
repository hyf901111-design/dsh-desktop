import { spawn } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { homedir } from 'node:os'
import { consensusSql } from './notes-challenge-consensus-query.js'
import { deadline } from './notes-challenge-bounds.js'

// Runs the user's enabled connection module with a fixed read-only transaction.
// All module/driver stdout is suppressed, and no exception text leaves the child.
const PYTHON = `import contextlib,importlib.util,io,json,sys
conn=None
phase='module'
try:
 with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
  path,sql=sys.argv[1:3]
  spec=importlib.util.spec_from_file_location('ework_infodb_connection',path)
  module=importlib.util.module_from_spec(spec)
  spec.loader.exec_module(module)
  phase='connection'
  conn=module.get_connection()
  conn.call_timeout=2500
  cursor=conn.cursor()
  phase='transaction'
  cursor.execute('SET TRANSACTION READ ONLY')
  phase='query'
  cursor.execute(sql)
  phase='fetch'
  rows=cursor.fetchmany(201)
  if len(rows)>200: raise ValueError('too many rows')
  columns=[item[0] for item in cursor.description]
  result={'columns':columns,'rows':rows}
  cursor.close()
except ModuleNotFoundError as e:
 result={'error':'missing-driver' if e.name in ('oracledb','cryptography') else 'source-unavailable'}
except Exception as e:
 detail=e.args[0] if e.args else None
 code=getattr(detail,'full_code',None)
 result={'error':'source-unavailable','phase':phase,'driverCode':code if isinstance(code,str) and __import__('re').fullmatch(r'[A-Z]{2,6}-[0-9]{3,6}',code) else None}
finally:
 if conn is not None:
  with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
   try: conn.rollback();conn.close()
   except Exception: pass
print(json.dumps(result,ensure_ascii=False))
`

function readProcess(executable, path, sql, signal) {
  signal?.throwIfAborted()
  return new Promise((resolve,reject) => {
    const child = spawn(executable, ['-I','-c',PYTHON,path,sql], { stdio:['ignore','pipe','ignore'], windowsHide:true })
    const chunks=[];let bytes=0,failure,done=false
    const abort=()=>{failure=signal.reason??Error('查询已取消。');child.kill('SIGKILL')}
    const finish=(error,value)=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);error?reject(error):resolve(value)}
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>256000){failure=Error('一致预期响应超出容量。');child.kill('SIGKILL')}else chunks.push(chunk)})
    child.once('error',error=>finish(Object.assign(Error('数据读取进程不可用。'),{code:error.code})))
    child.once('close',code=>{
      if(failure)return finish(failure)
      if(code!==0)return finish(Error('数据读取进程失败。'))
      try { const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));finish(null,result) } catch {finish(Error('数据读取响应无效。'))}
    })
  })
}

const same = (a,b) => a?.provider===b?.provider && a?.name===b?.name && a?.content===b?.content && a?.resourceBase?.path===b?.resourceBase?.path
const inside = (root,file) => { const part=relative(root,file);return part!==''&&part!=='..'&&!part.startsWith('..'+sep)&&!isAbsolute(part) }
const live = (ctx,agent) => !!agent && ctx.agents?.get(agent.id)===agent && agent.session?.id===agent.id

/** Discovery and reads use the real managed skill provider, scoped to the live agent. */
export async function managedInfodbSource(ctx,agent,signal) {
  if(!live(ctx,agent)||!ctx.skills?.list||!ctx.skills.get)return null
  const options={scope:agent,cwd:agent.session.header?.cwd,signal}
  const candidates=(await ctx.skills.list(options)).filter(s=>s.provider==='ework-managed-skills'&&s.invocation?.modelInvocable&&/^infodb-skill-creator\s*[:：]/u.test(s.description??''))
  if(candidates.length!==1)return null
  const candidate=candidates[0],definition=await ctx.skills.get(candidate.name,options)
  if(!definition||definition.provider!==candidate.provider||definition.resourceBase?.kind!=='directory'||!isAbsolute(definition.resourceBase.path)||!/^name:\s*infodb-skill-creator\s*$/mu.test(definition.content??''))return null
  const root=await realpath(definition.resourceBase.path),path=await realpath(join(root,'scripts','connection.py'))
  if(!inside(root,path)||!(await stat(path)).isFile()||await realpath(definition.path)!==join(root,'SKILL.md'))return null
  const authorize=async()=>{
    signal?.throwIfAborted()
    const current=await ctx.skills.get(candidate.name,options)
    signal?.throwIfAborted()
    if(!live(ctx,agent)||!same(definition,current))throw Error('infodb技能已停用或会话已变化。')
  }
  return {name:candidate.name,kind:'skill',async query(claim,mode,querySignal){
    await authorize();querySignal?.throwIfAborted()
    const sql=consensusSql(claim,mode),configured=process.env.EWORK_INFODB_PYTHON
    const executables=configured?[configured]:[process.env.CONDA_PREFIX&&join(process.env.CONDA_PREFIX,'bin/python3'),'/opt/anaconda3/bin/python3',join(homedir(),'anaconda3/bin/python3'),'/opt/miniconda3/bin/python3','python3'].filter(Boolean)
    for(const executable of [...new Set(executables)]){
      querySignal?.throwIfAborted()
      if(!live(ctx,agent))throw Error('infodb读取会话已变化。')
      let result
      const readBudget=deadline(querySignal,4000)
      try {result=await readProcess(executable,path,sql,readBudget.signal)}catch(error){if(error.code==='ENOENT'&&!configured)continue;throw error}finally{readBudget.dispose()}
      if(result.error==='missing-driver'&&!configured)continue
      if(result.error){
        const error=Error('infodb技能未取得有效数据。')
        if(['module','connection','transaction','query','fetch'].includes(result.phase))error.phase=result.phase
        if(typeof result.driverCode==='string'&&/^[A-Z]{2,6}-[0-9]{3,6}$/.test(result.driverCode))error.driverCode=result.driverCode
        throw error
      }
      await authorize();querySignal?.throwIfAborted()
      if(!live(ctx,agent))throw Error('infodb读取会话已变化。')
      return {content:[{type:'text',text:JSON.stringify(result)}]}
    }
    throw Error('infodb技能所需Python驱动不可用。')
  }}
}
