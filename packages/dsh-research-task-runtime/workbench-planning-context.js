export function workbenchPlanningContext(now = new Date()) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return `【宿主规划口径】当前日期 ${date}（${zone}）。相对日期以此为锚点；用户明确指定的具体/虚构日期或历史范围原样保留，否则不要擅自选用过去年份。仅描述宿主模板实际支持的交互；未实现的跨卡自动执行、冲突校验或撤销不能声称可用。复杂业务保留原有自定义HTML/artifact路径，不把展示或本地草稿描述成已自动修改其他卡或外部系统。
【按问题选择视图】先区分总览、比较、变化、分布、明细，不默认“若干指标卡+每对象一张同款图”。多对象表现比较优先同起点归一化多序列折线及区间收益/波动对照，不用三张独立量价图替代比较；申赎或增减排名用共享零轴的正负横条，保留符号；份额结构用比例/堆叠，详细记录用可搜索排序表。只在需求包含汇总读数时使用紧凑kpi，不为每对象重复造指标卡。每张chart明确一种变体和一个主要问题，不能同时要求折线、柱图和表格。多列明细、多序列比较、总览条可设layout:"wide"，补充排名/事件卡standard；宽窄按内容选择，不强行每卡同宽。免费直通profile仅覆盖其实际能力，复杂比较/统计保留真实取数与计算流程，不能换成近似但答非所问的预设。`;
}
