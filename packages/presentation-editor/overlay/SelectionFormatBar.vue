<template>
  <nav v-if="controls.length" class="selection-format" aria-label="选区格式" @keydown.esc.stop="palette = ''">
    <button
      v-for="tool in controls"
      :key="tool.id"
      type="button"
      class="format-color"
      :aria-label="tool.label"
      :aria-expanded="palette === tool.id"
      :title="tool.label"
      @mousedown.prevent
      @click="showPalette(tool.id, $event.currentTarget)"
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path :d="tool.path" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M2 17.5h16" :stroke="current(tool.id) || 'currentColor'" stroke-width="3" />
      </svg>
      {{ tool.label }}
    </button>
    <template v-if="outlineTargets.length">
      <span class="format-field">线宽<ToolbarSelect label="描边粗细" :model-value="width" @open="close"
        :options="widths.map(value=>({value,label:value+' px'}))" @update:model-value="applyOutline('width',$event)" /></span>
      <span class="format-field">线型<ToolbarSelect label="描边线型" :model-value="lineStyle" @open="close"
        :options="[{value:'solid',label:'实线'},{value:'dashed',label:'虚线'},{value:'dotted',label:'点线'}]"
        @update:model-value="applyOutline('style',$event)" /></span>
    </template>
    <div v-if="palette" class="format-palette menu" :style="position" role="group" :aria-label="paletteLabel">
      <div class="format-swatches">
        <button
          v-for="color in colors"
          :key="color"
          :aria-label="color"
          :title="color"
          :style="{ background: color }"
          @mousedown.prevent
          @click="applyColor(color)"
        ></button>
      </div>
      <label class="custom-color"
        >自定义颜色<input
          type="color"
          aria-label="自定义颜色"
          :value="customValue"
          @change="applyColor($event.target.value)"
      /></label>
      <button v-if="palette !== 'color'" @mousedown.prevent @click="applyColor('transparent')">
        {{ emptyLabel }}
      </button>
    </div>
  </nav>
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ToolbarSelect from './ToolbarSelect.vue'
import tinycolor from 'tinycolor2'
import { useMainStore, useSlidesStore } from '@/store'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import emitter, { EmitterEvents } from '@/utils/emitter'
const main = useMainStore(),
  slides = useSlidesStore(),
  history = useHistorySnapshot()
const targets = computed(() => main.activeElementList.filter((e) => !e.lock && !e.odysseyMaster))
const textTargets = computed(() =>
  targets.value.filter((e) => e.type === 'text' || (e.type === 'shape' && e.text?.content))
)
const fillTargets = computed(() => targets.value.filter((e) => ['text', 'shape'].includes(e.type)))
const outlineTargets = computed(() =>
  targets.value.filter((e) => ['text', 'shape', 'image', 'line', 'chart'].includes(e.type))
)
const tools = [
  { id: 'color', label: '文字颜色', path: 'M5 13l4.5-10L14 13M7 9h5', targets: textTargets },
  { id: 'backcolor', label: '文字高亮', path: 'm4 12 6-7 4 3-6 7-4-1zM10 5l2-2 4 3-2 2', targets: textTargets },
  {
    id: 'fill',
    label: '填充颜色',
    path: 'm3 9 6-6 6 6-6 6zM3 9h12M5 2l4 4m7 6s2 2 2 3a2 2 0 0 1-3 0c0-1 1-3 1-3',
    targets: fillTargets
  },
  { id: 'outline', label: '描边颜色', path: 'm4 13 1-4 8-7 3 3-8 7zM11 4l3 3', targets: outlineTargets }
]
const controls = computed(() => tools.filter((t) => t.targets.value.length))
const palette = ref(''),
  position = ref({})
const close = () => {
  palette.value = ''
}
const paletteLabel = computed(() => tools.find((t) => t.id === palette.value)?.label)
const emptyLabel = computed(() => ({ fill: '无填充', outline: '无描边', backcolor: '无高亮' })[palette.value])
const colors = computed(() => [
  ...new Set([
    ...(slides.theme.themeColors || []),
    '#005298',
    '#1EB9E1',
    '#FFFFFF',
    '#000000',
    '#666666',
    '#C00000',
    '#FFC000',
    '#008554',
    '#7030A0'
  ])
])
function showPalette(id, button) {
  if (palette.value === id) return close()
  const box = button.getBoundingClientRect()
  position.value = {
    left: Math.max(4, Math.min(box.left, innerWidth - 220)) + 'px',
    top: box.bottom + 4 + 'px'
  }
  palette.value = id
}
const same = (values) => (values.length && values.every((v) => v === values[0]) ? values[0] : '')
const stroke = (e) => (e.type === 'line' ? e : e.outline)
const width = computed(() => same(outlineTargets.value.map((e) => stroke(e)?.width || 0)))
const widths = computed(() =>
  [...new Set([0, 0.5, 1, 2, 3, 4, 6, 8, ...(width.value ? [width.value] : [])])].sort((a, b) => a - b)
)
const lineStyle = computed(() => same(outlineTargets.value.map((e) => stroke(e)?.style || 'solid')))
function current(tool) {
  if (tool === 'outline') return same(outlineTargets.value.map((e) => stroke(e)?.color))
  if (tool === 'fill') return same(fillTargets.value.map((e) => e.fill))
  return main.richTextAttrs[tool] || ''
}
const customValue = computed(() => tinycolor(current(palette.value) || '#005298').toHexString())
function applyOutline(key, value) {
  for (const el of outlineTargets.value) {
    const prev = stroke(el) || {}
    const next = {
      color: prev.color && prev.color !== 'transparent' ? prev.color : '#333333',
      width: prev.width || 1,
      style: prev.style || 'solid',
      [key]: value
    }
    if (el.type === 'line') slides.updateElement({ id: el.id, props: next })
    else if (value === 'transparent' || value === 0)
      slides.removeElementProps({ id: el.id, propName: 'outline' })
    else slides.updateElement({ id: el.id, props: { outline: next } })
  }
  history.addHistorySnapshot()
}
function applyColor(value) {
  const tool = palette.value
  close()
  if (tool === 'outline') return applyOutline('color', value)
  if (tool === 'fill') {
    for (const el of fillTargets.value) {
      if (el.type === 'shape' && (el.gradient || el.pattern !== undefined))
        slides.removeElementProps({ id: el.id, propName: ['gradient', 'pattern'] })
      slides.updateElement({ id: el.id, props: { fill: value } })
    }
    history.addHistorySnapshot()
  } else if (tool === 'color' || tool === 'backcolor') {
    for (const el of textTargets.value)
      emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { target: el.id, action: { command: tool, value } })
  }
}
const outside = (e) => {
  if (!e.target.closest('.selection-format,.deck-choice-list')) close()
}
watch(() => targets.value.map((e) => e.id).join(' '), close)
onMounted(() => {
  document.addEventListener('pointerdown', outside, true)
  window.addEventListener('blur', close)
  window.addEventListener('resize', close)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', outside, true)
  window.removeEventListener('blur', close)
  window.removeEventListener('resize', close)
})
</script>
<style scoped>
.selection-format {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  min-height: 34px;
  padding: 2px 8px;
  background: var(--bar);
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}
.selection-format .format-color {
  height: 28px;
  padding: 0 6px;
  border-radius: 5px;
  color: var(--ink);
  font-size: 12px;
  white-space: nowrap;
}
.format-color:where(:hover, [aria-expanded='true']) {
  background: var(--hover);
}
.selection-format label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.format-palette {
  width: 210px;
  padding: 8px;
}
.format-swatches {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 5px;
  padding: 4px;
}
.format-swatches button {
  min-height: 0;
  height: 22px;
  border: 1px solid #8888;
  border-radius: 3px;
}
.format-swatches button:hover {
  outline: 1px solid var(--muted);
}
.format-palette .custom-color {
  display: flex;
  justify-content: space-between;
  padding: 5px 8px;
  color: var(--ink);
}
.custom-color input {
  width: 28px;
  height: 24px;
  padding: 0;
  border: 0;
  cursor: pointer;
}
</style>
