import {readFileSync} from 'node:fs'
import {expect,it,vi} from 'vitest'
import {componentSourceCollector,componentSnapshotEvidence,restoreSnapshotFeedHeadlines} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

const multiDateCall={url:'https://np-anotice-stock.eastmoney.com/api/security/ann?stock_list=600011',data:{data:{list:[{
 art_code:'AN202610201830720785',display_time:'2026-10-20 17:02:00',notice_date:'2026-10-21 00:00:00',
 title:'华能国际:华能国际关于第十四期超短期融资券发行的公告',codes:[{short_name:'华能国际',stock_code:'600011'}]
}]}}};
const multiDateFeed={version:1,type:'news',title:'公告跟踪',note:'本次取得的公开公告快照',items:[{
 title:'华能国际(600011)：关于第十四期超短期融资券发行的公告',summary:'已取得公告，保留原披露日期。',date:'2026-10-21',url:'https://data.eastmoney.com/notices/detail/600011/AN202610201830720785.html'
}]};

it('retains distinct observed announcement dates and restores the original headline from its verified record',()=>{
 const records=collect([multiDateCall]),original=JSON.stringify(multiDateFeed),restored=JSON.parse(restoreSnapshotFeedHeadlines(original,records));
 expect(restored.items[0].title).toBe('华能国际:华能国际关于第十四期超短期融资券发行的公告');
 expect(restored.items[0].date).toBe('2026-10-21');
 expect(restored.items[0].publisher).toBe('华能国际（600011）');
 expect(restored.items[0].summary).toBe(multiDateFeed.items[0].summary);
 expect(restored.note).toBe(multiDateFeed.note);expect(JSON.stringify(multiDateFeed)).toBe(original);
 expect(proof(restored,records)).toBe(true);
 expect(proof({...restored,items:[{...restored.items[0],date:'2026-10-20'}]},records)).toBe(true);
});

it.each(['unobserved-date','unobserved-id','other-host','failed-fetch','ambiguous-record'])('does not restore a headline from %s evidence',mode=>{
 const feed=structuredClone(multiDateFeed),calls=structuredClone([multiDateCall]);
 if(mode==='unobserved-date')feed.items[0].date='2026-10-22';
 if(mode==='unobserved-id')feed.items[0].url=feed.items[0].url.replace('AN202610201830720785','AN199901019999999999');
 if(mode==='other-host')feed.items[0].url=feed.items[0].url.replace('data.eastmoney.com','unobserved.example');
 if(mode==='ambiguous-record')calls[0].data.data.list.push({...calls[0].data.data.list[0],title:'同一编号对应完全不同的另一条公告内容'});
 expect(restoreSnapshotFeedHeadlines(JSON.stringify(feed),collect(calls,{failed:mode==='failed-fetch'}))).toBeUndefined();
});

it('uses the actual source headline rather than publishing an altered financial amount',()=>{
 const feed=structuredClone(multiDateFeed);feed.items[0].title='华能国际：发行1亿元融资券';
 const restored=JSON.parse(restoreSnapshotFeedHeadlines(JSON.stringify(feed),collect([multiDateCall])));
 expect(restored.items[0].title).toBe(multiDateCall.data.data.list[0].title);
 expect(restored.items[0].title).not.toContain('1亿元');
});

it('completes a verified multi-date feed in one worker without regenerating its records',async()=>{
 const records=collect([multiDateCall]),start=vi.fn(async()=>({childSessionId:'multi-date',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(multiDateFeed)}],sourceRecords:records}),dispose:async()=>{}}));
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}},createId:()=> 'multi-date'});
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'feed',kind:'container',prompt:'工作台：真实公司研究\n本面板：公告\n优先使用 news 类型；保留真实公告标题、披露日期和原文链接。只取快照。'});
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'multi-date'}).state).toBe('completed'));
  expect(start).toHaveBeenCalledOnce();
  const data=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'multi-date'}).finalOutput)).data;
  expect(data.items[0]).toMatchObject({title:multiDateCall.data.data.list[0].title,date:'2026-10-21',publisher:'华能国际（600011）'});
 }finally{await runtime.dispose()}
});

it('synthesizes a retrieved announcement snapshot immediately without reopening discovery or losing source authority',async()=>{
 const records=collect([multiDateCall]),dispose=vi.fn(async()=>{}),start=vi.fn(async input=>({childSessionId:'phase-'+start.mock.calls.length,dispose,result:Promise.resolve(start.mock.calls.length===1?
  {stopReason:'timeout',localDeadlineExceeded:true,researchPhaseComplete:true,output:[],sourceRecords:records,researchEvidence:'已取得实际公告列表：'+JSON.stringify(multiDateCall)}:
  {stopReason:'completed',output:[{type:'text',text:JSON.stringify(multiDateFeed)}],sourceRecords:[]})}));
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}},createId:()=> 'phase-feed'});
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'feed',kind:'container',prompt:'工作台：真实公司研究\n本面板：公告\n优先使用 news 类型；保留真实标题、日期和原文链接。只取快照。'});
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'phase-feed'}).state).toBe('completed'));
  expect(start).toHaveBeenCalledTimes(2);expect(dispose).toHaveBeenCalledTimes(2);
  expect(start.mock.calls[1][0].synthesisOnly).toBe(true);
  expect(start.mock.calls[1][0].prompt).toContain(multiDateCall.url);
  expect(start.mock.calls[1][0].prompt).toContain(multiDateCall.data.data.list[0].title);
  const data=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'phase-feed'}).finalOutput)).data;
  expect(data.items[0]).toMatchObject({title:multiDateCall.data.data.list[0].title,date:'2026-10-21',publisher:'华能国际（600011）'});
 }finally{await runtime.dispose()}
});

const observed=JSON.parse(readFileSync(new URL('./fixtures/component-web-fetch-announcements.json',import.meta.url),'utf8'))
function collect(calls=observed.calls,{failed=false,prefix=''}={}){
 const collector=componentSourceCollector(['public_data_query','web_fetch'])
 const accept=(id,name,args,text,isError=false)=>{
  collector.accept({type:'tool/call',data:{callId:id,name,arguments:JSON.stringify(args)}})
  collector.accept({type:'tool/result',data:{message:{source:{callId:id},content:[{type:'tool-result',isError,content:[{type:'text',text}]}]}}})
 }
 accept('catalog','public_data_query',{operation:'catalog'},'{"sources":[{"name":"接口目录"}]}')
 calls.forEach((c,i)=>accept('page-'+i,'web_fetch',{url:c.url},`Fetched ${c.url} (HTTP 200)\n\n${prefix}${JSON.stringify(c.data)}`,failed))
 return collector.records
}
const proof=(artifact,records)=>componentSnapshotEvidence(JSON.stringify(artifact),records)

const renderedNews={title:'华能国际(600011.SH)：完成30亿元超短期融资券发行',date:'2026-10-20',url:'https://finance.sina.com.cn/stock/bxjj/2026-10-20/doc-inivwitp6520843.shtml'}
function collectRenderedNews({links=[renderedNews],body='列表正文',failed=false}={}){
 const url='https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_AllNewsStock/symbol/sh600011.phtml'
 const text=`Fetched ${url} (HTTP 200)\n\n华能国际个股资讯\n\n[网页读取状态：已滚动至文末，完成正文收集]\n\n[网页内链接记录]\n${JSON.stringify({links})}\n[/网页内链接记录]\n\n${body}`
 const collector=componentSourceCollector(['public_data_query','web_fetch'])
 collector.accept({type:'tool/call',data:{callId:'catalog',name:'public_data_query',arguments:'{"operation":"catalog"}'}})
 collector.accept({type:'tool/result',data:{message:{source:{callId:'catalog'},content:[{type:'tool-result',content:[{type:'text',text:'{"sources":["news"]}'}]}]}}})
 collector.accept({type:'tool/call',data:{callId:'page',name:'web_fetch',arguments:JSON.stringify({url})}})
 collector.accept({type:'tool/result',data:{message:{source:{callId:'page'},content:[{type:'tool-result',isError:failed,content:[{type:'text',text}]}]}}})
 return collector.records
}

it('uses dated links actually collected from a rendered HTML news list without fetching every article',()=>{
 const records=collectRenderedNews({body:'Do not retain the full rendered page body'})
 expect(records[1].snapshotRows).toHaveLength(1)
 expect(records[1].response).toBeNull()
 expect(JSON.stringify(records)).not.toContain('Do not retain the full rendered page body')
 expect(proof({version:1,type:'news',items:[renderedNews]},records)).toBe(true)
 const revised={version:1,type:'news',items:[{...renderedNews,title:'华能国际完成一亿元融资'}]}
 expect(JSON.parse(restoreSnapshotFeedHeadlines(JSON.stringify(revised),records)).items[0].title).toBe(renderedNews.title)
})

it.each(['missing-date','wrong-date','wrong-title','wrong-url','failed-page','unrelated-date-in-body'])('rejects %s when matching a rendered news record',mode=>{
 const links=[{...renderedNews}],item={...renderedNews}
 if(mode==='missing-date'||mode==='unrelated-date-in-body')delete links[0].date
 if(mode==='wrong-date')item.date='2026-10-19'
 if(mode==='wrong-title')item.title='华能国际(600011.SH)：完成10亿元超短期融资券发行'
 if(mode==='wrong-url')item.url='https://finance.sina.com.cn/unobserved.shtml'
 expect(proof({version:1,type:'news',items:[item]},collectRenderedNews({links,failed:mode==='failed-page',body:'其他记录日期：2026-10-20'}))).toBe(false)
})

it('synthesizes a rendered news list in one worker with a directly usable original link',async()=>{
 const feed={version:1,type:'news',title:'公司新闻',items:[{...renderedNews,summary:'原始标题披露完成30亿元超短期融资券发行；未取得利率，不能据此判断财务费用变化。'}]}
 const start=vi.fn(async()=>({childSessionId:'rendered-news',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(feed)}],sourceRecords:collectRenderedNews()}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}},createId:()=> 'rendered-news'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'news',kind:'container',prompt:'工作台：火电利润观察\n本面板：华能国际公司融资公告\n优先使用 news 类型；只用本次取得的真实原始标题、日期和原文链接，静态快照。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'rendered-news'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledOnce()
  expect(readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'rendered-news'}).finalOutput)).data.items[0]).toMatchObject(renderedNews)
 }finally{await runtime.dispose()}
})

it('requires every announcement headline to be restored to its observed wording before accepting the whole list',()=>{
 const records=collect()
 expect(proof(observed.artifact,records)).toBe(false)
 const restored=JSON.parse(restoreSnapshotFeedHeadlines(JSON.stringify(observed.artifact),records))
 expect(proof(restored,records)).toBe(true)
 expect(records.filter(r=>r.tool==='web_fetch').every(r=>r.response===null)).toBe(true)
})

it('does not promote JSON examples embedded in fetched API documentation into business records',()=>{
 expect(proof(observed.artifact,collect(observed.calls,{prefix:'API documentation. Example response:\n'}))).toBe(false)
})

it('retains complete structured web records and bounded fingerprints with the actual transport preamble',()=>{
 const calls=structuredClone(observed.calls)
 calls[0].data.data.list[0].body='Do not retain this full public page body'
 const records=collect(calls,{prefix:'[网页读取状态：已滚动至文末，完成正文收集]\n\n'})
 const restored=JSON.parse(restoreSnapshotFeedHeadlines(JSON.stringify(observed.artifact),records))
 expect(proof(restored,records)).toBe(true)
 expect(records.find(r=>r.tool==='web_fetch').response.data.data.list[0].body).toBe('Do not retain this full public page body')
})

it('completes the actual public announcement output without a discovery-only repair or refresh binding',async()=>{
 const records=collect(),bindData=vi.fn(),start=vi.fn(async()=>({childSessionId:'announcements',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(observed.artifact)}],sourceRecords:records}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}},createId:()=> 'announcements'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'reports',kind:'container',prompt:'工作台：真实公司研究\n本面板：近期公告\n优先使用 reports 类型。查询真实公告标题和日期，保留原文链接，只取本次快照。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'announcements'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
  expect(runtime.inspect({parentSessionId:'parent',taskId:'announcements'}).finalOutput).toContain('AN202610151830531389')
 }finally{await runtime.dispose()}
})

it('uses a nested article link actually returned by the source without trusting unrelated links',()=>{
 const url='https://example.org/api/news',item={title:'An observed business announcement',date:'2026-10-15',url:'https://publisher.example.net/story/observed-483838'}
 const records=collect([{url,data:{records:[{headline:item.title,publishedAt:item.date,article:{href:item.url}}]}}])
 expect(proof({version:1,type:'reports',items:[item]},records)).toBe(true)
 expect(proof({version:1,type:'reports',items:[{...item,url:'https://publisher.example.net/story/unobserved'}]},records)).toBe(false)
})

it.each(['array','object'])('keeps a related article with its own identity separate from its parent record (%s)',shape=>{
 const first={title:'An observed first business announcement',date:'2026-10-15',url:'https://example.org/articles/first-record-483838.html'}
 const related={title:'A different related business announcement',date:'2026-10-16',url:'https://example.org/articles/other-record-747474.html'}
 const child={...related,id:'other-record-747474'}
 const records=collect([{url:'https://example.org/api/news',data:{records:[{...first,id:'first-record-483838',article:{href:first.url},relatedArticles:shape==='array'?[child]:child}]}}])
 expect(proof({version:1,type:'reports',items:[first]},records)).toBe(true)
 expect(proof({version:1,type:'reports',items:[related]},records)).toBe(true)
 expect(proof({version:1,type:'reports',items:[{...first,url:related.url}]},records)).toBe(false)
})

it('matches an observed identifier only as a complete same-host detail URL segment',()=>{
 const item={title:'Observed company shareholder meeting announcement',date:'2026-10-15',url:'https://example.org/articles/observed-483838.html'}
 const records=collect([{url:'https://example.org/api/records',data:{records:[{id:'observed-483838',title:item.title,date:item.date}]}}])
 expect(proof({version:1,type:'reports',items:[item]},records)).toBe(true)
 expect(proof({version:1,type:'reports',items:[{...item,url:item.url.replace('example.org','news.example.org')}]},records)).toBe(false)
})

it.each([
 ['示例股份：关于不实施本年度现金分红计划的公告','示例股份：关于实施本年度现金分红计划的公告'],
 ['示例股份：关于本年度拟投资10亿元的公告','示例股份：关于本年度拟投资1亿元的公告'],
 ['示例股份：本年度净利润变动为-10.5%的公告','示例股份：本年度净利润变动为10.5%的公告'],
 ['示例股份：本年度净利润变动为10.5%的公告','示例股份：本年度净利润变动为105%的公告']
])('does not verify changed business wording or numbers under the same record ID: %s',(title,changed)=>{
 const item={title,date:'2026-10-20',url:'https://example.org/articles/observed-483838.html'}
 const records=collect([{url:'https://example.org/api/records',data:{records:[{id:'observed-483838',title,date:item.date}]}}])
 expect(proof({version:1,type:'reports',items:[item]},records)).toBe(true)
 expect(proof({version:1,type:'reports',items:[{...item,title:changed}]},records)).toBe(false)
})

it.each(['documentation','sample','example'])('does not treat a %s=true envelope as actual business list data',marker=>{
 const calls=observed.calls.map(call=>({...call,data:{[marker]:true,...call.data}}))
 expect(proof(observed.artifact,collect(calls))).toBe(false)
})

it('does not hide a changed title suffix behind the fingerprint size bound',()=>{
 const prefix='完整业务说明'.repeat(200),item={title:prefix+'不实施现金分红计划',date:'2026-10-15',url:'https://example.org/articles/observed-483838.html'}
 const records=collect([{url:'https://example.org/api/news',data:{records:[{title:item.title,date:item.date,id:'observed-483838'}]}}])
 expect(proof({version:1,type:'reports',items:[{...item,title:prefix+'实施现金分红计划'}]},records)).toBe(false)
})

it('does not borrow a link from an explicitly marked example wrapper',()=>{
 const item={title:'An observed company business announcement',date:'2026-10-15',url:'https://publisher.example.net/example/unobserved-1234'}
 const records=collect([{url:'https://example.org/api/news',data:{records:[{title:item.title,date:item.date,article:{example:true,href:item.url}}]}}])
 expect(proof({version:1,type:'reports',items:[item]},records)).toBe(false)
})

it.each(['unobserved-id','wrong-date','wrong-title','unrelated-host','public-suffix-host','url-substring','failed-fetch','document-example','business-error'])('rejects %s as evidence for a generated list',mode=>{
 let calls=structuredClone(observed.calls),artifact=structuredClone(observed.artifact),failed=false
 artifact.items=artifact.items.slice(0,1)
 if(mode==='unobserved-id')artifact.items[0].url=artifact.items[0].url.replace('AN202610151830531389','AN199901019999999999')
 if(mode==='wrong-date')artifact.items[0].date='2026-10-16'
 if(mode==='wrong-title')artifact.items[0].title='完全未出现的另一家企业重大业务公告'
 if(mode==='unrelated-host')artifact.items[0].url=artifact.items[0].url.replace('data.eastmoney.com','unobserved.example')
 if(mode==='public-suffix-host'){calls[0].url='https://api.one.com.cn/list';artifact.items[0].url=artifact.items[0].url.replace('data.eastmoney.com','other.com.cn')}
 if(mode==='url-substring')artifact.items[0].url=artifact.items[0].url.replace('AN202610151830531389','prefixAN202610151830531389suffix')
 if(mode==='failed-fetch')failed=true
 if(mode==='document-example')calls=calls.map(c=>({...c,data:{documentation:{examples:c.data}}}))
 if(mode==='business-error')calls=calls.map(c=>({...c,data:{...c.data,success:false}}))
 expect(proof(artifact,collect(calls,{failed}))).toBe(false)
})


it.each(['news','reports'])('requires every retrieved %s item to match its own observed title, date and URL, even beside valid financial evidence',type=>{
 const records=collectRenderedNews(),good={...renderedNews},bad={...renderedNews,title:'另一条未取得的行业新闻，不能借用前一条的原文链接'}
 const finance={tool:'financial_query',purpose:'snapshot',response:{schema_version:'financial-1',status:'complete',records:[{metric:'close',instrument:'600011.SH',value:7,as_of:'2026-10-20'}]}}
 expect(proof({version:1,type,items:[good]},records)).toBe(true)
 expect(proof({version:1,type,items:[good,bad]},records)).toBe(false)
 expect(proof({version:1,type,items:[bad]},[finance,...records])).toBe(false)
 expect(proof({version:1,type,items:[good,bad]},[finance,...records])).toBe(false)
 expect(proof({version:1,type,items:[good],note:'其他请求维度本次未取得；保留缺失说明，不补写条目。'},records)).toBe(true)
})

const mainArticle={title:'政策解读：煤电容量电价机制的扩围与升级',date:'2026-01-30',url:'https://example.org/policy/article-1482147'}
function collectMainArticle(){
 const collector=componentSourceCollector(['web_fetch'])
 const text=`Fetched ${mainArticle.url} (HTTP 200)\n\n政策解读 - 来源网站\n\n[网页读取状态：已滚动至文末，完成正文收集]\n\n[网页主文记录]\n${JSON.stringify({articles:[mainArticle]})}\n[/网页主文记录]\n\n[网页内链接记录]\n${JSON.stringify({links:[renderedNews]})}\n[/网页内链接记录]\n\n主文正文已经由网页工具返回，但不能将整篇正文和其中任意日期持久化为另一条记录。`
 collector.accept({type:'tool/call',data:{callId:'main',name:'web_fetch',arguments:JSON.stringify({url:mainArticle.url})}})
 collector.accept({type:'tool/result',data:{message:{source:{callId:'main'},content:[{type:'tool-result',content:[{type:'text',text}]}]}}})
 return collector.records
}
it('keeps a directly fetched article fingerprint separate from recommended links without persisting the whole page',()=>{
 const records=collectMainArticle()
 expect(proof({version:1,type:'news',items:[mainArticle,renderedNews]},records)).toBe(true)
 expect(proof({version:1,type:'news',items:[{...mainArticle,date:renderedNews.date}]},records)).toBe(false)
 expect(proof({version:1,type:'news',items:[{...renderedNews,url:mainArticle.url}]},records)).toBe(false)
 expect(JSON.stringify(records)).not.toContain('主文正文已经由网页工具返回')
})

it('quarantines a mismatched item after the bounded repair, preserving proven news and every missing scope item',async()=>{
 const feed={version:1,type:'news',title:'公司新闻',items:[renderedNews,{...renderedNews,date:'2026-10-19',title:'华能国际：标题日期链接错配，不能作为另一条资讯交付'}],note:'上网电价政策未取得，不能缩小研究范围。'}
 const start=vi.fn(async()=>({childSessionId:'mixed-news-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(feed)}],sourceRecords:collectRenderedNews()}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}},createId:()=> 'mixed-feed'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'news',kind:'container',prompt:'工作台：真实行业研究\n本面板：华能国际公司融资公告\n优先使用 news 类型；保留每条真实标题、日期和原文链接及未取得的研究范围，静态快照。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'mixed-feed'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledTimes(2)
  expect(start.mock.calls[1][0].prompt).toContain('上网电价政策未取得')
  expect(start.mock.calls[1][0].prompt).toContain('资讯第 2 条')
  const model=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'mixed-feed'}).finalOutput)).data
  expect(model.items).toEqual([renderedNews]);expect(proof(model,collectRenderedNews())).toBe(true)
  expect(model.note).toContain('上网电价政策未取得');expect(model.note).toContain(feed.items[1].title);expect(model.note).toContain('未通过原文核验')
 }finally{await runtime.dispose()}
})


it('retains genuine title/date-only source records without inventing a detail URL, but does not omit a provided URL to evade matching',()=>{
 const item={title:'来源确实提供但没有详情网址的行业记录',date:'2026-10-20',summary:'来源未提供单条详情链接。'}
 const records=collect([{url:'https://example.org/list',data:{records:[{title:item.title,date:item.date}]}}])
 expect(proof({version:1,type:'news',items:[item]},records)).toBe(true)
 expect(proof({version:1,type:'news',items:[{...item,url:'https://example.org/invented'}]},records)).toBe(false)
 expect(proof({version:1,type:'news',items:[{...renderedNews,url:undefined}]},collectRenderedNews())).toBe(false)
})


it('checks a short observed headline by its own URL and date rather than requiring a minimum headline length',()=>{
 const item={title:'煤价上涨',date:'2026-10-20',url:'https://example.org/story/price'}
 expect(proof({version:1,type:'news',items:[item]},collect([{url:'https://example.org/list',data:{records:[item]}}]))).toBe(true)
})

it('keeps the primary article fingerprint when a page also returns the full recommended-link budget',()=>{
 const collector=componentSourceCollector(['web_fetch']),links=Array.from({length:200},(_,i)=>({title:'独立的推荐新闻标题 '+i,url:'https://example.org/related/'+i,date:'2026-10-20'}))
 const text=`Fetched ${mainArticle.url} (HTTP 200)\n\n页面标题\n\n[网页读取状态：已滚动至文末，完成正文收集]\n\n[网页主文记录]\n${JSON.stringify({articles:[mainArticle]})}\n[/网页主文记录]\n\n[网页内链接记录]\n${JSON.stringify({links})}\n[/网页内链接记录]\n\n正文`
 collector.accept({type:'tool/call',data:{callId:'full',name:'web_fetch',arguments:JSON.stringify({url:mainArticle.url})}})
 collector.accept({type:'tool/result',data:{message:{source:{callId:'full'},content:[{type:'tool-result',content:[{type:'text',text}]}]}}})
 expect(collector.records[0].snapshotRows).toHaveLength(200)
 expect(proof({version:1,type:'news',items:[mainArticle]},collector.records)).toBe(true)
})


it('does not invent a publication date when an observed linked record has none, or omit an actual provided date',()=>{
 const item={title:'未提供发布日期的真实原文记录',url:'https://example.org/article/no-date',summary:'来源未提供发布日期。'}
 const records=collect([{url:'https://example.org/list',data:{records:[item]}}])
 expect(proof({version:1,type:'news',items:[item]},records)).toBe(true)
 expect(proof({version:1,type:'news',items:[{...item,date:'2026-10-20'}]},records)).toBe(false)
 expect(proof({version:1,type:'news',items:[{...renderedNews,date:undefined}]},collectRenderedNews())).toBe(false)
})

it.each([
 'https://finance.sina.com.cn/wm/2026-10-21/doc-observed.shtml',
 'https://k.sina.com.cn/article_123456_abcdef123456.html',
 'https://cj.sina.com.cn/articles/view/123456/abcdef123456',
 'https://t.cj.sina.com.cn/articles/view/123456/abcdef123456'
])('matches the same observed Sina article after removing only its pcsearch tracking parameter: %s',url=>{
 const item={title:'实际取得的原始公司新闻标题',date:'2026-10-21',url};
 const source=collect([{url:'https://search.sina.com.cn/search?q=company&tp=news',data:{records:[{...item,url:url+'?from=pcsearch'}]}}]);
 expect(proof({version:1,type:'news',items:[item]},source)).toBe(true);
 expect(proof({version:1,type:'news',items:[{...item,date:'2026-10-20'}]},source)).toBe(false);
 expect(proof({version:1,type:'news',items:[{...item,title:'被改写的另一条公司新闻标题'}]},source)).toBe(false);
 const different=collect([{url:'https://search.sina.com.cn/search?q=company&tp=news',data:{records:[{...item,url:url+'?article=1&from=pcsearch'}]}}]);
 expect(proof({version:1,type:'news',items:[{...item,url:url+'?article=2'}]},different)).toBe(false);
});
it.each([
 'https://unobserved.example/story/article',
 'https://finance.sina.com.cn/api/news?id=12',
 'https://sina.com.cn.evil.example/wm/2026-10-21/doc-observed.shtml'
])('preserves query identity for unrecognized sites and non-article paths: %s',url=>{
 const item={title:'实际新闻标题',date:'2026-10-21',url};
 const separator=url.includes('?')?'&':'?';
 const source=collect([{url:'https://search.sina.com.cn/search?q=company&tp=news',data:{records:[{...item,url:url+separator+'from=pcsearch'}]}}]);
 expect(proof({version:1,type:'news',items:[item]},source)).toBe(false);
});


it('recognizes fetched narrative citations without treating mere documentation or another feed record as business evidence',()=>{
 const url='https://example.org/guide/upgrade'
 const records=[{tool:'public_data_query',purpose:'discovery',args:{operation:'catalog'}},{tool:'web_fetch',purpose:'snapshot',args:{url},response:null}]
 const md={version:1,type:'markdown',title:'升级分析',content:'按实际取得的正文说明变化，[官方指南]('+url+')。'}
 expect(proof(md,records)).toBe(true)
 expect(proof({...md,content:'[其他指南](https://example.org/guide/other)'},records)).toBe(false)
 expect(proof(md,records.map(r=>({...r,purpose:'discovery'})))).toBe(false)
 expect(proof({...md,content:'未引用任何实际取得的来源'},records)).toBe(false)
 expect(proof({version:1,type:'html',title:'说明',html:'<p>可读摘要</p><a href="'+url+'">原始指南</a>'},records)).toBe(true)
 expect(proof({version:1,type:'news',title:'新闻',items:[{title:'未知标题',date:'2026-11-01',url}]},records)).toBe(false)
})
