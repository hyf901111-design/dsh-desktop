import { createExtension } from '@blocknote/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const key = new PluginKey<DecorationSet>('ework-note-ai-selection')
/** Ephemeral paint: never changes note content, formatting, or undo history. */
export const NoteAiSelection = createExtension(({ editor }) => ({
  key: 'ework-note-ai-selection',
  highlight(range?: { from: number; to: number }) { editor.transact(tr => tr.setMeta(key, range ?? null)) },
  prosemirrorPlugins: [new Plugin<DecorationSet>({
    key,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, previous) {
        const range = tr.getMeta(key)
        if (range === null) return DecorationSet.empty
        if (range) return range.from < range.to && range.from >= 0 && range.to <= tr.doc.content.size ? DecorationSet.create(tr.doc, [Decoration.inline(range.from, range.to, { class: 'en-ai-selection' })]) : DecorationSet.empty
        return previous.map(tr.mapping, tr.doc)
      }
    },
    props: { decorations: state => key.getState(state) }
  })]
}))
