import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../..', import.meta.url))
const START = '/* SHERLOCK_RESEARCH_AG_GRID_BEGIN */'
const END = '/* SHERLOCK_RESEARCH_AG_GRID_END */'

export async function patchResearchAgGridClient(source) {
  const result = await build({
    entryPoints: [resolve(root, 'src/preload/research-ag-grid.ts')],
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    write: false,
    target: 'chrome120',
    logLevel: 'silent',
  })
  const bridge = `${START}
const sherlockResearchAgGrid = (() => {
  const module = { exports: {} }, exports = module.exports;
  ${result.outputFiles[0].text}
  return module.exports;
})();
function ResearchAgGridTable({ spec, numericColumns }) {
  const hostRef = (0, react.useRef)(null);
  (0, react.useLayoutEffect)(() => {
    if (!hostRef.current) return;
    return sherlockResearchAgGrid.mountResearchAgGrid(hostRef.current, spec, numericColumns);
  }, [spec]);
  return (0, react_jsx_runtime.jsx)('div', {
    ref: hostRef,
    className: 'rScV5Q_containerTableScroll sherlock-ag-grid-host',
    'data-research-container-table': '',
    'data-research-grid-engine': 'ag-grid-community',
  });
}
${END}`

  if (source.includes(START)) {
    const start = source.indexOf(START)
    const end = source.indexOf(END, start)
    if (end < 0) throw new Error('Incomplete research AG Grid patch')
    source = source.slice(0, start) + bridge + source.slice(end + END.length)
  } else {
    const anchor = 'function ResearchTableCell({ cell }) {'
    if (source.indexOf(anchor) < 0 || source.indexOf(anchor) !== source.lastIndexOf(anchor))
      throw new Error('Research table renderer anchor missing or ambiguous')
    source = source.replace(anchor, () => `${bridge}\n${anchor}`)
  }

  const oldStart = 'if (spec.type === "table") return (0, react_jsx_runtime.jsx)("div",'
  const nextBranch = 'if (spec.type === "kpi") return'
  const start = source.indexOf(oldStart)
  if (start >= 0) {
    const end = source.indexOf(nextBranch, start)
    if (end < 0 || source.indexOf(oldStart, start + 1) >= 0)
      throw new Error('Research table render branch missing or ambiguous')
    source = source.slice(0, start)
      + 'if (spec.type === "table") return (0, react_jsx_runtime.jsx)(ResearchAgGridTable, { spec, numericColumns });\n\t\t\t'
      + source.slice(end)
  } else if (!source.includes('jsx)(ResearchAgGridTable, { spec, numericColumns })')) {
    throw new Error('Research AG Grid render branch missing')
  }
  return source
}
