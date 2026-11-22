import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {runInNewContext} from 'node:vm'
import {afterEach, expect, it, vi} from 'vitest'
import {createSourceFile, forEachChild, isFunctionDeclaration, isMethodDeclaration, ScriptKind, ScriptTarget, type Node} from 'typescript'
import {OfficeSessionAccess} from '../src/main/state/office-session-access'
import {NotesStore} from '../src/main/notes/store'
import {SpreadsheetStore} from '../src/main/spreadsheet/store'
import {blankWorkbook} from '../src/shared/spreadsheet/workbook'
import {blankDeck, PresentationStore} from '../src/main/presentation/store'
import {patchOfficeSessionClient, patchOfficeSessionHost, patchOfficeProjectionCache} from '../scripts/lib/office-session-scope.mjs'
import {patchOfficeCatalogJson,patchOfficeCatalogTable,patchOfficeCatalogTransport} from '../scripts/lib/office-catalog-checkpoints.mjs'
import {sidebarSearchResults} from '../src/preload/sidebar-session-search'

const client = patchOfficeSessionClient(readFileSync('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'))
const host = patchOfficeSessionHost(readFileSync('node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js','utf8'))
function definitions(source: string, names: string[]) {
  const syntax = createSourceFile('native.js',source,ScriptTarget.Latest,false,ScriptKind.JS)
  const found = new Map<string,string>()
  function visit(node: Node) {
    if ((isFunctionDeclaration(node) || isMethodDeclaration(node)) && node.name) {
      const name = node.name.getText(syntax)
      if (names.includes(name) && !found.has(name)) found.set(name,node.getText(syntax))
    }
    forEachChild(node, visit)
  }
  visit(syntax)
  return names.map(name=>found.get(name)).join('\n')
}
const metadata = runInNewContext(definitions(host,['foldOfficeScope','applySessionListMetadata','sessionListMetadata']) + ';sessionListMetadata')
const clientMethods = definitions(client,['projectList','open','officeAccessNotice','officeSessionHidden'])
const dirs: string[] = []
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true})})

it('uses native replay and the real sidebar projection for legacy guest notes, workbooks and decks across account changes', () => {
  const dir = mkdtempSync(join(tmpdir(),'office-scope-')); dirs.push(dir)
  let owner: string | undefined = 'local'
  const notes = new NotesStore(dir), books = new SpreadsheetStore(dir), decks = new PresentationStore(dir)
  try {
    const access = new OfficeSessionAccess(()=>owner,(id,sessionId,mode) => mode === 'note' ? notes.hasRecord(id,sessionId)
      : mode === 'spreadsheet' ? books.hasRecord({owner:id,sessionId}) : decks.hasRecord({owner:id,sessionId}),
      () => ['alice'], (owner,id) => notes.load(owner,id).saved.title)
    const guest = access.identity()
    const note = {title:'访客纪要',blocks:[{id:'p',type:'paragraph',content:'正文'}],yjs:''}
    notes.draft('local','n','unsaved',0,note)
    notes.save('alice','a',0,{...note,title:'账号私有'})
    notes.save('local','collision',0,{...note,title:'访客原稿'})
    notes.save('alice','collision',0,{...note,title:'账户原稿'})
    const book = blankWorkbook('b','测算表')
    book.sheets[book.sheetOrder[0]!]!.cellData={0:{0:{f:'=SUM(1,2)',v:3}}}
    books.create({owner:'local',sessionId:'s'},0,book)
    const deck = blankDeck('业绩汇报')
    deck.slides.push({id:'p2',elements:[],remark:'第二页备注'})
    decks.save({owner:'local',sessionId:'p'},0,deck,true)
    const rows = ([
      ['n','访客纪要','workspace-note/edited'], ['s','测算表','workspace-spreadsheet/edited'],
      ['p','业绩汇报','workspace-presentation/edited'], ['a','账号私有','workspace-note/edited'],
      ['collision','历史全局标题','workspace-note/edited'], ['blank','新演示','workspace-presentation/created'], ['chat','普通会话','turn/start']
    ] as const).map(([sessionId,title,type])=>({sessionId,title,projectionValues:{sessionListMetadata:metadata([{type,data:type.endsWith('created')?{officeOwner:guest}:{}}])}}))
    let selected: string | undefined = 'n', shown: any
    const notice = vi.fn()
    const bridge = {check:(rows:unknown)=>access.check(rows)}
    const methods = runInNewContext('new (class { '+clientMethods+' })()',{
      window:{dshDesktop:{officeSessions:bridge}},document:{dispatchEvent:notice},CustomEvent,queueMicrotask,
      displayTitleOf:(title:string)=>title
    })
    Object.assign(methods,{manager:{getListSnapshot:()=>({items:rows,current:selected,subagentsByParent:{}}),
      get selected(){return selected},select:(id:string)=>{selected=id},clearSelection:()=>{selected=undefined}},
      selection:{getSnapshot:()=>({}),set(){}},panelLeases:new Map(),officeCache:new Map(),officeHidden:new Map(),
      list:{set:(value:any)=>{shown=value}},pruneScopes(){}})
    const refresh = () => { methods.officeCache.clear();methods.projectList() }
    refresh()
    expect(shown.ids).toEqual(['n','s','p','collision','blank','chat'])
    expect(shown.byId.collision.title).toBe('访客原稿')
    owner='alice';refresh()
    expect(shown.ids).toEqual(['a','collision','chat'])
    expect(shown.current).toBeUndefined()
    expect(shown.byId.collision.title).toBe('账户原稿')
    expect(sidebarSearchResults({boards:[],favorites:[]} as any,shown.byId,[],'访客')).toEqual([])
    expect(()=>access.assert('p','presentation')).toThrow('退出当前账号')
    methods.open('s')
    expect(notice).toHaveBeenCalledWith(expect.objectContaining({detail:'guest'}))
    owner='bob';refresh()
    expect(shown.ids).toEqual(['chat'])
    expect(()=>access.assert('a','note')).toThrow('创建文档时使用的账号')
    owner='local';refresh()
    expect(shown.ids).toContain('p')
    expect(notes.load('local','n').draft?.title).toBe('访客纪要')
    expect(books.load({owner:'local',sessionId:'s'}).workbook?.sheets[book.sheetOrder[0]!]?.cellData[0]?.[0]?.f).toBe('=SUM(1,2)')
    expect(decks.read({owner:'local',sessionId:'p'}).deck?.slides[1]?.remark).toBe('第二页备注')
    expect(notes.load('alice','a').saved.title).toBe('账号私有')
  } finally { decks.close() }
})

it('rebuilds a legacy cold checkpoint using its listed artifact once, including a replay retry', async () => {
  const source = patchOfficeProjectionCache(readFileSync('node_modules/@deepseek-ai/dsh-session-projection-cache/lib/index.js','utf8'))
  const meta = {id:'old',createdAt:1,cwd:'/project'}
  const events = [{seq:0,type:'workspace-note/edited',data:{}}]
  const readListEvents = vi.fn(async () => ({meta,events}))
  const readFrom = vi.fn(() => {throw Error('Unexpected inventory scan')})
  const snapshot = {values:{sessionListMetadata:metadata(events)}}
  let restores = 0
  const method = runInNewContext('new (class {'+definitions(source,['coldSnapshot'])+'})()',{
    identityOf:()=>'id',identityMatches:()=>true
  })
  Object.assign(method,{requireTable:()=>new Map(),putSoft:vi.fn(),ctx:{
    sessionPersistence:{readListEvents, readFrom},
    sessionProjections:{restoreFloor:()=>1,restore:(_cache:unknown, tail:any[])=>{
      if (!restores++) throw Error('Stale checkpoint')
      expect(tail).toEqual(events)
      return {snapshot,checkpoint:{}}
    }}
  }})
  expect(await method.coldSnapshot('old',undefined,meta)).toBe(snapshot)
  expect(readListEvents).toHaveBeenCalledOnce()
  expect(readFrom).not.toHaveBeenCalled()
  expect(method.putSoft).toHaveBeenCalledOnce()
})

it('finds historical deck titles before opening while preserving an explicit sidebar rename, including the same placeholder', () => {
  const events = [{type:'session/title',seq:1,data:{title:'新演示'}}, {type:'workspace-presentation/created',seq:2,data:{titleSeq:1}},
    {type:'workspace-presentation/edited',seq:3,data:{}}]
  const rows = [
    {sessionId:'legacy',title:'新演示',projectionValues:{sessionListMetadata:metadata(events)}},
    {sessionId:'custom',title:'新演示',projectionValues:{sessionListMetadata:metadata([...events,{type:'session/title',seq:4,data:{title:'新演示'}}])}},
    {sessionId:'named',title:'项目留档',projectionValues:{sessionListMetadata:metadata([...events,{type:'session/title',seq:4,data:{title:'项目留档'}}])}},
    {sessionId:'empty',title:'',projectionValues:{sessionListMetadata:metadata([events[2]])}}
  ]
  const dir = mkdtempSync(join(tmpdir(),'office-deck-')); dirs.push(dir)
  const store = new PresentationStore(dir)
  try {
    for (const {sessionId} of rows) store.save({owner:'local',sessionId},0,blankDeck('QA季度回顾'),true)
    const access = new OfficeSessionAccess(()=>'local',(owner,sessionId,mode)=>mode==='presentation' && store.hasRecord({owner,sessionId}),
      ()=>[],(owner,sessionId)=>store.activeTitle({owner,sessionId}))
    let shown: any
    const methods = runInNewContext('new (class { '+clientMethods+' })()',{
      window:{dshDesktop:{officeSessions:{check:(rows:unknown)=>access.check(rows)}}},displayTitleOf:(title:string)=>title
    })
    Object.assign(methods,{manager:{getListSnapshot:()=>({items:rows,subagentsByParent:{}})},selection:{getSnapshot:()=>({})},
      panelLeases:new Map(),officeCache:new Map(),officeHidden:new Map(),list:{set:(value:any)=>{shown=value}},pruneScopes(){}})
    methods.projectList()
    expect(shown.byId.custom.title).toBe('新演示')
    expect(shown.byId.named.title).toBe('项目留档')
    expect(sidebarSearchResults({boards:[],favorites:[]} as any,shown.byId,[],'QA季度回顾').map(i=>i.sessionId)).toEqual(['empty','legacy'])
  } finally {store.close()}
})

it('replays legacy list metadata once per journal and saves the entire catalog in one atomic publication, retaining concurrent edits', async () => {
  const native = (pkg: string) => readFileSync('node_modules/@deepseek-ai/'+pkg+'/lib/index.js','utf8')
  const identityOf = ({createdAt,cwd}:any) => ({createdAt,cwd})
  const identityMatches = (a:any,b:any) => a.createdAt===b.createdAt && a.cwd===b.cwd
  const unit = runInNewContext('new (class {'+definitions(patchOfficeCatalogJson(native('dsh-storage-json')),['putRecords'])+'})()')
  const disk = new Map<string,any>()
  const publish = vi.fn(async()=>{})
  Object.assign(unit,{assertOpen(){},records:()=>unit.state.tables.get('sessions'),state:{tables:new Map([['sessions',disk]])},publish})
  const table = runInNewContext('new (class {'+definitions(patchOfficeCatalogTable(native('dsh-storage-domain')),['putUnchanged'])+'})()')
  Object.assign(table,{get:(id:string)=>table.records.get(id),records:new Map(),tableName:'sessions',host:{enqueue:(op:any)=>op(),unit},emitPut:vi.fn()})
  const log = [{seq:0,type:'session/title',data:{title:'新演示'}},{seq:1,type:'workspace-presentation/created',data:{titleSeq:0}},
    {seq:2,type:'workspace-presentation/edited',data:{}}]
  const readListEvents = vi.fn(async (meta:any)=>({meta,events:log}))
  const runtime = runInNewContext('new (class {'+definitions(patchOfficeProjectionCache(native('dsh-session-projection-cache')),['listSnapshot','saveListCheckpoints'])+'})()', {identityOf, identityMatches})
  Object.assign(runtime,{ctx:{sessionPersistence:{readListEvents}},requireTable:()=>table,cachedSnapshot:()=>({asOfSeq:1,values:{other:'keep'}})})
  const pending:any[]=[]
  for (let i=0;i<128;i++) {
    const meta = {id:'old-'+i,createdAt:1,cwd:'/qa'}
    const previous = {identity:identityOf(meta),rows:{other:{ver:7,seq:1,val:'keep'}}}
    table.records.set(meta.id,previous);disk.set(meta.id,previous)
    const result = await runtime.listSnapshot(meta,undefined,metadata,pending)
    expect(result.values).toMatchObject({title:'新演示',other:'keep',sessionListMetadata:{office:{presentation:'legacy'},presentationTitleManaged:true}})
  }
  expect(readListEvents).toHaveBeenCalledTimes(128)
  expect(publish).not.toHaveBeenCalled()
  const live = {rows:{title:{val:'刚刚在侧栏更名'}}}
  table.records.set('old-0',live);disk.set('old-0',live)
  await runtime.saveListCheckpoints(pending)
  expect(publish).toHaveBeenCalledOnce()
  expect(unit.records('sessions').get('old-0')).toBe(live)
  expect(unit.records('sessions').get('old-1').rows).toMatchObject({other:{ver:7,seq:1,val:'keep'},sessionListMetadata:{ver:3,seq:2},title:{ver:1,seq:2,val:'新演示'}})
  const before=unit.records('sessions')
  publish.mockRejectedValueOnce(Error('Disk not writable'))
  await expect(table.putUnchanged([{id:'next',original:undefined,record:{}}])).rejects.toThrow('Disk not writable')
  expect(unit.records('sessions')).toBe(before)
  expect(table.records.has('next')).toBe(false)
})

it('bounds full catalog upgrades separately while preserving external cancellation and fast identity probes', () => {
  const method = 'list: (payload, signal) => this.callUnary("session.list", payload, signal),'
  const capture = vi.fn()
  const timeout = vi.fn(() => new AbortController().signal)
  const source = patchOfficeCatalogTransport('class Client { timeoutMs=30000; callUnary=capture; sessions={'+method+'} }; new Client()')
  const api = runInNewContext(source,{capture,AbortSignal:{timeout,any:AbortSignal.any}})
  const controller = new AbortController()
  api.sessions.list({},controller.signal)
  expect(timeout).toHaveBeenCalledWith(120000)
  const signal = capture.mock.calls[0]![2]
  controller.abort()
  expect(signal.aborted).toBe(true)
  api.sessions.list({identitySessionId:'s'},controller.signal)
  expect(capture.mock.calls[1]).toEqual(['session.list',{identitySessionId:'s'},controller.signal])
})
