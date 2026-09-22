// Figma 1217:247167: period/unit/source belongs to the host title row, not
// another heading inside the iframe. This metadata is text, never markup.
export function researchComponentHeaderNote(spec) {
  if (spec?.type !== 'html' || typeof spec.html !== 'string' || !spec.html.includes('sherlock-header-note')) return ''
  const source = spec.html.replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|template|textarea|title|xmp|noscript)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
  const tags = source.match(/<meta\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi) || []
  for (const tag of tags) {
    // Parse only a meta element. Never parse scripts, images or iframe URLs.
    const meta = new DOMParser().parseFromString(tag, 'text/html').querySelector('meta[name="sherlock-header-note"]')
    if (meta) return (meta.getAttribute('content') || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  }
  return ''
}

export function researchComponentHeaderNoteParts(text) {
  return text.split(/(\d+(?:\.\d+)?)/).filter(Boolean).map(value => ({text:value,numeric:/^\d/.test(value)}))
}

export function patchResearchComponentHeaderNote(source) {
  const anchor = 'function ResearchCanvasRichNodeFrame({'
  const marker = '/* SHERLOCK_COMPONENT_HEADER_NOTE */'
  if (!source.includes(marker)) {
    if (!source.includes(anchor)) throw new Error('Component header note frame anchor missing')
    source = source.replace(anchor, marker + '\n' + researchComponentHeaderNote.toString() + '\n' + researchComponentHeaderNoteParts.toString() + '\n' + anchor)
  }
  const start = source.indexOf(anchor), end = source.indexOf('function ResearchCanvasImagePreview(', start)
  let frame = source.slice(start, end)
  if (!frame.includes('const headerNote =')) {
    frame = frame.replace('const compact = true;', `const compact = true;
            const headerNote = (0, react.useMemo)(() => node.kind === "generated-container" ? researchComponentHeaderNote(node.containerSpec) : "", [node.kind, node.containerSpec?.type, node.containerSpec?.html]);`)
  }
  if (!frame.includes('"data-research-component-header-note"')) {
    const title = '(0, react_jsx_runtime.jsx)("span", { className: "rScV5Q_nodeTitleText", children: title }, "title"),'
    if (!frame.includes(title)) throw new Error('Component header note title anchor missing')
    frame = frame.replace(title, title + ' headerNote ? (0, react_jsx_runtime.jsx)("span", { "data-research-component-header-note": "", title: headerNote, children: researchComponentHeaderNoteParts(headerNote).map((part,index) => (0, react_jsx_runtime.jsx)("span", { "data-header-note-numeric": part.numeric || void 0, children: part.text }, index)) }, "header-note") : null,')
  }
  return source.slice(0, start) + frame + source.slice(end)
}

export const researchComponentHeaderNoteCss = `
[data-research-generated-container] [data-research-component-header-note]{
  flex:0 1 auto;min-width:0;max-width:45%;margin-left:12px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:var(--research-completed-muted,var(--odyssey-card-muted));
  font:400 9px/20px "Noto Sans SC","EWork DIN Pro",sans-serif;
}
[data-research-component-header-note] [data-header-note-numeric]{font-family:"EWork DIN Pro","Noto Sans SC",sans-serif;font-weight:500}
[data-research-generated-container]:is(:hover,:focus-within) [data-research-component-header-note]{margin-right:72px}
`
