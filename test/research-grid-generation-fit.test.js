import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {expect,it} from 'vitest'
import {createResearchGrid} from '../packages/dsh-research-task-runtime/research-grid.js'
import {createWorkbenchGridState} from '../scripts/lib/research-grid-state.mjs'
import {researchOptimalDimensions} from '../packages/dsh-research-task-runtime/bento-layout.js'
const {measureWorkbenchContents}=createRequire(import.meta.url)('../scripts/lib/research-grid-ui.mjs')
it('never measures a generation placeholder as content while arranging repeatedly',()=>{
 const measure=runInNewContext('('+measureWorkbenchContents.toString()+')',{researchOptimalDimensions,researchCandleTemplate:()=>false,CSS:{escape:id=>id}})
 const root={querySelector(){throw Error('placeholder DOM must not participate in content measurement')}}
 const grid=createResearchGrid(),width=1000
 let node={id:'pending',kind:'generated-container',generationStatus:'running',width:480,height:1300}
 let cells=[{id:node.id,x:0,y:0,w:40,h:54}]
 let previous
 for(let i=0;i<5;i++){
  const measured=measure(root,[node]);cells=grid.arrange([{...node,preferred:measured.get(node.id)}],cells,width,700,'standard')
  node=grid.project([node],cells,width)[0]
  if(previous)expect(cells).toEqual(previous)
  previous=structuredClone(cells)
 }
 expect(node.height).toBeLessThan(500)
})

it('keeps an auto-fitted native baseline through disclosure open and close instead of restoring the old placeholder',()=>{
 const state=createWorkbenchGridState(null,'completion-disclosure');state.enable(1000)
 const spec={version:1,type:'chart',title:'真实数据',labels:['A'],series:[{name:'值',values:[1]}]}
 let snap=state.reconcile({files:[],artifacts:[{id:'done',kind:'generated-container',containerSpec:spec,width:980,height:1300,generationStatus:'completed'}],viewport:{y:0}})
 const saved=state.document(snap),width=snap.artifacts[0].width,key=JSON.stringify(spec)
 const fit=value=>state.contentHeight('done',{native:true,contentKey:key,width,...value})
 fit({height:320,layoutFit:true});snap=state.reconcile(snap);const base=snap.artifacts[0].height
 expect(base).toBeLessThan(400)
 fit({height:0,extraHeight:0,disclosureOpen:false});snap=state.reconcile(snap);expect(snap.artifacts[0].height).toBe(base)
 fit({height:100,extraHeight:100,disclosureOpen:true});snap=state.reconcile(snap);expect(snap.artifacts[0].height).toBeGreaterThanOrEqual(base+80)
 fit({height:0,extraHeight:0,disclosureOpen:false});snap=state.reconcile(snap);expect(snap.artifacts[0].height).toBe(base)
 expect(state.document(snap)).toEqual(saved)
})
