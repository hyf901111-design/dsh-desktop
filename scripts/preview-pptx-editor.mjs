// Isolated UI verification using the deployed Office bundle and real file service.
// All edits target a disposable copy; no installed client or user file is touched.
import {build} from 'esbuild'
import {createServer} from 'node:http'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {patchPptxEditor} from './lib/pptx-editor-ui.mjs'
import {patchSherlockOfficePreviewClient} from './lib/patch-sherlock-office-preview.mjs'
import {patchPptxResize,stripPptxResizePatch} from './lib/pptx-resize-settle.mjs'

const directory=resolve(process.env.PPTX_EDITOR_PREVIEW_OUTPUT||'output/playwright/pptx-editor')
await mkdir(directory,{recursive:true})
const sample=process.env.PPTX_EDITOR_PREVIEW_SAMPLE||'efund-ework-onepage'
if(!['efund-ework-onepage','efund-ai-platform-v21','efund-template-v6'].includes(sample))throw Error('Unknown PPTX preview sample')
const template=await readFile('skills/efund-ppt-maker/assets/'+sample+'.pptx')
await writeFile(join(directory,'demo.pptx'),template)
await build({entryPoints:['src/main/pptx/service.ts'],bundle:true,platform:'node',format:'esm',outfile:join(directory,'service.mjs')})
const {PptxEditorService}=await import(pathToFileURL(join(directory,'service.mjs')))
const service=new PptxEditorService({resolveWorkspace:async id=>id==='preview'?directory:null,resolveCapability:async url=>url==='sherlock-preview://pptx-edit-demo/'?{path:join(directory,'demo.pptx'),root:directory}:null})
const client=patchPptxEditor(patchPptxResize(patchSherlockOfficePreviewClient(stripPptxResizePatch(await readFile('build/sherlock-plugin-profile/vendor/@huanlin/dsh-plugin-better-sidebar-plugin-office/lib/client.js','utf8')))))
await build({stdin:{contents:`import React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import * as roots from 'react-dom/client';window.__ModuleLoader__={load:descriptor=>{window.office=descriptor.factory(id=>{const value={'react':React,'react/jsx-runtime':jsx,'react-dom':dom,'react-dom/client':roots}[id];if(!value)throw Error('Unsupported browser module: '+id);return value})}};
window.sherlockPptEditor=Object.fromEntries(['open','save','preview'].map(action=>[action,async value=>{const response=await fetch('/editor/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});return response.json()}]));
const params=new URLSearchParams(location.search),research=params.get('mode')==='research';
window.start=()=>{const Component=research?window.office.officePreviewService.Component:window.office.officeViewers().find(view=>view.id.includes('pptx')).component;function App(){const [state,setState]=React.useState(null),controls=React.useRef(null);const props=research?{kind:'pptx',sourceUrl:'sherlock-preview://pptx-edit-demo/',title:'demo.pptx'}:{scope:{sessionId:'preview',cwd:''},path:'demo.pptx',title:'demo.pptx',toolbar:'host',onToolbarState:next=>setState(old=>JSON.stringify(old)===JSON.stringify(next)?old:next),onToolbarControls:next=>{controls.current=next}};
return React.createElement(React.Fragment,null,!research&&React.createElement('header',{className:'file-header'},React.createElement('span',null,'demo.pptx'),React.createElement('button',{onClick:()=>controls.current?.setMode('preview')},'预览'),React.createElement('button',{onClick:()=>controls.current?.setMode('edit')},'编辑'),React.createElement('button',{onClick:()=>controls.current?.save()},'保存'),React.createElement('span',null,state?.dirty?'未保存':state?.saveState==='saved'?'已保存':'')),React.createElement('div',{className:'file-body'},React.createElement(Component,props)))}roots.createRoot(document.getElementById('panel')).render(React.createElement(App))}`,
resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',outfile:join(directory,'host.js'),define:{'process.env.NODE_ENV':'"production"'}})
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),pathname=url.pathname
  if(['/editor/open','/editor/save','/editor/preview'].includes(pathname)){
   if(req.method!=='POST'){res.writeHead(405);res.end();return}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4*1024*1024)throw Error('Request too large')}
   res.setHeader('Content-Type','application/json');const result=await service[pathname.split('/').pop()](JSON.parse(body));if(result.bytes)result.bytes=Array.from(result.bytes);res.end(JSON.stringify(result))
  }else if(pathname==='/sidebar/file'||pathname==='/demo.pptx'){res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.presentationml.presentation');res.end(await readFile(join(directory,'demo.pptx')))}
  else if(pathname==='/office.js'){res.setHeader('Content-Type','text/javascript');res.end(client)}
  else if(pathname==='/host.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(join(directory,'host.js')))}
  else if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><title>PPTX 内容编辑验证</title><style>html,body{height:100%;margin:0}body{font:13px system-ui;background:#ececec;color:#2b2b2b}body[data-ds-dark-theme]{background:#181818;color:#e5e5e5}.fixture-bar{height:48px;padding:0 20px;display:flex;gap:20px;align-items:center}a{color:inherit}button{font:inherit;cursor:pointer}#panel{margin:0 16px 16px auto;width:420px;height:calc(100vh - 72px);display:flex;flex-direction:column;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px #0001}body[data-ds-dark-theme] #panel{background:#242424}.file-header{display:flex;align-items:center;gap:6px;flex-shrink:0;padding:10px;border-bottom:1px solid #8883}.file-header span:first-child{flex:1}.file-header button{color:inherit;background:#8881;border:1px solid #8883;border-radius:5px;padding:4px 8px}.file-body{flex:1;min-height:0;min-width:0}.research #panel{width:calc(100% - 32px)}.research .file-body{height:100%}</style><nav class="fixture-bar"><b>独立功能验证</b><a href="/?mode=sidebar">右侧栏</a><a href="/?mode=research">研究组件</a><button onclick="document.body.toggleAttribute('data-ds-dark-theme')">切换深浅色</button></nav><div id="panel"></div><script>if(new URLSearchParams(location.search).get('mode')==='research')document.body.classList.add('research');const originalFetch=window.fetch;window.fetch=(url,options)=>originalFetch(String(url).startsWith('sherlock-preview:')?'/demo.pptx':url,options)</script><script src="/host.js"></script><script src="/office.js"></script><script>window.start()</script>`) }
  else{res.writeHead(404);res.end()}
 }catch(error){res.writeHead(500);res.end(String(error))}
})
server.listen(Number(process.env.PPTX_EDITOR_PREVIEW_PORT||5187),'127.0.0.1',()=>console.log('PPTX editor preview: http://127.0.0.1:'+server.address().port))
