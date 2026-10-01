import {it,expect,vi} from 'vitest'
const rssModule=await import('../src/main/state/research-rss') as any
const rssXml='<?xml version="1.0"?><rss version="2.0"><channel><title>实际源</title><lastBuildDate>Thu, 01 Oct 2026 10:00:00 GMT</lastBuildDate><item><guid isPermaLink="false">original-01</guid><title>同名</title><link>https://example.com/one</link><description><![CDATA[<p>原值 0、-5 &amp; 未提供</p>]]></description></item><item><guid>original-02</guid><title>同名</title><pubDate>Wed, 30 Sep 2026 09:00:00 GMT</pubDate></item></channel></rss>'
it('解析RSS保留原ID与发布时间缺失，抓取时间不能补成发布时间',()=>{
 expect(rssModule.parseRssFeed).toBeTypeOf('function')
 const f=rssModule.parseRssFeed(rssXml,'https://example.com/rss','f','2026-10-01T12:00:00Z')
 expect(f.entries).toHaveLength(2);expect(f.entries[0]).toEqual({id:'original-01',title:'同名',url:'https://example.com/one',summary:'<p>原值 0、-5 &amp; 未提供</p>',publishedAt:null,updatedAt:null})
 expect(f.entries[1].publishedAt).toBe('Wed, 30 Sep 2026 09:00:00 GMT');expect(f.entries[1].url).toBeNull();expect(f.fetchedAt).toBe('2026-10-01T12:00:00Z')
})
it('Atom使用原命名空间、备用原文链接与独立published/updated',()=>{
 expect(rssModule.parseRssFeed).toBeTypeOf('function')
 const xml='<feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://example.com/"><title>Atom源</title><entry><id>urn:uuid:original</id><title>原标题</title><link rel="self" href="internal.xml"/><link rel="alternate" href="article"/><updated>2026-10-01T10:00:00Z</updated><summary>完整摘要</summary></entry></feed>'
 expect(rssModule.parseRssFeed(xml,'https://example.com/feed','f','now').entries[0]).toEqual({id:'urn:uuid:original',title:'原标题',url:'https://example.com/article',summary:'完整摘要',publishedAt:null,updatedAt:'2026-10-01T10:00:00Z'})
 expect(()=>rssModule.parseRssFeed('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+rssXml,'https://example.com/rss','f','now')).toThrow()
 expect(()=>rssModule.parseRssFeed('<rss><channel><item>broken</channel></rss>','https://example.com/rss','f','now')).toThrow()
})
it('拒绝内网、环回、凭据URL、重定向到内网和过大的源',async()=>{
 expect(rssModule.readPublicRssFeed).toBeTypeOf('function')
 for(const url of ['http://127.0.0.1/rss','http://[::1]/rss','http://169.254.169.254/rss','https://user:secret@example.com/rss'])await expect(rssModule.readPublicRssFeed(url,'f')).rejects.toThrow()
 const request=vi.fn(async()=>({status:302,headers:{location:'http://127.0.0.1/rss'},body:Buffer.alloc(0)}))
 await expect(rssModule.readPublicRssFeed('https://example.com/rss','f',{lookup:async()=>[{address:'93.184.216.34',family:4}],request})).rejects.toThrow();expect(request).toHaveBeenCalledOnce()
 await expect(rssModule.readPublicRssFeed('https://example.com/rss','f',{lookup:async()=>[{address:'10.0.0.1',family:4}],request})).rejects.toThrow();expect(request).toHaveBeenCalledOnce()
})
it('DNS和响应都受超时限制，并拒绝超大响应',async()=>{
 const dependencies={lookup:async()=>[{address:'93.184.216.34',family:4}],request:async()=>({status:200,headers:{},body:Buffer.alloc(512001)})}
 await expect(rssModule.readPublicRssFeed('https://example.com/rss','f',dependencies)).rejects.toThrow('512KB')
 vi.useFakeTimers()
 try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('读取超时')),15000);const promise=rssModule.readPublicRssFeed('https://example.com/rss','f',{lookup:()=>new Promise(()=>{}),signal:controller.signal});const result=expect(promise).rejects.toThrow();await vi.advanceTimersByTimeAsync(15001);await result;clearTimeout(timer)}finally{vi.useRealTimers()}
})
it('RSS服务只更新自己的节点，失败保留来源原条目与抓取时间，并拒绝只读及共享写入',async()=>{
 const {acceptArtifactOutput}=await import('../packages/dsh-research-task-runtime/artifact-output.js'),{readTemplateModel}=await import('../packages/dsh-research-task-runtime/component-template-registry.js')
 const feed=rssModule.parseRssFeed(rssXml,'https://example.com/rss','original-feed','2026-10-01T12:00:00Z'),original={version:1,type:'rss',title:'订阅',asOf:'来源记录',feeds:[feed]},spec=JSON.parse(acceptArtifactOutput(JSON.stringify(original))!)
 let writable=true,shared=false;const execute=vi.fn(async(query:any)=>query.method==='inspect'?{writable,revision:'exact-r1',nodes:[{id:'own-node',capabilities:{fields:{containerSpec:true}},content:{containerSpec:spec}}]}:{status:'applied'}),readFeed=vi.fn(async()=>{throw Error('HTTP 503')})
 const service=rssModule.createResearchRssService({canvas:{bind:vi.fn(),execute} as any,isShared:()=>shared,readFeed})
 await service.request({sessionId:'own-session',nodeId:'own-node',action:'refresh'})
 const apply=execute.mock.calls.find(([q])=>q.method==='apply')![0]
 expect(apply).toMatchObject({sessionId:'own-session',source:'component-data-refresh',args:{revision:'exact-r1',changes:[{id:'own-node',op:'update'}]}})
 const changed=readTemplateModel(apply.args.changes[0].fields.containerSpec)!.data as any
 expect(changed.feeds[0]).toEqual({...feed,error:'HTTP 503'});expect(apply.args.changes).toHaveLength(1)
 readFeed.mockClear();execute.mockClear();writable=false;await expect(service.request({sessionId:'own-session',nodeId:'own-node',action:'refresh'})).rejects.toThrow('可编辑');expect(readFeed).not.toHaveBeenCalled()
 writable=true;shared=true;execute.mockClear();await expect(service.request({sessionId:'own-session',nodeId:'own-node',action:'add',url:'https://example.com/new'})).rejects.toThrow('共享');expect(execute).not.toHaveBeenCalled()
})
it('订阅读取串行保护与版本冲突保留数据，移除未知来源不会请求网络',async()=>{
 const {acceptArtifactOutput}=await import('../packages/dsh-research-task-runtime/artifact-output.js')
 const feed=rssModule.parseRssFeed(rssXml,'https://example.com/rss','original-feed','2026-10-01T12:00:00Z'),spec=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'rss',title:'订阅',asOf:'来源',feeds:[feed]}))!)
 let release:any;const readFeed=vi.fn(()=>new Promise(r=>{release=r})),execute=vi.fn(async(query:any)=>{if(query.method==='apply')throw Error('画布版本已变化');return {writable:true,revision:'r1',nodes:[{id:'own-node',capabilities:{fields:{containerSpec:true}},content:{containerSpec:spec}}]}})
 const service=rssModule.createResearchRssService({canvas:{bind:vi.fn(),execute} as any,isShared:()=>false,readFeed}),value={sessionId:'own-session',nodeId:'own-node',action:'refresh'}
 const pending=service.request(value);await Promise.resolve();await expect(service.request(value)).rejects.toThrow('正在读取');release(feed);await expect(pending).rejects.toThrow('版本')
 await expect(service.request({...value,action:'remove',feedId:'missing'})).rejects.toThrow('已变化');expect(readFeed).toHaveBeenCalledOnce()
})
