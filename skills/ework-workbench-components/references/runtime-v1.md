# EWork 运行时 v1 输出

开发或设计验收时先读目标 checkout 的 `packages/dsh-research-task-runtime/index.js`、`interactive-artifact.js`、`html-artifact.js` 及校验器，确认版本与支持类型。客户端生成子任务已由宿主提供当前 schema，不需要再查源码。本摘录来自 21M 的 11–15 板；运行代码与当前宿主 schema 优先于旧摘录。

- 最终组件是一个严格 v1 JSON 对象。`chart` 只支持 `bar|line`、1–24 标签、1–6 系列，等长有限数值；≤6 是容量，不是六色色卡。`table` ≤12列/100行；`kpi` 1–12项；`markdown/mind-map` 内容 ≤32000 字符。缺失数值不伪造为 0 或未支持的 `null`。
- 当前客户端还支持 `news/reports/calendar/dashboard` 等结构化类型；具体字段和容量按同轮宿主提示词执行。新闻、报告和日历保留真实条目、日期与可核查来源；dashboard 是有时点的数据快照，不把搜索失败说明当成指标。
- 金融标准组件支持 `market` 宿主模板：`metrics|trend|table|scatter|pipeline|events|candlestick|heatmap|breadth`，基金持仓工作台另有 `fund-kpi|fund-holdings|fund-industry` 来源模板。标准医药六卡模拟工作台用 `research_workbench_create` 的 `preset:"medical-21h"` 快路径，不传 `panels`。自定义数据仍用相应结构：散点 `xLabel/yLabel/items:[{label,x,y}]`，管线 `stages/items:[{name,target,stage,nextDate}]`，事件 `items:[{date,object,event,focus,window,status}]`。基金行业模板使用 `items:[{label,weight,benchmark}]`，三项均须齐全；穿透明细使用 `columns/rows`。趋势使用 `trend` 的 `labels` 和最多三组 `series`；K线使用 `candlestick` 的 `candles:[{date,open,high,low,close,volume}]`，不能用普通折线代替。模拟数据批量模式由宿主直接渲染，不启动每卡模型；金融组件按 `21m-20260923-v1` 模板及匹配 Figma 节点的尺寸、字体、主题呈现。
- `html` 只有 `version,type,title,html` 四字段；HTML ≤200000 UTF-8 字节，总 JSON ≤1250000 字节。HTML 自包含，主要信息写入初始标记；实际宿主会把 `html` 放进受限文档的 body，主题属性由宿主设置在外层 `html`。不要靠产物内层 `<html data-sherlock-theme>` 固定主题；可用内联 `<style>` 加正文，按宿主主题变量切换。无外部字体、样式、图片或网络请求。复杂交互按目标宿主的共享状态 API 和沙盒规则实现，不绕过限制。
- 设计来源与验收属于旁车 `design-contract.json`、`validation.json`，不能加到运行时 v1 对象。若做生产交付，记录 sourceNodeId/属性/主题、数据案例、字体探测、目标尺寸、运行版本及可核对快照；自动门禁是否接入要如实报告。
- 标准金融、图表、表格、指标、列表先交宿主支持的结构化数据，由宿主统一控制视觉。必要的结构或交互确实无法由模板表达且宿主支持 HTML 时，才使用 HTML，并单独验收视觉。部分数据缺失时保留已核实内容并就近说明缺项；只有完全没有可交付的有效内容或运行能力确实无法表达需求时，返回 `{"version":1,"type":"error","message":"具体缺项"}`；不自行扩写 schema 或交付外观相近的伪成功对象。
