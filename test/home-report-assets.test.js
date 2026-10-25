import {afterEach,expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {readFile,rm,symlink,unlink,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {micromark} from 'micromark'
import {JSDOM} from 'jsdom'
import {deliveryPathsFromMarkdown} from '../scripts/lib/delivery-file-model.mjs'
import {homeReportAssetsFixture} from './fixtures/home-report-assets.js'
const runtimePath='../packages/dsh-research-task-runtime/home-report-runtime.js',contractPath='../packages/dsh-research-task-runtime/home-report-contract.js',dirs=[]
const auditFiles=['evidence.json','calculations.json','validation.json','run.json']
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
afterEach(async()=>{for(const directory of dirs.splice(0))await rm(directory,{recursive:true,force:true})})
const modules=async()=>({runtime:await import(runtimePath).catch(()=>({})),contract:await import(contractPath).catch(()=>({}))})
const fixture=async options=>{const f=await homeReportAssetsFixture(options);dirs.push(f.directory);return f}
const saveMetadata=(f,metadata)=>writeFile(join(f.directory,'source-metadata.json'),JSON.stringify(metadata))
const unavailable=(runtime,directory)=>expect(runtime.loadHomeReportAssets(directory).then(()=>undefined)).rejects.toThrow()
const saveAudit=async(f,name,bytes)=>{
 f.auditBytes={...f.auditBytes,[name]:bytes};f.metadata={...f.metadata,audit:{...f.metadata.audit,[name]:hash(bytes)}}
 if(name!=='run.json'){
  const run=JSON.parse(f.auditBytes['run.json'].toString());run.outputs[name]=hash(bytes)
  const runBytes=Buffer.from(JSON.stringify(run));f.auditBytes['run.json']=runBytes;f.metadata.audit['run.json']=hash(runBytes)
  await writeFile(join(f.directory,'run.json'),runBytes)
 }
 await writeFile(join(f.directory,name),bytes);await saveMetadata(f,f.metadata)
}
const saveHtml=async(f,html)=>{
 f.html=Buffer.from(html);f.metadata={...f.metadata,htmlSha256:hash(f.html)}
 if(f.metadata.schemaVersion===2){const run=JSON.parse(f.auditBytes['run.json'].toString());run.outputs[f.deliveryNames.html]=f.metadata.htmlSha256;await saveAudit(f,'run.json',Buffer.from(JSON.stringify(run)))}
 await writeFile(join(f.directory,f.metadata.htmlFile),f.html);await saveMetadata(f,f.metadata)
}

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

it('loads schema2 fixed transport files, original delivery basenames and all four verified audit JSON byte buffers',async()=>{
 const {runtime}=await modules(),f=await fixture({schemaVersion:2})
 expect(f.metadata.htmlFile).toBe('research-report.html');expect(f.metadata.pdfFile).toBe('research-report.pdf')
 expect(f.metadata.deliveryNames).toEqual(f.deliveryNames);expect(Object.keys(f.metadata.audit)).toEqual(auditFiles)
 for(const name of auditFiles){expect(f.html.toString()).toContain(`href="./${name}"`);expect(hash(await readFile(join(f.directory,name)))).toBe(f.metadata.audit[name])}
 const loaded=await runtime.loadHomeReportAssets(f.directory)
 expect(loaded.metadata).toEqual(f.metadata);expect(loaded.htmlBytes).toEqual(f.html);expect(loaded.pdfBytes).toEqual(f.pdf)
 expect(loaded.auditBytes).toEqual(f.auditBytes)
 const run=JSON.parse(loaded.auditBytes['run.json'].toString())
 expect(run.artifacts).toEqual(f.deliveryNames)
 expect(run.outputs).toMatchObject({[f.deliveryNames.html]:f.metadata.htmlSha256,[f.deliveryNames.pdf]:f.metadata.pdfSha256,...Object.fromEntries(auditFiles.filter(name=>name!=='run.json').map(name=>[name,f.metadata.audit[name]])),'report-quality.json':'e'.repeat(64)})
})

it('accepts schema2 HTML audit hrefs written as plain basenames',async()=>{
 const {runtime}=await modules(),f=await fixture({schemaVersion:2})
 await saveHtml(f,f.html.toString().replaceAll('href="./','href="'))
 expect((await runtime.loadHomeReportAssets(f.directory)).auditBytes).toEqual(f.auditBytes)
})

it.each(['./evidence.json','./calculations.json','./validation.json','./run.json','./arbitrary.json','../audit/evidence.json'])('fails closed when a legacy schema1 HTML links an unmanifested auxiliary JSON at %s',async href=>{
 const {runtime}=await modules(),f=await fixture()
 await saveHtml(f,f.html.toString().replace('</body>',`<a href="${href}">研究审计材料</a></body>`))
 await unavailable(runtime,f.directory)
})

it.each([
 ['missing delivery names',undefined],
 ['missing HTML basename',{pdf:'报告.pdf'}],
 ['missing PDF basename',{html:'报告.html'}],
 ['unknown third basename',{html:'报告.html',pdf:'报告.pdf',json:'evidence.json'}],
 ['parent traversal',{html:'../报告.html',pdf:'报告.pdf'}],
 ['nested directory',{html:'reports/报告.html',pdf:'报告.pdf'}],
 ['absolute path',{html:'/tmp/报告.html',pdf:'报告.pdf'}],
 ['Windows path',{html:'报告.html',pdf:'C:\\reports\\报告.pdf'}],
 ['backslash traversal',{html:'报告.html',pdf:'..\\报告.pdf'}],
 ['wrong HTML extension',{html:'报告.htm',pdf:'报告.pdf'}],
 ['wrong PDF extension',{html:'报告.html',pdf:'报告文档.html'}],
 ['extension suffix',{html:'报告.html.exe',pdf:'报告.pdf'}],
 ['empty HTML basename',{html:'.html',pdf:'报告.pdf'}],
 ['empty PDF basename',{html:'报告.html',pdf:'.pdf'}],
 ['control character',{html:'报告\n.html',pdf:'报告.pdf'}],
])('rejects schema2 delivery names with %s',async(_label,deliveryNames)=>{
 const {runtime}=await modules(),f=await fixture({schemaVersion:2})
 if(deliveryNames&&typeof deliveryNames==='object'&&typeof deliveryNames.html==='string'&&typeof deliveryNames.pdf==='string'){
  const run=JSON.parse(f.auditBytes['run.json'].toString());run.artifacts={...deliveryNames}
  delete run.outputs[f.deliveryNames.html];delete run.outputs[f.deliveryNames.pdf]
  run.outputs[deliveryNames.html]=f.metadata.htmlSha256;run.outputs[deliveryNames.pdf]=f.metadata.pdfSha256
  await saveAudit(f,'run.json',Buffer.from(JSON.stringify(run)))
 }
 await saveMetadata(f,{...f.metadata,deliveryNames})
 await unavailable(runtime,f.directory)
})

it.each([
 ['absent audit',audit=>undefined],
 ['array audit',audit=>Object.entries(audit)],
 ['missing audit entry',audit=>{delete audit['run.json'];return audit}],
 ['fifth audit entry',audit=>({...audit,'private.json':hash(Buffer.from('{}'))})],
 ['parent audit path',audit=>{audit['../evidence.json']=audit['evidence.json'];delete audit['evidence.json'];return audit}],
 ['nested audit path',audit=>{audit['audit/evidence.json']=audit['evidence.json'];delete audit['evidence.json'];return audit}],
 ['absolute audit path',audit=>{audit['/tmp/evidence.json']=audit['evidence.json'];delete audit['evidence.json'];return audit}],
 ['backslash audit path',audit=>{audit['audit\\evidence.json']=audit['evidence.json'];delete audit['evidence.json'];return audit}],
 ['uppercase digest',audit=>({...audit,'evidence.json':audit['evidence.json'].toUpperCase()})],
 ['short digest',audit=>({...audit,'evidence.json':audit['evidence.json'].slice(1)})],
 ['nonhex digest',audit=>({...audit,'evidence.json':'z'.repeat(64)})],
 ['nonstrings digest',audit=>({...audit,'evidence.json':7})],
])('rejects schema2 manifests with %s',async(_label,change)=>{
 const {runtime}=await modules(),f=await fixture({schemaVersion:2})
 await saveMetadata(f,{...f.metadata,audit:change({...f.metadata.audit})})
 await unavailable(runtime,f.directory)
})

it.each(auditFiles)('rejects a missing, tampered, invalid JSON or symbolic-link schema2 audit file: %s',async name=>{
 const {runtime}=await modules(),f=await fixture({schemaVersion:2}),target=join(f.directory,name)
 await unlink(target);await unavailable(runtime,f.directory)
 await writeFile(target,Buffer.concat([f.auditBytes[name],Buffer.from(' ')]));await unavailable(runtime,f.directory)
 const originalAuditBytes={...f.auditBytes},originalMetadata=f.metadata
 const invalid=Buffer.from('{"incomplete":')
 await saveAudit(f,name,invalid);await unavailable(runtime,f.directory)
 f.auditBytes=originalAuditBytes;f.metadata=originalMetadata
 await writeFile(join(f.directory,'run.json'),f.auditBytes['run.json']);await saveMetadata(f,f.metadata)
 await writeFile(join(f.directory,'audit-target.txt'),f.auditBytes[name]);await unlink(target);await symlink(join(f.directory,'audit-target.txt'),target)
 await unavailable(runtime,f.directory)
})

it.each(auditFiles)('still loads all four verified schema2 audits when HTML omits the href for %s',async name=>{
 const {runtime}=await modules(),f=await fixture({schemaVersion:2})
 await saveHtml(f,f.html.toString().replace(`<a href="./${name}">${name}</a>`,`<span>${name}</span>`))
 expect((await runtime.loadHomeReportAssets(f.directory)).auditBytes).toEqual(f.auditBytes)
})

it('loads all four schema2 audit files even when the HTML has no auxiliary hrefs',async()=>{
 const {runtime}=await modules(),f=await fixture({schemaVersion:2})
 await saveHtml(f,f.html.toString().replace(/<a href="\.\/[^\"]+\.json">[^<]+<\/a>/g,''))
 expect((await runtime.loadHomeReportAssets(f.directory)).auditBytes).toEqual(f.auditBytes)
})

it('does not load or reject an unreferenced JSON outside the four schema2 audit assets',async()=>{
 const {runtime}=await modules(),f=await fixture({schemaVersion:2})
 await writeFile(join(f.directory,'private.json'),JSON.stringify({unreferenced:true}))
 expect((await runtime.loadHomeReportAssets(f.directory)).auditBytes).toEqual(f.auditBytes)
})

it.each(['delivery basename','HTML output digest'])('rejects schema2 run records inconsistent with the %s',async change=>{
 const {runtime}=await modules(),f=await fixture({schemaVersion:2})
 if(change==='delivery basename')await saveMetadata(f,{...f.metadata,deliveryNames:{...f.deliveryNames,html:'另一份报告.html'}})
 else{const run=JSON.parse(f.auditBytes['run.json'].toString());run.outputs[f.deliveryNames.html]='0'.repeat(64);await saveAudit(f,'run.json',Buffer.from(JSON.stringify(run)))}
 await unavailable(runtime,f.directory)
})

it('rejects a schema2 audit JSON larger than the 4 MiB preview boundary even when its digest matches',async()=>{
 const {runtime}=await modules(),f=await fixture({schemaVersion:2}),name='evidence.json',bytes=Buffer.from(JSON.stringify({oversized:'x'.repeat(4*1024*1024)}))
 await saveAudit(f,name,bytes);await unavailable(runtime,f.directory)
})

it.each(['./private.json','../evidence.json','./audit/evidence.json','/tmp/evidence.json','./audit\\evidence.json'])('rejects schema2 HTML auxiliary references outside the four basename allowlist: %s',async href=>{
 const {runtime}=await modules(),f=await fixture({schemaVersion:2})
 await writeFile(join(f.directory,'private.json'),JSON.stringify({fixture:true}))
 await saveHtml(f,f.html.toString().replace('</body>',`<a href="${href}">额外研究材料</a></body>`))
 await unavailable(runtime,f.directory)
})


it.each(['./private.json&#9;','./private&period;json','./pri&Tab;vate.json','./private.json&#13;'])('rejects an unmanifested JSON after real HTML href normalization: %s',async href=>{
 const {runtime}=await modules(),f=await fixture()
 await saveHtml(f,f.html.toString().replace('</body>',`<a href="${href}">研究审计材料</a></body>`))
 const dom=new JSDOM(f.html.toString(),{url:'https://preview.invalid/report.html'}),link=dom.window.document.querySelector('a')
 expect(new URL(link.href).pathname).toBe('/private.json');dom.window.close()
 await unavailable(runtime,f.directory)
})

it('does not treat href-like text in comments or script bodies as published JSON links',async()=>{
 const {runtime}=await modules(),f=await fixture()
 await saveHtml(f,f.html.toString().replace('</body>',`<!-- href="private.json" --><script type="application/json">{"example":"href='private.json'"}</script></body>`))
 expect((await runtime.loadHomeReportAssets(f.directory)).metadata).toEqual(f.metadata)
})

it('encodes original delivery basenames as URI paths without renaming files or losing quick file cards',async()=>{
 const {runtime}=await modules(),f=await fixture({schemaVersion:2}),deliveryNames={html:'报告 #1? (中文) 50%.html',pdf:'报告 #1? (中文) 50%.pdf'}
 const manifest=JSON.parse(f.auditBytes['run.json'].toString());manifest.artifacts=deliveryNames
 delete manifest.outputs[f.deliveryNames.html];delete manifest.outputs[f.deliveryNames.pdf]
 manifest.outputs[deliveryNames.html]=f.metadata.htmlSha256;manifest.outputs[deliveryNames.pdf]=f.metadata.pdfSha256
 await saveAudit(f,'run.json',Buffer.from(JSON.stringify(manifest)));f.metadata={...f.metadata,deliveryNames};await saveMetadata(f,f.metadata)
 const loaded=await runtime.loadHomeReportAssets(f.directory),reply=runtime.createHomeReportReplay(loaded.metadata).delivery
 const dom=new JSDOM(micromark(reply),{url:'https://preview.invalid/workspace/'})
 const links=[...dom.window.document.querySelectorAll('a')]
 expect(links).toHaveLength(2)
 for(const [index,name]of Object.values(deliveryNames).entries()){
  const url=new URL(links[index].href)
  expect(decodeURIComponent(url.pathname)).toBe('/workspace/'+name);expect(url.search).toBe('');expect(url.hash).toBe('')
 }
 expect(deliveryPathsFromMarkdown(reply,'/workspace')).toEqual(Object.values(deliveryNames).map(name=>'/workspace/'+name))
 expect(loaded.metadata.deliveryNames).toEqual(deliveryNames);dom.window.close()
})
