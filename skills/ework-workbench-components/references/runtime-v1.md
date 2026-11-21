# EWork 运行时 v1 输出

开发或设计验收时先读目标 checkout 的 `packages/dsh-research-task-runtime/index.js`、`interactive-artifact.js`、`html-artifact.js` 及校验器，确认版本与支持类型。客户端生成子任务已由宿主提供当前 schema，不需要再查源码。本摘录来自 21M 的 11–15 板；运行代码与当前宿主 schema 优先于旧摘录。

外框/标题栏/图标/动作由真实模式的宿主负责，笔记继承Research同款；遵守本轮loader强制注入的组件宿主样式规则，不把来源实例的48px等尺寸复制成HTML外壳。JSON title只供宿主题名，HTML可保留业务分节标题与筛选。主题、语义控件、空态/错误和来源时间按宿主契约，创建成功不表示已获取数据。

- 最终组件是一个严格 v1 JSON 对象。`chart` 支持 `line|area|stackedArea|step|combo|bar|groupedBar|stackedBar|percentBar|horizontal|lollipop|dumbbell`，1–366 标签、1–12 系列且总数据点≤600，数值数组须等长。仅 groupedBar 可用 null 保留未提供的分类数值，整图至少有一个有限数值；容量不是固定色卡。字段为 `version:1,type:"chart",title,variant,labels,series:[{name,values}],unit,asOf`，可加 subtitle/note。combo 可加每组 kind:"bar"/"line" 且同轴同单位；percentBar 只交非负原值，unit 保留原始金额/数量单位（如百万元），不要改成 % 或说明文字；dumbbell 恰好两组。自定义模拟图表必须在工作台调用中提交这些明确虚构数据，不用行业样例代替用户指定的分类。`table` ≤12列/100行；`kpi` 1–12项；`markdown/mind-map` 内容 ≤32000 字符。缺失数值不伪造为 0 或未支持的 `null`。
- 构成与分布图同属 `type:chart`，公共字段 version/type/title/variant/unit/asOf，可选 subtitle/note。`pie/donut` 用 items:[{label,value}]，1–20项非负原值；`treemap/sunburst` 用 root:{name,children} 树，父节点只带 children、叶节点只带 value，最多5层150节点。`radar` 用3–8个labels与1–4个series，数值0–100，normalization说明同向评分口径。`histogram` 用1–600个 samples 与4–40的 binCount，或 bins:[{lower,upper,count}] 连续不重叠分箱；非等宽自动显示频数密度。`box` 用 groups:[{name,samples}]，宿主计算线性插值四分位及1.5×IQR须线；或 groups:[{name,low,q1,median,q3,high,outliers,count}] 加 whiskerMethod说明，不能混用。`bullet` 用 min/max、rows:[{label,value,target}]、bands:[{to,label}] 递增区间直至max。`gauge` 用 min/max/value 和可选target，数值均在固定范围内。以上数据在工作台模拟路径同样一次提交 artifact。
- 当前客户端还支持 `news/reports/calendar/dashboard` 等结构化类型；具体字段和容量按同轮宿主提示词执行。新闻、报告和日历保留真实条目、日期与可核查来源；dashboard 是有时点的数据快照，不把搜索失败说明当成指标。
- 金融标准组件支持 `market` 宿主模板：`metrics|trend|table|scatter|pipeline|events|candlestick|heatmap|breadth`，基金持仓工作台另有 `fund-kpi|fund-holdings|fund-industry` 来源模板。标准医药六卡模拟工作台用 `research_workbench_create` 的 `preset:"medical-21h"` 快路径，传 `panels:[]`。自定义数据仍用相应结构：散点 `xLabel/yLabel/items:[{label,x,y}]`，管线 `stages/items:[{name,target,stage,nextDate}]`，事件 `items:[{date,object,event,focus,window,status}]`。基金行业模板使用 `items:[{label,weight,benchmark}]`，三项均须齐全；穿透明细使用 `columns/rows`。趋势使用 `trend` 的 `labels` 和最多三组 `series`；K线使用 `candlestick` 的 `candles:[{date,open,high,low,close,volume}]`，不能用普通折线代替。模拟数据批量模式由宿主直接渲染，不启动每卡模型；金融组件按 `21m-20260923-v1` 模板及匹配 Figma 节点的尺寸、字体、主题呈现。
- `html` 只有 `version,type,title,html` 四字段；HTML ≤200000 UTF-8 字节，总 JSON ≤1250000 字节。HTML 自包含，主要信息写入初始标记；实际宿主会把 `html` 放进受限文档的 body，主题属性由宿主设置在外层 `html`。不要靠产物内层 `<html data-sherlock-theme>` 固定主题；可用内联 `<style>` 加正文，按宿主主题变量切换。无外部字体、样式、图片或网络请求。复杂交互按目标宿主的共享状态 API 和沙盒规则实现，不绕过限制。

- 真实证券行情优先 `financial-widget`：`{version:1,type:"financial-widget",widget:"quote",title,symbols:[{code,market:"SH|SZ|BJ|HK|US",name}]}`，工作台panel.type同名并首次附artifact。宿主补齐默认period/adjustment/indicators/market/query，直接复用组件库个股行情并每60秒刷新；不附报价或手写HTML。代码/市场由本人或实际来源确认；模拟、历史快照、对比及不支持资产保留对应market/chart模板。标准数据图表不能改成固定SVG拉伸页面；自定义图形须随实际宽高重绘，文字不跟随非等比缩放。
- 设计来源与验收属于旁车 `design-contract.json`、`validation.json`，不能加到运行时 v1 对象。若做生产交付，记录 sourceNodeId/属性/主题、数据案例、字体探测、目标尺寸、运行版本及可核对快照；自动门禁是否接入要如实报告。
- 标准金融、图表、表格、指标、列表先交宿主支持的结构化数据，由宿主统一控制视觉。必要的结构或交互确实无法由模板表达且宿主支持 HTML 时，才使用 HTML，并单独验收视觉。部分数据缺失时保留已核实内容并就近说明缺项；只有完全没有可交付的有效内容或运行能力确实无法表达需求时，返回 `{"version":1,"type":"error","message":"具体缺项"}`；不自行扩写 schema 或交付外观相近的伪成功对象。

直方图与箱线图共用样本：仅在箱线图 artifact.groups 中提供一次原始 samples；直方图 panel 增加 `samplesFromPanel:"箱线图的完整面板标题"`，其 artifact 省略 samples/bins，unit 与源一致。宿主合并源样本并保留重复观测。不要重复抄写导致缺项，不手写未核对的样本数；同一时点同指标的地区/产品拆分总额保持一致。

22A 新增图表契约：waterfall 使用 start:{label,value}、steps:[{label,delta}]、可选 endLabel，期末自动累计；funnel 使用2–12项同单位非递增 stages:[{label,value}]；sankey 使用2–5列 columns、nodes:[{id,label,column}]、links:[{source,target,value}]，最多40节点100边，只连相邻下一列、无重复边，中间节点守恒。scatter/bubble 使用 xAxis/yAxis:{label,unit} 和 points:[{label,x,y,group}]，气泡另加每点非负size及sizeLabel/sizeUnit，以面积编码。heatmap 使用2–16维 labels 与对称 values 方阵，对角线1、范围[-1,1]，缺失null。calendar 使用ISO start/end（≤366天）及 values:[{date,value}]，每日唯一非负值，未提供日期不视为0。candlestick/ohlc 使用日期严格升序 candles:[{date,open,high,low,close,volume}]（≤366条），价格unit与volumeUnit必填，高低包住开收，数值非负。均为type:chart公共结构，详情与主题由宿主负责。

21Z 运营模板：`type:progress` 用 `items:[{label,current,target,detail?}]`（1–20项，current非负、target>0），总进度由原始计数合计计算；可选unit/deadline/status。`type:tasks` 用 `items:[{id,title,completed,owner?,due?,priority?,detail?}]`（1–100条唯一id，completed为布尔值）。公共version:1/title/asOf，可选subject/note/mode。默认`mode:snapshot`只展示已有来源记录；明确个人画布清单用`mode:local`支持本地完成、撤销、添加和进度更新，不写外部业务系统、不声称原始来源已更新。自定义模拟规划须一次提交artifact，不用无关示例替代用户任务。宿主提供Figma 1918:344375/344860版式、三主题和中性控件。

21Z 审批与提醒模板：`type:approval` 使用 subject/status/applicant/submittedAt/items，步骤含唯一 id、reviewer、stage、status（pending/approved/rejected）、可选 comment/date。默认 snapshot 展示来源状态；mode:local 的同意/退回仅记录个人审阅意见，退回必须填理由，不改变来源审批状态。`type:alerts` 使用 items:[{id,title,summary,date,category,read}]，read 必须是布尔值；提供分类、未读筛选和内容展开，mode:local 支持本画布已读标记。两类均需 version:1/title/asOf 与实际需求记录，不编造外部系统写入或通知发送。宿主提供 Figma 1918:346911/354877 的三模式版式，控件保持中性。

21Z 通用表单：type:form，version:1/title/asOf/fields，每字段需唯一安全id、label、kind（text/textarea/select/number/date），可选required/value/help/placeholder/maxLength；select需options:[{value,label}]，number可设min/max。支持本地输入记录、字段旁校验和重置，不创建智能体任务、不向外部系统写入。代码：type:code，version:1/title/asOf/language/content，language为json/javascript/typescript/python/sql/text；保留原文，JSON可格式化并明确提示错误，用户主动复制与下载，不自动执行。来源 Figma 1918:354019/354512，三模式控制保持中性。

21Z 世界时钟：type:clock，version:1/title/asOf/locations，城市含唯一id、label、IANA timeZone。可选selectedId、hourCycle:h23或h12、note。mode默认live使用设备时钟；固定时刻需mode:snapshot和带Z或偏移的ISO currentTime。来源Figma 1917:353139，三模式中性控件、居中时间，按时区规则计算夏令时和跨日；固定快照明确标注，不能把时间变化写成行情刷新。


地域收入使用 `market.revenue-geography`，业务线收入使用 `market.revenue-business`，均按独立预置堆叠柱模板绘制。数据字段完整契约由父级创建工具与模板列表提供：datasets 是已取得公司/annual或quarterly组合；每组保留currency/unit/basis、覆盖complete或partial、periods的label/endDate/disclosedAt、totals原总收入、segments唯一id/name/等长values。null须totalMissing或missing解释，partial须coverageNote。完整已知分项合计须与来源总收入核对，不能造其他项补差，不把未知补0；负数、0及原币种原单位保留。分项颜色按id跨期稳定，业务图例分页；来源总收入与已知分项合计分开显示，占比仅以非零已知来源总额计算。

RSS/Atom 固定模板 type:rss，version:1/title/asOf/feeds。每源 {id,url,title,format:"rss"|"atom"|"unknown",fetchedAt:string|null,error:string|null,entries:[{id,title,url:string|null,summary,publishedAt:string|null,updatedAt:string|null}]}。首次可用 feeds:[]，通过添加默认订阅或添加公开 RSS 地址实际读取；最多10源/每源100条/完整JSON32KB。新闻原发布时间、更新时间与抓取时间分开；失败保留原条目，不编造或截断。

21Z 日程日历 type:calendar：version:1/title/items，0–40条完整 title、summary 或真实 url，可选 date/time/category；确定日期 YYYY-MM-DD，日期未知保留原文，不用抓取时间补日期。可选 asOf/note/month/timeZone。Figma 1918:345317，656×424、统一最小280×180；月历在上、当天安排在下，今天与前后月、来源展开、待定日期和本画布个人日程。个人记录20条/24KB、共享及只读禁止新增；不向外部日历预约。与 chart.calendar 的自然日热力契约分开。

日历首次完整提交直接 prepared。原文字段不改写；已提供的原文 URL 独立保留（模拟日历同样允许），不联网读取、不把链接拼入摘要。

- `kpi` 使用当前 EFund/Widget/KPI 1918:343978 源模板（656×286，三主题与内容自适应）。一次提交 version:1/type:kpi/title/items:[{label,value,unit?,change?,detail?,missing?,source?,url?}]；1–12项，完整JSON≤32KB，可加 subject/asOf/range/note/sources:[{name,url?}]。保留原0、负数、原单位、完整口径和来源；value允许有限数值、原字符串或null（null必须给missing原因），不得补零或套源设计的128/24等样例。用户明确提供的安全HTTP原文链接可独立保留，无须联网。刷新指标沿用组件真实数据源刷新；未绑定时打开数据源设置，不能以新时间戳或随机值伪装刷新。展开指标查看完整原字段。


嵌入网页使用 panel.type=iframe，第一次提交 artifact:{version:1,type:"iframe",title,url,description?}。未提供网址时显式 url:null，宿主显示添加网址空状态；只使用用户明确提供的 HTTP/HTTPS 网址，不猜测、不联网寻找替代、不生成 HTML 或逐卡任务。使用 source 模式，网站登录和浏览会话沿用客户端原生浏览能力。网页重新载入只表示已请求加载，不声称取数成功。


YouTube视频用panel.type=youtube，首次同时提交artifact:{version:1,type:"youtube",title,url,description?,durationSeconds?,thumbnailUrl?,subtitles?}，使用source模式。不提供网址时url:null，宿主显示Figma网址输入空态；只使用用户原视频网址，不猜测视频、不生成HTML或逐卡任务。已取得的时长秒数、封面原网址、完整字幕和说明保留，未知资料不编造。支持watch、youtu.be、shorts、embed、live视频地址；宿主采用YouTube官方播放器，不自动播放，重新载入仅表示加载请求。


总结提炼使用 panel.type=summary；思维导图使用 panel.type=mind-map。首次同时提交完整 artifact:{version:1,type,title,content,source:{title,text,nodeId?}}。content保留完整结果；source冻结一个所选组件的原标题和原文，用户直接提供材料时明确写“本人提供材料”。只有实际已知画布ID才填nodeId，不猜测来源链接。摘要分清事实、推断和待验证，不扩展到整个工作台，不增加来源没有的事实。导图只用一个“# ”根标题和两空格缩进的完整列表，不把普通正文悄悄丢弃；最多500节点。结果和原文独立保存，结果可编辑，来源可返回，支持三主题及内容适配。单项原文/结果各≤32000字符，完整JSON≤64KB。两类套用Figma 1918:343676/1917:357536，不生成HTML，不启动逐卡模型。

音频使用 panel.type=audio，首次提交 artifact:{version:1,type:"audio",title,url,description?,source?,date?,durationSeconds?,waveform?,transcript?,chapters?}。仅使用本人明确提供的无凭据HTTP/HTTPS音频原网址；未提供时url:null显示添加音频空态。时长单位秒，waveform仅为实际取得的0至1振幅数组，chapters:[{title,startSeconds}]，转写完整保留。未知时长、波形和转写不编造；不合成音频或HTML、不启动逐卡模型、不自动播放。采用source模式。 宿主保留完整转写、章节和来源，播放器控制随窄卡换行；会话切换暂停音频并记住当前进度、速度和音量，返回后由用户继续播放。重新加载只表示已请求加载音源，实际成功或失败由媒体事件显示。Figma 1918:353063，默认656×264，统一最小280×180；来源网址保存不代表应用重启后恢复临时播放进度。

文件使用 panel.type=files，图集使用 panel.type=gallery。首次同时提供完整 artifact:{version:1,type,title,items:[{id,name,url或relativePath,description?,source?,date?,sizeBytes?,mimeType?,alt?,permissions?:{preview?,download?,remove?}}]}，采用 source 模式，宿主直接 prepared，不生成HTML或逐卡模型。每项只允许一个原来源：本人明确提供的无凭据HTTP/HTTPS网址或当前工作目录内相对路径；未提供时url:null或items:[]，不编造样例。authorizationId仅由用户在客户端导入产生，模型不创建或猜测。保留完整长文件名、原0/负数/未知说明、原来源、图片alt和元信息。sizeBytes为真实字节数，未知省略或null，不补零。预览、下载、移除权限独立；移除只删本卡引用，原文件保留，可画布撤销恢复。Figma文件1918:347373默认656×410、图库1918:347930默认656×364，统一最小280×180；缩略图只用于浏览，原图预览和下载保持原始字节。导入进度显示实际完成文件数，失败可重试；已完成附件保存授权后可恢复，未完成导入不声称跨重启恢复。HTTP原文件下载不复用网页登录Cookie，不自动跟随重定向，单文件32MB；仅用户确认实际保存后显示成功，取消或失败如实显示。重新载入只请求原文件预览，不改写附件清单或生成新数据。
