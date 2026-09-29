import {terminalFixture} from './fixtures/terminal-template-data.mjs'
import {writeFile,mkdir,readFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {build} from 'esbuild'
import {COMPONENT_TEMPLATES} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {generateSimulatedPanel} from '../packages/dsh-research-task-runtime/simulated-workbench-generator.js'
import {prepareSimulatedArtifact} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {buildResearchHtmlPreview,RESEARCH_COMPONENT_THEME_CSS} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {researchCompletedDesignCss} from './lib/research-completed-design.mjs'
import {canvasCss} from './lib/figma-canvas-client.mjs'
import {WORKBENCH_PRESENTATION_CSS} from '../packages/dsh-research-task-runtime/workbench-presentation.js'
const workbench=process.argv.includes('--workbench')
const output=resolve(process.argv[2]??'artifacts/component-templates-20260926')
await mkdir(output,{recursive:true})
const client=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
function extract(from,to){const a=client.indexOf(from),b=client.indexOf(to,a+from.length);if(a<0||b<a)throw Error(from);return client.slice(a,b)}
const nativeBody=extract('function ResearchContainerBody(','/* SHERLOCK_COMPONENT_SCHEDULE_START */')
const tableHelpers=extract('function ResearchTableCell(','function ResearchInteractiveTable(')
const nativeEntry=`import * as react from 'react';import * as react_jsx_runtime from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';import {ResearchInteractiveTable,ResearchContainerChart} from './scripts/lib/research-native-interactivity.mjs';Object.assign(globalThis,{react,react_jsx_runtime});const RESEARCH_CONTAINER_CHART_COLORS=Array.from({length:6},(_,i)=>'var(--sherlock-chart-'+(i+1)+')');globalThis.RESEARCH_CONTAINER_CHART_COLORS=RESEARCH_CONTAINER_CHART_COLORS;function normalizeResearchWebUrl(v){try{return new URL(v).href}catch{return null}}function researchWebUrlHostname(v){return new URL(v).hostname}${tableHelpers};Object.assign(globalThis,{ResearchTableCell,researchTableNumericColumn});${nativeBody};const root=createRoot(document.getElementById('root'));window.updateData=data=>root.render(react.createElement(ResearchContainerBody,{node:{containerSpec:data}}));window.updateData(window.DATA);`
await build({stdin:{contents:nativeEntry,resolveDir:process.cwd(),loader:'js'},bundle:true,platform:'browser',format:'iife',outfile:join(output,'native.js'),logLevel:'silent'})
const manifest=[]
for(const [index,t] of COMPONENT_TEMPLATES.entries()){
 const prompt=t.type==='market'?`variant: ${t.variant}`:t.id==='chart.bar'?'柱状对比图':t.id==='chart.line'?'折线趋势图':t.type
 const p=terminalFixture(generateSimulatedPanel({title:'模板 '+t.id,prompt,type:t.type,size:'large'},'组件模板验收'),index)
 const data=prepareSimulatedArtifact(p),spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data)))
 for(const theme of ['light','dark']){
  const file=t.id+'-'+theme+'.html'
  const html=spec.type==='html'?buildResearchHtmlPreview(spec.html,spec.title,theme,{workbench}):`<!doctype html><html data-sherlock-theme="${theme}"><head><meta charset="utf-8"><style>${RESEARCH_COMPONENT_THEME_CSS}${canvasCss}${researchCompletedDesignCss}${workbench?WORKBENCH_PRESENTATION_CSS:''}html,body,body>section{height:100%;min-height:100vh}body{margin:0;color:var(--research-completed-text);background:var(--sherlock-surface)}#root{height:100vh}.rScV5Q_containerChart svg{width:100%;height:calc(100vh - 94px)}.rScV5Q_containerKpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}</style></head><body ${theme==='dark'?'data-ds-dark-theme':''}><section data-research-artifact-card data-research-compact-chrome data-research-generated-container><main id="root" data-research-container-type="${spec.type}"></main></section><script>window.DATA=${JSON.stringify(spec).replace(/</g,'\\u003c')}</script><script src="native.js"></script></body></html>`
  await writeFile(join(output,file),html)
 }
 manifest.push({id:t.id,width:t.width,height:t.height-32,cardHeight:t.height,data,specType:spec.type})
}
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2))
await writeFile(join(output,'index.html'),`<!doctype html><meta charset="utf-8"><h1>30 类组件模板验收（模拟数据）</h1>${manifest.map(t=>`<p><a href="${t.id}-light.html">${t.id} 浅色</a> · <a href="${t.id}-dark.html">深色</a></p>`).join('')}`)
console.log(JSON.stringify({output,count:manifest.length,html:manifest.filter(t=>t.specType==='html').length}))
