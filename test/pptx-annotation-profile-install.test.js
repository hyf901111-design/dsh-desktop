import {afterEach,expect,it} from 'vitest'
import {readFileSync,writeFileSync} from 'node:fs'
import {cp,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {Script} from 'node:vm'

// The production loader keeps the Function.toString byte identity used by strict inverses.
const require=createRequire(import.meta.url),{parse}=require('@babel/parser')
const annotation=require('../scripts/lib/pptx-annotation-native.mjs'),home=require('../scripts/lib/home-guide-native.mjs'),presentation=require('../scripts/lib/home-guide-presentation-native.mjs'),grid=require('../scripts/lib/research-grid-workbench.mjs'),components=require('../scripts/lib/conversation-components.mjs'),compaction=require('../scripts/lib/conversation-compaction-lifecycle.mjs')
const dirs=[]
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))})
it('executes the actual first and last conversation installer statements only on an isolated raw bundle and remains byte-idempotent',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'annotation-profile-entry-'));dirs.push(root);const target=path.join(root,'client.js'),source=readFileSync('scripts/patch-web-frontend-loading.mjs','utf8'),ast=parse(source,{sourceType:'module'})
 const writes=ast.program.body.filter(node=>node.type==='ExpressionStatement'&&node.expression.type==='CallExpression'&&node.expression.callee.name==='writeFileSync'&&['gridConversationPath','conversationPath','notesConversationPath'].includes(node.expression.arguments[0]?.name))
 const first=source.slice(writes[0].start,writes[0].end),last=source.slice(writes.at(-1).start,writes.at(-1).end),trace=[]
 const operations={restoreResearchGridWorkbench:value=>{trace.push('grid');return grid.restoreResearchGridWorkbench(value)},stripHomeGuideNative:value=>{trace.push('home');return home.stripHomeGuideNative(value)},stripHomeGuidePresentationNative:value=>{trace.push('presentation');return presentation.stripHomeGuidePresentationNative(value)},stripPptxAnnotationInput:value=>{trace.push('annotation');return annotation.stripPptxAnnotationInput(value)},patchPptxAnnotationInput:annotation.patchPptxAnnotationInput}
 const run=code=>new Function('readFileSync','writeFileSync','gridConversationPath','conversationPath',...Object.keys(operations),code)(readFileSync,writeFileSync,target,target,...Object.values(operations))
 let middle
 const round=raw=>{writeFileSync(target,raw);trace.length=0;run(first);expect(trace).toEqual(['annotation','presentation','home','grid']);middle=[grid.patchResearchGridWorkbench,home.patchHomeGuideNative,presentation.patchHomeGuidePresentationNative,components.patchConversationComponents,compaction.patchConversationCompactionLifecycle].reduce((value,apply)=>apply(value),readFileSync(target,'utf8'));writeFileSync(target,middle);run(last);const output=readFileSync(target,'utf8');expect(annotation.stripPptxAnnotationInput(output)).toBe(middle);expect(output.split('function createPptxAnnotationNativeRuntime(')).toHaveLength(2);new Script(output);return output}
 const raw=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),once=round(annotation.patchPptxAnnotationInput(raw)),twice=round(once)
 expect(twice).toBe(once);expect(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')).toBe(raw)
 expect(()=>annotation.stripPptxAnnotationInput(once.replace('function createPptxAnnotationNativeRuntime(','function changedNativeRuntime('))).toThrow(/drifted/)
},20000)
it('copies the real runtime/contract and existing asset tree through the actual portable-package copy function without running preparation',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'annotation-profile-runtime-'));dirs.push(root);const source=readFileSync('scripts/prepare-bundled-plugin-profile.mjs','utf8'),ast=parse(source,{sourceType:'module'}),copy=ast.program.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='copyInstalledPlugin'),excluded=ast.program.body.flatMap(node=>node.type==='VariableDeclaration'?node.declarations:[]).find(node=>node.id.name==='excludedSourceNames'),excludedNames=new Function('return '+source.slice(excluded.init.start,excluded.init.end))()
 const copyPackage=new Function('cp','readFile','writeFile','excludedSourceNames','path',source.slice(copy.start,copy.end)+'\nreturn copyInstalledPlugin;')(cp,readFile,writeFile,excludedNames,path),runtime=path.resolve('packages/dsh-research-task-runtime'),target=path.join(root,'runtime')
 const policy=JSON.parse(readFileSync('build/sherlock-bundled-plugins.json','utf8'));expect(policy.runtimePackages).toContain('dsh-research-task-runtime');await copyPackage(runtime,target)
 for(const name of ['home-report-runtime.js','home-report-contract.js','home-report-contract.d.ts'])expect(await readFile(path.join(target,name))).toEqual(await readFile(path.join(runtime,name)))
 const files=async(directory,relative='')=>{const result=[];for(const entry of await readdir(path.join(directory,relative),{withFileTypes:true})){const next=path.join(relative,entry.name);if(entry.isDirectory())result.push(...await files(directory,next));else if(entry.isFile())result.push(next)}return result}
 const assets=await files(path.join(runtime,'assets'));expect(assets.length).toBeGreaterThan(0);expect(await files(path.join(target,'assets'))).toEqual(assets)
 for(const name of assets)expect(await readFile(path.join(target,'assets',name))).toEqual(await readFile(path.join(runtime,'assets',name)))
 expect(JSON.parse(await readFile(path.join(target,'package.json'),'utf8')).name).toBe('dsh-research-task-runtime')
},20000)
