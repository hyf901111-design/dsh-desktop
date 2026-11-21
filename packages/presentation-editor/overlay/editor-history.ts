import { defineStore } from 'pinia'
import { useMainStore } from './store/main'
import { useSlidesStore } from './store/slides'

// The embedded editor owns one document at a time. Keep undo synchronous so two
// fast commands cannot race each other or another window's IndexedDB transaction.
type Entry = { slides: string[]; index: number }
const history: Entry[] = []
export const useSnapshotStore = defineStore('snapshot', {
  state: () => ({ snapshotCursor: -1, snapshotLength: 0 }),
  getters: {
    canUndo: (state) => state.snapshotCursor > 0,
    canRedo: (state) => state.snapshotCursor < state.snapshotLength - 1
  },
  actions: {
    initSnapshotDatabase() {
      history.length = 0
      this.snapshotCursor = -1
      this.snapshotLength = 0
      this.addSnapshot()
    },
    addSnapshot() {
      const store = useSlidesStore()
      const previous = history[this.snapshotCursor]
      const slides = store.slides.map((slide, i) => {
        const json = JSON.stringify(slide)
        return previous?.slides[i] === json ? previous.slides[i] : json
      })
      if (previous?.slides.length === slides.length && slides.every((s, i) => s === previous.slides[i])) return
      history.splice(this.snapshotCursor + 1)
      history.push({ slides, index: store.slideIndex })
      if (history.length > 30) history.shift()
      this.snapshotLength = history.length
      this.snapshotCursor = history.length - 1
    },
    restore(i: number) {
      const entry = history[i]
      if (!entry) return
      const store = useSlidesStore()
      this.snapshotCursor = i
      store.setSlides(entry.slides.map((s) => JSON.parse(s)))
      store.updateSlideIndex(Math.min(entry.index, entry.slides.length - 1))
      useMainStore().setActiveElementIdList([])
    },
    unDo() {
      this.addSnapshot()
      if (this.canUndo) this.restore(this.snapshotCursor - 1)
    },
    reDo() {
      if (this.canRedo) this.restore(this.snapshotCursor + 1)
    }
  }
})
