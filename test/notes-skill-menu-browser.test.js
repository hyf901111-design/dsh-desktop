import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile,mkdir} from 'node:fs/promises'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
import {createSourceFile,ScriptTarget,ScriptKind,isCallExpression,forEachChild} from 'typescript'
import {notesComposerSource} from '../scripts/lib/notes-composer.mjs'

const artifacts=process.env.SHERLOCK_TEST_NOTES_SKILL_EVIDENCE||'/tmp/notes-skill-owner-20261026'
let browser,script,css,sources
function installer(source){const tree=createSourceFile('native.js',source,ScriptTarget.Latest,false,ScriptKind.JS),found=[];const visit=node=>{if(isCallExpression(node)&&node.expression.getText(tree)==='ctx.effect'&&node.arguments[1]?.text==='Sherlock integration skill composer')found.push(node.getText(tree));forEachChild(node,visit)};visit(tree);if(found.length!==1)throw Error('Actual composer install effect drifted');return found[0]+';'}
beforeAll(async()=>{
 await mkdir(artifacts,{recursive:true})
 // Match production's inverse order before testing the inner Notes adapter.
 const native=execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{stripConversationGridOverlays}from'./test/fixtures/strip-conversation-transient-ui.mjs';import{stripPlainSlashInput}from'./scripts/lib/plain-slash-input.mjs';import{stripSidebarNewNoteConversation}from'./scripts/lib/sidebar-new-note.mjs';import{stripPptxAnnotationMessages}from'./scripts/lib/pptx-annotation-message.mjs';import{stripPptxAnnotationInput}from'./scripts/lib/pptx-annotation-native.mjs';import{stripHomeGuideNative}from'./scripts/lib/home-guide-native.mjs';import{stripHomeGuidePresentationNative}from'./scripts/lib/home-guide-presentation-native.mjs';import{patchNotesComposer}from'./scripts/lib/notes-composer.mjs';import{patchIntegrationSkillComposer}from'./scripts/lib/patch-integration-skill-composer.mjs';let source=stripConversationGridOverlays(readFileSync(0,'utf8'));for(const patch of [stripPlainSlashInput,stripSidebarNewNoteConversation,stripPptxAnnotationMessages,stripPptxAnnotationInput,stripHomeGuidePresentationNative,stripHomeGuideNative,patchNotesComposer,patchIntegrationSkillComposer])source=patch(source);process.stdout.write(source)"],{input:await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),encoding:'utf8',maxBuffer:64*1024*1024})
 sources={runtime:await readFile('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'),conversation:native.replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__InputBar=InputBar;'),commands:(await readFile('node_modules/@deepseek-ai/dsh-client-ui-commands/lib/client.js','utf8')).replace('exports.apply = apply;','exports.__Popup=PopupSelectView;exports.apply = apply;'),triggers:(await readFile('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js','utf8')).replace('exports.apply = apply;','exports.__Menu=MenuView;exports.apply = apply;')}
 const fixture=await readFile('test/fixtures/notes-skill-menu-browser.tsx','utf8')
 const output=await build({stdin:{resolveDir:process.cwd()+'/test/fixtures',loader:'tsx',contents:fixture.replace('/* NOTES_SOURCE */',notesComposerSource).replace('/* INSTALL_COMPOSER_EFFECT */',installer(native))},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'expose-real-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>{const source=await readFile(args.path,'utf8'),anchor='  const slashMenu = useMemo';if(source.split(anchor).length!==2)throw Error('Native Notes test exposure drift');return{contents:source.replace(anchor,'  window.noteEditor=editor; '+anchor),loader:'tsx'}})}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(){
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(4000)
 await page.route('http://127.0.0.1/note-skill-owner',route=>route.fulfill({contentType:'text/html',body:'<body data-workspace-surface="notes"><section id="note-surface" class="en-root" style="left:0;right:380px"><div id="notes" class="en-editor-host"></div></section><aside id="composer" data-ework-notes-composer-host="notes-skill-owner" style="position:fixed;bottom:20px;right:20px;width:340px"></aside><div id="menus" style="position:fixed;right:20px;bottom:180px;width:340px"></div></body>'}))
 await page.goto('http://127.0.0.1/note-skill-owner')
 await page.evaluate(sources=>{window.nativeModules={};for(const [key,source]of Object.entries(sources)){window.__ModuleLoader__={load:descriptor=>window.nativeModules[key]=descriptor};new Function(source)()}},sources)
 await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('#composer textarea').waitFor().catch(async error=>{console.error('Native fixture errors',errors,await page.locator('body').innerText());throw error});await expect.poll(()=>page.evaluate(()=>window.probe.record.ready)).toBe(true)
 await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'body',type:'paragraph',content:'这段笔记选区和正文都必须保留。'},{id:'other',type:'paragraph',content:'另一段保持原样。'}]))
 return{context,page,errors,input:page.locator('#composer textarea')}
}
async function open(page){await page.locator('#composer button[aria-haspopup=listbox]').click();await page.getByRole('option',{name:/技能/}).click();await expect.poll(()=>page.evaluate(()=>window.probe.popup.state.getSnapshot().status)).toBe('ready')}
async function choose(page,label){await page.locator('[data-ework-command=skills]').getByRole('option',{name:new RegExp(label)}).click()}

it('chooses a skill through the real empty Notes launcher and native popup, without switching to or changing chat',async()=>{
 const{context,page,input,errors}=await fixture();try{
  const before=await page.evaluate(()=>window.probe.ordinary.snapshot)
  await input.focus();await open(page);await choose(page,'PPT制作助手')
  await expect.poll(()=>page.evaluate(()=>window.probe.popup.state.getSnapshot())).toMatchObject({open:false,error:null})
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences.map(o=>JSON.parse(o.ref).id))).toEqual(['builtin:efund-ppt-maker'])
  expect(await page.evaluate(()=>window.probe.ordinary.snapshot)).toEqual(before)
  expect(await page.evaluate(()=>window.probe.reveals)).toBe(0)
  expect(await page.evaluate(()=>document.body.dataset.workspaceSurface)).toBe('notes')
  expect(await input.evaluate(el=>document.activeElement===el)).toBe(true)
  await page.screenshot({path:artifacts+'/empty-notes-selected.png'});expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.probe.dispose());await context.close()}
},15000)

it('adds multiple skills beside an existing selected note context and keeps both drafts, file references and selected whitespace',async()=>{
 const{context,page,input,errors}=await fixture();try{
  const before=await page.evaluate(()=>{window.noteEditor.setTextCursorPosition('body','start');const from=window.noteEditor._tiptapEditor.state.selection.from;window.noteEditor.focus();window.noteEditor._tiptapEditor.commands.setTextSelection({from,to:from+8});window.probe.shell.setDraft('需求　　尾文');window.probe.shell.insertFilePaths(['/qa/notes-keep.pdf']);return{ordinary:window.probe.ordinary.snapshot,body:window.noteEditor.document,file:window.probe.shell.snapshot.occurrences[0]}})
  await input.focus();await input.evaluate(el=>el.setSelectionRange(2,4));await open(page);await choose(page,'PPT制作助手')
  await expect.poll(()=>page.evaluate(()=>window.probe.popup.state.getSnapshot().open)).toBe(false)
  await open(page);await choose(page,'基础数据源');await expect.poll(()=>page.evaluate(()=>window.probe.popup.state.getSnapshot().open)).toBe(false)
  await open(page);await choose(page,'研报写作');await expect.poll(()=>page.evaluate(()=>window.probe.popup.state.getSnapshot().open)).toBe(false)
  const after=await page.evaluate(()=>({ordinary:window.probe.ordinary.snapshot,body:window.noteEditor.document,notes:window.probe.shell.snapshot,reveals:window.probe.reveals,calls:window.probe.noteRequests}))
  expect(after.ordinary).toEqual(before.ordinary);expect(after.body).toEqual(before.body)
  expect(after.notes.occurrences.filter(o=>o.source==='ework-managed-skill').map(o=>JSON.parse(o.ref).id)).toEqual(['builtin:efund-ppt-maker','builtin:ework-free-data-sources','builtin:ework-equity-research'])
  expect(after.notes.draft).toContain('需求');expect(after.notes.draft).toContain('尾文')
  expect(after.notes.occurrences.find(o=>o.source==='chat-file')).toMatchObject({occurrenceId:before.file.occurrenceId,ref:before.file.ref})
  expect(await page.locator('[data-note-reference-chip="text-selection"]').textContent()).toContain('这段笔记选区和正')
  expect(after.reveals).toBe(0);expect(after.calls.some(call=>call.method==='generate')).toBe(false);expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.probe.dispose());await context.close()}
},20000)

it('keeps the exact Notes shell owner even when its draft revision collides with the ordinary chat revision',async()=>{
 const{context,page,input,errors}=await fixture();try{
  const before=await page.evaluate(()=>{while(window.probe.shell.snapshot.draftRev<window.probe.ordinary.snapshot.draftRev)window.probe.shell.setDraft(window.probe.shell.snapshot.draft+'笔记');return{notes:window.probe.shell.snapshot,ordinary:window.probe.ordinary.snapshot}})
  expect(before.notes.draftRev).toBe(before.ordinary.draftRev)
  await input.focus();await input.evaluate(el=>el.setSelectionRange(0,0));await open(page);await choose(page,'PPT制作助手')
  await expect.poll(()=>page.evaluate(()=>window.probe.popup.state.getSnapshot().open)).toBe(false)
  const after=await page.evaluate(()=>({notes:window.probe.shell.snapshot,ordinary:window.probe.ordinary.snapshot}))
  expect(after.notes.occurrences).toHaveLength(1);expect(after.notes.draft).toContain(before.notes.draft);expect(after.ordinary).toEqual(before.ordinary);expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.probe.dispose());await context.close()}
},15000)

it('does not activate a resident Research binding when the actual admitted input is Notes',async()=>{
 const{context,page,input,errors}=await fixture();try{
  await page.evaluate(()=>window.probe.researchSidebar.stores.set(window.probe.sessionId,{getSnapshot:()=>({binding:{active:true}})}))
  await input.focus();await open(page);await choose(page,'PPT制作助手');await expect.poll(()=>page.evaluate(()=>window.probe.popup.state.getSnapshot().open)).toBe(false)
  expect(await page.evaluate(()=>window.probe.shell.snapshot.occurrences)).toHaveLength(1)
  expect(await page.evaluate(()=>window.probe.reveals)).toBe(0);expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.probe.dispose());await context.close()}
},15000)

it('keeps the original ordinary-chat reveal and focus for immediate skill use from the settings surface',async()=>{
 const{context,page,input,errors}=await fixture();try{
  const before=await page.evaluate(()=>window.probe.shell.snapshot)
  await page.evaluate(async()=>{document.body.dataset.workspaceSurface='integrations';await window.probe.useSkill({id:'builtin:efund-ppt-maker',revision:1})})
  expect(await page.evaluate(()=>window.probe.shell.snapshot)).toEqual(before)
  expect(await page.evaluate(()=>window.probe.ordinary.snapshot.occurrences.filter(o=>o.source==='ework-managed-skill'))).toHaveLength(1)
  expect(await page.evaluate(()=>window.probe.reveals)).toBe(1)
  expect(await page.evaluate(()=>document.body.dataset.workspaceSurface)).toBe('')
  expect(await input.evaluate(el=>document.activeElement===el)).toBe(true);expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.probe.dispose());await context.close()}
},15000)

it.each(['draft','aba','leave','session','readonly'])('refuses a late Notes skill after %s while retaining both native draft snapshots',async reason=>{
 const{context,page,input,errors}=await fixture();try{
  await input.fill('笔记请求');await open(page);await page.evaluate(()=>window.probe.holdDetail=true)
  await choose(page,'PPT制作助手');await expect.poll(()=>page.evaluate(()=>typeof window.probe.releaseDetail)).toBe('function')
  const before=await page.evaluate(reason=>{if(reason==='draft'||reason==='aba'){const original=window.probe.shell.snapshot.draft;window.probe.shell.setDraft(original+'后来输入');if(reason==='aba')window.probe.shell.setDraft(original)}if(reason==='leave')window.probe.leave();if(reason==='session')window.probe.sessions?.list.set({current:'other'});if(reason==='readonly')document.querySelector('#composer textarea').readOnly=true;return{notes:window.probe.shell.snapshot,ordinary:window.probe.ordinary.snapshot}},reason)
  await page.evaluate(()=>window.probe.releaseDetail());await expect.poll(()=>page.evaluate(()=>window.probe.popup.state.getSnapshot().error)).not.toBeNull()
  const after=await page.evaluate(()=>({notes:window.probe.shell.snapshot,ordinary:window.probe.ordinary.snapshot,reveals:window.probe.reveals}))
  expect(after.notes).toEqual(before.notes);expect(after.ordinary).toEqual(before.ordinary);expect(after.reveals).toBe(0);expect(errors).toEqual([])
 }finally{await page.evaluate(()=>window.probe.dispose());await context.close()}
},15000)
