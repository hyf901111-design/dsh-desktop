const marker = '/* SHERLOCK_DEFER_OFFSCREEN_HTML_V1 */'

function once(source, anchor, replacement) {
  const start = source.indexOf(anchor)
  if (start < 0 || source.indexOf(anchor, start + anchor.length) >= 0)
    throw Error('Deferred canvas HTML anchor missing or ambiguous: ' + anchor)
  return source.slice(0, start) + replacement + source.slice(start + anchor.length)
}

/** Defer only the first HTML preview mount; panning must preserve iframe state. */
export function patchResearchCanvasDeferredHtml(source) {
  const unsafe = 'node.kind === "generated-container" && node.containerSpec !== void 0'
  const guarded = 'node.kind === "generated-container" && node.containerSpec != null'
  const checks = source.split(unsafe).length - 1
  if (checks === 2) source = source.replaceAll(unsafe, guarded)
  else if (checks !== 0 || source.split(guarded).length !== 3) throw Error('Generated canvas content checks missing or ambiguous')
  if (source.includes(marker)) return source
  source = once(source, 'function ResearchGeneratedContainer(', `${marker}
        function ResearchDeferredGeneratedContainer({ previewActive, ...props }) {
            const { node, visible } = props;
            const ready = visible !== false || previewActive || RESEARCH_ACTIVE_GENERATION_STATUSES.has(node.generationStatus);
            const [mounted, setMounted] = (0, react.useState)(ready);
            (0, react.useLayoutEffect)(() => {
                if (ready && !mounted) setMounted(true);
            }, [ready, mounted]);
            if (node.containerSpec?.type === "html" && !ready && !mounted)
                return (0, react_jsx_runtime.jsx)("div", { "data-research-deferred-html": "", "aria-hidden": true, style: { flex: 1, minHeight: 0 } });
            return (0, react_jsx_runtime.jsx)(ResearchGeneratedContainer, props);
        }
        function ResearchGeneratedContainer(`)
  // The wrapper's call uses `props`; this exact object literal belongs to the card.
  return once(source, 'jsx)(ResearchGeneratedContainer, {', 'jsx)(ResearchDeferredGeneratedContainer, { previewActive: selected || editingContainerPrompt,')
}
