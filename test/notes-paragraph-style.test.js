import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

let browser,script,css
beforeAll(async()=>{
 const built=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
 window.noteSaved={title:'段落样式验收',blocks:[{id:'first',type:'paragraph',props:{noteIndent:1,textAlignment:'center'},content:[{type:'text',text:'第一段',styles:{bold:true,textColor:'red'}},{type:'text',text:'\\n第二段\\n第三段',styles:{italic:true}}]},{id:'second',type:'paragraph',content:'第四段'},{id:'untouched',type:'paragraph',content:'未选择的正文'}],yjs:'',revision:0};
 const bridge={request:async(method,input)=>method==='load'?{saved:window.noteSaved}:method==='save'?{status:'saved',saved:window.noteSaved={...input.content,revision:input.revision+1}}:{},draft:async()=>{}};
 window.reopen=()=>{window.root?.unmount();window.root=createRoot(document.querySelector('#notes'));window.root.render(<NotesApp sessionId='paragraph-test' bridge={bridge} dark={document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>{}}/>)};window.reopen();
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'observe-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=built.outputFiles.find(f=>f.path.endsWith('.js')).text;css=built.outputFiles.find(f=>f.path.endsWith('.css')).text
 const {chromium}=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(async()=>browser?.close())
async function fixture(dark=false){
 const context=await browser.newContext({viewport:{width:1000,height:800}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(2500);page.on('pageerror',e=>errors.push(e.message))
 await page.route('http://127.0.0.1/paragraph',r=>r.fulfill({contentType:'text/html',body:`<body ${dark?'data-ds-dark-theme':''}><section class='en-root' data-dark='${dark}'><div id='notes'></div></section></body>`}));await page.goto('http://127.0.0.1/paragraph');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor()
 await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,window.noteSaved.blocks));await expect.poll(()=>page.evaluate(()=>window.noteSaved.revision)).toBeGreaterThan(0)
 return {context,page,errors}
}
async function select(page,first='first',last='second',fromOffset=0,toOffset){
 await page.evaluate(({first,last,fromOffset,toOffset})=>{
  const editor=window.noteEditor,positions={};editor._tiptapEditor.state.doc.descendants((node,pos)=>{if(node.type.name==='blockContainer'&&node.firstChild?.inlineContent)positions[node.attrs.id]={from:pos+2,size:node.firstChild.content.size}})
  editor.focus();editor._tiptapEditor.commands.setTextSelection({from:positions[first].from+fromOffset,to:positions[last].from+(toOffset??positions[last].size)})
 },{first,last,fromOffset,toOffset})
 await page.locator('.bn-formatting-toolbar').waitFor()
}
const blocks=page=>page.evaluate(()=>window.noteEditor.document.filter(b=>b.id!=='untouched'&&b.content?.length))
const texts=items=>items.map(b=>b.content.map(c=>c.text||c.content?.map(t=>t.text).join('')||'').join(''))
for(const dark of [false,true])for(const [label,type] of [['无序列表','bulletListItem'],['有序列表','numberedListItem'],['待办列表','checkListItem']])it(`formats every selected newline with ${label} (${dark?'dark':'light'})`,async()=>{
 const {context,page,errors}=await fixture(dark);try{
  await select(page);await page.locator('.bn-formatting-toolbar').getByRole('button',{name:label,exact:true}).click()
  const result=await blocks(page);expect(texts(result)).toEqual(['第一段','第二段','第三段','第四段']);expect(result.map(b=>b.type)).toEqual(Array(4).fill(type));expect(result.slice(0,3).map(b=>b.props.noteIndent)).toEqual([1,1,1]);expect(result[0].content[0].styles).toEqual({bold:true,textColor:'red'});expect(result[1].content[0].styles).toEqual({italic:true})
  expect(result.slice(0,3).map(b=>b.props.textAlignment)).toEqual(['center','center','center']);expect(await page.evaluate(()=>{const {doc,selection}=window.noteEditor._tiptapEditor.state;return doc.textBetween(selection.from,selection.to,'\n')})).toBe('第一段\n第二段\n第三段\n第四段');expect(await page.locator('.bn-formatting-toolbar').getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed')).toBe('true')
  expect(await page.evaluate(()=>window.noteEditor.getBlock('untouched').type)).toBe('paragraph');if(type==='numberedListItem')expect(await page.locator('.bn-block-content[data-content-type="numberedListItem"]').evaluateAll(items=>items.map(el=>el.getAttribute('data-index')))).toEqual(['1','2','3','4'])
  await expect.poll(()=>page.evaluate(()=>window.noteSaved.blocks.filter(b=>b.type===window.noteEditor.document[0].type).length)).toBe(4);await page.evaluate(()=>window.reopen());expect(texts(await blocks(page))).toEqual(['第一段','第二段','第三段','第四段']);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('converts a nested selected parent and child without dropping either subtree or changing the next block at its start',async()=>{
 const {context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'first',type:'paragraph',content:'父一\n父二',children:[{id:'child',type:'paragraph',content:'子一\n子二',children:[{id:'grandchild',type:'paragraph',content:'孙段保留'}]}]},{id:'second',type:'paragraph',content:'下段不选'},{id:'untouched',type:'paragraph',content:'保留'}]));await expect.poll(()=>page.evaluate(()=>window.noteSaved.blocks[0].children.length)).toBe(1)
  await select(page,'first','second',0,0);await page.locator('.bn-formatting-toolbar').getByRole('button',{name:'有序列表',exact:true}).click()
  expect(texts(await blocks(page))).toEqual(['父一','父二','下段不选']);expect(await page.evaluate(()=>window.noteEditor.getBlock('second').type)).toBe('paragraph')
  expect(await page.evaluate(()=>window.noteEditor.document[1].children.map(b=>({type:b.type,text:b.content[0].text,children:b.children.map(c=>c.id)})))).toEqual([{type:'numberedListItem',text:'子一',children:[]},{type:'numberedListItem',text:'子二',children:['grandchild']}]);expect(await page.evaluate(()=>window.noteEditor.getBlock('grandchild').type)).toBe('numberedListItem');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('splits all hard breaks from the T menu in one undoable operation and preserves nested content',async()=>{
 const {context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.noteEditor.updateBlock('first',{children:[{id:'child',type:'paragraph',content:'子段保留'}]}));await expect.poll(()=>page.evaluate(()=>window.noteSaved.blocks[0].children.length)).toBe(1)
  await page.locator('[data-id="first"] .bn-block-content').first().hover();await page.getByRole('button',{name:'段落操作',exact:true}).click();await page.getByRole('menuitem',{name:'有序列表',exact:true}).click()
  const result=await blocks(page);expect(texts(result)).toEqual(['第一段','第二段','第三段','第四段']);expect(result.slice(0,3).map(b=>b.type)).toEqual(Array(3).fill('numberedListItem'));expect(result.flatMap(b=>b.children).map(b=>b.id)).toEqual(['child']);expect(result.at(-1).type).toBe('paragraph')
  await page.keyboard.press('ControlOrMeta+z');expect(texts(await blocks(page))).toEqual(['第一段\n第二段\n第三段','第四段']);expect(await page.evaluate(()=>window.noteEditor.getBlock('child').content[0].text)).toBe('子段保留');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('styles only selected logical lines and never turns automatic wrapping into list items',async()=>{
 const {context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'first',type:'paragraph',content:'前文\n选中的第二段\n后文'},{id:'second',type:'paragraph',content:'这个长段落只按窗口宽度自动折行。'.repeat(40)},{id:'untouched',type:'paragraph',content:'保留'}]));await expect.poll(()=>page.evaluate(()=>window.noteSaved.blocks[1].content[0].text.length)).toBeGreaterThan(200)
  await select(page,'first','first',3,8);await page.locator('.bn-formatting-toolbar').getByRole('button',{name:'有序列表',exact:true}).click();const result=await blocks(page);expect(texts(result).slice(0,3)).toEqual(['前文','选中的第二段','后文']);expect(result.map(b=>b.type)).toEqual(['paragraph','numberedListItem','paragraph','paragraph'])
  await select(page,'second','second');await page.locator('.bn-formatting-toolbar').getByRole('button',{name:'无序列表',exact:true}).click();expect((await blocks(page)).filter(b=>b.type==='bulletListItem')).toHaveLength(1);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('retains linked marks, blank lines and CRLF boundaries when the T menu formats plain text',async()=>{
 const {context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'first',type:'codeBlock',content:'第一行\r\n\r\n第三行\n末行'},{id:'second',type:'paragraph',content:[{type:'link',href:'https://example.test/retained',content:[{type:'text',text:'链接行',styles:{bold:true}}]},{type:'text',text:'\n另一行',styles:{}}]},{id:'untouched',type:'paragraph',content:'保留'}]));await expect.poll(()=>page.evaluate(()=>window.noteSaved.blocks[0].type)).toBe('codeBlock')
  await page.locator('[data-id="first"] .bn-block-content').first().hover();await page.getByRole('button',{name:'段落操作',exact:true}).click();await page.getByRole('menuitem',{name:'待办列表',exact:true}).click()
  const result=await page.evaluate(()=>window.noteEditor.document);expect(result.slice(0,4).map(b=>b.content.map(t=>t.text).join(''))).toEqual(['第一行','','第三行','末行']);expect(result.slice(0,4).map(b=>b.type)).toEqual(Array(4).fill('checkListItem'));expect(result.slice(0,4).map(b=>b.props.checked)).toEqual([false,false,false,false])
  await select(page,'second','second');await page.locator('.bn-formatting-toolbar').getByRole('button',{name:'无序列表',exact:true}).click();expect(await page.evaluate(()=>window.noteEditor.getBlock('second').content[0])).toEqual({type:'link',href:'https://example.test/retained',content:[{type:'text',text:'链接行',styles:{bold:true}}]});expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('preserves completed states outside a partial selection and restores the original task with one Undo',async()=>{
 const {context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'first',type:'checkListItem',props:{checked:true},content:'完成一\n完成二\n完成三'},{id:'second',type:'paragraph',content:'不变'},{id:'untouched',type:'paragraph',content:'保留'}]));await expect.poll(()=>page.evaluate(()=>window.noteSaved.blocks[0].props.checked)).toBe(true)
  await select(page,'first','first',0,3);await page.locator('.bn-formatting-toolbar').getByRole('button',{name:'待办列表',exact:true}).click();const result=await blocks(page);expect(texts(result).slice(0,3)).toEqual(['完成一','完成二','完成三']);expect(result.slice(0,3).map(b=>b.props.checked)).toEqual([true,true,true])
  await page.keyboard.press('ControlOrMeta+z');expect(texts(await blocks(page))).toEqual(['完成一\n完成二\n完成三','不变']);expect(await page.evaluate(()=>window.noteEditor.getBlock('first').props.checked)).toBe(true);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
