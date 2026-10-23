import {expect,it} from 'vitest'
import {componentFeedEvidenceIssue} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {filterScopedNewsArtifact,NEWS_EMPTY_NOTE} from '../packages/dsh-research-task-runtime/news-topic-filter.js'

// Synthetic identity records test the source boundary, not live news coverage.
const scope='只展示中际旭创相关新闻。'
const article={title:'业务活动公开信息（合成记录）',summary:'某公司的体育活动。',time:'2026-10-22',url:'https://example.org/synthetic-article'}
const source=row=>({tool:'public_data_query',args:{operation:'query',source:'eastmoney-news',parameters_json:JSON.stringify({query:'中际旭创',limit:12})},response:{sourceId:'eastmoney-news',records:[row]}})
const news=(summary,extra={})=>({version:1,type:'news',title:'公司相关新闻',items:[{title:article.title,date:article.time,url:article.url,summary,...extra}]})

it('does not let a model summary authorize an unrelated observed article even when its title, date and URL are proven',()=>{
 const data=news('中际旭创业务进展。'),records=[source(article)]
 expect(componentFeedEvidenceIssue(JSON.stringify(data),records)).toBeNull()
 const filtered=filterScopedNewsArtifact(data,records,scope)
 expect(filtered.items).toEqual([])
 expect(filtered.note).toBe(NEWS_EMPTY_NOTE)
})

it.each(['summary','content'])('keeps an article related by the actual source %s when the model summary has no requested entity',field=>{
 const records=[source({...article,[field]:'中际旭创披露业务进展。'})],data=news('公开信息摘要。')
 expect(filterScopedNewsArtifact(data,records,scope).items).toEqual(data.items)
})

it('uses any matching observed excerpt rather than an unrelated first observation or model text',()=>{
 const records=[source(article),source({...article,summary:'中际旭创披露业务进展。'})],data=news('公开信息摘要。')
 expect(filterScopedNewsArtifact(data,records,scope).items).toEqual(data.items)
})

it('does not let model crypto context override an observed alternate acronym meaning',()=>{
 const row={...article,title:'ETH Zurich opens a laboratory (synthetic)',summary:'The university is expanding its campus.'}
 const data={...news('Ethereum staking and blockchain research.'),items:[{...row,date:row.time,summary:'Ethereum staking and blockchain research.'}]}
 expect(filterScopedNewsArtifact(data,[source(row)],'只展示以太坊ETH相关新闻。').items).toEqual([])
})

it('preserves the existing static or supplied-text relevance path when no source identity matches',()=>{
 const data=news('中际旭创业务进展。')
 expect(filterScopedNewsArtifact(data,[],scope).items).toEqual(data.items)
 expect(filterScopedNewsArtifact(data,[source({...article,url:'https://example.org/another-article'})],scope).items).toEqual(data.items)
})
