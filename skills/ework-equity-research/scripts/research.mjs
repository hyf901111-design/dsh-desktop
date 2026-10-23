#!/usr/bin/env node
import { readFile, writeFile, mkdir, realpath, readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { validatePacket, calculatePacket } from './lib/index.mjs'
import { validateReport, renderReport } from './lib/report.mjs'
import {reportCoverage,RESEARCH_SECTIONS} from './lib/quality.mjs'
import {requestResearchPdf} from './lib/pdf-client.mjs'
import {publicationMetadata} from './lib/publication.mjs'

const VERSION = '1.3.0'
const resourceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = value => JSON.stringify(value, null, 2) + '\n'
const flags = {
  doctor: [], init: ['company', 'ticker', 'as-of', 'out'],
  hash: ['file'], validate: ['input'], run: ['input', 'out','format'],
}
function parse(argv) {
  const [command, ...args] = argv
  if (!Object.hasOwn(flags, command)) throw Error('命令：doctor | init | hash | validate | run')
  const options = {}
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.slice(2), value = args[i + 1]
    if (!args[i]?.startsWith('--') || !flags[command].includes(key) || key in options || !value || value.startsWith('--')) {
      throw Error('未知、重复或缺少值的参数：' + args[i])
    }
    options[key] = value
  }
  for (const key of ({ init: ['out'], hash: ['file'], validate: ['input'], run: ['input', 'out'] }[command] ?? [])) {
    if (!options[key]) throw Error('缺少 --' + key)
  }
  return { command, options }
}
async function readLimited(file, limit) {
  if ((await stat(file)).size > limit) throw Error('文件超过允许大小：' + file)
  const bytes = await readFile(file)
  if (bytes.length > limit) throw Error('文件超过允许大小：' + file)
  return bytes
}
async function codeHash() {
  const paths = ['scripts/research.mjs', ...(await readdir(join(resourceRoot, 'scripts/lib'))).filter(p => p.endsWith('.mjs')).map(p => 'scripts/lib/' + p), 'assets/ework-odyssey-logo.svg'].sort()
  const h = createHash('sha256')
  for (const name of paths) h.update(name + '\0').update(await readFile(join(resourceRoot, name)))
  return h.digest('hex')
}
async function inspect(file) {
  const inputPath = await realpath(resolve(file))
  const bytes = await readLimited(inputPath, 4 * 1024 * 1024)
  const packet = JSON.parse(bytes.toString('utf8'))
  const evidence = await validatePacket(packet, { root: dirname(inputPath) })
  const calculation = calculatePacket(packet, evidence)
  const reportDiagnostics = evidence.ok && calculation.ok ? validateReport(packet, evidence, calculation) : []
  const diagnostics = [...evidence.diagnostics, ...calculation.diagnostics, ...reportDiagnostics]
  const unique = [...new Map(diagnostics.map(d => [JSON.stringify(d), d])).values()]
  const validation = {
    ok: evidence.ok && calculation.ok && !reportDiagnostics.some(d => d.severity === 'error'),
    synthetic: packet?.synthetic === true,
    scope: 'local-snapshot-fields-and-deterministic-calculations',
    externalAuthenticity: 'unverified', diagnostics: unique,
  }
  return { packet, evidence, calculation, validation, inputSha256: hash(bytes) }
}
async function main() {
  const { command, options } = parse(process.argv.slice(2))
  if (command === 'doctor') {
    const major = Number(process.versions.node.split('.')[0])
    if (major < 20) throw Error('需要 Node 20 或更高版本；请使用 EWork 内置 Node')
    return { ok: true, engineVersion: VERSION, node: process.versions.node, resourceRoot, dependencies: [], networkRequired: false, defaultFormats:['html','pdf'], pdfRuntimeConfigured:!!(process.env.SHERLOCK_RESEARCH_CONTEXT_URL&&process.env.SHERLOCK_RESEARCH_CONTEXT_TOKEN) }
  }
  if (command === 'hash') return { sha256: hash(await readLimited(resolve(options.file), 64 * 1024 * 1024)) }
  if (command === 'init') {
    const packet = {
      schemaVersion: 1, synthetic: false,
      company: { name: options.company ?? '', ticker: options.ticker ?? '', currency: 'CNY' },
      asOf: options['as-of'] ?? '', financialAsOf: '', sources: [], facts: [], calculations: [],
      observations: [],
      report: { profile:'full', publication:{reportType:'公司研究报告'},title: '{{company}}研究报告', summary: [], theses:[], sections:Object.entries(RESEARCH_SECTIONS).map(([kind,title])=>({kind,title,status:'missing',paragraphs:[],gap:{missing:'尚未收集并核验所需资料。',impact:'本节暂不能形成有证据支持的结论。',nextStep:'补充原文证据、可比数据和研究判断。'}})) },
    }
    const file = resolve(options.out)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, json(packet), { flag: 'wx' })
    return { ok: true, file, status: 'template-needs-evidence', contract: join(resourceRoot, 'references/packet-contract.md') }
  }
  if (command === 'validate') {
    const result = await inspect(options.input)
    if (!result.validation.ok) process.exitCode = 1
    return result.validation
  }
  // An existing directory is always refused: success cannot inherit stale files.
  const format=options.format??'both'
  if(!['both','html'].includes(format))throw Error('--format仅支持both（默认HTML+PDF）或html')
  const out = resolve(options.out)
  await mkdir(dirname(out), { recursive: true })
  await mkdir(out)
  let result
  try { result = await inspect(options.input) }
  catch (error) {
    const validation = { ok: false, diagnostics: [{ severity: 'error', code: 'INPUT', path: 'input', message: error.message }] }
    await writeFile(join(out, 'validation.json'), json(validation), { flag: 'wx' })
    throw error
  }
  const outputs = {},artifacts={}
  async function output(key,name, bytes) {
    await writeFile(join(out, name), bytes, { flag: 'wx' })
    outputs[name] = hash(bytes)
    artifacts[key]=name
  }
  await output('evidence','evidence.json', json(result.evidence))
  await output('calculations','calculations.json', json(result.calculation))
  await output('validation','validation.json', json(result.validation))
  const coverage=reportCoverage(result.packet.report),delivery={requested:format==='both'?['html','pdf']:['html'],completed:[],pdf:{status:format==='both'?'pending':'not-requested'}}
  if (result.validation.ok) {
    const {fileStem}=publicationMetadata(result.packet),htmlName=fileStem+'.html',pdfName=fileStem+'.pdf'
    const html=renderReport(result.packet,result.evidence,result.calculation)
    await output('html',htmlName,html);delivery.completed.push('html')
    await output('quality','report-quality.json',json(coverage))
    if(format==='both')try{
      const pdf=await requestResearchPdf(html);await output('pdf',pdfName,pdf);delivery.completed.push('pdf');delivery.pdf={status:'generated',bytes:pdf.length,sha256:outputs[pdfName]}
    }catch(error){delivery.pdf={status:'failed',error:error.message};process.exitCode=1}
  }
  const manifest = {
    engineVersion: VERSION, status: !result.validation.ok?'blocked':delivery.pdf.status==='failed'?'pdf-failed':coverage.profile==='brief'?'rendered-brief':coverage.hasGaps?'rendered-with-gaps':'rendered-for-review',
    delivery,researchCoverage:coverage,
    createdAt: new Date().toISOString(), inputSha256: result.inputSha256,
    engineSha256: await codeHash(), synthetic: result.packet.synthetic,
    externalAuthenticity: 'unverified', artifacts:{...artifacts,manifest:'run.json'},outputs,
  }
  await writeFile(join(out, 'run.json'), json(manifest), { flag: 'wx' })
  if (!result.validation.ok) process.exitCode = 1
  return { ok: result.validation.ok&&delivery.pdf.status!=='failed', out, status: manifest.status, delivery, artifacts:manifest.artifacts,researchCoverage:coverage, diagnostics: result.validation.diagnostics }
}
main().then(result => process.stdout.write(json(result))).catch(error => {
  process.stderr.write(json({ ok: false, error: error.message, code: error.code ?? 'COMMAND' }))
  process.exitCode = 1
})
