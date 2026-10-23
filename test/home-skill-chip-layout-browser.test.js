import {readFileSync} from 'node:fs'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {projectReferenceDraft,unprojectReferenceEdit} from '../scripts/lib/figma-inline-references-client.mjs'

const evidence='/tmp/ework-home-skill-input-fixes-20261023'
let browser,runtime
const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
const native=[...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1])).filter(css=>css.includes('.uV2eYG_chip')).join('\n')
const projectionSource=readFileSync('scripts/lib/figma-inline-references-client.mjs','utf8')
const font=JSON.parse(projectionSource.match(/const referenceCellFont = ("[^"]+");/)[1])
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
 import * as React from 'react';import {createRoot} from 'react-dom/client';
 import {useReferenceProjection} from './scripts/lib/figma-inline-references-client.mjs';
 const labels=['/efund-ppt-maker','/ework-equity-research','report.pdf'];
 function Fixture(){
  const [draft,setDraft]=React.useState('\\uFFFC正文 \\uFFFC补充 \\uFFFC尾'),[selected,setSelected]=React.useState(null);
  const input=React.useRef(null),occurrences=[...draft.matchAll(/\\uFFFC/g)].map((match,index)=>({occurrenceId:index+1,offset:match.index,source:index<2?'ework-managed-skill':'chat-file',label:labels[index]}));
  const view=useReferenceProjection(React,input,draft,occurrences,selected,${JSON.stringify(font)});
  window.chips={draft,view,setSelected,dispose:()=>root.unmount()};
  const parts=[];let cursor=0;
  for(const chip of occurrences){parts.push(draft.slice(cursor,chip.offset));parts.push(React.createElement('span',{className:'uV2eYG_chip','data-reference-source':chip.source,'data-inline-cell':view.projection.text[chip.offset],'data-selected':selected===chip.occurrenceId||undefined,key:chip.occurrenceId},React.createElement('span',{className:'uV2eYG_chipLabel'},chip.source==='chat-file'?React.createElement('svg',{width:18,height:18,'aria-hidden':true}):null,React.createElement('span',{className:'uV2eYG_chipLabelText'},chip.label),chip.source==='chat-file'&&selected===chip.occurrenceId?React.createElement('button',{className:'sherlock-inline-reference-remove'},'×'):null)));cursor=chip.offset+1;}
  parts.push(draft.slice(cursor));
  const family=view.families?.map(name=>JSON.stringify(name)).join(',')||JSON.stringify(view.family);
  return React.createElement('div',{className:'uV2eYG_root','data-figma-inline-ready':view.ready||undefined,style:{'--sherlock-reference-font':family}},React.createElement('div',{className:'uV2eYG_card'},React.createElement('div',{className:'uV2eYG_grow'},React.createElement('div',{className:'uV2eYG_mirror'},view.projection.text+'\\n'),React.createElement('div',{className:'uV2eYG_backdrop'},parts),React.createElement('textarea',{ref:input,className:'uV2eYG_input',value:view.projection.text,onChange:event=>{setDraft(view.decode(event.target.value));setSelected(null)}}))));
 }
 const root=createRoot(document.querySelector('#fixture'));root.render(React.createElement(Fixture));
 `},bundle:true,write:false,format:'iife',platform:'browser'});runtime=output.outputFiles[0].text
 const {chromium}=await import(/* @vite-ignore */ pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
async function fixture(dark=false,{beforeRuntime,waitReady=true}={}){
 const page=await browser.newPage({viewport:{width:760,height:360},deviceScaleFactor:2})
 await page.setContent(`<title>Native reference projection layout</title><style>${native}\n${readFileSync('src/preload/figma-inline-references.css','utf8')}body{margin:32px;background:${dark?'#1f1f1f':'#fafafa'};--dsw-alias-label-primary:${dark?'#eee':'#222'};--dsw-font-family:system-ui;--dsh-composer-side-clearance:0;--dsh-composer-card-max-width:700px}.uV2eYG_card{font:16px/24px system-ui;background:${dark?'#292929':'white'};padding:12px}.uV2eYG_grow{width:100%}</style><body ${dark?'data-ds-dark-theme':''}><main id="fixture"></main></body>`)
 await beforeRuntime?.(page)
 await page.addScriptTag({content:runtime})
 if(waitReady)await page.waitForFunction(()=>window.chips?.view.ready)
 return page
}
it.each([false,true])('sizes skill labels to their visible text with symmetric padding while native file slots stay unchanged (dark=%s)',async dark=>{
 const page=await fixture(dark)
 try{
  const sample=()=>page.locator('.uV2eYG_chip').evaluateAll(chips=>chips.map(chip=>{const label=chip.querySelector('.uV2eYG_chipLabel'),text=chip.querySelector('.uV2eYG_chipLabelText'),range=document.createRange();range.selectNodeContents(text);const t=range.getBoundingClientRect(),b=label.getBoundingClientRect(),c=chip.getBoundingClientRect();return {source:chip.dataset.referenceSource,width:b.width,cell:c.width,text:t.width,left:t.left-b.left,right:b.right-t.right,transform:getComputedStyle(text).transform}}))
  const initial=await sample()
  await writeFile(resolve(evidence,`chip-${dark?'dark':'light'}-metrics.json`),JSON.stringify(initial,null,2))
  await page.screenshot({path:resolve(evidence,`chip-${dark?'dark':'light'}.png`)})
  for(const skill of initial.slice(0,2)){expect(Math.abs(skill.left-skill.right),'skill chip leaves equal space around its actual text').toBeLessThanOrEqual(1.1);expect(skill.width-skill.text).toBeGreaterThanOrEqual(11.9);expect(skill.width-skill.text).toBeLessThanOrEqual(13.1);expect(Math.abs(skill.cell-skill.width),'native caret advance follows the visible chip').toBeLessThanOrEqual(.1);expect(skill.transform).toBe('none')}
  expect(initial[2].cell).toBeCloseTo(164,1)
  await page.evaluate(()=>window.chips.setSelected(3));await page.waitForTimeout(40)
  expect((await sample())[2].cell).toBeCloseTo(184,1)
  await page.evaluate(()=>window.chips.setSelected(1));await page.waitForTimeout(40)
  expect((await sample())[0].cell).toBeCloseTo(initial[0].cell,1)
 }finally{await page.close()}
},15000)
it('round-trips multiple skill cells, literal private-use input and native selection without leaking fonts on clear or unmount',async()=>{
 const page=await fixture()
 try{
  const input=page.locator('textarea')
  await input.focus();await input.press('Home');await page.keyboard.insertText('前\uE001')
  await expect.poll(()=>page.evaluate(()=>window.chips.draft)).toBe('前\uE001\uFFFC正文 \uFFFC补充 \uFFFC尾')
  expect(await input.evaluate(el=>el.selectionStart)).toBe(2)
  await input.fill('')
  await expect.poll(()=>page.evaluate(()=>window.chips.draft)).toBe('')
  await page.waitForTimeout(80)
  expect(await page.locator('.uV2eYG_chip').count()).toBe(0)
  await page.evaluate(()=>window.chips.dispose())
  expect(await page.evaluate(()=>[...document.fonts].filter(face=>face.family.startsWith('Sherlock')).length)).toBe(0)
 }finally{await page.close()}
},15000)
it('preserves independent skill and file offsets when a projected cell is deleted or a matching literal PUA is inserted',()=>{
 const draft='😀\uFFFC甲\uFFFC乙\uFFFC尾'
 const occurrences=[{occurrenceId:1,offset:2},{occurrenceId:2,offset:4},{occurrenceId:3,offset:6}]
 const projection=projectReferenceDraft(draft,occurrences,3,true,[{offset:2,marker:'\uE001'},{offset:4,marker:'\uE002'}])
 expect(projection.text.length).toBe(draft.length)
 expect(unprojectReferenceEdit(projection.text,projection)).toBe(draft)
 expect(unprojectReferenceEdit('前'+projection.text,projection)).toBe('前'+draft)
 expect(unprojectReferenceEdit(projection.text.slice(0,4)+projection.text.slice(5),projection)).toBe('😀\uFFFC甲乙\uFFFC尾')
 const next=projection.text.slice(0,2)+'\uE001'+projection.text.slice(2)
 expect(unprojectReferenceEdit(next,projection,{value:projection.text,start:2,end:2,inputType:'insertText'})).toBe('😀\uE001\uFFFC甲\uFFFC乙\uFFFC尾')
})
it('keeps the textarea mirror and visible reference layer wrapped together in a narrow input',async()=>{
 const page=await fixture()
 try{
  await page.setViewportSize({width:360,height:360});await page.waitForTimeout(60)
  const layout=await page.evaluate(()=>{
   const mirror=document.querySelector('.uV2eYG_mirror'),backdrop=document.querySelector('.uV2eYG_backdrop'),input=document.querySelector('textarea')
   return {mirror:mirror.scrollHeight,backdrop:backdrop.scrollHeight,overflow:backdrop.scrollWidth>backdrop.clientWidth,input:input.clientHeight,ready:window.chips.view.ready}
  })
  expect(layout.ready).toBe(true);expect(layout.mirror).toBeGreaterThan(24)
  expect(Math.abs(layout.mirror-layout.backdrop)).toBeLessThanOrEqual(1)
  expect(layout.input).toBe(layout.mirror);expect(layout.overflow).toBe(false)
  await page.screenshot({path:resolve(evidence,'chip-narrow.png')})
 }finally{await page.close()}
},15000)

it('coalesces pending font batches while ready and resize callbacks reenter, and still applies the latest measured width',async()=>{
 const page=await fixture(false,{waitReady:false,beforeRuntime:page=>page.evaluate(()=>{
  const probe=window.fontProbe={created:[],release:[],observers:[]}
  const Font=window.FontFace
  window.FontFace=class extends Font{
   constructor(...args){super(...args);probe.created.push(args[0])}
   load(){const loaded=super.load(),released=new Promise(resolve=>probe.release.push(resolve));return Promise.all([loaded,released]).then(([face])=>face)}
  }
  const Resize=window.ResizeObserver
  window.ResizeObserver=class extends Resize{
   constructor(callback){super(callback);probe.observers.push({callback,observer:this})}
  }
  probe.notify=()=>{for(const entry of probe.observers)entry.callback([],entry.observer)}
  probe.finish=()=>probe.release.splice(0).forEach(resolve=>resolve())
 })})
 try{
  await page.waitForFunction(()=>window.fontProbe.created.length>=3)
  await page.evaluate(async()=>{await document.fonts.ready;for(let i=0;i<4;i++)window.fontProbe.notify()})
  await page.waitForTimeout(35)
  expect(await page.evaluate(()=>window.fontProbe.created.length),'the same pending base and two skill fonts are loaded once').toBe(3)
  await page.evaluate(()=>window.fontProbe.finish())
  await page.waitForFunction(()=>window.chips.view.ready)
  await page.setViewportSize({width:180,height:360})
  await page.waitForFunction(()=>window.fontProbe.created.length>=5)
  await page.evaluate(()=>{for(let i=0;i<4;i++)window.fontProbe.notify()})
  expect(await page.evaluate(()=>window.fontProbe.created.length),'a different width loads two new skill definitions and reuses the base face').toBe(5)
  // Return to the already committed width before the narrow batch finishes.
  // The old pending batch must not overwrite that newer geometry when it resolves.
  await page.setViewportSize({width:760,height:360})
  await page.waitForFunction(()=>window.chips.view.ready)
  expect(await page.evaluate(()=>window.fontProbe.created.length),'returning to a known geometry reuses its loaded faces').toBe(5)
  await page.evaluate(()=>window.fontProbe.finish())
  await page.waitForFunction(()=>window.chips.view.ready)
  const restored=await page.locator('.uV2eYG_chip[data-reference-source="ework-managed-skill"]').evaluateAll(chips=>chips.map(chip=>chip.getBoundingClientRect().width))
  expect(restored[0]).toBeCloseTo(111,0)
  expect(restored[1]).toBeCloseTo(145,0)
  expect(await page.evaluate(()=>[...document.fonts].filter(face=>face.family.startsWith('Sherlock')).length)).toBe(3)
  await page.setViewportSize({width:144,height:360})
  await page.waitForFunction(()=>window.fontProbe.created.length>=7)
  await page.evaluate(()=>{window.chips.dispose();window.fontProbe.notify();window.fontProbe.finish()})
  await page.waitForTimeout(50)
  expect(await page.evaluate(()=>window.fontProbe.created.length),'stale ready/resize callbacks after disposal do not create fonts').toBe(7)
  expect(await page.evaluate(()=>[...document.fonts].filter(face=>face.family.startsWith('Sherlock')).length)).toBe(0)
 }finally{await page.close()}
},15000)
