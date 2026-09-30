# 工作台单面板生成摘要

本摘要从同版 SKILL.md、figma-21m.md、adaptation-and-acceptance.md、runtime-v1.md 提取，仅供已确定类型的单面板生成；完整设计规范由宿主 `21m-20260923-v1` 模板执行。直接交付宿主指定的一个 v1 JSON 对象，不输出分析过程、计划、代码围栏或额外组件。不要在标准组件中生成自定义 CSS 来替代模板。

- 保留面板需求中的主要字段、数值、图例、单位、时间、来源与必要交互。先使用宿主已取得的证据；若宿主列出当前会话可用的专业数据工具，优先选覆盖需求的工具取数，并遵守客户端的工具授权与调用确认；缺什么才补查什么，取得可用资料后立即交付。真实数值、日期和链接必须有可核查依据；只有需求明确允许时才使用并标注演示数据，不伪造实时行情或持续监控。
- 组件类型确定后仅填充宿主指定的模板数据，不重复设计样式：金融数值用 `market.metrics`，可排序的多标的明细用 `market.table`，有真实详情 URL 时可为每行提供 `rowLinks`；金融趋势用 `market.trend` 的 `labels`/`series`。医药组合的侧栏对比用 `market.scatter`，研发进度用 `market.pipeline`，底部催化用 `market.events`。K 线使用 `market.candlestick`：单标的填 `candles`，多标的填 `datasets:[{symbol,name,candles}]`；某标的无可核验日线时保留 `candles:[]` 和 `missing` 原因。蜡烛为 `{date,open,high,low,close,volume}`，未取得的成交量填 `null` 并说明，不能填零或编造。宿主模板负责均线、标的切换和可用区间。不要用折线或自写 HTML 代替 K 线，也不要把主要数据塞进 `note`。缺失字段在对应位置说明，保留已有有效内容。
- 通用自动布局按内容选能完整阅读的最小规格：S 320×220、M 656×220、L 656×456；金融模板使用 Figma 源节点尺寸而非通用 S/M/L。手动拉框保留用户宽高并重排内容。不缩小整卡字号，不裁切、折叠隐藏主要字段，不重复宿主标题。
- 通用正文 12/18px；金融指标值按源节点 `1217:225751` 为 DINPro 21/26px，金融外壳和表格按各自源节点，不把通用 23/26px 和 12px 内边距覆盖到金融模板。组件控件黑白灰；行情和风险的业务色只表达实际数据语义。支持深浅主题，来源、日期、单位就近标注。

结构化输入用type=form、代码阅读用type=code，均有宿主固定模板。form提供fields:[{id,label,kind,required,value}]，select提供options:[{value,label}]；仅保存本画布输入记录。code提供language和content字符串，不执行代码；JSON格式化、复制和下载由宿主完成。

世界时钟用type=clock，提供version:1/title/asOf和locations:[{id,label,timeZone}]，timeZone必须为有效IANA时区（如Asia/Shanghai、America/New_York）。mode默认live使用设备当前时间；固定时间用mode:snapshot及带Z或偏移的ISO currentTime。可选selectedId、hourCycle:h23或h12，宿主负责夏令时、跨日、城市切换和小时制。时钟更新时间不等于行情刷新时间。
