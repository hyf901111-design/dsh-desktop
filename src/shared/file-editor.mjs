export function fileEditorMode(name) {
  if (/\.(pdf|txt|docx|md|markdown)$/i.test(name)) return 'notes'
  if (/\.(xlsx|csv)$/i.test(name)) return 'spreadsheet'
}

export function fileEditorLabel(mode, english) {
  return mode === 'notes' ? (english ? 'Open in Notes' : '在笔记中打开')
    : (english ? 'Open in Spreadsheet' : '在表格中打开')
}
