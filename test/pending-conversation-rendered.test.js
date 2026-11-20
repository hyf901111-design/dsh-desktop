import {beforeAll,afterAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile,readdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {EWorkPendingInputBar} from '../scripts/lib/pending-conversation.mjs'
import {patchPendingConversationPanel} from '../scripts/lib/pending-conversation-panel.mjs'
import {patchBrowserAppNative} from '../scripts/lib/browser-app-native.mjs'
import {patchBoardDirectoryWorkspace} from '../scripts/lib/board-directory-picker.mjs'
import {patchComposerWorkspaceBar,stripComposerWorkspaceBar} from '../scripts/lib/patch-figma-final-shell.mjs'
import {stripConversationPermissionDefault} from '../scripts/lib/conversation-permission-default.mjs'
import {patchSpreadsheetClient,stripSpreadsheetClient} from '../scripts/lib/spreadsheet-client.mjs'
import {stripKnowledgeSharedResearch} from '../scripts/lib/knowledge-shared-research.mjs'
import {stripResearchBoardHeaderClient} from '../scripts/lib/research-board-header-client.mjs'
let browser,script,input,css
const base='node_modules/@deepseek-ai/',expose=(source,names)=>source.replace('exports.apply = apply;',`exports.apply = apply;${names.map(name=>`exports.__test${name}=${name};`).join('')}`)
beforeAll(async()=>{
 const installed=stripComposerWorkspaceBar(await readFile(base+'dsh-client-ui-conversation/lib/client.js','utf8'))
 const baseConversation=stripResearchBoardHeaderClient(stripConversationPermissionDefault(stripSpreadsheetClient(stripKnowledgeSharedResearch(installed))))
 const raw=patchComposerWorkspaceBar(patchSpreadsheetClient(patchBrowserAppNative(baseConversation))),conversation=expose(raw,['SessionInputShell','InputBar','HomeGuideNativeOriginalConversationRoot','ResearchSidebarConversationTab']).replace('exports.apply = apply;','exports.apply = apply;exports.__testSetPending=value=>eworkPendingConversation=value;exports.__testSetRightProjects=value=>eworkRightProjects=value;exports.__testSetSidebarWorkspace=value=>eworkSidebarWorkspace=value;')
 input={panel:expose(patchPendingConversationPanel(await readFile('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js','utf8')),['Workbench','SidebarStore']),wrapper:EWorkPendingInputBar.toString(),runtime:await readFile(base+'dsh-client-runtime/lib/client.js','utf8'),conversation,workspace:expose(patchBoardDirectoryWorkspace(await readFile(base+'dsh-client-ui-workspace/lib/client.js','utf8')),['WorkspacePicker'])}
 input.triggers=expose(await readFile(base+'dsh-client-ui-input-trigger/lib/client.js','utf8'),['MenuView'])
 const assets=base+'dsh-web-frontend/dist/assets',name=(await readdir(assets)).find(n=>/^index-.*\.css$/.test(n));css=await readFile(assets+'/'+name,'utf8')
 const result=await build({entryPoints:['test/fixtures/pending-conversation-browser.tsx'],bundle:true,platform:'browser',format:'iife',outfile:'pending.js',write:false,logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl','.ttf':'dataurl'},plugins:[{name:'raw',setup(b){b.onResolve({filter:/\?raw$/},async args=>({path:(await b.resolve(args.path.slice(0,-4),{resolveDir:args.resolveDir,kind:args.kind})).path,namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}))}}]});script=result.outputFiles.find(file=>file.path.endsWith('.js')).text;css+='\n'+(result.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'')
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await pw.chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(async()=>browser?.close())
it.each(['notes','spreadsheet','research'])('hides the right project picker after editing %s', async mode => {
 const page = await browser.newPage({viewport:{width:1180,height:800}})
 try {
  await page.route('http://workspace.test/', route=>route.fulfill({contentType:'text/html',body:
   '<style>'+css+'body{margin:0}#app{height:100vh;width:790px}#right{position:fixed;right:10px;top:10px;bottom:10px;width:340px}</style><div id="app" class="pI_x6G_centerCol"></div><aside id="right" class="t8lSSG_panel"><div id="right-body" class="t8lSSG_panelBody"></div></aside>'}))
  await page.goto('http://workspace.test/')
  await page.evaluate(({input,mode})=>{window.pendingInput={...input,recentWorkspaceId:'A',verifyRightProject:true,initialView:mode}}, {input,mode})
  await page.addScriptTag({content:script})
  const picker=page.locator('#right [data-odyssey-composer-workspace]')
  await picker.getByText('研究项目 A',{exact:true}).click()
  await page.getByText('研究项目 B',{exact:true}).click()
  await picker.getByText('研究项目 B',{exact:true}).waitFor()
  await page.evaluate(()=>{
   const sessionId='existing-canvas';
   localStorage.setItem('sherlock.research.directory-locked.v1:'+sessionId,'true')
   document.dispatchEvent(new CustomEvent('sherlock:workspace-project-edited',{detail:{sessionId}}))
  })
  await picker.waitFor({state:'detached'})
  expect(await page.locator('#right [data-right-project-draft-hint]').count()).toBe(0)
  expect(await page.locator('#right textarea').count()).toBe(1)
  expect(await page.evaluate(()=>window.pendingFixture.current.current)).toBe('existing-canvas')
 } finally { await page.close() }
})
it.each([true, false])('shows the local work location on home and right composers and keeps the folder picker independent (dark: %s)', async dark => {
 const page = await browser.newPage({ viewport: { width: 1180, height: 800 } })
 try {
  await page.setContent('<style>'+css+'body{margin:0}#app{height:100vh;width:790px}#right{position:fixed;right:10px;top:10px;bottom:10px;width:'+ (dark ? 340 : 280) +'px}#right>.t8lSSG_workbench{height:100%}</style><div id="app" class="pI_x6G_centerCol"></div><aside id="right" class="t8lSSG_panel"><div id="right-body" class="t8lSSG_panelBody"></div></aside>')
  await page.evaluate(({ input, dark }) => { window.pendingInput = {...input,recentWorkspaceId:'A'}; document.body.toggleAttribute('data-ds-dark-theme', dark) }, { input, dark })
  await page.addScriptTag({ content: script })
  for (const surface of ['home', 'right']) {
   if (surface === 'right') await page.evaluate(() => window.pendingFixture.openSurface('browser'))
   const bar = page.locator((surface === 'home' ? '#app' : '#right') + ' [data-odyssey-composer-workspace]')
   const location = bar.getByRole('button', { name: '此计算机' })
   const folder = bar.locator('.pXSMma_workspace')
   await location.waitFor()
   const layout = await bar.evaluate(row => {
    const card = row.parentElement.querySelector('[data-composer-card]')
    const a = row.getBoundingClientRect(), b = card.getBoundingClientRect()
    const style = getComputedStyle(row), cardStyle = getComputedStyle(card)
    // Chromium can serialize a mixed color in color(srgb) syntax. Sample its
    // effective opacity without depending on that serialization.
    const pixel = new OffscreenCanvas(1, 1).getContext('2d')
    pixel.fillStyle = style.backgroundColor
    pixel.fillRect(0, 0, 1, 1)
    return { height: a.height, join: a.bottom - b.top, inset: a.left - b.left, blur: style.backdropFilter,
      barFill: style.backgroundColor, barOpacity: pixel.getImageData(0, 0, 1, 1).data[3] / 255,
      cardFill: cardStyle.backgroundColor, cardOutline: cardStyle.boxShadow, borderWidth: cardStyle.borderTopWidth,
      overflow: row.scrollWidth - row.clientWidth }
   })
   expect(layout.height).toBe(42)
   expect(layout.join).toBeGreaterThanOrEqual(0)
   expect(layout.join).toBeLessThanOrEqual(7)
   expect(layout.inset).toBeCloseTo(7)
   expect(layout.overflow).toBe(0)
   expect(layout.cardOutline).toBe('none')
   expect(layout.borderWidth).toBe('0px')
   if (surface === 'home') {
    expect(layout.blur).toContain('blur(14px)')
    expect(layout.barOpacity).toBeCloseTo(0.343)
    expect(layout.cardFill).toBe(dark ? 'rgba(0, 0, 0, 0.49)' : 'rgba(255, 255, 255, 0.49)')
    expect(await page.locator('#app [data-srb-session-header] .wSkVaW_crumbs').isVisible()).toBe(false)
    const headline = page.locator('#app .pXSMma_headline')
    expect(await headline.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42)).toBe(-10)
   } else {
    expect(layout.blur).toBe('none')
    expect(layout.barFill).toBe(dark ? 'rgb(29, 29, 29)' : 'rgb(232, 232, 232)')
    expect(layout.cardFill).toBe(dark ? 'rgb(54, 54, 54)' : 'rgb(255, 255, 255)')
   }
   for (const [hovered, idle] of [[location, folder], [folder, location]]) {
    await hovered.hover()
    const style = await hovered.evaluate(button => {
     const css = getComputedStyle(button)
     return { height: css.height, radius: css.borderRadius, fill: css.backgroundColor }
    })
    expect(style).toMatchObject({ height: '30px', radius: '999px' })
    expect(style.fill).not.toBe('rgba(0, 0, 0, 0)')
    expect(await idle.evaluate(button => getComputedStyle(button).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
   }
   const glyphShape = locator => locator.evaluate(svg => {
    const {width,height} = svg.getBoundingClientRect()
    const style = getComputedStyle(svg.querySelector('path'))
    return {width,height,fill:style.fill,stroke:style.stroke,strokeWidth:style.strokeWidth}
   })
   const computerIcon = await glyphShape(location.locator(':scope > svg'))
   expect(computerIcon).toMatchObject({width:16,height:16,fill:'none',strokeWidth:'1.15px'})
   expect(await glyphShape(folder.locator(':scope > svg.pXSMma_folder'))).toEqual(computerIcon)
   const clear = bar.getByRole('button',{name:'不在项目中工作',exact:true})
   const fill = () => clear.locator('svg').evaluate(svg => getComputedStyle(svg).backgroundColor)
   await folder.getByText('研究项目 A',{exact:true}).hover()
   expect(await clear.evaluate(el => getComputedStyle(el).opacity)).toBe('1')
   const restingFill = await fill()
   await clear.hover()
   expect(await fill()).not.toBe(restingFill)
   await location.hover()
   expect(await clear.evaluate(el => getComputedStyle(el).opacity)).toBe('0')
   await location.focus()
   await page.keyboard.press('ArrowDown')
   const menu = page.locator('[role=menu]:has([data-odyssey-work-location-option])')
   await menu.waitFor()
   const local = menu.getByRole('menuitem', { name: '此计算机' })
   expect(await local.locator(':scope > svg').count()).toBe(1)
   expect(await menu.getByRole('menuitem', { name: '云端业务系统' }).isDisabled()).toBe(true)
   expect(await menu.locator('input').count()).toBe(0)
   await expect.poll(() => local.evaluate(button => document.activeElement === button)).toBe(true)
   await page.keyboard.press('Escape')
   await menu.waitFor({state:'detached'})
   expect(await location.evaluate(button => document.activeElement === button)).toBe(true)
   await folder.click()
   await page.getByRole('menuitem', { name: '研究项目 B', exact: true }).waitFor()
   await page.keyboard.press('Escape')
  }
 } finally { await page.close() }
}, 15000)
it('provides a home drag region before the session header is mounted', async () => {
 const page = await browser.newPage()
 try {
  const homeCss = await readFile('src/preload/figma-home.css', 'utf8')
  await page.setContent('<style>'+homeCss+'</style><main class="pI_x6G_centerCol"><div class="wSkVaW_root" data-odyssey-page="home"></div></main>')
  const home = page.locator('[data-odyssey-page=home]')
  const drag = () => home.evaluate(el => {
   const style = getComputedStyle(el, '::before')
   return { content: style.content, height: style.height, region: style.getPropertyValue('-webkit-app-region') }
  })
  expect(await drag()).toEqual({ content: '""', height: '44px', region: 'drag' })
  await home.evaluate(el => el.insertAdjacentHTML('afterbegin', '<header class="wSkVaW_header"></header>'))
  expect((await drag()).content).toBe('none')
 } finally { await page.close() }
})
it.each(['home','right'])('works without a project through the %s composer', async surface => {
 const page=await browser.newPage({viewport:{width:1180,height:800}})
 page.setDefaultTimeout(4000)
 try {
  await page.setContent('<style>'+css+'body{margin:0}#app{height:100vh;width:790px}#right{position:fixed;right:10px;top:10px;bottom:10px;width:340px}#right>.t8lSSG_workbench{height:100%}</style><div id="app" class="pI_x6G_centerCol"></div><aside id="right" class="t8lSSG_panel"><div id="right-body" class="t8lSSG_panelBody"></div></aside>')
  await page.evaluate(value=>window.pendingInput={...value,recentWorkspaceId:'A'},input)
  await page.addScriptTag({content:script})
  if(surface==='right')await page.evaluate(()=>window.pendingFixture.openSurface('browser'))
  const bar=page.locator((surface==='home'?'#app':'#right')+' [data-odyssey-composer-workspace]')
  const field=bar.locator('..').locator('textarea')
  const folder=bar.locator('.pXSMma_workspace')
  const clear=bar.getByRole('button',{name:'不在项目中工作',exact:true})
  await folder.getByText('研究项目 A',{exact:true}).waitFor()
  await field.fill('保留草稿并在新目录工作')
  if(surface==='home'){
   expect(await clear.evaluate(button=>getComputedStyle(button).opacity)).toBe('0')
   await folder.hover()
   expect(await clear.evaluate(button=>getComputedStyle(button).opacity)).toBe('1')
   await clear.hover()
   await page.getByRole('tooltip').filter({hasText:'不在项目中工作'}).waitFor()
   await clear.click()
  }else{
   await folder.click()
   await page.getByRole('menuitem',{name:'不在项目中工作',exact:true}).click()
  }
  await folder.getByText('选择项目',{exact:true}).waitFor()
  expect(await field.isEnabled()).toBe(true)
  expect(await field.inputValue()).toBe('保留草稿并在新目录工作')
  expect(await page.evaluate(()=>window.pendingFixture.events)).toEqual([])
  await bar.locator('..').getByRole('button',{name:'发送消息',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.pendingFixture.events)).toContainEqual({type:'create',cwd:'/tmp/standalone/outputs'})
  await expect.poll(()=>page.evaluate(()=>window.pendingFixture.events)).toContainEqual({type:'send',text:'保留草稿并在新目录工作',images:[]})
 } finally {await page.close()}
},15000)
it.each(['empty button','button with draft','typed slash','research tab'])('hands the first home %s to the mounted project without submitting',async action=>{
 const page=await browser.newPage({viewport:{width:1200,height:760}});
 page.setDefaultTimeout(4500);
 try{
  await page.setContent('<style>'+css+'</style><div id="app" class="pI_x6G_centerCol"></div><aside id="right"><div id="right-body"></div></aside>');
  await page.evaluate(data=>window.pendingInput={...data,recentWorkspaceId:'B',verifyHandoff:true},input);
  await page.addScriptTag({content:script});
  const home=page.locator('#app [data-odyssey-page=home]');
  await home.getByText('研究项目 B',{exact:true}).waitFor();
  expect(await home.getByRole('tab').allTextContents()).toEqual(['对话','研究','笔记','表格']);
  expect(await home.getByRole('button',{name:'命令',exact:true}).isEnabled()).toBe(true);
  expect(await page.evaluate(()=>window.pendingFixture.events)).toEqual([]);
  const field=home.locator('textarea');
  const text=action==='typed slash'?'/':action==='empty button'?'':'保留草稿';
  if(action==='typed slash'){
   await field.pressSequentially('/');
  }else{
   if(text)await field.fill(text);
   if(action==='research tab'){
    await home.getByRole('tab',{name:'研究',exact:true}).click();
   }else{
    if(text)await field.evaluate(el=>el.setSelectionRange(2,2));
    await home.getByRole('button',{name:'命令',exact:true}).click();
   }
  }
  const project=page.locator('[data-mounted-project=new-session]');
  await project.waitFor();
  expect(await project.locator('textarea').inputValue()).toBe(text);
  expect(await page.getByRole('listbox').count()).toBe(0);
  await page.evaluate(()=>window.pendingFixture.readySession());
  if(action!=='research tab'){
   await project.getByRole('listbox').getByRole('option').first().waitFor({state:'visible'});
   const range=action==='typed slash'?[0,1]:text?[2,2]:[0,0];
   expect(await page.evaluate(()=>{const {start,end,draftRev}=window.pendingFixture.controller.menu.getSnapshot().hit.span;return {range:[start,end],current:draftRev===window.pendingFixture.real.snapshot.draftRev}})).toEqual({range,current:true});
  }
  expect(await page.evaluate(()=>window.pendingFixture.events)).toEqual([
   {type:'create',workspaceId:'B'},...action==='research tab'?[{type:'view',id:'new-session',view:'research'}]:[],{type:'open',id:'new-session'},
  ]);
 }finally{await page.close()}
},15000)
it('renders native welcome/project picker/input and creates the selected project session only on send',async()=>{
 const page=await browser.newPage({viewport:{width:600,height:800}}),errors=[];page.on('pageerror',error=>errors.push(error.stack));try{
  await page.setContent('<html><head><style>'+css+'body{margin:0;background:#eee}#app{height:100vh}#right{position:fixed;right:10px;top:10px;bottom:10px;width:340px}#right>.t8lSSG_workbench{height:100%}</style></head><body><div id="app" class="pI_x6G_centerCol"></div><aside id="right" class="t8lSSG_panel"><div id="right-body" class="t8lSSG_panelBody"></div></aside></body></html>');await page.evaluate(input=>window.pendingInput=input,input);await page.addScriptTag({content:script});await page.evaluate(()=>window.pendingFixture.openSurface('browser'));await page.getByText('探索更远，洞见更深',{exact:true}).waitFor({timeout:5000}).catch(error=>{console.log('pending errors',errors);throw error})
  expect(await page.locator('.sRp_composer .uV2eYG_accessory').count()).toBe(0);await page.evaluate(()=>{const root=document.createElement('section');root.className='eb-root';Object.assign(root.dataset,{currentPageUrl:'https://example.com/',currentPageTitle:'Example Domain'});document.body.append(root)});expect(await page.getByText('参考当前网页',{exact:false}).count()).toBe(0);expect(await page.locator('.sRp_composer .uV2eYG_accessory').count()).toBe(0);await page.getByRole('tab',{name:'对话',exact:true}).waitFor({state:'visible'});await page.getByRole('tab',{name:'文件',exact:true}).waitFor({state:'visible'});await page.screenshot({path:'/tmp/browser-pending-native-empty.png'});expect(await page.locator('[data-research-conversation-panel]').evaluate(el=>el.getBoundingClientRect().width)).toBe(340);const project=page.locator('.sRp_composer .wSkVaW_heroWorkspaceRow .pXSMma_workspace');await project.click();await page.getByText('研究项目 B',{exact:true}).click();expect(await page.evaluate(()=>window.pendingFixture.events)).toEqual([])
  const textbox=page.locator('.sRp_composer textarea');await textbox.fill('请总结当前网页');await page.getByRole('button',{name:'发送消息',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.pendingFixture.events)).toContainEqual({type:'create',workspaceId:'B'});await expect.poll(()=>page.evaluate(()=>window.pendingFixture.events)).toContainEqual({type:'send',text:'请总结当前网页',images:[]});expect(errors).toEqual([])
  await page.screenshot({path:'/tmp/browser-pending-native-input.png'})
 }finally{await page.close()}
},15000)

it('keeps the native draft editable and retryable after first-session creation fails',async()=>{const page=await browser.newPage({viewport:{width:600,height:800}});try{
 await page.setContent('<html><head><style>'+css+'body{margin:0}#app{height:100vh}#right{position:fixed;right:10px;top:10px;bottom:10px;width:340px}#right>.t8lSSG_workbench{height:100%}</style></head><body><div id="app" class="pI_x6G_centerCol"></div><aside id="right" class="t8lSSG_panel"><div id="right-body" class="t8lSSG_panelBody"></div></aside></body></html>');await page.evaluate(input=>window.pendingInput=input,input);await page.addScriptTag({content:script});await page.evaluate(()=>window.pendingFixture.openSurface('browser'));await page.getByText('探索更远，洞见更深',{exact:true}).waitFor();await page.locator('.sRp_composer .wSkVaW_heroWorkspaceRow .pXSMma_workspace').click();await page.getByText('研究项目 A',{exact:true}).click();await page.evaluate(()=>window.pendingFixture.failOnce());const inputBox=page.locator('.sRp_composer textarea');await inputBox.fill('保留这个问题');await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.getByText('测试创建失败，输入保留',{exact:true}).waitFor();expect(await inputBox.inputValue()).toBe('保留这个问题');expect(await inputBox.isEditable()).toBe(true);await page.getByRole('button',{name:'发送消息',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.pendingFixture.events.some(e=>e.type==='send'&&e.text==='保留这个问题'))).toBe(true)
 }finally{await page.close()}},15000)

it.each(['back', 'home'])('restores the conversation homepage with the right pane still open on %s', async action => {
 const page=await browser.newPage({viewport:{width:1100,height:800}}), errors=[];
 page.setDefaultTimeout(4500);
 page.on('pageerror',error=>errors.push(error.message));
 try {
  await page.setContent('<html><head><style>'+css+'body{margin:0}#app{height:100vh;width:740px}#right{position:fixed;right:10px;top:10px;bottom:10px;width:340px}</style></head><body><div id="app" class="pI_x6G_centerCol"></div><aside id="right" class="t8lSSG_panel"><div id="right-body" class="t8lSSG_panelBody"></div></aside></body></html>');
  await page.evaluate(input=>window.pendingInput=input,input);
  await page.addScriptTag({content:script});
  const home=page.locator('#app [data-odyssey-page=home]');
  const center=home.locator('textarea');
  await center.waitFor({state:'visible'});
  const chatTab=page.locator('#right').getByRole('tab',{name:'对话',exact:true});
  const filesTab=page.locator('#right [role=tab]').filter({hasText:'文件'});
  await page.evaluate(()=>window.pendingFixture.setPaneOpen(false));
  await page.evaluate(()=>window.pendingFixture.setPaneOpen(true));
  await filesTab.waitFor({state:'visible'});
  expect(await filesTab.getAttribute('aria-selected')).toBe('true');
  expect(await chatTab.count()).toBe(0);
  expect(await center.isVisible()).toBe(true);
  await page.evaluate(()=>window.pendingFixture.openSurface('browser'));
  await chatTab.waitFor({state:'visible'});
  const right=page.locator('#right textarea');
  await right.waitFor({state:'visible'});
  await page.locator('#right .wSkVaW_heroWorkspaceRow .pXSMma_workspace').click();
  await page.getByText('研究项目 B',{exact:true}).click();
  await right.fill('切换应用后回到首页');
  await page.evaluate(()=>window.pendingFixture.openSurface('image-factory'));
  await page.evaluate(()=>window.pendingFixture.openSurface('knowledge'));
  if(action==='back')await page.getByRole('button',{name:'返回工作区'}).click();
  else await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:sidebar-home-opened')));
  await home.waitFor({state:'visible',timeout:3000}).catch(async error=>{
   const center=await page.locator('#app').evaluate(node=>({phase:node.firstElementChild?.dataset.phase,outer:node.outerHTML.slice(0,500),surface:document.body.dataset.workspaceSurface}));
   throw new Error(JSON.stringify({center,errors}),{cause:error});
  });
  await center.waitFor({state:'visible'});
  expect(await center.inputValue()).toBe('切换应用后回到首页');
  expect(await center.isEditable()).toBe(true);
  expect(await home.getByText('研究项目 B',{exact:true}).count()).toBe(1);
  expect(await right.count()).toBe(0);
  expect(await chatTab.count()).toBe(0);
  expect(await filesTab.isVisible()).toBe(true);
  expect(await page.evaluate(()=>document.body.dataset.odysseyGlobalRightOpen)).toBe('true');
  expect(await page.evaluate(()=>window.pendingFixture.events)).toEqual([]);
  await home.getByRole('button',{name:'发送消息',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.pendingFixture.events)).toEqual([
   {type:'create',workspaceId:'B'},{type:'open',id:'new-session'},{type:'send',text:'切换应用后回到首页',images:[]},
  ]);
  expect(errors).toEqual([]);
 } finally { await page.close() }
},15000)

it('changes only the right project, drops an empty draft, and opens the new workspace on first send', async () => {
 const page=await browser.newPage({viewport:{width:1180,height:800}}), errors=[];
 page.setDefaultTimeout(5000);
 page.on('pageerror',error=>errors.push(error.message));
 try {
  await page.route('http://127.0.0.1/right-project',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><body></body>'}));
  await page.goto('http://127.0.0.1/right-project');
  await page.setContent('<style>'+css+'body{margin:0}#app{height:100vh;width:790px}#right{position:fixed;right:10px;top:10px;bottom:10px;width:340px}</style><div id="app" class="pI_x6G_centerCol"></div><aside id="right" class="t8lSSG_panel"><div id="right-body" class="t8lSSG_panelBody"></div></aside>');
  await page.evaluate(value=>{window.pendingInput={...value,recentWorkspaceId:'A',verifyRightProject:true}},input);
  await page.addScriptTag({content:script});
  const composer=page.locator('#right [data-odyssey-composer-project]');
  const picker=composer.locator('.pXSMma_workspace');
  await page.evaluate(()=>window.pendingFixture.openSurface('image-factory'));
  await picker.getByText('研究项目 A',{exact:true}).waitFor().catch(async error=>{
   throw Error(JSON.stringify({errors,center:(await page.locator('#app').innerText()).slice(0,500),right:(await page.locator('#right').innerText()).slice(0,500)}),{cause:error})
  });
  await page.evaluate(()=>{window.existingCanvas=document.querySelector('section[data-workspace-surface="image-factory"]')});
  const selection=()=>page.evaluate(()=>window.pendingFixture.current.current);
  const events=()=>page.evaluate(()=>window.pendingFixture.events);
  await picker.click();
  await page.getByText('研究项目 B',{exact:true}).click();
  await picker.getByText('研究项目 B',{exact:true}).waitFor();
  expect(await selection()).toBe('existing-canvas');
  expect(await page.evaluate(()=>window.existingCanvas===document.querySelector('section[data-workspace-surface="image-factory"]'))).toBe(true);
  await page.evaluate(()=>{window.originalProjectDraft=window.pendingFixture.right.getSnapshot()});
  expect(await events()).toEqual([]);

  await page.evaluate(()=>window.pendingFixture.goHome());
  const home=page.locator('#app [data-odyssey-page=home]');
  await home.getByText('研究项目 B',{exact:true}).waitFor();
  expect(await page.evaluate(()=>window.pendingFixture.right.getSnapshot())).toBeUndefined();
  expect(await events()).toEqual([]);

  await page.evaluate(()=>window.pendingFixture.openExisting('existing-canvas'));
  await page.evaluate(()=>window.pendingFixture.openSurface('image-factory'));
  await picker.getByText('研究项目 B',{exact:true}).waitFor();
  expect(await page.evaluate(()=>window.originalProjectDraft!==window.pendingFixture.right.getSnapshot())).toBe(true);
  await composer.locator('textarea').fill('为项目 B 创建新任务');
  await page.evaluate(()=>window.pendingFixture.goHome());
  await page.evaluate(()=>window.pendingFixture.openExisting('existing-canvas'));
  await page.evaluate(()=>window.pendingFixture.openSurface('image-factory'));
  await expect.poll(()=>composer.locator('textarea').inputValue()).toBe('为项目 B 创建新任务');
  await composer.getByRole('button',{name:'发送消息',exact:true}).click();
  await expect.poll(events).toEqual([
   {type:'create',workspaceId:'B'},{type:'view',id:'new-session',view:'chat'},
   {type:'open',id:'new-session'},{type:'send',text:'为项目 B 创建新任务',images:[]}
  ]);
  expect(errors).toEqual([]);
 } finally { await page.close() }
},16000);

it('retains the session project for top-bar mode changes and still follows the manual default via the app rail', async () => {
 const page=await browser.newPage({viewport:{width:1280,height:830}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 try {
  await page.route('http://127.0.0.1/topbar-project',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset=utf-8>'}))
  await page.goto('http://127.0.0.1/topbar-project')
  await page.setContent('<style>'+css+'#app{height:100vh;width:66%}#right{position:fixed;right:10px;top:10px;bottom:10px;width:32%;max-width:340px}</style><div id="app" class="pI_x6G_centerCol"></div><aside id="right" class="t8lSSG_panel"><div id="right-body" class="t8lSSG_panelBody"></div></aside>')
  await page.evaluate(input=>{window.pendingInput={...input,recentWorkspaceId:'A',verifyRightProject:true}},input)
  await page.addScriptTag({content:script})
  await page.evaluate(()=>window.pendingFixture.openSurface('browser'))
  const chip=page.locator('#right [data-odyssey-composer-project] .pXSMma_workspace')
  await chip.getByText('研究项目 A',{exact:true}).waitFor()
  await chip.click()
  await page.getByText('研究项目 B',{exact:true}).click()
  await chip.getByText('研究项目 B',{exact:true}).waitFor()
  for(const mode of ['image-factory','knowledge','browser']) {
   await page.evaluate(mode=>{
    document.body.dataset.sessionWorkspaceSwitch=window.pendingFixture.current.current
    window.pendingFixture.openSurface(mode)
   },mode)
   await chip.getByText('研究项目 A',{exact:true}).waitFor()
   expect(await page.evaluate(()=>window.pendingFixture.current.current)).toBe('existing-canvas')
  }
  await page.evaluate(()=>{
   delete document.body.dataset.sessionWorkspaceSwitch
   window.pendingFixture.openSurface('image-factory')
  })
  await chip.getByText('研究项目 B',{exact:true}).waitFor()
  expect(await page.evaluate(()=>window.pendingFixture.events)).toEqual([])
  expect(errors).toEqual([])
 } finally { await page.close() }
},15000)

it('keeps the research welcome and shows the chosen right project in the picker', async () => {
 const page=await browser.newPage({viewport:{width:1180,height:800}})
 page.setDefaultTimeout(4500)
 try {
  await page.route('http://127.0.0.1/research-project-destination',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}))
  await page.goto('http://127.0.0.1/research-project-destination')
  await page.setContent('<style>'+css+'#app{height:100vh;width:66%}#right{position:fixed;right:10px;top:10px;bottom:10px;width:340px}</style><div id="app" class="pI_x6G_centerCol"></div><aside id="right" class="t8lSSG_panel"><div id="right-body" class="t8lSSG_panelBody"></div></aside>')
  await page.evaluate(input=>{window.pendingInput={...input,recentWorkspaceId:'A',verifyRightProject:true,initialView:'research'}},input)
  await page.addScriptTag({content:script})
  const right=page.locator('#right')
  const welcome=right.locator('[data-mode-welcome=research]')
  await welcome.waitFor()
  await right.locator('.pXSMma_workspace').click()
  await page.getByText('研究项目 B',{exact:true}).click()
  await right.locator('.pXSMma_workspace').getByText('研究项目 B',{exact:true}).waitFor()
  expect(await welcome.isVisible()).toBe(true)
  expect(await page.evaluate(()=>window.pendingFixture.current.current)).toBe('existing-canvas')
  expect(await page.evaluate(()=>window.pendingFixture.events)).toEqual([])
 } finally { await page.close() }
})

it('restores the chosen project and unsent text separately for each browser tab', async () => {
 const page=await browser.newPage({viewport:{width:1180,height:800}})
 page.setDefaultTimeout(4500)
 try {
  await page.route('http://127.0.0.1/browser-tab-project',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'}))
  await page.goto('http://127.0.0.1/browser-tab-project')
  await page.setContent('<style>'+css+'#app{height:100vh;width:66%}#right{position:fixed;right:10px;top:10px;bottom:10px;width:340px}</style><div id="app" class="pI_x6G_centerCol"></div><aside id="right" class="t8lSSG_panel"><div id="right-body" class="t8lSSG_panelBody"></div></aside>')
  await page.evaluate(input=>{window.pendingInput={...input,recentWorkspaceId:'A',verifyRightProject:true}},input)
  await page.addScriptTag({content:script})
  const switchTab=id=>page.evaluate(tabId=>{
   document.body.dataset.browserActiveTab=tabId
   document.dispatchEvent(new CustomEvent('sherlock:browser-active-tab-change',{detail:{tabIds:['one','two']}}))
   window.pendingFixture.openSurface('browser')
  },id)
  const right=page.locator('#right')
  const picker=right.locator('.pXSMma_workspace')
  const field=right.locator('textarea')
  await switchTab('one')
  await picker.getByText('研究项目 A',{exact:true}).waitFor()
  await field.fill('第一个网页的草稿')
  await switchTab('two')
  await expect.poll(()=>field.inputValue()).toBe('')
  await picker.click()
  await page.getByText('研究项目 B',{exact:true}).click()
  await picker.getByText('研究项目 B',{exact:true}).waitFor()
  await switchTab('one')
  await picker.getByText('研究项目 A',{exact:true}).waitFor()
  await expect.poll(()=>field.inputValue()).toBe('第一个网页的草稿')
  await switchTab('two')
  await picker.getByText('研究项目 B',{exact:true}).waitFor()
  await expect.poll(()=>field.inputValue()).toBe('')
  expect(await page.evaluate(()=>window.pendingFixture.events)).toEqual([])
  await field.fill('第二个网页的消息')
  await right.getByRole('button',{name:'发送消息',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.pendingFixture.events)).toEqual([
   {type:'create',workspaceId:'B'},{type:'view',id:'new-session',view:'chat'},
   {type:'open',id:'new-session'},{type:'send',text:'第二个网页的消息',images:[]}
  ])
 } finally { await page.close() }
})

it('inherits the visible workspace from the app rail even when the last manual project differs', async () => {
 const page=await browser.newPage({viewport:{width:1380,height:900}})
 try {
  await page.route('http://127.0.0.1/sidebar-project',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset=utf-8>'}))
  await page.goto('http://127.0.0.1/sidebar-project')
  await page.setContent('<style>'+css+'#app{height:100vh;width:66%}#right{position:fixed;right:10px;top:10px;bottom:10px;width:340px}</style><div id="app" class="pI_x6G_centerCol"></div><aside id="right" class="t8lSSG_panel"><div id="right-body" class="t8lSSG_panelBody"></div></aside>')
  await page.evaluate(input=>{
   window.pendingInput={...input,recentWorkspaceId:'B',verifyRightProject:true}
  },input)
  await page.addScriptTag({content:script})
  await page.evaluate(()=>window.pendingFixture.record.selectWorkspace('B'))
  expect(await page.evaluate(()=>window.pendingFixture.sidebarWorkspace.current())).toBe('A')
  const picker=page.locator('#right .pXSMma_workspace')
  await page.evaluate(()=>window.pendingFixture.openViaRail('browser'))
  await picker.getByText('研究项目 A',{exact:true}).waitFor()
  await picker.click()
  await page.getByText('研究项目 B',{exact:true}).click()
  await picker.getByText('研究项目 B',{exact:true}).waitFor()
  await page.evaluate(()=>window.pendingFixture.openViaRail('image-factory'))
  await picker.getByText('研究项目 B',{exact:true}).waitFor()
  expect(await page.evaluate(()=>window.pendingFixture.current.current)).toBe('existing-canvas')
  expect(await page.evaluate(()=>window.pendingFixture.events)).toEqual([])
 } finally { await page.close() }
},15000)

it.each(['research','browser'])('continues the saved right-hand conversation in %s without a project selector', async mode => {
 const page=await browser.newPage({viewport:{width:1380,height:900}}),errors=[]
 page.setDefaultTimeout(3500)
 page.on('pageerror',error=>errors.push(error.message))
 try {
  await page.route('http://127.0.0.1/right-history',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset=utf-8>'}))
  await page.goto('http://127.0.0.1/right-history')
  await page.setContent('<style>'+css+'#app{height:100vh;width:66%}#right{position:fixed;right:10px;top:10px;bottom:10px;width:340px}</style><div id="app" class="pI_x6G_centerCol"></div><aside id="right" class="t8lSSG_panel"><div id="right-body" class="t8lSSG_panelBody"></div></aside>')
  await page.evaluate(({input,mode})=>{window.pendingInput={...input,recentWorkspaceId:'B',verifyRightProject:true,verifyHistory:true,initialView:mode==='browser'?'chat':mode}}, {input,mode})
  await page.addScriptTag({content:script})
  if(mode==='browser') await page.evaluate(()=>window.pendingFixture.openSurface('browser'))
  const right=page.locator('#right')
  const composer=right.locator('textarea')
  await composer.waitFor().catch(async error=>{
   throw Error(JSON.stringify({errors,center:(await page.locator('#app').innerText()).slice(0,500),right:(await right.innerText()).slice(0,500)}),{cause:error})
  })
  expect(await right.locator('[data-odyssey-composer-workspace]').count()).toBe(0)
  expect(await page.evaluate(()=>window.pendingFixture.right.getSnapshot())).toBeUndefined()
  await composer.fill('继续补充之前的内容')
  await right.getByRole('button',{name:'发送消息',exact:true}).click()
  expect(await page.evaluate(()=>window.pendingFixture.events)).toEqual([
   {type:'continue',id:'existing-canvas',text:'继续补充之前的内容'}
  ])
  expect(await page.evaluate(()=>window.pendingFixture.current.current)).toBe('existing-canvas')
  expect(errors).toEqual([])
 } finally { await page.close() }
},15000)

const projectModes = ['image-factory','browser','knowledge','notes','spreadsheet','research'];
it.each(projectModes.flatMap(mode=>[false,true].map(dark=>({mode,dark}))))(
 'keeps the active $mode page when changing or clearing the right project (dark: $dark)',
 async ({mode,dark}) => {
  const page=await browser.newPage({viewport:{width:dark?1380:1040,height:830}}),errors=[];
  page.setDefaultTimeout(4500);
  page.on('pageerror',error=>errors.push(error.message));
  try {
   await page.route('http://127.0.0.1/right-project-mode',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><body></body>'}));
   await page.goto('http://127.0.0.1/right-project-mode');
   await page.setContent('<style>'+css+'body{margin:0}#app{height:100vh;width:66%}#right{position:fixed;right:10px;top:10px;bottom:10px;width:32%;max-width:340px}</style><div id="app" class="pI_x6G_centerCol"></div><aside id="right" class="t8lSSG_panel"><div id="right-body" class="t8lSSG_panelBody"></div></aside>');
   const app=['image-factory','browser','knowledge'].includes(mode);
   await page.evaluate(({input,mode,dark,app})=>{
    document.body.toggleAttribute('data-ds-dark-theme',dark);
    window.pendingInput={...input,recentWorkspaceId:'A',verifyRightProject:true,initialView:app?'chat':mode};
   },{input,mode,dark,app});
   await page.addScriptTag({content:script});
   if(app)await page.evaluate(mode=>window.pendingFixture.openSurface(mode),mode);

   const seat=page.locator('#right [data-odyssey-composer-project]');
   const chip=seat.locator('.pXSMma_workspace');
   await chip.getByText('研究项目 A',{exact:true}).waitFor();
   const center=()=>page.evaluate(()=>({
    owner:window.pendingFixture.current.current,
    application:document.body.dataset.workspaceSurface,
    page:document.querySelector('#app [data-odyssey-page]')?.dataset.odysseyPage
   }));
   const original=await center();
   await chip.click();
   await page.getByText('研究项目 B',{exact:true}).click();
   await chip.getByText('研究项目 B',{exact:true}).waitFor();
   expect(await seat.locator('[data-right-project-draft-hint]').count()).toBe(0);
   expect(await center()).toEqual(original);
   expect(await seat.locator('textarea').isEditable()).toBe(true);
   expect(await seat.locator('[data-note-context-anchor]').count()).toBe(0);
   expect(await seat.evaluate(el=>{
    const bounds=el.getBoundingClientRect(),pane=el.closest('#right').getBoundingClientRect();
    return bounds.left>=pane.left&&bounds.right<=pane.right+1&&el.scrollWidth<=el.clientWidth+1;
   })).toBe(true);
   await chip.click();
   await page.getByRole('menuitem',{name:'不在项目中工作',exact:true}).click();
   await chip.getByText('选择项目',{exact:true}).waitFor();
   expect(await seat.locator('[data-right-project-draft-hint]').count()).toBe(0);
   expect(await center()).toEqual(original);
   expect(await page.evaluate(()=>window.pendingFixture.record.getManualWorkspace())).toBeNull();
   expect(await page.evaluate(()=>window.pendingFixture.events)).toEqual([]);
   expect(errors).toEqual([]);
  } finally {await page.close()}
 },
 15000
);
