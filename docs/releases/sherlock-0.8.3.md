# Sherlock 0.8.3 发布记录

日期：2026-09-06。平台：macOS Apple Silicon。

## 来源与修复

用户明确授权 0.8.3 安装包、公证、推送现有用户以及私有 GitHub 的 `hyf → main` 流程。正式构建来源为独立私有仓库 `awake-ai-lab/sherlock-desktop` 的干净 main 提交 `0d20bd4582e9`，版本准备经 PR #6 合入；退出修复此前经 PR #5 合入。未推送原始公开 DSH 仓库、未推送版本标签。

修复研究窗口已销毁后，语音控制器清理回调重新读取 BrowserWindow.webContents 而抛出 `TypeError: Object has been destroyed`，进而阻塞退出和 ShipIt 安装的问题。改为绑定窗口时保存 WebContents 引用，在销毁阶段直接移除保存对象上的监听器。中英文更新日志同步至 0.8.3。

## 聚焦验证

11 个直接相关测试文件共 86 项通过，类型检查、生产构建、正式源码 gate 通过；未运行全功能测试。原生 Electron 回归覆盖关闭后清理、销毁后清理、销毁后替换窗口三个场景，旧实现复现同一 TypeError，新实现全部通过。

0.8.3 实际打包应用已显示真实主界面与 About 的版本和修复日志。实际点击关闭主窗口后再请求退出，进程正常结束、无主进程错误。这项验证覆盖此前关闭自动重启的升级夹具未覆盖的窗口销毁顺序。

## 数据迁移和共存

单独使用隔离的默认 appData 测试目录迁移：旧目录缺失文件复制、新目录已有合法 YAML 配置保留、迁移标记生成、真实主界面可用。测试准备时发现初始哨兵内容不是合法配置，已保留失败夹具并用有效 YAML 在全新目录重新验证，未改动应用源码。

DSH Desktop 0.1.1 与 Sherlock 0.8.3 同时运行，分别使用 `dsh-desktop` 与 `sherlock-desktop`；两个不同哨兵均保持原值，两个真实主界面均可用。测试进程已退出，不操作用户真实数据。

## Apple 公证与兼容包

- App：`com.evanarts.sherlock / 0.8.3`，Developer ID Application: yafeng he (FAV8TLDK73)。Apple 提交 `62c93310-da1a-47ce-955e-4b917a08a526`，Accepted。
- DMG：Apple 提交 `8910ce3f-04cf-45cf-a915-b4598b5e5d08`，Accepted。
- App/DMG 均完成 stapling，Gatekeeper 接受为 Notarized Developer ID；DMG 完整校验通过。
- 兼容桥外层 `io.dsh.desktop` 满足旧证书指定要求，内嵌为已公证 `com.evanarts.sherlock`，ShipIt 可执行且 Squirrel/Mantle/ReactiveObjC 完整。

| 文件 | 字节数 | SHA-512（Base64） |
| --- | ---: | --- |
| sherlock-mac-arm64-legacy.zip | 452825139 | `QCoT+C3CmmbhDZGvTfTeimarpcbvRx1QC1NEdzKxqTlVr7gmNo2gdtAa3rF16ByEZUbOwXvLvMJcx404gSWErQ==` |
| sherlock-mac-arm64.dmg | 326679895 | `5Xgl/z1SC2cUEvkTMNPpiiCeXSWRFLAzSPLSPcY/XYw6YXmL6hr/f8gIxhPNA+42TfBoYkO48od4VF6CWGuzVA==` |
| sherlock-mac-arm64.zip | 405815061 | `+ZVgfB6Lj80jtRY2lBuAkSPYvB0WTgI0rH4zgadxHgC2m7hFWV36Wz4YsVkdGQvcbbhGZPGyZc1QOzTbygZ35g==` |

## 旧版行为复现

另用真实 0.8.2 夹具先关闭窗口再退出，原样复现 `ResearchVoiceController.detachWindow → dispose` 的主进程弹窗；确认弹窗后旧进程退出。0.8.3 同样顺序无弹窗并正常退出。旧客户端代码在安装前不会被服务器侧修复，若从受影响旧版升级时出现该提示，需确认提示让退出继续，或使用完整公证安装包安装。

## 公开发布与安装验证

5 个版本资源上传到 `releases/v0.8.3/` 后更新稳定 DMG，最后提升两条 feed；临时上传 Worker `sherlock-release-upload-c9d538de` 已删除。8 个公开入口的版本、文件大小、Range 206 和缓存策略通过；稳定 DMG 保持 no-store/no-cache，两条 feed 与准备文件逐字节一致。

从公开稳定地址完整下载 DMG，SHA-512 与公证产物一致。添加浏览器 quarantine 标记后，DMG/挂载应用均通过 stapler、Gatekeeper 和完整签名检查，镜像校验通过。实际启动挂载应用，主界面和 About 均确认 0.8.3 与本次修复日志。

- 0.6.3：实际下载兼容 ZIP，完整哈希匹配。ShipIt 在原路径安装 0.8.3 兼容桥，随后桥转换为公证 `com.evanarts.sherlock`。保留同一隔离 userData 和哨兵，实际主界面、About 及更新按钮隐藏均验证通过。Bundle ID 变化导致 UI 自动化身份缓存过期，原路径安装与桥转换完成后，仅重命名测试夹具再核验窗口。
- 0.8.2：实际下载公证 ZIP，完整哈希匹配。旧版在下载后自动进入安装并停止页面服务，UI 会停在最后进度；后台已为 downloaded。安装器等待 macOS `AuthorizationCreate`，未完成应用替换。发现用户缓存中有 root 所有的旧安装日志，保留原件并重建当前用户可写日志后，用同一已验证缓存重试，仍等待系统授权。未代填密码、未操作受保护的 SecurityAgent 窗口；已请求用户亲自在 Mac 完成授权。该门禁目前待完成，不能宣称所有正式发布验收完成。

测试仅关闭自动重开，避免 Squirrel 将隔离测试应用重新打开到用户真实数据目录；安装仍由真实 updater/ShipIt 完成。0.8.2 原始退出错误与 0.8.3 的修复效果已通过独立真实窗口关闭回归验证。

## 保留与源码同步

当前版本安装包和两条更新源已发布；上一版 0.8.2 回滚文件与元数据均保留。正式通道真实安装仍等待用户系统授权，因此尚未执行最旧版本滚动清理，也未更新 R2 保留清单。源码和版本准备已通过私有 `hyf → main` 的 PR #6，发布记录同样按该私有分支流程同步；未推送公开仓库或版本标签。

本轮证据：`/tmp/sherlock-0.8.3-release-3b1zhp_v/`。安装产物、测试缓存和临时证据不进入 Git。
