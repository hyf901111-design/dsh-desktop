import {afterAll, beforeAll, expect, it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createSourceFile, forEachChild, isFunctionDeclaration, isVariableDeclaration, ScriptKind, ScriptTarget} from 'typescript'
import {patchFigmaFilePreview} from '../scripts/lib/figma-file-preview-client.mjs'

const originalWidth='const renderWidth = bodySize.width > 0 ? preview.pageCount === 1 ? Math.min(bodySize.width, bodySize.height * pageRatio) : bodySize.width : 0;'
const noteOnlyWidth='const renderWidth = bodySize.width > 0 ? !node.noteDocument && preview.pageCount === 1 ? Math.min(bodySize.width, bodySize.height * pageRatio) : bodySize.width : 0;'
let browser, server, baseUrl

// Valid one-page PDFs with a green marker at the bottom, rendered by real PDF.js.
function pdfBytes(height){
  const paint=`0 1 0 rg 0 0 600 40 re f\n1 0 0 rg 0 ${height-40} 600 40 re f\n`
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 ${height}] /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(paint)} >>\nstream\n${paint}endstream`
  ]
  let data='%PDF-1.4\n',offsets=[0]
  for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(data));data+=`${index+1} 0 obj\n${object}\nendobj\n`}
  const xref=Buffer.byteLength(data)
  data+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')
  data+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(data)
}

async function viewerBundle(source){
  const tree=createSourceFile('conversation.js',source,ScriptTarget.Latest,false,ScriptKind.JS),functions=new Map(),constants=new Map()
  const names=['researchPdfPageLayout','researchPdfRenderWindow','researchPdfBackingStore','loadResearchPdfLibrary','ResearchCanvasPdfPreview']
  const visit=node=>{
    if(isFunctionDeclaration(node)&&names.includes(node.name?.text))functions.set(node.name.text,node.getText(tree))
    if(isVariableDeclaration(node)&&node.name.getText(tree).startsWith('RESEARCH_PDF_'))constants.set(node.name.getText(tree),node.initializer.getText(tree))
    forEachChild(node,visit)
  }
  visit(tree)
  if(functions.size!==names.length)throw Error('The production PDF viewer was not found')
  const output=await build({
    stdin:{resolveDir:process.cwd(),loader:'js',contents:`
      import * as react from 'react';import * as react_jsx_runtime from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
      const useWorkbenchLocale=()=>{},workbenchText=text=>text;
      ${[...constants].map(([name,value])=>'const '+name+'='+value+';').join('\n')}
      let researchPdfLibraryPromise=null;
      ${names.map(name=>functions.get(name)).join('\n')}
      window.mountPdf=({notes,long})=>{
        window.metadata=[];window.pageStatus=[];window.releases=[];
        window.dshDesktop={researchPreview:{restore:async()=>({url:long?'/long.pdf':'/portrait.pdf',authorizationId:'grant',capabilityToken:'cap'}),release:value=>window.releases.push(value)}};
        const root=createRoot(document.querySelector('#host'));
        root.render(react.createElement(ResearchCanvasPdfPreview,{node:{id:'pdf-width',name:'width.pdf',authorizationId:'grant',aspectRatio:long?.25:.75,noteDocument:notes},sessionId:notes?'note-files:width':'research-width',visible:true,onNaturalSize:(width,height)=>window.metadata.push({width,height}),onPageStatus:value=>window.pageStatus.push(value)}));
        window.unmountPdf=()=>root.unmount();
      };`
    },bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}
  })
  return output.outputFiles[0].text
}

beforeAll(async()=>{
  const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
  const width=/const renderWidth = bodySize\.width > 0 \?[^\n]+;/
  const inputs={current:source,original:source.replace(width,originalWidth),'note-only':source.replace(width,noteOnlyWidth)}
  const bundles=new Map(await Promise.all(Object.entries(inputs).map(async([name,input])=>['/viewer-'+name+'.js',await viewerBundle(patchFigmaFilePreview(input))])))
  bundles.set('/viewer-reapplied.js',await viewerBundle(patchFigmaFilePreview(patchFigmaFilePreview(source))))
  const css=Array.from(source.matchAll(/([^{}]+)\{([^{}]*)\}/g)).filter(match=>match[1].includes('.rScV5Q_pdfScroll')).map(match=>match[0]).join('\n')
  const assets=resolve('node_modules/@deepseek-ai/dsh-web-frontend/dist/sherlock-pdfjs')
  const documents=new Map([['/portrait.pdf',pdfBytes(800)],['/long.pdf',pdfBytes(2400)]])
  server=createServer((request,response)=>{void(async()=>{
    const pathname=new URL(request.url,'http://localhost').pathname
    if(pathname==='/'){response.setHeader('content-type','text/html');response.end(`<style>body{margin:0}#host{width:900px;height:180px}${css}</style><div id="host"></div>`);return}
    if(bundles.has(pathname)){response.setHeader('content-type','text/javascript');response.end(bundles.get(pathname));return}
    if(documents.has(pathname)){response.setHeader('content-type','application/pdf');response.end(documents.get(pathname));return}
    if(pathname.startsWith('/sherlock-pdfjs/')&&!pathname.includes('..')){response.setHeader('content-type',pathname.endsWith('.js')?'text/javascript':'application/octet-stream');response.end(await readFile(join(assets,pathname.slice('/sherlock-pdfjs/'.length))));return}
    response.writeHead(404);response.end()
  })().catch(error=>{response.writeHead(500);response.end(error.message)})})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));baseUrl='http://127.0.0.1:'+server.address().port
  const runtime=process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const {chromium}=await import(/* @vite-ignore */pathToFileURL(runtime).href)
  browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve))})

async function mount(notes,long=false,variant='current'){
  const page=await browser.newPage({viewport:{width:1300,height:900}}),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(baseUrl);await page.addScriptTag({url:baseUrl+'/viewer-'+variant+'.js'});await page.evaluate(options=>window.mountPdf(options),{notes,long})
  await page.locator('[data-research-pdf-rendered-page="1"]').waitFor()
  return {page,errors,async size(){return page.locator('[data-research-pdf-scroll]').evaluate(scroll=>{const canvas=scroll.querySelector('canvas');return{width:canvas.getBoundingClientRect().width,height:canvas.getBoundingClientRect().height,bodyWidth:scroll.clientWidth,bodyHeight:scroll.clientHeight,scrollHeight:scroll.scrollHeight}})},async resize(width,height){await page.locator('#host').evaluate((host,size)=>{host.style.width=size.width+'px';host.style.height=size.height+'px'}, {width,height});await page.waitForTimeout(80)},async close(){await page.evaluate(()=>window.unmountPdf());expect(errors).toEqual([]);await page.close()}}
}

for(const notes of [false,true]){
  const mode=notes?'notes':'research'
  it(`fills a short wide ${mode} component with a real single-page PDF`,async()=>{
    const f=await mount(notes);try{const size=await f.size();expect(size.width).toBe(size.bodyWidth);expect(size.height).toBeGreaterThan(size.bodyHeight)}finally{await f.close()}
  },10000)
  it(`keeps ${mode} PDF page width unchanged when only its viewport grows taller`,async()=>{
    const f=await mount(notes);try{const before=await f.size();await f.resize(900,400);expect((await f.size()).width).toBe(before.width)}finally{await f.close()}
  },10000)
  it(`expands a ${mode} PDF page when the component becomes wider`,async()=>{
    const f=await mount(notes);try{const before=await f.size();await f.resize(1100,180);await expect.poll(async()=>{const size=await f.size();return size.width>before.width&&size.width===size.bodyWidth}).toBe(true)}finally{await f.close()}
  },10000)
  it(`scrolls to the actual bottom of a long ${mode} PDF page`,async()=>{
    const f=await mount(notes,true);try{
      const size=await f.size();expect(size.scrollHeight).toBeGreaterThan(size.bodyHeight+1000)
      await f.page.locator('[data-research-pdf-scroll]').evaluate(scroll=>scroll.scrollTop=scroll.scrollHeight)
      await expect.poll(()=>f.page.locator('[data-research-pdf-scroll]').evaluate(scroll=>{const canvas=scroll.querySelector('canvas'),a=scroll.getBoundingClientRect(),b=canvas.getBoundingClientRect();return Math.abs(a.bottom-b.bottom)<1&&scroll.scrollTop>1000})).toBe(true)
      expect(await f.page.locator('canvas').evaluate(canvas=>Array.from(canvas.getContext('2d').getImageData(10,canvas.height-10,1,1).data))).toEqual([0,255,0,255])
    }finally{await f.close()}
  },10000)
}

for(const variant of ['original','note-only','reapplied'])it(`migrates the ${variant} PDF viewer to component width`,async()=>{
  const f=await mount(false,false,variant);try{const size=await f.size();expect(size.width).toBe(size.bodyWidth)}finally{await f.close()}
},10000)
