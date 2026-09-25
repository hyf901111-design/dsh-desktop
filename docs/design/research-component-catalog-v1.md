# 研究工作台：30 种常用数据组件

## 交付约束

模型只提供结构化数据、数据时点、单位、口径和来源。宿主选择下表的固定模板，校验必需字段后绘制；模型不能生成图表坐标、样式或交互脚本。来源未返回的数据保持缺失，不能为了满足模板补造数值。控件必须使用实际数据工作；没有足够数据的时间区间、筛选项和切换项须禁用或省略。

通用元素：标题由画布容器提供；组件内容保留数据时点、口径、单位、来源与缺失说明。图形组件还提供键盘可达的选点、数值提示及完整数据表；列表组件提供结果数和空筛选状态。来源链接仅指向已核验地址。

| # | 模板 ID | 必需内容 | 必需控件与交互 | 当前宿主实现 |
|---:|---|---|---|---|
| 1 | `market.quote-metrics` | 标的、最新价、涨跌、成交额、时点 | 指标详情、来源 | `market.metrics` |
| 2 | `market.candlestick` | 日期、开高低收、成交量或明确缺失 | 标的切换、可用区间、指针/键盘读数、完整表 | `market.candlestick` |
| 3 | `market.trend` | 日期、同量纲序列、单位 | 序列图例、指针/键盘选点读数、完整表 | `market.trend` |
| 4 | `market.valuation-scatter` | 标的、横纵轴值与口径 | 样本读数、图例、完整表 | `market.scatter`；键盘选点待加强 |
| 5 | `market.quote-table` | 代码、名称、价格、涨跌、时点 | 排序、详情链接、横向滚动 | `market.table` |
| 6 | `research.pipeline` | 项目、阶段、目标、下一节点 | 阶段说明、项目详情 | `market.pipeline`；详情待加强 |
| 7 | `research.catalyst-events` | 日期、对象、事件、关注点、状态 | 时间/状态筛选、详情 | `market.events`；筛选待加强 |
| 8 | `market.weighted-heatmap` | 标的、权重、变化率 | 悬停/键盘读数、图例、详情 | `market.heatmap`；键盘读数待加强 |
| 9 | `market.breadth` | 上涨、平盘、下跌数及指标 | 分布读数、指标详情 | `market.breadth` |
| 10 | `fund.kpi` | 基金/组合指标、数值、口径 | 指标详情 | `market.fund-kpi` |
| 11 | `fund.holdings` | 持仓标的、权重及数据期间 | 搜索、列排序、滚动 | `market.fund-holdings` |
| 12 | `fund.industry` | 行业、组合权重、基准权重 | 差值读数、排序/筛选 | `market.fund-industry`；筛选待加强 |
| 13 | `research.kpi` | 指标名、值、变化 | 指标详情 | 原生 `kpi` |
| 14 | `research.line` | 分类标签、同量纲序列 | 图例、选点、完整数据 | 原生 `chart.line`；选点待加强 |
| 15 | `research.bar` | 分类标签、同量纲序列 | 图例、选柱、完整数据 | 原生 `chart.bar`；选柱待加强 |
| 16 | `research.table` | 列名、完整行 | 排序、搜索、横向滚动 | 原生 `table`；搜索待加强 |
| 17 | `research.dashboard` | 指标、值、数据时点、口径 | 指标详情及来源 | `dashboard` |
| 18 | `research.news` | 日期、标题、摘要、分类 | 搜索、分类筛选、展开、来源 | `news` |
| 19 | `research.reports` | 日期、标题、摘要、分类 | 搜索、分类筛选、展开、来源 | `reports` |
| 20 | `research.calendar` | 日期、事件、摘要 | 月份切换、日期筛选、清除 | `calendar` |
| 21 | `research.gantt` | 任务、开始/结束、进度、负责人 | 时间定位、任务详情 | `gantt`；详情待加强 |
| 22 | `market.price-volume` | 日期、价格、成交量、量纲 | 时间范围、双图联动读数、完整表 | `market.price-volume`；客户端已验收选点和完整表，长区间控件待验收 |
| 23 | `market.order-book` | 买卖档位、价格、数量、价差、时点 | 档位数切换、逐档读数 | `market.order-book`；客户端已验收逐档读数，10 档切换待验收 |
| 24 | `market.fund-flow` | 时间或行业、流入/流出/净额 | 时间/行业筛选、读数、完整表 | `market.fund-flow`；待客户端验收 |
| 25 | `market.valuation-band` | 日期、估值分位区间、当前估值 | 时间区间、分位读数、完整表 | `market.valuation-band`；待客户端验收 |
| 26 | `fund.equity-drawdown` | 日期、净值、基准、回撤 | 时间范围、净值/回撤切换、完整表 | `market.equity-drawdown`；待客户端验收 |
| 27 | `research.allocation-donut` | 分类、数值、比例、总量 | 图例筛选、选片读数、完整表 | `market.allocation-donut`；待客户端验收 |
| 28 | `research.waterfall` | 起点、分项增减、终点、单位 | 分项读数、完整表 | `market.waterfall`；待客户端验收 |
| 29 | `research.funnel` | 阶段、数量、转化率 | 阶段详情、完整表 | 待新增固定模板 |
| 30 | `research.risk-matrix` | 风险项、发生概率、影响等级 | 等级筛选、单项详情、完整表 | 待新增固定模板 |

## 实施顺序

先完成前 21 种已有宿主模板的交互缺口与真实客户端验收；再按 22–30 的数据结构增加固定模板。新模板接入时同步扩展面板类型校验、提示词、内容尺寸和深浅主题，并用实际数据或明确标注的模拟数据验收控件。不得把同一基础图表改名充当未实现的模板。

2026-09-26 客户端验收：本地包在“模拟证券工作台面板规划”一次生成 2 张独立 market 卡。量价图显示 10 个时点，方向键从 15:00 切至 14:30 并更新价格/成交量读数，完整表展开后保留 10 行。盘口卡点击“卖3”更新为 12.75 CNY、1500 手。该次数据为明确标注的模拟值，短样本下近 1 月等区间与“全部 5 档”按数据量禁用。较长样本的区间/10 档切换由聚焦自动测试覆盖，尚需客户端验收。
