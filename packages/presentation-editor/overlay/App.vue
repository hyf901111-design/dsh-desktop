<template>
  <main
    @keydown.capture="protectReadOnly"
    @paste.capture="protectReadOnly"
    @cut.capture="protectReadOnly"
    class="deck-app"
    :data-readonly="!editable || undefined"
    @keydown.esc="menu = ''"
  >
    <input ref="fileInput" type="file" accept=".pptx" hidden @change="importFile" />
    <input ref="imageInput" type="file" accept="image/*" hidden @change="insertImage" />
    <div v-if="!docId" class="empty">
      <button v-if="recent.length" class="recent" @click="toggle('recent')">
        最近使用
        <Glyph name="down" />
      </button>
      <div v-if="menu === 'recent'" class="menu recent-menu">
        <button v-for="d in recent" :key="d.id" @click="open(d.id)">{{ d.title }}</button>
      </div>
      <div class="empty-content">
        <Glyph name="slide" />
        <h1>开始制作演示文稿</h1>
        <p>导入已有 PowerPoint，或在右侧对话里描述你要制作的演示文稿。</p>
        <div>
          <button class="primary" :disabled="!ready" @click="create">
            <Glyph name="plus" />
            新建空白演示文稿
          </button>
          <button class="outline" :disabled="!ready" @click="fileInput.click()">导入 PowerPoint</button>
        </div>
      </div>
      <p v-if="notice" class="empty-notice" role="status">{{ notice }}</p>
    </div>
    <template v-else-if="slide">
      <nav class="ribbon" aria-label="演示编辑工具">
        <button aria-label="菜单" @click="toggle('commands')">
          <Glyph name="menu" />
          <span>菜单</span>
          <Glyph name="down" />
        </button>
        <i />
        <button title="撤销" aria-label="撤销" @click="undoEdit"><Glyph name="undo" /></button>
        <button title="重做" aria-label="重做" @click="hist.redo"><Glyph name="redo" /></button>
        <i />
        <button title="新建幻灯片" @click="slideActions.createSlide">
          <Glyph name="newslide" />
          <span>新建幻灯片</span>
        </button>
        <button title="版式" @click="toggle('layout')">
          <Glyph name="layout" />
          <span>版式</span>
          <Glyph name="down" />
        </button>
        <i />
        <select
          aria-label="字体"
          :value="main.richTextAttrs.fontname || '华文黑体'"
          @change="command('fontname', $event.target.value)"
        >
          <option v-for="f in ['华文黑体', '微软雅黑', '宋体', 'Arial']">{{ f }}</option>
        </select>
        <select
          aria-label="字号"
          :value="parseInt(main.richTextAttrs.fontsize) || 24"
          @change="command('fontsize', $event.target.value + 'px')"
        >
          <option v-for="s in [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72]">{{ s }}</option>
        </select>
        <button
          aria-label="加粗"
          :aria-pressed="Boolean(main.richTextAttrs.bold)"
          @mousedown.prevent
          @click="command('bold')"
        >
          <b>B</b>
        </button>
        <button aria-label="斜体" @mousedown.prevent @click="command('em')"><em>I</em></button>
        <button aria-label="下划线" @mousedown.prevent @click="command('underline')"><u>U</u></button>
        <label class="color" title="文字颜色">
          A
          <input type="color" aria-label="文字颜色" @input="command('color', $event.target.value)" />
        </label>
        <button aria-label="对齐" @click="toggle('align')"><Glyph name="align" /></button>
        <button aria-label="项目符号" @mousedown.prevent @click="command('bulletList')">
          <Glyph name="list" />
        </button>
        <i />
        <button title="插入" @click="toggle('insert')">
          <Glyph name="insert" />
          <span>插入</span>
          <Glyph name="down" />
        </button>
        <div class="grow" />
        <button aria-label="标注" :aria-pressed="marking" @click="marking = !marking">
          <Glyph name="mark" />
          <span>标注</span>
        </button>
        <button aria-label="从当前页放映" @click="play">
          <Glyph name="play" />
          <span>放映</span>
        </button>
        <button aria-label="更多" @click="toggle('more')"><Glyph name="more" /></button>
      </nav>
      <div v-if="menu && menu !== 'recent'" class="menu" :style="menuPos">
        <template v-if="menu === 'commands'">
          <button v-for="item in commandGroups" :key="item.id" @click="menu = item.id">
            <Glyph :name="item.icon" />
            <span>{{ item.label }}</span>
            <Glyph class="end" name="menu-right" />
          </button>
        </template>
        <button
          v-if="menuHeadings[menu]"
          class="menu-back"
          @click="menu = ['export', 'files'].includes(menu) ? 'file' : 'commands'"
        >
          <Glyph name="menu-undo" />
          {{ menuHeadings[menu] }}
        </button>
        <template v-if="menu === 'file'">
          <button @click="chooseFile(fileInput)">
            <Glyph name="menu-upload" />
            导入 PowerPoint…
          </button>
          <button @click="menu = 'export'">
            <Glyph name="menu-download" />
            导出演示文稿
            <Glyph class="end" name="menu-right" />
          </button>
          <button @click="create">
            <Glyph name="menu-plus" />
            新建空白演示文稿
          </button>
          <button @click="importTemplate">
            <Glyph name="menu-slide" />
            从易方达 V6 模板新建
          </button>
          <button v-if="recent.length > 1" @click="menu = 'files'">
            <Glyph name="menu-file" />
            最近使用
          </button>
        </template>
        <template v-if="menu === 'edit'">
          <button :disabled="!canUndoAI" @click="menuAction('undo')">
            <Glyph name="undo" />
            撤销 AI 修改
          </button>
          <button @click="undoEdit">
            <Glyph name="undo" />
            撤销编辑
          </button>
          <button @click="hist.redo">
            <Glyph name="redo" />
            重做编辑
          </button>
        </template>
        <template v-if="menu === 'export'">
          <button @click="exportDeck">
            <Glyph name="menu-file" />
            PowerPoint 演示文稿 (.pptx)
          </button>
        </template>
        <template v-if="menu === 'view'">
          <button @click="play">
            <Glyph name="play" />
            从当前页放映
          </button>
          <button @click="fullscreen">
            <Glyph name="fit" />
            全屏
          </button>
        </template>
        <template v-if="menu === 'more'">
          <button @click="menu = 'file'">
            <Glyph name="menu-slide" />
            演示文稿
          </button>
          <button @click="menuAction('reload')">
            <Glyph name="redo" />
            重新载入已保存版本
          </button>
          <details>
            <summary>关于 PPTist</summary>
            <p>PPTist · AGPL-3.0</p>
            <a href="./LICENSE.txt" download>开源许可证</a>
            ·
            <a href="./source/editor.tgz" download>编辑器源码</a>
          </details>
        </template>
        <template v-if="menu === 'files'">
          <button v-for="d in recent" @click="open(d.id)">{{ d.title }}</button>
        </template>
        <template v-if="menu === 'insert'">
          <button @click="insert('text')">
            <Glyph name="menu-text" />
            文本框
          </button>
          <button @click="insert('shape')">
            <Glyph name="menu-shape" />
            形状
          </button>
          <button @click="chooseFile(imageInput)">
            <Glyph name="menu-image" />
            图片…
          </button>
          <button @click="insert('chart')">柱状图</button>
          <button @click="insert('table')">表格</button>
        </template>
        <template v-if="menu === 'layout'">
          <button @click="insertLayout(false)">标题</button>
          <button @click="insertLayout(true)">标题和正文</button>
        </template>
        <template v-if="menu === 'align'">
          <button v-for="(v, k) in { left: '左对齐', center: '居中', right: '右对齐' }" @click="alignText(k)">
            {{ v }}
          </button>
        </template>
      </div>
      <div class="doc-line">
        <Glyph name="slide" />
        <input
          :readonly="!editable"
          aria-label="文稿名称"
          :value="store.title"
          maxlength="256"
          @change="rename($event.target)"
        />
        <span>第 {{ index + 1 }} 页{{ caption(slide) ? ' ／ ' + caption(slide) : '' }}</span>
      </div>
      <div class="work">
        <aside class="pages">
          <header>
            幻灯片
            <button title="新建幻灯片" @click="slideActions.createSlide"><Glyph name="plus" /></button>
          </header>
          <button
            v-for="(page, i) in store.slides"
            :key="page.id"
            class="page-row"
            :aria-current="i === index ? 'page' : undefined"
            @click="selectSlide(i)"
          >
            <span class="num">{{ i + 1 }}</span>
            <div class="page-detail">
              <div class="thumb"><ThumbnailSlide :slide="page" :size="106" /></div>
              <span>{{ caption(page) || '幻灯片 ' + (i + 1) }}</span>
            </div>
          </button>
        </aside>
        <section class="edit-col sherlock-ppt-editor" :data-readonly="!editable || undefined">
          <div ref="stage" class="canvas-slot">
            <div class="slide-area" :data-slide-index="index"><Canvas /></div>
          </div>
          <div class="notes" :style="{ height: noteHeight + 'px' }">
            <div class="grip" @pointerdown="resizeNotes"></div>
            <textarea
              :readonly="!editable"
              aria-label="演讲者备注"
              :value="noteText"
              @input="editNotes"
              @pointerup="noteReference"
              @keyup.shift="noteReference"
              placeholder="单击添加备注"
            ></textarea>
          </div>
        </section>
      </div>
      <footer>
        <span>第 {{ index + 1 }} 页，共 {{ store.slides.length }} 页</span>
        <span>{{ ratio }}</span>
        <span role="status">{{ notice || '已保存' }}</span>
        <div class="grow" />
        <button title="缩小" @click="zoom.scaleCanvas('-')"><Glyph name="minus" /></button>
        <button title="适合窗口" @click="zoom.resetCanvas">适合</button>
        <button title="放大" @click="zoom.scaleCanvas('+')"><Glyph name="plus" /></button>
        <button title="全屏" @click="fullscreen"><Glyph name="fit" /></button>
      </footer>
    </template>
    <div
      v-if="playing && slide"
      ref="theater"
      class="theater"
      tabindex="0"
      @click.self="advance(1)"
      @keydown="playKey"
    >
      <div @click="advance(1)"><ThumbnailSlide :slide="slide" :size="screenWidth" /></div>
      <button @click.stop="stopPlaying">×　退出放映</button>
      <nav>
        <button @click="advance(-1)">上一页</button>
        <span>{{ index + 1 }} / {{ store.slides.length }}</span>
        <button @click="advance(1)">下一页</button>
      </nav>
    </div>
  </main>
</template>
<script setup>
import { computed, defineComponent, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSlidesStore, useMainStore, useSnapshotStore } from '@/store'
import Canvas from '@/views/Editor/Canvas/index.vue'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index.vue'
import useImport from '@/hooks/useImport'
import useExport from '@/hooks/useExport'
import useCreateElement from '@/hooks/useCreateElement'
import useSlideHandler from '@/hooks/useSlideHandler'
import useScaleCanvas from '@/hooks/useScaleCanvas'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useGlobalHotkey from '@/hooks/useGlobalHotkey'
import usePasteEvent from '@/hooks/usePasteEvent'
import emitter, { EmitterEvents } from '@/utils/emitter'
import { slideTitle } from './presentation-slide-title'
import { attachEditorMarks } from './annotations'

const Glyph = defineComponent({
  props: ['name'],
  setup: (p) => () => h('img', { class: 'glyph', alt: '', src: './icons/' + p.name + '.svg' })
})
const store = useSlidesStore(),
  main = useMainStore(),
  snapshots = useSnapshotStore()
const importer = useImport(),
  exporter = useExport(),
  elements = useCreateElement(),
  slideActions = useSlideHandler(),
  hist = useHistorySnapshot(),
  zoom = useScaleCanvas()
useGlobalHotkey()
usePasteEvent()
const fileInput = ref(),
  imageInput = ref(),
  stage = ref(),
  theater = ref(),
  menu = ref(''),
  menuPos = ref({}),
  noteHeight = ref(78)
const docId = ref(''),
  ready = ref(false),
  recent = ref([]),
  notice = ref(''),
  playing = ref(false),
  marking = ref(false),
  screenWidth = ref(1000)
const slide = computed(() => store.currentSlide),
  index = computed(() => store.slideIndex)
const ratio = computed(() =>
  Math.abs(store.viewportRatio - 9 / 16) < 0.002
    ? '16:9'
    : Math.abs(store.viewportRatio - 0.75) < 0.002
      ? '4:3'
      : Math.round((1 / store.viewportRatio) * 100) / 100 + ':1'
)
let revision = 0,
  baseline = '',
  loading = false,
  editable = true,
  freeze = false,
  importing = null,
  markViewer,
  hydration = 0
const parse = (html) => new DOMParser().parseFromString(html || '', 'text/html').body
function plain(html) {
  const root = parse(html)
  root.querySelectorAll('br').forEach((b) => b.replaceWith('\n'))
  root.querySelectorAll('p:not(:last-child)').forEach((p) => p.append('\n'))
  return root.textContent || ''
}
const canUndoAI = ref(false)
function undoEdit() {
  menu.value = ''
  if (canUndoAI.value) send('undo')
  else hist.undo()
}
let committedMarkIds = new Set()
const noteText = computed(() => plain(slide.value?.remark))
const caption = (page) => (page ? slideTitle(page, store.viewportSize, store.viewportRatio, plain) : '')
const escape = (t) => t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const origin = new URLSearchParams(location.search).get('host') || '*'
function send(type, data = {}) {
  window.parent.postMessage({ channel: 'odyssey-presentation', type, ...data }, origin)
}
const snapshot = () => ({
  id: docId.value,
  title: store.title,
  viewportRatio: store.viewportRatio,
  viewportSize: store.viewportSize,
  theme: store.theme,
  slides: store.slides
})
function save(create = false, importId) {
  if (loading || !docId.value || !editable || freeze || importing) return
  const json = JSON.stringify(snapshot())
  if (!create && json === baseline) return
  baseline = json
  canUndoAI.value = false
  notice.value = '保存中…'
  send('save', { deck: JSON.parse(json), revision: revision++, create, importId, slideId: slide.value?.id })
}
watch(
  () => [store.title, store.viewportSize, store.viewportRatio, store.theme, store.slides],
  () => save(),
  { deep: true }
)
function remember() {
  recent.value = [
    { id: docId.value, title: store.title },
    ...recent.value.filter((d) => d.id !== docId.value)
  ]
}
async function hydrate(d) {
  const seq = ++hydration
  loading = true
  freeze = false
  marking.value = false
  menu.value = ''
  canUndoAI.value = !!d.record.canUndoAI
  revision = d.record.revision
  editable = d.editable
  ready.value = true
  document.body.toggleAttribute('data-ds-dark-theme', d.dark)
  notice.value = editable ? '' : '只读'
  if (d.recent) recent.value = d.recent
  committedMarkIds = new Set()
  const deck = d.record.deck
  docId.value = deck?.id || ''
  main.setActiveElementIdList([])
  if (deck) {
    store.setSlides(deck.slides)
    store.updateSlideIndex(
      Math.max(
        0,
        deck.slides.findIndex((s) => s.id === d.slideId)
      )
    )
    store.setTitle(deck.title)
    store.setViewportSize(deck.viewportSize)
    store.setViewportRatio(deck.viewportRatio)
    if (deck.theme) store.setTheme(deck.theme)
    remember()
    baseline = JSON.stringify(snapshot())
  } else store.setSlides([])
  await nextTick()
  if (seq !== hydration) return
  loading = false
  if (deck) {
    void snapshots.initSnapshotDatabase()
    send('position', { documentId: docId.value, slideId: slide.value.id })
  }
}
function receive(event) {
  if (
    event.source !== parent ||
    event.data?.channel !== 'odyssey-presentation' ||
    (origin !== '*' && event.origin !== origin)
  )
    return
  const d = event.data
  if (d.type === 'load') void hydrate(d)
  else if (d.type === 'flush') {
    nextTick(() => {
      save()
      send('flushed', { id: d.id })
    })
  } else if (d.type === 'referenced-marks') {
    committedMarkIds = new Set(d.ids)
    markViewer?.redraw()
  } else if (d.type === 'import') {
    if (d.revision !== revision || !editable || importing || freeze) {
      send('import-error', { importId: d.importId })
      return
    }
    readFile(new File([d.bytes], d.title), d.importId)
  } else if (d.type === 'theme') document.body.toggleAttribute('data-ds-dark-theme', d.dark)
  else if (d.type === 'saved' && d.revision === revision) {
    notice.value = '已保存'
    remember()
  } else if (d.type === 'status') notice.value = d.message
  else if (d.type === 'error') {
    notice.value = d.message
    if (d.conflict) freeze = true
  }
}
function create() {
  if (!ready.value || !editable) return
  menu.value = ''
  marking.value = false
  docId.value = crypto.randomUUID()
  store.setSlides([{ id: crypto.randomUUID(), elements: [] }])
  store.updateSlideIndex(0)
  store.setViewportSize(1000)
  store.setViewportRatio(9 / 16)
  store.setTitle('未命名演示文稿')
  main.setActiveElementIdList([])
  freeze = false
  save(true)
  void snapshots.initSnapshotDatabase()
}
const open = (id) => {
  menu.value = ''
  send('open', { id })
}
const commandGroups = [
  { id: 'file', label: '演示文稿', icon: 'menu-slide' },
  { id: 'edit', label: '编辑', icon: 'menu-edit' },
  { id: 'insert', label: '插入', icon: 'menu-plus' },
  { id: 'align', label: '格式', icon: 'menu-text' },
  { id: 'view', label: '视图', icon: 'menu-screen' }
]
const menuHeadings = {
  file: '演示文稿',
  edit: '编辑',
  view: '视图',
  export: '导出演示文稿',
  files: '最近使用'
}
function chooseFile(input) {
  menu.value = ''
  input.click()
}
function menuAction(action) {
  menu.value = ''
  send(action)
}
function alignText(alignment) {
  menu.value = ''
  command('align', alignment)
}
function toggle(name) {
  if (menu.value === name) {
    menu.value = ''
    return
  }
  const rect = document.activeElement?.getBoundingClientRect()
  menuPos.value = { left: Math.min(Math.max(8, rect?.left || 8), innerWidth - 218) + 'px', top: '40px' }
  menu.value = name
}
function rename(input) {
  const title = input.value.trim()
  if (title && editable) store.setTitle(title)
  input.value = store.title
}
function selectSlide(i) {
  menu.value = ''
  main.setActiveElementIdList([])
  store.updateSlideIndex(i)
}
function reference(ref) {
  send('selection', { reference: ref ? { slideId: slide.value?.id, ...ref } : undefined })
}
watch(
  () => slide.value?.id,
  (id) => {
    reference()
    if (id) send('position', { documentId: docId.value, slideId: id })
    nextTick(() => markViewer?.redraw())
  }
)
watch(
  () => main.activeElementIdList.slice(),
  (ids) => {
    if (loading || marking.value || !slide.value) return
    const e = slide.value.elements.find((el) => el.id === ids.at(-1))
    reference(
      e
        ? {
            kind: 'element',
            id: e.id,
            label:
              plain(e.content || e.text?.content)
                .trim()
                .slice(0, 45) ||
              { chart: '图表', table: '表格', image: '图片', shape: '形状' }[e.type] ||
              '幻灯片元素'
          }
        : null
    )
  }
)
function noteReference(event) {
  const t = event.target,
    quote = t.value.slice(t.selectionStart, t.selectionEnd)
  reference(quote ? { kind: 'notes', start: t.selectionStart, quote, label: quote.slice(0, 40) } : null)
}
function editNotes(e) {
  slide.value.remark = e.target.value
    .split('\n')
    .map((s) => '<p>' + escape(s) + '</p>')
    .join('')
  hist.addHistorySnapshot()
}
function protectReadOnly(event) {
  if (
    editable &&
    event.type === 'keydown' &&
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'z' &&
    !event.shiftKey &&
    canUndoAI.value
  ) {
    event.preventDefault()
    event.stopPropagation()
    undoEdit()
    return
  }
  if (
    editable ||
    playing.value ||
    (event.type === 'keydown' && ['Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key))
  )
    return
  if (event.type === 'keydown' && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') return
  event.preventDefault()
  event.stopPropagation()
}
function resizeNotes(e) {
  const y = e.clientY,
    h = noteHeight.value,
    el = e.currentTarget
  el.setPointerCapture(e.pointerId)
  el.onpointermove = (event) => (noteHeight.value = Math.min(300, Math.max(38, h + y - event.clientY)))
  el.onlostpointercapture = () => (el.onpointermove = null)
}
const command = (command, value) => {
  emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action: { command, value } })
}
function insert(kind) {
  menu.value = ''
  if (kind === 'table') elements.createTableElement(3, 3)
  if (kind === 'chart') elements.createChartElement('bar')
  if (kind === 'text')
    elements.createTextElement({ left: 64, top: 64, width: 400, height: 52 }, { content: '<p>文本</p>' })
  if (kind === 'shape')
    elements.createShapeElement(
      { left: 80, top: 90, width: 240, height: 128 },
      { viewBox: [200, 200], path: 'M0 0H200V200H0Z', pptxShapeType: 'rect' }
    )
}
function insertLayout(body) {
  menu.value = ''
  const count = slide.value.elements.length
  if (count) {
    slideActions.createSlide()
  }
  elements.createTextElement(
    { left: 50, top: 38, width: 890, height: 70 },
    { content: '<p style="font-size:36px">单击编辑标题</p>' }
  )
  if (body)
    elements.createTextElement(
      { left: 50, top: 150, width: 890, height: 282 },
      { content: '<p>单击编辑正文</p>' }
    )
}
function insertImage(e) {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  const r = new FileReader()
  r.onload = () => elements.createImageElement(r.result)
  r.readAsDataURL(f)
}
function readFile(file, importId) {
  if (!file || !editable || importing) return
  if (file.size > 64 * 1024 * 1024) {
    notice.value = '文件超过 64 MB。'
    return
  }
  const before = store.slides
  importing = { before, importId, title: file.name.replace(/\.pptx$/i, '') }
  notice.value = '正在导入…'
  importer.importPPTXFile([file], { cover: true })
}
watch(importer.exporting, async (busy) => {
  if (busy || !importing) return
  const job = importing
  if (store.slides === job.before || !store.slides.length) {
    importing = null
    if (job.importId) send('import-error', { importId: job.importId })
    notice.value = '导入失败，原文稿已保留。'
    return
  }
  docId.value = crypto.randomUUID()
  store.setTitle(job.title)
  marking.value = false
  freeze = false
  main.setActiveElementIdList([])
  importing = null
  save(true, job.importId)
  void snapshots.initSnapshotDatabase()
})
function importFile(e) {
  readFile(e.target.files[0])
  e.target.value = ''
}
async function importTemplate() {
  menu.value = ''
  try {
    const r = await fetch('./efund.pptx')
    if (!r.ok) throw Error()
    readFile(new File([await r.blob()], '易方达演示文稿.pptx'))
  } catch {
    notice.value = '模板读取失败。'
  }
}
function exportDeck() {
  menu.value = ''
  notice.value = '正在导出…'
  exporter.exportPPTX(store.slides, true, false)
}
function exported(event) {
  send('export', { bytes: event.detail, title: store.title, format: 'pptx' })
}
watch(marking, async (enabled) => {
  markViewer?.destroy()
  markViewer = null
  if (enabled) {
    await nextTick()
    if (stage.value && marking.value)
      markViewer = attachEditorMarks(
        stage.value,
        store,
        docId.value,
        reference,
        hist.addHistorySnapshot,
        (id) => committedMarkIds.has(id)
      )
  }
})
function play() {
  menu.value = ''
  marking.value = false
  playing.value = true
  nextTick(() => {
    theater.value?.focus()
    void theater.value?.requestFullscreen?.().catch(() => {})
    resize()
  })
}
function resize() {
  screenWidth.value = Math.min(innerWidth, innerHeight / store.viewportRatio)
}
function stopPlaying() {
  playing.value = false
  if (document.fullscreenElement) void document.exitFullscreen()
}
function advance(by) {
  const n = index.value + by
  if (n >= store.slides.length) {
    stopPlaying()
    return
  }
  if (n >= 0) selectSlide(n)
}
function playKey(e) {
  if (['Escape', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', ' '].includes(e.key)) {
    e.stopPropagation()
    e.preventDefault()
    if (e.key === 'Escape') stopPlaying()
    else advance(['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 1)
  }
}
function fullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen().catch(() => {})
}
const fsChanged = () => {
  if (playing.value && !document.fullscreenElement) playing.value = false
}
const outside = (e) => {
  if (!e.target.closest('.ribbon,.menu,.recent')) menu.value = ''
}
onMounted(() => {
  window.addEventListener('message', receive)
  window.addEventListener('odyssey:export', exported)
  window.addEventListener('resize', resize)
  document.addEventListener('pointerdown', outside)
  document.addEventListener('fullscreenchange', fsChanged)
  document.addEventListener('odyssey:undo', hist.undo)
  send('ready')
})
onUnmounted(() => {
  markViewer?.destroy()
  window.removeEventListener('message', receive)
  window.removeEventListener('odyssey:export', exported)
  window.removeEventListener('resize', resize)
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('fullscreenchange', fsChanged)
  document.removeEventListener('odyssey:undo', hist.undo)
})
</script>
