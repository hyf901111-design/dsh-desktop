import {beforeAll,afterAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,readdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {EWorkPendingInputBar} from '../scripts/lib/pending-conversation.mjs'
import {patchBrowserAppNative} from '../scripts/lib/browser-app-native.mjs'
let browser,script,input,css
const base='node_modules/@deepseek-ai/',expose=(source,names)=>source.replace('exports.apply = apply;',`exports.apply = apply;${names.map(name=>`exports.__test${name}=${name};`).join('')}`)
beforeAll(async()=>{
 const raw=patchBrowserAppNative(await readFile(base+'dsh-client-ui-conversation/lib/client.js','utf8')),conversation=expose(raw,['SessionInputShell','InputBar','EWorkBrowserReference','EWorkPendingConversation']).replace('exports.apply = apply;','exports.apply = apply;exports.__testSetPending=value=>eworkPendingConversation=value;')
 input={wrapper:EWorkPendingInputBar.toString(),runtime:await readFile(base+'dsh-client-runtime/lib/client.js','utf8'),conversation,workspace:expose(await readFile(base+'dsh-client-ui-workspace/lib/client.js','utf8'),['WorkspacePicker'])}
 const assets=base+'dsh-web-frontend/dist/assets',name=(await readdir(assets)).find(n=>/^index-.*\.css$/.test(n));css=await readFile(assets+'/'+name,'utf8')
 const result=await build({entryPoints:['test/fixtures/pending-conversation-browser.tsx'],bundle:true,platform:'browser',format:'iife',outfile:'pending.js',write:false,logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl','.ttf':'dataurl'},plugins:[{name:'raw',setup(b){b.onResolve({filter:/\?raw$/},async args=>({path:(await b.resolve(args.path.slice(0,-4),{resolveDir:args.resolveDir,kind:args.kind})).path,namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}}]});script=result.outputFiles.find(file=>file.path.endsWith('.js')).text;css+='\n'+(result.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'')
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await pw.chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>browser?.close())
it('renders native welcome/project picker/input and creates the selected project session only on send',async()=>{
 const page=await browser.newPage({viewport:{width:600,height:800}}),errors=[];page.on('pageerror',error=>errors.push(error.stack));try{
  await page.setContent('<html><head><style>'+css+'body{margin:0;background:#eee}#app{height:100vh}[data-pending-conversation-host]{position:fixed;right:10px;top:54px;bottom:10px;width:340px;background:white}</style></head><body><div id="app"></div><div data-pending-conversation-host class="sRp_pendingHost"></div></body></html>');await page.evaluate(input=>window.pendingInput=input,input);await page.addScriptTag({content:script});await page.getByText('探索更远，洞见更深',{exact:true}).waitFor({timeout:5000}).catch(error=>{console.log('pending errors',errors);throw error})
  const project=page.locator('[data-pending-project-row] button').first();await project.click();await page.getByText('研究项目 B',{exact:true}).click();expect(await page.evaluate(()=>window.pendingFixture.events)).toEqual([])
  const textbox=page.locator('.sRp_pendingConversation textarea');await textbox.fill('请总结当前网页');await page.getByRole('button',{name:'发送消息',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.pendingFixture.events)).toContainEqual({type:'create',workspaceId:'B'});await expect.poll(()=>page.evaluate(()=>window.pendingFixture.events)).toContainEqual({type:'send',text:'请总结当前网页',images:[]});expect(errors).toEqual([])
  await page.screenshot({path:'/tmp/browser-pending-native-input.png'})
 }finally{await page.close()}
},15000)

it('keeps the native draft editable and retryable after first-session creation fails',async()=>{const page=await browser.newPage({viewport:{width:600,height:800}});try{
 await page.setContent('<html><head><style>'+css+'body{margin:0}#app{height:100vh}[data-pending-conversation-host]{position:fixed;right:10px;top:54px;bottom:10px;width:340px;background:white}</style></head><body><div id="app"></div><div data-pending-conversation-host class="sRp_pendingHost"></div></body></html>');await page.evaluate(input=>window.pendingInput=input,input);await page.addScriptTag({content:script});await page.getByText('探索更远，洞见更深',{exact:true}).waitFor();await page.locator('[data-pending-project-row] button').first().click();await page.getByText('研究项目 A',{exact:true}).click();await page.evaluate(()=>window.pendingFixture.failOnce());const inputBox=page.locator('.sRp_pendingConversation textarea');await inputBox.fill('保留这个问题');await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.getByText('测试创建失败，输入保留',{exact:true}).waitFor();expect(await inputBox.inputValue()).toBe('保留这个问题');expect(await inputBox.isEditable()).toBe(true);await page.getByRole('button',{name:'发送消息',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.pendingFixture.events.some(e=>e.type==='send'&&e.text==='保留这个问题'))).toBe(true)
 }finally{await page.close()}},15000)
