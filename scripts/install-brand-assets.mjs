import { installBootBranding } from './lib/boot-branding.mjs'
import {copySubagentAvatarAssets} from './lib/subagent-avatars.mjs'
import { efundImageFactoryFont } from './lib/image-factory-web-font.mjs'
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(projectRoot, 'build', 'icon.png')
const sherlockSource = path.join(projectRoot, 'build', 'sherlock-logo.svg')
const sherlockResearchSource = path.join(projectRoot, 'build', 'sherlock-research.svg')
const destinationDirectory = path.join(
  projectRoot,
  'node_modules',
  '@deepseek-ai',
  'dsh-web-frontend',
  'dist'
)
const destination = path.join(destinationDirectory, 'sherlock-icon.png')
const legacyDestination = path.join(destinationDirectory, 'dsh-desktop-logo.png')
const sherlockDestination = path.join(destinationDirectory, 'sherlock-logo.svg')
const sherlockResearchDestination = path.join(destinationDirectory, 'sherlock-research.svg')
const indexPath = path.join(destinationDirectory, 'index.html')
const manifestPath = path.join(destinationDirectory, 'manifest.webmanifest')
const shippedPresetRoot = path.join(
  projectRoot,
  'node_modules',
  '@deepseek-ai',
  'dsh',
  'config',
  'agent-presets'
)
const sherlockPresetRoot = path.join(
  projectRoot,
  'node_modules',
  '@deepseek-ai',
  'dsh',
  'config',
  'sherlock-agent-presets'
)
const sherlockPersonaText = 'You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}. During multi-step work, provide concise user-facing progress updates in the user\'s language before substantial new work and after meaningful milestones. Each update should briefly state what has been established and what comes next, then continue the task without waiting for acknowledgment. Do not reveal private reasoning, raw commands, local paths, credentials, or repetitive tool logs. For long-running work, provide a useful update whenever you regain control after a meaningful phase instead of leaving the user with only a loading indicator. Keep the final answer focused on the outcome and do not repeat the entire progress transcript.'
const workbenchPlanningPolicy = ' For a user request to create a research workbench, decide 1–10 distinct panel titles, content scopes, types and sizes, then call research_workbench_create once with the complete panels array. Respect an explicitly requested panel count, including one panel; do not add an auxiliary panel just to fill the canvas. Do not call the tool with an empty list or inspect app source code to guess its schema. For real data use dataMode:"source". Submit the complete panel plan immediately after the subject and panel types are known; do not collect all data or manually transform long time series before creating the plan. Name the enabled relevant provider in each panel prompt, such as DataYes when requested, so independent panels can fetch data and fill their fixed templates. Discover integrations from available tools without scanning app source. If verified structured data is already available, include it as the panel artifact so the host fills a fixed template immediately without a child model call. Only panels missing data need child research; reuse shared query results and do not fetch them again. Get API parameter definitions before calling a discovered endpoint, supply every required query parameter, and after an invalid-query error correct the request or change source rather than repeat identical arguments. For periodic API data updates, use research_component_data to bind a successful plugin request and bounded field mapping, then set intervalMinutes. Do not schedule component regeneration for periodic data updates. For market panels explicitly include variant in the prompt (metrics, table, trend, candlestick, heatmap, price-volume, order-book, fund-flow, valuation-band, equity-drawdown, allocation-donut, waterfall, funnel or risk-matrix as appropriate). If the user has supplied complete original records, including fictional or test records, use dataMode:"source" and matching preset artifacts from exactly those records. Preserve original scope, categories, dates and missing reasons. Do not infer reporting periods from other panels. For provided records, every metadata field, detail, change note, source and missing reason must come from the original statement for that indicator. Omit optional fields that were not provided; never add inferred previous month labels, values or arithmetic explanations. If the user explicitly requests host-generated simulated data without supplying complete original records, immediately submit dataMode:"simulated" with a matching preset or 1–10 panels containing only title/prompt/type/size. Do not set generationMode, draft panel values, inspect project files, or search the web first: the host fills and validates all simulated panels locally in one batch without per-panel model calls. Use market for financial indicators, candlesticks and heatmaps. Ordinary coding and questions do not invoke workbench tools.'

function replaceRequired(contents, search, replacement, file) {
  if (contents.includes(replacement)) return contents
  if (!contents.includes(search)) {
    throw new Error(`Could not update EWork Odyssey branding in ${file}: expected content was not found`)
  }
  return contents.replace(search, replacement)
}

function replaceRequiredAny(contents, searches, replacement, file) {
  if (contents.includes(replacement)) return contents
  const search = searches.find((candidate) => contents.includes(candidate))
  if (!search) {
    throw new Error(`Could not update EWork Odyssey branding in ${file}: expected content was not found`)
  }
  return contents.replace(search, replacement)
}

await installBootBranding(projectRoot)

await mkdir(destinationDirectory, { recursive: true })
await copySubagentAvatarAssets(destinationDirectory)
await copyFile(path.join(projectRoot, 'build/brand/figma-welcome-illustration.png'), path.join(destinationDirectory, 'figma-welcome-illustration.png'))
await mkdir(path.join(destinationDirectory, 'fonts'), { recursive: true })
await copyFile(path.join(projectRoot, 'build/fonts/NotoSansSC.woff2'), path.join(destinationDirectory, 'fonts/NotoSansSC.woff2'))
const factoryFonts = path.join(destinationDirectory, 'fonts/image-factory')
await cp(path.join(projectRoot, 'build/fonts/image-factory'), factoryFonts, { recursive: true })
const efundFont = await readFile(path.join(projectRoot, 'skills/efund-ppt-maker/assets/fonts/STHeiti_YFD.ttf'))
await writeFile(path.join(factoryFonts, 'STHeiti_YFD.ttf'), efundImageFactoryFont(efundFont))
for (const name of ['figma-home-headline-light.svg','figma-home-headline-dark.svg','figma-home-mode.svg','figma-sidebar-chevron.svg','figma-sidebar-bell.svg','figma-people.svg','figma-self-avatar.png','figma-check.svg','figma-close.svg','figma-collaboration-plus.svg','figma-favorite.svg','figma-favorite-selected.svg','figma-glass-light-base.png','figma-glass-light-mesh.png','figma-glass-dark-base.png','figma-glass-dark-mesh.png','figma-glass-dark-overlay.png']) {
  await copyFile(path.join(projectRoot, 'build/brand', name), path.join(destinationDirectory, name))
}
for (const {file} of JSON.parse(await readFile(path.join(projectRoot,'build/brand/odyssey-b-icons.json'),'utf8')).assets) await copyFile(path.join(projectRoot,'build/brand',file),path.join(destinationDirectory,file))
await copyFile(source, destination)
await copyFile(sherlockSource, sherlockDestination)
await copyFile(sherlockResearchSource, sherlockResearchDestination)
await rm(legacyDestination, { force: true })
await rm(sherlockPresetRoot, { recursive: true, force: true })
await mkdir(sherlockPresetRoot, { recursive: true })
await cp(
  path.join(shippedPresetRoot, 'standard'),
  path.join(sherlockPresetRoot, 'standard'),
  { recursive: true }
)
const sherlockAgentPath = path.join(sherlockPresetRoot, 'standard', 'agent.cordis.yml')
const sherlockAgent = replaceRequired(
  await readFile(sherlockAgentPath, 'utf8'),
  "- id: tool-web\n  name: '@deepseek-ai/dsh-tool-web'\n  config:\n    fetch: false",
  "- id: tool-web\n  name: '@deepseek-ai/dsh-tool-web'\n  config:\n    fetch: true",
  sherlockAgentPath
)
await writeFile(
  sherlockAgentPath,
  replaceRequired(
    sherlockAgent,
    'You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.',
    sherlockPersonaText + workbenchPlanningPolicy,
    path.relative(projectRoot, sherlockAgentPath)
  ),
  'utf8'
)

// Recreate Build from the same Standard configuration on every packaged build.
const buildPresetRoot = path.join(sherlockPresetRoot, 'build')
await cp(path.join(sherlockPresetRoot, 'standard'), buildPresetRoot, { recursive: true })
const buildPolicy = ' Build mode: You have every Standard mode capability. For a request that benefits from a research workbench, plan the minimum number of independent panels and call research_workbench_create once. Simulated panels are prepared locally by the host; source-backed panels use their ordinary data path. For simple factual questions, explanations, translations, or requests asking what components are possible, answer normally without creating a workbench. For a pharma research workbench, consider distinct purposes such as market, policy, clinical pipeline, company comparison, BD transactions, and catalysts; select only the 1–10 panels needed by this request, not a fixed inventory. Choose interaction by purpose: news for clickable news/policy/deal feeds, reports for searchable report libraries, calendar for interactive dated events, dashboard for sourced metric snapshots, chart for trends, table only for genuine comparisons. Broad research workbenches should normally combine at least three useful presentation forms; never turn a calendar into a plain table or fill every panel with markdown. Respect explicitly requested formats and panel count; do not add irrelevant panels just for variety. Specify concise titles, independent scopes, content types and one of three fixed sizes: small 320x220 (1x1), medium 656x220 (2x1), large 656x456 (2x2). The host places panels in an ordered two-column matrix with consistent gaps and top-aligned rows. Do not make the first card span columns or invent separate coordinates. Respect manual layout after creation. Upgrade size when content does not fit; beyond large, split the content or show a summary with full content in expanded reading. Never reduce font sizes to fit. Plan compact content that fits the selected frame; avoid long repetitive reports. Reuse any evidence already obtained; when panels share the same source request, fetch it once and pass the structured results as artifacts. Let only missing independent evidence use child tasks. Missing data must be stated honestly; do not claim continuous monitoring is active. The tool opens Research automatically. After submission, give a brief acknowledgment, without duplicating panel reports or writing extra HTML files.'
const buildAgentPath = path.join(buildPresetRoot, 'agent.cordis.yml')
const standardAgent = await readFile(sherlockAgentPath, 'utf8')
await writeFile(buildAgentPath, replaceRequired(standardAgent, sherlockPersonaText + workbenchPlanningPolicy, sherlockPersonaText + workbenchPlanningPolicy + buildPolicy, buildAgentPath), 'utf8')
await writeFile(path.join(buildPresetRoot, 'preset.yml'), 'name: 构建模式\ndescription: 具备标准模式的完整能力，按需求规划独立研究面板，并行构建规整的画布工作台；简单问题直接回答。\norder: 2\n', 'utf8')

const index = await readFile(indexPath, 'utf8')
const brandedIndex = replaceRequiredAny(
  index,
  [
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    '<link rel="icon" type="image/png" href="/dsh-desktop-logo.png" />'
  ],
  '<link rel="icon" type="image/png" href="/sherlock-icon.png" />',
  path.relative(projectRoot, indexPath)
)
await writeFile(
  indexPath,
  replaceRequired(
    brandedIndex,
    '<title>DeepSeek Harness</title>',
    '<title>EWork Odyssey</title>',
    path.relative(projectRoot, indexPath)
  )
)

const manifest = await readFile(manifestPath, 'utf8')
const namedManifest = replaceRequired(
  replaceRequired(
    manifest,
    '"name": "DeepSeek Harness"',
    '"name": "EWork Odyssey"',
    path.relative(projectRoot, manifestPath)
  ),
  '"short_name": "DSH"',
  '"short_name": "EWork Odyssey"',
  path.relative(projectRoot, manifestPath)
)
await writeFile(
  manifestPath,
  replaceRequiredAny(
    namedManifest,
    [
      '"src": "/favicon.svg",\n      "sizes": "any",\n      "type": "image/svg+xml"',
      '"src": "/dsh-desktop-logo.png",\n      "sizes": "1254x1254",\n      "type": "image/png"'
    ],
    '"src": "/sherlock-icon.png",\n      "sizes": "1024x1024",\n      "type": "image/png"',
    path.relative(projectRoot, manifestPath)
  )
)

console.log(`Installed EWork Odyssey brand assets: ${[
  destination,
  sherlockDestination,
  sherlockResearchDestination,
  path.join(sherlockPresetRoot, 'standard')
].map((file) => path.relative(projectRoot, file)).join(', ')}`)
