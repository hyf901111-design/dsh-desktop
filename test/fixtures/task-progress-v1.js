// Frozen regression fixture from ebb21112 task-progress-runtime; test-only, never shipped.
import {parse} from '@babel/parser'

export function installTaskProgressSync(ctx) {
  const states = new WeakMap()
  function read(session) {
    let state = states.get(session)
    if (!state) states.set(session, state = { cursor: 0, turn: 0, step: 0, todos: null, lastProgressStep: 0, remindedAt: 0, reconciled: false, finish: null })
    const events = session.events
    for (; state.cursor < events.length; state.cursor++) {
      const event = events[state.cursor]
      if (event.type === 'turn/start') Object.assign(state, { turn: event.data.turn, step: 0, todos: null, lastProgressStep: 0, remindedAt: 0, reconciled: false, finish: null })
      else if (event.type === 'step/start') { state.step = event.data.step; state.finish = null }
      else if (event.type === 'todo/write') { state.todos = event.data.todos; state.lastProgressStep = state.step }
      else if (event.type === 'assistant/chunk' && event.data.chunk?.type === 'finish') state.finish = event.data.chunk.reason?.kind
      else if (event.type === 'turn/end') state.todos = null
    }
    return state
  }
  function unfinished(state) {
    return Array.isArray(state.todos) && state.todos.some(item => item.status !== 'completed')
  }
  function message(final) {
    return {
      id: globalThis.crypto.randomUUID(), role: 'user',
      source: { kind: 'plugin', plugin: 'sherlock-task-progress', form: 'notice', summary: final ? '交付前核对任务清单' : '同步任务进度' },
      content: [{ type: 'text', text: final
        ? 'Before ending this turn, reconcile the existing task list with the work actually performed. Use todo_write with the COMPLETE list: mark only verified finished items completed, leave unfinished items pending, and clearly explain blockers or remaining work. Do not redo completed work or claim success just to close the list. Then provide a concise final response.'
        : 'The task list has not been updated for several execution steps. Before continuing substantive work, use todo_write with the COMPLETE list to reflect verified progress: completed work as completed and the current step as in_progress. Do not infer completion from time elapsed or tool call count. Keep the list current at each actual milestone.' }]
    }
  }
  ctx.on('agent/pre-step', async ({agent, turn, step, signal}, next) => {
    const decision = await next()
    if (signal.aborted || decision.kind !== 'enter') return decision
    const state = read(agent.session)
    if (state.turn !== turn || !unfinished(state) || step - Math.max(state.lastProgressStep, state.remindedAt) < 4) return decision
    state.remindedAt = step
    return {...decision, messages: [...decision.messages, message(false)]}
  })
  ctx.on('agent/turn-stopping', ({agent, turn, signal}) => {
    if (signal.aborted) return
    const state = read(agent.session)
    // A normal final response only. Never revive cancellation, truncation or an error.
    if (state.turn !== turn || state.finish !== 'stop' || state.reconciled || !unfinished(state)) return
    state.reconciled = true
    agent.steer(message(true))
  })
}

export function legacyTaskProgressSource(source) {
 const node=parse(source,{sourceType:"module"}).program.body.find(node=>node.type==="FunctionDeclaration"&&node.id?.name==="installTaskProgressSync")
 if(!node)throw Error("Expected an installed task progress runtime")
 return (source.slice(0,node.start)+installTaskProgressSync.toString()+source.slice(node.end)).replace(/\/\* sherlock:task-progress-continuation:v[23] \*\/\n/g, "")
}
