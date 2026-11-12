// Shared by the renderer's provisional progress and the runtime's execution
// policy. Keep dependencies inside so the packaged renderer can inline it.
export function classifyResearchCreationRequest(raw, scope = 'creation') {
  if (typeof raw !== 'string') return scope === 'creation' ? null : false
  const componentObject=/工作台|研究台|分析台|速查台|监测台|观察台|监控台|监控面板|行情面板|数据面板|研究面板|运营面板|分析面板|画布|看板|仪表盘|组件|卡片|表格|图表|蜡烛图|K\s*线|热力图|甘特图|研报列表|新闻列表|柱状图|折线图|散点图|明细表|数据表|可视化图|思维导图|组织架构图|关系图|流程图|\b(?:workbench|dashboard|canvas|component|card|table|chart)\b/iu
  const boardObject=/^(?:工作台|研究台|分析台|速查台|监测台|观察台|监控台|监控面板|行情面板|数据面板|研究面板|运营面板|分析面板|画布|看板|仪表盘|workbench|dashboard|canvas)$/iu
  const conversationScope=/(?:在|于)(?:(?:当前|本次|这段)(?:的)?)?(?:对话|会话|聊天)(?:中|里|内)?/u
  const documentObject=/\b(?:PPTX?|PowerPoint|DOCX?|Word|XLSX?|Excel|PDF)\b|演示文稿|幻灯片|报告文件|文档文件|电子表格文件/iu
  function normalizeComponentClause(text){
    return text.replace(/📎\s*文件：`(?:\\`|[^`])+`/gu,'').trim().replace(/^(?:(?:另外|另行|同时|然后|但是|但|并且|并)\s*)+/u,'')
      .replace(/^(?:(?:请|麻烦|帮我|现在|先|本轮|这次)\s*)*(?:在|于)(?:(?:当前|本次|这段)(?:的)?)?(?:对话|会话|聊天)(?:中|里|内)?\s*/u,'')
      // Chinese imperatives need no classifier/quantity after 做. Normalize
      // only the parser's view so the same negation, quotation and history
      // checks also cover “给团队做发布工作台”; retain the authored request.
      // 做出来 may describe an existing result before its noun; adding 一个
      // would turn that descriptive phrase into a false creation predicate.
      .replace(/做(?!出来|[一二两三四五六七八九十百零\d个套张份组版完好了过的得不])(?=[^，,。；;！？!?\n]{0,64}(?:工作台|研究台|分析台|速查台|监测台|观察台|监控台|看板|仪表盘|组件|表格|图表|思维导图|组织架构图|流程图))/gu,'做一个')
      .replace(/搭(?=\s*(?:工作台|看板|仪表盘)(?:\s|$))/gu,'搭建')
  }
  function deliveryClauses(text){return text.split(/[，,。；;！？!?\n]+|(?=另外|另行|同时|然后|但是|但|并且|并(?:创建|新建|新增|生成|建立|搭建|搭(?:一个|一套|一张|个|套|张)|制作|构建|添加|建(?:一个|一套|一张|个|套|张)))/u)}
  function authoredDeliveryText(text){
    // Quoted commands describe material to read; they do not authorize another
    // deliverable. Keep quoted titles and filenames that are not instructions.
    return text.replace(/```[\s\S]*?```/g,'').replace(/^>.*$/gm,'')
      .replace(/“[^”]*”|「[^」]*」|『[^』]*』|‘[^’]*’|"[^"\n]*"|'[^'\n]*'/gu,quote=>/^(?:(?:请|先|再|继续|如何|怎么|怎样|必须|需要)\s*)*(?:制作|创建|新建|新增|生成|建立|搭建|搭(?:一个|一套|一张|个|套|张)|构建|修复|修改|编辑|调整|优化|完成|导出|保存|交付|做(?:[一二两三四五六七八九十百零\d]+\s*[个套张份组版]|[个套张份组版])|\b(?:create|build|generate)\b)/iu.test(normalizeComponentClause(quote.slice(1,-1)))?'':quote)
  }
  function deliveryObjectText(tail){
    const phrase=tail.trim().replace(/^(?:成|为)?(?:至少|约)?(?:[一二三四五六七八九十\d]+\s*(?:个|张|套|份)?|an?\s+)\s*/iu,'')
    return /^(?:展示|显示|使用|利用|根据|基于|以|包含|带有|附有|含|比较|呈现|反映|分析|用于|用来).{0,160}的(.+)$/u.exec(phrase)?.[1]??phrase
  }
  function creationDenied(clause){
    clause=normalizeComponentClause(clause)
    if(/(?:不要|不用|无需|不需要|别|禁止|先不)(?:用|根据|基于).{1,80}搭建\s*(?:工作台|看板|仪表盘)/u.test(clause))return true
    if(/(?:暂不|先不|不要|不用|无需|不需要|别|禁止|不再)(?:再)?(?:把|将).{0,180}(?:做出来|搭出来|实现出来|还原出来|做成|转成|转换成|还原成|(?:梳理|整理)(?:成|为))/u.test(clause))return true
    return /(?:暂不|先不|本轮不|本次不|这次不|目前不|现在不|不要|不用|无需|不需要|别|禁止|不再|停止|取消|尚未|还未|没有|并未|未|不)(?:再|重新|继续|直接|让我|让你|进行|执行|修改|编辑|调整|修复|或|和|及|以及|并|与|\s)*(?:帮我|给我|替我|为我)?(?:创建|新建|新增|生成|建立|搭建|搭(?:一个|一套|一张|个|套|张)|制作|构建|添加|规划|展示|显示|呈现|绘制|提供|编写|撰写|修改|编辑|完成|导出|保存|交付|做(?:[一二两三四五六七八九十百零\d]+\s*[个套张份组版]|[个套张份组版])|建)/u.test(clause.replace(conversationScope,''))
  }
  function documentDeliveryClause(clause){
    const action=normalizeComponentClause(clause)
    if(!documentObject.test(action)||creationDenied(action)||/^(?:(?:请|麻烦|帮我|只|仅|先)\s*)*(?:查看|看看|检查|解释|说明|介绍|如何|怎么|怎样|阅读|研读|引用)/u.test(action))return false
    if(/^(?:(?:请|麻烦|帮我|先|再)\s*)*(?:继续|完成|修复|修正|修改|更新|编辑|调整|优化|完善)/u.test(action))return true
    const predicate=action.match(/制作|创建|生成|撰写|编写|做(?:一份|份)|写(?:一份|份)|整理成|转换(?:成|为)|转成|导出(?:为|成)?|保存(?:为|成)?|交付|输出|给我|提供|我想要|我要|需要/iu)
    if(!predicate)return false
    const target=deliveryObjectText(action.slice(predicate.index+predicate[0].length)),doc=target.match(documentObject),object=target.match(componentObject)
    return !!doc&&(!object||doc.index<object.index)
  }
  function explicitUiClause(clause){
    const action=normalizeComponentClause(clause)
    if(!componentObject.test(action)||creationDenied(action)||readOnlyComponentDelivery(action)||/^(?:内容|正文|示例|例如|原文|引用|说明)(?:包括|包含|是|中|里|：|:)/u.test(action))return false
    const creation=explicitComponentCreation(action)
    if(creation?.target==='workbench'){
      const tail=action.slice(creation.index),doc=tail.match(documentObject),object=tail.match(componentObject)
      if(!doc||object&&object.index<doc.index)return true
    }
    return (conversationScope.test(clause)||/(?:对话|会话|聊天)(?:中|里|内)?(?:的)?(?:原生)?组件/u.test(action))&&/(?:创建|新建|新增|生成|制作|添加|展示|显示|呈现|画出|绘制|给我|提供)/u.test(action)
  }
  function deliveryScope(raw){
    const request=authoredDeliveryText(raw),clauses=deliveryClauses(request)
    const document=clauses.some(documentDeliveryClause)
    // Internal document charts are not independent UI deliverables. Only a
    // separate explicit UI request can escape the authored document scope.
    const ui=document?clauses.filter(explicitUiClause):[]
    return {request:document?ui.join('；'):request,documentOnly:document&&!ui.length}
  }
  function explicitComponentCreation(action){
    // Users often put the deliverable before the verb (把原型里的看板做出来).
    // Do not infer a fresh task from a past-tense report or a how-to question.
    if(!/(?:已经?|刚才|刚刚|之前|曾经).{0,8}(?:把|将)/u.test(action)){
      const conversion=/(?:把|将).{1,140}?(?:做成|转成|转换成|还原成|(?:梳理|整理)(?:成|为))(.{1,60})$/u.exec(action)
      const object=conversion?.[1].match(componentObject)
      if(object)return{index:conversion.index,target:boardObject.test(object[0])?'workbench':'component'}
      const materialized=/(?:把|将)(.{1,160})(?:做出来|搭出来|实现出来|还原出来)(?:一下|吧|即可)?$/u.exec(action.trim())
      const target=materialized?.[1].match(componentObject)
      if(target)return{index:materialized.index,target:boardObject.test(target[0])?'workbench':'component'}
      // A provided prototype may describe ordinary domain pages without saying
      // 'component'. Resolve the real client mode before choosing its surface.
      if(materialized&&/(?:页签|页面|视图|pages?|tabs?|views?)/iu.test(materialized[1])&&/(?:原型|prototype|📎 文件：`[^`]+\.html?`)/iu.test(authoredDeliveryText(raw))&&!/(?:源码|源代码|仓库|项目代码|修改文件|编辑文件|写回|覆盖|保存到|导出|\b(?:source code|repository|write back|overwrite|export)\b)/iu.test(authoredDeliveryText(raw)))return{index:materialized.index,target:'component'}
    }
    const predicate=action.match(/创建|新建|新增|生成(?!(?:状态|进度|情况|失败|错误|耗时|时间|结果|记录|任务|日志|过程))|搭建|搭(?:一个|一套|一张|个|套|张)|制作|构建|做(?:[一二两三四五六七八九十百零\d]+\s*[个套张份组版]|[个套张份组版])|建(?:一个|一套|一张|个|套|张)|\b(?:create|build|generate)\b/iu)
    if(!predicate)return null
    const tail=action.slice(predicate.index+predicate[0].length).trim()
    if(/^(?:的)?(?:方法|方式|步骤|逻辑|规则|功能)/u.test(tail))return null
    const object=deliveryObjectText(tail).match(componentObject)
    return object?{index:predicate.index,target:boardObject.test(object[0])?'workbench':'component'}:null
  }
  function readOnlyComponentDelivery(text){
    const action=normalizeComponentClause(text),object=action.match(componentObject)
    if(!object)return false
    const readLead=/^(?:(?:请|麻烦|帮我|给我|为我|替我|我想要|我要|需要|提供|先|只读|只|仅)\s*)*(?:看看|看一下|看一看|查看|检查|查询|解释|说明|介绍|检视|了解|如何|怎么|怎样)/u
    if(readLead.test(action))return true
    const creation=explicitComponentCreation(action)
    // Existing data may precede the creation predicate. A question about that
    // predicate stays read-only; an imperative still creates its declared target.
    if(creation){if(/(?:如何|怎样|怎么)/u.test(action.slice(0,creation.index)))return true;return false}
    const before=action.slice(0,object.index),after=action.slice(object.index+object[0].length)
    return /(?:当前|现有|已有|这个|此|原有|原来|刚才|上一个|上一张|之前)(?:的)?$/u.test(before)||/^(?:(?:中|里)?的(?:链接|地址|原始数据|数据|内容|详情|状态|来源|记录|历史|说明|解释|含义|用法|使用方法|创建方法|生成方法|创建步骤)|链接|地址|原始数据|创建方法|生成方法|如何|怎么|怎样)/u.test(after)
  }

  if (scope === 'read-only') return readOnlyComponentDelivery(raw)
  const {request,documentOnly}=deliveryScope(raw)
  if (scope === 'document') return documentOnly
  if (!request) return null
  // Inspect only affirmative action clauses. Generation status is a noun,
  // and temporary negation must not suppress a separate requested addition.
  // The same classifier is serialized into the renderer.
  const targets=[]
  const text = deliveryClauses(request).filter(clause => {
    // Past creation describes an existing object; it is not a new action.
    const action = normalizeComponentClause(clause).replace(/已(?:经)?(?:创建|新建|新增|生成|建立|搭建|搭(?:一个|一套|一张|个|套|张)|制作|构建|添加|做(?:[一二两三四五六七八九十百零\d]+\s*[个套张份组版]|[个套张份组版]))/gu, '')
      .replace(/建立(?:数据|来源|刷新|现有|已有|当前|组件|卡片|的)*(?:绑定|映射|关联|连接|关系)/gu, '')
    // New build synonyms require an imperative head and a new canvas object.
    // Object-before-verb status/binding statements cannot establish this intent.
    const build = /^(?:(?:另外|另行|同时|然后|并且|并|请|麻烦|帮我|给我|替我|为我|我想|我需要|先|再|立即|马上)\s*)*(?:建立|建(?!议|筑|模))(.+)$/u.exec(action.trim())?.[1]
    const operand = build?.split(/(?:用于|用来|给|为|到|在)(?=(?:当前|现有|已有|这个|此)(?:的)?(?:工作台|研究台|分析台|速查台|监测台|观察台|监控台|监控面板|行情面板|数据面板|研究面板|运营面板|分析面板|画布|看板|仪表盘|组件|卡片))|(?:并且?|然后|同时)(?=(?:绑定|配置|添加|连接|关联|启用|设置))/u)[0]
    // Domain modifiers precede the canvas noun (客户关系管理工作台);
    // binding complements follow it (工作台的数据源绑定).
    const object = operand?.match(/工作台|研究台|分析台|速查台|监测台|观察台|监控台|监控面板|行情面板|数据面板|研究面板|运营面板|分析面板|画布|看板|仪表盘|组件|卡片|绑定|映射|关联|连接|关系/gu)?.at(-1)
    const createBuild = !!operand && !/^(?:当前|现有|已有|这个|此)(?:的)?(?:工作台|研究台|分析台|速查台|监测台|观察台|监控台|监控面板|行情面板|数据面板|研究面板|运营面板|分析面板|画布|看板|仪表盘|组件|卡片)/u.test(operand) && /^(?:工作台|研究台|分析台|速查台|监测台|观察台|监控台|监控面板|行情面板|数据面板|研究面板|运营面板|分析面板|画布|看板|仪表盘|组件|卡片)$/u.test(object ?? '')
    const delivery = /^(?:请|麻烦|帮我)?(?:给我|提供|我想要|我要|我需要|需要).{0,80}(?:工作台|研究台|分析台|速查台|监测台|观察台|监控台|监控面板|行情面板|数据面板|研究面板|运营面板|分析面板|画布|看板|仪表盘|组件|卡片|表格|图表)/u.test(action) || /^(?:请|麻烦|帮我)?(?:用|使用|通过).{0,16}(?:表格|图表|组件|卡片)(?:来)?(?:展示|显示|呈现|比较|对比|分析)/u.test(action) || /^(?:请|麻烦|帮我)?(?:展示|显示|呈现|画出|绘制).{0,80}(?:图表|表格|组件|卡片)/u.test(action)
    const explicit = explicitComponentCreation(action)
    const create = delivery || createBuild || !!explicit || /创建|新建|新增|生成(?!(?:状态|进度|情况|失败|错误|耗时|时间|结果|记录|任务|日志|过程))|搭建|搭(?:一个|一套|一张|个|套|张)|制作|构建|添加|做(?:[一二两三四五六七八九十百零\d]+\s*[个套张份组版]|[个套张份组版])|重新规划|\b(?:create|build|generate)\b/iu.test(action)
    const denied = creationDenied(clause)
    const inspection = /^(?:请|帮我|麻烦)?(?:只读|只需|只|仅|先)?(?:检查|查看|查询|解释|检视|核查|核对|审查|审阅|说明|汇总)/u.test(clause.trim())
    const accepted=create&&!denied&&!inspection&&!readOnlyComponentDelivery(action)
    if(accepted){const object=action.match(componentObject);targets.push(explicit?.target??(object&&boardObject.test(object[0])?'workbench':'component'))}
    return accepted
  }).join('；')
  if (!text || /(?:为什么|为何|如何|怎样|怎么|是否|能否|有没有|有无).{0,24}(?:创建|生成|建立|搭建|搭(?:一个|一套|一张|个|套|张)|制作|构建|规划|实现出来|还原出来|做[一二两三四五六七八九十百零\d]+\s*[个套张份组版]|建)/u.test(text)) return null
  if (/^(?:请|帮我|麻烦)?(?:继续|再)?(?:修复|修改|更新|编辑|调整|优化|完善|核对)(?:当前|现有|已有|原有|原来|这个|此)/u.test(request) && !/(?:另外|另行|同时|并).{0,8}(?:创建|新建|新增|生成|建立|搭建|搭(?:一个|一套|一张|个|套|张)|制作|做[一二两三四五六七八九十百零\d]+\s*[个套张份组版]|建)/u.test(text)) return null
  if (/(?:优化|调整|修复|解释|设计).{0,20}(?:组件生成|工作台生成|生成逻辑|生成规则|生成功能)/u.test(text)) return null
  if (/(?:在|修改|更新|编辑|调整)(?:当前|现有|已有|这个|此)(?:的)?(?:工作台|研究台|分析台|速查台|监测台|观察台|监控台|监控面板|行情面板|数据面板|研究面板|运营面板|分析面板|画布|看板|仪表盘)/u.test(text) && !/(?:另(?:建|创建)|新(?:建|的)?(?:工作台|研究台|分析台|速查台|监测台|观察台|监控台|监控面板|行情面板|数据面板|研究面板|运营面板|分析面板|画布|看板|仪表盘))/u.test(text)) return null
  const board = targets.includes('workbench')
  const component = targets.includes('component') || /组件|卡片|表格|图表|蜡烛图|K\s*线|热力图|甘特图|研报列表|新闻列表|柱状图|折线图|散点图|明细表|数据表|可视化图|思维导图|组织架构图|关系图|流程图|\b(?:component|card|table|chart)\b/iu.test(text)
  // New canvas cards use the same host planning tool. Coding requests and
  // existing-board edits retain their original model controls and workflow.
  const framework = /\b(?:React|Vue|Svelte|SwiftUI|Angular|TSX|JSX)\b/iu.test(request)
  const sourceFile = /\.[cm]?[jt]sx?\b/iu.test(request)
  if ((framework && sourceFile) || /(?:组件|卡片).{0,12}(?:源码|源代码)/iu.test(request) || (!board && (framework || sourceFile))) return null
  if (!board && !component) return null
  const normalized = raw.trim().replace(/\s+/g, ' ')
  const types = [...new Set((normalized.match(/蜡烛图|K\s*线|热力图|甘特图|研报列表|新闻列表|柱状图|折线图|散点图|明细表|数据表|指标卡/gi) ?? []).map(value => value.replace(/\s+/g, '')))].slice(0, 6)
  return {kind:board?'workbench':'component',request:normalized,description:normalized.slice(0,100),types}
}
