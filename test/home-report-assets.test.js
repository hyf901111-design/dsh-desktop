import {afterEach,expect,it} from 'vitest'
import {readFile,rm,symlink,unlink,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {homeReportAssetsFixture} from './fixtures/home-report-assets.js'
const runtimePath='../packages/dsh-research-task-runtime/home-report-runtime.js',contractPath='../packages/dsh-research-task-runtime/home-report-contract.js',dirs=[]
afterEach(async()=>{for(const directory of dirs.splice(0))await rm(directory,{recursive:true,force:true})})
const modules=async()=>({runtime:await import(runtimePath).catch(()=>({})),contract:await import(contractPath).catch(()=>({}))})
const fixture=async()=>{const f=await homeReportAssetsFixture();dirs.push(f.directory);return f}

it('loads only fixed HTML/PDF whose hashes and provenance match the report manifest',async()=>{
 const {runtime,contract}=await modules();expect(runtime.loadHomeReportAssets).toBeTypeOf('function');expect(contract.createHomeReportBrief).toBeTypeOf('function')
 const f=await fixture(),loaded=await runtime.loadHomeReportAssets(f.directory)
 expect(loaded.metadata).toEqual(f.metadata);expect(loaded.htmlBytes).toEqual(f.html);expect(loaded.pdfBytes).toEqual(f.pdf)
 expect(contract.createHomeReportBrief(f.metadata)).toBe('帮我写一份测试公司的专业投资研究报告，讲清投资逻辑，并配上关键数据与图表，交付HTML和PDF。')
 expect(contract.HOME_REPORT_SKILL_ID).toBe('builtin:ework-equity-research');expect(contract.HOME_REPORT_SKILL_ALIAS).toBe('ework-equity-research')
})
it('fails closed for absent assets, wrong bytes, path substitution and chart sources outside the source catalog',async()=>{
 const {runtime}=await modules();expect(runtime.loadHomeReportAssets).toBeTypeOf('function')
 const f=await fixture()
 await writeFile(join(f.directory,f.metadata.htmlFile),'replaced')
 await expect(runtime.loadHomeReportAssets(f.directory)).rejects.toThrow()
 await writeFile(join(f.directory,f.metadata.htmlFile),f.html)
 const save=metadata=>writeFile(join(f.directory,'source-metadata.json'),JSON.stringify(metadata))
 for(const changed of [{...f.metadata,htmlFile:'../outside.html'},{...f.metadata,localPresetOnly:false},{...f.metadata,researchAsOf:'tomorrow'}, {...f.metadata,provenance:{...f.metadata.provenance,product:'somewhere else'}},{...f.metadata,provenance:{...f.metadata.provenance,sessionId:'session-ef0a2545-9150-4abd-a827-1ab64773fff6'}},{...f.metadata,chartCatalog:[{...f.metadata.chartCatalog[0],sourceIds:['not-in-catalog']}]}]){
  await save(changed);await expect(runtime.loadHomeReportAssets(f.directory)).rejects.toThrow()
 }
 await save(f.metadata);await unlink(join(f.directory,f.metadata.htmlFile));await symlink(join(f.directory,f.metadata.pdfFile),join(f.directory,f.metadata.htmlFile));await expect(runtime.loadHomeReportAssets(f.directory)).rejects.toThrow()
 await expect(runtime.loadHomeReportAssets(join(f.directory,'missing'))).rejects.toThrow()
})
it('builds public, paced walkthrough text from the real content index without inventing a source attachment',async()=>{
 const {runtime,contract}=await modules();expect(runtime.createHomeReportReplay).toBeTypeOf('function')
 const f=await fixture(),replay=runtime.createHomeReportReplay(f.metadata)
 expect(replay.structure).toContain('财务分析');expect(replay.structure).toContain('估值比较');expect(replay.intro).toContain('2026-10-23')
 expect(replay.delivery).toContain(f.metadata.keyFindings[0]);expect(replay.delivery).toContain('./'+contract.HOME_REPORT_PDF_FILE);expect(replay.delivery).toContain('./'+contract.HOME_REPORT_HTML_FILE)
 expect(replay.delivery).not.toContain('原始附件');expect(replay.delivery).not.toContain('正在实时生成')
 expect(await readFile(join(f.directory,'source-metadata.json'),'utf8')).toContain('Kimi K3')
})
