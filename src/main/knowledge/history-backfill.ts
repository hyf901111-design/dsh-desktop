import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { canAutomaticallyCollect } from '../../shared/knowledge-library'
import {
  deliveryPathsFromFinalText, homeGuideDeliveryPaths, presentationCodeDelivery,
  presentationDelivery, verifiedResearchDeliveryPaths
} from '../../../scripts/lib/delivery-file-model.mjs'
import type { KnowledgeStore } from './store'

type SessionHeader = { type: 'session'; id: string; cwd?: string; parentSession?: string; origin?: string }
type Block = { type: string; text?: string; isError?: boolean; content?: Block[]; attachment?: { attachmentId?: string } }
type Message = { source?: { kind?: string; callId?: string }; content?: Block[] }
type FactoryImage = { id: string; name: string; hash: string }
type LogRow = {
  type: string
  data?: {
    turn?: number; title?: string; callId?: string; name?: string
    arguments?: { path?: string; file_path?: string; command?: string }
    message?: Message
    content?: Block[]; isError?: boolean
    reason?: { kind?: string }
  }
}

const eventTypes = new Set(['session/title', 'assistant/message', 'tool/call', 'tool/result', 'tool/code-dispatch', 'turn/end'])
// Revisit archived canvases that were saved before the source session title was merged.
const scanVersion = 2
const limit = 64 * 1024 * 1024
const excludedDirectory = /^(?:\..+|node_modules|scratch|tmp|temp|__pycache__)$/i

function within(root: string, path: string) {
  const part = relative(root, path)
  return Boolean(part) && !isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep)
}

function* logLines(bytes: Buffer, compressed: boolean) {
  if (!compressed) {
    yield* bytes.toString('utf8').split('\n')
    return
  }
  let pending = ''
  while (bytes.length) {
    const decoded = zstdDecompressSync(bytes, { info: true, maxOutputLength: limit }) as unknown as {
      buffer: Buffer; engine: { bytesWritten: number }
    }
    if (!decoded.engine.bytesWritten) throw Error('Invalid historical session frame')
    bytes = bytes.subarray(decoded.engine.bytesWritten)
    const lines = (pending + decoded.buffer.toString('utf8')).split('\n')
    pending = lines.pop()!
    yield* lines
  }
  if (pending) yield pending
}

function factoryImages(content: Block[] = []): FactoryImage[] {
  const attachments = new Set(content.filter(part => part.type === 'image').map(part => part.attachment?.attachmentId))
  return content.flatMap(part => {
    if (part.type === 'tool-result') return part.isError ? [] : factoryImages(part.content)
    if (part.type !== 'text' || !part.text?.startsWith('{') || part.text.length > 4096) return []
    try {
      const receipt = JSON.parse(part.text)
      const digest = /^sha256:([a-f0-9]{64})$/u.exec(receipt.image?.attachmentId)?.[1]
      if (receipt.kind !== 'odyssey-image-generation' || receipt.version !== 1 || receipt.ok !== true ||
          receipt.image?.mediaType !== 'image/png' || !digest || !attachments.has(receipt.image.attachmentId) ||
          !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(receipt.factory?.id) ||
          typeof receipt.factory?.title !== 'string' || receipt.factory.title.length > 100) return []
      return [{ id: receipt.factory.id, name: receipt.factory.title, hash: digest }]
    } catch { return [] }
  })
}

function deliveries(rows: Iterable<string>, cwd: string) {
  const found = new Set<string>()
  const images = new Map<string, FactoryImage>()
  const turns = new Map<number, { final?: string; paths: string[] }>()
  const calls = new Map<string, NonNullable<LogRow['data']>>()
  let sessionTitle: string | undefined
  for (const line of rows) {
    const eventType = /^\{"type":"([^"]+)"/.exec(line)?.[1]
    if (!eventType || !eventTypes.has(eventType)) continue
    const row = JSON.parse(line) as LogRow
    const data = row.data
    if (row.type === 'session/title') {
      if (typeof data?.title === 'string' && data.title.trim()) sessionTitle = data.title.slice(0, 256)
      continue
    }
    if (row.type === 'tool/code-dispatch') {
      if (data?.name === 'image_generate' && !data.isError) {
        for (const image of factoryImages(data.content)) images.set(image.id, image)
      }
      const published = presentationCodeDelivery(row)
      if (!published) continue
      const turn = Number(published.turnId)
      if (!turns.has(turn)) turns.set(turn, { paths: [] })
      turns.get(turn)!.paths.push(...published.paths)
      continue
    }
    if (typeof data?.turn !== 'number') continue
    if (!turns.has(data.turn)) turns.set(data.turn, { paths: [] })
    const turn = turns.get(data.turn)!
    if (row.type === 'assistant/message') {
      const content = data.message?.content ?? []
      turn.final = content.some(block => block.type === 'tool-call') ? undefined
        : content.filter(block => block.type === 'text').map(block => block.text ?? '').join('\n')
    } else if (row.type === 'tool/call' && data.callId) {
      calls.set(data.callId, data)
    } else if (row.type === 'tool/result' && data.message) {
      const message = data.message
      const callId = message.source?.callId
      const call = callId ? calls.get(callId) : undefined
      if (callId) calls.delete(callId)
      const tool = call?.name
      if (tool === 'image_generate') {
        for (const image of factoryImages(message.content)) images.set(image.id, image)
      }
      const output = call?.arguments?.path ?? call?.arguments?.file_path
      const writesFile = /^(?:write_file|edit_file|create_file)$/i.test(tool ?? '') ||
        (tool === 'str_replace_editor' && /^(?:create|str_replace|insert)$/.test(call?.arguments?.command ?? ''))
      if (typeof output === 'string' && writesFile &&
          message.content?.some(block => block.type === 'tool-result' && block.isError === false)) {
        turn.paths.push(output)
      }
      turn.paths.push(...verifiedResearchDeliveryPaths(message), ...homeGuideDeliveryPaths(message, tool),
        ...(presentationDelivery(message, tool, data.turn)?.paths ?? []))
    } else if (row.type === 'turn/end') {
      if (data.reason?.kind === 'completed') {
        for (const path of [...turn.paths, ...deliveryPathsFromFinalText(turn.final ?? '', cwd)]) found.add(path)
      }
      turns.delete(data.turn)
      calls.clear()
    }
  }
  return { sessionTitle, paths: [...found], images: [...images.values()] }
}

async function entries(path: string) {
  try { return await readdir(path, { withFileTypes: true }) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function historicalFile(root: string, cwd: string, candidate: string) {
  if (!candidate || candidate.length > 8192 || !canAutomaticallyCollect(basename(candidate))) return
  const path = resolve(cwd, candidate)
  if (!within(root, path) && !within(cwd, path)) return
  const source = await realpath(path).catch(() => undefined)
  if (!source || !within(root, source) || relative(root, source).split(sep).some(part => excludedDirectory.test(part))) return
  const file = await stat(source).catch(() => undefined)
  if (file?.isFile()) return { source, updatedAt: file.mtimeMs }
}

export async function scanKnowledgeHistory({ sessionRoot, attachmentsRoot, store, allowSession, check, only }: {
  sessionRoot: string
  attachmentsRoot?: string
  store: KnowledgeStore
  allowSession(id: string): boolean
  check(): void
  only?: ReadonlySet<string>
}) {
  const previous = await store.historicalScanRevisions()
  check()
  const revisions: Record<string, string> = {}
  const result = { scanned: 0, collected: 0, missingOrExcluded: 0, failed: 0 }
  for (const project of await entries(sessionRoot)) {
    if (!project.isDirectory()) continue
    const projectDir = join(sessionRoot, project.name)
    for (const session of await entries(projectDir)) {
      if (!session.isDirectory() || (only && !only.has(session.name)) || !allowSession(session.name)) continue
      check()
      const directory = join(projectDir, session.name)
      const discovered = await entries(directory)
      const artifact = discovered.find(file => file.isFile() && file.name === 'session.jsonl.zstd')
        ?? discovered.find(file => file.isFile() && file.name === 'session.jsonl')
      if (!artifact) continue
      const path = join(directory, artifact.name)
      try {
        const info = await stat(path)
        const revision = JSON.stringify([scanVersion, artifact.name, info.size, info.mtimeMs])
        if (previous[session.name] === revision) continue
        if (info.size > limit) { result.failed++; continue }
        const lines = logLines(await readFile(path), artifact.name.endsWith('.zstd'))
        const header = JSON.parse(lines.next().value ?? 'null') as SessionHeader | null
        if (header?.type !== 'session' || header.id !== session.name || header.parentSession ||
            header.origin === 'subagent' || !header.cwd || !isAbsolute(header.cwd)) continue
        const cwd = header.cwd
        const { paths, images, sessionTitle } = deliveries(lines, cwd)
        const root = await realpath(cwd).catch(() => undefined)
        if (!root && paths.length) result.missingOrExcluded += paths.length
        result.scanned++
        let retry = false
        for (const candidate of root ? paths : []) {
          check()
          const file = await historicalFile(root!, cwd, candidate)
          if (!file) { result.missingOrExcluded++; continue }
          check()
          try {
            const document = await store.collectGenerated(file.source, {
              sessionId: header.id, sessionTitle, updatedAt: file.updatedAt
            })
            if (document) result.collected++
          } catch {
            check()
            retry = true
            result.failed++
          }
        }
        if (attachmentsRoot) for (const image of images) {
          check()
          try {
            const path = join(attachmentsRoot, image.hash.slice(0, 2), image.hash)
            const info = await stat(path)
            if (!info.isFile() || info.size > 20 * 1024 * 1024) throw Error('Invalid factory attachment')
            const bytes = await readFile(path)
            if (createHash('sha256').update(bytes).digest('hex') !== image.hash) throw Error('Corrupt factory attachment')
            const document = await store.collectFactoryImage(bytes, {
              id: image.id, name: image.name, sessionId: header.id, sessionTitle, updatedAt: info.mtimeMs,
            }, check)
            if (document) result.collected++
          } catch { check(); retry = true; result.failed++ }
        }
        if (!retry) revisions[session.name] = revision
      } catch {
        check()
        result.failed++
      }
    }
  }
  check()
  if (Object.keys(revisions).length) await store.saveHistoricalScanRevisions(revisions, check)
  return result
}
