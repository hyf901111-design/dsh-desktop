<template>
  <button v-bind="$attrs" ref="trigger" type="button" class="deck-choice" :disabled="disabled"
    :aria-label="label" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="open ? id : undefined"
    @mousedown.prevent @click="toggle" @keydown.down.prevent.stop="show()" @keydown.up.prevent.stop="show()">
    <span class="choice-value">{{ selected?.label ?? placeholder }}</span>
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
  </button>
  <Teleport to="body">
    <div v-if="open" :id="id" ref="list" class="deck-choice-list" role="listbox" tabindex="-1"
      :style="position" :aria-label="label" :aria-activedescendant="id+'-'+active" @keydown.stop="keys">
      <div v-for="(option,i) in choices" :id="id+'-'+i" :key="option.value" role="option"
        :aria-selected="option.value===modelValue" :data-active="i===active || undefined"
        @pointermove="active=i" @mousedown.prevent @click="choose(i)">
        <span>{{ option.label }}</span><span aria-hidden="true" v-if="option.value===modelValue">✓</span>
      </div>
    </div>
  </Teleport>
</template>
<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useId } from 'vue'

defineOptions({ inheritAttrs: false })
const props = defineProps({
  label: { type: String, required: true },
  options: { type: Array, required: true },
  modelValue: [String, Number],
  placeholder: { type: String, default: '混合' },
  disabled: Boolean
})
const emit = defineEmits(['open', 'update:modelValue'])
const id = 'deck-choice-' + useId()
const trigger = ref(), list = ref(), open = ref(false), active = ref(0), position = ref({})
const choices = computed(() => props.options.map(option =>
  typeof option === 'object' ? option : { value: option, label: option }
))
const selected = computed(() => choices.value.find(option => option.value === props.modelValue))
let returnTo

function close(focus = false) {
  open.value = false
  if (focus) returnTo?.focus({ preventScroll: true })
}
function revealActive() {
  nextTick(() => list.value?.children[active.value]?.scrollIntoView({ block: 'nearest' }))
}
function show() {
  if (props.disabled || !choices.value.length) return
  // A folded ribbon command is opened from its visible More button.
  returnTo = trigger.value.getClientRects().length
    ? trigger.value
    : trigger.value.closest('.ribbon')?.querySelector('[data-ribbon-more]')
  if (!returnTo) return
  const rect = returnTo.getBoundingClientRect()
  const gap = 6
  const labelWidths = choices.value.map(option => Math.min(260, Array.from(String(option.label)).length * 13 + 48))
  const width = Math.min(innerWidth - 16, Math.max(rect.width, 128, ...labelWidths))
  const height = Math.min(300, choices.value.length * 32 + 10)
  const below = innerHeight - rect.bottom - gap - 8, above = rect.top - gap - 8
  const upward = below < height && above > below
  position.value = {
    left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + 'px',
    width: width + 'px',
    maxHeight: Math.max(32, Math.min(height, upward ? above : below)) + 'px',
    ...(upward ? { bottom: innerHeight - rect.top + gap + 'px' } : { top: rect.bottom + gap + 'px' })
  }
  active.value = Math.max(0, choices.value.indexOf(selected.value))
  open.value = true
  emit('open')
  nextTick(() => {
    list.value?.focus({ preventScroll: true })
    revealActive()
  })
}
function toggle() {
  if (open.value) close()
  else show()
}
function choose(index, keyboard = false) {
  const option = choices.value[index]
  if (!option) return
  close(keyboard)
  emit('update:modelValue', option.value)
}
function keys(event) {
  if (event.key === 'Tab') return close(true)
  const count = choices.value.length
  switch (event.key) {
    case 'Escape': event.preventDefault(); return close(true)
    case 'Enter':
    case ' ': event.preventDefault(); return choose(active.value, true)
    case 'ArrowDown': active.value = (active.value + 1) % count; break
    case 'ArrowUp': active.value = (active.value + count - 1) % count; break
    case 'Home': active.value = 0; break
    case 'End': active.value = count - 1; break
    default: return
  }
  event.preventDefault()
  revealActive()
}
function outside(event) {
  if (open.value && !list.value?.contains(event.target) && !trigger.value?.contains(event.target)) close()
}
function hostMessage(event) {
  if (event.source === parent && event.data?.channel === 'odyssey-presentation' &&
      ['load', 'dismiss-menus', 'edit-mode'].includes(event.data.type)) close()
}
const dismiss = () => close()
onMounted(() => {
  document.addEventListener('pointerdown', outside, true)
  window.addEventListener('resize', dismiss)
  window.addEventListener('blur', dismiss)
  window.addEventListener('message', hostMessage)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', outside, true)
  window.removeEventListener('resize', dismiss)
  window.removeEventListener('blur', dismiss)
  window.removeEventListener('message', hostMessage)
})
</script>
