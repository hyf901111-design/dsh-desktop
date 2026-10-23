#!/usr/bin/env node
// Standalone Electron verification. Does not build, replace or launch the shared client.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import electron from 'electron'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--output') throw Error('用法：node scripts/verify-research-pdf.mjs --output <新输出目录>')
const output = resolve(args[1])
await mkdir(output, { recursive: false })
const scratch = await mkdtemp(join(tmpdir(), 'ework-research-pdf-check-'))
try {
  const bootstrap = join(scratch, 'verify.ts')
  await writeFile(bootstrap, `
import { app, BrowserWindow } from 'electron'
import { createServer } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ResearchPdfRenderer } from ${JSON.stringify(join(repo, 'src/main/research/research-pdf.ts'))}
const output = process.argv[2]
app.setPath('userData', join(output, 'isolated-electron-profile'))
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  let requests = 0
  const server = createServer((_request, response) => { requests++; response.end('EXTERNAL_RESOURCE_MUST_NOT_PRINT') })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('验证资源监听失败。')
  const external = 'http://127.0.0.1:' + address.port + '/must-not-load'
  const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>@page{size:A4;margin:14mm 13mm 18mm}body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#3c3c3c}h1,h2{color:#005096}h1{border-bottom:3px solid #00bee6;padding-bottom:12px}.card{background:#b3ebff;padding:16px}.next{break-before:page}table{border-collapse:collapse;width:100%}td,th{padding:12px;border-bottom:1px solid #c1c6c8}th{background:#005096;color:white}@import url("' + external + '");</style></head><body><h1>贵州茅台：确定性研究报告 PDF 验证</h1><p class="card">研究结论：现金流修复仍待持续验证。事实、计算和研究判断分别追溯。</p><table><tr><th>指标</th><th>本期</th></tr><tr><td>营业收入</td><td>100.00 亿元</td></tr><tr><td>经营现金流</td><td>60.00 亿元</td></tr></table><svg viewBox="0 0 500 130"><rect x="20" y="20" width="280" height="35" fill="#0078b4"/><rect x="20" y="75" width="168" height="35" fill="#1eb9e1"/><text x="320" y="45">收入 100</text><text x="210" y="100">现金流 60</text></svg><h2 class="next">证据台账与风险提示</h2><p>此页用于检验分页、系统中文字体、内联 SVG、易方达主题色和页码。</p><p>内部验收样例，财务数值为虚构数据。</p><img src="' + external + '"><iframe src="' + external + '"></iframe><img src="file:///private/etc/passwd"><script>document.body.innerHTML="SCRIPT_MUST_NOT_EXECUTE";fetch("' + external + '")</script></body></html>'
  const service = new ResearchPdfRenderer()
  try {
    const result = await service.render(html)
    await writeFile(join(output, 'report.pdf'), Buffer.from(result.pdfBase64, 'base64'), { flag: 'wx' })
    await writeFile(join(output, 'report.html'), html, { flag: 'wx' })
    if (requests !== 0 || BrowserWindow.getAllWindows().length !== 0) throw Error('隔离验证失败。')
    await writeFile(join(output, 'electron-checks.json'), JSON.stringify({ bytes:result.bytes,sha256:result.sha256,externalRequests:requests,remainingWindows:BrowserWindow.getAllWindows().length,electron:process.versions.electron },null,2), { flag:'wx' })
    service.dispose()
    server.close()
    app.exit(0)
  } catch (error) { service.dispose(); server.close(); console.error(error); app.exit(1) }
}).catch(error => { console.error(error); app.exit(1) })
`)
  const executable = join(scratch, 'verify.cjs')
  await build({ entryPoints: [bootstrap], outfile: executable, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'silent' })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(electron, [executable, output], { env, stdio: 'inherit' })
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); resolve(code) })
  })
  if (exit !== 0) throw Error(`Electron PDF 验证失败，退出码 ${exit}。`)
  const pdf = await readFile(join(output, 'report.pdf'))
  const checks = JSON.parse(await readFile(join(output, 'electron-checks.json'), 'utf8'))
  if (checks.bytes !== pdf.length || checks.sha256 !== createHash('sha256').update(pdf).digest('hex')) throw Error('PDF 摘要不匹配。')
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const document = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, isEvalSupported: false }).promise
  let text = ''
  const pages = []
  for (let index = 1; index <= document.numPages; index++) {
    const page = await document.getPage(index), viewport = page.getViewport({ scale: 1 })
    text += (await page.getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ')
    pages.push({ width: viewport.width, height: viewport.height })
  }
  await document.destroy()
  const normalizedText = text.normalize('NFKC').replace(/\s/g, '')
  if (pages.length !== 2 || !pages.every(page => Math.abs(page.width - 595.28) < 2 && Math.abs(page.height - 841.89) < 2)) throw Error('PDF A4 分页验证失败。')
  if (!normalizedText.includes('贵州茅台') || !normalizedText.includes('证据台账') || !normalizedText.includes('100.00') || /SCRIPT_MUST_NOT_EXECUTE|EXTERNAL_RESOURCE_MUST_NOT_PRINT|root:/.test(text)) throw Error('PDF 正文或脚本隔离验证失败。')
  const result = { ...checks, pages, chineseText: true, inlineSvgText: normalizedText.includes('现金流60'), scriptDisabled: true, pdf: join(output, 'report.pdf') }
  await writeFile(join(output, 'verification.json'), JSON.stringify(result, null, 2), { flag: 'wx' })
  console.log(JSON.stringify(result, null, 2))
} finally { await rm(scratch, { recursive: true, force: true }) }
