import { TextSelection } from '@tiptap/pm/state'
import type { Mark } from '@tiptap/pm/model'
import { noteText } from '../../shared/workspace-notes'

/** Replace text like typing into the selection, retaining the surrounding block. */
export function replaceNoteSelection(editor: any, range: {from:number;to:number}, blocks: any[], markdown: string) {
  const lines = (items: any[]): string[] => items.flatMap(block => {
    const text = Array.isArray(block.content?.rows)
      ? block.content.rows.map((row: any) => row.cells.map((cell: any) => noteText(cell.content ?? cell)).join('\t')).join('\n')
      : noteText(block.content)
    return [...(text ? [text] : []), ...lines(block.children || [])]
  })
  const text = lines(blocks).join('\n') || markdown
  const state = editor._tiptapEditor.state
  let marks: readonly Mark[] | undefined
  state.doc.nodesBetween(range.from, range.to, (node: any, pos: number) => {
    if (marks === undefined && node.isText && pos < range.to && pos + node.nodeSize > range.from) marks = node.marks
    return marks === undefined
  })
  const undo = state.plugins.find((plugin: any) => plugin.key.startsWith('y-undo'))?.getState(state)?.undoManager
  undo?.stopCapturing()
  editor.transact((tr: any) => {
    tr.replaceWith(range.from, range.to, tr.doc.type.schema.text(text, marks || []))
    tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map(range.to, 1)))).scrollIntoView()
  })
  undo?.stopCapturing()
}
