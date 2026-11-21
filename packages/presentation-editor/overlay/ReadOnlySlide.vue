<template>
  <div ref="host" class="locked-canvas" aria-label="只读幻灯片">
    <ThumbnailSlide :slide="slide" :size="store.viewportSize * main.canvasScale" />
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { useMainStore, useSlidesStore } from '@/store'
import useViewportSize from '@/views/Editor/Canvas/hooks/useViewportSize'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index.vue'
defineProps({ slide: Object })
const host = ref(null),
  main = useMainStore(),
  store = useSlidesStore()
useViewportSize(host)
</script>
<style scoped>
.locked-canvas {
  height: 100%;
  width: 100%;
  display: grid;
  place-content: center;
  overflow: hidden;
  background: var(--stage);
}
</style>
