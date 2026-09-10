import { readFile } from 'node:fs/promises'
const css = await readFile(new URL('../../src/preload/figma-final-shell.css', import.meta.url), 'utf8')
const START = '/* ODYSSEY_FIGMA_FINAL_SHELL_START */'
const END = '/* ODYSSEY_FIGMA_FINAL_SHELL_END */'
function exact(source, from, to) {
  if (source.includes(to)) return source
  if (source.split(from).length !== 2) throw Error('Figma final shell anchor drifted: ' + from.slice(0, 90))
  return source.replace(from, to)
}
export function patchFigmaFinalConversation(source) {
  source = exact(source, 'this.researchWidths.get(sessionId) ?? 420', 'this.researchWidths.get(sessionId) ?? 340')
  source = exact(source, 'function ComposerSurface({ zone, hero, researchEmpty,', 'function ComposerSurface({ zone, hero, research = false, researchEmpty,')
  source = exact(source, '(hero || researchEmpty) && heroWorkspaceRow', '(hero || research || researchEmpty) && heroWorkspaceRow')
  source = exact(source, 'const composerSurface = (0, react_jsx_runtime.jsx)(ComposerSurface, {\n\t\t\t\tzone,', 'const composerSurface = (0, react_jsx_runtime.jsx)(ComposerSurface, {\n\t\t\t\tresearch,\n\t\t\t\tzone,')
  source = exact(source, '"data-research-empty-state": "",\n\t\t\t\tchildren: (0, react_jsx_runtime.jsx)(HeroShell, { t })', '"data-research-empty-state": "",\n\t\t\t\tchildren: "探索更远，洞见更深。"')
  const block = `${START}\nif(typeof document!=="undefined"){let style=document.getElementById?.("odyssey-figma-final-shell");if(!style){style=document.createElement("style");style.id="odyssey-figma-final-shell";document.head.appendChild(style);}style.textContent=${JSON.stringify(css)};}\n${END}`
  const starts=source.split(START).length-1, ends=source.split(END).length-1
  if(starts!==ends || starts>1 || (starts===1 && source.indexOf(END)<source.indexOf(START))) throw Error('Figma final shell marker is incomplete or duplicated')
  if(starts===1) return source.slice(0,source.indexOf(START))+block+source.slice(source.indexOf(END)+END.length)
  return source+'\n'+block
}

export function patchFigmaFinalLayout(source) {
  return exact(source, 'clampWidth(sidebar, 264, 420)', 'clampWidth(sidebar, 280, 420)')
}
