import {describe,it,expect} from 'vitest'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
const contract=await import('../packages/dsh-research-task-runtime/conversation-component-contract.js').catch(()=>null)
const table={version:1,type:'table',title:'模拟表格',columns:['名称','数量'],rows:[['模拟记录',17]]}
const quote={version:1,type:'financial-widget',widget:'quote',title:'模拟测试行情配置',symbols:[{code:'AAPL',market:'US',name:'模拟测试标的'}]}
const normal=args=>{expect(contract,'共享合同尚未实现').not.toBeNull();return contract.normalizeConversationComponentArtifact(args)}
describe('conversation component shared contract (all records are simulated fixtures)',()=>{
 it('normalizes a complete table without host identity or IDs',()=>{
  const value=normal({artifact:table})
  expect(Object.keys(value).sort()).toEqual(['containerSpec','preferredSize','provenance','readableText','title'])
  expect(value.title).toBe(table.title);expect(value.containerSpec.type).toBe('table')
  expect(value.readableText).toContain('模拟记录');expect(value.preferredSize).toEqual({width:656,height:352})
  expect(value.provenance).toEqual({sourceNames:[],sourceState:'unspecified',refreshKind:'snapshot'})
  expect(value).not.toHaveProperty('id');expect(value).not.toHaveProperty('createdAt')
 })
 it('retains chart template model, original units, source and data time',()=>{
  const artifact={version:1,type:'chart',title:'模拟趋势',variant:'line',labels:['模拟一','模拟二'],series:[{name:'模拟量',values:[12,18]}],unit:'件',asOf:'模拟日期 2026-10-24',note:'来源与说明：模拟来源'}
  const value=normal({artifact,title:'独立标题'})
  expect(value.title).toBe('独立标题');expect(readTemplateModel(value.containerSpec)?.data).toMatchObject(artifact)
  expect(value.readableText).toContain('模拟量');expect(value.readableText).toContain('件')
  expect(value.provenance).toMatchObject({sourceNames:[],sourceState:'unspecified',dataAsOf:artifact.asOf,refreshKind:'snapshot'})
  expect(value.provenance).not.toHaveProperty('fetchedAt')
 })
 it('preserves explicitly provided template source names without marking them observed',()=>{
  const artifact={version:1,type:'market',variant:'table',title:'模拟来源表',asOf:'模拟日期',columns:['名称'],rows:[['模拟记录']],sources:[{label:'模拟来源',url:'https://example.com/simulated'}]}
  const value=normal({artifact});expect(readTemplateModel(value.containerSpec)?.data).toMatchObject(artifact)
  expect(value.provenance).toEqual({sourceNames:['模拟来源'],sourceState:'provided',dataAsOf:'模拟日期',refreshKind:'snapshot'})
 })
 it('fills native defaults without inventing prices, sources or fetch times',()=>{
  const value=normal({artifact:quote})
  expect(value.containerSpec).toMatchObject({...quote,period:'1d',adjustment:'none',indicators:['MA','VOL','MACD']})
  expect(value.preferredSize).toEqual({width:716,height:600})
  expect(value.provenance).toEqual({sourceNames:[],sourceState:'unspecified',refreshKind:'native'})
  expect(quote).not.toHaveProperty('period')
 })
 it.each(['price','prices','bars','ohlc','script','authorization'])('rejects model native %s data',key=>expect(()=>normal({artifact:{...quote,[key]:[]}})).toThrow())
 it.each(['linkedWatchlistId','linkedSourceId'])('rejects canvas link %s during create',key=>expect(()=>normal({artifact:{...quote,[key]:'canvas-node'}})).toThrow())
 it.each(['owner','ownerAccountId','sessionId','turnId','mode','prompt','recipe','identity','ipc'])('rejects model top-level %s',key=>expect(()=>normal({artifact:table,[key]:'forged'})).toThrow())
 it('rejects invalid, excessive and non-JSON inputs with no mutation',()=>{
  for(const args of [null,{},[],{artifact:{}},{artifact:{...table,sessionId:'forged'}},{artifact:table,title:''},{artifact:table,title:'x'.repeat(121)},{artifact:{version:1,type:'markdown',title:'模拟',content:'字'.repeat(360000)}}])expect(()=>normal(args)).toThrow()
  const cyclic={artifact:table};cyclic.loop=cyclic;expect(()=>normal(cyclic)).toThrow()
  expect(()=>normal({artifact:{...table,rows:[[NaN]]}})).toThrow()
 })
 it.each(['files','gallery','calendar-tool','web','iframe','audio','youtube'])('explicitly rejects the unadapted %s surface',type=>expect(()=>normal({artifact:{version:1,type,title:'模拟拒绝'}})).toThrow(/对话|类型|支持/))
 it('keeps derived title/text while dropping node identity and refusing extra source fields',()=>{
  const artifact={version:1,type:'summary',title:'模拟摘要',content:'模拟结论',source:{title:'模拟原文',text:'模拟完整原文',nodeId:'canvas-source'}}
  expect(normal({artifact}).containerSpec.source).toEqual({title:'模拟原文',text:'模拟完整原文'})
  expect(()=>normal({artifact:{...artifact,source:{...artifact.source,path:'/private/file'}}})).toThrow()
 })
 it('extracts readable HTML without executable script content',()=>{
  const value=normal({artifact:{version:1,type:'html',title:'模拟HTML',html:'<p>模拟正文</p><script>SECRET_SCRIPT()</script>'}})
  expect(value.readableText).toBe('模拟正文');expect(value.readableText).not.toContain('SECRET_SCRIPT')
 })
 it('canonicalizes key order recursively and preserves array order and values',()=>{
  normal({artifact:table})
  const a={artifact:{...table,rows:[['模拟记录',17]]},title:'模拟标题'}
  const b={title:'模拟标题',artifact:{rows:[['模拟记录',17]],columns:['名称','数量'],title:table.title,type:'table',version:1}}
  expect(contract.canonicalConversationComponentInput(a)).toBe(contract.canonicalConversationComponentInput(b))
  expect(JSON.parse(contract.canonicalConversationComponentInput(a))).toEqual(a)
  expect(contract.canonicalConversationComponentInput({...a,artifact:{...table,rows:[['模拟记录',18]]}})).not.toBe(contract.canonicalConversationComponentInput(a))
 })
 it('strictly parses ready manifests and references with self-contained functions',()=>{
  normal({artifact:table})
  const manifest={version:1,kind:'conversation-component',componentId:'c',sessionId:'s',turnId:'t',requestId:'r',status:'ready'}
  const reference={version:1,kind:'conversation-component',componentId:'c',sessionId:'s',revision:1,title:'模拟标题'}
  for(const [fn,value] of [[contract.parseConversationComponentManifest,manifest],[contract.parseConversationComponentReference,reference]]){
   expect(fn(value)).toEqual(value);expect(fn({...value,owner:'forged'})).toBeNull();expect(fn({...value,version:2})).toBeNull();expect(fn({...value,componentId:''})).toBeNull()
   expect(Function('return ('+fn.toString()+')')()(value)).toEqual(value)
  }
  expect(contract.parseConversationComponentManifest({...manifest,status:'generating'})).toBeNull()
  expect(contract.parseConversationComponentReference({...reference,revision:0})).toBeNull()
 })
 it('detaches clipboard/library identity and links while retaining native configuration',()=>{
  const value=normal({artifact:quote}),node={id:'c',kind:'generated-container',x:0,y:0,width:716,height:600,title:value.title,containerSpec:{...value.containerSpec,linkedWatchlistId:'foreign'},generationStatus:'completed',ownerAccountId:'private',sessionId:'s',turnId:'t',messageId:'m',requestId:'r',sourceNodeIds:['foreign'],generationSources:[{id:'foreign'}],taskId:'worker'}
  const detached=contract.detachConversationComponentNode(node)
  expect(detached).toMatchObject({id:'c',kind:'generated-container',x:0,y:0,containerSpec:{symbols:quote.symbols,period:'1d'}})
  for(const key of ['ownerAccountId','sessionId','turnId','messageId','requestId','sourceNodeIds','generationSources','taskId'])expect(detached).not.toHaveProperty(key)
  expect(detached.containerSpec).not.toHaveProperty('linkedWatchlistId');expect(node.containerSpec).toHaveProperty('linkedWatchlistId')
  expect(()=>contract.detachConversationComponentNode({...node,containerSpec:{...node.containerSpec,prices:[17]}})).toThrow()
 })
})
it('freezes the effective linked-news query before detaching and refuses a lost source',()=>{
 const news={version:1,type:'financial-widget',widget:'news',title:'模拟证券新闻',symbols:quote.symbols,period:'1d',adjustment:'none',indicators:['MA','VOL','MACD'],market:'all',query:'',linkedSourceId:'quote-node'}
 const node={id:'news',kind:'generated-container',x:0,y:0,containerSpec:news}
 expect(contract.detachConversationComponentNode(node).containerSpec).toMatchObject({query:'模拟测试标的',symbols:quote.symbols})
 expect(()=>contract.detachConversationComponentNode({...node,containerSpec:{...news,symbols:[]}})).toThrow(/查询|来源|标的/)
 const {linkedSourceId,...independent}=news
 expect(contract.detachConversationComponentNode({...node,containerSpec:{...independent,symbols:[]}}).containerSpec.query).toBe('')
})
