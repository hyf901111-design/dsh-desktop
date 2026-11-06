import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { spawn, execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import YAML from 'yaml'
import { createBackend, resultForHost } from '../../packages/dsh-computer-backends/index.js'
import { prepareNativeFixture } from './prepare.mjs'

const root = resolve(import.meta.dirname, '../..'), output = join(root, 'output/computer-use-bakeoff')
await mkdir(output, { recursive: true })
const profile = join(process.env.HOME, 'Library/Application Support/sherlock-desktop/harness')
const settings = YAML.parse(await readFile(join(profile, 'settings.yaml'), 'utf8'))
const provider = settings['llm-pi-ai'].providers['volcengine-agent-plan']
const credentials = YAML.parse(await readFile(join(profile, '.credentials.yaml'), 'utf8'))
const apiKey = credentials[provider.apiKeyEnv]
if (!apiKey || provider.baseURL !== 'https://ark.cn-beijing.volces.com/api/plan/v3') throw Error('缺少已配置的火山模型')
const model = 'deepseek-v4-1-flash-261017'
const maxTokens = Number(process.env.BENCH_MAX_TOKENS ?? 8192)
const html = await readFile(join(import.meta.dirname, 'fixture.html'))
const receipts = new Map()
const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/result') {
    let body = ''; for await (const chunk of req) body += chunk
    try { const value = JSON.parse(body); receipts.set(value.token, value) } catch {}
    res.end('ok')
  } else { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const cases = [
  { id: 'electron-text', scenario: 'text', prompt: '在 EWork Computer Use Benchmark 窗口的客户备注框输入“电脑操作验收 Flash 2026”，勾选确认内容，再点击保存备注。', verify: r => r?.value.text === '电脑操作验收 Flash 2026' && r?.value.confirmed === true },
  { id: 'browser-form', scenario: 'text', browser: true, prompt: '在 Google Chrome 的 EWork Computer Use Benchmark 页面输入客户备注“电脑操作验收 Flash 2026”，勾选确认内容，再保存备注。', verify: r => r?.value.text === '电脑操作验收 Flash 2026' && r?.value.confirmed === true },
  { id: 'scroll-select', scenario: 'scroll', prompt: '在 EWork Computer Use Benchmark 页面向下滚动找到页尾表单，选择第四季度，勾选已复核，再提交季度。', verify: r => r?.value.quarter === '第四季度' && r?.value.confirmed === true },
  { id: 'drag', scenario: 'drag', prompt: '在 EWork Computer Use Benchmark 页面将蓝色研究卡片拖入绿色目标框。', verify: r => r?.value.dropped === true },
  { id: 'layout-recovery', scenario: 'recovery', prompt: '在 EWork Computer Use Benchmark 页面点击载入验证；等待新布局出现，读取页面上新的测试码并填入，再确认测试码。', verify: r => r?.value.code === 'B7K9' },
  { id: 'native-multiwindow', native: true, prompt: '当前 NativeFixture 应用有两个窗口。请在标题为“EWork 测试 · 目标窗口”的验收文本框输入“电脑操作验收 Flash 2026”，点击保存验收。不要改动干扰窗口。', verify: r => r?.index === 0 && r?.text === '电脑操作验收 Flash 2026' && r?.decoyText === '' }
  ,{ id: 'textedit-file', textedit: true, prompt: '使用 macOS 文本编辑 TextEdit，在刚打开的 EWork验收测试 文档中，将原有内容全选替换为“电脑操作验收 Flash 2026”，再按 Command+S 保存原文件。只操作此验收文档，不操作其他窗口或文档。', verify: r => r?.text?.trim() === '电脑操作验收 Flash 2026' }
]
const requestedBackends = (process.env.BENCH_BACKENDS ?? 'peekaboo').split(',')
if (requestedBackends.some(id => id !== 'peekaboo')) throw Error('当前客户端只提供 Peekaboo 电脑控制；历史三方案比较见研究记录。')
const requestedCases = (process.env.BENCH_CASES ?? cases.map(x => x.id).join(',')).split(',')
if (requestedCases.includes('native-multiwindow')) await prepareNativeFixture(output)
const all = []
try {
for (const scenario of cases.filter(x => requestedCases.includes(x.id))) for (const backendId of requestedBackends) {
  const token = randomUUID(), directory = await mkdtemp(join(tmpdir(), 'ework-computer-benchmark-'))
  const nativeOutput = join(directory, 'result.json')
  const textFile = join(directory, 'EWork验收测试-' + token.slice(0, 6) + '.txt')
  if (scenario.textedit) await writeFile(textFile, '原始测试内容\n')
  const url = `http://127.0.0.1:${port}/?scenario=${scenario.scenario}&token=${token}`
  const launch = scenario.textedit ? ['/usr/bin/open', ['-a', 'TextEdit', textFile]] : scenario.native
    ? [join(output, 'NativeFixture.app/Contents/MacOS/NativeFixture'), []]
    : scenario.browser ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [`--user-data-dir=${directory}`, '--no-first-run', '--no-default-browser-check', '--force-renderer-accessibility', '--window-size=1080,820', '--window-position=180,60', '--app=' + url]]
    : [join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), [join(import.meta.dirname, 'electron.cjs')]]
  const fixture = spawn(launch[0], launch[1], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '', BENCH_URL: url, BENCH_PROFILE: directory, BENCH_OUTPUT: nativeOutput }, stdio: 'ignore' })
  const started = Date.now(), trace = [], errors = []
  let backend, receipt, toolCalls = 0, actualModel
  console.log('START', scenario.id, backendId)
  try {
    await new Promise(resolve => setTimeout(resolve, 2200))
    backend = await createBackend(backendId, { nativeDirectory: join(root, 'build/native'), signal: AbortSignal.timeout(30000) })
    const messages = [{ role: 'system', content: '你正在进行桌面操作能力测试。只操作用户指定的自有测试窗口，勿操作 Codex、聊天软件、终端或其他无关应用。不能使用脚本、网络或隐含 API 完成任务。已授权使用前台焦点和物理鼠标。每次只调用一个工具，先观察，使用真实元素/截图坐标；输入后验证。不要将工具已投递视为实际成功。任务成功后简短结束。' + backend.guidance }, { role: 'user', content: scenario.prompt + (scenario.textedit ? ' 本次唯一文件名：' + textFile.split('/').at(-1) : '') }]
    const tools = backend.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }))
    for (let turn = 0; turn < 24 && Date.now() - started < 240000; turn++) {
      const response = await fetch(provider.baseURL + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey }, body: JSON.stringify({ model, messages, tools, max_tokens: maxTokens, parallel_tool_calls: false }), signal: AbortSignal.timeout(60000) })
      const body = await response.json()
      if (!response.ok) throw Error('模型 HTTP ' + response.status + ': ' + (body.error?.code ?? 'request_failed'))
      actualModel = body.model
      const message = body.choices?.[0]?.message
      if (!message) throw Error('模型未返回消息')
      messages.push(message)
      if (!message.tool_calls?.length) { trace.push({ turn, text: message.content, finishReason: body.choices[0].finish_reason, usage: body.usage }); break }
      for (const call of message.tool_calls) {
        const args = JSON.parse(call.function.arguments), at = Date.now()
        let result
        try { result = await backend.call(call.function.name, args, AbortSignal.timeout(60000)) }
        catch (error) { result = { isError: true, content: [{ type: 'text', text: error.message }] }; errors.push(error.message) }
        toolCalls++
        const host = resultForHost(result)
        trace.push({ turn, tool: call.function.name, arguments: args, durationMs: Date.now() - at, isError: !!result.isError, text: JSON.stringify(host.data).slice(0,24000), images: host.screenshots.length })
        console.log('STEP', scenario.id, backendId, toolCalls, call.function.name, result.isError ? 'ERROR' : 'ok')
        // Text + provenance and separate visual message preserve tool results for this same model.
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(host.data) })
        if (host.screenshots.length) messages.push({ role: 'user', content: host.screenshots.map(img => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.dataBase64}` } })) })
      }
      receipt = scenario.textedit ? { text: await readFile(textFile, 'utf8') } : scenario.native ? await readFile(nativeOutput, 'utf8').then(JSON.parse).catch(() => undefined) : receipts.get(token)
      if (scenario.verify(receipt)) break
      // Keep recent visual observations, retain textual tool history.
      const visualIndices = messages.flatMap((m, i) => Array.isArray(m.content) ? [i] : [])
      for (const i of visualIndices.slice(0, -2)) messages[i] = { role: 'user', content: '较早的截图已省略，请以最新截图为准。' }
    }
  } catch (error) { errors.push(error.message) }
  finally {
    await backend?.close().catch(() => {})
    fixture.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  receipt = scenario.textedit ? { text: await readFile(textFile, 'utf8') } : scenario.native ? await readFile(nativeOutput, 'utf8').then(JSON.parse).catch(() => undefined) : receipts.get(token)
  const report = { backend: backendId, scenario: scenario.id, model, actualModel, maxTokens, success: !!scenario.verify(receipt), durationMs: Date.now() - started, toolCalls, receipt, errors, trace }
  const path = join(output, `${scenario.id}-${backendId}-${Date.now()}.json`)
  await writeFile(path, JSON.stringify(report, null, 2))
  all.push({ ...report, trace: undefined, evidence: path })
  await writeFile(join(output, 'results.json'), JSON.stringify(all, null, 2))
  console.log('RESULT', JSON.stringify({ backend: backendId, scenario: scenario.id, success: report.success, toolCalls, seconds: report.durationMs / 1000, errors }))
}
} finally { server.close() }
