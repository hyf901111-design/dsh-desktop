import { build } from 'esbuild'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

let browser, script, styles
beforeAll(async () => {
  const {chromium} = await import(process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright')
  browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH})
  const bundle = await build({entryPoints:['src/preload/presentation/archive-dialog.ts'], bundle:true, write:false, format:'iife', globalName:'archive'})
  script = bundle.outputFiles[0].text
  const assets = 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets'
  const native = (await readdir(assets)).find(name => /^index-.*\.css$/.test(name))
  const paths = [assets+'/'+native, ...['figma-reading.css','figma-refinements.css','figma-final-shell.css','presentation/view.css'].map(file=>'src/preload/'+file)]
  styles = await Promise.all(paths.map(file=>readFile(file,'utf8')))
})
afterAll(async () => { await browser?.close() })

it.each(['dark','light'])('keeps the archive form legible and usable in the %s client theme', async theme => {
  const page = await browser.newPage({viewport:{width:400,height:540},colorScheme:theme})
  try {
    await page.setContent('<body></body>')
    await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), theme==='dark')
    for (const content of styles) await page.addStyleTag({content})
    await page.addScriptTag({content:script})
    await page.evaluate(() => archive.openPresentationArchiveDialog(document,'投委会汇报',async (name,format) => { window.saved={name,format} }))
    const dialog=page.getByRole('dialog'), name=dialog.getByLabel('文件名'), format=dialog.getByLabel('文件格式')
    expect(await name.inputValue()).toBe('投委会汇报')
    expect(await format.inputValue()).toBe('pptx')
    const colors=await dialog.evaluate(el=>{
      const rgb=css=>{
        const ctx=document.createElement('canvas').getContext('2d')
        ctx.fillStyle=css; ctx.fillRect(0,0,1,1)
        return [...ctx.getImageData(0,0,1,1).data]
      }
      const surface=rgb(getComputedStyle(el).backgroundColor)
      const luminance=rgb=>rgb.slice(0,3).map(c=>c/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4).reduce((v,c,i)=>v+c*[0.2126,0.7152,0.0722][i],0)
      const checks=[...el.querySelectorAll('h2,label,input,select,p,button')].map(node=>{
        const style=getComputedStyle(node), bg=rgb(style.backgroundColor), a=bg[3]/255
        const back=luminance(bg.map((c,i)=>c*a+surface[i]*(1-a))), front=luminance(rgb(style.color))
        return (Math.max(back,front)+0.05)/(Math.min(back,front)+0.05)
      })
      return {surface:luminance(surface),checks,fits:el.scrollWidth===el.clientWidth}
    })
    expect(colors.surface<0.35).toBe(theme==='dark')
    expect(colors.fits).toBe(true)
    expect(Math.min(...colors.checks)).toBeGreaterThanOrEqual(4.5)
    await name.fill('投委会讨论稿')
    await format.selectOption('pdf')
    await dialog.getByRole('button',{name:'保存',exact:true}).click()
    expect(await page.evaluate(()=>window.saved)).toEqual({name:'投委会讨论稿',format:'pdf'})
    expect(await dialog.count()).toBe(0)
  } finally { await page.close() }
})
