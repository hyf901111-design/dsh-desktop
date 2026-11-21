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
      // A source qualifier may precede bare 建. Normalize only direct requests
      // naming the board as the result, keeping leading negation and the raw input.
      .replace(/^((?:(?:请|麻烦|帮我|给我|为我|替我|先|再|不要|不用|无需|别|暂不|禁止)\s*)*)(?:仅|只)?(?:使用|利用|根据|基于|依据|参照|按照|按|用)[^，,。；;！？!?：:\t\r\n“”「」]{0,48}?(?:资料|材料|数据|原型|记录|台账|清单|报告|附件|文件|底稿|明细|表格|表)[ ]*(?:来)?建(?=(?:一[张个套])?[\p{L}\p{N} -]{0,24}?(?:工作台|看板|仪表盘)(?:[，,。；;！？!?：:]|$))/u,'$1创建')
      // A spoken “弄个看板” requests the same delivery as “做个看板”.
      // Match the action at the start of the clause and retain its negation.
      .replace(/^((?:(?:请|麻烦|帮我|给我|为我|替我|先|再|顺便|现在|不要|不用|无需|别|暂不)\s*)*)(?:弄|搞|来)(?=一?[个张套份])(?!.{0,100}(?:看板|工作台|组件|图表|表格|卡片)(?:的)?(?:截图|链接|地址|生成方法|创建步骤|使用说明))/u,'$1做')
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
      .replace(/“[^”]*”|「[^」]*」|『[^』]*』|‘[^’]*’|"[^"\n]*"|'[^'\n]*'/gu,quote=>/^(?:(?:请|麻烦|帮我|给我|替我|为我|先|再|继续|如何|怎么|怎样|必须|需要)\s*)*(?:制作|创建|新建|新增|生成|建立|搭建|搭(?:一个|一套|一张|个|套|张)|构建|修复|修改|编辑|调整|优化|完成|导出|保存|交付|做(?:[一二两三四五六七八九十百零\d]+\s*[个套张份组版]|[个套张份组版])|\b(?:create|build|generate)\b)/iu.test(normalizeComponentClause(quote.slice(1,-1)))?'':quote)
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
  const authoredClauses = deliveryClauses(request).map(normalizeComponentClause)
  // A manual draft or an edit inside a named destination already has an owner.
  const existingDestination = /(?:在|往|向)(?:当前|现有|已有|指定|选中|这[个张]|那[个张]|原来)(?:的)?(?:智能容器|容器草稿|组件|卡片|图表)(?:里|内|中|上)/u
  // An explicitly named container is a destination regardless of the next verb
  // (“用智能容器做/展示/算…”). Do not treat quoted instructions or a rejected
  // container as a request to open a manual draft.
  const manualDestination = /(?:用|通过|借助|采用|在|创建|新建|生成|建立|建|加|打开|放(?:进|入|到|在)?|拖(?:进|入|到)?)(?:(?:一[个张]|[个张]|新|空白|留白|手动|手工|刚才|刚建|指定|这[个张]|选中|当前|已有|现有|的)\s*)*(?:智能容器|手动容器|手工容器|容器草稿)|(?:智能容器|手动容器|手工容器|容器草稿)(?:里|内|中)/u
  const rejectsContainer = /(?:不要|不用|不使用|无需|无须|不必|别|禁止|跳过|不通过|不需要)(?:再|额外|手动|手工|任何|先|去|新建|创建|生成|打开|使用|用|通过|借助|一个|新的?|空白的?|智能的?)*\s*(?:智能容器|手动容器|手工容器|容器草稿)/u
  const manualClause = clause => clause.includes('\t') ? '' : clause.replace(/“[^”]+”|「[^」]+」|『[^』]+』|"[^"]+"/gu, quoted => /^(?:智能容器|手动容器|手工容器|容器草稿)$/u.test(quoted.slice(1,-1)) ? quoted.slice(1,-1) : '')
  const existingEdit = /^(?:(?:请|麻烦|帮我|先|只|继续)\s*)*(?:(?:编辑|修改|修复|更新|调整|优化)(?:当前|刚才|之前|已有|现有|指定|选中|这[个张]|那[个张])[^，。；;\n]{0,32}(?:组件|卡片|图表|智能容器)|(?:把|将)(?:刚才|之前|选中|当前|已有|现有|这[个张]|那[个张])[^，。；;\n]{0,32}(?:组件|卡片|图表|智能容器)[^，。；;\n]{0,20}(?:改成|改为|更新|修改|调整|编辑|重命名))/u
  const independentAddition = /(?:^|[，,。；;\n])\s*(?:另外|另行|同时|并且|并)(?:再)?(?:帮我)?(?:新建|新增|创建|做一|加一|生成)/u.test(request)
  if (!independentAddition && authoredClauses.map(manualClause).some(clause => clause && !creationDenied(clause) &&
      (existingDestination.test(clause) || existingEdit.test(clause) || manualDestination.test(clause) && !rejectsContainer.test(clause)))) return null
  // A short imperative can name a new chart without saying “组件”. Strip only
  // the destination board, so “在这张卡片中” continues to address an existing card.
  const boardPrefix = /^(?:(?:请|麻烦|帮我|给我|我想|想|先|再|另外)\s*)*(?:(?:在|往|给)(?:当前|这个|现有|已有)?(?:的)?(?:研究)?(?:看板|工作台|画布)(?:上|里|内|中)?\s*)?(?:再|另外)?/u
  // A destination and a requested card can surround a business recipient or
  // a colon introducing the data question. Inspect the request head only.
  const placementSurface = /(?:研究看板|研究工作台|研究画布)/u
  const namedBoard = authoredClauses.some(clause => !clause.includes('\t') && !/[“”「」『』"‘’]/u.test(clause) && placementSurface.test(clause))
  const boardPlacement = (scope === 'research' || namedBoard) &&
    !authoredClauses.some(clause => /(?:不要|不用|无需|不需要|别|禁止|暂不|先不)(?:再|额外)?(?:创建|新建|新增|生成)(?:任何|新的?)?(?:卡片?|组件|便签|看板)?$/u.test(clause)) &&
    authoredClauses.some(clause => {
      if (clause.includes('\t') || /[“”「」『』"‘’]/u.test(clause)) return false
      const head = clause.split(/[：:]/u, 1)[0].trim()
      if (/(?:如何|怎么|怎样|假如|假设|如果|讨论|解释|建议|意味着|是否|引用|个人笔记|我的笔记)/u.test(head)) return false
      const command = head.replace(/^(?:(?:请|麻烦|帮我|先|再)\s*)*给[\p{L}\d ·-]{1,20}?(?=在(?:当前|这个)?(?:研究)?(?:看板|工作台|画布))/u, '').replace(boardPrefix, '')
      const placed = /^(?:留(?:下)?|放(?:上)?)(?:一[张个份]|[张个份])([\p{L}\d ·%-]{1,36}?)(?:吧|即可)?$/u.exec(command)
      if (placed && !/(?:[这那][张个]|同一|原来|现成|已有|现有|既有|原有|当前|选中|刚才|之前)/u.test(placed[1]) &&
          /(?:明细|交接便签|便签|卡片|卡|组件|图表|表格|明细表|折线图|柱[状形]图|条形图|散点图|趋势图|日历)$/u.test(placed[1])) return true
      // A requested ordering of supplied rows can specify the result inside an
      // unnamed card. A referenced, selected or existing card retains its owner.
      if (/(?:已有|现有|既有|原有|当前|选中|刚才|之前|原来|这[张个]|那[张个])[^，：:]{0,20}(?:卡片?|组件)(?:内|里|中|上)$/u.test(command)) return false
      return /^(?:(?:请|麻烦|帮我|先)\s*)*(?:让|把|将).{1,48}?(?:出现|显示|呈现|展示)在[^这那]{0,24}?(?:组件|卡片)(?:内|里|中|上)$/u.test(command)
    })
  const shortBoardCard = boardPlacement || scope === 'research' && authoredClauses.some(clause => {
    if (clause.includes('\t') || /[“”「」『』"‘’]/u.test(clause)) return false
    const action = clause.replace(boardPrefix, '').replace(/(?:吧|即可)$/u, '')
    if (/^画(?:一下|出)?(?:这|那)(?:组|些|几|[一二两三四五六七八九十\d]+个)?(?:数据点|点|读数|数值)(?:的图)?$/u.test(action)) return true
    const object = /^(?:(?:画|加|补|新增|添加|创建|做|生成)(?:一[个张份]|张|个)|绘制|画出)(.+)$/u.exec(action)?.[1]
    return object && object.length <= 64 && /(?:明细(?:表|卡)?|折线(?:图|卡)|柱(?:状|形)?图|条形图|散点图|趋势图|图表|表格|指标卡|日历|组件|卡片)$/u.test(object)
  })
  // Inspect only affirmative action clauses. Generation status is a noun,
  // and temporary negation must not suppress a separate requested addition.
  // The same classifier is serialized into the renderer.
  const boardVisual = /折线卡|柱状卡|行情卡|净值卡|指标卡|数据卡|条形图|柱图|曲线图|饼图|环形图|瀑布图|漏斗图|雷达图|箱线图|桑基图|时间线|热图|独立明细|交互网页|复盘网页|自包含网页/u
  const otherDeliverable = /(?:代码(?:片段|示例)?|脚本|图片|图像|插画|照片|海报|摘要|名称)(?:给我)?(?:吧|即可)?$/u
  const creationQuestion = /(?:生成|创建|绘制|制作)[^，。；;\n]{0,50}(?:需要多久|要多久|多长时间|要几分钟|要多少时间|为什么.{0,6}慢|的成功率(?:是|有)?多少)/u
  const targets=shortBoardCard ? [boardPlacement && namedBoard && scope === 'creation' ? 'workbench' : 'component'] : []
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
    const denied = creationDenied(clause) || (rejectsContainer.test(action) && /^(?:请|先)?(?:不要|不用|无需|别|禁止|不需要)/u.test(action))
    const inspection = /^(?:请|帮我|麻烦)?(?:只读|只需|只|仅|先)?(?:检查|查看|查询|解释|检视|核查|核对|审查|审阅|说明|汇总)/u.test(clause.trim())
    // “生成” also introduces ordinary text, images and code. A confirmed board
    // identifies the destination, while the human still authorizes the object.
    const namesBoardOutput = explicit || componentObject.test(action) || boardVisual.test(action)
    const acceptsObject = scope !== 'research' || (namesBoardOutput && !clause.includes('\t') &&
      !otherDeliverable.test(action) && !creationQuestion.test(action))
    const accepted=create&&acceptsObject&&!denied&&!inspection&&!readOnlyComponentDelivery(action)
    if(accepted){const object=action.match(componentObject);targets.push(explicit?.target??(object&&boardObject.test(object[0])?'workbench':'component'))}
    return accepted
  }).join('；')
  if ((!text && !shortBoardCard) || /(?:为什么|为何|如何|怎样|怎么|是否|能否|有没有|有无).{0,24}(?:创建|生成|建立|搭建|搭(?:一个|一套|一张|个|套|张)|制作|构建|规划|实现出来|还原出来|做[一二两三四五六七八九十百零\d]+\s*[个套张份组版]|建)/u.test(text)) return null
  if (/^(?:请|帮我|麻烦)?(?:继续|再)?(?:修复|修改|更新|编辑|调整|优化|完善|核对)(?:当前|现有|已有|原有|原来|这个|此)/u.test(request) && !/(?:另外|另行|同时|并).{0,8}(?:创建|新建|新增|生成|建立|搭建|搭(?:一个|一套|一张|个|套|张)|制作|做[一二两三四五六七八九十百零\d]+\s*[个套张份组版]|建)/u.test(text)) return null
  if (/(?:优化|调整|修复|解释|设计).{0,20}(?:组件生成|工作台生成|生成逻辑|生成规则|生成功能)/u.test(text)) return null
  if (!shortBoardCard && /(?:在|修改|更新|编辑|调整)(?:当前|现有|已有|这个|此)(?:的)?(?:工作台|研究台|分析台|速查台|监测台|观察台|监控台|监控面板|行情面板|数据面板|研究面板|运营面板|分析面板|画布|看板|仪表盘)/u.test(text) && !/(?:另(?:建|创建)|新(?:建|的)?(?:工作台|研究台|分析台|速查台|监测台|观察台|监控台|监控面板|行情面板|数据面板|研究面板|运营面板|分析面板|画布|看板|仪表盘))/u.test(text)) return null
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
