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
edit('src/assets/styles/variable.scss', [['$themeColor: #d14424;', '$themeColor: #588afa;']])
writeFileSync(join(work, 'src/store/snapshot.ts'), "export { useSnapshotStore } from '../editor-history'\n")
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
    ':id="`editable-element-${elementInfo.id}`" :data-pptx-node-id="elementInfo.odysseyMaster ? undefined : elementInfo.id" :inert="elementInfo.odysseyMaster || undefined" :data-master-art="elementInfo.odysseyMaster || undefined"'
  ]
])
// Keep imported media playable after the window or session has closed.
edit('src/hooks/useImport.ts', [
  ['parseElements([...item.elements, ...item.layoutElements])',
    'parseElements(item.layoutElements); for (const element of slide.elements) Object.assign(element, { lock:true, odysseyMaster:true }); parseElements(item.elements)'],
  ["videoMode: 'blob'", "videoMode: 'base64'"],
  ["audioMode: 'blob'", "audioMode: 'base64'"]
])
edit('src/hooks/useExport.ts', [
  ['for (const slide of _slides) {\n      const pptxSlide = pptx.addSlide()',
    "for (const slide of _slides) {\n      const masterName = 'OdysseyMaster' + (_slides.indexOf(slide)+1); const inherited = slide.elements.some(e=>e.odysseyMaster); if(inherited)pptx.defineSlideMaster({title:masterName,objects:[]}); const pptxSlide = inherited ? pptx.addSlide({masterName}) : pptx.addSlide()"],
  ['for (const el of slide.elements) {', 'for (const el of slide.elements) {\n        const beforeArtwork = pptxSlide._slideObjects.length'],
  // clip.range is a percentage. Physical pixel density applies only when converting the result to inches.
  ...['startX', 'startY', '(endX - startX)', '(endY - startY)'].map(value => [
    value + ' / ratioPx2Inch.value', value + ' / 100'
  ]),
  ['pptxSlide.addChart(type, chartData, options)', "pptxSlide.addChart(type, chartData, {...options, objectName:'OdysseyChart-'+el.id})"],
  ['pptxSlide.addTable(tableData, options)', "pptxSlide.addTable(tableData, {...options, objectName:'OdysseyTable-'+el.id, autoPage:false})"],
  ['pptxSlide.addMedia(options)\n          }\n        }\n      }',
    "pptxSlide.addMedia(options)\n          }\n        }\n        if(el.odysseyMaster)for(const object of pptxSlide._slideObjects.slice(beforeArtwork))object.options.objectName=typeof el.odysseyPageNumber==='number' ? 'OdysseyPageNumber' : 'OdysseyInheritedArtwork'\n      }"],
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
// PowerPoint's Tab cycle and Clear Canvas operate on slide content only.
edit('src/hooks/useDeleteElement.ts', [
  ['slidesStore.updateSlide({ elements: [] })',
    "slidesStore.updateSlide({ elements: currentSlide.value.elements.filter(el => 'odysseyMaster' in el && el.odysseyMaster) })"]
])
edit('src/hooks/useGlobalHotkey.ts',[
  ['const tabActiveElement = () => {\n    if (!currentSlide.value.elements.length) return',
    "const tabActiveElement = () => {\n    const selectable = currentSlide.value.elements.filter(el => !el.lock)\n    if (!selectable.length) return"],
  ['const firstElement = currentSlide.value.elements[0]', 'const firstElement = selectable[0]'],
  ['const currentIndex = currentSlide.value.elements.findIndex', 'const currentIndex = selectable.findIndex'],
  ['currentIndex >= currentSlide.value.elements.length - 1', 'currentIndex >= selectable.length - 1'],
  ['const nextElementId = currentSlide.value.elements[nextIndex].id', 'const nextElementId = selectable[nextIndex].id'],
  ['const { ctrlKey, shiftKey, altKey, metaKey } = e',
    "if (document.querySelector('.deck-app[data-readonly]') || (e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable=true],.selection-format,.style-popover,.theater')) return; const { ctrlKey, shiftKey, altKey, metaKey } = e"],
  ['e.preventDefault()\n      undo()', 'e.preventDefault()\n      if (shiftKey) redo(); else undo()']
])
edit('src/hooks/usePasteEvent.ts', [['if (!editorAreaFocus.value', "if (document.querySelector('.deck-app[data-readonly]')) return\n    if (!editorAreaFocus.value"]])
// PowerPoint stores the author's measured extent even for auto-fit text. Chromium
// may measure a different font height on first paint. Visiting a slide must not
// save that measurement as an edit. Resume auto-fit after its text or style changes.
edit('src/views/components/element/TextElement/index.vue', [
  ['watch(() => props.elementInfo.inset,', "watch(() => props.elementInfo.inset?.join(','),"],
  [
  'const updateTextElementHeight = (entries: ResizeObserverEntry[]) => {',
  `let autoFitEdited = false
watch([() => props.elementInfo.content, () => props.elementInfo.defaultFontName, () => props.elementInfo.lineHeight,
  () => props.elementInfo.wordSpace, () => props.elementInfo.paragraphSpace, () => props.elementInfo.vertical,
  () => props.elementInfo.vertical ? props.elementInfo.height : props.elementInfo.width],
  () => { autoFitEdited = true }, { flush: 'sync' })

const updateTextElementHeight = (entries: ResizeObserverEntry[]) => {
  if (slidesStore.currentSlide?.odysseyOfficeVersion && !autoFitEdited) return`
]])
edit('src/views/components/element/ProsemirrorEditor.vue', [
  ['const handleBlur = () => {', "const flushText = () => handleInput.flush()\nonMounted(() => document.addEventListener('odyssey:flush-text', flushText))\nonUnmounted(() => {document.removeEventListener('odyssey:flush-text', flushText); handleInput.cancel()})\nconst handleBlur = () => {\n  handleInput.flush()"],
])
const officeArchive = join(source, 'vendor/office-renderer-1.2.4.tgz')
if (createHash('sha256').update(readFileSync(officeArchive)).digest('hex') !== 'ce3ed6237030f52f9bab8e04f875434839fcd32ae656e3578f6e56cfcbd2b8c5') throw Error('Office renderer checksum mismatch')
const officeEngine = join(work,'node_modules/@aiden0z/pptx-renderer')
mkdirSync(officeEngine,{recursive:true})
execFileSync('tar',['-xzf',officeArchive,'--strip-components=1','-C',officeEngine])
edit('node_modules/@aiden0z/pptx-renderer/dist/aiden0z-pptx-renderer.es.js', [
  ['const o = wo.init(t);', "const o = wo.init(t, undefined, {renderer:'svg'});"]
])
for (const file of ['index.vue','BaseChartElement.vue']) {
  edit('src/views/components/element/ChartElement/'+file, [
    ["import Chart from './Chart.vue'", "import Chart from '@/OfficeChart.vue'"],
    [':options="elementInfo.options"', ':options="elementInfo.options" :source="elementInfo.officeChart"']
  ])
}
// Imported tables keep Office row geometry and individual cell edges in both canvas renderers.
// The imported row heights already specify the Office table's bounds. DOM
// layout rounds those heights even when the user has only changed slides.
edit('src/views/components/element/TableElement/index.vue', [[
  'const updateTableElementHeight = (entries: ResizeObserverEntry[]) => {',
  `let tableLayoutEdited = false
watch([() => JSON.stringify(props.elementInfo.data), () => props.elementInfo.width,
  () => props.elementInfo.rowHeights?.join(','), () => props.elementInfo.colWidths?.join(','),
  () => props.elementInfo.cellMinHeight], () => { tableLayoutEdited = true }, { flush: 'sync' })
const updateTableElementHeight = (entries: ResizeObserverEntry[]) => {
  if (slidesStore.currentSlide?.odysseyOfficeVersion && !tableLayoutEdited) return`
]])
edit('src/views/components/element/TableElement/utils.ts', [
  ["borderWidth: outline.width + 'px',", "borderWidth: outline.width + 'px',\n    ...Object.fromEntries(Object.entries(style?.officeBorders || {}).map(([edge,css])=>['border'+edge,css])),"],
  ["minHeight: (cellMinHeight - 4) + 'px',", "minHeight: cellMinHeight + 'px', boxSizing:'border-box',\n    ...(style?.officeInsets ? {padding:style.officeInsets.map(n=>n+'px').join(' '),lineHeight:1.05} : {}),"]
])
edit('src/hooks/useImport.ts', [
  ["if (fixedViewBoxPresetShapeTypes.includes(el.shapType) && el.pathViewBox) {", "if (['circularArrow','leftCircularArrow','leftRightCircularArrow'].includes(el.shapType)) {\n                    element.viewBox = [originWidth,originHeight]\n                  } else if (fixedViewBoxPresetShapeTypes.includes(el.shapType) && el.pathViewBox) {"],
  ['Math.max(height * ratio, cellMinHeight)', 'height * ratio'],
  ['el.rowHeights[0] ? el.rowHeights[0] * ratio : 36', 'el.rowHeights.length ? Math.min(12, ...el.rowHeights.filter(h=>h>0).map(h=>h*ratio)) : 36'],
  ['Math.floor(parseFloat(p1) * ratio)', 'Number((parseFloat(p1) * ratio).toFixed(2))'],
  ['if (metrics.margin) textEl.paragraphSpace = metrics.margin','textEl.paragraphSpace = metrics.margin || 0'],
  ['if (metrics.margin) element.text!.paragraphSpace = metrics.margin','element.text!.paragraphSpace = metrics.margin || 0']
])
edit('src/main.ts', [["import '@/assets/styles/font.scss'", "import './odyssey.css'"]])
cpSync(join(project, 'src/shared/presentation-slide-title.ts'), join(work, 'src/presentation-slide-title.ts'))
cpSync(join(source, 'overlay'), join(work, 'src'), { recursive: true })
const appIcon = 'build/brand/odyssey-app-presentation.svg'
cpSync(join(project, appIcon), join(work, 'src/presentation-app.svg'))
cpSync(join(project, 'scripts/lib/pptx-annotation-viewer.mjs'), join(work, 'src/native-annotations.mjs'))
cpSync(join(project, 'src/preload/pptx-annotations.css'), join(work, 'src/native-annotations.css'))
cpSync(join(project, 'src/preload/pptx-annotation-icons'), join(work, 'public/markers'), { recursive: true })
cpSync(join(source, 'layout-art'), join(work, 'public/layout-art'), {recursive:true})
cpSync(join(project,'skills/efund-ppt-maker/assets/fonts/STHeiti_YFD.ttf'),join(work,'public/STHeiti_YFD.ttf'))
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
cpSync(join(officeEngine,'LICENSE'),join(dest,'office-renderer-LICENSE.txt'))
// Ship the corresponding source of the embedded editor alongside its binary.
mkdirSync(join(dest, 'source'), { recursive: true })
execFileSync('tar', [
  '-czf',
  join(dest, 'source/editor.tgz'),
  '-C',
  project,
  'packages/presentation-editor',
  appIcon,
  'src/shared/presentation-slide-title.ts',
  'scripts/lib/pptx-annotation-viewer.mjs',
  'src/preload/pptx-annotations.css',
  'src/preload/pptx-annotation-icons',
  'skills/efund-ppt-maker/assets/fonts/STHeiti_YFD.ttf',
  'skills/efund-ppt-maker/assets/efund-template-v6.pptx'
])
