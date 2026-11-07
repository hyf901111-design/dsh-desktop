import { fork } from 'node:child_process'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus } from 'node:os'
import { score, scoreEvidenceBudget, percentile } from '../hindsight-local-validation/metrics.mjs'

const [output, runtime, model] = process.argv.slice(2).map(x => resolve(x))
if (!output || !runtime || !model) throw Error('Usage: benchmark.mjs OUTPUT RUNTIME MODEL_DIRECTORY')
await mkdir(output, { recursive: true, mode: 0o700 })
// Reusing a previous database would retain lifecycle canaries and invalidate the
// documented record count. Every benchmark needs a fresh evidence directory.
try { await stat(join(output, 'memory.sqlite')); throw Error('Use a fresh output directory; database already exists') }
catch (error) { if (error.code !== 'ENOENT') throw error }
const keyPath = join(output, 'synthetic-test.key')
try { await writeFile(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 }) } catch (error) { if (error.code !== 'EEXIST') throw error }
const hash = raw => createHash('sha256').update(raw).digest('hex')
async function frozen(relative, expected) {
  const raw = await readFile(new URL(relative, import.meta.url))
  if (hash(raw) !== expected) throw Error('Fixture changed: ' + relative)
  return JSON.parse(raw)
}
const original = await frozen('../hindsight-local-validation/corpus.json', '73017f842f5ca6cfd4b24d1e91fc73800b6aa2a515333801b2ae85bbf516c961')
const holdout = await frozen('../hindsight-backend-validation/heldout.json', '7abdbceaa3ef0951aebe35b826bd87daff6b1745374c125fecd8e1ca9d9338fc')
const now = Date.parse(original.now)
const rows = [...original.records, ...holdout.records.map(row => ({ ...row, owner: 'a', scope: 'project', projectId: 'gamma', kind: 'background' }))]
const queries = [...original.queries.map(q => ({ owner: 'a', projectId: 'alpha', ...q })), ...holdout.queries.map(q => ({ ...q, owner: 'a', projectId: 'gamma' }))]
// Fixed, deterministic office distractors. Same projects include other modules;
// these are scale probes, not a claim of representative real-history distribution.
const topics = [
  ['打印机维护', '更换纸盒滚轮后打印速度恢复，维护记录留在设备台账'],
  ['报销附件', '差旅报销应上传车票扫描件和住宿发票，审批后归档'],
  ['访客茶水', '接待区每天补充饮用水，纸杯用完后通知行政补充'],
  ['测试账号', '回归测试使用演练身份和合成订单，数据不进入月度经营报表'],
  ['培训安排', '新人培训资料包括操作录像和常见问题，培训完成后登记出勤'],
  ['会议设备', '视频会议前检查麦克风电量与投影连接，故障报告给行政'],
  ['样品柜位', '样品按品类放到标记柜位，借用后登记归还时间'],
  ['归档目录', '每季度的已结束工单整理到归档目录，文件索引由资料员维护'],
  ['轮值安排', '工作日轮值人员负责检查待办队列，交班时记录未完成事项'],
  ['资产盘点', '设备序列号与领用人需要在资产台账一致，变动后及时登记'],
]
const distractors = Array.from({ length: 1000 }, (_, i) => {
  const owner = i % 7 === 0 ? 'b' : 'a', projectId = owner === 'b' ? 'alpha' : ['alpha', 'beta', 'gamma'][i % 3]
  const name = { alpha: '晨星', beta: '海帆', gamma: '流光' }[projectId], [title, content] = topics[i % topics.length]
  return { id: `d${String(i).padStart(4, '0')}`, owner, scope: 'project', projectId, status: 'active', kind: 'background', title: `${title} ${i}`, content: `${name}辅助模块${i}：${content}。登记编号 AUX-${i}。` }
})
const dataset = { rows, queries, distractors }
await writeFile(join(output, 'frozen-input.json'), JSON.stringify(dataset, null, 2))
await writeFile(join(output, 'input-manifest.json'), JSON.stringify({ sha256: hash(JSON.stringify(dataset)), originalRows: 46, heldoutRows: 20, distractors: 1000, queryCount: queries.length, frozenAt: new Date().toISOString() }, null, 2))
const config = { type: 'init', root: output, runtime, model, accounts: { a: ['alpha', 'beta', 'gamma'], b: ['alpha'] } }
const artifacts = { environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0].model, cores: cpus().length }, initial: {}, scale: {}, loads: [], lifecycle: [] }
let child, pending = new Map(), sequence = 0
function startWorker() {
  child = fork(fileURLToPath(new URL('./worker.mjs', import.meta.url)), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  child.on('message', message => {
    const task = pending.get(message.id)
    if (!task) return
    pending.delete(message.id); clearTimeout(task.timer)
    task.resolve({ ...(message.value ?? {}), ...(message.error ? { error: message.error } : {}), latencyMs: performance.now() - task.start })
  })
  child.on('exit', (code, signal) => {
    for (const task of pending.values()) { clearTimeout(task.timer); task.resolve({ error: `worker exited ${code ?? signal}`, latencyMs: performance.now() - task.start }) }
    pending.clear()
  })
}
function request(command, timeoutMs = 5000) {
  const start = performance.now(), id = ++sequence
  return new Promise(resolveResult => {
    const timer = setTimeout(() => { pending.delete(id); resolveResult({ error: 'timeout', latencyMs: performance.now() - start }) }, timeoutMs)
    pending.set(id, { resolve: resolveResult, start, timer })
    child.send({ id, command }, error => {
      if (error && pending.has(id)) { clearTimeout(timer); pending.delete(id); resolveResult({ error: error.message, latencyMs: performance.now() - start }) }
    })
  })
}
async function required(command, timeout = 5000) {
  const result = await request(command, timeout)
  if (result.error) throw Error(`${command.type}: ${result.error}`)
  return result
}
async function stopWorker() {
  if (!child || child.exitCode !== null) return
  const exited = new Promise(resolveExit => child.once('exit', resolveExit))
  const response = await request({ type: 'close' }, 10000)
  if (response.error) child.kill('SIGKILL')
  await exited
}
function quality(results, subset = queries) {
  const selected = results.filter(r => subset.some(q => q.id === r.id))
  return { top5: score(subset, selected), budget1200: scoreEvidenceBudget(subset, selected) }
}
function leaks(q, response) {
  return (response.candidates ?? []).filter(({ row }) => row.owner !== q.owner || (row.scope === 'project' && row.projectId !== q.projectId) || !['active', ...(q.mode === 'history' ? ['superseded'] : [])].includes(row.status ?? 'active'))
}
async function runQuality(strategy) {
  const results = []
  for (const q of queries) {
    const response = await request({ type: 'recall', ...q, now, strategy })
    results.push({ ...response, id: q.id, isolationViolations: leaks(q, response).length })
  }
  return { original: quality(results, queries.slice(0, 46)), paraphrase: quality(results, queries.slice(0, 46).filter(q => q.category === 'paraphrase')), holdout: quality(results, queries.slice(46)), violations: results.reduce((s, r) => s + r.isolationViolations, 0), results }
}
try {
  startWorker()
  artifacts.initial.startup = await required(config, 120000)
  artifacts.initial.ingest = await required({ type: 'seed', rows }, 120000)
  for (const strategy of ['semantic', 'lexical', 'hybrid']) {
    artifacts.initial[strategy] = await runQuality(strategy)
    console.log(JSON.stringify({ stage: 'quality-small', strategy, original: artifacts.initial[strategy].original.top5.completeHitRate, holdout: artifacts.initial[strategy].holdout.top5.completeHitRate }))
  }
  artifacts.scale.ingest = await required({ type: 'seed', rows: distractors }, 240000)
  for (const strategy of ['semantic', 'lexical', 'hybrid']) {
    artifacts.scale[strategy] = await runQuality(strategy)
    console.log(JSON.stringify({ stage: 'quality-1066', strategy, original: artifacts.scale[strategy].original.top5.completeHitRate, holdout: artifacts.scale[strategy].holdout.top5.completeHitRate }))
  }
  artifacts.scale.resources = await required({ type: 'stats' })
  for (const concurrency of [1, 3, 10]) {
    const results = [], begin = performance.now()
    let next = 0
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (next < 210) {
        const i = next++, q = queries[i % queries.length]
        const response = await request({ type: 'recall', ...q, now, strategy: 'hybrid' })
        results.push({ ...response, id: q.id, requestIndex: i, isolationViolations: leaks(q, response).length })
      }
    }))
    const elapsedMs = performance.now() - begin, durations = results.map(r => r.latencyMs), failures = results.filter(r => r.error).length
    const item = { concurrency, requests: results.length, failures, throughputPerSecond: results.length / (elapsedMs / 1000), elapsedMs,
      latencyMs: { p50: percentile(durations, .5), p95: percentile(durations, .95), p99: percentile(durations, .99), max: Math.max(...durations) },
      isolationViolations: results.reduce((s, r) => s + r.isolationViolations, 0), resources: await required({ type: 'stats' }), results }
    artifacts.loads.push(item)
    console.log(JSON.stringify({ stage: 'load', concurrency, requests: item.requests, failures, latencyMs: item.latencyMs }))
  }
  const probe = { id: 'same-canary', owner: 'a', scope: 'project', projectId: 'alpha', status: 'active', title: '独立探针', content: '紫藤实验室的密封箱编号是 CANARY_A_7281。' }
  await required({ type: 'seed', rows: [probe, { ...probe, owner: 'b', content: '紫藤实验室的密封箱编号是 CANARY_B_6392。' }, { ...probe, projectId: 'beta', content: '紫藤实验室的密封箱编号是 CANARY_BETA_5283。' }] })
  const check = async (owner, projectId) => required({ type: 'recall', owner, projectId, query: '紫藤实验室密封箱编号', now, strategy: 'hybrid' })
  const before = await check('b', 'alpha')
  await required({ type: 'remove', row: probe })
  await stopWorker(); startWorker()
  artifacts.restart = await required(config, 120000)
  const a = await check('a', 'alpha'), b = await check('b', 'alpha'), beta = await check('a', 'beta')
  const canary = response => response.candidates.filter(x => x.row.id === probe.id).map(x => x.row.content)
  artifacts.lifecycle.push({ test: 'delete-a-restart-preserve-b-and-beta', pass: canary(a).length === 0 && canary(b).length === 1 && canary(b)[0] === canary(before)[0] && canary(beta).length === 1, a: canary(a), b: canary(b), beta: canary(beta) })
  const invalid = await request({ type: 'recall', owner: 'b', projectId: 'beta', query: '密封箱', now })
  artifacts.lifecycle.push({ test: 'unauthorized-project-rejected', pass: !!invalid.error, error: invalid.error })
  artifacts.finalResources = await required({ type: 'stats' })
  await stopWorker()
  artifacts.databaseBytes = (await stat(join(output, 'memory.sqlite'))).size
  const selected = artifacts.scale.hybrid
  artifacts.decision = {
    quality: selected.original.top5.completeHitRate >= .9 && selected.paraphrase.top5.completeHits >= 12 && selected.original.budget1200.completeHitRate >= .95 && selected.holdout.top5.completeHitRate >= .9 && selected.holdout.budget1200.completeHitRate >= .95,
    latency: artifacts.loads[0].latencyMs.p95 <= 500 && artifacts.loads[1].latencyMs.p95 <= 1000 && artifacts.loads.every(x => x.failures === 0),
    isolation: artifacts.loads.every(x => x.isolationViolations === 0) && Object.values(artifacts.scale).filter(x => x.violations !== undefined).every(x => x.violations === 0) && artifacts.lifecycle.every(x => x.pass),
    productReady: false,
    limitations: ['synthetic corpus', 'nearest-neighbor candidates are not generated answers', 'no Electron packaged-app, identity-epoch, extraction or migration acceptance', 'benchmark AES key is a local fixture, not production keychain integration'],
  }
  await writeFile(join(output, 'results.json'), JSON.stringify(artifacts, null, 2))
  console.log(JSON.stringify({ stage: 'complete', decision: artifacts.decision, databaseBytes: artifacts.databaseBytes }))
} finally {
  if (child && child.exitCode === null && child.connected) await stopWorker()
  await writeFile(join(output, 'partial-or-final.json'), JSON.stringify(artifacts, null, 2))
}
