// Read-only evidence capture of a real, persisted HTML containerSpec; never creates model data.
// Usage: node scripts/verify-research-same-content.mjs --input=<actual-containerSpec.json>
//   --module=fund-holdings --output-prefix=<capture-name> [--themes=light,dark]
// A successful run writes measurements, not a visual-parity PASS or packaged-client acceptance.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve, dirname, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'
import { buildResearchHtmlPreview, researchComponentTypographyCss } from '../packages/dsh-research-task-runtime/html-artifact.js'
import { canvasCss } from './lib/figma-canvas-client.mjs'
import { researchComponentHeaderNote, researchComponentHeaderNoteParts } from './lib/research-component-header-note.mjs'
import { Window } from 'happy-dom'
const args=Object.fromEntries(process.argv.slice(2).map(value=>{const p=value.indexOf('=');if(p<0)throw Error('Use --name=value arguments');return[value.slice(0,p),value.slice(p+1)]}))
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
if(!args['--input'])throw Error('Required: --input=<path to actual persisted HTML containerSpec JSON>; no fixture or generated fallback is provided')
const out=resolve(root,'output/research-same-content'),input=resolve(args['--input']),moduleKey=args['--module']||'fund-holdings',prefix=args['--output-prefix']||`${moduleKey}-${Date.now()}`
if(!/^[a-zA-Z0-9._-]+$/.test(prefix))throw Error('Output prefix must be a filename, not a path')
const referencePath=resolve(root,'docs/design/research-workbench-source-profiles.json'),referenceText=await readFile(referencePath,'utf8')
const spec=JSON.parse(await readFile(input,'utf8')),reference=JSON.parse(referenceText),source=reference.modules.find(m=>m.key===moduleKey)
if(!source||!['fund-kpi','fund-holdings','fund-industry'].includes(moduleKey)||spec.type!=='html'||typeof spec.html!=='string'||!spec.html.trim()||typeof spec.title!=='string')throw Error('Expected a supported source module and unmodified HTML containerSpec')
const {width,height}=source.sourceSize,themes=(args['--themes']||(moduleKey==='fund-holdings'?'light,dark':'light')).split(',')
if(themes.some(t=>!['light','dark'].includes(t)))throw Error('Themes must be light and/or dark')
await mkdir(out,{recursive:true})
const dom=new Window();globalThis.DOMParser=dom.DOMParser;const headerNote=researchComponentHeaderNote(spec),headerParts=researchComponentHeaderNoteParts(headerNote);delete globalThis.DOMParser
const rendererPath=resolve(root,'packages/dsh-research-task-runtime/html-artifact.js'),rendererSource=await readFile(rendererPath,'utf8')
const modulePath=process.env.PLAYWRIGHT_MODULE_PATH||'playwright'
const playwright=await import(isAbsolute(modulePath)?pathToFileURL(modulePath).href:modulePath)
const chromium=playwright.chromium??playwright.default.chromium
const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH||process.env.SHERLOCK_TEST_CHROMIUM
const browser=await chromium.launch(executablePath?{executablePath}:{})
const result={sourceReference:{path:referencePath,sha256:createHash('sha256').update(referenceText).digest('hex'),fileKey:reference.fileKey,sourceNodeId:source.sourceNodeId,capturedAtUtc:reference.capturedAtUtc,sourceSnapshotTheme:source.theme,pairedDarkEvidence:source.pairedDarkEvidence||null},artifactSha256:createHash('sha256').update(spec.html).digest('hex'),renderer:{path:rendererPath,sha256:createHash('sha256').update(rendererSource).digest('hex'),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',cwd:root}).trim()},scope:'Unmodified persisted model HTML rendered through current exported buildResearchHtmlPreview. The 48px host shell is a fixture using the current canvasCss and production class names; this is not a packaged-app screenshot or a claimed model-generated shell.',input,moduleKey,sourceSize:{width,height},bodySize:{width,height:height-48},themes:[],errors:[]}
try {
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1})
 page.on('pageerror',e=>result.errors.push(e.message))
 await page.route('**/*',r=>r.abort())
 for(const theme of themes) {
  const preview=buildResearchHtmlPreview(spec.html,spec.title,theme)
  const shell=`<!doctype html><html><meta charset="utf-8"><style>${researchComponentTypographyCss('.font-assets-only')}${canvasCss}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}article{position:relative;display:flex;flex-direction:column;width:${width}px;height:${height}px;box-sizing:border-box}.rScV5Q_nodeTitle{display:flex;flex:none}.rScV5Q_nodeTitleText{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rScV5Q_previewBody{flex:1;min-height:0}.rScV5Q_webFrame{width:100%;height:100%;border:0;display:block}</style><body ${theme==='dark'?'data-ds-dark-theme':''}><article data-research-compact-chrome data-research-generated-container><header class="rScV5Q_nodeTitle"><span class="rScV5Q_nodeTitleText"></span></header><div class="rScV5Q_previewBody"><iframe class="rScV5Q_webFrame" id="artifact" sandbox="allow-scripts"></iframe></div></article></body></html>`
  await page.setContent(shell)
  await page.locator('.rScV5Q_nodeTitleText').evaluate((el,title)=>el.textContent=title,spec.title)
  if(headerNote)await page.locator('header').evaluate((el,parts)=>{const note=document.createElement('span');note.setAttribute('data-research-component-header-note','');for(const part of parts){const span=document.createElement('span');if(part.numeric)span.setAttribute('data-header-note-numeric','');span.textContent=part.text;note.append(span)}el.append(note)},headerParts)
  await page.locator('#artifact').evaluate((el,doc)=>el.srcdoc=doc,preview)
  let outer,inner
  await page.waitForFunction(()=>document.querySelector('#artifact').contentWindow!==null)
  for(let i=0;i<50;i++) {
   outer=await page.locator('#artifact').elementHandle().then(e=>e.contentFrame())
   const f=outer&&await outer.locator('#preview').elementHandle()
   if(f){inner=await f.contentFrame();if(inner&&await inner.locator('body').innerText().then(t=>t.length>3).catch(()=>false))break}
   await page.waitForTimeout(100)
  }
  if(!inner)throw Error('inner renderer unavailable')
  await inner.waitForSelector('body')
  await inner.evaluate(()=>document.fonts.ready)
  await page.evaluate(()=>document.fonts.ready)
  const measured=await inner.evaluate(()=>{
   const box=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}}
   const sample=e=>{if(!e)return null;const s=getComputedStyle(e);return{tag:e.tagName,id:e.id,class:e.className,text:e.textContent.trim(),box:box(e),fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,color:s.color,fill:s.fill,stroke:s.stroke,strokeWidth:s.strokeWidth,background:s.backgroundColor,backgroundImage:s.backgroundImage,padding:s.padding,border:s.border,borderTop:s.borderTop,borderBottom:s.borderBottom,borderLeft:s.borderLeft,borderRadius:s.borderRadius,textAlign:s.textAlign,display:s.display,overflow:s.overflow,whiteSpace:s.whiteSpace}}
   const q=sel=>[...document.querySelectorAll(sel)].map(sample)
   const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden'
   const elements=[...document.body.querySelectorAll('*')].filter(e=>!['SCRIPT','STYLE','META','OPTION','COL','COLGROUP'].includes(e.tagName)&&visible(e))
   const textElements=elements.filter(e=>e.textContent.trim()&&e.textContent.length<500).map(sample)
   const controlValues=[...document.querySelectorAll('input,select,button')].filter(visible).map(e=>({...sample(e),value:e.value,placeholder:e.getAttribute('placeholder'),selectedText:e.selectedOptions?.[0]?.textContent,svgCount:e.querySelectorAll('svg').length}))
   return {theme:document.documentElement.dataset.sherlockTheme,textElements,controlValues,graphics:q('svg,svg text,svg rect,svg path,svg line,svg polyline,[role=img],canvas,.research-metric,.research-industry-track,.research-industry-bar,.research-callout'),body:sample(document.body),wrap:sample(document.querySelector('[data-sherlock-profile],.wrap')),controls:q('select,input'),table:sample(document.querySelector('table')),columns:q('thead th'),rows:[...document.querySelectorAll('tbody>tr:not([hidden])')].map(r=>({row:sample(r),cells:[...r.cells].map(sample)})),code:q('.code'),footer:sample(document.querySelector('.research-footer,.foot,footer,[data-source-footer]')),texts:document.body.innerText,overflow:{clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},fonts:[...document.fonts].map(f=>({family:f.family,weight:f.weight,status:f.status})),pseudoBefore:{display:getComputedStyle(document.querySelector('tbody')||document.body,'::before').display,height:getComputedStyle(document.querySelector('tbody')||document.body,'::before').height}}
  })
  measured.shell=await page.locator('article').evaluate(e=>{const r=e.getBoundingClientRect(),h=e.querySelector('header').getBoundingClientRect(),s=getComputedStyle(e.querySelector('header span'));return{width:r.width,height:r.height,headerHeight:h.height,titleFont:s.font,titleColor:s.color,headerMetaPresent:!!e.querySelector('[data-research-component-header-note]'),headerMeta:e.querySelector('[data-research-component-header-note]')?.textContent||'',headerMetaFont:e.querySelector('[data-research-component-header-note]')?getComputedStyle(e.querySelector('[data-research-component-header-note]')).font:null}})
  measured.platformFonts=[]
  const cdp=await page.context().newCDPSession(page)
  await cdp.send('DOM.enable');await cdp.send('CSS.enable')
  const {root}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true})
  const candidate=[]
  function walk(n){const attrs=Object.fromEntries(Array.from({length:(n.attributes?.length||0)/2},(_,i)=>[n.attributes[i*2],n.attributes[i*2+1]]));if(n.nodeName==='TH'||n.nodeName==='TD'&&['name','pos'].includes(attrs.class)||n.nodeName==='SPAN'&&attrs.class==='code'||n.nodeName==='STRONG'||attrs['data-sherlock-numeric']!==undefined||attrs['data-sherlock-holdings-change']!==undefined||attrs.class==='research-metric-value'||attrs.class==='research-industry-value')candidate.push({id:n.nodeId,node:n.nodeName,class:attrs.class});for(const c of n.children||[])walk(c);if(n.contentDocument)walk(n.contentDocument)}
  walk(root)
  for(const n of candidate.slice(0,12)){try{measured.platformFonts.push({...n,fonts:(await cdp.send('CSS.getPlatformFontsForNode',{nodeId:n.id})).fonts})}catch(error){measured.platformFonts.push({...n,error:String(error)})}}
  await cdp.detach()
  await page.screenshot({path:resolve(out,`${prefix}-${theme}.png`)})
  await inner.locator('body').screenshot({path:resolve(out,`${prefix}-${theme}-body.png`)})
  const compact=t=>t.replace(/\s+/gu,'');
  measured.dataChecks=[{role:'title',expected:source.content.title.text,actual:spec.title,exact:source.content.title.text===spec.title},{role:'headerMeta',expected:source.content.headerMeta.text,actual:headerNote,exact:source.content.headerMeta.text===headerNote}]
  if(moduleKey==='fund-holdings'){
   measured.dataChecks.push({role:'rowCount',expected:source.content.rows.length,actual:measured.rows.length,exact:source.content.rows.length===measured.rows.length})
   source.content.columns.forEach((c,i)=>measured.dataChecks.push({role:'column/'+i,expected:c.text,actual:measured.columns[i]?.text,exact:c.text===measured.columns[i]?.text}))
   source.content.rows.forEach((row,r)=>row.forEach((c,i)=>{const actual=measured.rows[r]?.cells[i]?.text;measured.dataChecks.push({role:'row/'+r+'/'+i,expected:c.text,actual,exact:c.text===actual,whitespaceOnlyDifference:typeof actual==='string'&&c.text!==actual&&compact(c.text)===compact(actual)})}))
  }else{
   const wanted=moduleKey==='fund-kpi'?source.content.items.flatMap(i=>[i.label,i.value,i.detail]):source.content.rows.flatMap(i=>[i.category,i.weight]).concat([source.content.callout,source.content.benchmark,source.content.footer]);
   for(const item of wanted){const exact=measured.textElements.some(e=>e.text===item.text);measured.dataChecks.push({role:item.sourceNodeId,expected:item.text,exact,visibleSubstring:measured.texts.includes(item.text)})}
  }
  const sourceTexts=source.sourceSnapshot.filter(n=>n.type==='TEXT');
  measured.sourceTextMatches=sourceTexts.map(n=>{const candidates=measured.textElements.filter(e=>compact(e.text)===compact(n.text)).sort((a,b)=>a.box.width*a.box.height-b.box.width*b.box.height);return{sourceNodeId:n.id,sourceText:n.text,sourceBox:{x:n.x,y:n.y,width:n.w,height:n.h},sourceStyle:{font:n.font,size:n.size,line:n.line,align:n.align,fills:n.fills,segments:n.segments},candidates:candidates.slice(0,2)}});
  result.themes.push(measured)
 }
 await writeFile(resolve(out,`${prefix}-measurements.json`),JSON.stringify(result,null,2))
 console.log(JSON.stringify({input,moduleKey,prefix,themes:result.themes.map(t=>({theme:t.theme,rowCount:t.rows.length,table:t.table?.box,firstCell:t.rows[0]?.cells[0]?.box,positive:t.rows[0]?.cells[3]?.color,footer:t.footer?.box,overflow:t.overflow,platformFontSamples:t.platformFonts.length,dataMismatches:t.dataChecks.filter(c=>!c.exact)})),errors:result.errors},null,2))
}finally{await browser.close()}
