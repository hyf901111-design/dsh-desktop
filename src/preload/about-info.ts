export type SherlockAboutLocale = 'zh' | 'en'

export type SherlockReleaseNote = {
  version: string
  date: string
  title?: string
  items: string[]
}

export type SherlockAboutInfo = {
  productName: 'EWork Odyssey'
  version: string
  releaseNotes: SherlockReleaseNote[]
}

type ManualUpdateChecker = () => Promise<UpdateStatus>

const releaseNotes: Record<SherlockAboutLocale, SherlockReleaseNote[]> = {
  zh: [
    {"version": "1.0.5", "date": "2026-09-21", "items": ["修复组件定时任务关闭右侧栏后露出原面板的问题，重新展开时保留任务设置", "定时任务页签纳入已打开页签菜单，切换与选中状态保持一致", "对话页签新增图标，页签宽度贴合内容，拥挤时优先显示当前页签并缩略其他文字", "保持页签图标尺寸，仅选中的可关闭页签显示关闭按钮", "优化协作成员弹层背景与阴影，减少头像下方的残影色块"]},
    {"version": "1.0.4", "date": "2026-09-21", "items": ["新增全局定时任务，可设置执行时间、重复频率与通知，并查看运行记录", "画板组件支持独立定时更新，在组件更多菜单中设置任务，标题时钟标识显示任务状态", "定时任务管理支持组件任务筛选与类型标签，统一运行、暂停、恢复和删除操作", "优化定时任务页签切换、菜单层级、任务描述输入框与时间编辑器的关闭操作", "从对话进入研究模式时，底部工具栏自然上滑淡入；切换画板时保持稳定"]},
    {"version": "1.0.3", "date": "2026-09-21", "items": ["桌面画笔和坐标点击改为目标窗口后台执行，不再主动移动系统鼠标", "完善后台窗口输入准备，提升窗口失去活动状态后的点击与连续画笔稳定性", "修复桌面控制空闲一段时间后应用和窗口查询持续失败的问题", "Mac 锁屏或休眠时停止桌面输入，解锁后可继续发起任务", "改进桌面操作错误提示，并修复成功观察后仍累计连续失败次数的问题"]},
    {"version": "1.0.2", "date": "2026-09-20", "items": ["优化多人协作画板切换，点击后立即进入画板，加载内容时显示居中的小尺寸圆环提示", "减少画板重复加载请求，完善加载失败重试与快速切换时的状态处理", "修复框选边线部分边缘发灰，统一蓝色描边并对齐屏幕像素", "缩小右侧会话正文与输入框两侧留白，提高窄屏空间利用率", "修复下载更新并重启后，消息图标旁的下载图标长时间残留"]},
    {"version": "1.0.1", "date": "2026-09-19", "items": ["修复左侧栏看板区与工作区标题遮罩漏缝，滚动时完整遮挡标题下方文字，保留柔和渐隐效果", "客户端宽度低于1280像素时，新建看板或进入研究模式自动收起左侧栏；手动展开后切换看板或模式保持展开"]},
    {"version": "1.0.0", "date": "2026-09-19", "items": ["新增桌面操作能力：在授权后打开并操作 macOS 应用，支持观察窗口、点击、输入、拖拽和连续画笔；需使用支持图片输入的模型", "优化桌面操作的截图、窗口定位和批量笔画执行，增加停止入口、超时与重复失败保护，减少长时间无效操作", "对话模式支持在右侧浏览器打开网页、搜索及操作页面；改进已登录网页和懒加载正文读取，页面随侧栏宽度自适应", "统一浏览器与画板中的智能助理光标和标签，任务结束后自动淡出，修复标签居中与窄栏裁切", "内置 PPT 制作技能升级至 1.1.1：修复 PowerPoint 打开修复提示与封底乱码，封面副标题统一为 18pt，强化颜色、阴影、目录、间距、单字换行和留白检查", "优化会话输入区及任务清单布局，移除多余遮挡；长消息自动换行并限制最大宽度，短消息靠右按内容收窄", "修复侧栏标题遮挡、项目拖拽反馈延迟、左上角窗口拖动与 Logo 光标；补齐链接组件操作按钮并修复菜单展开时的选中描边", "修复正文文件在 Finder 中定位错误，完善文件修改前补读与任务清单参数错误的恢复提示"]},
    {"version": "0.9.14", "date": "2026-09-17", "items": ["增强协作画板交互组件的实时状态同步生成约束，统一通过共享状态通道处理多人操作和持续运行状态", "新增生成结果校验与自动修复，减少组件只同步开始按钮、后续状态各自运行的问题", "修复将“实时联机”“当前状态”等组件需求误判为外部最新数据检索的问题", "已有未接入共享状态的组件需重新生成或更新需求后使用联机同步"]},
    {"version": "0.9.13", "date": "2026-09-17", "items": ["新建看板根据首条任务自动命名，看板更多菜单新增删除入口", "画布底栏改为统一图标工具栏，支持选择、框选创建组件、添加链接与语音创建", "框选创建后自动返回选择工具并保留画布焦点，生成内容后保持用户指定的组件尺寸", "统一组件选中描边与圆角，修复链接组件框选、层级和整理画布时的位置问题", "增强网页组件兼容性，支持 Google、Bing 等网页在组件内显示，并优化缩放及选中切换时的显示稳定性", "组件工具栏及右侧会话引用可读取网页正文，生成或发送前刷新页面内容", "账户信息页新增退出登录入口，登录处理中提示改为正文颜色", "消息中心的标记已读移至卡片右上角，以文字按钮显示", "新增通用组件共享状态同步，支持多人操作、持续状态更新、晚加入与断线接管；旧组件需重新生成或改造接入"]},
    {"version": "0.9.12", "date": "2026-09-17", "items": ["修复协作对话中本人和其他成员的署名、气泡、复制按钮与时间对齐，明确显示智能助理归属", "统一右侧对话操作图标尺寸，优化执行过程、正文和复制按钮间距，提高用户名与子智能体历史卡片的可读性", "修复宽表横向滚动条缺失，增大表格辅助文字并优化历史卡片间距", "修复五子棋等画布组件的点击坐标同步，支持跨成员落子、悔棋及重开后的状态恢复", "协作成员菜单支持再次点击收起，管理与邀请弹窗支持点击蒙版关闭", "文件目录和搜索结果支持手动刷新，以按钮旋转显示刷新过程，不再显示成功提示文字"]},
    {"version": "0.9.11", "date": "2026-09-17", "items": ["修复侧栏更新按钮点击反馈，立即显示下载进度圆环和气泡", "下载完成后明确显示正在校验解压及自动重启提示", "修复下载期间消息中心全部与未读切换、详情点击失灵，详情直接打开设置关于页", "消息卡片增加标记已读按钮，未登录时隐藏协作邀请登录提示", "补齐关于页0.9.10更新日志并加入0.9.11更新说明"]},
    {"version": "0.9.10", "date": "2026-09-17", "items": ["优化会话与画板切换性能，离屏HTML组件按需加载并保留交互状态", "协作画板右侧复用普通对话的原生过程展示、工具详情和回复样式", "修复协作任务结束后回复未及时显示的问题", "插队完成后自动续跑原任务，原消息、执行过程和回复一起显示在后方", "组件子智能体的独立任务采用区别于主对话的样式", "内置PPT制作技能升级至1.0.9：封面副标题不加粗、去除目录首行上方横线、增加左文右图版式"]},
    {"version": "0.9.9", "date": "2026-09-16", "items": ["协作看板由每位用户的主智能体负责右侧对话，保留原生子智能体委派能力", "画板组件内容由独立子智能体生成，进度与结果同步到对话流，不占用主对话队列、不被对话插队误停", "新增跨用户共享消息队列，显示发送者姓名，支持编辑、删除与插队；插队消息完成后自动继续原任务", "修复共享看板任务未绑定画板及子智能体未结束便交接的问题，服务版本不兼容时明确提示", "个人看板支持右键刷新，完善组件操作与图片预览兼容", "优化右侧PPT原地缩放与文件定位，正确定位子目录中的文件链接", "修复任务结束后清单持续转圈，执行过程中及时核对任务进度", "内置PPT制作技能升级至1.0.8，完善目录紧凑行距检查与交付校验"]},
    {"version": "0.9.8", "date": "2026-09-16", "items": ["看板对话分叉时自动收录真实文件夹为工作区项目，修复未分组及文件目录报错", "空白新看板作为临时草稿，未对话或添加组件时切走自动消失，不提前创建目录", "优化侧栏选中与悬停背景，隐藏会话更新时间，改善列表阅读", "完善自动更新入口、直接下载、圆环进度及详情气泡，兼容侧栏收起状态", "优化右侧窄栏补充问题卡片；选项提供30秒倒计时，未选择时按推荐方案继续，开始作答后停止倒计时", "修复选中组件内按住Command滚轮缩放画板失效", "修复会话文件链接误开到底部及相对路径图片破图，统一在右侧预览PNG、SVG等文件", "右侧全部页签压缩显示，拥挤时保留当前页签居中的关闭按钮", "修复工具图片展示及纯文本模型续跑兼容，保留原始会话记录"]},
    {"version": "0.9.7", "date": "2026-09-16", "items": ["更新首次启动欢迎页，采用新的品牌插画与欢迎文案", "看板区固定使用画板模式，优化协作任务启动提示；发送消息后立即清空输入，失败时安全恢复", "侧栏改为整体滚动，标题吸顶并渐隐遮挡下方内容，修复快速滚动时文字穿透", "统一搜索看板区和工作区会话标题，按区域分组显示，固定搜索框位置并支持点击外部关闭", "简化侧栏标题操作，默认按类型分组、手动排序，更新的会话自动前移", "账户信息增加用户ID显示与复制；完善协作邀请和版本更新提醒", "优化消息中心位置、卡片颜色与紧凑布局，切换全部和未读时保持尺寸稳定", "统一思维导图样式，放大组件工具栏并压紧菜单间距，将画板提示集中到底部工具栏上方", "修复顶栏菜单点击空白处无法关闭，以及弹窗边框延迟显示问题", "取消额外聚焦高亮，保留输入框常驻浅边框、状态提示和组件选中蓝框"]},
    {
      version: '0.9.6',
      date: '2026-09-15',
      items: ["新增研究看板协作、成员权限管理与共享对话，缩小权限菜单触发区域","组件交互状态随看板保存并同步，复制为个人研究时保留已有状态","拖入资料自动复制到对应目录；协作看板和返回工作区的看板自动补齐项目目录","修复协作文件同步导致的研究看板暂时不可用问题","新增和粘贴组件默认置顶，保存与协作同步后保持层级；统一无描边外框和顶栏间距","工具详情和生成文件预览统一使用全局右侧页签，修复文件列表与历史文件预览入口","完善中英文文案和语言切换，优化英文页签、按钮宽度与简洁登录文案","统一对话正文左右边距，增强任务执行期间模式选择器的禁用样式","产生对话后隐藏输入框上方选择器，完善画板资料绑定后的项目状态","增强组件生成恢复、矩阵排列和完成后的画布整理，保留真实数据缺失提示","完善登录注册界面及浅色菜单，优化通知、组件操作与顶部拖动区域","增强首页灰度渐变动态，流动速度提高50%，局部形变幅度增强30%"]
    },
    { version: '0.9.5', date: '2026-09-09', title: '模式与交互优化', items: ['修复顶部模式按钮点击与子代理入口位置', '切换空白会话时同步顶部和输入区的模式状态', '中文界面下斜杠命令菜单名称和说明完整汉化'] },
    {
      version: '0.9.5',
      date: '2026-09-09',
      items: ["修复顶部模式按钮点击与子代理入口位置", "切换空白会话时同步顶部和输入区的模式状态", "中文界面下斜杠命令菜单名称和说明完整汉化"]
    },
    {
      version: '0.9.4',
      title: '研究与文件体验',
      date: '2026-09-09',
      items: ["历史消息将文件显示为行内标签，与句子自然排列和换行，隐藏文件路径", "点击历史文件标签可展开右侧侧边屏并预览会话已附带的文件", "统一模式标签与菜单图标，已有聊天和研究顶部支持在任务空闲时切换模式", "缩小拖入研究画板的文件组件标题字号，改善长文件名显示", "增加无法预览文件卡片的图标留白，将组件右上角操作按钮向右调整", "隐藏研究组件及内嵌内容的滚动条，保留正常滚动操作"]
    },
    {
      version: '0.9.3',
      date: '2026-09-08',
      items: ["画布容器和语音创建接入金融查数工具，可按需求查询股票、指数、ETF 和基金数据", "金融组件优先使用结构化行情数据，明确行情时间、数据口径及缺失或暂不支持的能力", "模式选择菜单增加图标，优化当前选中项的背景与布局", "缩小发送按钮，优化输入区域的视觉比例", "优化智能容器表单，提亮输入框背景、收紧间距并使用通栏创建按钮", "移除容器组件顶部的派生功能栏，增大组件生成过程的状态文字"]
    },
    {
      version: '0.9.2',
      date: '2026-09-08',
      items: [
        '新增股票、指数、ETF 与基金统一查数，登录后自动查询行情、净值和基金研究数据',
        '修复基金对比参数兼容问题，分别展示近一年收益率、单位净值和统计日期，明确数据时效与口径',
        '支持股票不复权日线查询；分钟线等暂不支持的能力明确提示，避免混用或编造数据',
        '统一生成组件、总结与思维导图的外框、底色和滚动条，增强选中外发光并优化来源链接颜色',
        '组件标题区支持拖动，附加按钮和右下角缩放提示自然渐入渐出，扩大缩放操作范围并避免遮挡滚动条',
        '统一组件创建、排队与生成过程的背景色，调亮深色研究画布并保留点阵',
        '优化临时侧边栏关闭按钮位置，更新登录头像背景与白色用户名首字母',
        '完善应用改名后的启动路径与 Dock 入口恢复，修复任务执行期间追加消息的处理顺序'
      ]
    },
    {
      version: '0.9.1',
      date: '2026-09-08',
      items: ["产品统一更名为 EWork Odyssey，更新应用图标、深浅色标识与中英文标语", "组件生成增加格式验收、自动恢复和可读内容回退，减少生成失败后手动重试", "丰富监控面板、新闻、日历和报告等交互组件，并让内容更聚焦用户需求", "优化表格列宽和来源链接排版，精简组件顶部导航与重复信息", "修复点击组件内容无法选中整块组件的问题，保留内部链接和控件交互", "增强触控板缩放灵敏度，研究画布采用浅色纯白、深色深灰背景并保留点阵", "修复设置下拉菜单无响应，优化账户菜单图标、登录面板和随主题变化的用户名首字头像"]
    },
    {
      version: '0.9.0',
      date: '2026-09-08',
      items: ["新增构建模式，自动拆解研究工作台并并发生成独立组件；简单问答仍在对话中完成", "组件预设小、中、大三种规格，提前规划内容与尺寸，整理画布时统一同行大小并整齐排列", "组件框按约 0.5 秒间隔依次出现，后台生成任务保持并发", "生成进度展示真实检索主题与子任务回报，并补充当前任务说明和页面构建步骤", "修复搜索权限误判、重复生成和重试提交失败，限制无效检索循环并如实提示数据缺失", "优化连接中断、超时和限流提示，保留重试过程并减少不必要的生成内容"]
    },
    {
      version: '0.8.9',
      date: '2026-09-07',
      items: ["修复研究容器因搜索权限判断不完整而反复返回空正文的问题", "生成完成后按实际内容自动扩展组件，长报告与 HTML 可完整展示", "整理画布按内容重新适配组件框尺寸，再排列位置，减少组件内滚动", "修复语音结束时空识别结果覆盖已有文字、导致生成失败的问题", "每个研究会话支持最多 10 个并发生成子任务，超出后有序排队", "精简组件生成范围，减少未要求的摘要、背景和 HTML 包装"]
    },
    {
      version: '0.8.8',
      date: '2026-09-07',
      items: ["修复已发现或下载的更新锁定旧版本的问题，下载与安装前重新检查最新版本", "下载完成后自动安装并重启，无需再次确认；更新目标变化时改用最新版本", "为系统安装准备和退出清理增加超时与失败提示，避免无反馈地等待", "解压校验阶段显示环形加载与明确说明，优化提示位置并修复遮挡设置菜单的问题", "精简账户菜单，移除顶部重复名称"]
    },
    {
      version: '0.8.7',
      date: '2026-09-07',
      items: ["新增 EWork Odyssey 账户体系，使用用户名、密码和邀请码注册，支持登录、退出及账户内修改密码", "基金研究等托管云端数据能力需要登录；用户自行配置的模型 API 不受影响", "设置改为全窗口左侧导航，登录与注册保留紧凑品牌浮窗；注册和修改密码增加二次密码确认", "优化账户图标、收起侧栏与更新入口布局，关于页面使用 EWork Odyssey Logo", "更新下载同时显示百分比、已下载大小与文件总大小，保留下载后确认安装流程"]
    },
    {
      version: '0.8.6',
      date: '2026-09-07',
      items: ['基金研究开箱即用，无需配置基金数据 API Key', '支持单基金概览、基金对比、持仓风格及近期变化查询，并展示数据日期和缺失项', '增加服务端缓存、并发与请求额度保护，繁忙或数据暂不可用时给出明确提示']
    },
    {
      version: '0.8.5',
      date: '2026-09-07',
      items: ["语音支持双按 Fn 开始、单按结束发送；长按 Fn 说话、松开发送", "修复语音创建组件后子代理未启动的问题，缩短前置检索等待，减少不必要的需求扩展", "丰富组件生成中的实时进度反馈，使用圆环加载状态并合并停止按钮，修正组件底部边角显示", "优化差分更新请求方式，减少因多段 Range 响应不兼容导致的全量下载回退；缓存或校验不可用时仍安全回退", "接入基金研究私有数据能力，并修复新增插件依赖缺失可能导致的客户端启动失败"]
    },
    {
      version: '0.8.4',
      date: '2026-09-06',
      items: ["下载完成后可选择重启并安装，安装器准备期间保持客户端可用，避免提前中断当前界面", "设置关于页新增下载更新与重启安装按钮，实时显示下载进度；安装失败后可重新尝试", "优化收起侧栏的升级入口：保持紧凑图标与悬停提示，避免按钮溢出或遮挡设置"]
    },
    {
      version: '0.8.3',
      date: '2026-09-06',
      items: ['修复研究窗口关闭后退出或安装更新时出现主进程错误弹窗、导致更新无法完成的问题']
    },
    {
      version: '0.8.2',
      date: '2026-09-06',
      items: [
        "研究画布新增语音指令：点击语音或连续按两下 Fn 开始录入，通过紧凑波形条结束或取消，识别后在新组件中执行需求",
        "组件默认采用简约的单色直角图表风格，并随客户端深色、浅色主题切换；用户明确指定的样式优先",
        "生成过程改为逐行动态状态展示，实时呈现资料搜集与内容制作进展，避免显示原始代码",
        "组件生成后平滑适配内容尺寸；编辑需求、刷新与自动刷新统一收纳到顶栏更多菜单，编辑支持取消并保留原内容",
        "改进实时资料检索、基金标的识别与来源相关性判断，减少无关词义结果，并修复连续搜索时的页面相互干扰",
        "修复新研究添加组件后无法切换对话与轨迹的问题，空轨迹也可正常进入"
      ]
    },
    {
      version: '0.8.1',
      date: '2026-09-04',
      items: [
        '修复客户端重启后新研究画板首次拖入 PDF、PPTX、DOCX 等文件时只显示文件卡片的问题，无需切换其他画板即可直接加载预览',
        '研究画布支持通过苹果触控板双指捏合与外扩缩放，提升手势灵敏度并以手势中心为锚点；画布空白区及网页、PDF 等组件内部均可使用'
      ]
    },
    {
      version: '0.8.0',
      date: '2026-09-03',
      items: [
        '修复研究画布已有组件但没有对话时，会话未保留、没有标题及切换后从侧栏消失的问题',
        '新研究不再复用已有内容的画板；无对话的研究会话可从侧栏直接恢复对应画布，并按组件内容显示标题',
        '修复组件靠近画布边缘时功能栏换行溢出的问题；工具栏保持单行并自动避让，菜单与创建输入框保持可操作',
        '思维导图、总结提炼和基于所选创建的新组件优先出现在来源附近，允许重叠、自动选中并置顶，保留原有组件位置',
        '容器和基于所选创建支持自包含交互网页交付物；按用户要求呈现活动页、用户体验地图等布局，不再强制降级为表格、文字或思维导图；修复实时搜索时工具调度器不兼容导致的生成失败',
        '修复首次配置模型后当前选项为空时模型列表加载失败，并避免显示原始数据校验错误'
      ]
    },
    {
      version: '0.7.9',
      date: '2026-09-03',
      items: [
        '研究模式未选择或手动引用组件时，默认参考当前画板全部资料，包含屏幕外组件',
        '按问题相关性分配资料权重，先提供精简目录和关键证据，再按需检索、分页读取，减少无关内容占用上下文',
        '新增当前画板资料提示与目录，可仅关闭本次自动引用；手动引用优先，发送失败保留草稿',
        '改进资料快照、分页续读与取消清理，复用已授权网页正文，并对文件变化、不可读或截断内容明确提示',
        '新增“基于所选创建”：根据一个或多个组件的真实内容和提示词生成独立组件，保留资料来源并支持失败重试',
        '支持直接向画板粘贴文字、图片和文件；文字可编辑，文件持久保存并使用安全预览',
        '支持组件跨研究画板复制粘贴，提供快捷键、右键菜单及整组撤销和重做，保留相对位置与独立文件副本',
        '优化画板资料弹层：组件名称前增加类型图标，移除“发送时检查”，保留紧凑标签并优化参考开关',
        '修复粘贴文字组件高度异常，并改进复制文件重新打开和失败提示的可靠性',
        '修复画布快捷键粘贴的焦点归属：鼠标位于画布非编辑区域时也可粘贴，右键操作后可继续使用快捷键，保留输入框和网页自身的粘贴行为',
        '复制粘贴提示上移并在完成后两秒消失；“基于所选创建”增加图标、精简输入弹层，点击外部或失焦时自动关闭'
      ]
    },
    {
      version: '0.7.8',
      date: '2026-09-02',
      items: [
        '右侧对话引用链接组件时可读取已授权网页的完整正文，与画布中的思维导图和总结提炼保持一致'
      ]
    },
    {
      version: '0.7.7',
      date: '2026-09-02',
      items: [
        '智能容器可自行检索实时数据，补全社交媒体与动态追踪类需求识别，并在模型仅完成分析却未返回正文时自动恢复生成',
        '链接组件支持授权登录后的网页内容提取，飞书等受保护页面可在授权后用于生成完整的思维导图和总结提炼',
        '研究画布支持 Command+Z 撤销、Command+Shift+Z 重做，删除组件后也可恢复；鼠标位于网页等组件内时仍可用 Command+滚轮缩放画布',
        '画布组件按最后点选顺序置于最上层，并优化组件顶栏高度以及链接“添加”和容器“创建”按钮的深浅主题样式',
        '没有对话的新研究也会持久化到工作区会话，用户下次可从侧栏直接回到对应研究画布',
        '修复研究模式发送消息后跳回对话模式，以及从其他模式返回研究时右侧栏宽度异常扩大的问题',
        '改进链接页面授权、容器失败重试和实时监控结果渲染的稳定性'
      ]
    },
    {
      version: '0.7.6',
      date: '2026-09-02',
      items: [
        '研究组件新增“思维导图”和“总结提炼”工具：可在所选内容旁生成新组件，思维导图提供简要、常规和详细三种模式',
        '画布生成任务改为在目标组件内独立展示进度与失败重试，支持最多四路并发，并与右侧对话互不占用',
        '统一思维导图为适合直接粘贴到 PPT 的横向白底样式，优化节点宽度、换行、对齐、连线和画布比例；支持双击编辑节点',
        '总结提炼组件支持双击编辑；消息和输入框中的研究标签采用紧凑布局、补全类型图标，并可点击定位到对应画布组件',
        '修复侧栏收起时点击搜索无法显示输入框的问题，展开后会直接聚焦搜索框',
        '画布空白处右键新增“整理画布”，按内容尺寸混合平铺组件；“全选”会选择画布中的全部组件',
        '画布底部新增“链接”和“容器”：链接组件可自动读取网页标题、自适应显示页面，并为微信文章提供安全阅读视图；智能容器可生成 KPI、图表、表格或文字内容',
        '所有研究组件新增下载入口，思维导图支持 SVG、PNG 和 JPG；同时优化底栏间距和画布缩放下限',
        '修复从 PowerPoint 组件生成思维导图失败、网页与微信链接读取竞态及智能容器生成失败等问题'
      ]
    },
    {
      version: '0.7.5',
      date: '2026-08-31',
      items: [
        '侧栏新增并排的“新对话”和“新研究”入口，“新研究”可直接创建并进入研究模式',
        '优化研究组件引用标签：选择组件后先以半透明状态提示，取消选择会自动移除，点击输入区后则固定保留',
        '进一步放宽研究画布的缩小范围，并在视口偏离内容时提供快速回到内容的入口',
        '新增简洁的 EWork Odyssey 启动动画，改善客户端启动时的视觉衔接',
        '修复“新研究”首屏画布、顶栏和右侧对话区布局异常，并使用专用研究图标',
        '修复研究画布中 PDF 已加载但页面显示为空白的问题',
        '完善空白研究右侧引导，在首条消息发送前显示品牌标题；工作区和模式选择固定显示在输入框上方，并确保新对话不再丢失模式入口',
        '修复空白研究会话复用时点击“新对话”无响应的问题，可直接切回新对话页面',
        '优化加入画布的助手回复组件尺寸，减少瘦长排版并保留自适应与手动缩放'
      ]
    },
    {
      version: '0.7.4',
      date: '2026-08-31',
      items: [
        '统一 EWork Odyssey Agent 品牌表述，并修正部分会话中用户消息与助手回复的显示顺序',
        '修复退出客户端时访问已销毁窗口导致的 JavaScript 报错',
        '完善研究画布引用交互：点击文件、PPT 或助手回复组件即可选中并作为输入标签引用，PPT 组件不再显示下载按钮',
        '优化研究输入标签：支持在标签之间准确放置光标，清晰显示输入位置，并消除选中时的抖动和位移',
        '输入框可随内容行数自适应增高，画布中的助手回复内容支持直接编辑',
        '对话和研究模式统一使用文件标签：按类型显示图标，悬停可查看包含后缀的完整文件名，并在发送时保留完整路径',
        '完整汉化权限菜单，并优化研究组件、侧栏和输入框的交互细节'
      ]
    },
    {
      version: '0.7.3',
      date: '2026-08-28',
      items: [
        '新增完整研究模式：中央画布与右侧固定对话协同工作，支持文件拖入、框选、多选、移动和删除',
        '文件标签可与输入文字混合编辑，支持拖动排序、选中、键盘删除并随消息发送',
        '升级画布可视化组件：支持图片、PDF 连续滚动、HTML 交互以及 Word、Excel、PPT、Markdown 和代码预览',
        '支持调整画布组件尺寸与名称，并同步更新输入框中的附件标签',
        '优化对话、研究与轨迹页的输入框、滚动、菜单层级、加载状态和响应式布局',
        '修复旧对话模型选择丢失，并移除 Memory Evolve 与 Hindsight 记忆插件及其工具调用'
      ]
    },
    {
      version: '0.7.2',
      date: '2026-08-26',
      items: [
        '新增关于页手动检查更新，并在下载完成后自动退出终端、安装和重启',
        '优化侧栏更新按钮的悬停提示与圆环下载进度',
        '汉化权限菜单，并支持为模型标记视觉输入能力'
      ]
    },
    {
      version: '0.7.1',
      date: '2026-08-26',
      items: [
        '新增跨模型联网搜索，在模型原生搜索不可用时自动回退到本地浏览器搜索',
        '内置 PPT Skill 升级至 1.0.6，并自动备份替换过期官方副本',
        '新增正式构建 Git 门禁，防止遗漏其他会话的已提交改动'
      ]
    },
    {
      version: '0.7.0',
      date: '2026-08-25',
      items: [
        '新增研究画布，与对话和轨迹并列切换',
        '新增关于页面，可查看当前版本和更新日志',
        '正式安装包内置 Memory、附件上传与工作区插件',
        '内部记忆、技能与待办页面仅在开发者模式显示'
      ]
    }
  ],
  en: [
    {"version": "1.0.5", "date": "2026-09-21", "items": ["Fix component task sidebar closing and preserve task settings when reopened", "Include scheduled task tabs in the open-tabs menu with consistent selection", "Add a conversation tab icon and compact widths, prioritizing the active tab when space is limited", "Keep tab icons at their intended size and show close controls only on active closable tabs", "Refine collaboration member popover backgrounds and shadows to reduce visual artifacts beneath avatars"]},
    {"version": "1.0.4", "date": "2026-09-21", "items": ["Add global scheduled tasks with execution time, repeat frequency, notifications, and run history", "Schedule independent canvas component updates from the component menu, with a clock indicator in its title", "Filter component tasks by type and manage run, pause, resume, and delete actions from a consistent menu", "Refine task tab selection, menu layering, description resizing, and the time editor close action", "Slide the canvas toolbar into view when entering research from conversation, while keeping board switches stable"]},
    {"version": "1.0.3", "date": "2026-09-21", "items": ["Run desktop brush strokes and coordinate clicks in the target window without moving the system pointer", "Improve background input preparation for more reliable clicks and continuous strokes in inactive windows", "Fix persistent app and window discovery failures after desktop control has been idle", "Stop desktop input when the Mac locks or sleeps; new tasks can start after unlocking", "Show actionable desktop input errors and reset consecutive failures after successful observations"]},
    {"version": "1.0.2", "date": "2026-09-20", "items": ["Open shared boards immediately and show a small centered spinner while their content loads", "Reduce redundant board requests and improve loading retries and rapid board switching", "Fix gray marquee edges with consistent blue strokes aligned to screen pixels", "Reduce horizontal padding around the right conversation and composer for more room in narrow panes", "Hide the download icon beside notifications promptly after an update and restart"]},
    {"version": "1.0.1", "date": "2026-09-19", "items": ["Fix gaps in sidebar board and workspace heading masks so scrolling text stays fully hidden beneath the headings while retaining a soft fade", "Automatically collapse the left sidebar when creating a board or entering Research in windows narrower than 1280px; keep it expanded across board and mode changes after manually opening it"]},
    {"version": "1.0.0", "date": "2026-09-19", "items": ["Add desktop control for macOS apps after permission is granted, including window observation, clicking, typing, dragging and continuous brush strokes; an image-capable model is required", "Improve desktop screenshots, window targeting and batched strokes, with stop controls, time limits and repeated-failure protection", "Open, search and interact with websites in the conversation side browser; improve signed-in and lazy-loaded page reading and adapt pages to panel width", "Unify assistant cursors and labels across the browser and canvas, fade them out when tasks finish, and fix label alignment and clipping", "Upgrade the bundled PPT skill to 1.1.1: fix PowerPoint repair prompts and missing closing-slide glyphs, standardize cover subtitles at 18pt, and strengthen color, shadow, contents, spacing, wrapping and whitespace checks", "Remove extra overlays around the composer and task list; wrap long messages within a maximum width and keep short messages compact and right-aligned", "Fix sidebar header overlap, delayed folder-drag feedback, window dragging and logo cursors; restore link component controls and complete selection outlines when menus open", "Fix Finder reveal targets for conversation files and improve recovery guidance for unread-file edits and invalid task-list arguments"]},
    {"version": "0.9.14", "date": "2026-09-17", "items": ["Strengthen shared-state generation rules for collaborative components, including concurrent input and ongoing state changes", "Validate and repair generated components to reduce cases where only the start action synchronizes while runtime state diverges", "Avoid treating real-time multiplayer and current component state as requests for fresh external information", "Regenerate or update existing components that have not integrated shared state to enable synchronization"]},
    {"version": "0.9.13", "date": "2026-09-17", "items": ["Name new boards from the first task and add deletion to the board menu", "Introduce a consistent icon toolbar for selection, drawing components, links and voice creation", "Return to selection after drawing without focusing the input, and preserve custom component dimensions after generation", "Unify selection outlines and rounded corners; fix link component selection, stacking and canvas arrangement", "Display more websites including Google and Bing inside components, with more stable zoom and selection rendering", "Read webpage content in component actions and chat references, refreshing it before generation or sending", "Add sign out to account settings and use body text color for login progress", "Move Mark as read to the top-right of message cards as a text button", "Add shared component state for concurrent actions, live updates, late joins and reconnect takeover; existing components need regeneration or adaptation"]},
    {"version": "0.9.12", "date": "2026-09-17", "items": ["Align names, bubbles, copy actions and timestamps by collaboration member, and identify each member’s assistant", "Unify conversation action icon sizes and improve execution, message and copy-action spacing and history readability", "Restore horizontal scrolling for wide tables and improve table helper text and subagent card spacing", "Synchronize canvas click coordinates for Gomoku and similar components, including moves, undo and state replay", "Toggle the member menu from its trigger and dismiss collaboration dialogs by clicking the backdrop", "Refresh file directories and search results with a spinning button, without a success message"]},
    {"version": "0.9.11", "date": "2026-09-17", "items": ["Fixed the sidebar update button to start downloading with immediate ring and bubble feedback", "Show verification, extraction and automatic restart guidance when the download finishes", "Keep notification filters and details clickable during downloads; details opens Settings About", "Add per-message mark-as-read controls and hide collaboration sign-in prompts when signed out", "Restore the 0.9.10 About changelog and add the 0.9.11 release notes"]},
    {"version": "0.9.10", "date": "2026-09-17", "items": ["Improve session and canvas switching with deferred offscreen HTML loading and preserved interaction state", "Reuse native conversation progress, tool details and reply styling on shared boards", "Fix completed shared task replies appearing only after switching sessions", "Automatically resume interrupted tasks below the priority task, including their messages, progress and replies", "Distinguish independent component subagent activity from main conversations", "Upgrade the PowerPoint skill to 1.0.9 with regular-weight cover subtitles, no top contents divider, and more left-text/right-chart layouts"]},
    {"version": "0.9.9", "date": "2026-09-16", "items": ["Shared board conversations use each sender’s main agent with native subagent delegation", "Canvas content is generated by independent subagents; progress appears in chat without blocking conversations or being cancelled by queue promotion", "Added a shared message queue with author names, editing, deletion and priority execution; interrupted conversations resume automatically after priority messages finish", "Fixed board binding and premature handoff before subagents finish, with clear errors for incompatible collaboration services", "Added board context-menu refresh and improved component actions and image preview compatibility", "Improved in-place PowerPoint preview zoom and file reveal, including links to files in subfolders", "Fixed task checklists spinning after execution ends and added progress reconciliation during execution", "Upgraded the bundled PowerPoint authoring skill to 1.0.8 with compact contents spacing and delivery checks"]},
    {"version": "0.9.8", "date": "2026-09-16", "items": ["Forked board conversations now register the real board folder as a workspace project, fixing ungrouped sessions and missing-directory errors", "Empty new boards remain temporary drafts and disappear when leaving without messages or components; folders are created only when needed", "Fixed clipped sidebar selection and hover backgrounds and hid session update timestamps", "Improved automatic update discovery, direct downloads, progress rings and detail popovers in expanded and collapsed sidebars", "Adapted clarification cards to narrow panels; optional choices continue with the recommended approach after 30 seconds, with the countdown stopping when the user starts answering", "Fixed Command-wheel canvas zoom over selected components", "Fixed conversation file links opening in the bottom panel and broken relative-path images; previews now open on the right", "All right-panel tabs fit in one compressed row, keeping a centered close button on the active tab when crowded", "Improved tool image display and continuation with text-only models while preserving original conversation history"]},
    {"version": "0.9.7", "date": "2026-09-16", "items": ["Redesigned the first-launch welcome screen with new brand artwork and copy", "Board sessions now stay in canvas mode; improved shared task startup feedback and immediate composer clearing with safe failure recovery", "Unified sidebar scrolling with sticky headings and fading content, including a fix for text showing through during fast scrolling", "Search board and workspace session titles together with grouped results, a stable input position, and outside-click dismissal", "Simplified sidebar controls with type grouping, manual ordering, and updated sessions moving to the top", "Added account ID display and copying, and improved collaboration invitations and update notifications", "Refined notification center placement, card colors, and spacing; All and Unread keep the same panel size", "Unified mind-map presentation, enlarged component actions, tightened menu spacing, and moved canvas notices above the bottom toolbar", "Fixed header menus not closing when clicking blank space and delayed popup borders", "Removed extra focus highlights while preserving permanent field strokes, state indicators, and blue canvas selection borders"]},
    {
      version: '0.9.6',
      date: '2026-09-15',
      items: ["Added research board collaboration, member permissions and shared conversations with a compact permission menu","Persisted and synchronized component interactions, retaining their state in personal copies","Automatically copied canvas materials into associated folders and created missing project directories for shared and restored boards","Fixed shared file synchronization failures that could make research boards temporarily unavailable","Placed newly created and pasted components in front across saves and collaboration; unified borderless frames and header spacing","Unified tool details and generated-file previews in global sidebar tabs and fixed file lists and historical preview links","Completed Chinese and English localization and language switching, improving English tabs, button sizing and concise sign-in text","Balanced conversation margins and clarified disabled mode selectors during execution","Hid composer selectors after messages and improved project binding for boards with materials","Improved component generation recovery, matrix layouts and completed-board arrangement while retaining genuine missing-data notices","Refined sign-in and registration, light-theme menus, notifications, component actions and title-bar dragging","Strengthened grayscale home animation with 50% faster flow and 30% greater local deformation"]
    },
    { version: '0.9.5', date: '2026-09-09', title: 'Mode and interaction improvements', items: ['Fixed the top mode buttons and the subagent entry position', 'Synchronized header and composer modes when switching blank sessions', 'Completed Chinese names and descriptions in the slash-command menu'] },
    {
      version: '0.9.5',
      date: '2026-09-09',
      items: ["Fix top mode button interaction and subagent menu placement", "Keep header and composer modes in sync when switching empty sessions", "Localize slash command names and descriptions in the Chinese interface"]
    },
    {
      version: '0.9.4',
      date: '2026-09-09',
      items: ["Display attached files as inline history tags with natural text wrapping and no file paths", "Open attached history files in the right sidebar for preview", "Match mode icons and enable mode switching in existing chats and Research while idle", "Reduce title size for files dropped onto the Research canvas", "Improve unsupported file card padding and move component actions to the right", "Hide Research component scrollbars while preserving content scrolling"]
    },
    {
      version: '0.9.3',
      date: '2026-09-08',
      items: ["Connected canvas containers and voice-created components to financial data tools for stocks, indices, ETFs and funds", "Prioritized structured financial data with explicit timestamps, data definitions and unavailable capabilities", "Added mode-picker icons and refined selected-option styling and layout", "Reduced the send button size for better input-area proportions", "Refined container forms with a lighter input background, tighter spacing and a full-width create button", "Removed the derived-actions toolbar above containers and increased generation-status text size"]
    },
    {
      version: '0.9.2',
      date: '2026-09-08',
      items: [
        'Added unified stock, index, ETF and fund queries for quotes, NAV and fund research after sign-in',
        'Fixed fund comparison parameter handling and separated one-year returns, unit NAV, dates and data freshness',
        'Added unadjusted daily stock bars and clear explanations for unsupported capabilities such as minute bars',
        'Unified generated components, summaries and mind maps with consistent frames, backgrounds and scrollbars, stronger selection glow and clearer source links',
        'Made component titles draggable, added smooth hover actions and corner resize hints, and enlarged resize targets without covering scrollbars',
        'Matched creation, queued and generating backgrounds to their frames, and lightened the dark canvas while retaining the dot grid',
        'Moved the temporary sidebar close button and refreshed signed-in avatars with white username initials',
        'Improved launch-path and Dock recovery after app renaming, and fixed follow-up message ordering during running tasks'
      ]
    },
    {
      version: '0.9.1',
      date: '2026-09-08',
      items: ["Renamed the app to EWork Odyssey with refreshed app icons, theme-aware logos and localized slogans", "Added generated-component validation, automatic recovery and readable fallbacks to reduce manual retries", "Expanded interactive dashboards, news, calendars and report components while keeping content focused on the request", "Improved table column widths and source links, and removed redundant component navigation and information", "Fixed selecting an entire component by clicking its content while preserving links and controls", "Increased trackpad zoom sensitivity and kept the dot grid on white and dark-gray research canvases", "Fixed unresponsive Settings menus and refined account menu icons, authentication dialogs and theme-aware username initials"]
    },
    {
      version: '0.9.0',
      date: '2026-09-08',
      items: ["Added Build mode to plan independent research panels and generate them concurrently, while simple Q&A stays in chat", "Added small, medium and large component presets with planned content budgets and aligned rows when arranging the canvas", "Panels appear at roughly 0.5-second intervals while generation tasks run concurrently", "Generation progress shows real search topics and task reports, with concise activity descriptions and page-building steps", "Fixed search permission detection and retry submission failures; bounded unproductive searches and disclosed unavailable data", "Improved connection, timeout and rate-limit feedback, preserved retry progress, and reduced unnecessary generated content"]
    },
    {
      version: '0.8.9',
      date: '2026-09-07',
      items: ["Fix empty research container output caused by incomplete search-tool availability checks", "Fit completed components to their actual content, including long reports and HTML", "Fit component frames to content before arranging the canvas to reduce internal scrolling", "Preserve recognized voice instructions when the speech service returns an empty final result", "Allow up to 10 concurrent generation tasks per research session, with additional tasks queued", "Keep generated components focused by avoiding unrequested summaries, background text and HTML wrappers"]
    },
    {
      version: '0.8.8',
      date: '2026-09-07',
      items: ["Recheck the latest version before downloading and installing to avoid installing an outdated cached update", "Automatically install and restart after downloading; refresh the package when a newer release becomes available", "Add timeouts and error feedback for native installation preparation and shutdown cleanup", "Show a loading indicator and clear preparation status, and prevent update notices from covering Settings menus", "Simplify the account menu by removing its duplicate heading"]
    },
    {
      version: '0.8.7',
      date: '2026-09-07',
      items: ["Added invite-only EWork Odyssey accounts with registration, sign-in, sign-out, and password changes", "Hosted cloud data capabilities such as fund research require sign-in; personally configured model APIs remain unaffected", "Full-window settings with left navigation and compact branded authentication dialogs; confirm passwords during registration and password changes", "Refined account icons, collapsed sidebar and update controls, and the EWork Odyssey logo in About", "Update downloads show percentage and downloaded/total size, with installation confirmation after downloading"]
    },
    {
      version: '0.8.6',
      date: '2026-09-07',
      items: ['Fund research works without configuring a fund data API key', 'Research individual funds, comparisons, holdings styles, and recent changes with evidence dates and missing-data disclosures', 'Added server-side caching and request limits with clear busy and unavailable messages']
    },
    {
      version: '0.8.5',
      date: '2026-09-07',
      items: ["Voice supports double-tap Fn to start and a single press to finish and send, or hold Fn to talk and release to send", "Fixed voice-created components failing before a subagent starts; reduced preliminary search waits and unnecessary scope expansion", "Added more varied live generation feedback, a circular loading indicator with an inline Stop action, and corrected bottom component corners", "Improved differential download compatibility with single-range requests; full downloads remain a fallback when cache or validation is unavailable", "Added private fund research data integration and fixed startup failures caused by missing newly added plugin dependencies"]
    },
    {
      version: '0.8.4',
      date: '2026-09-06',
      items: ["Choose when to restart and install after downloading; keep the app usable while the installer prepares the update", "Added download and restart actions in About with live download progress and retry support after installation failures", "Keep the collapsed sidebar update button compact with hover hints, without overflowing or covering Settings"]
    },
    {
      version: '0.8.3',
      date: '2026-09-06',
      items: ['Fixed a main-process error when quitting or installing an update after closing a Research window, which could prevent the update from completing']
    },
    {
      version: '0.8.2',
      date: '2026-09-06',
      items: [
        "Added voice commands to Research: click Voice or press Fn twice to dictate, finish or cancel from a compact waveform bar, and execute the request in a new component",
        "Components default to a minimal monochrome chart style with square corners and follow the app theme; explicit user styling requests take priority",
        "Generation now shows a live, line-by-line activity log for research and content creation without exposing raw code",
        "Completed components smoothly resize to fit their content; editing, refresh, and automatic refresh live in the title-bar menu, with cancel preserving the original content",
        "Improved live research, fund identification, and source relevance to reduce unrelated dictionary results and prevent interference between consecutive searches",
        "Fixed switching to Chat and Trace after adding components to a new Research canvas, including empty traces"
      ]
    },
    {
      version: '0.8.1',
      date: '2026-09-04',
      items: [
        'Fixed PDF, PPTX, DOCX, and other files showing only a file card when first dropped onto a new Research canvas after restarting the client; previews now load without visiting another canvas first',
        'Added responsive Apple trackpad pinch and spread zoom centered on the gesture, available on blank canvas areas and inside web, PDF, and other components'
      ]
    },
    {
      version: '0.8.0',
      date: '2026-09-03',
      items: [
        'Fixed canvas-only research sessions losing their sidebar entry or title when no chat message had been sent',
        'New Research no longer reuses a populated canvas; reopen canvas-only sessions directly in Research with titles derived from their components',
        'Fixed floating component actions wrapping and overflowing at canvas edges; keep a single row with viewport-aware positioning and accessible menus and creation prompts',
        'Mind maps, summaries, and Create from Selection outputs appear near their sources, are selected and brought to the front, and may overlap neighbors without moving existing components',
        'Containers and Create from Selection support self-contained interactive web deliverables, honoring requested layouts such as event pages and journey maps instead of forcing tables, text, or mind maps; fixed tool-scheduler incompatibility failures during live-data search',
        'Fixed the model list failing to load when no current model is selected immediately after first-time setup, without exposing a raw validation error'
      ]
    },
    {
      version: '0.7.9',
      date: '2026-09-03',
      items: [
        'Research conversations now reference all material on the current canvas, including offscreen components, when nothing is selected or explicitly referenced',
        'Allocate context by question relevance: start with a compact catalog and key evidence, then search and read additional material on demand within bounded context budgets',
        'Added a current-canvas context indicator and source directory with a per-message opt-out; explicit references take priority and failed sends preserve the draft',
        'Improved source snapshots, paginated reading, and cancellation cleanup; reuse captured authenticated webpage text and clearly report changed, unreadable, or truncated files',
        'Added Create from Selection: generate an independent component from one or more selected components and a prompt, retaining source evidence and retry support',
        'Paste text, images, and files directly onto the canvas; text stays editable and files are stored durably with safe previews',
        'Copy and paste components across Research canvases with keyboard shortcuts, context menus, and grouped undo/redo, preserving relative positions and independent file copies',
        'Refined the canvas source popover with component-type icons, removed the check-on-send column, and retained compact tags with an improved reference toggle',
        'Fixed pasted-text component height loops and improved copied-file reopening and failure feedback',
        'Fixed canvas clipboard shortcut focus: paste over non-editable canvas areas and keep shortcuts working after context-menu actions without intercepting editors or embedded pages',
        'Moved clipboard feedback above the toolbar with a two-second dismissal; added a Create from Selection icon and a simplified popover that closes on outside click or focus loss'
      ]
    },
    {
      version: '0.7.8',
      date: '2026-09-02',
      items: [
        'Right-side conversations can now read the full authenticated webpage body when a link component is referenced, matching canvas mind maps and summaries'
      ]
    },
    {
      version: '0.7.7',
      date: '2026-09-02',
      items: [
        'Smart containers can now retrieve live data autonomously, recognize social-media and activity-tracking requests, and recover automatically when a model finishes its analysis without returning final content',
        'Link components can extract content from authenticated pages, allowing protected pages such as Feishu documents to generate complete mind maps and summaries after authorization',
        'Added Command+Z undo and Command+Shift+Z redo to the Research canvas, including deleted-component recovery, and kept Command+wheel canvas zoom available while the pointer is over embedded content',
        'The most recently selected canvas component now moves to the top, with slightly taller component headers and refined light/dark styling for the Link Add and Container Create buttons',
        'New Research canvases are persisted in workspace sessions even without a conversation, so they can be reopened directly from the sidebar',
        'Fixed Research messages switching back to Chat and preserved the user\'s right-panel width when returning to Research from another mode',
        'Improved authenticated link loading, container retry behavior, and native rendering stability for live monitoring results'
      ]
    },
    {
      version: '0.7.6',
      date: '2026-09-02',
      items: [
        'Added Mind Map and Summary tools for Research components, creating new components beside the selected source with concise, standard, and detailed mind-map modes',
        'Canvas generation jobs now show progress and retry states inside their target components, support up to four concurrent jobs, and no longer occupy the right-side conversation',
        'Standardized mind maps as landscape, white-background layouts ready for PowerPoint, with improved node widths, wrapping, alignment, connectors, aspect ratio, and double-click text editing',
        'Added double-click editing for summaries, compact Research tags with complete type icons in messages and the composer, and click-to-locate navigation back to canvas components',
        'Fixed the collapsed-sidebar Search action so it expands the sidebar, shows the search field, and focuses it immediately',
        'Added Arrange Canvas to the empty-canvas context menu with content-aware mixed tiling, while Select All now selects every canvas component',
        'Added Link and Container tools to the canvas toolbar: Link components resolve real page titles, resize web content responsively, and use a safe reader for WeChat articles, while smart containers can generate KPI panels, charts, tables, or text',
        'Added downloads to every Research component, including SVG, PNG, and JPG for mind maps, and refined the bottom toolbar spacing and canvas zoom floor',
        'Fixed mind-map generation from PowerPoint components, web and WeChat reader races, and failed smart-container generation'
      ]
    },
    {
      version: '0.7.5',
      date: '2026-08-31',
      items: [
        'Added separate New Chat and New Research sidebar actions, with New Research opening directly in Research mode',
        'Refined Research reference tags with a provisional translucent state, automatic removal on deselection, and persistent tags after focusing the composer',
        'Expanded the Research canvas zoom-out range and added a quick way to return to content when the viewport drifts away',
        'Added a restrained EWork Odyssey launch animation for a smoother transition into the client',
        'Fixed the New Research first-screen canvas, header, and right-side conversation layout, and added a dedicated Research icon',
        'Fixed blank PDF pages in the Research canvas after successful document loading',
        'Improved blank Research guidance with the EWork Odyssey headline, kept workspace and mode controls above the composer, and prevented the mode control from disappearing in New Chat',
        'Fixed New Chat doing nothing when reusing a blank Research session, so it now switches directly to the New Chat screen',
        'Widened assistant reply components added to the Research canvas while preserving adaptive sizing and manual resize controls'
      ]
    },
    {
      version: '0.7.4',
      date: '2026-08-31',
      items: [
        'Standardized EWork Odyssey Agent branding and fixed the display order of user messages and assistant replies in affected conversations',
        'Fixed a JavaScript error caused by accessing a destroyed window while quitting the client',
        'Improved Research canvas references: click a file, PowerPoint, or assistant reply component to select and cite it as an input tag, while PowerPoint components no longer show a download button',
        'Improved Research input tags with precise caret placement between tags, a clearly visible insertion point, and stable selection without jitter or displacement',
        'Made the composer grow with its content and added direct editing for assistant reply components on the canvas',
        'Unified file tags across Chat and Research with file-type icons, delayed full-name tooltips including extensions, and preserved full paths on send',
        'Completed permission-menu localization and refined Research components, the sidebar, and composer interactions'
      ]
    },
    {
      version: '0.7.3',
      date: '2026-08-28',
      items: [
        'Added a complete Research mode with a central canvas, fixed right-side conversation, file drops, marquee selection, multi-select, movement, and deletion',
        'File tags now mix naturally with typed text and support drag reordering, selection, keyboard deletion, and message attachments',
        'Expanded visual canvas components with images, continuous PDF scrolling, interactive HTML, and Word, Excel, PowerPoint, Markdown, and code previews',
        'Added resizable and renameable canvas components with synchronized attachment tag names',
        'Improved composer layout, scrolling, menu layering, loading states, and responsive behavior across Chat, Research, and Trajectory',
        'Fixed missing model selections in existing conversations and removed Memory Evolve, Hindsight, and their memory tool calls'
      ]
    },
    {
      version: '0.7.2',
      date: '2026-08-26',
      items: [
        'Added manual update checks in About, with automatic terminal shutdown, installation, and restart after download',
        'Improved the sidebar update control with a hover label and circular download progress',
        'Localized permission modes and added per-model Vision capability settings'
      ]
    },
    {
      version: '0.7.1',
      date: '2026-08-26',
      items: [
        'Added cross-model web search with automatic local-browser fallback when native search is unavailable',
        'Updated the bundled PPT Skill to 1.0.6 and added automatic backup and replacement of stale official copies',
        'Added formal-build Git gates to prevent committed work from other sessions being omitted'
      ]
    },
    {
      version: '0.7.0',
      date: '2026-08-25',
      items: [
        'Added a Research canvas alongside Chat and Trajectory',
        'Added an About page for the current version and release notes',
        'Bundled Memory, file upload, and workspace plugins in the formal installer',
        'Limited internal Memory, Skills, and Todos pages to developer mode'
      ]
    }
  ]
}

export function buildSherlockAboutInfo(
  version: string,
  locale: SherlockAboutLocale
): SherlockAboutInfo {
  // Parallel integration may prepend the same release twice. Keep its first
  // position and nonempty metadata, but retain every distinct change.
  const notesByVersion = new Map<string, SherlockReleaseNote>()
  for (const note of releaseNotes[locale]) {
    const existing = notesByVersion.get(note.version)
    if (existing) {
      if (!existing.title?.trim() && note.title?.trim()) existing.title = note.title
      if (!existing.date.trim() && note.date.trim()) existing.date = note.date
      existing.items = [...new Set([...existing.items, ...note.items])]
    } else {
      notesByVersion.set(note.version, { ...note, items: [...new Set(note.items)] })
    }
  }
  return {
    productName: 'EWork Odyssey',
    version,
    releaseNotes: [...notesByVersion.values()].filter((note) => {
      const runtime = version.split('.').map(Number)
      const release = note.version.split('.').map(Number)
      for (let index = 0; index < 3; index++) {
        if ((release[index] ?? 0) !== (runtime[index] ?? 0)) return (release[index] ?? 0) < (runtime[index] ?? 0)
      }
      return true
    })
  }
}

export function createSherlockAboutBridge(
  readUpdateStatus: () => Promise<UpdateStatus>,
  checkForUpdates: ManualUpdateChecker,
  locale: SherlockAboutLocale,
  actions: {
    downloadUpdate(): Promise<UpdateStatus>
    installUpdate(): Promise<void>
    onUpdateStatusChanged(listener: (status: UpdateStatus) => void): () => void
  }
): {
  getInfo(): Promise<SherlockAboutInfo>
  checkForUpdates(): Promise<UpdateStatus>
  getUpdateStatus(): Promise<UpdateStatus>
  downloadUpdate(): Promise<UpdateStatus>
  installUpdate(): Promise<void>
  onUpdateStatusChanged(listener: (status: UpdateStatus) => void): () => void
} {
  return Object.freeze({
    async getInfo(): Promise<SherlockAboutInfo> {
      const status = await readUpdateStatus()
      return buildSherlockAboutInfo(status.currentVersion, locale)
    },
    getUpdateStatus: readUpdateStatus,
    ...actions,
    checkForUpdates(): Promise<UpdateStatus> {
      return checkForUpdates()
    }
  })
}
import type { UpdateStatus } from '../shared/contracts'
