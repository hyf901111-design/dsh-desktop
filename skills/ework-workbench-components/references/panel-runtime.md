# 工作台单面板生成摘要

同版 SKILL.md 及 Figma、适配验收、Runtime 规范摘要，仅供已定类型单卡。宿主 `21m-20260923-v1` 执行完整设计。仅交指定的一个 v1 JSON，不附分析/计划/代码围栏/其他组件，标准模板不用自定义 CSS 替代。

- 主要字段、数值、图例、单位、时间、来源和必要交互全保留。复用宿主证据，优先用其列出的当前会话可用专业工具覆盖需求，遵守工具授权/调用确认；仅补缺口，资料够即交付。真实数值/日期/链接须可核查；仅需求明确允许时使用并标注演示数据，不伪造实时行情或持续监控。
- 只填指定模板数据，不重复样式：金融数值用 `market.metrics`，可排序多标的明细用 `market.table`，真实详情 URL 可放逐行 `rowLinks`；金融趋势用 `market.trend` 的 `labels`/`series`。医药组合：侧栏对比 `market.scatter`、研发进度 `market.pipeline`、底部催化 `market.events`。K 线用 `market.candlestick`：单标的 `candles`，多标的 `datasets:[{symbol,name,candles}]`；无可核验日线时保留标的的 `candles:[]` 及 `missing` 原因。蜡烛为 `{date,open,high,low,close,volume}`；缺成交量填 `null` 并说明，不填零或编造。均线/标的切换/可用区间由宿主负责。K 线不用折线或自写 HTML；主要数据不塞进 `note`，缺失就地说明，保留已有有效内容。
- 通用自动布局选完整可读的最小规格：S 320×220、M 656×220、L 656×456；金融模板用 Figma 源节点尺寸。手动拉框保留宽高并重排，不缩整卡字号、不裁切或折叠隐藏主要字段、不重复宿主标题。
- 通用正文 12/18px；金融指标按源节点 `1217:225751` 用 DINPro 21/26px，金融外壳/表格各遵源节点，勿用通用 23/26px 或 12px 内边距覆盖金融模板。控件黑白灰；行情/风险色仅表达实际数据语义。支持深浅主题，来源、日期、单位就近标注。

结构化输入用type=form、代码阅读用type=code，均有宿主固定模板。form提供fields:[{id,label,kind,required,value}]，select提供options:[{value,label}]；仅保存本画布输入记录。code提供language和content字符串，不执行代码；JSON格式化、复制和下载由宿主完成。

世界时钟用type=clock，提供version:1/title/asOf和locations:[{id,label,timeZone}]，timeZone必须为有效IANA时区（如Asia/Shanghai、America/New_York）。mode默认live使用设备当前时间；固定时间用mode:snapshot及带Z或偏移的ISO currentTime。可选selectedId、hourCycle:h23或h12，宿主负责夏令时、跨日、城市切换和小时制。时钟更新时间不等于行情刷新时间。


YouTube视频用panel.type=youtube，首次同时提交artifact:{version:1,type:"youtube",title,url,description?,durationSeconds?,thumbnailUrl?,subtitles?}，使用source模式。不提供网址时url:null，宿主显示Figma网址输入空态；只使用用户原视频网址，不猜测视频、不生成HTML或逐卡任务。已取得的时长秒数、封面原网址、完整字幕和说明保留，未知资料不编造。支持watch、youtu.be、shorts、embed、live视频地址；宿主采用YouTube官方播放器，不自动播放，重新载入仅表示加载请求。

音频使用 panel.type=audio，首次提交 artifact:{version:1,type:"audio",title,url,description?,source?,date?,durationSeconds?,waveform?,transcript?,chapters?}。仅使用本人明确提供的无凭据HTTP/HTTPS音频原网址；未提供时url:null显示添加音频空态。时长单位秒，waveform仅为实际取得的0至1振幅数组，chapters:[{title,startSeconds}]，转写完整保留。未知时长、波形和转写不编造；不合成音频或HTML、不启动逐卡模型、不自动播放。采用source模式。 宿主保留完整转写、章节和来源，播放器控制随窄卡换行；会话切换暂停音频并记住当前进度、速度和音量，返回后由用户继续播放。重新加载只表示已请求加载音源，实际成功或失败由媒体事件显示。Figma 1918:353063，默认656×264，统一最小280×180；来源网址保存不代表应用重启后恢复临时播放进度。

文件使用 panel.type=files，图集使用 panel.type=gallery。首次同时提供完整 artifact:{version:1,type,title,items:[{id,name,url或relativePath,description?,source?,date?,sizeBytes?,mimeType?,alt?,permissions?:{preview?,download?,remove?}}]}，采用 source 模式，宿主直接 prepared，不生成HTML或逐卡模型。每项只允许一个原来源：本人明确提供的无凭据HTTP/HTTPS网址或当前工作目录内相对路径；未提供时url:null或items:[]，不编造样例。authorizationId仅由用户在客户端导入产生，模型不创建或猜测。保留完整长文件名、原0/负数/未知说明、原来源、图片alt和元信息。sizeBytes为真实字节数，未知省略或null，不补零。预览、下载、移除权限独立；移除只删本卡引用，原文件保留，可画布撤销恢复。Figma文件1918:347373默认656×410、图库1918:347930默认656×364，统一最小280×180；缩略图只用于浏览，原图预览和下载保持原始字节。导入进度显示实际完成文件数，失败可重试；已完成附件保存授权后可恢复，未完成导入不声称跨重启恢复。HTTP原文件下载不复用网页登录Cookie，不自动跟随重定向，单文件32MB；仅用户确认实际保存后显示成功，取消或失败如实显示。重新载入只请求原文件预览，不改写附件清单或生成新数据。
