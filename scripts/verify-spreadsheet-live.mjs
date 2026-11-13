// Isolated Electron window with sandboxed preload, real Univer canvas, file
// codecs, trusted IPC, disk store and desktop client capability executor.
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {mkdtemp,mkdir,readFile,symlink} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import {spawn} from 'node:child_process'

const root=process.cwd(),require=createRequire(join(root,'package.json'))
const dir=await mkdtemp(join(tmpdir(),'ework-spreadsheet-live-'))
const evidence=resolve(process.env.EWORK_SPREADSHEET_EVIDENCE??join(dir,'evidence'))
await mkdir(evidence,{recursive:true})
await symlink(join(root,'node_modules'),join(dir,'node_modules'),'dir')
const inline={name:'inline-css',setup(b){
 b.onResolve({filter:/\?raw$/},async args=>({path:(await b.resolve(args.path.slice(0,-4),{resolveDir:args.resolveDir,kind:args.kind})).path,namespace:'inline-css'}))
 b.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))
}}
const preload=join(dir,'preload.cjs'),main=join(dir,'main.mjs')
await build({stdin:{resolveDir:root,contents:`
 import {ipcRenderer,contextBridge} from 'electron'
 import {mountSpreadsheet} from './src/preload/spreadsheet/view'
 document.addEventListener('DOMContentLoaded',()=>{
  const mounted=mountSpreadsheet(document,{
   request:(method,input)=>ipcRenderer.invoke('spreadsheet:request',method,input),
   flushResult:input=>ipcRenderer.invoke('spreadsheet:flush-result',input),
   subscribe:(name,callback)=>{const channel='spreadsheet:'+name;const f=(_,value)=>callback(value);ipcRenderer.on(channel,f);return()=>ipcRenderer.removeListener(channel,f)}
  })
  contextBridge.exposeInMainWorld('spreadsheetFixture',{admit:(prompt,refs)=>mounted.admit('demo-session',prompt,refs),flush:()=>mounted.flush('demo-session')})
 })
`},bundle:true,platform:'browser',format:'cjs',target:'chrome140',define:{'process.env.NODE_ENV':'"production"'},loader:{'.svg':'dataurl'},external:['electron'],plugins:[inline],outfile:preload,logLevel:'warning'})
await build({stdin:{resolveDir:root,contents:`
 import {app,BrowserWindow,clipboard,dialog,ipcMain} from 'electron'
 import {assertTrustedMainWindowEvent} from './src/main/ipc-trust'
 import {installSpreadsheet} from './src/main/spreadsheet/ipc'
 import {ClientCapabilityService} from './src/main/state/client-capability-service'
 import {readWorkbookFile} from './src/main/spreadsheet/files'
 import {readFileSync,writeFileSync} from 'node:fs'
 import {join} from 'node:path'
 import {createServer} from 'node:http'
 import assert from 'node:assert/strict'
 import {registerClientTools} from './packages/dsh-research-task-runtime/client-tools'
 const dir=process.env.EWORK_SHEET_QA_DIR, evidence=process.env.EWORK_SHEET_QA_EVIDENCE
 app.setPath('userData',join(dir,'profile'))
 const preload=join(dir,'preload.cjs')
 const profile={owner:'demo',sessionId:'demo-session'},mode='spreadsheet'
 const report=[],errors=[]
 let win,service,capability,turn=0,configuredImport
 const button=(action,value)=>':is([data-ework-spreadsheet-actions],.ew-sheet) [data-action="'+action+'"]'+(value===undefined?'':'[data-value='+JSON.stringify(value)+']')
 const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms))
 const js=(code)=>win.webContents.executeJavaScript(code,true)
 const until=async(check,name)=>{for(let i=0;i<140;i++){const value=await check();if(value)return value;await wait(50)}throw Error('Timed out: '+name+' '+await js('document.querySelector(".ew-sheet")?.innerText').catch(()=>''))}
 const clickable=selector=>js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el||el.disabled||!el.getClientRects().length)return null;const r=el.getBoundingClientRect();const x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);return {x,y,hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,180),expected:el.outerHTML.slice(0,150)}})()')
 const click=async(selector)=>{
  const point=await until(()=>clickable(selector),selector)
  win.webContents.sendInputEvent({type:'mouseMove',x:point.x,y:point.y});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:point.x,y:point.y})
  win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:point.x,y:point.y})
  await wait(80);return point
 }
 const press=(keyCode,modifiers=[])=>{win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers})}
 const field=async(selector,value,enter=true)=>{
  const point=await click(selector)
  const before=await js('({tag:document.activeElement?.tagName,field:document.activeElement?.dataset.field,value:document.activeElement?.value})')
  press('A',[process.platform==='darwin'?'meta':'control'])
  const after=await js('({tag:document.activeElement?.tagName,field:document.activeElement?.dataset.field,value:document.activeElement?.value})')
  await win.webContents.insertText(value)
  if(enter){
   const state=await js('({field:document.activeElement?.dataset.field,value:document.activeElement?.value})')
   if(state.value!==value)throw Error('Field input did not reach '+selector+' '+JSON.stringify({point,before,after,state})+' expected '+value)
   press('Enter')
  }
  await wait(180)
 }
 const save=async()=>{await js('spreadsheetFixture.flush()');return service.store.load(profile)}
 const snapshot=()=>service.store.load(profile).workbook
 const currentCell=(r,c)=>{const book=snapshot();return book?.sheets[book.sheetOrder[0]]?.cellData?.[r]?.[c]}
 const select=(value)=>field('.ew-sheet [data-field=address]',value)
 const formula=(value)=>field('.ew-sheet [data-field=formula]',value)
 const screenshot=async(name)=>{await wait(220);const image=await win.webContents.capturePage();writeFileSync(join(evidence,name+'.png'),image.toPNG())}
 const style=(r,c)=>{const book=snapshot(),cell=currentCell(r,c);return typeof cell?.s==='string'?book.styles[cell.s]:cell?.s}
 const saveCheck=async(check,name)=>{await until(async()=>{await save();return check()},name);report.push(name)}
 const html='<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#121313;width:100%;height:100%;font:13px system-ui;color:#e4e4e4}body{display:flex;box-sizing:border-box;padding:10px;gap:10px}aside{width:330px;background:#242424;border-radius:14px;padding:12px;position:relative}aside textarea{position:absolute;bottom:14px;left:14px;right:14px;height:95px;background:#292929;border:0;border-radius:9px;color:#eee;padding:10px;resize:none}article{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;border-radius:14px;background:#1e1e1e;overflow:hidden}header.shell{height:47px;display:flex;align-items:center;padding:0 16px;gap:20px;flex:none}header.shell span{background:#303030;border-radius:5px;padding:5px 14px}#chat{display:inline-block;background:#303030;padding:5px 9px;border-radius:6px}body.hide aside{display:none}[data-odyssey-panel-entry=right]{position:absolute;top:16px;right:20px;border:0;background:#303030;color:#eee;border-radius:5px;padding:5px 8px}</style><body data-ds-dark-theme><article data-odyssey-page="spreadsheet"><header class="shell" data-srb-session-header>消费行业周报　　对话　　研究　　笔记 <span>表格</span><div data-ework-spreadsheet-actions="demo-session" style="margin-left:auto"></div></header><div data-conversation-scroll><div data-ework-spreadsheet-view="demo-session"></div></div></article><aside><span id="chat">◌ 对话</span><textarea placeholder="给智能体发消息"></textarea></aside><button data-odyssey-panel-entry="right" aria-label="右侧屏" onclick="document.body.classList.toggle(&quot;hide&quot;)">◧</button><button data-odyssey-panel-entry="bottom">下方</button>'
 app.whenReady().then(async()=>{
  try{
   win=new BrowserWindow({width:1440,height:960,show:true,webPreferences:{contextIsolation:true,sandbox:true,preload}})
   win.webContents.on('preload-error',(_,file,error)=>errors.push(file+' '+error.stack))
   win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message)})
   let visibleMode=mode
   capability=new ClientCapabilityService({owner:()=>profile.owner,windowIdentity:()=>win,canRead:()=>true,canWrite:()=>true,scheduled:()=>false,send:()=>{},canvasAvailable:()=>false,canvas:async()=>null,window:async()=>null,get spreadsheet(){return service}})
   service=installSpreadsheet({ipcMain,getWindow:()=>win,visible:()=>capability.currentVisibleContext(),canWrite:()=>true,dataPath:app.getPath('userData')})
   const bind=()=>capability.bind({sessionId:profile.sessionId,mode:visibleMode,active:true})
   bind()
   const xlsxPath=join(dir,'导出.xlsx'),csvPath=join(dir,'导出.csv')
   dialog.showOpenDialog=async()=>({canceled:!configuredImport,filePaths:configuredImport?[configuredImport]:[]})
   dialog.showSaveDialog=async(_window,options)=>({canceled:false,filePath:options.defaultPath.endsWith('.csv')?csvPath:xlsxPath})
   const server=createServer((_request,response)=>{response.setHeader('Content-Type','text/html;charset=utf-8');response.end(html)})
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
   await win.loadURL('http://127.0.0.1:'+server.address().port)

   win.focus();win.webContents.focus()
   await until(()=>js('document.body.dataset.eworkSpreadsheetSession==="demo-session"'),'preload/IPC ready')
   await screenshot('01-empty')
   await click(button('new'))
   await until(()=>js('!!document.querySelector(".ew-sheet-grid canvas")'),'Univer canvas mount')
   await until(()=>js('[...document.querySelectorAll(".ew-sheet-grid canvas")].some(c=>c.getBoundingClientRect().width>400)'),'canvas size')
   // Canvas screenshot samples, not DOM colors: freeze handles used to be
   // bright at the corner; old tracks were black at the right and bottom.
   const gridColors=await js('(()=>{const c=[...document.querySelectorAll(".ew-sheet-grid canvas")].find(c=>c.clientWidth>400); const ctx=c.getContext("2d"),sx=c.width/c.clientWidth,sy=c.height/c.clientHeight; const sample=(x,y)=>Array.from(ctx.getImageData(Math.round(x*sx),Math.round(y*sy),1,1).data);return {right:sample(c.clientWidth-4,160),bottom:sample(250,c.clientHeight-4),corner:sample(38,21)}})()')
   for(const side of ['right','bottom'])assert.ok(gridColors[side].slice(0,3).every(v=>v>=29&&v<75),JSON.stringify(gridColors))
   assert.ok(gridColors.corner.slice(0,3).every(v=>v<95),JSON.stringify(gridColors))
   report.push({name:'native dark canvas edge and freeze handle colors',gridColors})
   await select('A20')
   const wheelAt=await js('(()=>{const r=document.querySelector(".ew-sheet-grid").getBoundingClientRect();return {x:Math.round(r.x+190),y:Math.round(r.y+250)}})()')
   for(let i=0;i<6;i++){
    win.webContents.sendInputEvent({type:'mouseWheel',...wheelAt,deltaY:-67,deltaX:i%2?-23:0,hasPreciseScrollingDeltas:true,canScroll:true})
    await wait(40)
   }
   const bright=await js('(()=>{const c=[...document.querySelectorAll(".ew-sheet-grid canvas")].find(c=>c.clientWidth>400), pixels=c.getContext("2d").getImageData(100,100,Math.floor(c.width*.68),Math.floor(c.height*.62)).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>130&&pixels[i+1]>130&&pixels[i+2]>130)count++;return count})()')
   assert.equal(bright,0,'dark blank grid shows no light bands after incremental scrolling')
   await select('A1')
   report.push('dark grid stays uniform through incremental vertical and horizontal scroll')
   assert.equal(await js('document.querySelector(".ew-sheet-title")'),null)
   assert.equal(await js('document.querySelectorAll("[data-srb-session-header] [data-ework-spreadsheet-actions] button").length'),1)
   const toolbarGap=await js('document.querySelector(".ew-sheet-ribbon-tabs").getBoundingClientRect().top-document.querySelector("[data-srb-session-header]").getBoundingClientRect().bottom')
   assert.ok(Math.abs(toolbarGap)<2,toolbarGap)
   report.push('new workbook / native canvas / header actions without duplicate row')
   const grid=await js('(()=>{const r=document.querySelector(".ew-sheet-grid").getBoundingClientRect();return {x:r.x,y:r.y}})()')
   const hit=async(col,row,count=1)=>{
    const point={x:Math.round(grid.x+40+col*100+45),y:Math.round(grid.y+24+row*30+13)}
    win.webContents.sendInputEvent({type:'mouseMove',...point})
    win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:count,...point})
    win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:count,...point})
    await wait(100)
   }
   await hit(0,0)
   press('F2')
   await win.webContents.insertText('100')
   press('Enter')
   await saveCheck(()=>currentCell(0,0)?.v===100,'direct grid keyboard edit')
   const previous=clipboard.readText()
   clipboard.writeText('公司\\t价格\\nA\\t11\\nB\\t22')
   try{
    await hit(3,1)
    press('V',[process.platform==='darwin'?'meta':'control'])
    await saveCheck(()=>currentCell(1,3)?.v==='公司'&&currentCell(3,4)?.v===22,'native clipboard TSV paste')
   }finally{clipboard.writeText(previous)}

   await select('B1');assert.equal(await js('document.querySelector("[data-field=address]").value'),'B1');await formula('25')
   await select('C1');assert.equal(await js('document.querySelector("[data-field=address]").value'),'C1');await formula('=B1/A1')
   await click(button('number-format','0.00%'))
   await saveCheck(()=>currentCell(0,2)?.f==='=B1/A1'&&currentCell(0,2)?.v===0.25&&style(0,2)?.n?.pattern==='0.00%','formula calculation / percentages')
   await click(button('bold'))
   await saveCheck(()=>style(0,2)?.bl===1,'bold')
   await click(button('undo'))
   await saveCheck(()=>style(0,2)?.bl!==1,'native undo')
   await click(button('redo'))
   await saveCheck(()=>style(0,2)?.bl===1,'native redo')
   await select('C1');await click(button('menu','align'));await click(button('align','right'))
   await saveCheck(()=>style(0,2)?.ht===3,'right alignment')
   await click(button('menu','freeze'));await click(button('freeze','row'))
   await saveCheck(()=>snapshot().sheets[snapshot().sheetOrder[0]].freeze?.ySplit===1,'freeze first row')
   await click(button('zoom-plus'))
   await until(()=>js('document.querySelector("[data-action=zoom-reset]").textContent==="110%"'),'grid zoom')
   await click(button('zoom-reset'))
   await click(button('add-sheet'))
   await saveCheck(()=>snapshot().sheetOrder.length===2,'add worksheet')
   await click(button('menu','sheet'));await click(button('rename-sheet'))
   await field('.ew-sheet-dialog input','盈利预测')
   await saveCheck(()=>snapshot().sheets[snapshot().sheetOrder[1]].name==='盈利预测','rename worksheet')
   await click(button('sheet',snapshot().sheetOrder[0]))
   await select('A1:B2');await click(button('filter'))
   await saveCheck(()=>snapshot().resources?.some(x=>x.name.includes('Filter')||x.name.includes('FILTER')),'filter range')
   await click(button('filter'));await save()
   await click(button('ribbon','数据'))
   await select('D3:E4');await click(button('menu','sort'));await click(button('sort','desc'))
   await saveCheck(()=>currentCell(2,3)?.v==='B'&&currentCell(2,4)?.v===22&&currentCell(3,3)?.v==='A'&&currentCell(3,4)?.v===11,'sort a range outside column A and preserve row data')
   await select('E5');await formula('22');await select('D5');await formula('B')
   await select('D3:E5');await click(button('duplicates'));await click(button('dedupe-apply'))
   await saveCheck(()=>currentCell(4,4)?.v==null&&currentCell(2,4)?.v===22&&currentCell(3,4)?.v===11,'deduplicate matching rows')
   await click(button('ribbon','插入'));await select('D3:E4');await click(button('chart'))
   await field('.ew-sheet-dialog [aria-label="图表名称"]','选区成交数据',false)
   await click('.ew-sheet-dialog footer button:last-child')
   await until(()=>js('document.querySelector(".ew-sheet-charts svg[role=img]")?.getAttribute("aria-label")==="选区成交数据"'),'persisted manual chart')
   assert.match(await js('document.querySelector(".ew-sheet-charts table").textContent'),/22/)
   assert.equal(snapshot().charts[0].range,'D3:E4')
   await select('E3');await formula('24')
   await until(()=>js('document.querySelector(".ew-sheet-charts table").textContent.includes("24")'),'chart updates after editing its source')
   await select('E3');await formula('22')
   await click(button('close-chart'))
   report.push('manual chart saved with actual selected values')
   await click(button('ribbon','开始'))
   await select('A1')
   await click(button('search'));await field('.ew-sheet-dialog input','25')
   assert.match(await js('document.querySelector(".ew-sheet-find-result").textContent'),/B1/)
   press('Escape');await wait(80)
   report.push('find result and jump')
   await click(button('focus'))
   assert.equal(await js('document.body.classList.contains("hide")'),true)
   await click('[data-odyssey-panel-entry=right]')
   assert.equal(await js('getComputedStyle(document.querySelector("[data-odyssey-panel-entry=bottom]")).display'),'none')
   report.push('right-only conversation and focus')
   const more='[data-ework-spreadsheet-actions] [data-value=book]'
   const openExport=async()=>{await click(more);await click(button('menu','export'))}
   await click(more)
   const moreMenu=await js('Array.from(document.querySelectorAll(".ew-sheet-menu[data-menu=book] button")).slice(0,2).map(b=>b.textContent)')
   assert.deepEqual(moreMenu,['导入 Excel / CSV…','导出工作簿'])
   assert.ok(await js('document.querySelectorAll(".ew-sheet-menu[data-menu=book] [role=separator]").length')>=1)
   assert.ok(await js('[...document.querySelectorAll(".ew-sheet-menu[data-menu=book] [role=menuitem]")].every(b=>getComputedStyle(b.querySelector("i")).maskImage!=="none")'))
   assert.deepEqual(await js('Array.from(document.querySelectorAll("[data-ework-spreadsheet-actions] svg circle")).map(c=>[c.getAttribute("cx"),c.getAttribute("cy"),c.getAttribute("r")])'),[['4','10','1.65'],['10','10','1.65'],['16','10','1.65']])
   await screenshot('02-more')
   press('Down');press('Right')
   await until(()=>js('document.querySelector(".ew-sheet-menu[data-menu=export]:not([hidden])")?.offsetHeight'),'keyboard opens export formats')
   const bounds=await js('(()=>{const m=document.querySelector(".ew-sheet-menu"),b=document.querySelector("[data-ework-spreadsheet-actions] [data-value=book]"),r=m.getBoundingClientRect(),a=b.getBoundingClientRect(),s=getComputedStyle(m);return {width:r.width,height:r.height,gap:r.top-a.bottom,right:r.right-a.right,padding:s.padding,option:m.querySelector("button").getBoundingClientRect().height}})()')
   assert.equal(bounds.width,304);assert.equal(bounds.option,58);assert.ok(bounds.gap>=8&&bounds.gap<=16,JSON.stringify(bounds));assert.ok(Math.abs(bounds.right)<2);assert.ok(bounds.height<=205)
   report.push({name:'export popover geometry',bounds})
   await screenshot('02-export')
   await click(button('export-format','xlsx'))
   await until(()=>{try{return readFileSync(xlsxPath).length>0}catch{return false}},'xlsx export')
   const xlsx=await readWorkbookFile(readFileSync(xlsxPath),'导出.xlsx','verify')
   assert.equal(xlsx.sheets['sheet-1'].cellData[0][2].f,'=B1/A1')
   await openExport();await click(button('export-format','csv'))
   await until(()=>{try{return readFileSync(csvPath,'utf8').includes('100,25,0.25')}catch{return false}},'CSV computed values export')
   report.push('Excel and CSV export through native dialog IPC')
   configuredImport=xlsxPath
   await click(more);await click('.ew-sheet-menu[data-menu=book] [data-action=import]')
   await until(()=>snapshot().name==='导出.xlsx','import through native dialog IPC')
   await until(()=>js('!!document.querySelector(".ew-sheet-grid canvas")'),'reopen imported canvas')
   const prompt='把〔表格选区 "Sheet1"!C1 #0123456789ab〕改成 50%'
   const refs=[{sessionId:profile.sessionId,bookId:snapshot().id,sheetId:snapshot().sheetOrder[0],sheetName:'Sheet1',range:'C1',id:'0123456789ab'}]
   await select('C1');await js('spreadsheetFixture.admit('+JSON.stringify(prompt)+','+JSON.stringify(refs)+')');await select('B1')
   const tools={}
   const transport=async(_url,opts)=>{try{return new Response(JSON.stringify(await capability.request(JSON.parse(opts.body))),{status:200})}catch(error){return new Response(JSON.stringify({error:error.message}),{status:400})}}
   registerClientTools({tools:{register(tool){tools[tool.name]=tool;return ()=>{}}}},{env:{SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:1',SHERLOCK_RESEARCH_CONTEXT_TOKEN:'test'},fetch:transport})
   const execution={signal:new AbortController().signal,token:Symbol(),agent:{session:{id:profile.sessionId,header:{},events:[{type:'turn/start',data:{turn:++turn}},{type:'user/message',seq:1,data:{id:'manual-1',source:{kind:'user'},content:[{type:'text',text:prompt}]}}]}}}
   const tool=async(capability,args,requestId)=>JSON.parse(await tools.client_action.execute({requestId,capability,arguments:args},execution))
   const catalog=JSON.parse(await tools.client_capabilities.execute({},execution))
   assert.equal(catalog.mode,'spreadsheet');assert.equal(catalog.capabilities.find(c=>c.id==='spreadsheet.apply').available,true)
   const inspect=await tool('spreadsheet.inspect',{scope:'selected'},'inspect')
   assert.equal(inspect.data.range,'C1')
   const apply=await tool('spreadsheet.apply',{revision:inspect.data.revision,operations:[{op:'write',sheetId:inspect.data.sheetId,range:inspect.data.range,cells:[[{value:0.5}]]}]},'apply')
   assert.equal(apply.status,'succeeded',apply.message)
   await until(()=>js('document.querySelector(".ew-sheet-status-text")?.textContent==="AI 修改已保存"'),'AI refresh in the same workbook')
   await select('C1')
   assert.equal(await js('document.querySelector("[data-field=formula]").value'),'0.5')
   assert.equal(currentCell(0,1).v,25)
   await screenshot('03-ai-edited')
   await click(button('menu','book'));await click(button('undo-ai'))
   await until(()=>currentCell(0,2)?.f==='=B1/A1','AI undo')
   await until(()=>js('!!document.querySelector(".ew-sheet-grid canvas")'),'AI undo grid')
   await click(button('redo'))
   await until(()=>currentCell(0,2)?.v===0.5&&!currentCell(0,2)?.f,'AI redo')
   await until(()=>js('document.querySelector(".ew-sheet-status-text")?.textContent==="已重新应用 AI 修改"'),'AI redo visible')
   await click(button('undo'))
   await until(()=>currentCell(0,2)?.f==='=B1/A1','undo restored AI redo')
   report.push('right chat tool route / send-time range / live update / undo and redo')
   await win.reload();bind()
   await until(()=>js('document.body.dataset.eworkSpreadsheetSession==="demo-session"&&!!document.querySelector(".ew-sheet-grid canvas")'),'workbook survives restart')
   await select('C1')
   assert.equal(await js('document.querySelector("[data-field=formula]").value'),'=B1/A1')
   report.push('reload retains workbook and formulas')
   await js('document.body.removeAttribute("data-ds-dark-theme")')
   await screenshot('04-light')
   report.push('live light theme')
   assert.deepEqual(errors,[])
   writeFileSync(join(evidence,'report.json'),JSON.stringify({passed:true,report},null,2))
   console.log(JSON.stringify({evidence,report},null,2))
   app.exit(0)
  }catch(error){console.error(error.stack,errors,report);await screenshot('failure').catch(()=>{});app.exit(1)}
 })
`},bundle:true,platform:'node',format:'esm',target:'node22',banner:{js:"import {createRequire as qaRequire} from 'node:module';const require=qaRequire(import.meta.url);"},packages:'external',external:['electron'],outfile:main,logLevel:'warning'})
const electron=process.env.EWORK_ELECTRON_EXECUTABLE??require('electron')
const child=spawn(electron,[main],{stdio:'inherit',env:{...process.env,EWORK_SHEET_QA_DIR:dir,EWORK_SHEET_QA_EVIDENCE:evidence}})
const timer=setTimeout(()=>child.kill('SIGTERM'),120_000)
process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code)=>resolve(code??1))})
clearTimeout(timer)
