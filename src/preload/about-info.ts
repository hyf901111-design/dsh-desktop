export type SherlockAboutLocale = 'zh' | 'en'

export type SherlockReleaseNote = {
  version: string
  date: string
  items: string[]
}

export type SherlockAboutInfo = {
  productName: 'Sherlock'
  version: string
  releaseNotes: SherlockReleaseNote[]
}

type UpdateVersionReader = () => Promise<{ currentVersion: string }>
type ManualUpdateChecker = () => Promise<UpdateStatus>

const releaseNotes: Record<SherlockAboutLocale, SherlockReleaseNote[]> = {
  zh: [
    {
      version: '0.8.0',
      date: '2026-09-03',
      items: [
        '修复研究画布已有组件但没有对话时，会话未保留、没有标题及切换后从侧栏消失的问题',
        '新研究不再复用已有内容的画板；无对话的研究会话可从侧栏直接恢复对应画布，并按组件内容显示标题',
        '修复组件靠近画布边缘时功能栏换行溢出的问题；工具栏保持单行并自动避让，菜单与创建输入框保持可操作',
        '思维导图、总结提炼和基于所选创建的新组件优先出现在来源附近，允许重叠、自动选中并置顶，保留原有组件位置'
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
        '新增简洁的 Sherlock 启动动画，改善客户端启动时的视觉衔接',
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
        '统一 Sherlock Agent 品牌表述，并修正部分会话中用户消息与助手回复的显示顺序',
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
    {
      version: '0.8.0',
      date: '2026-09-03',
      items: [
        'Fixed canvas-only research sessions losing their sidebar entry or title when no chat message had been sent',
        'New Research no longer reuses a populated canvas; reopen canvas-only sessions directly in Research with titles derived from their components',
        'Fixed floating component actions wrapping and overflowing at canvas edges; keep a single row with viewport-aware positioning and accessible menus and creation prompts',
        'Mind maps, summaries, and Create from Selection outputs appear near their sources, are selected and brought to the front, and may overlap neighbors without moving existing components'
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
        'Added a restrained Sherlock launch animation for a smoother transition into the client',
        'Fixed the New Research first-screen canvas, header, and right-side conversation layout, and added a dedicated Research icon',
        'Fixed blank PDF pages in the Research canvas after successful document loading',
        'Improved blank Research guidance with the Sherlock headline, kept workspace and mode controls above the composer, and prevented the mode control from disappearing in New Chat',
        'Fixed New Chat doing nothing when reusing a blank Research session, so it now switches directly to the New Chat screen',
        'Widened assistant reply components added to the Research canvas while preserving adaptive sizing and manual resize controls'
      ]
    },
    {
      version: '0.7.4',
      date: '2026-08-31',
      items: [
        'Standardized Sherlock Agent branding and fixed the display order of user messages and assistant replies in affected conversations',
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
  return {
    productName: 'Sherlock',
    version,
    releaseNotes: releaseNotes[locale].map((note) => ({
      ...note,
      items: [...note.items]
    }))
  }
}

export function createSherlockAboutBridge(
  readUpdateStatus: UpdateVersionReader,
  checkForUpdates: ManualUpdateChecker,
  locale: SherlockAboutLocale
): {
  getInfo(): Promise<SherlockAboutInfo>
  checkForUpdates(): Promise<UpdateStatus>
} {
  return Object.freeze({
    async getInfo(): Promise<SherlockAboutInfo> {
      const status = await readUpdateStatus()
      return buildSherlockAboutInfo(status.currentVersion, locale)
    },
    checkForUpdates(): Promise<UpdateStatus> {
      return checkForUpdates()
    }
  })
}
import type { UpdateStatus } from '../shared/contracts'
