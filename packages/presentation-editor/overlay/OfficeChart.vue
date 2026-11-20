<template>
  <div v-if="native && !failed" ref="host" class="chart office-chart"></div>
  <Chart v-else v-bind="$props" />
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import Chart from '@/views/components/element/ChartElement/Chart.vue'
import { buildPresentation, renderSlide } from '@aiden0z/pptx-renderer'
import { chartAppearance, liveChartXml } from './office-import'
import { applyOfficeSeries } from './office-series'
import { applyOfficeAxes } from './office-axes'
import { visibleBars } from './chart-points'
const props = defineProps([
  'source',
  'data',
  'type',
  'themeColors',
  'width',
  'height',
  'options',
  'textColor',
  'lineColor'
])
const host = ref(null),
  failed = ref(false)
const native = computed(() =>
  liveChartXml(props.source, props.data, props.type, props.themeColors, chartAppearance(props))
)
const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const pack = 'http://schemas.openxmlformats.org/package/2006/relationships'
const p = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const ns =
  'xmlns:p="' +
  p +
  '" xmlns:r="' +
  office.slice(0, -1) +
  '" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"'
const relationships = (entries) =>
  '<Relationships xmlns="' +
  pack +
  '">' +
  entries
    .map(
      ([id, type, path]) =>
        '<Relationship Id="' + id + '" Type="' + office + type + '" Target="' + path + '"/>'
    )
    .join('') +
  '</Relationships>'
function chartDocument(chart, width, height, source) {
  const files = {
    contentTypes: '',
    presentation:
      '<p:presentation ' +
      ns +
      '><p:sldIdLst><p:sldId r:id="r1"/></p:sldIdLst><p:sldSz cx="' +
      Math.round(width * 9525) +
      '" cy="' +
      Math.round(height * 9525) +
      '"/></p:presentation>',
    presentationRels: relationships([['r1', 'slide', 'slides/slide1.xml']])
  }
  for (const k of [
    'slides',
    'slideRels',
    'slideLayouts',
    'slideLayoutRels',
    'slideMasters',
    'slideMasterRels',
    'themes',
    'themeOverrides',
    'charts',
    'chartRels',
    'chartStyles',
    'chartColors',
    'diagramDrawings',
    'media'
  ])
    files[k] = new Map()
  files.slides.set(
    'ppt/slides/slide1.xml',
    '<p:sld ' +
      ns +
      ' showMasterSp="0"><p:cSld><p:spTree><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="1" name="chart"/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="' +
      Math.round(width * 9525) +
      '" cy="' +
      Math.round(height * 9525) +
      '"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="r2"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>'
  )
  files.slideRels.set(
    'ppt/slides/_rels/slide1.xml.rels',
    relationships([['r2', 'chart', '../charts/chart.xml']])
  )
  files.charts.set('ppt/charts/chart.xml', chart)
  if (source.theme) files.themes.set('ppt/theme/theme.xml', source.theme)
  const paths = {
    chartStyle: ['chartStyles', 'style.xml'],
    chartColorStyle: ['chartColors', 'colors.xml'],
    themeOverride: ['themeOverrides', '../theme/themeOverride.xml']
  }
  const rels = []
  for (const [key, value] of Object.entries(source.attachments || {})) {
    if (!paths[key]) continue
    const [bucket, target] = paths[key]
    files[bucket].set(new URL(target, 'https://pkg.invalid/ppt/charts/chart.xml').pathname.slice(1), value)
    rels.push(['r' + rels.length, key, target])
  }
  files.chartRels.set('ppt/charts/_rels/chart.xml.rels', relationships(rels))
  const pres = buildPresentation(files)
  if (source.theme) pres.masterToTheme.set('', 'ppt/theme/theme.xml')
  return pres
}
function applyOfficeLabels(chart, sourceXml) {
  const doc = new DOMParser().parseFromString(sourceXml, 'application/xml')
  const first = (node, name) => node?.getElementsByTagNameNS('*', name)[0]
  const chartNode = first(doc, 'chart')
  const title = [...chartNode.children].find((node) => node.localName === 'title')
  const chartArea = [...doc.documentElement.children].find((node) => node.localName === 'spPr')
  // A chart with only a border has no authored fill. The preview engine paints it opaque white.
  if (
    chartArea &&
    ![...chartArea.children].some((node) => node.localName.endsWith('Fill')) &&
    !props.source.attachments?.chartStyle
  )
    chart.setOption({ backgroundColor: 'transparent' })
  const option = chart.getOption()
  const themeXml =
    props.source.theme && new DOMParser().parseFromString(props.source.theme, 'application/xml')
  const scheme = first(first(themeXml, 'themeElements'), 'clrScheme')
  const aliases = { tx1: 'dk1', tx2: 'dk2', bg1: 'lt1', bg2: 'lt2' }
  const fillColor = (node) => {
    const schemeRef = first(node, 'schemeClr')
    const key = schemeRef?.getAttribute('val')
    const resolved = key && first(scheme, aliases[key] || key)?.firstElementChild
    const rgb =
      first(node, 'srgbClr')?.getAttribute('val') ||
      resolved?.getAttribute('lastClr') ||
      resolved?.getAttribute('val')
    if (!/^[a-f0-9]{6}$/i.test(rgb || '')) return
    const mod = first(node, 'lumMod'),
      off = first(node, 'lumOff')
    if (!mod && !off) return '#' + rgb
    const channels = rgb.match(/../g).map((s) => parseInt(s, 16) / 255)
    const light = (Math.min(...channels) + Math.max(...channels)) / 2
    const adjusted = Math.max(
      0,
      Math.min(
        1,
        (light * Number(mod?.getAttribute('val') ?? 100000)) / 100000 +
          Number(off?.getAttribute('val') || 0) / 100000
      )
    )
    const ratio = (1 - Math.abs(2 * adjusted - 1)) / (1 - Math.abs(2 * light - 1) || 1)
    return (
      '#' +
      channels
        .map((c) =>
          Math.round(255 * (adjusted + (c - light) * ratio))
            .toString(16)
            .padStart(2, '0')
        )
        .join('')
    )
  }
  applyOfficeSeries(chart, doc, option, fillColor)
  if (title && !first(title, 'tx') && !option.title?.[0]?.text) {
    chart.setOption({
      title: {
        text: '图表标题',
        left: 'center',
        top: Number(first(first(title, 'manualLayout'), 'y')?.getAttribute('val') || 0) * chart.getHeight(),
        textStyle: {
          fontSize: 13,
          fontWeight: 'normal',
          color: fillColor(first(first(title, 'defRPr'), 'solidFill')) || props.textColor || '#005096'
        }
      }
    })
  }
  applyOfficeAxes(chart, doc, option)
}
let handle
watch(
  [native, () => props.width, () => props.height],
  () => {
    failed.value = false
  },
  { flush: 'sync' }
)
watch(
  [host, native, () => props.width, () => props.height],
  () => {
    handle?.dispose()
    if (!host.value || !native.value || failed.value) return
    try {
      const pres = chartDocument(native.value, props.width, props.height, props.source)
      const charts = new Set()
      handle = renderSlide(pres, pres.slides[0], {
        chartInstances: charts,
        onNodeError: () => {
          failed.value = true
        }
      })
      const current = handle
      current.ready.then(() => {
        if (current === handle)
          for (const chart of charts) if (!chart.isDisposed()) applyOfficeLabels(chart, native.value)
      })
      // Only the slide wrapper is synthetic. The imported chart keeps its own Office fill.
      handle.element.style.backgroundColor = 'transparent'
      host.value.replaceChildren(handle.element)
      host.value.odysseyBars = () => Array.from(charts).flatMap((c) => visibleBars(c, c.getDom(), props.data))
    } catch {
      failed.value = true
    }
  },
  { flush: 'post', immediate: true }
)
onBeforeUnmount(() => {
  handle?.dispose()
  handle = undefined
})
</script>
<style scoped>
.office-chart {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
