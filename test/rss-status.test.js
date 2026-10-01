import {it,expect} from 'vitest'
import * as status from '../scripts/lib/component-data-status.mjs'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
it('RSS状态使用来源实际抓取记录，失败不冒充成功且空订阅不显示未绑定',()=>{
 expect(status.componentRssStatusView).toBeTypeOf('function')
 const feeds=[{id:'f',url:'https://example.com/rss',title:'来源',format:'rss',fetchedAt:'2026-10-01T07:37:50Z',error:null,entries:[]}]
 const node=()=>({containerSpec:JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'rss',title:'订阅',asOf:'来源记录',feeds})))})
 expect(status.componentRssStatusView(node())).toMatchObject({detail:'订阅 · 仅手动',phase:null,lastSuccess:'2026-10-01T07:37:50Z'})
 feeds[0].error='HTTP 503';expect(status.componentRssStatusView(node())).toMatchObject({detail:'读取失败 · 保留上次条目',phase:'error',lastSuccess:'2026-10-01T07:37:50Z'})
 feeds.length=0;expect(status.componentRssStatusView(node())).toMatchObject({detail:'尚未添加订阅',time:'尚未读取',lastSuccess:null})
 expect(status.componentRssStatusView({containerSpec:{type:'markdown',content:'RSS'}})).toBeNull()
})
