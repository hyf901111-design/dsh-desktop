const replaceOnce = (source, anchor, replacement) => {
  if (source.split(anchor).length !== 2) throw Error('Command selection anchor missing or ambiguous: ' + anchor.slice(0, 70))
  return source.replace(anchor, replacement)
}

/** Keep pointer and keyboard selection in the native controller's one store. */
export function patchCommandMenuSelection(source) {
  const rosterMarker = '/* ework:typed-slash-command-roster:v1 */'
  if (!source.includes(rosterMarker)) source = replaceOnce(source,
    'const roster = this.deps.roster.sources(hit.trigger);',
    `${rosterMarker}\nconst roster = this.deps.roster.sources(hit.trigger).filter(source => hit.trigger !== "/" || source.name === "command");`)
  const marker = '/* ework:command-menu-selection:v1 */'
  if (source.includes(marker)) return source
  const initial = 'const highlight = validHighlight(state.highlight, groups) ?? firstHighlight(groups);'
  if (source.split(initial).length !== 3) throw Error('Command selection settlement anchors drifted')
  source = source.replaceAll(initial, 'const highlight = validHighlight(state.highlight, groups) ?? (state.hit?.trigger === "/" && !state.hit.query ? null : firstHighlight(groups));')
  source = replaceOnce(source, 'case "move": {', `${marker}
                case "point": {
                  if (!state.open || state.hit?.trigger !== "/") return state;
                  const highlight = validHighlight(ev.highlight, state.groups);
                  if (highlight === state.highlight || (highlight && state.highlight && highlight.source === state.highlight.source && highlight.index === state.highlight.index)) return state;
                  return { ...state, highlight };
                }
                case "move": {`)
  source = replaceOnce(source, 'function MenuView({ menu, onPick, onDismiss, t })', 'function MenuView({ menu, onPick, onHighlight, onDismiss, t })')
  source = replaceOnce(source, '"aria-label": t("suggestions.aria"),', '"aria-label": t("suggestions.aria"),\n                "data-ework-command-menu-selection": state.hit?.trigger === "/" ? "" : undefined,\n                onMouseLeave: () => onHighlight?.(null),')
  source = replaceOnce(source, 'id: optionId(group.source, index),', 'id: optionId(group.source, index),\n                            onMouseMove: () => onHighlight?.({ source: group.source, index }),')
  source = replaceOnce(source, 'menu: controller.menu,', 'menu: controller.menu,\n                            onHighlight: (highlight) => controller.reduce({ type: "point", highlight }),')
  const css = source.match(/const css = ("[^\n]+");/u)
  if (!css) throw Error('Command selection CSS anchor drifted')
  const value = JSON.parse(css[1]) + '[data-ework-command-menu-selection] ._3e4SsG_item:hover:not(._3e4SsG_active){background:transparent!important}'
  return source.replace(css[0], 'const css = ' + JSON.stringify(value) + ';')
}
