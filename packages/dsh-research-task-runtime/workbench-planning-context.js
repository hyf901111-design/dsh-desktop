// Also serialized into the renderer. This describes the proposed information
// structure before the model responds; only a submitted plan creates cards.
export function generalFuturesWorkbench(request) {
  return typeof request==='string' && /^(?:(?:请|帮我|给我|为我|我想|我需要|生成|搭建|创建|构建|制作|做|一个|一套|国内|中国|商品|\s)+|(?:please\s+)?(?:build|create|generate)\s+(?:an?\s+)?)?(?:期货(?:及其|及|与|和|和其)?衍生品|商品期货|期货|futures)(?:市场)?\s*(?:研究|分析|research)?\s*(?:工作台|看板|dashboard|workbench)[。.!！\s]*$/iu.test(request.trim())
}

export function initialWorkbenchInformationPlan(request, english = false) {
  if (typeof request !== 'string' || !request.trim()) return ''
  const text = request.normalize('NFKC')
  const say = (zh, en) => english ? en : zh
  const portable = /整页.{0,6}(?:带走|下载|导出)|(?:生成|导出|下载|带走|保存).{0,8}(?:独立网页|网页文件|HTML\s*文件)|\b(?:portable|downloadable|standalone)\s+(?:web\s?page|HTML)\b/iu.test(text)
  const sharedInputs = /改.{0,10}(?:计算|重算|就能算|联动)|共享(?:参数|输入)|参数联动|\b(?:recalculate|shared inputs?)\b/iu.test(text)
  if (portable && sharedInputs && !/不要|禁止|不需要|取消|\b(?:without|do not)\b/iu.test(text)) {
    return /预算|人均|\bbudget\b/iu.test(text)
      ? say('会把可改的预算项、人数和方案对比放进同一张网页。改动输入就能核对新的总价与人均费用，也可以从看板下载整页。', 'I’ll put the editable costs, group size and scenarios on one downloadable page so you can compare totals and per-person costs as you change the inputs.')
      : say('会把共用的输入、计算和比较结果放在同一张可交互网页中，在看板内操作，也可以下载整页。', 'I’ll put the shared inputs, calculations and comparisons on one interactive page that you can use on the board and download.')
  }
  if (/附件|上传|原型|仅用|只用|只根据|仅根据|离线|不联网|禁止联网|\.xlsx?\b|\.csv\b|\.docx?\b|\.pdf\b|\b(?:offline|attached|uploaded|prototype)\b/iu.test(text)) {
    return say('先从指定材料提取对象、指标和来源。可比较的记录进入图表，原文和依据放在同卡的详情中。', 'I’ll extract the subjects, measures and sources from the specified material, chart comparable records, and keep the original evidence in the card details.')
  }
  if (/禁止|不要|不需要|仅限|只需|只看|只做|只要|仅做|\b(?:only|exclude|without|do not)\b/iu.test(text)) return ''
  const futures = /期货|\bfutures\b/iu.test(text)
  const specialized = /期权|股指|中金所|大商所|郑商所|广期所|外盘|境外|海外|盘中|分钟|分时|历史|回测|回放|[12]\d{3}年|\b(?:CME|CFFEX|DCE|CZCE|GFEX|intraday|historical|options)\b/iu.test(text)
  const broadFutures = generalFuturesWorkbench(text)
  const ideas = []
  if (/待办|任务清单|\b(?:to-do|todo|checklist)\b/iu.test(text)) {
    ideas.push(say('先把待办整理成可添加、勾选的清单。已给出的事项直接放进去，空清单可以从第一件事开始填。', 'I’ll set up a checklist you can add to and mark complete, starting with any tasks you supplied.'))
  }
  if (futures) {
    ideas.push(!specialized && (broadFutures || /上期所|能源中心|上海期货交易所/iu.test(text))
      ? say('行情先按品种比较近远月结算价，再切到持仓分布或逐合约明细；上期所和能源中心这部分按交易日报更新。', 'For SHFE and INE, I’ll organize daily settlements by product, with a maturity curve, open interest and contract details in the same card.')
      : say('行情先区分市场、合约和所需时点，再用同口径的价格或持仓做对照；每张行情卡会注明数据日期。', 'I’ll match each market and contract to the requested dates, then compare like-for-like prices or open interest and label each observation date.'))
  } else if (/汇率|美元(?:兑|换)人民币|\b(?:USD\s*[/／]\s*CNY|exchange rates?)\b/iu.test(text)) {
    ideas.push(say('先核对货币对、报价方向和数据频率，把最近一次报价和历史走势放在一起，并标出报价日期。', 'I’ll check the currency pair, quote direction and frequency, and show the latest dated observation alongside its history.'))
  } else if (/比较|对比|排名|排行|筛选|compare|rank/iu.test(text)) {
    ideas.push(say('先统一对象、单位和统计区间，用排序图定位差异，再从明细核对数值。', 'I’ll align the subjects, units and dates, show differences in a ranked comparison, and keep the values available for inspection.'))
  } else if (/趋势|走势|时序|历史|监测|监控|trend|monitor/iu.test(text)) {
    ideas.push(say('先确定跟踪指标、时间范围和数据频率，趋势图与逐期明细共用同一组记录。', 'I’ll identify the measure, date range and update frequency, then use the same observations for the trend and the period-by-period detail.'))
  }
  if (/关系|结构图|架构|路径|产业链|传导|hierarchy|relationship/iu.test(text)) {
    ideas.push(say('对象之间的层级或传导关系用关系图呈现，保留每条关系的依据。', 'I’ll map the hierarchy or transmission paths and keep the evidence behind each relationship.'))
  }
  if (broadFutures || /资讯|新闻|要闻|公告|舆情|news|headlines|announcements/iu.test(text)) {
    ideas.push(say('同一主题的新闻事件集中浏览，点标题可读原文。持续跟踪时使用可搜索、可刷新的列表。', 'I’ll group news on the same topic into a searchable, refreshable feed with dated entries and links to the originals.'))
  }
  return ideas.join(english ? ' ' : '')
}

export function workbenchPlanningContext(now = new Date(), request = '') {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const initialPlan = initialWorkbenchInformationPlan(request);
  return `【宿主规划口径】当前日期 ${date}（${zone}）。相对日期以此为锚点；用户明确指定的具体/虚构日期或历史范围原样保留。仅描述实际支持的交互；未实现的跨卡自动执行、冲突校验或撤销不能声称可用。${initialPlan ? '\n首条回执已展示初步的信息结构：' + initialPlan + ' 依据实际覆盖调整，正文直接补充新判断。原生面板已有的品种切换、曲线和明细不另做静态重复卡，用户明确要求独立展示时除外。' : ''}
【先设计信息入口】先用一两句向用户说明准备让他看什么、比较什么、如何追踪变化。由用户要做的判断反推出各卡的研究问题、对象、取数来源、更新节奏和首屏交互，再开始查资料。持续监测用覆盖该对象的原生可刷新面板或成功请求的可重放绑定；指定历史区间保留快照，知识框架作为参考。行情、资讯、公告按各自发布节奏，刷新时点和数据时点分开。
【取数与交付】确认指定来源、范围和联网限制后，直接挂载已有原生入口；同批历史记录用已有授权工具取得。只使用已暴露的真实工具名和已发现的参数 schema；统计在可用工具或脚本中计算，模型接收完整汇总字段和来源定位，原始明细保留可读取的文件引用，不逐卡重复注入。再按实际内容决定呈现。多卡复用同一份数据，保留来源、日期、单位和真实缺失，不为迁就模板改动问题或补造数据。正文、明细或可视化可提交 panel.content；多卡共享 sharedDatasets/view，完整组件可用 artifact；原生能力不足时保留自定义 HTML。实际取得内容前不把占位、规划受理或来源目录当作完成。
【按问题选择视图】每卡回答一个问题。同一对象、指标和期间的重复小卡或列默认合并，保留用户明确要求的独立卡及对照。已核验的核心走势和总览放在通用背景之前。保留完整实有记录和层级；数量、日期和单位必须可比较，缺失不冒充零。观察趋势时把同一指标的可比期间绘成折线。横向比较时按所问指标排列条形，完整明细在同卡展开。分类名录、单位不兼容或用户明确要求表格时使用原表。有依据的组成关系用原生关系图，同一主题的多个栏目在卡内切换，完整材料在详情阅读。核心数据缺失时只给简短缺口，其他已可用信息照常交付。类型和尺寸依据内容与所需交互确定。自定义组件使用可点击和键盘操作的筛选器与页签，正文和标题对齐。搜索、计数与来源之间留出间距，窄卡换行。为图例、坐标标签、可换行的选中值与来源栏分别留出阅读空间，自动整理时按实际内容定高，长明细单独滚动。跟随用户语言，仅回报新增结果、重要缺失或必要操作。`;
}
