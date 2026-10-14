import {noteIndentLevel} from '../../shared/note-indent'

export function withNoteIndentSpecs<T extends Record<string, any>>(specs: T): T {
  return Object.fromEntries(Object.entries(specs).map(([type, spec]) => [type,
    ['inline', 'plain'].includes(spec.config.content)
      ? {...spec, config: {...spec.config, propSchema: {...spec.config.propSchema, noteIndent: {default: 0}}}}
      : spec
  ])) as T
}

export function changeNoteIndent(editor: any, blockId: string, direction: 1 | -1): void {
  const block = editor.getBlock(blockId)
  if (!block || !editor.isEditable) return
  const supportsIndent = 'noteIndent' in editor.schema.blockSchema[block.type].propSchema
  const current = noteIndentLevel(block.props.noteIndent)
  editor.setTextCursorPosition(block, 'start')
  // Keep native list hierarchy and outdenting of existing nested paragraphs.
  if (direction === 1 && current === 0 && (!supportsIndent || /ListItem$/.test(block.type)) && editor.canNestBlock()) editor.nestBlock()
  else if (direction === -1 && current === 0 && editor.canUnnestBlock()) editor.unnestBlock()
  else if (supportsIndent) {
    const next = noteIndentLevel(current + direction)
    if (next !== current) editor.updateBlock(block, {props: {noteIndent: next}})
  }
  editor.focus()
}
