# 浏览器网页右键、整页翻译与选区询问实现计划

用户已要求自主选择实现方式、不要反复确认。本轮直接沿用 Chromium、现有模型服务和全局右侧输入框，不另建浏览器对话组件。

## 已确认行为

- 网页原生右键提供：存储网页、打印、刷新、翻译为中文／还原页面语言、询问 EWork。保留适用的复制／编辑等常规行为。
- 存储、打印、刷新复用已有浏览器动作。
- 翻译直接替换网页中的文字，保留布局、链接和操作；不创建聊天 session。使用右侧当前选择的真实模型，不能忽略无 session 时的 staged 模型。
- 翻译后的右键提供还原；部分翻译或失败也可还原。还原不重新请求模型、不刷新页面、不覆盖站点自己后来更新的内容。
- 询问 EWork：进入矩形框选，完成后在选区旁显示询问浮窗和蓝色选框；不显示编号、页码或 pin。
- 浮窗和右侧共用一个草稿，双向同步文字。选区截图加入既有附件；浮窗发送复用既有发送链路。无 session 时仍然只有用户发送后才创建 session。
- 关闭浮窗保留右侧草稿和已附截图；明确“删除选区”仅移除本次选区自己的附件，不删除其他图片或文字。
- 网页在所有交互中保持实时。只有用户完成框选时对原网页进行一次选区截图，不以截图替换网页。

## 文件和边界

1. `src/main/browser/context-menu.ts`（新）：构建 Browser 专用 Electron 原生右键菜单，动作绑定 tab/document/owner；复用既有系统菜单能力，不改变其他网页窗口。
2. `src/main/browser/translation.ts`、`translation-surface.ts`（新）：按 WebContents/document 保存翻译事务和恢复原文，有限隔离世界 DOM API、分批模型调用、取消和动态文字。
3. `packages/dsh-research-task-runtime/browser-translation.js`（新）及 runtime `index.js`：可信本地专用模型端点，复用已配置 provider，不管理新密钥、不创建 session。
4. `src/main/browser/region-overlay.ts`、`src/preload/browser/region-preload.cjs`（新）：透明 native WCV，矩形手势、选框和询问浮窗，UI 与网页分离。
5. `scripts/lib/browser-app-native.mjs`：复用普通／pending shell 的图片、草稿、订阅和发送入口；不新建 composer。
6. `src/preload/index.ts`、`electron.vite.config.ts`：可信桥、region preload 资源；`src/shared/browser-app.ts` 定义公开模型选择、翻译状态和询问状态。
7. `src/main/browser/service.ts`、`src/main/index.ts`、`src/preload/browser/view.ts`：生命周期、原生菜单动作、runtime URL、翻译状态、截图与浮窗消息接线。

## 接口约定

- `BrowserModelSelection = {provider:string;model:string;reasoningEffort?:string}`。仅此白名单，禁止从 UI 接收凭据、provider endpoint 或任意配置。
- `BrowserTranslationStatus = {state:'idle'|'translating'|'translated'|'partial'|'error';completed:number;total:number;canRestore:boolean;error?:string}`，仅当前 tab 对 UI 发布。
- `createBrowserTranslationManager({runtimeUrl,onChange})` 提供 `start(target,{selection?,sessionId?})`, `restore(tabId)`, `cancel(tabId,{discard?})`, `status(tabId)`, `dispose()`。`target={tabId,url,title,webContents}`。start 返回 Promise，服务可后台启动并通过 onChange 发布进度。
- 专用端点 `POST /sherlock/browser/translate`，输入目标 `zh-CN`、公开 selection、可选既有 sessionId、`items:[{id,text}]`。输出严格一一对应的 `items:[{id,text}]`。禁止工具调用，非 stop 完成、重复／缺少／未知 ID、空或超限译文均拒绝。
- 右侧无 session 模型从 `pending.preferences.model.store.getSnapshot().current` 取得；有 session 可查询现有 session models。以 `resolveModelInfo` 验证实际路由，不能仅用 advisory catalog 拒绝自定义模型。
- `createBrowserRegionOverlay(preload,getWindow,onEvent)`：`start({operationId,bounds,dark})` 进入框选；选区事件返回 viewport DIP rect；`showQuestion({operationId,rect,draft,draftRev,phase,error?})`；`updateQuestion(...)`；`cancel()`；`raise()`；`dispose()`。事件：`selection`, `draft`, `send`, `close`, `delete`，都绑定 operationId 与当前上下文。UI 委托代码可在实现时细化事件字段，须与调用端同一提交核对。
- 原生 mainworld 询问桥建立绑定 ticket，目标是当前普通 shell 或 pending shell。prepare 先展开全局右栏；attach 调用 `actions.addImageFiles([File])`；edit 用既有 setDraft/editRange；send 用既有提交入口；subscribe 回传 draft/revision/phase；close 只释放镜像；delete 移除该 ticket 自己追加的 image IDs。

## 实现任务

### A. 收口现有菜单焦点回归

修正 source document 未持焦时 render 恢复旧地址焦点，以及输入地址没有接管关闭旧菜单的问题。定向原生回归保持严格焦点断言，区分真实 UI 缺陷与测试前台被外部切走，不增大超时掩盖问题。

### B. 模型端点与翻译事务

- 约 40–64 段、2k–4k 字符分批，最多两路并行；优先当前视口，随后处理已加载文档文字。重复文字去重；保留原始空白与布局。
- 模型字符串作为数据，不执行网页或模型输出代码。通过有限隔离世界 API 修改 Text／安全显示属性，不写用户表单值、HTML、事件或样式代码。
- 评估 mainFrame 和子 frame 的隔离世界接口，覆盖可访问 frame 的普通文字；明确统计无法处理／超预算的内容，不能把部分结果冒称整页完成。尊重 translate=no，保留代码与可编辑输入。
- 保存原文直到真实 document 导航、关闭或显式还原。切换 tab 可取消任务但不能丢掉该 document 的恢复基线。
- 撤销 renderer job token 后取消模型请求。每个批次检查 document/job/原始文字；还原只覆盖仍等于本任务译文的节点。旧请求、网站更新与动态 DOM 都不得把还原后的页面重新翻译。
- 模型错误保留已完成结果和还原入口；提供中文状态，不泄漏 provider 配置或原始错误栈。

### C. 框选和同草稿浮窗

- 在开始框选前先展开右侧并等待 viewport 稳定，防止截图坐标因展开而错位。
- 原生透明层显示十字光标；沿用 PPT 的反向拖拽、clamp、pointer capture、4px 最小阈值和 Escape 取消规则。
- 框选后保持蓝色边框和淡蓝填充，无编号；询问浮窗靠近选区，自动选择下方／上方并限制在页面区域。
- 截图使用原 page WC 的 `capturePage(rect)`，保留实际选区分辨率，不调用现有整页缩至 1600px 的方法；截图不含选框或浮窗。
- 浮窗只镜像全局 shell；保留原草稿、引用和已有图片。处理 IME、快速输入、旧 revision、右侧同时更新、账号／会话切换和重复发送。
- 发送失败保留两处一致的文字和图片；发送成功才关闭临时浮窗。关闭／导航／缩放／viewport 改变取消浮窗 UI，保留已附入的草稿。
- 框选时不允许点击穿透误操作网页；询问阶段点击浮窗外可关闭 UI，明确处理原生层的 pointer／wheel 行为。

### D. 右键菜单与生命周期

绑定现有网页 WC 的 context-menu；菜单操作时再次核验 tab、URL、document 和 owner。翻译成功或部分结果时显示还原；翻译中有停止入口。内部页、主页和错误页不出现无效网页动作。新 overlay 在网页和圆角层上方，遵守现有菜单与全局面板 z-order。

## 直接验证与交付

- 单元／渲染：菜单 action/enabled/恢复标签；provider 选择与严格输出；分批去重、取消／还原、长文、站点更新、frame 和无 session；选区坐标、4px／反向／取消、草稿双向、IME、图片追加／自身删除和单次发送。
- 原生：正常及缩放后的原网页 capture rect、native 选框和浮窗层级、main 页面保持 live；真实全局右栏普通和 pending 输入、关闭和导航边界。
- 聚焦命令沿用 vitest 对直接涉及文件和 typecheck；不运行全功能单元测试。
- 受控模型验证之外，在最终签名的原客户端用公开页面验证真实当前模型翻译、原文恢复和选区询问草稿，再按本地运行手册构建／安装；不公开发布、递增版本或推送。
- 仅从干净集成提交构建，保留原数据目录、会话、模型和 Cookie。关闭本轮自己新增的测试页签，保持原客户端打开。

## 原日常客户端验收（2026-11-10）

- 签名集成提交 `67526e5e788623d57d13926b0fd71e5f235d4f31` 已替换原日常客户端，原有工作区、对话和 GLM-5.3-Flash / Max 配置可见，未迁移或重置数据。
- 公开 Example Domain 经当前真实模型整页翻译为中文，右键入口变为还原，随后完整恢复多语言原文；此过程右栏保持欢迎页。
- 实际框选截图进入原全局输入，两处文本双向同步。首次从浮窗发送才创建验收会话，真实模型约 10 秒后正确解释选区，页面截图附件和网页来源均进入原发送流程。
- 随后补充无焦点预热和可见/AX 就绪提示，避免用户在模式尚未就绪时开始拖动。该增量有 16 项聚焦、类型及独立原生 9 项通过证据。
- 在用户同时操作电脑时，重复的前台原生夹具收到外来键盘文字，导致合成文本严格断言不匹配；该次运行记为受干扰，不记作产品失败或通过。原生前台证明与后台集成检查必须分开记录，禁止为绕过外来输入而放宽断言或在日常操作中反复抢焦点。

## 2026-11-10 晚间：框选连续性与翻译状态回归

用户追加：框选经常无响应、右键行缺少 hover、翻译状态与地址栏过近，点击已翻译应直接还原并让按钮消失、地址栏恢复宽度。

- 复现内部 WC blur 会取消仍在进行的拖拽，重复 native raise 也能触发相同取消。保留真实父窗口失焦、点击外侧主界面、Esc、右键和导航取消；内部焦点变化不再代表取消，已在顶层的框选层不重复挂载。
- 框选等待截图/附件时显示准备提示。截图等待限制为 8 秒并明确报错；取消后的旧截图不能借用新 operation 的校验或关闭新选区，迟到截图不会附到新草稿。
- 原生非 key 菜单通过有限、带当前 revision/request 的 pointer 通知设置局部 hover 状态，渲染更新保留该状态，不取得父窗口焦点。
- 翻译按钮左侧额外 8px 间距；已翻译/部分翻译点击直接调用当前应用授权的还原入口。成功状态变为 idle，按钮移除，地址栏自然恢复原宽；还原失败保留状态供重试。
- 11 个直接相关测试文件共 84 项通过，类型检查与两份 preload 语法检查通过。补充红绿回归覆盖 native raise、内部 blur、截图超时、迟到截图、新菜单 hover 与地址栏恢复。未运行全功能测试。
- 本段提交时，原客户端签名构建和连续框选/实际 hover/一键还原观察待执行；不可将后台通过写作客户端已验。
- 补充 native 层级检查：稳定框选期间不重复挂载底部圆角 sibling，防止 native pointer capture 被移除。新增回归先复现两次重排，再验证框选结束后恢复圆角布局；85 项聚焦回归及类型检查通过。第一次本地构建在打包前期已主动终止，原客户端未被替换，最终包以此补充后的集成提交为准。

## 2026-11-10 后续：原生 hover 补偿与部分还原状态清理

用户实测确认上一版非 key 菜单依赖 native mouseMove 仍无 hover。新增仅在材料菜单实际可见时运行的 32ms 系统光标采样，换算到 popup 内容坐标并复用受 request/revision 约束的局部高亮通知；位置不变不重复 IPC，隐藏、切换、失焦、销毁均停止，继续不取得主窗焦点。

部分还原后若所有翻译记录已清理，仅有网站实时更新的冲突文字，不再把该事务留作 partial；状态回到 idle，按钮移除并恢复地址栏宽度，保留诊断但不覆盖网站更新。前端对 partial/translated 都直接发起还原，兼容陈旧 canRestore=false。按钮使用明确的 6px/10px 内边距和至少 32px 高度，抵抗宿主全局按钮 reset。

78 项直接相关检查、类型检查通过；红绿验证包括没有任何原生 mouse 事件时的光标高亮、离开/隐藏停止、部分还原清理、宿主 padding reset 及地址栏宽度恢复。实际客户端验证待最终签名更新后执行，上一版原生 hover 不记通过。
- 原客户端 `31ccde08…` 实测：Print 高亮跟随鼠标切换至 Reload，主窗保持激活；真实 GLM 翻译 GitHub Careers 后点击工具栏“已翻译”，原文恢复、按钮移除、地址栏恢复宽度。进一步发现高优先级基础 background 及未定义变量使状态按钮自身 hover 背景透明；补上同等优先级的真实字段色，并加入实际 computed background 非透明回归。最终 78 项回归、类型检查通过；此 CSS 补充后的客户端待再次安装观察。
