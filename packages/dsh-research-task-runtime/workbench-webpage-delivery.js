import {basename, isAbsolute, relative, resolve, sep} from 'node:path'
import {canvasHumanRequest} from './canvas-task-routing.js'
import {classifyResearchCreationRequest} from './component-delivery-intent.js'

const destinations = new WeakMap()
const maxBytes = 256000

export function isAdmittedResearchMessage(session, messageId) {
  return !!messageId && destinations.get(session?.header)?.has(messageId) === true
}

export function admittedResearchTurn(session, delivery) {
  if (!session?.header?.cwd || session.header.origin === 'subagent' || session.header.delegationDepth > 0 ||
      typeof delivery?.request !== 'string' || !Number.isSafeInteger(delivery.startedAt)) return
  const events = session.events ?? []
  let human
  for (const event of events) {
    if (event.time < delivery.startedAt) continue
    const messages = event.type === 'agent/inbox/spliced' ? event.data?.inserted :
      event.type === 'user/message' ? [event.data] : []
    for (const message of messages ?? []) {
      if (message?.source?.kind !== 'user') continue
      const candidate = canvasHumanRequest({events:[{type:'user/message',data:message}]})
      // A later send with identical wording cannot claim a different first message.
      if (!candidate?.messageId || classifyResearchCreationRequest(candidate.text,'research')?.request !== delivery.request) return
      human = candidate
      break
    }
    if (human) break
  }
  if (!human) return
  const owned = destinations.get(session.header) ?? new Set()
  owned.add(human.messageId)
  if (owned.size > 32) owned.delete(owned.values().next().value)
  destinations.set(session.header, owned)
  const index = events.findIndex(event => event.type === 'user/message' && event.data?.id === human.messageId)
  if (index < 0) return
  const start = events.slice(0,index).findLast(event => event.type === 'turn/start')
  if (!start) return
  const turn = start.data.turn
  const endIndex = events.findIndex((event,i) => i > index && event.type === 'turn/end' && event.data?.turn === turn)
  return {human, turn, start:start.time, events:events.slice(events.indexOf(start),endIndex < 0 ? undefined : endIndex+1), cwd:session.header.cwd}
}

// The filesystem tool supplies the current file on a write/read conflict.
// A full numbered read is a base for confirmed edits, never a deliverable itself.
function completeFileRead(result, absolutePath, cwd) {
  for (const block of result.content ?? []) {
    if (block.type !== 'text' || typeof block.text !== 'string') continue
    const envelope = /<path>([^\n]+)<\/path>\n<type>file<\/type>\n<content>\n([\s\S]*)\n\n\(End of file - total (\d+) lines\)\n<\/content>$/u.exec(block.text)
    if (!envelope || resolve(cwd,envelope[1]) !== absolutePath) continue
    const lines = envelope[2].split('\n')
    if (lines.length !== Number(envelope[3]) || !lines.every((line,i) =>
      line.startsWith((i+1)+': ') && !/\.\.\. \(line truncated to \d+ chars\)$/u.test(line))) continue
    const html = lines.map((line,i) => line.slice(String(i+1).length+2)).join('\n')
    if (Buffer.byteLength(html) <= maxBytes) return html
  }
}

export function completedResearchWebpages({turn, events, cwd}) {
  const end = events.find(event => event.type === 'turn/end' && event.data?.turn === turn)
  if (!end) return
  if (end.data.reason?.kind !== 'completed') return []
  const calls = new Map(), files = new Map(), authored = new Set()
  let finalText = ''
  for (const {type, data} of events) {
    if (data?.turn !== turn) continue
    if (type === 'assistant/message') {
      const text = data.message?.content?.filter(block => block.type === 'text').map(block => block.text).join('\n')
      if (text) finalText = text
      continue
    }
    if (type === 'tool/call' && ['read','write','edit'].includes(data.name)) {
      calls.set(data.callId,data)
      continue
    }
    if (type !== 'tool/result' || data.message?.source?.kind !== 'tool') continue
    const call = calls.get(data.message.source.callId)
    const result = call && data.message.content?.find(block => block.type === 'tool-result' && block.toolCallId === call.callId)
    if (!result) continue
    calls.delete(call.callId)
    let args = call.arguments
    if (typeof args === 'string') { try { args = JSON.parse(args) } catch { continue } }
    if (typeof args?.file_path !== 'string' || !/\.html?$/iu.test(args.file_path)) continue
    const absolutePath = resolve(cwd,args.file_path), path = relative(cwd,absolutePath)
    if (!path || path === '..' || path.startsWith('..'+sep) || isAbsolute(path)) continue
    if (call.name === 'read' || result.isError) {
      const read = completeFileRead(result,absolutePath,cwd)
      if (read !== undefined) files.set(path,read)
      continue
    }
    let html
    if (call.name === 'write') html = args.content
    else if (files.has(path)) {
      const before = files.get(path), old = args.old_string
      if (typeof old === 'string' && old && typeof args.new_string === 'string' && before.includes(old) &&
          (args.replace_all || before.indexOf(old) === before.lastIndexOf(old))) {
        html = args.replace_all ? before.split(old).join(args.new_string) : before.replace(old,() => args.new_string)
      }
    }
    if (typeof html === 'string' && Buffer.byteLength(html) <= maxBytes) {
      files.set(path,html)
      authored.add(path)
    } else {
      files.delete(path)
      authored.delete(path)
    }
  }
  const pages = []
  // A final receipt can name the page without repeating its file name.
  const singlePageReceipt = authored.size === 1 &&
    /(?:网页|页面|看板|日历)(?:文件)?(?:已经|现已|已)(?:生成|保存|做好|完成)|(?:the |your )?(?:webpage|page|dashboard) (?:has been saved|is ready)/iu.test(finalText)
  for (const path of authored) {
    const name = basename(path)
    const mentions = value => finalText.includes(value) || finalText.includes(encodeURI(value))
    const named = path !== name && mentions(path) ||
      mentions(name) && [...authored].filter(key => basename(key) === name).length === 1
    if (!named && !singlePageReceipt) continue
    const title = name.replace(/\.html?$/iu,'')
    pages.push({type:'files', title, prompt:title, htmlFile:{name,html:files.get(path)}})
  }
  return pages
}
