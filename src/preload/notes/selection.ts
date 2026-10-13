import { createExtension } from '@blocknote/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const key = new PluginKey<DecorationSet>('ework-note-ai-selection')
/** Ephemeral paint: never changes note content, formatting, or undo history. */
export const NoteAiSelection = createExtension(({ editor }) => ({
  key: 'ework-note-ai-selection',
  highlight(range?: { from: number; to: number }, widget?: HTMLElement, onDetach?: () => void) { editor.transact(tr => tr.setMeta(key, range ? { ...range, widget, onDetach } : null)) },
  prosemirrorPlugins: [new Plugin<DecorationSet>({
    key,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, previous) {
        const range = tr.getMeta(key)
        if (range === null) return DecorationSet.empty
        if (range) {
          if (!(range.from < range.to && range.from >= 0 && range.to <= tr.doc.content.size)) {range.onDetach?.();return DecorationSet.empty}
          const decorations = [Decoration.inline(range.from, range.to, { class: 'en-ai-selection' })]
          if (range.widget) {
            const end = tr.doc.resolve(range.to)
            let anchor = range.to
            for (let depth=end.depth;depth>0;depth--) if(end.node(depth).type.name==='blockContainer'){anchor=end.after(depth);break}
            decorations.push(Decoration.widget(anchor, range.widget, {side:1,ignoreSelection:true,stopEvent:()=>true,onRemove:range.onDetach}))
          }
          return DecorationSet.create(tr.doc, decorations)
        }
        return previous.map(tr.mapping, tr.doc, {onRemove:spec=>spec.onRemove?.()})
      }
    },
    props: { decorations: state => key.getState(state) }
  })]
}))
