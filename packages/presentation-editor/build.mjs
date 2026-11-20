import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('.', import.meta.url))
const project = resolve(source, '../..')
const work = join(project, 'node_modules/.cache/odyssey-pptist')
const dest = join(project, 'out/presentation-editor')
const archive = join(source, 'vendor/pptist-source.tgz')
const digest = createHash('sha256').update(readFileSync(archive)).digest('hex')
if (digest !== 'c0fd4756af28db4ecfdebb068e7ceb631b188190da69f8cee4e93a152e7fe24d')
  throw Error('PPTist source checksum mismatch')
mkdirSync(work, { recursive: true })
execFileSync('tar', ['-xzf', archive, '-C', work])
const lockPath = join(work, 'package-lock.json')
writeFileSync(
  lockPath,
  readFileSync(lockPath, 'utf8').replaceAll('https://registry.npmmirror.com/', 'https://registry.npmjs.org/')
)
if (!existsSync(join(work, 'node_modules/vite/bin/vite.js')) || !existsSync(join(work, digest))) {
  execFileSync(
    process.execPath,
    [
      process.env.npm_execpath ||
        join(resolve(process.execPath, '..', '..'), 'lib/node_modules/npm/bin/npm-cli.js'),
      'ci',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--registry=https://registry.npmjs.org'
    ],
    { cwd: work, stdio: 'inherit' }
  )
  writeFileSync(join(work, digest), '')
}
function edit(path, edits) {
  const target = join(work, path)
  let text = readFileSync(target, 'utf8')
  for (const [before, after] of edits) {
    if (!text.includes(before)) throw Error('PPTist upstream anchor changed: ' + before)
    text = text.replaceAll(before, after)
  }
  writeFileSync(target, text)
}
// Start each document with its own undo stack in the embedded editor.
edit('src/store/snapshot.ts', [
  [
    'await db.snapshots.add(newFirstSnapshot)',
    "this.setSnapshotCursor(-1); this.setSnapshotLength(0); await db.transaction('rw', db.snapshots, async () => { await db.snapshots.clear(); await db.snapshots.add(newFirstSnapshot) })"
  ],
  [
    'const snapshot = snapshots[snapshotCursor]',
    'const snapshot = snapshots[snapshotCursor]; if (!snapshot) return'
  ]
])
edit('src/views/components/element/ChartElement/Chart.vue', [
  [
    "import tinycolor from 'tinycolor2'",
    "import tinycolor from 'tinycolor2'\nimport { visibleBars } from '@/chart-points'"
  ],
  [
    '  updateOption()\n\n  const resizeListener',
    '  chartRef.value.odysseyBars = () => visibleBars(chart, chartRef.value, props.data)\n  updateOption()\n\n  const resizeListener'
  ]
])
edit('src/views/components/element/ChartElement/chartOption.ts', [
  [
    'const seriesItem: BarSeriesOption = {\n          data: item,',
    'const seriesItem: BarSeriesOption = {\n          data: item.map((value, point) => data.pointColors?.[index]?.[point] ? {value, itemStyle:{color:data.pointColors[index][point]}} : value),'
  ]
])
edit('src/types/slides.ts', [
  [
    'export interface ChartData {',
    'export interface ChartData {\n  pointColors?: Record<number, Record<number,string>>'
  ]
])
edit('src/views/Editor/Canvas/EditableElement.vue', [
  [
    ':id="`editable-element-${elementInfo.id}`"',
    ':id="`editable-element-${elementInfo.id}`" :data-pptx-node-id="elementInfo.id"'
  ]
])
// Keep imported media playable after the window or session has closed.
edit('src/hooks/useImport.ts', [
  ["videoMode: 'blob'", "videoMode: 'base64'"],
  ["audioMode: 'blob'", "audioMode: 'base64'"]
])
edit('src/hooks/useExport.ts', [
  [
    "styleAttr.value.split(';')",
    "styleAttr.value.replace(/&quot;|&#34;|&#x22;/gi, '\"').replace(/&apos;|&#39;|&#x27;/gi, \"'\").split(';')"
  ],
  [
    "options.fontFace = styleObj['font-family']",
    "options.fontFace = styleObj['font-family'].split(',')[0].trim().replace(/^[\"']|[\"']$/g, '')"
  ],
  [
    'pptx.writeFile({ fileName: `${title.value}.pptx` }).then(() => exporting.value = false).catch',
    "pptx.write({ outputType: 'arraybuffer' }).then(bytes => { window.dispatchEvent(new CustomEvent('odyssey:export', {detail:bytes})); exporting.value=false }).catch"
  ]
])
edit('src/main.ts', [["import '@/assets/styles/font.scss'", "import './odyssey.css'"]])
cpSync(join(project, 'src/shared/presentation-slide-title.ts'), join(work, 'src/presentation-slide-title.ts'))
cpSync(join(source, 'overlay'), join(work, 'src'), { recursive: true })
cpSync(join(project, 'scripts/lib/pptx-annotation-viewer.mjs'), join(work, 'src/native-annotations.mjs'))
cpSync(join(project, 'src/preload/pptx-annotations.css'), join(work, 'src/native-annotations.css'))
cpSync(join(project, 'src/preload/pptx-annotation-icons'), join(work, 'public/markers'), { recursive: true })
cpSync(join(source, 'icons'), join(work, 'public/icons'), { recursive: true })
cpSync(join(project, 'skills/efund-ppt-maker/assets/efund-template-v6.pptx'), join(work, 'public/efund.pptx'))
cpSync(join(source, 'index.html'), join(work, 'index.html'))
execFileSync(process.execPath, [join(work, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: work,
  stdio: 'inherit'
})
rmSync(dest, { recursive: true, force: true })
cpSync(join(work, 'dist'), dest, { recursive: true })
cpSync(join(work, 'LICENSE'), join(dest, 'LICENSE.txt'))
// Ship the corresponding source of the embedded editor alongside its binary.
mkdirSync(join(dest, 'source'), { recursive: true })
execFileSync('tar', [
  '-czf',
  join(dest, 'source/editor.tgz'),
  '-C',
  project,
  'packages/presentation-editor',
  'src/shared/presentation-slide-title.ts',
  'scripts/lib/pptx-annotation-viewer.mjs',
  'src/preload/pptx-annotations.css',
  'src/preload/pptx-annotation-icons',
  'skills/efund-ppt-maker/assets/efund-template-v6.pptx'
])
