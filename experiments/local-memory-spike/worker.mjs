import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryIndex, EncryptedStore, createEmbedder } from './engine.mjs'

// Harness-only child process. Owner labels are synthetic trusted test contexts,
// not a proposed renderer-accessible authentication API.
let embedder, store, config, indexes = new Map(), queue = Promise.resolve()
let peakRss = process.memoryUsage().rss
const sample = () => { peakRss = Math.max(peakRss, process.memoryUsage().rss) }
const timer = setInterval(sample, 100)
timer.unref()
function openIndexes() {
  for (const index of indexes.values()) index.close()
  indexes = new Map()
  for (const [owner, projects] of Object.entries(config.accounts)) {
    const index = new MemoryIndex(config.runtime, owner, projects)
    for (const { row, vector } of store.read(owner)) index.put(row, vector)
    indexes.set(owner, index)
  }
}
async function handle(command) {
  if (command.type === 'init') {
    config = command
    const start = performance.now()
    embedder = await createEmbedder(config.runtime, config.model)
    store = new EncryptedStore(join(config.root, 'memory.sqlite'), readFileSync(join(config.root, 'synthetic-test.key')))
    openIndexes(); sample()
    return { startupMs: performance.now() - start, rssMiB: process.memoryUsage().rss / 1048576 }
  }
  if (!embedder) throw Error('Worker not initialized')
  if (command.type === 'seed') {
    const start = performance.now()
    for (let i = 0; i < command.rows.length; i++) {
      const row = command.rows[i], index = indexes.get(row.owner)
      if (!index) throw Error('Unknown synthetic account')
      const vector = await embedder.embed(row.title + '\n' + row.content, 'passage')
      // Validate/index before persistence in this single-threaded test harness.
      index.put(row, vector); store.put(row.owner, row, vector)
      if ((i + 1) % 200 === 0) console.log(JSON.stringify({ stage: 'seed', completed: i + 1, total: command.rows.length }))
    }
    sample()
    return { count: command.rows.length, elapsedMs: performance.now() - start }
  }
  if (command.type === 'recall') {
    const index = indexes.get(command.owner)
    if (!index) throw Error('Unknown synthetic account')
    index.validateProject(command.projectId)
    const start = performance.now()
    const vector = command.strategy === 'lexical' ? new Float32Array(384) : await embedder.embed(command.query)
    const embedded = performance.now()
    const result = index.search(command.query, vector, command)
    return { ...result, timing: { embeddingMs: embedded - start, retrievalMs: performance.now() - embedded } }
  }
  if (command.type === 'remove') {
    const index = indexes.get(command.row.owner)
    if (!index) throw Error('Unknown synthetic account')
    index.remove(command.row); store.remove(command.row.owner, command.row)
    return { ok: true }
  }
  if (command.type === 'stats') { sample(); return { rssMiB: process.memoryUsage().rss / 1048576, peakRssMiB: peakRss / 1048576, cpu: process.cpuUsage() } }
  if (command.type === 'close') {
    for (const index of indexes.values()) index.close()
    store.close(); await embedder.close(); clearInterval(timer)
    return { closed: true }
  }
  throw Error('Unknown harness command')
}
process.on('message', message => {
  const arrived = performance.now()
  queue = queue.then(async () => {
    const queueMs = performance.now() - arrived
    try {
      const value = await handle(message.command)
      process.send({ id: message.id, value: { ...value, queueMs } }, () => {
        if (message.command.type === 'close') process.disconnect()
      })
    } catch (error) { process.send({ id: message.id, error: error.message, queueMs }) }
  }).catch(error => { console.error(error.message); process.exitCode = 1 })
})
process.on('disconnect', () => process.exit())
