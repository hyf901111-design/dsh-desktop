# 工作台单面板生成摘要

本摘要从同版 SKILL.md、figma-21m.md、adaptation-and-acceptance.md、runtime-v1.md 提取，仅供已确定类型的单面板生成；完整设计规范由宿主 `21m-20260923-v1` 模板执行。直接交付宿主指定的一个 v1 JSON 对象，不输出分析过程、计划、代码围栏或额外组件。不要在标准组件中生成自定义 CSS 来替代模板。

- 保留面板需求中的主要字段、数值、图例、单位、时间、来源与必要交互。先使用宿主已取得的证据；缺什么才检索什么，取得可用资料后立即交付。真实数值、日期和链接必须有可核查依据；只有需求明确允许时才使用并标注演示数据，不伪造实时行情或持续监控。
- 选择宿主指定的图表/列表语法：金融数值用 `market.metrics`，金融趋势用 `market.trend` 的 `labels`/`series`，金融明细用 `market.table`；医药组合的侧栏对比用 `market.scatter`（`xLabel/yLabel/items:[{label,x,y,size?}]`），研发进度用 `market.pipeline`（`stages/items:[{name,target,stage,nextDate}]`），底部催化用 `market.events`（`items:[{date,object,event,focus,window,status}]`）。K 线必须选 `market.candlestick`，提供 `candles:[{date,open,high,low,close,volume}]`，不得用折线或自写 HTML 代替。不要为同一金融工作台输出通用 `chart`/`kpi`/`dashboard`/`table`。缺失字段在对应位置说明，保留已有有效内容，不用整卡错误文案代替研究结果。
- 通用自动布局按内容选能完整阅读的最小规格：S 320×220、M 656×220、L 656×456；金融模板使用 Figma 源节点尺寸而非通用 S/M/L。手动拉框保留用户宽高并重排内容。不缩小整卡字号，不裁切、折叠隐藏主要字段，不重复宿主标题。
- 通用正文 12/18px；金融指标值按源节点 `1217:225751` 为 DINPro 21/26px，金融外壳和表格按各自源节点，不把通用 23/26px 和 12px 内边距覆盖到金融模板。组件控件黑白灰；行情和风险的业务色只表达实际数据语义。支持深浅主题，来源、日期、单位就近标注。
