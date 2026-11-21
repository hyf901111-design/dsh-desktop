<template>
  <section class="layout-library" aria-label="幻灯片版式">
    <header>
      <select v-model="group" aria-label="版式库">
        <option value="v6">易方达 V6</option>
        <option value="master">易方达经典母版</option>
      </select>
      <select v-model="action" aria-label="应用方式">
        <option value="current">应用到当前页</option>
        <option value="new">新建幻灯片</option>
      </select>
    </header>
    <div class="layout-grid">
      <button
        v-for="layout in choices"
        :key="layout.id"
        :data-layout-id="layout.id"
        :aria-pressed="active === layout.id"
        :title="layout.name"
        @click="$emit('choose', layout, action)"
      >
        <span class="layout-preview">
          <img :src="'./layout-art/' + layout.art" alt="" loading="lazy" />
          <i
            v-for="(slot, i) in layout.slots"
            :key="i"
            :data-role="slot.role"
            :style="{
              left: slot.x * 100 + '%',
              top: slot.y * 100 + '%',
              width: slot.w * 100 + '%',
              height: slot.h * 100 + '%'
            }"
          />
        </span>
        <span class="layout-caption">{{ displayNames.get(layout.id) }}</span>
      </button>
    </div>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue'
import catalog from './efund-layouts.json'
const props = defineProps({ active: String })
defineEmits(['choose'])
const group = ref(catalog.find((l) => l.id === props.active)?.group || 'v6'),
  action = ref('current')
const choices = computed(() => catalog.filter((l) => l.group === group.value))
const displayNames = computed(() => {
  const counts = new Map()
  return new Map(
    choices.value.map((l) => {
      const name = l.name.replace(/^([0-9]+)_(.+)$/, '$2 · $1')
      const n = (counts.get(name) || 0) + 1
      counts.set(name, n)
      return [l.id, n === 1 ? name : name + ' · ' + n]
    })
  )
})
</script>
<style scoped>
.layout-library {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.layout-library header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 8px 10px;
  border-bottom: 1px solid var(--line);
}
.layout-library select {
  max-width: 52%;
  background: var(--bar);
  color: var(--ink);
  font: inherit;
  border: 0;
  padding: 4px;
  cursor: pointer;
}
.layout-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 94px), 1fr));
  gap: 6px;
  padding: 8px 2px 2px;
  overflow: auto;
}
.menu .layout-grid button {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: stretch;
  padding: 5px;
  min-width: 0;
  border-radius: 5px;
  height: auto;
}
.layout-grid button[aria-pressed='true'] {
  background: var(--hover);
  outline: 1px solid #80a6ec;
  outline-offset: -1px;
}
.layout-preview {
  display: block;
  position: relative;
  aspect-ratio: 16/9;
  background: white;
  border-radius: 2px;
  overflow: hidden;
}
.layout-preview img {
  display: block;
  width: 100%;
  height: 100%;
}
.layout-preview i {
  position: absolute;
  border: 1px dotted #88949e;
  box-sizing: border-box;
}
.layout-preview i[data-role='table'] {
  background: repeating-linear-gradient(0deg, transparent 0 3px, #bdcbd3 3px 4px);
}
.layout-preview i[data-role='chart'] {
  background: linear-gradient(
    90deg,
    #00bbd6 18%,
    transparent 18% 36%,
    #00bbd6 36% 56%,
    transparent 56% 74%,
    #005298 74%
  );
  border: none;
  clip-path: polygon(0 65%, 32% 65%, 32% 33%, 68% 33%, 68% 0, 100% 0, 100% 100%, 0 100%);
}
.layout-caption {
  padding: 0 1px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
  text-align: center;
}
</style>
