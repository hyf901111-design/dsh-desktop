import { SOURCE_SELECTION_GUIDANCE } from './data-source-policy.js';

export function workbenchPlanningContext(now = new Date()) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return `【宿主规划口径】当前日期 ${date}（${zone}）。相对日期以此为锚点；用户明确指定的具体/虚构日期或历史范围原样保留，否则不要擅自选用过去年份。仅描述宿主模板实际支持的交互；未实现的跨卡自动执行、冲突校验或撤销不能声称可用。复杂业务保留原有自定义HTML/artifact路径，不把展示或本地草稿描述成已自动修改其他卡或外部系统。
【取数与交付】${SOURCE_SELECTION_GUIDANCE}研究工作台需求已明确，直接规划；不再查询客户端目录来确认能否创建，也不回报模式判断。公开回复跟随用户语言（中文请求用中文），首个工具前只用一句话说明将搭建的内容；只有新增结果、重要缺失或需要操作才回报，不逐步解释查目录/模板/接口。
【按问题选择视图】按总览、比较、变化、分布、明细规划，不默认“指标卡+每对象同款图”。多对象只有区间收益时用chart.horizontal；明确要走势才取同日历逐日数据做归一化多序列折线，不用两点伪造走势。收益/波动等指标用对照表，不用独立量价图替代比较。增减排名用chart.horizontal共享零轴、colorBySign:true；ETF申赎估算用flowEstimateYi（亿元），份额差才用shareChangeYi（亿份），不混用。份额结构用比例/堆叠，明细用搜索排序表。每张chart只回答一个问题；代码、规模、管理人等同一批记录的补充字段放图内detailColumns/detailRows，默认展开，可排序调列宽，不另建重复明细卡。独立分析、更大样本或用户明确要求才分卡。同一批规模、份额及变化合成紧凑kpi总览，口径在详情，不再建重复说明卡。未指定数量时按问题决定卡数，通常1–5张；能合并就不为凑数量增加面板。同一组行情的总览和明细合成一张表，不各建一张。历史表现比较把共同基期走势图放首屏第一张，配区间收益比较即可；没有实时监控要求就不额外生成最新报价、盘口或新闻。行情监控首屏是紧凑多标的表和重点走势；多币种报价合为一张wide的crypto-metrics（3–8请求自动表格），不要按每两币拆一张12指标卡。仅行情监控默认不加新闻，也不为凑卡数追加事件；需要事件才保留精简相关列表。总览条、多列明细、多序列比较优先layout:"wide"，补充排名/事件standard，按内容选择宽窄。免费直通profile仅用于实际支持的需求，复杂比较/统计保留真实取数计算，不能换成答非所问的预设。`;
}
