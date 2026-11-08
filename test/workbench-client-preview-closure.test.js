import {execFileSync} from 'node:child_process'
import {expect,it} from 'vitest'

it('constructs a workbench preview inside the shipped client closure rather than the source-module import closure',()=>{
 // A plain Node child preserves production function.toString() serialization;
 // Vitest's transformed imports would otherwise introduce its own SSR bindings.
 const result=execFileSync(process.execPath,['--input-type=module','-e',String.raw`
  import {readFile} from 'node:fs/promises';
  import {runInNewContext} from 'node:vm';
  import {Window} from 'happy-dom';
  import {componentTypographyPatch,patchLegacyDashboardPreview} from './scripts/lib/patch-research-board-client.mjs';
  const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8');
  const source=patchLegacyDashboardPreview(componentTypographyPatch(raw));
  let module;
  const window=new Window({url:'http://127.0.0.1/'});
  window.__ModuleLoader__={load:value=>{module=value}};
  const fallback=new Proxy(function(){},{get:()=>fallback,apply:()=>undefined,construct:()=>({})});
  if(!source.includes('exports.apply = apply;'))throw Error('Client export anchor missing');
  runInNewContext(source.replace('exports.apply = apply;','exports.__preview=buildResearchHtmlPreview;\nexports.apply = apply;'),{window,document:window.document,navigator:window.navigator,localStorage:window.localStorage,sessionStorage:window.sessionStorage,CustomEvent:window.CustomEvent,AbortController,TextEncoder,TextDecoder,console,setTimeout,clearTimeout,queueMicrotask});
  const exports=module.factory(()=>fallback);
  for(const workbench of [false,true]){
   const preview=exports.__preview('<p>完整业务内容</p>','依赖验收','dark',{workbench,notoFont:'runtime'});
   if(!preview.includes('完整业务内容'))throw Error('Original content missing');
   if(workbench&&(!preview.includes('function installWorkbenchStructureReading(')||!preview.includes('getScreenCTM')))throw Error('Reading guard missing');
  }
  await window.happyDOM.abort();
  console.log('client closure preview passed');
 `],{encoding:'utf8',timeout:30000});
 expect(result).toContain('client closure preview passed')
})
