import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { JsonlSessionPersistence } from '@deepseek-ai/dsh-session-persistence-jsonl'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { createApiRemoteAgentResolver } from '@deepseek-ai/dsh-api-remotes'
import { BoardDirectories } from '../packages/dsh-research-task-runtime/board-directories.js'

async function fixture() {
  const root=mkdtempSync(join(tmpdir(),'board-directory-lifecycle-')),ctx=new Context(),workspaces=new Map()
  new SessionStore(ctx)
  new JsonlSessionPersistence(ctx,{root:join(root,'history'),compression:'none'})
  new AgentRegistry(ctx)
  new LlmRuntime(ctx)
  new SystemPrompt(ctx,{})
  new ToolRuntime(ctx)
  new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1})
  ctx.provide('workspaceRegistry',{
    resolveByPath:async path=>workspaces.get(path),
    create:async path=>{
      const workspace={id:'workspace-'+workspaces.size,path,sessionIds:[],setTitle:async title=>{workspace.title=title},attachSession:async id=>{
        const stored=await ctx.sessionPersistence.inspect(id)
        expect(stored.meta.cwd).toBe(path)
        if(!workspace.sessionIds.includes(id))workspace.sessionIds.push(id)
      }}
      workspaces.set(path,workspace);return workspace
    }
  })
  const source=(await ctx.agents.create({sessionId:'legacy-board',meta:{cwd:root,agentPreset:'fixture'},agentOptions:{}})).agent.session
  source.append('session/title',{title:'研究来源'})
  source.append('request/header',{header:{config:{provider:'fixture-provider',model:'fixture-model'},system:'保留研究上下文',tools:[]}})
  await ctx.sessions.flush(source)
  const directories=new BoardDirectories(ctx,root), resolve=createApiRemoteAgentResolver(ctx,{agentOptions:()=>({})})
  return {root,ctx,source,directories,resolve,workspaces,input:{mode:'workspace',sessionId:source.id,basePath:root,title:'私有组件验收'},
    async close(){directories.dispose();await ctx.fiber.dispose();rmSync(root,{recursive:true,force:true})}}
}

describe('board migration Session and Agent lifecycle',()=>{
  it('can resolve the migrated model session in the same Host without a restart or a model send',async()=>{
    const f=await fixture()
    try {
      const originalEvents=structuredClone(f.source.events)
      const moved=await f.directories.run(f.input)
      const resolved=await f.resolve(moved.localSessionId)
      expect(resolved.error).toBeUndefined()
      expect(resolved.agent.session.requestHeader().config).toEqual({provider:'fixture-provider',model:'fixture-model'})
      expect(resolved.agent.session.events.slice(0,originalEvents.length)).toEqual(originalEvents)
      expect(resolved.agent.session.header).toMatchObject({cwd:moved.path,parentSession:f.source.id,agentPreset:'fixture'})
      expect(f.source.header.cwd).toBe(f.root)
      expect(f.source.events).toEqual(originalEvents)
      expect(existsSync(moved.path)).toBe(true)
      expect((await f.directories.run(f.input)).localSessionId).toBe(moved.localSessionId)
      expect((await f.resolve(moved.localSessionId)).agent).toBe(resolved.agent)
      // Keep persistence's live-session fence: normal consumers must use its Agent.
      await expect(f.ctx.sessionPersistence.prepare(moved.localSessionId)).rejects.toThrow('while it is live')
    } finally {await f.close()}
  })
  it('releases its temporary attachment when a durability listener fails and safely retries the same copy',async()=>{
    const f=await fixture()
    let removeFailure
    try {
      removeFailure=f.ctx.on('session/flush',session=>{if(session.id!==f.source.id)throw Error('fixture durability failure')})
      await expect(f.directories.run(f.input)).rejects.toThrow('fixture durability failure')
      const row=Object.values(JSON.parse(readFileSync(join(f.root,'research-board-directories.json'),'utf8')))[0]
      expect(f.ctx.sessions.get(row.sessionId)).toBeUndefined()
      expect(f.ctx.agents.get(row.sessionId)).toBeUndefined()
      expect(f.ctx.sessions.get(f.source.id)).toBe(f.source)
      expect(f.workspaces.size).toBe(0)
      // Other durability listeners still completed; keep their verified bytes.
      const stored=await f.ctx.sessionPersistence.inspect(row.sessionId)
      expect(stored.events.slice(0,f.source.events.length)).toEqual(f.source.events)
      removeFailure();removeFailure=undefined
      const retry=await f.directories.run(f.input)
      expect(retry.localSessionId).toBe(row.sessionId)
      expect((await f.resolve(row.sessionId)).error).toBeUndefined()
      expect(f.workspaces.get(row.path).sessionIds).toEqual([row.sessionId])
    } finally {removeFailure?.();await f.close()}
  })

})
