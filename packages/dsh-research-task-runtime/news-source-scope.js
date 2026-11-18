// The host keeps the user's research scope separate from a provider's feed
// label. A working financial total feed is not a scoped news capability.
import {filterScopedNewsArtifact} from './news-topic-filter.js'
export const NEWS_SCOPE_MARKER='【新闻主题约束】'
export const NEWS_CAPACITY_MARKER='【新闻容量适配】'
export const NEWS_DISPLAY_INSTRUCTION='【新闻展示边界】\n原始需求JSON、来源配方与接口参数仅供执行和验证，保留在任务及绑定元信息中；不要复制到note、asOf、摘要、标题或其他可见内容。展示说明只用简短自然语言保留真实来源、实际报道日期与查询范围、未取得的对象及原因、当前刷新状态。检索仅覆盖首页或来源暂不可用时如实披露，不把获取时间当报道时间，不承诺完整区间或最新数据。不要展示source、parameters_json、requests、mapping、intervalMinutes等字段名及内部实现解释；不得以截断或清空原有note掩盖真实缺口，也不删除新闻条目来缩短说明。'
const newsTopic=/公告|新闻|资讯|报道|\b(?:news|announcements?|filings?)\b/iu
const newsPresentation=/资讯流|新闻流|时间线|正文解读|\b(?:timeline|news feed)\b/iu
const recordList=/逐条|每条|清单|明细|全部|完整|\b(?:each|all|list of)\b/iu
const recordWindow=/(?:最近|过去|近)\s*[一二三四五六七八九十两\d]+\s*(?:个)?\s*(?:天|日|周|月|年)|(?:19|20)\d{2}[-/年]\d{1,2}|\b(?:past|last)\s+\d+\s+(?:days?|weeks?|months?|years?)\b/iu
const tablePresentation=/表格|(?:按|用|制成)表(?:\s|[，。；]|$)|\btable\b/iu

export function retrospectiveNewsRecords(panel, originalRequest='') {
 const local=`${panel.title}\n${panel.prompt.split('\n宿主来源能力校正：',1)[0]}`
 if (!newsTopic.test(local)||newsPresentation.test(local)) return false
 if (tablePresentation.test(local)||recordList.test(local)&&recordWindow.test(local)) return true
 return recordList.test(local)&&originalRequest.split(/[。；;\n]/u).some(clause=>
  newsTopic.test(clause)&&!newsPresentation.test(clause)&&(tablePresentation.test(clause)||recordWindow.test(clause)))
}

export function newsRecordTableGuidance(request,{planning=false}={}) {
 return newsTopic.test(request)
  ? '【资讯记录表格】有回顾区间、逐条盘点或明确表格要求的公告及新闻使用宿主 market.table（type:"market", variant:"table"），每条一行，列为标题、发布日期、类型、标的、发布机构和摘要。第一列标题用 rowLinks 按 rows 同序绑定已核实原文；无原文填 null，转载或检索入口在来源与口径中标明。保留全部相关条目，支持搜索及按日期排序。用户明确要求时间线、正文解读或特定资讯流时沿用其指定形式。'+
   (planning?'实时或持续更新的可搜索新闻用组件库 builtin-news，保留主题和来源选择。':'')
  : ''
}
const broadTitle=/^(?:全市场(?:财经)?(?:新闻|资讯)(?:总流)?|综合财经(?:新闻|资讯)|财经(?:新闻|资讯)?总流|(?:general|market-wide|all-market) (?:financial |finance )?news)$/iu
const broadRequest=/全市场(?:财经)?(?:新闻|资讯)|综合财经(?:新闻|资讯)|财经(?:新闻|资讯)?总流|\b(?:general|market-wide|all-market) (?:financial |finance )?news\b/iu
const genericTitle=/^(?:新闻(?:列表)?|资讯(?:列表)?|news)$/iu

export function generalNewsScope(requirement=''){
 if(typeof requirement!=='string'||requirement.includes(NEWS_SCOPE_MARKER))return false
 const title=requirement.match(/^工作台：[^\n]+\n本面板：([^\n]+)/u)?.[1]??requirement.split('\n')[0].trim()
 // Bare default-widget titles carry no authored topic. New workbench recipes
 // still require explicit whole-market intent, or the parent's original scope.
 if(requirement.trim()===title&&genericTitle.test(title))return true
 // A legacy generic panel may spell out a headline list and its display
 // columns. Preserve any other subject or constraint for targeted retrieval.
 const description=requirement.split('\n')[1]?.trim() ?? ''
 const marketHeadlines=title==='财经要闻' && /^(?:展示|查看)?(?:最新|今日)?(?:真实)?财经(?:新闻|要闻)(?:[，、 ]*(?:保留|显示|附上|来源|日期|时间|标题|链接|原文|摘要|和|与|及))*[。.]?$/u.test(description)
 if(!broadTitle.test(title) && !marketHeadlines)return false
 const original=requirement.split('\n【原始工作台需求】\n')[1]
 const positive=original?.replace(/(?:不要|不需要|不得|禁止|不用|无需|不使用|\b(?:no|not|without)\b)[^。；;\n]*/giu,'')
 return !original||broadRequest.test(positive)
}

export function newsScopeInstruction(scope){
 return `${NEWS_SCOPE_MARKER}\n本卡的主题、实体、时间范围和来源限制以以下宿主原始需求为准：${scope}。本轮originalRequest与本面板规划优先于会话名、笔记标题和旧聊天主题；旧publicData配方的选源不代表用户指定来源，来源限制以originalRequest明确要求为准。先从本卡及父需求提取研究主题、实体全称、别名和英文缩写，再用能携带这些条件的实际来源定向检索；财经、公司与产业主题可用已授权public_data_query的eastmoney-news(query,limit)，跨领域新闻可用gdelt-news(query,limit)，或原需求允许的已授权MCP/网页检索。不要把整句排版要求当检索词。交付前逐条核对标题及实际摘要/正文与这些主题或实体的实质关系，剔除只因“市场、科技、公司、研究”等泛词相同而混入的记录；实体别名或行业实质相关报道可保留，不能只按是否包含卡片标题机械过滤。在已有note中简要说明实际查询范围及缺失；无可核验相关新闻时明确“本次未取得与本卡主题相关的新闻”，保留空列表或缺失状态，不用热门/全市场新闻填充，不扩写未读原文。需要刷新时只绑定本轮成功且保持同一主题/实体条件的请求与映射，不能回退到无条件总流；gdelt的firstSeenAt仅是索引发现时间，不能写成原文发布时间。\n${NEWS_DISPLAY_INSTRUCTION}`
}

export function newsSourceScopeIssue(data,records=[],requirement){
 // Callers provide executed/observed arguments, using the shared mapping
 // evaluator before this identity check. Stored expressions are not identities.
 const news=data?.type==='news'||typeof requirement==='string'&&(requirement.includes(NEWS_SCOPE_MARKER)||requirement.includes(NEWS_CAPACITY_MARKER))&&(data?.type==='table'||data?.type==='market'&&data.variant==='table')
 if(!news||generalNewsScope(requirement??data.title??''))return null
 // A static feed may contain a genuinely relevant article. Judge the actual
 // delivered rows rather than rejecting their provider name alone. Mapping
 // expressions still cannot authorize an unfiltered general-feed binding.
 if(data?.type==='news'&&Array.isArray(data.items)&&filterScopedNewsArtifact(data,records,requirement??data.title).items.length===data.items.length)return null
 const sources=records.filter(record=>['public_data_query','ework__public_data_query'].includes(record.tool??record.toolId)&&record.args?.source==='sina-news')
 // A worker may inspect a general feed before finding a relevant source. Only
 // the records actually delivered from that feed invalidate a static result.
 const broad=sources.some(source=>!Array.isArray(data.items)||!source.response||data.items.some(item=>source.response.records?.some(row=>row.title===item.title||row.url&&row.url===item.url)))
 return broad?'当前新闻来源只有无主题条件的财经总流，不能用于本卡主题。请重新生成此组件，保留父需求的主题、实体及别名，定向检索并逐条核对相关新闻；本次未取得相关报道时明确缺失，不用全市场热门资讯替代。':null
}
