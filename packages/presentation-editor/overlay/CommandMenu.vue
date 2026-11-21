<template>
  <div
    v-for="(column, level) in columns"
    :key="level"
    class="menu command-column"
    role="menu"
    :data-command-level="level"
    :style="positions[level]"
    @keydown="keys($event, level)"
  >
    <button
      v-for="item in column"
      :key="item.id"
      role="menuitem"
      :disabled="item.disabled"
      :aria-haspopup="item.children ? 'menu' : undefined"
      :aria-expanded="item.children ? path[level] === item.id : undefined"
      @pointerenter="reveal(item, level, $event.currentTarget)"
      @click="activate(item, level, $event.currentTarget)"
    >
      <img v-if="item.icon" class="glyph" alt="" :src="'./icons/' + item.icon + '.svg'" />
      <span class="command-label" :title="item.label">{{ item.label }}</span
      ><img v-if="item.children" class="glyph end" :src="'./icons/menu-right.svg'" alt="" />
    </button>
  </div>
</template>
<script setup>
import { computed, nextTick, ref } from 'vue'
const props = defineProps({ groups: Array, anchor: Object })
const emit = defineEmits(['run', 'close'])
const path = ref([]),
  childrenPos = ref([])
const positions = computed(() => [props.anchor, ...childrenPos.value])
const columns = computed(() => {
  const cols = [props.groups]
  for (const id of path.value) {
    const child = cols.at(-1).find((row) => row.id === id)?.children
    if (!child?.length) break
    cols.push(child)
  }
  return cols
})
function reveal(item, level, button) {
  path.value = path.value.slice(0, level)
  if (!item.children?.length) return
  const box = button.getBoundingClientRect(),
    parent = button.parentElement.getBoundingClientRect()
  const width = Math.min(210, innerWidth - 16),
    height = item.children.length * 32 + 12
  const left = parent.right + width <= innerWidth - 4 ? parent.right - 1 : Math.max(4, parent.left - width + 1)
  childrenPos.value = [
    ...childrenPos.value.slice(0, level),
    { left: left + 'px', top: Math.max(4, Math.min(box.top - 6, innerHeight - height - 4)) + 'px' }
  ]
  path.value.push(item.id)
}
function activate(item, level, button) {
  if (!item.children) {
    emit('run', item.id)
    return
  }
  reveal(item, level, button)
}
async function keys(e, level) {
  const buttons = [...e.currentTarget.querySelectorAll('button:enabled')]
  const index = buttons.indexOf(document.activeElement)
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
    return
  }
  if (e.key === 'ArrowRight' && buttons[index]?.hasAttribute('aria-haspopup')) {
    e.preventDefault()
    buttons[index].click()
    await nextTick()
    document.querySelector('[data-command-level="' + (level + 1) + '"] button:enabled')?.focus()
  } else if (e.key === 'ArrowLeft' && level) {
    const parent = document.querySelector('[data-command-level="' + (level - 1) + '"] button[aria-expanded=true]')
    e.preventDefault()
    path.value = path.value.slice(0, level - 1)
    await nextTick()
    parent?.focus()
    if (!document.activeElement?.closest('[role=menu]'))
      document.querySelector('[data-command-level="' + (level - 1) + '"] button')?.focus()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}
</script>
<style scoped>
.command-column {
  position: fixed;
  width: min(210px, calc(100vw - 16px));
  max-height: calc(100vh - 16px);
  box-sizing: border-box;
}
.command-column button {
  flex: none;
}
.command-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.command-column button[aria-expanded='true'] {
  background: var(--hover, #80808022);
}
</style>
