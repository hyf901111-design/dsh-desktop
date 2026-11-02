# Computer Use 后台策略与独立插件接入

本轮功能基线：`f18e4b52ff503e7b492a03a77b071d52ac565093`。没有恢复停放的 Harness、Windows 或金融预览实验，没有修改插件原包或共享客户端。

## 已改源码

- `computer_use` 观察窗口不再调用 `bring_to_front`。公开 `focus.appActive=null` 表示没有查询实际前台状态，不能拿它证明焦点不变。
- 同 PID 多窗口键盘路由被拒绝，以及网页编辑器的 AX 写入不可靠时，返回 `background_input_unavailable`，不自动重试 foreground。网页语义拒绝独立于控件框是否有效；拒绝前不移动助理指针。
- 其余支持的窗口输入仍携带 `delivery_mode=background`，保留准确 PID/window/revision、过期重验、取消、租约和动作后回读。无法后台执行时不虚报任务完成；应改用已授权的原生内容/API 能力或解释能力边界。
- `open` 不调用没有后台承诺的 Cua `launch_app`。运行中的准确实例只发现窗口；未运行实例由宿主的 `computer-launch.node` 处理。

## 宿主后台启动

使用公开 `NSWorkspace.openApplicationAtURL:configuration:completionHandler:`，明确设置 `activates=NO`、`allowsRunningApplicationSubstitution=NO`、`createsNewApplicationInstance=NO`、`promptsUserIfNeeded=NO`。不提供可由模型改成 foreground 的开关，不转发启动参数、文档 URL、环境变量、Apple Event、脚本或命令。

依据：[Apple OpenConfiguration](https://developer.apple.com/documentation/appkit/nsworkspace/openconfiguration)、[Apple openApplication](https://developer.apple.com/documentation/appkit/nsworkspace/openapplication(at:configuration:completionhandler:))。`activates=NO` 是宿主不请求激活，不能保证任意目标应用自己的启动代码不会激活窗口。

准确目标流程：

1. 通常 `apps` 从驱动发现运行和安装的应用，返回准确 `launch_path`。同名、同 bundle 多副本/多 PID 不默选第一个。
2. 未注册的自有 `.app` 可先 `apps({bundle_id,launch_path})`，宿主在原生 worker 只读核对 NSBundle 身份，返回规范路径并记录于当前租约；界面线程不读应用元数据。宿主等待最多5秒或随用户取消结束，晚回只读结果被丢弃，不触发启动。此路径仅定位应用，不增加任务授权。
3. `open` 只接受本次列表或当前租约已核验的目标。宿主记录的目标在打开前再次检查；原生层再验证准确 App URL 与 bundle 一致。
4. 未明确选择路径时，原生层查询该 bundle 的全部注册/运行副本，遇到多个 URL 拒绝启动。明确路径时禁止替换成其他 URL 的运行实例。
5. 已有准确实例不重新打开或激活。新启动回报 PID 后由驱动发现窗口供下一次观察；启动成功不等于后续任务成功。

启动的 completion 等待使用15秒 deadline；文件系统元数据访问本身不能被强制中断，慢盘/网络挂载解析仍需单独验收，不把它描述成整个调用的绝对耗时上限。取消发生在投递前，返回未投递；投递后的取消、超时、回报身份不符或无法确认，返回 `performed=null/effect=unknown`，不自动重试。迟到 completion 只持有共享状态，不访问已完成的 N-API job，也不能把已经返回的不确定结果改写成成功。窗口回读中断保留已投递事实。若目标成为原先不是的前台应用，返回 `launch_focus_changed` 并停止本轮桌面租约，不自动切回用户原应用。

## 找到的独立插件

| 项目 | 核对结果 |
| --- | --- |
| 独立源码 | `/Users/heyafeng/Documents/ChatGPT/ework-dsh-plugins/.worktrees/computer-use-plugin-20261021`，HEAD `9fdeb9643fa8bf8b08d69b3a096ed0e25531c672` |
| 分发包 | `/Users/heyafeng/Documents/ChatGPT/ework-plugin-artifacts/computer-use/0.1.0-20261021-066d1c5e/ework-dsh-computer-use-0.1.0.tgz` |
| SHA-256 | `066d1c5e003a5e4776d322aff58cce74ffff0c4a2cda4de7eb6d7033adc73c9b`；原包保持不动 |
| 产品工具 | `computer_use_plus`，与 builtin `computer_use` 名称不同，独立注册、没有自动替换 |
| SDK | 内带 Cua 0.28.2、contract 0.8.0；本机当前 DSH rc.7 / Cordis 4.0.1 在其声明 cohort 内 |
| 后台路径 | 精确窗口观察不前置；动作只请求 background；已知不支持时拒绝，不回退前台 |
| 缺失项 | 插件没有 open/launch 操作；没有全局用户物理输入接管监控；Chromium 滚动、同 PID 键盘及拖拽仍需真实验收 |
| 证据边界 | 旧 AppKit fixture 只证明该 fixture 的有限后台输入和回读；旧 fixture 自带激活，不能证明用户前台与物理鼠标不变；本轮未安装或实操插件 |

插件回报的 `global_input`、foreground 或 unknown delivery 不当作成功。该判定发生在投递后，无法撤销之前的副作用；最终仍需真实系统 front PID 和物理指针观察。

## 新包中的隔离插件安装计划

产品目前没有集成该包。使用新构建的独立 QA userData（`--sherlock-user-data-dir` / `--sherlock-app-data-dir`），其 DSH_HOME 是 `<QA userData>/harness`，先停止该 profile 的任务和宿主再修改插件。

通过该客户端自带、同一 SDK cohort 的官方 DSH CLI 安装：

```text
DSH_HOME=<QA userData>/harness <该客户端自带 node> <该客户端 @deepseek-ai/dsh/lib/bin.js> plugin --profile web add <准确 tgz> --ignore-scripts --config.auto-install-peers=false
```

插件项为 `@ework/dsh-computer-use`；QA profile 的插件配置须明确 `hostBundleId=com.evanarts.sherlock`。默认的 `org.ework.computer-use-plugin` 不应被误当成当前宿主 TCC 身份。确认实际 profile composition、仅一份共享 Cordis/DSH peer registry、工具注册与卸载后再启动验收。移除使用同一官方 CLI 的 `plugin --profile web remove @ework/dsh-computer-use`。不把商店 DeclarativeInstaller 的 skill/MCP manifest 当作 Cordis tgz 安装入口。

配置的实际字段是插件 `Config.hostBundleId`，对应 Cordis entry `id=ework-computer-use` 的 `config.hostBundleId`；独立 QA profile 的 `$DSH_HOME/profiles/web/cordis.patch.yml` 可用官方 matching-id patch 覆盖，不修改安装包中的 patch：

```yaml
- id: ework-computer-use
  config:
    hostBundleId: com.evanarts.sherlock
```

先用同一 CLI `--profile web --dump-config` 核对最终 composition 只有这一插件 entry、正确 hostBundleId，再启动该 QA 客户端。当前源码依赖实际解析为 `@deepseek-ai/dsh=0.1.0-rc.7`、`@deepseek-ai/cordis=4.0.1`，tools/llm/attachment/agent/session 均为 `0.1.0-rc.7`，Cua 为 `0.28.2`；新包仍需在包内重新读取这些版本，并比较宿主与插件解析的 peer 模块 realpath，版本相同不等于同一个 registry 实例。

产品主 agent 的发现验收应在该 QA 客户端内新建真实会话，明确要求“仅调用 computer_use_plus 的 status，不执行桌面观察和输入”，检查该会话实际工具调用记录和返回结果；不能拿独立 SDK import/load 成功替代。随后明确调用 plus 的 apps/windows/observe，确认实际选中的模型通过图片输入准入，并收到保存到该会话附件服务的真实截图。插件在每次视觉操作前检查当前 provider/model 的 image 输入能力与附件服务，不绕过文本模型限制。缺图、附件失败或动作后取消不会伪报可继续盲操作。builtin 与 plus 的参数不同（`window_id` 与 `windowId` 等），以实际暴露 schema 为准。

两工具之间存在插件的双向租约，但其注册前已经启动的 legacy 动作无法追溯发现。因此先完成或停止旧桌面任务，再加载插件。不能在旧动作中途安装来宣称已经互斥。

## 验证边界与 Native 验收矩阵

本轮仅做源码聚焦检查、类型检查、独立原生编译/导出检查，以及自有 QA App 的只读身份解析；没有启动 QA App、真实输入、共享 App 构建、插件安装或鼠标不抢占实测。

| 验收 | 必须观察的真实结果 |
| --- | --- |
| 冷启动准确自有 QA App | 先 apps 只读解析，后 host open；启动前后 front PID 与硬件 cursor 不变，准确 PID/path 可回读 |
| 同 bundle 多副本 | 主客户端、114、116 不默选；选择准确路径/PID 后不激活错误副本 |
| plus 输入与按钮 | 用户继续在另一 App 输入；QA 文本值与 Save 回调变化，不能只看 AX echo |
| 同 PID 多窗口/弹层 | 不输入到兄弟窗口；支持则真实回读，不支持则明确拒绝且无前台 fallback |
| 滚动与拖拽 | 验证实际视口/落点与目标回调；保持物理指针不动，不把返回 JSON 当任务完成 |
| 用户停止与后台投递超时 | 取消未投递动作；已投递启动/输入保持 unknown，不重复动作；租约和指针收起 |
| 插件 coexist / 卸载 | builtin 与 plus 互斥、卸载 drain；不把其他系统自动化或用户操作当成已监控 |

不支持的能力应在最终测试报告中列明，不用隔离 mock 或旧 fixture 代替签名新客户端的 Native 验收。
