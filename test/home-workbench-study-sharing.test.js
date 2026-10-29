import {expect,it} from 'vitest'
import {createDocument,freezeSnapshot,projectDocument,validateCanvas} from '../packages/dsh-research-collaboration/document.js'
import {homeWorkbenchStudySpec,parseHomeWorkbenchStudySpec} from '../packages/dsh-research-task-runtime/home-workbench-study-contract.js'
import {HOME_WORKBENCH_PANELS} from '../packages/dsh-research-task-runtime/home-workbench-contract.js'
import {homeWorkbenchPreparedArtifact} from '../packages/dsh-research-task-runtime/home-workbench-runtime.js'

const roles=['disclosure','performance','peers','valuation','matrix','dividend','cashflow','directory','reader','analysis','news']
const canvas=()=>({files:[],artifacts:roles.map(studyRole=>({id:'shared-'+studyRole,kind:'generated-container',generationStatus:'completed',title:studyRole,containerSpec:homeWorkbenchStudySpec(studyRole,'000858',{reportKind:'quarter'})}))})

it('exports only the business studyRole field in every prepared study component',()=>{
 for(const panel of HOME_WORKBENCH_PANELS.filter(panel=>!['watchlist','quote'].includes(panel.role))){
  const spec=homeWorkbenchPreparedArtifact('shared-demo',panel)
  expect(spec.studyRole).toBe(panel.role)
  expect(Object.hasOwn(spec,'role')).toBe(false)
  expect(parseHomeWorkbenchStudySpec({...spec,role:'owner'})).toBeNull()
 }
})

it('all study roles pass the real shared canvas validator and Yjs serialization',()=>{
 const input=canvas()
 expect(()=>validateCanvas(input)).not.toThrow()
 const document=createDocument(input)
 try{
  const shared=projectDocument(document)
  expect(shared.files).toEqual(input.files)
  expect(Object.fromEntries(shared.artifacts.map(node=>[node.id,node]))).toEqual(Object.fromEntries(input.artifacts.map(node=>[node.id,node])))
  for(const node of shared.artifacts)expect(parseHomeWorkbenchStudySpec(node.containerSpec)).toEqual(node.containerSpec)
 }finally{document.destroy()}
 // Keep the collaboration security policy intact for actual privilege fields.
 expect(()=>validateCanvas({files:[],artifacts:[{...input.artifacts[0],containerSpec:{...input.artifacts[0].containerSpec,role:'owner'}}]})).toThrow('FORBIDDEN_FIELD')
})

it('copy snapshot cleaning and JSON restore preserve every study schema and local parameter',()=>{
 const input=canvas(),valuation=input.artifacts.find(node=>node.containerSpec.studyRole==='valuation')
 expect(valuation).toBeDefined()
 valuation.containerSpec.scenarios['000858']={pe:25,epsChange:5}
 const restored=JSON.parse(JSON.stringify(freezeSnapshot({canvas:input,history:[]})))
 expect(restored.canvas).toEqual(input)
 for(const node of restored.canvas.artifacts){
  expect(parseHomeWorkbenchStudySpec(node.containerSpec)).toEqual(node.containerSpec)
  expect(node.containerSpec).toMatchObject({studyRole:node.title,security:'000858',reportKind:'quarter'})
 }
 expect(restored.canvas.artifacts.find(node=>node.containerSpec.studyRole==='valuation').containerSpec.scenarios['000858']).toEqual({pe:25,epsChange:5})
})
