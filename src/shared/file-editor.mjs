export function fileEditorMode(name) {
  if (/\.(pdf|txt|docx|md|markdown)$/i.test(name)) return 'notes'
  if (/\.(pptx|ppsx|potx|pptm|ppsm|potm|ppt|pps|pot|odp)$/i.test(name)) return 'presentation'
  if (/\.(xlsx|csv)$/i.test(name)) return 'spreadsheet'
}

export function fileEditorLabel(mode, english) {
  return mode === 'notes' ? (english ? 'Open in Notes' : '在笔记中打开')
    : mode === 'presentation' ? (english ? 'Open in Presentation' : '在演示中打开')
    : (english ? 'Open in Spreadsheet' : '在表格中打开')
}
