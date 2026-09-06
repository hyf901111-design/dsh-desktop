# Sherlock 0.8.2 发布记录

日期：2026-09-06。平台：macOS Apple Silicon。

## 来源与更新内容

用户明确要求版本 0.8.2、更新日志、Apple 公证和向现有用户推送。本次从私有仓库 `awake-ai-lab/sherlock-desktop` 的干净 `main` 构建，提交 `0712740813dfa0b7c1b5c9ab14ddd9f59d4e00e1`。版本准备经 `hyf` 和 PR #3 合入 `main`；此前研究功能经 PR #2 集成。独立正式源码目录为 `/Users/heyafeng/Documents/ChatGPT/sherlock-desktop`，未合并原始 DSH 上游历史，未推送公开仓库或版本标签。

- 研究画布增加语音入口、双击 Fn 激活与精简波形反馈。
- 默认图表采用 Bklit 参考的黑白灰、直角和简约样式，跟随深浅主题，用户明确风格要求优先。
- 生成过程按行显示当前工作状态，隐藏代码；完成后平滑适配组件内容大小。
- 智能容器保留顶栏，操作集中到更多菜单，编辑需求支持取消。
- 改善检索主题相关性、基金代码及连续检索，避免将需求拆成无关词语释义。
- 修复空轨迹进入错误页面以及画布添加组件后不能切换对话/轨迹的问题。

中英文用户更新日志位于 `src/preload/about-info.ts`，真实 About 页面已显示 0.8.2 和上述六项更新。

## 聚焦验证与打包

16 个直接相关测试文件共 220 项通过；发布版本变动引起的 About 旧断言已修正，并独立重跑该文件 4 项通过。类型检查、生产构建、正式源码 gate、打包运行时校验均通过，未运行全功能测试。正式包包含有效签名的原生语音模块、Node、apache-arrow 和与源码一致的 `efund-ppt-maker v1.0.6`。

## Apple 公证

- 公证 App：`com.evanarts.sherlock / 0.8.2`，Developer ID Application: yafeng he (FAV8TLDK73)。
- App 公证提交：`5ba52e8a-37cf-49ba-ac6f-2ec84421acc4`，Accepted。
- DMG 公证提交：`553dc89c-c8f0-4a6a-8112-4764026e5ab6`，Accepted。
- App 与 DMG 均 stapler validate 通过，Gatekeeper 均接受为 Notarized Developer ID；DMG hdiutil verify 通过。
- 旧版兼容桥：外层 `io.dsh.desktop` 满足原 Sherlock Desktop Update Signing 指定要求；内嵌为公证后的 `com.evanarts.sherlock`，ShipIt、Squirrel、Mantle 与 ReactiveObjC 完整。


| 文件 | 字节数 | SHA-512（Base64） |
| --- | ---: | --- |
| sherlock-mac-arm64-legacy.zip | 452821414 | `Y33gdhe1rka6mcFF0FpZkgv0nL0KYiGMyybKxGr4HwP68nnWbXhwVW7T8/mSc3IXkIbgwWZ1fBYk+xC+3GH0Cw==` |
| sherlock-mac-arm64.dmg | 326773329 | `vOPaHxSh6ZnMEGh5Ek325IVwahMwFwWFamj00j4xS6xAo66QVhbk7eYWAkOo9/rtKtpZxSVamo8PE9qcemUoTA==` |
| sherlock-mac-arm64.zip | 405812310 | `L00vKKIfV0OC9hkh+V/zYNXIk/2vF4NtWyeUvLU8mirZJGBwkpG+CTNkIw547O3sTjAbZc4Fcj08vTfEdxVYwg==` |

## 数据迁移与共存

隔离默认 appData 下实际启动新应用，验证旧目录缺失文件复制、新目录已有值不覆盖、迁移标记生成。实际启动兼容桥后，它替换为公证新应用并保留隔离目录参数，真实主界面可用。DSH Desktop 与 Sherlock 同时运行于不同默认数据目录，两个哨兵均保持原值。这些验证独立于下述真实 updater 升级。

## 公开发布与升级

5 个不可变资源先上传到 `releases/v0.8.2/`，随后更新稳定 DMG，再提升旧版兼容和正式客户端两条 feed。临时上传 Worker `sherlock-release-upload-4516a77a` 已删除。

8 个公开入口均 HTTP 200、大小正确；非元数据资源 Range 0–0 均为 206 / 1 字节。两条 feed 与准备文件逐字节一致且版本为 0.8.2；版本资源 immutable，feed no-cache，稳定 DMG no-store / no-cache。

公开稳定地址完整重新下载 DMG，全量 SHA-512 与公证产物一致。添加浏览器 quarantine 标记后，DMG 与挂载 App 均通过 stapler / Gatekeeper，hdiutil verify 和 deep-strict 签名通过；真实主界面可用，About 显示 0.8.2 和六项日志。

真实旧版升级验证：

- 0.8.1 客户端在界面发现并下载公证 ZIP，下载全量哈希匹配。ShipIt 成功替换原应用路径为 0.8.2；隔离数据目录和哨兵保持不变，重新打开真实主界面与 About 正确，更新按钮隐藏。
- 0.6.3 客户端在界面发现并下载旧证书兼容 ZIP，下载全量哈希匹配。ShipIt 先替换为 0.8.2 / io.dsh.desktop 兼容桥，再由桥在原路径转换为 0.8.2 / com.evanarts.sherlock；新应用保留隔离目录参数，真实主界面、About、哨兵和更新按钮状态均正确。
- 为防止测试夹具自动重启进入正式用户数据，测试仅把自动重开关闭，安装仍由真实 updater / ShipIt 完成，再用相同隔离参数打开。0.8.1 首次安装曾被 UI 自动化提前拉起旧进程干扰，ShipIt 按保护机制取消；关闭多余测试进程后，复用已校验下载重试，安装成功。兼容桥改变 Bundle ID 后，UI 自动化缓存了原路径旧身份；原路径替换及运行版本确认后，仅重命名测试夹具再验证其真实窗口。未改写正式包或用户数据。

## 保留与源码同步

清理先经过 dry-run，仅精确删除最旧的 0.7.3 五个对象，版本清单添加 0.8.2。R2 完整列表确认 0.7.3 对象不存在，五个入口带缓存区分参数回源均为 404；0.8.1 回滚资源和 0.8.2 当前资源保留。无参数旧 ZIP 地址曾命中边缘缓存；当前 Wrangler OAuth 不具备该区域的缓存清除权限，精确清除请求返回 401，旧副本等待边缘缓存过期，不影响当前更新或存储保留。

发布后再次验证 8 个当前公开入口，版本、大小、Range 和缓存策略均正确。发布记录和保留清单通过私有仓库 `hyf` 提交并合并到 `main`，不推送标签，不推送旧公开 DSH 远端。

本轮本地证据：`/tmp/sherlock-0.8.2-release-3qd6y6bk/`。构建产物、缓存、隔离测试数据和临时证据不进入 Git。
