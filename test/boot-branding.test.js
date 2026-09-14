import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { installBootBranding, patchBootBranding } from '../scripts/lib/boot-branding.mjs'

const sourcePath = new URL('../node_modules/@deepseek-ai/dsh-client-web/lib/index.js', import.meta.url)
async function originalSource() {
  // Allow the focused test to run after the production installer has branded dependencies.
  return (await readFile(sourcePath, 'utf8'))
    .replace('children: "EWork Odyssey"', 'children: "HARNESS"')
    .replace('(navigator.language.toLowerCase().startsWith("zh") ? "正在加载插件…" : "Loading plugins…")', '"Loading plugins…"')
}
const runtime = { jsx: (type, props) => ({ type, ...props }), jsxs: (type, props) => ({ type, ...props }), Fragment: 'fragment' }
function render(source, language, { settled = false, failed = false } = {}) {
  const ast = ts.createSourceFile('boot.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  expect(ast.parseDiagnostics).toEqual([])
  const boot = ast.statements.find(n => ts.isFunctionDeclaration(n) && source.slice(n.getStart(ast), n.end).includes('.wordmark'))
  if (!boot) throw new Error('AppRoot not found')
  const getSnapshot = value => ({ subscribe() {}, getSnapshot: () => value })
  return runInNewContext(`(${source.slice(boot.getStart(ast), boot.end)})(props)`, {
    ...runtime, useSyncExternalStore: (_subscribe, read) => read(),
    AppRoot_module_css_default: {}, navigator: { language },
    props: { settled: getSnapshot(settled), status: getSnapshot(failed ? { '@deepseek-ai/compat-id': 'failed' } : {}), error: getSnapshot(failed ? 'diagnostic HARNESS_KEY' : undefined), renderApp: () => 'real application' }
  })
}
function copyText(tree) {
  if (typeof tree === 'string') return tree
  if (Array.isArray(tree)) return tree.map(copyText).join('|')
  return tree && typeof tree === 'object' ? copyText(tree.children) : ''
}

describe('boot brand and locale at the pre-plugin boundary', () => {
  it.each(['zh-CN', 'zh-TW'])('uses the application Chinese locale %s before plugins settle', async language => {
    const source = await originalSource()
    const text = copyText(render(patchBootBranding(source), language))
    expect(text).toContain('EWork Odyssey')
    expect(text).toContain('正在加载插件…')
    expect(text).not.toContain('HARNESS')
  })
  it('keeps English, failure diagnostics and the settled application intact', async () => {
    const source = await originalSource()
    const branded = patchBootBranding(source)
    expect(copyText(render(branded, 'en-US'))).toContain('EWork Odyssey|')
    expect(copyText(render(branded, 'en-US'))).toContain('Loading plugins…')
    const failure = copyText(render(branded, 'zh-CN', { failed: true }))
    expect(failure).toContain('Failed to load plugins')
    expect(failure).toContain('@deepseek-ai/compat-id')
    expect(failure).toContain('diagnostic HARNESS_KEY')
    expect(failure).not.toContain('正在加载插件…')
    expect(copyText(render(branded, 'zh-CN', { settled: true }))).toBe('real application')
  })
  it('is repeatable, narrowly scoped, and rejects missing or duplicate display targets', async () => {
    const source = await originalSource()
    const branded = patchBootBranding(source)
    expect(patchBootBranding(branded)).toBe(branded)
    expect(branded.match(/@deepseek-ai\/[\w-]+/g)).toEqual(source.match(/@deepseek-ai\/[\w-]+/g))
    expect(() => patchBootBranding(source.replace('children: "HARNESS"', 'children: "Changed upstream"'))).toThrow(/wordmark/)
    expect(() => patchBootBranding(source + '\nconst extra = { className: x.wordmark, children: "HARNESS" };')).toThrow(/wordmark/)
    expect(() => patchBootBranding(source.replace('children: "Loading plugins…"', 'children: "Changed upstream"'))).toThrow(/hint/)
  })
  it('validates the packaged entry before changing the source module', async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'boot-branding-test-'))
    try {
      const source = await originalSource()
      const sourceFile = path.join(fixture, 'node_modules/@deepseek-ai/dsh-client-web/lib/index.js')
      const entry = path.join(fixture, 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-test.js')
      for (const file of [sourceFile, entry]) await mkdir(path.dirname(file), { recursive: true })
      await writeFile(sourceFile, source)
      await writeFile(entry, 'const unknownEntrypoint = true;')
      await expect(installBootBranding(fixture)).rejects.toThrow(/wordmark/)
      expect(await readFile(sourceFile, 'utf8')).toBe(source)
    } finally {
      await rm(fixture, { recursive: true, force: true })
    }
  })

})
