import {afterEach,expect,it} from 'vitest'
import {createRequire} from 'node:module'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'
import {homeWorkbenchStudySpec,homeWorkbenchStudyModel} from '../packages/dsh-research-task-runtime/home-workbench-study-contract.js'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
const require=createRequire(import.meta.url)
let f;afterEach(async()=>{await f?.dispose();f=null})
const symbols=[{market:'SH',code:'600519',name:'贵州茅台'},{market:'SZ',code:'000858',name:'五粮液'},{market:'SZ',code:'000568',name:'泸州老窖'}]
it('宿主真实sink串联三页证券、保留报告与分证券参数，并持久化后恢复',async()=>{
 f=await financialClientFixture({}, {sourceTransform:source=>require('../scripts/lib/home-workbench-client.mjs').patchHomeWorkbenchClient(source.replace(/\/\* EWORK_GRID_RESTORE [^\n]*\*\//g,'')).replace('exports.ResearchCanvas = ResearchCanvas;','exports.__studySink=homeWorkbenchStudySinks;exports.__financialSink=financialWidgetSinks;exports.__financialLinks=financialLinkSinks;exports.__Study=HomeWorkbenchStudy;exports.ResearchCanvas = ResearchCanvas;')})
 const w=f.workspace,session='financial-test',sources=['wo','wv','wd'].map(id=>({id,spec:{...financialWidgetDefaults('watchlist'),symbols,selectedSymbol:'SH:600519',refreshMinutes:0,refreshEnabled:false}})),studies=[['valuation','valuation','wv'],['matrix','matrix','valuation'],['directory','directory','wd'],['reader','reader','directory'],['analysis','analysis','directory'],['disclosure','disclosure','wo']].map(([id,role,source])=>({id,spec:homeWorkbenchStudySpec(role,'600519',{linkedSourceId:source})})),nodes=[...sources,...studies]
 await f.act(()=>{expect(w.applyWorkbench({id:'study-integration',panels:nodes.map((n,i)=>({nodeId:n.id,title:n.spec.title,prompt:n.spec.title,pending:true,width:400,height:300,x:0,y:i*310}))})).toBe(true);for(const n of nodes)expect(w.applyWorkbench({id:'study-integration',panels:[{nodeId:n.id,taskId:'task-'+n.id,preparedOutput:JSON.stringify(n.spec)}]})).toBe(true)})
 const get=id=>w.getSnapshot().artifacts.find(n=>n.id===id).containerSpec,study=(id,patch)=>{const spec=get(id);return f.bundle.__studySink.get(session)(id,spec,{...spec,...patch})},select=(id,selectedSymbol)=>{const spec=get(id);return f.bundle.__financialSink.get(session)(id,spec,{...spec,selectedSymbol})}
 await f.act(()=>{expect(study('directory',{reportKind:'quarter'})).toBe(true);expect(select('wd','SZ:000858')).toBe(true)})
 for(const id of ['wo','wv','wd'])expect(get(id).selectedSymbol).toBe('SZ:000858')
 for(const id of ['directory','reader','analysis'])expect(get(id)).toMatchObject({security:'000858',reportKind:'quarter'})
 expect(homeWorkbenchStudyModel(get('reader')).reportRows[0][2]).toBeCloseTo(170.8576565795,8)
 await f.act(()=>{expect(study('valuation',{scenarios:{...get('valuation').scenarios,'000858':{pe:25,epsChange:5}}})).toBe(true);expect(select('wo','SH:600519')).toBe(true)})
 expect(homeWorkbenchStudyModel(get('matrix')).valuation.pe).toBe(20)
 expect(get('reader').reportKind).toBe('quarter')
 await f.act(()=>{expect(select('wv','SZ:000858')).toBe(true);expect(w.persist()).toBe(true)})
 expect(homeWorkbenchStudyModel(get('matrix')).valuation.price).toBeCloseTo(60.5535,8)
 await f.act(()=>{expect(f.bundle.__financialLinks.get(session)(null,'directory')).toBe(true)})
 for(const id of ['directory','reader','analysis'])expect(get(id).security).toBeNull()
 // The directory is outside this fixture viewport; inspect the same native renderer.
 const waiting=require('react-dom/server').renderToStaticMarkup(require('react').createElement(f.bundle.__Study,{node:w.getSnapshot().artifacts.find(n=>n.id==='directory'),sessionId:session}))
 expect(waiting).toContain('data-financial-port="input"');expect(waiting).toContain('data-financial-port="output"')
 await f.act(()=>{expect(f.bundle.__financialLinks.get(session)('wd','directory')).toBe(true);expect(w.persist()).toBe(true)})
 for(const id of ['directory','reader','analysis'])expect(get(id)).toMatchObject({security:'000858',reportKind:'quarter'})
 const reloaded=new f.bundle.ResearchWorkspaceRegistry(f.win.localStorage).for(session),saved=id=>reloaded.getSnapshot().artifacts.find(n=>n.id===id).containerSpec
 expect(saved('reader')).toMatchObject({security:'000858',reportKind:'quarter'})
 expect(saved('valuation').scenarios['000858']).toEqual({pe:25,epsChange:5})
 expect(saved('matrix').scenarios['000858']).toEqual({pe:25,epsChange:5})
})
