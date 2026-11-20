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
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
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
        <select aria-label="字体" :value="selectedFont" @change="command('fontname', $event.target.value)">
          <option v-for="f in fontOptions" :key="f" :value="f">{{ f }}</option>
        </select>
        <select aria-label="字号" :value="selectedSize" @change="command('fontsize', $event.target.value + 'px')">
          <option v-for="s in sizeOptions" :key="s" :value="s">{{ s }}</option>
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
        <button
          v-if="main.activeElementIdList.length"
          title="对象样式"
          aria-label="对象样式"
          :aria-pressed="stylesOpen"
          @click="stylesOpen = !stylesOpen"
        >
          <Glyph name="menu-shape" /><span>样式</span>
        </button>
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
      <CommandMenu
        v-if="menu === 'commands'"
        :anchor="menuPos"
        :groups="commandTree"
        @run="runCommand"
        @close="menu = ''"
      />
      <CommandMenu
        v-else-if="menu === 'pages'"
        :anchor="menuPos"
        :groups="pageCommands"
        @run="runPage"
        @close="menu = ''"
      />
      <div
        v-else-if="menu && menu !== 'recent'"
        class="menu"
        :class="{ 'layout-menu': menu === 'layout' }"
        :style="menuPos"
      >
        <template v-if="menu === 'more'">
          <button @click="menu = 'commands'">
            <Glyph name="menu-slide" />
            演示文稿
          </button>
          <button @click="menuAction('reload')">
            <Glyph name="redo" />
            重新载入已保存版本
          </button>
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
          <button @click="insert('chart')">图表…</button>
          <button @click="insert('table')">表格</button>
        </template>
        <ShapePool v-if="menu === 'shape-pool'" @select="(shape) => insertObject('shape', shape)" />
        <ChartPool v-if="menu === 'chart-pool'" @select="(chart) => insertObject('chart', chart)" />
        <TableGenerator
          v-if="menu === 'table-pool'"
          @close="menu = ''"
          @insert="(size) => insertObject('table', size)"
        />
        <LayoutGallery v-if="menu === 'layout'" :active="slide?.odysseyLayoutId" @choose="chooseLayout" />
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
            @focus="main.setThumbnailsFocus(true)"
            :draggable="editable"
            :data-moving="draggedPage === page.id || undefined"
            :data-drop="dragOverPage === page.id || undefined"
            @dragstart="startPageDrag(page, $event)"
            @dragover.prevent="dragOverPage = page.id"
            @drop.prevent="dropPage(i)"
            @dragend="endPageDrag"
            @contextmenu.prevent="openPageMenu(i, $event)"
            @keydown="pageKey($event, i)"
          >
            <span class="num">{{ i + 1 }}</span>
            <div class="page-detail">
              <div class="thumb"><ThumbnailSlide :slide="page" :size="106" /></div>
              <span>{{ caption(page) || '幻灯片 ' + (i + 1) }}</span>
            </div>
          </button>
        </aside>
        <section class="edit-col sherlock-ppt-editor" :data-readonly="!editable || undefined">
          <aside v-if="stylesOpen && main.activeElementIdList.length && editable" class="style-popover">
            <header>
              <div class="style-tabs" role="group" aria-label="对象格式">
                <button :aria-pressed="styleTab === 'style'" @click="styleTab = 'style'">样式</button>
                <button :aria-pressed="styleTab === 'position'" @click="styleTab = 'position'">排列</button>
              </div>
              <button title="关闭样式" aria-label="关闭样式" @click="stylesOpen = false">×</button>
            </header>
            <template v-if="styleTab === 'position'"
              ><MultiPositionPanel v-if="main.activeElementIdList.length > 1" /><ElementPositionPanel v-else
            /></template>
            <template v-else
              ><MultiStylePanel v-if="main.activeElementIdList.length > 1" /><ElementStylePanel v-else
            /></template>
          </aside>
          <div ref="stage" class="canvas-slot">
            <div
              class="slide-area"
              :data-slide-index="index"
              :style="{
                '--page-w': store.viewportSize + 'px',
                '--page-h': store.viewportSize * store.viewportRatio + 'px'
              }"
            >
              <Canvas />
            </div>
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
      <ChartDataEditorDialog v-if="editable" />
      <footer>
        <span>第 {{ index + 1 }} 页，共 {{ store.slides.length }} 页</span>
        <span>{{ ratio }}</span>
        <span role="status">{{ notice || '已保存' }}</span>
        <div class="grow" />
        <button title="缩小" @click="zoom.scaleCanvas('-')"><Glyph name="minus" /></button>
        <button title="适合窗口" @click="zoom.resetCanvas">适合</button>
        <button title="放大" @click="zoom.scaleCanvas('+')"><Glyph name="plus" /></button>
        <button
          :title="editorFullscreen ? '退出全屏' : '全屏'"
          :aria-pressed="editorFullscreen"
          @click="fullscreen"
        >
          <Glyph name="fit" />
        </button>
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
import CommandMenu from './CommandMenu.vue'
import LayoutGallery from './LayoutGallery.vue'
import { applyMaster } from './apply-layout'
import ShapePool from '@/views/Editor/CanvasTool/ShapePool.vue'
import ChartPool from '@/views/Editor/CanvasTool/ChartPool.vue'
import TableGenerator from '@/views/Editor/CanvasTool/TableGenerator.vue'
import ChartDataEditorDialog from '@/views/Editor/ChartDataEditorDialog.vue'
import ElementPositionPanel from '@/views/Editor/Toolbar/ElementPositionPanel.vue'
import MultiPositionPanel from '@/views/Editor/Toolbar/MultiPositionPanel.vue'
import useCombineElement from '@/hooks/useCombineElement'
import ElementStylePanel from '@/views/Editor/Toolbar/ElementStylePanel/index.vue'
import MultiStylePanel from '@/views/Editor/Toolbar/MultiStylePanel.vue'
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
import { protectMaster } from './master-protection'
import { exportMasterArtwork } from './powerpoint-masters'
import { reconcilePointColors } from './powerpoint-point-colors'
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
const editable = ref(true)
const editorFullscreen = ref(false)
const stylesOpen = ref(false),
  styleTab = ref('style')
const grouping = useCombineElement()
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
const selectedFont = computed(() => (main.richTextAttrs.fontname || '华文黑体').replace(/^["']|["']$/g, ''))
const selectedSize = computed(() => parseFloat(main.richTextAttrs.fontsize) || 24)
const fontOptions = computed(() => [...new Set([selectedFont.value, '华文黑体', '微软雅黑', '宋体', 'Arial'])])
const sizeOptions = computed(() =>
  [...new Set([12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72, selectedSize.value])].sort((a, b) => a - b)
)
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
  if (loading || !docId.value || !editable.value || freeze || importing) return
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
  recent.value = [{ id: docId.value, title: store.title }, ...recent.value.filter((d) => d.id !== docId.value)]
}
async function hydrate(d) {
  const seq = ++hydration
  loading = true
  freeze = false
  marking.value = false
  menu.value = ''
  canUndoAI.value = !!d.record.canUndoAI
  revision = d.record.revision
  editable.value = d.editable
  ready.value = true
  document.body.toggleAttribute('data-ds-dark-theme', d.dark)
  notice.value = editable.value ? '' : '只读'
  if (d.recent) recent.value = d.recent
  committedMarkIds = new Set()
  const deck = d.record.deck
  let migrated = false
  docId.value = deck?.id || ''
  main.setActiveElementIdList([])
  if (deck) {
    migrated = await protectMaster(deck.slides, deck.viewportSize, deck.viewportRatio, true)
    if (seq !== hydration) return
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
    baseline = migrated ? '' : JSON.stringify(snapshot())
  } else store.setSlides([])
  await nextTick()
  if (seq !== hydration) return
  loading = false
  if (migrated && editable.value) save()
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
  if (d.type === 'dismiss-menus') {
    menu.value = ''
    stylesOpen.value = false
  } else if (d.type === 'load') void hydrate(d)
  else if (d.type === 'flush') {
    nextTick(() => {
      save()
      send('flushed', { id: d.id })
    })
  } else if (d.type === 'referenced-marks') {
    committedMarkIds = new Set(d.ids)
    markViewer?.redraw()
  } else if (d.type === 'edit-mode') {
    editable.value = !!d.editable
    menu.value = ''
    stylesOpen.value = false
    marking.value = false
    main.setActiveElementIdList([])
    notice.value = editable.value ? '已保存' : '已锁定'
  } else if (d.type === 'header-export') {
    if (docId.value) exportDeck()
  } else if (d.type === 'header-import') {
    if (editable.value) readFile(new File([d.bytes], d.title))
  } else if (d.type === 'import') {
    if (d.revision !== revision || !editable.value || importing || freeze) {
      send('import-error', { importId: d.importId })
      return
    }
    readFile(new File([d.bytes], d.title), d.importId, d.parseOnly === true)
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
  if (!ready.value || !editable.value) return
  menu.value = ''
  marking.value = false
  copiedPage.value = null
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
const row = (id, label, icon, children) => ({ id, label, icon, children })
const commandTree = computed(() => [
  row('file', '演示文稿', 'menu-slide', [
    row('import', '导入 PowerPoint…', 'menu-upload'),
    row('export', '导出演示文稿', 'menu-download', [row('pptx', 'PowerPoint 演示文稿 (.pptx)', 'menu-file')]),
    row('create', '新建空白演示文稿', 'menu-plus'),
    row('template', '从易方达 V6 模板新建', 'menu-slide'),
    ...(recent.value.length > 1
      ? [
          row(
            'files',
            '最近使用',
            'menu-file',
            recent.value.map((d) => row('open:' + d.id, d.title, 'slide'))
          )
        ]
      : [])
  ]),
  row('edit', '编辑', 'menu-edit', [
    { ...row('undo-ai', '撤销 AI 修改', 'undo'), disabled: !canUndoAI.value },
    row('undo', '撤销编辑', 'undo'),
    row('redo', '重做编辑', 'redo')
  ]),
  row('insert', '插入', 'menu-plus', [
    row('text', '文本框', 'menu-text'),
    row('shape', '形状', 'menu-shape'),
    row('image', '图片…', 'menu-image'),
    row('chart', '图表…', 'insert'),
    row('table', '表格', 'layout')
  ]),
  row('format', '格式', 'menu-text', [
    { ...row('styles', '对象样式', 'menu-shape'), disabled: !main.activeElementIdList.length },
    { ...row('position', '排列与尺寸', 'align'), disabled: !main.activeElementIdList.length },
    { ...row('group', '组合', 'layout'), disabled: main.activeElementIdList.length < 2 },
    { ...row('ungroup', '取消组合', 'layout'), disabled: !main.activeElementList.some((e) => e.groupId) },
    row('left', '左对齐', 'align'),
    row('center', '居中', 'align'),
    row('right', '右对齐', 'align')
  ]),
  row('view', '视图', 'menu-screen', [
    row('first', '从头放映', 'play'),
    row('play', '从当前页放映', 'play'),
    row('fullscreen', '全屏', 'fit')
  ])
])
function runCommand(id) {
  menu.value = ''
  if (!editable.value && !['pptx', 'play', 'first', 'fullscreen'].includes(id) && !id.startsWith('open:')) return
  if (id.startsWith('open:')) return open(id.slice(5))
  const actions = {
    import: () => chooseFile(fileInput.value),
    pptx: exportDeck,
    create,
    template: importTemplate,
    'undo-ai': () => menuAction('undo'),
    undo: undoEdit,
    redo: hist.redo,
    image: () => chooseFile(imageInput.value),
    styles: () => {
      styleTab.value = 'style'
      stylesOpen.value = true
    },
    position: () => {
      styleTab.value = 'position'
      stylesOpen.value = true
    },
    group: grouping.combineElements,
    ungroup: grouping.uncombineElements,
    first: () => {
      selectSlide(0)
      play()
    },
    play,
    fullscreen
  }
  if (actions[id]) return actions[id]()
  if (['left', 'center', 'right'].includes(id)) return alignText(id)
  insert(id)
}
const draggedPage = ref(null),
  dragOverPage = ref(null)
function startPageDrag(page, event) {
  if (!editable.value) return
  draggedPage.value = page.id
  event.dataTransfer.setData('application/x-odyssey-slide', page.id)
  event.dataTransfer.effectAllowed = 'move'
}
function endPageDrag() {
  draggedPage.value = null
  dragOverPage.value = null
}
function dropPage(index) {
  const from = store.slides.findIndex((s) => s.id === draggedPage.value)
  endPageDrag()
  if (!editable.value || from < 0 || from === index) return
  snapshots.addSnapshot()
  slideActions.sortSlides(index, from)
  snapshots.addSnapshot()
}
const copiedPage = ref(null)
const pageCommands = computed(() =>
  [
    row('new', '新建幻灯片', 'newslide'),
    row('duplicate', '创建副本', 'slide'),
    row('copy', '复制', 'menu-file'),
    { ...row('paste', '粘贴', 'insert'), disabled: !copiedPage.value },
    row('cut', '剪切', 'menu-edit'),
    { ...row('up', '上移一页'), disabled: index.value === 0 },
    { ...row('down', '下移一页'), disabled: index.value === store.slides.length - 1 },
    row('layout', '更改版式', 'layout'),
    row('play', '从此页放映', 'play'),
    row('delete', '删除幻灯片', 'minus')
  ].filter((item) => editable.value || ['copy', 'play'].includes(item.id))
)
function openPageMenu(i, e) {
  selectSlide(i)
  menuPos.value = {
    left: Math.max(4, Math.min(e.clientX, innerWidth - 214)) + 'px',
    top: Math.max(4, Math.min(e.clientY, innerHeight - pageCommands.value.length * 32 - 16)) + 'px'
  }
  menu.value = 'pages'
}
function runPage(id) {
  snapshots.addSnapshot()
  menu.value = ''
  if (!editable.value && !['copy', 'play'].includes(id)) return
  if (id === 'new') return slideActions.createSlide()
  if (id === 'play') return play()
  if (id === 'layout') return toggle('layout')
  if (id === 'copy' || id === 'cut') copiedPage.value = JSON.parse(JSON.stringify(slide.value))
  if (id === 'paste' && copiedPage.value)
    return slideActions.createSlideByTemplate(JSON.parse(JSON.stringify(copiedPage.value)))
  if (id === 'duplicate') return slideActions.copyAndPasteSlide()
  if (id === 'delete' || id === 'cut') return slideActions.deleteSlide([slide.value.id])
  const next = index.value + (id === 'up' ? -1 : 1)
  if (['up', 'down'].includes(id) && next >= 0 && next < store.slides.length) {
    slideActions.sortSlides(next, index.value)
    hist.addHistorySnapshot()
  }
}
function pageKey(e, i) {
  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
    e.preventDefault()
    const box = e.currentTarget.getBoundingClientRect()
    openPageMenu(i, { clientX: box.left + 12, clientY: box.top + 12 })
    return
  }
  const mod = e.ctrlKey || e.metaKey,
    k = e.key.toLowerCase()
  if (mod && k === 'z') {
    e.preventDefault()
    e.stopPropagation()
    if (editable.value) {
      if (e.shiftKey) hist.redo()
      else undoEdit()
    }
    return
  }
  const action = mod
    ? { c: 'copy', x: 'cut', v: 'paste', d: 'duplicate', y: 'redo' }[k]
    : ['Backspace', 'Delete'].includes(e.key)
      ? 'delete'
      : undefined
  if (action) {
    e.preventDefault()
    e.stopPropagation()
    if (action === 'redo') {
      if (editable.value) hist.redo()
      return
    }
    selectSlide(i)
    runPage(action)
    nextTick(() => document.querySelector('.page-row[aria-current="page"]')?.focus())
  }
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
  const width = name === 'layout' ? Math.min(520, innerWidth - 16) : 210
  menuPos.value = { left: Math.max(8, Math.min(rect?.left || 8, innerWidth - width - 8)) + 'px', top: '40px' }
  menu.value = name
}
function rename(input) {
  const title = input.value.trim()
  if (title && editable.value) store.setTitle(title)
  input.value = store.title
}
function selectSlide(i) {
  menu.value = ''
  main.setActiveElementIdList([])
  store.updateSlideIndex(i)
  main.updateSelectedSlidesIndex([])
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
  if (editable.value && event.type === 'keydown' && event.target.closest('textarea,input,[contenteditable=true]'))
    return
  if (
    editable.value &&
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
    editable.value ||
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
  if (['shape', 'table', 'chart'].includes(kind)) {
    toggle(kind + '-pool')
    return
  }
  if (kind === 'text')
    elements.createTextElement({ left: 64, top: 64, width: 400, height: 52 }, { content: '<p>文本</p>' })
}
function insertObject(kind, value) {
  menu.value = ''
  snapshots.addSnapshot()
  if (kind === 'table') elements.createTableElement(value.row, value.col)
  if (kind === 'chart') elements.createChartElement(value)
  if (kind === 'shape')
    elements.createShapeElement(
      {
        left: store.viewportSize * 0.2,
        top: store.viewportSize * store.viewportRatio * 0.22,
        width: store.viewportSize * 0.25,
        height: store.viewportSize * store.viewportRatio * 0.24
      },
      value
    )
}
async function chooseLayout(layout, action) {
  const documentId = docId.value,
    pageId = slide.value?.id
  menu.value = ''
  try {
    const response = await fetch('./layout-art/' + layout.art)
    if (!response.ok) throw Error('版式未能读取')
    const blob = await response.blob()
    const image = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    if (docId.value !== documentId || slide.value?.id !== pageId || !editable.value || freeze) return
    const page = action === 'new' ? { id: crypto.randomUUID(), elements: [] } : slide.value
    const title = caption(page)
    const titleId = page.elements.find(
      (e) =>
        !e.odysseyMaster &&
        title &&
        plain(e.content || e.text?.content)
          .trim()
          .slice(0, 120) === title
    )?.id
    snapshots.addSnapshot()
    const next = applyMaster(layout, image, page, store.viewportSize, store.viewportRatio, titleId)
    main.setActiveElementIdList([])
    if (action === 'new') store.addSlide(next)
    else store.updateSlide(next, page.id)
    snapshots.addSnapshot()
  } catch {
    notice.value = '版式未能应用，请重试。'
  }
}
function insertImage(e) {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  const r = new FileReader()
  r.onload = () => elements.createImageElement(r.result)
  r.readAsDataURL(f)
}
function readFile(file, importId, parseOnly = false) {
  if (!file || !editable.value || importing) return
  if (file.size > 64 * 1024 * 1024) {
    notice.value = '文件超过 64 MB。'
    return
  }
  const before = store.slides
  importing = { before, file, importId, parseOnly, title: file.name.replace(/\.pptx$/i, '') }
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
  await protectMaster(store.slides, store.viewportSize, store.viewportRatio, false)
  await reconcilePointColors(job.file, store.slides).catch(() => {})
  if (importing !== job) return
  docId.value = crypto.randomUUID()
  store.setTitle(job.title)
  marking.value = false
  freeze = false
  main.setActiveElementIdList([])
  importing = null
  save(true, job.importId)
  if (!job.parseOnly) void snapshots.initSnapshotDatabase()
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
async function exported(event) {
  try {
    const bytes = await reconcilePointColors(
      await exportMasterArtwork(event.detail, store.slides),
      store.slides,
      true
    )
    send('export', { bytes, title: store.title, format: 'pptx' })
  } catch {
    notice.value = '文稿导出失败，请重试。'
  }
}
watch(marking, async (enabled) => {
  markViewer?.destroy()
  markViewer = null
  if (enabled) {
    await nextTick()
    if (stage.value && marking.value)
      markViewer = attachEditorMarks(stage.value, store, docId.value, reference, hist.addHistorySnapshot, (id) =>
        committedMarkIds.has(id)
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
  menu.value = ''
  const root = document.querySelector('.deck-app')
  const operation = document.fullscreenElement ? document.exitFullscreen() : root?.requestFullscreen()
  void operation?.catch(() => {
    notice.value = '未能切换全屏，请重试。'
  })
}
const fsChanged = () => {
  editorFullscreen.value = document.fullscreenElement?.classList.contains('deck-app') || false
  if (playing.value && !document.fullscreenElement) playing.value = false
}
const outside = (e) => {
  send('pointerdown')
  if (!e.target.closest('.ribbon,.menu,.recent')) menu.value = ''
}
onMounted(() => {
  window.addEventListener('message', receive)
  window.addEventListener('odyssey:export', exported)
  window.addEventListener('resize', resize)
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('fullscreenchange', fsChanged)
  document.addEventListener('odyssey:undo', hist.undo)
  send('ready')
})
onUnmounted(() => {
  markViewer?.destroy()
  window.removeEventListener('message', receive)
  window.removeEventListener('odyssey:export', exported)
  window.removeEventListener('resize', resize)
  document.removeEventListener('pointerdown', outside, true)
  document.removeEventListener('fullscreenchange', fsChanged)
  document.removeEventListener('odyssey:undo', hist.undo)
})
</script>
