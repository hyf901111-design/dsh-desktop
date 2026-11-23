import {afterAll, beforeAll, expect, it, vi} from 'vitest'
import {build} from 'esbuild'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {installSpreadsheet} from '../src/main/spreadsheet/ipc'

vi.mock('electron', () => ({clipboard: {}, dialog: {}}))
const local = {id: 'a0000000-1111-4222-8333-abababababab', name: '国债曲线.xlsx'}
const received = {id: 'ab'.repeat(16), name: '价格.CSV', received: {owner: '同事', category: '数据分析'}}
const other = {id: 'b0000000-1111-4222-8333-abababababab', name: '说明.pdf'}
const sample = resolve('test/fixtures/treasury-rate-curve-december-2024.xlsx')
const key = {owner: 'user', sessionId: 'sheet'}
let browser, script, root

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'sherlock-sheet-drop-'))
  const {chromium} = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright')
  browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH})
  const result = await build({
    stdin: {resolveDir: process.cwd(), contents: `
      import {mountSpreadsheet} from './src/preload/spreadsheet/view'
      import {mountKnowledgePanels} from './src/preload/knowledge/panel'
      mountSpreadsheet(document,{request:window.requestSheet,subscribe:()=>()=>{}})
      mountKnowledgePanels(document,{snapshot:window.snapshot,received:window.received})
      document.addEventListener('dragover',e=>{if(e.target.closest('.ew-sheet'))e.preventDefault()})
      document.addEventListener('drop',e=>{if(e.target.closest('.ew-sheet'))window.otherDrops++})
      window.otherDrops=0`},
    bundle: true, write: false, platform: 'browser', format: 'iife', target: 'chrome140',
    define: {'process.env.NODE_ENV': '"production"'}, loader: {'.svg': 'dataurl'},
    plugins: [{name: 'raw-css', setup(builder) {
      builder.onResolve({filter: /\?raw$/}, async args => {
        const file = await builder.resolve(args.path.slice(0,-4), {resolveDir: args.resolveDir, kind: args.kind})
        return {path: file.path, namespace: 'raw-css'}
      })
      builder.onLoad({filter: /.*/, namespace: 'raw-css'}, async args => ({contents: await readFile(args.path,'utf8'), loader: 'text'}))
    }}]
  })
  script = result.outputFiles[0].text
}, 30000)
afterAll(async () => { await browser?.close(); if (root) await rm(root, {force:true,recursive:true}) })

function fixture(name) {
  const frame = {processId: 1, routingId: 2}, contents = {mainFrame: frame}
  const handlers = new Map()
  const context = {ownerAccountId: key.owner, sessionId: key.sessionId, generation: 'view', mode: 'spreadsheet'}
  const state = {writable: true, beforeRead: () => {}}
  const service = installSpreadsheet({
    ipcMain: {handle: (channel, fn) => handlers.set(channel,fn)}, dataPath: join(root,name),
    canWrite: () => state.writable, visible: () => context, getWindow: () => ({isDestroyed: () => false, webContents: contents}),
    knowledgeFile: async id => {
      state.beforeRead()
      if (id === local.id) return {document:local, path:sample}
      if (id === received.id) return {document:received, data:Buffer.from('代码,价格\n000001,12.5')}
      throw Error('File unavailable')
    }
  })
  const request = (action, input) => handlers.get('spreadsheet:request')({senderFrame:frame,sender:contents},action,input)
  return {request, store:service.store, context, state}
}

it('opens a local Excel file and a received CSV by mouse drag, then restores the original workbook from the menu', async () => {
  const {request,store,context} = fixture('mouse')
  const page = await browser.newPage({viewport:{width:1250,height:750}})
  page.setDefaultTimeout(6000)
  const row = id => page.locator('[data-knowledge-file-id="'+id+'"]')
  const drag = (source,target) => row(source).dragTo(page.locator(target).first(), {sourcePosition:{x:8,y:8}})
  try {
    await page.exposeFunction('requestSheet',request)
    const documentRow = doc => ({source:'upload',updatedAt:1,size:100,saved:false,starred:false,...doc})
    await page.exposeFunction('snapshot',()=>({folders:[],documents:[local,other].map(documentRow)}))
    await page.exposeFunction('received',()=>[documentRow(received)])
    await page.route('http://localhost/**',route=>route.fulfill({contentType:'text/html',body:`<style>body{display:flex;height:95vh}
      main{width:75%;display:flex;flex-direction:column;min-height:0}main>header{position:relative;z-index:5;flex:0 0 40px;display:flex;align-items:center;justify-content:flex-end}aside{width:24%}</style><main data-odyssey-page="spreadsheet">
      <header><div data-ework-spreadsheet-actions="sheet"></div></header><div data-ework-spreadsheet-view="sheet"></div></main>
      <aside id="odyssey-right-workspace-panel"><div data-knowledge-panel-host data-knowledge-panel-session="sheet"></div></aside>`}))
    await page.goto('http://localhost/')
    await page.addScriptTag({content:script})
    await page.locator('body[data-ework-spreadsheet-session=sheet]').waitFor()
    await drag(other.id,'.ew-sheet-empty')
    expect(await page.evaluate(()=>window.otherDrops)).toBe(1)
    expect(store.load(key).workbook).toBeNull()
    await drag(local.id,'.ew-sheet-empty')
    await page.locator('.ew-sheet-tab [data-value=sheet-2]').waitFor()
    await page.locator('.ew-sheet-grid canvas:visible').first().waitFor()
    const original = store.load(key).workbook
    expect(original.sheets['sheet-1'].cellData[21][3].v).toBe(4.58)
    await page.locator('.knowledge-panel-location-label').click()
    await page.getByRole('button',{name:'他人共享',exact:true}).click()
    await page.locator('.knowledge-panel-directory').filter({hasText:'全部文件'}).click()
    const lock = page.locator('[data-ework-spreadsheet-actions] [data-action=view-mode]')
    await lock.click()
    await drag(received.id,'.ew-sheet-grid canvas:visible')
    await page.waitForFunction(()=>document.querySelector('.ew-sheet-status-text')?.textContent.includes('只读'))
    expect(store.load(key).workbook.id).toBe(original.id)
    await lock.click()
    await page.locator('[data-field=formula]').fill('拖入前的编辑')
    await drag(received.id,'.ew-sheet-grid canvas:visible')
    await page.waitForFunction(()=>document.querySelector('[data-action=sheet]')?.textContent==='Sheet1')
    expect(store.load(key).workbook.sheets['sheet-1'].cellData[1]).toMatchObject({0:{v:'000001'},1:{v:12.5}})
    await page.locator('[data-ework-spreadsheet-actions] [data-value=book]').click()
    await page.locator('[data-value=recent-books]').click()
    await page.getByRole('menuitemradio',{name:local.name}).click()
    await page.locator('.ew-sheet-tab [data-value=sheet-2]').waitFor()
    expect(store.load(key).workbook.id).toBe(original.id)
    expect(store.load(key).workbook.sheets['sheet-1'].cellData[0][0].v).toBe('拖入前的编辑')
    expect(await page.evaluate(()=>window.otherDrops)).toBe(1)
    await page.locator('[data-knowledge-panel-host]').evaluate(host=>{host.dataset.knowledgePanelSession='different'})
    await drag(received.id,'.ew-sheet-grid canvas:visible')
    expect(store.load(key).workbook.id).toBe(original.id)
    expect(await page.evaluate(()=>window.otherDrops)).toBe(2)
    // The conversation slot may reuse its host element when switching sessions.
    context.sessionId='different'
    await page.locator('[data-ework-spreadsheet-view]').evaluate(host=>{host.dataset.eworkSpreadsheetView='different'})
    await page.locator('body[data-ework-spreadsheet-session=different] .ew-sheet-empty').waitFor()
    await drag(received.id,'.ew-sheet-empty')
    await page.locator('.ew-sheet-grid canvas:visible').first().waitFor()
    expect(store.load({...key,sessionId:'different'}).workbook.name).toBe(received.name)
    expect(store.load(key).workbook.id).toBe(original.id)
  } finally { await page.close() }
}, 30000)

it('checks the source metadata, active session, lock, and revision before committing', async () => {
  const {request,store,context,state} = fixture('guards')
  const input = {...key,generation:context.generation,revision:0,id:received.id,label:received.name}
  const drop = fields => request('import-knowledge',{...input,...fields})
  await expect(drop({label:'wrong.xlsx'})).rejects.toThrow('文件已变化')
  await expect(drop({id:'invalid'})).rejects.toThrow('知识库')
  state.beforeRead=()=>{context.sessionId='other'}
  await expect(drop()).rejects.toThrow('已切换')
  context.sessionId=key.sessionId
  state.beforeRead=()=>{state.writable=false}
  await expect(drop()).rejects.toThrow('只读')
  expect(store.load(key)).toMatchObject({revision:0,workbook:null})
  state.writable=true
  state.beforeRead=()=>{}
  await request('create',{...input,name:'当前编辑'})
  await expect(drop()).rejects.toThrow('工作簿已变化')
  expect(store.load(key).workbook.name).toBe('当前编辑')
})
