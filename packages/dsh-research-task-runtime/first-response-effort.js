import {allowTaskOpening,wantsTaskOpening} from './model-task-replies.js'
import {clientModeTurn} from './client-mode-profile.js'

// Keep analytical work at the selected model's normal depth. The short first
// pass serves conversational questions and mechanical edits with a clear target.
function quickFirstStep(profile) {
  if (!profile || profile.hasFile || !profile.text || profile.text.length > 480) return false
  if (/深入|深度|详细|推导|推理|复杂|仔细|严谨|全面|证明|预测|建模|归因|尽调|审计|多步骤|\b(?:deep|rigorous|comprehensive|prove|derive|forecast|audit)\b/iu.test(profile.text)) return false
  return profile.simple || profile.image || profile.appEdit && /(?:[A-Z]{1,3}\d{1,6}|表头|字号|行高|列宽|居中|重命名|改名|标题|加粗|斜体|\b(?:rename|bold|font size|row height|column width)\b)/iu.test(profile.text)
}

export function registerFirstResponseEffort(ctx) {
  return ctx.on('agent/request', async ({agent, step, signal, suggestFirstResponseEffort, supportsTaskOpening}, next) => {
    const config = await next()
    if (step !== 1 || config.provider?.startsWith('sherlock-home-')) return config
    const turn = clientModeTurn(agent?.session)
    const staged = supportsTaskOpening && wantsTaskOpening(turn)
    if (staged) allowTaskOpening(turn)
    if (config.reasoningEffort !== undefined || !suggestFirstResponseEffort || !staged && !quickFirstStep(turn)) return config
    try {
      const info = await ctx.llm.resolveModelInfo(config.provider, config.model, signal)
      signal?.throwIfAborted()
      if (clientModeTurn(agent.session) !== turn || !['high', 'xhigh', 'max', 'medium'].includes(info.reasoning?.defaultEffort)) return config
      const effort = ['low', 'minimal'].find(id => info.reasoning.efforts?.some(option => option.id === id))
      if (effort) suggestFirstResponseEffort(effort)
    } catch {
      signal?.throwIfAborted()
      // An optional metadata lookup must never prevent the normal model call.
    }
    return config
  })
}
