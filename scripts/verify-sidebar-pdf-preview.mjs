// Isolated browser fixture for the production sidebar PDF renderer. No app profile access.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { loadSidebarPdfLibrary, mountSidebarPdfPreview } from './lib/sidebar-pdf-preview.mjs'

const output = resolve(process.env.EWORK_QA_OUTPUT || 'output/sidebar-pdf-preview')
await mkdir(output, { recursive: true })
function samplePdf() {
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R 9 0 R 11 0 R 13 0 R] /Count 6 >>']
  for (let page = 0; page < 6; page++) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 420] /Resources << /Font << /F1 15 0 R >> >> /Contents ${4 + page * 2} 0 R >>`)
    const stream = `BT /F1 14 Tf 30 380 Td (Original PDF - page ${page + 1}) Tj 0 -30 Td /F1 12 Tf (Sidebar document rendering.) Tj ET`
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  let pdf = '%PDF-1.4\n'; const offsets = [0]
  for (let i = 1; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i} 0 obj\n${objects[i]}\nendobj\n` }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')
  return Buffer.from(pdf + `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
}
const source = `${loadSidebarPdfLibrary.toString()}\n${mountSidebarPdfPreview.toString()}\nlet view; window.show = async(url='/test.pdf')=>{view?.dispose(); const bytes=await(await fetch(url)).blob();view=mountSidebarPdfPreview(document.getElementById('reader'),URL.createObjectURL(bytes));await view.ready};window.dispose=()=>view.dispose();window.show();`
const server = createServer(async(req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname
    if (path === '/test.pdf') { res.setHeader('Content-Type', 'application/pdf'); res.end(samplePdf()) }
    else if (path === '/invalid.pdf') res.end('This is not a PDF')
    else if (path === '/reader.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(source) }
    else if (path.startsWith('/sherlock-pdfjs/') && !path.includes('..')) { res.setHeader('Content-Type', path.endsWith('.js') ? 'application/javascript' : 'application/octet-stream'); res.end(await readFile(join(process.cwd(), 'node_modules/@deepseek-ai/dsh-web-frontend/dist', path))) }
    else if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><style>body{background:#181818;color:#ddd;font:14px system-ui}#panel{height:640px;width:340px;margin-left:auto;border-radius:16px;overflow:hidden;background:#222}</style><div id="panel"><div id="reader"></div></div><script src="/reader.js"></script>') }
    else { res.statusCode = 404; res.end() }
  } catch(error) { res.statusCode = 500; res.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 } }); const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const rendered = number => page.locator(`[data-pdf-page="${number}"] [data-pdf-rendered]`)
  await rendered(1).waitFor(); await page.waitForFunction(() => document.querySelector('canvas').getAttribute('aria-label').includes('Original PDF'))
  const pixels = await rendered(1).evaluate(c => {
    const data = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let ink=0
    for(let i=0;i<data.length;i+=4) if(data[i]<200) ink++
    return { ink, width:c.width, height:c.height }
  })
  assert(pixels.ink > 300, 'The actual PDF content must render pixels')
  assert.equal(await page.locator('[data-pdf-page]').count(), 6)
  await page.screenshot({path:join(output,'pdf-first.png')})
  await page.locator('#reader').hover(); await page.mouse.wheel(0,100000)
  await rendered(6).waitFor(); await page.waitForFunction(() => !document.querySelector('[data-pdf-page="1"] canvas'))
  assert((await page.locator('canvas').count()) < 6, 'Offscreen pages must release their canvases')
  await page.screenshot({path:join(output,'pdf-last.png')})
  await page.locator('#reader').evaluate(e => { e.scrollTop=0 })
  await rendered(1).waitFor()
  await page.locator('#panel').evaluate(e => { e.style.width='540px' })
  await page.waitForFunction(() => document.querySelector('[data-pdf-page="1"] canvas[data-pdf-rendered]')?.width === 516)
  assert.equal(await page.locator('[role="alert"]').count(), 0)
  await page.screenshot({path:join(output,'pdf-resized.png')})
  await page.evaluate(() => window.show('/invalid.pdf'))
  await page.locator('[role="alert"]').waitFor(); assert.match(await page.locator('[role="alert"]').innerText(), /下载按钮/)
  await page.evaluate(() => window.dispose()); assert.equal(await page.locator('canvas').count(), 0)
  assert.deepEqual(errors, [])
  const evidence = { passed:true, realPdfRendered:pixels, pageCount:6, virtualized:true, resizedWidth:516, invalidPdfFallback:true, disposed:true, errors }
  await writeFile(join(output,'results.json'),JSON.stringify(evidence,null,2)); console.log(JSON.stringify(evidence,null,2))
} finally { await browser.close(); server.close() }
