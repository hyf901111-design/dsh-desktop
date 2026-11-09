import {readFileSync} from 'node:fs'
import {afterEach,expect,it} from 'vitest'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import {renderMarketArtifact} from '../packages/dsh-research-task-runtime/market-artifact.js'
import {createWorkbenchGridState} from '../scripts/lib/research-grid-state.mjs'
import {createRequire} from 'node:module'

const observed=JSON.parse(readFileSync(new URL('./fixtures/workbench-three-quote-table-20261023.json',import.meta.url),'utf8'))
let fixture
const require=createRequire(import.meta.url)
// The resident dependency can predate the current host-safe native projection.
// Install the exact production serializers in this isolated VM, as the build does.
const sourceTransform=source=>{
 const native=require('../scripts/lib/research-market-native-table.mjs'),layout=require('../packages/dsh-research-task-runtime/bento-layout.js')
 const replace=(from,to,replacement)=>{const a=source.indexOf(from),b=source.indexOf(to,a+from.length);if(a<0||b<0)throw Error('Missing native reading fixture anchor');source=source.slice(0,a)+replacement+'\n'+source.slice(b)}
 replace('function parseResearchMarketNativeTable(', 'const researchMarketNativeTableCache',native.parseResearchMarketNativeTable.toString())
 replace('function ResearchMarketNativeTable(', 'function ResearchContainerBody(',native.ResearchMarketNativeTable.toString())
 replace('function researchMarketContentDimensions(', 'function researchDashboardContentDimensions(',layout.researchMarketContentDimensions.toString())
 replace('function researchMarketDimensions(', 'function researchCandleTemplate(',layout.researchMarketDimensions.toString())
 for(const name of ['measureWorkbenchContents','workbenchMeasuredDimensions','workbenchNativeTableFit','workbenchNativeTableDimensions','useWorkbenchGrid']){
  const a=source.indexOf('function '+name+'('),b=source.indexOf('\nfunction ',a+10)
  if(a<0||b<0)throw Error('Missing grid hook serializer '+name)
  source=source.slice(0,a)+require('../scripts/lib/research-grid-ui.mjs')[name].toString()+'\n'+source.slice(b)
 }
 return source
}
afterEach(async()=>{await fixture?.dispose();fixture=null})
it('grows a newly completed table before Arrange, without rewriting its saved geometry or accepting another window report',async()=>{
 const f=fixture=await financialClientFixture({}, {refreshState:true,sourceTransform}),w=f.workspace,spec=renderMarketArtifact({...observed,layoutProfile:'openterminal'})
 await f.act(async()=>w.setArtifacts([{id:'actual-table',messageId:'actual-table',kind:'generated-container',title:observed.title,excerpt:'完整来源行情表格',containerPrompt:'三家公司行情表格',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,sourceNodeIds:[],containerSpec:spec,x:250,y:150,width:482,height:273,sizeMode:'manual'}]))
 const saved=w.getWorkbenchDocument(),cells=w.getWorkbenchCells(),before=w.getSnapshot().artifacts[0].height,frame=f.host.querySelector('iframe[data-research-html-artifact]')
 const send=source=>f.act(async()=>f.win.dispatchEvent(new f.win.MessageEvent('message',{source,data:{type:'sherlock-workbench-content-size',width:482,height:320}})))
 await send({});expect(w.getSnapshot().artifacts[0].height).toBe(before)
 await send(frame.contentWindow);expect(w.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(378)
 expect(w.getWorkbenchDocument()).toEqual(saved);expect(w.getWorkbenchCells()).toEqual(cells)
 expect(w.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
 expect(f.generation.generate).not.toHaveBeenCalled()
 // Reopening receives the same complete saved artifact and can fit it again.
 await f.render('another-session');await f.render()
 const reopened=f.host.querySelector('iframe[data-research-html-artifact]')
 await send(reopened.contentWindow);expect(w.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(378)
 expect(w.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
})
it('fits the production native table on first completion and reopen without Arrange or changing the canonical document',async()=>{
 const f=fixture=await financialClientFixture({}, {refreshState:true,sourceTransform}),w=f.workspace,spec=renderMarketArtifact(observed)
 await f.act(async()=>w.setArtifacts([{id:'native-table',messageId:'native-table',kind:'generated-container',title:observed.title,excerpt:'完整来源行情表格',containerPrompt:'三家公司行情表格',generationStatus:'completed',generationLastSeq:1,refreshMinutes:0,sourceNodeIds:[],containerSpec:spec,x:250,y:150,width:482,height:273,sizeMode:'manual'}]))
 const before=w.getSnapshot().artifacts[0],saved=w.getWorkbenchDocument()
 const measure=()=>{
  const card=f.host.querySelector('[data-research-node-id="native-table"]'),table=card.querySelector('[data-sherlock-market-native="table"]')
  expect(table).not.toBeNull();expect(table.querySelectorAll('tbody tr')).toHaveLength(3)
  // Happy DOM supplies no layout. Stub only measured boxes; Chromium tests
  // below independently check this same native DOM/CSS against real text layout.
  const width=w.getSnapshot().artifacts[0].width,rect=height=>({x:0,y:0,left:0,top:0,right:width,bottom:height,width,height})
  card.getBoundingClientRect=()=>rect(before.height);table.getBoundingClientRect=()=>rect(before.height-58)
  table.querySelectorAll('thead,.terminal-native-filters').forEach(el=>el.getBoundingClientRect=()=>rect(26))
  // Simulate wrapped reading rows. Legacy source footers are now correctly
  // hidden by the unified bottom-bar source UI and must not add fake height.
  table.querySelectorAll('tbody tr').forEach(el=>el.getBoundingClientRect=()=>rect(100))
  const footer=table.querySelector('footer');Object.defineProperty(footer,'scrollHeight',{configurable:true,value:180});footer.getBoundingClientRect=()=>rect(60)
 }
 measure();await f.act(async()=>w.setCanvasSize({...w.getSnapshot().canvasSize,height:701}))
 expect(w.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(378);expect(w.getWorkbenchDocument()).toEqual(saved)
 expect(w.getSnapshot().artifacts[0].containerSpec).toEqual(spec);expect(f.generation.generate).not.toHaveBeenCalled()
 await f.render('another-session');await f.render();measure();await f.act(async()=>w.setCanvasSize({...w.getSnapshot().canvasSize,height:702}))
 expect(w.getSnapshot().artifacts[0].height).toBeGreaterThanOrEqual(378);expect(w.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
})
it('keeps table content floors local, verifies the HTML identity, and honors explicit resizing',()=>{
 const spec=renderMarketArtifact(observed),node={id:'table',kind:'generated-container',containerSpec:spec,x:250,y:150,width:482,height:273,sizeMode:'manual'}
 const state=createWorkbenchGridState({getItem:()=>null},'table-reading'),snapshot={files:[],artifacts:[node],viewport:{x:0,y:0,scale:1}};state.enable(610)
 const projected=state.reconcile(snapshot),saved=state.document(projected),width=projected.artifacts[0].width
 expect(state.contentHeight(node.id,{html:'unrelated HTML',width,height:500})).toBe(false)
 expect(state.contentHeight(node.id,{html:spec.html,width,height:500})).toBe(true)
 const grown=state.reconcile(projected);expect(grown.artifacts[0].height).toBeGreaterThanOrEqual(500);expect(state.document(grown)).toEqual(saved)
 state.set(state.get().map(c=>({...c,h:12})))
 expect(state.contentHeight(node.id,{html:spec.html,width,height:600})).toBe(false)
 expect(state.reconcile(grown).artifacts[0].height).toBeLessThan(500)
})

it('shrinks a tall generation frame when its native table completes, preserving manual resize overrides',async()=>{
 const f=fixture=await financialClientFixture({}, {refreshState:true,sourceTransform}),w=f.workspace,spec=renderMarketArtifact(observed)
 await f.act(async()=>w.setArtifacts([{id:'compact-complete',title:observed.title,excerpt:'完整来源行情表格',containerPrompt:'三家公司行情表格',generationLastSeq:1,kind:'generated-container',messageId:'compact-complete',generationStatus:'completed',containerSpec:spec,refreshMinutes:0,x:250,y:150,width:482,height:1300,sizeMode:'auto',sourceNodeIds:[]}]))

 const before=w.getSnapshot().artifacts[0],saved=w.getWorkbenchDocument()
 const card=f.host.querySelector('[data-research-node-id="compact-complete"]'),table=card.querySelector('[data-sherlock-market-native="table"]')
 const width=before.width,rect=height=>({x:0,y:0,left:0,top:0,right:width,bottom:height,width,height})
 card.getBoundingClientRect=()=>rect(before.height);table.getBoundingClientRect=()=>rect(before.height-58)
 table.querySelectorAll('thead,tbody tr,.terminal-native-filters').forEach(el=>el.getBoundingClientRect=()=>rect(26))
 const footer=table.querySelector('footer');footer.getBoundingClientRect=()=>rect(48)
 await f.act(async()=>w.setCanvasSize({...w.getSnapshot().canvasSize,height:703}))
 expect(w.getSnapshot().artifacts[0].height).toBeLessThan(600)
 expect(w.getSnapshot().artifacts[0].height).toBeGreaterThan(160)
 expect(w.getWorkbenchDocument()).toEqual(saved)
 expect(w.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
 expect(f.generation.generate).not.toHaveBeenCalled()
})
