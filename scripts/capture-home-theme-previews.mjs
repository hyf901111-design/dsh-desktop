import {build} from 'esbuild'
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

// Capture actual, deterministic card views, never an independently drawn image.
// --output /tmp/theme-previews produces reviewable assets; --write updates the four bundled fills.
const write = process.argv.includes('--write'), outputIndex = process.argv.indexOf('--output')
const output = resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : 'output/playwright/theme-previews')
const width = 163.2, height = width * 78 / 146.4
const result = await build({
  stdin:{resolveDir:process.cwd(),loader:'ts',contents:`import{mountHomeThemes,getHomeThemeController}from'./src/preload/home-themes';mountHomeThemes(document);window.themeController=getHomeThemeController(document);`},
  bundle:true,format:'iife',platform:'browser',write:false,
  plugins:[{name:'inline-theme-images',setup(builder){
    builder.onResolve({filter:/\.(?:png|jpg)\?inline$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-7)),namespace:'theme-image'}))
    builder.onLoad({filter:/.*/,namespace:'theme-image'},async args=>({contents:'export default '+JSON.stringify('data:image/'+(args.path.endsWith('.jpg')?'jpeg':'png')+';base64,'+(await readFile(args.path)).toString('base64')),loader:'js'}))
  }}]
})
const runtime = await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
const browser = await (runtime.default??runtime).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--enable-unsafe-swiftshader']})
const manifest = {renderer:'HomeThemeController.createPreview',seconds:0,cssSize:[width,height],deviceScaleFactor:2,assets:[]}
try {
  for (const id of ['dither','koi-pond']) for (const dark of [false,true]) {
    const page = await browser.newPage({viewport:{width:800,height:600},deviceScaleFactor:2})
    try {
      await page.setContent('<body'+(dark?' data-ds-dark-theme':'')+'></body>')
      await page.addScriptTag({content:result.outputFiles[0].text})
      await page.evaluate(({id,width,height,dark})=>{
        const view=window.themeController.createPreview(id)
        if(!view)throw Error('Theme preview unavailable: '+id)
        window.preview=view;document.body.append(view.canvas);view.resize(width,height);view.render(0,dark)
      },{id,width,height,dark})
      if(id==='koi-pond')await page.waitForFunction(()=>window.preview.canvas.dataset.homeKoiState==='ready')
      const extension=id==='dither'?'jpg':'png'
      const captured = await page.evaluate(({dark,extension})=>{
        const view=window.preview
        if(!view.render(0,dark))throw Error('Theme preview draw failed')
        return {url:view.canvas.toDataURL(extension==='jpg'?'image/jpeg':'image/png',.98),pixels:[view.canvas.width,view.canvas.height]}
      },{dark,extension})
      const relative=(id==='dither'?'react-bits/':'')+id+'-'+(dark?'dark':'light')+'.'+extension
      const bytes=Buffer.from(captured.url.split(',')[1],'base64'),path=resolve(write?'src/preload/home-theme-assets':output,relative)
      await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes)
      manifest.assets.push({id,dark,path,pixels:captured.pixels,sha256:createHash('sha256').update(bytes).digest('hex')})
      await page.evaluate(()=>window.preview.dispose())
    } finally {await page.close()}
  }
  await mkdir(output,{recursive:true});await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
  console.log(JSON.stringify(manifest,null,2))
} finally {await browser.close()}
