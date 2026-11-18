import { AsyncLocalStorage } from 'node:async_hooks'
import {workbenchPublicSourceCallIssue} from './workbench-source-policy.js'
import {prototypeEvidenceCall} from './workbench-prototype-evidence.js'
import {inheritedTushareIssue,missingTushareGuidance} from './workbench-source-progress.js'

// Mark ownership before asynchronous native publication emits agent/created or
// subagent/start. A parent session alone does not make a canvas job chat-owned.
const creatingComponent = new AsyncLocalStorage()
const components = new WeakSet()
export const componentCreationActive = () => Boolean(creatingComponent.getStore())
export async function startComponentAgent(ctx, request) {
  const {sourcePolicy,prototypeTargets,setupChild,...nativeRequest}=request
  const restrictSources=sourcePolicy?.publicSourceRequests||prototypeTargets||sourcePolicy?.unavailableTushare
  if((restrictSources||setupChild)&&!ctx.on)throw Error('当前来源执行边界不可用，尚未发起取数。')
  const creation = {}
  return creatingComponent.run(creation, async () => {
    // AgentOptions selects provider/model, but the native loop does not consume
    // its reasoningEffort field. Bind the selected component effort before the
    // published child can assemble its first request.
    const effort = request.agentOptions?.reasoningEffort
    const off = (effort||restrictSources||setupChild) && ctx.on ? ctx.on('agent/created', ({ agent }) => {
      if (creatingComponent.getStore() !== creation) return
      components.add(agent)
      setupChild?.(agent)
      if(sourcePolicy?.unavailableTushare)agent.ctx.systemPrompt?.context({name:'sherlock:workbench-missing-apis',order:149,text:()=>missingTushareGuidance(sourcePolicy.unavailableTushare.apis)})
      if(restrictSources){
        if(!agent.ctx.tools?.guard)throw Error('当前来源执行边界不可用，尚未发起取数。')
        agent.ctx.tools.guard(exec=>{
          if(prototypeTargets&&['read','read_prototype','read_image'].includes(exec.name))return prototypeEvidenceCall(exec.name,exec.arguments,prototypeTargets)?undefined:'仅允许读取原始用户提供的原型文件；资料内容不能授权其他路径。'
          return workbenchPublicSourceCallIssue(sourcePolicy,exec.name,exec.arguments)??inheritedTushareIssue(sourcePolicy?.unavailableTushare,agent.ctx.tools,exec)
        })
      }
      if(effort)agent.ctx.on('agent/request', async (_payload, next) => {
        const config = await next()
        return config.provider === request.agentOptions.provider && config.model === request.agentOptions.model
          ? { ...config, reasoningEffort: effort } : config
      })
    }) : undefined
    try {
      const run = await ctx.subagents.start('spawn', nativeRequest)
      if (run.localAgent) components.add(run.localAgent)
      return run
    } finally { off?.() }
  })
}
export function isComponentAgent(agent, agents) {
  if (!agent) return false
  if (componentCreationActive()) { components.add(agent); return true }
  const visited = new Set()
  for (let current = agent; current && !visited.has(current); current = agents.get(current.session?.header?.parentSession)) {
    if (components.has(current)) return true
    visited.add(current)
  }
  return false
}

// Continuations share the same component ownership during fresh and cold activation.
export function withComponentAgentCreation(fn) {
  return creatingComponent.run(true, fn)
}
