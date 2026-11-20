<template>
  <div class="archive-pages" ref="pages">
    <section v-for="slide in printSlides" :key="slide.id" class="archive-page">
      <ThumbnailSlide :slide="slide" :size="pageWidth" />
    </section>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, shallowRef } from 'vue'
import { useSlidesStore } from '@/store'
import useExport from '@/hooks/useExport'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index.vue'
import { finalizePptx } from './finalize-pptx'

const store = useSlidesStore()
const exporter = useExport()
const printSlides = shallowRef([])
const pages = ref(null)
const pageWidth = 960
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))

onMounted(() => {
  window.renderPresentationArchive = async (deck, format) => {
    store.setViewportSize(deck.viewportSize)
    store.setViewportRatio(deck.viewportRatio)
    if (deck.theme) store.setTheme(deck.theme)
    store.setTitle(deck.title)
    store.setSlides(deck.slides)
    if (format === 'pptx') {
      const bytes = await exporter.exportPPTX(store.slides, true, false, true)
      return finalizePptx(bytes, store.slides, deck.viewportSize)
    }
    const size = document.createElement('style')
    size.textContent = '@page { size: ' + pageWidth + 'px ' + pageWidth * deck.viewportRatio + 'px; margin: 0 }'
    document.head.append(size)
    printSlides.value = store.slides
    await nextTick()
    await nextFrame()
    await document.fonts.ready
    await Promise.all([...pages.value.querySelectorAll('img')].map(img => img.decode()))
    await Promise.all([...pages.value.querySelectorAll('.office-chart')].map(chart => chart.odysseyReady))
    await nextFrame()
    await nextFrame()
    return printSlides.value.length
  }
})
</script>

<style>
body:has(.archive-pages), html:has(.archive-pages), #app:has(.archive-pages) {
  height: auto; width: auto; overflow: visible; margin: 0; padding: 0; background: white;
}
.archive-page { break-after: page; break-inside: avoid; position: relative; print-color-adjust: exact; }
.archive-page:last-child { break-after: auto; }
</style>
