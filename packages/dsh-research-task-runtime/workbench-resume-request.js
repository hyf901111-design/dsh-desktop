import {canvasHumanRequest} from './canvas-task-routing.js'
import {classifyResearchCreationRequest} from './component-delivery-intent.js'

// The legacy token-limit notice explicitly invites a new "continue" message.
// Resume only the adjacent, read-only planning attempt from the research UI.
export function interruptedBoardRequest(session, human) {
  if (!human?.researchComposer || !/^(?:请?继续|continue)[。.!！]?$/iu.test(human.text.trim())) return
  const events = session.events
  const userMessages = event => event.type === 'user/message' ? [event.data]
    : event.type === 'agent/inbox/spliced' ? event.data?.inserted ?? [] : []
  const current = events.findLastIndex(event => userMessages(event).some(message => message.id === human.messageId))
  if (current < 0) return
  const message = userMessages(events[current]).find(value => value.id === human.messageId)
  if (message.content?.length !== 1 || message.content[0].type !== 'text' || message.content[0].text.trim() !== human.text.trim()) return
  const end = events.slice(0, current).findLastIndex(event => event.type === 'turn/end')
  if (end < 0 || events[end].data?.reason?.kind !== 'max-tokens') return
  if (events.slice(end + 1, current).some(event => userMessages(event).some(value => value.source?.kind === 'user' && value.id !== human.messageId))) return
  const start = events.slice(0, end).findLastIndex(event => event.type === 'turn/start')
  if (start < 0 || events[start].data.turn !== events[end].data.turn) return
  const previousTurn = events.slice(start + 1, end)
  const previousUsers = previousTurn.filter(event => event.type === 'user/message' && event.data?.source?.kind === 'user')
  if (previousUsers.length !== 1 || previousUsers[0].data.source.clientMode !== 'research' ||
      previousUsers[0].data.content?.some(block => block.type !== 'text')) return
  // Any write, in-flight action or authorization failure needs its own receipt.
  // A fresh user message cannot safely repeat a partially applied operation.
  if (previousTurn.some(event => event.type === 'tool/call' && !['read', 'read_file', 'read_image', 'read_prototype'].includes(event.data?.name) ||
      event.type === 'tool/result' && (event.data?.error || event.data?.message?.content?.some(block => block.isError)))) return
  const original = canvasHumanRequest({events: previousUsers})
  if (original && classifyResearchCreationRequest(original.text, 'research')) {
    return {message:previousUsers[0].data, text:original.text}
  }
}
