# EWork Odyssey 1.1.5

日期：2026-10-11。平台：macOS Apple Silicon。

## 更新日志

- 优化自选股右键菜单的图标、留白和点击区域，支持点击菜单外、按 Esc 或滚动画布关闭菜单。
- 新增自选股选中状态与拖拽连接节点，选中股票后可联动个股行情或对应相关新闻。
- 支持自选股、个股行情与新闻列表串联，行情组件切换股票时同步更新已连接的新闻组件。
- 连接线采用实线曲线，仅在选中相关组件时显示；节点支持悬停、连接反馈和组件亮框动效。
- 支持拖拽已连接节点断开或更换连接，限制右侧输出到左侧输入，避免无效连接破坏原有关系。
- 保存股票选择及组件连接，手动搜索可解除上游联动；移除来源、快速切换股票和撤销操作时保持数据与连接一致。

## 发布范围

- 用户已验收本地主干 `c4f0d666fcccf7149d83b1b4800b65f1325ba346` 的组件节点联动与右键菜单改动。
- Harness 后台能力、Windows 客户端和独立金融工作台预览实验继续暂存。
- 更新应用内中英文日志及公开发布说明；同时维护旧版兼容和标准签名通道。
- 采用双通道差分校验，不运行旧客户端全量下载、安装替换和重启升级测试。
- 发布成功后同步 GitHub `awake-ai-lab/sherlock-desktop` 的 `hyf` 与 `main`，不推送版本标签。

正式发布证据目录：`/tmp/ework-release-1.1.5-20261011`。

## 已完成的发布检查

- 83 项发布与关于页检查、92 项组件检查通过，共 175 项；类型检查和生产构建通过，未运行全功能测试。
- 从干净的本地 `main` 提交 `83430e1ece68f4de068927e9ce0acd3e3e67df6d` 构建，暂存实验保持排除。
- 标准应用、旧版兼容桥及 DMG 的签名、两个 ZIP 完整性和 DMG CRC 校验通过。兼容桥外层为 `io.dsh.desktop`，内层为 `com.evanarts.sherlock`，含可执行 ShipIt 及 Squirrel/Mantle/ReactiveObjC 依赖。
- 按用户本轮明确要求跳过 Apple 公证：停止公证等待，以 `mac.notarize=false` 从已签名应用生成安装包，兼容桥使用 `--allow-unnotarized-app`；不执行 stapling 与 Gatekeeper 验收。
- 包内主进程、preload 和组件客户端与本地构建产物逐字节一致；内置技能与运行环境校验通过。
- 真实原生关于窗口及设置关于页显示 1.1.5，六条中文日志和 1.1.4 历史记录正确；中英文发布说明与应用内日志一致。
- 原账户、GLM-5.3-Flash / Max 和保存看板恢复。验收看板七个自选标的、选中状态和节点连接保留；切换选股后行情及相关新闻同步，已恢复原选股五粮液。
- 隔离默认目录迁移复制旧数据并保留新配置值；EWork 与已安装 DSH 的真实主界面同时运行，两目录哨兵保持独立，已清理本轮哨兵并关闭测试 DSH。
- 不执行旧客户端全量下载、安装替换和重启升级测试。

## 公开发布验收

- 两个公开更新源均为 1.1.5，版本名为 EWork Odyssey 1.1.5；公开中英文更新说明与应用内六条日志一致。
- 两份公开 blockmap 与本地逐字节一致；两个 ZIP、版本 DMG、原稳定地址和品牌稳定地址的大小、缓存策略及共 15 组首段、中段、尾段 Range/206 校验通过。
- 稳定下载地址为 https://updates.evanarts.com/download/EWork-Odyssey-mac-arm64.dmg，文件名正确，使用 no-store 缓存策略。
- 从公开版本地址完整下载 DMG，大小 415383128 字节，SHA-512 与本地签名包一致；保留 quarantine 标记，CRC、挂载后应用版本及深度签名检查通过。
- 公开 DMG 中主进程、preload 和组件客户端与本地构建逐字节一致，检查结束后已卸载磁盘映像；按用户要求跳过 Apple 公证、stapling 和 Gatekeeper 验收。
- 发布后原生客户端中的贵州茅台行情与相关新闻继续联动，组件每 60 秒获取数据。
- 上传顺序为不可变版本资源、稳定下载别名、两个更新源；临时上传 Worker 已删除。

## 双通道差分验证

使用真实 electron-updater 差分下载器，从公开 1.1.4/1.1.5 blockmap 计算并通过单段 Range/206 重建 ZIP。只读取旧包缓存及差分片段，无全量回退；不执行旧客户端全量下载、安装替换或重启升级测试。

| 通道 | 完整包字节 | 下载字节 | 复用字节 | Range 请求 | SHA-512 |
| --- | ---: | ---: | ---: | ---: | --- |
| 标准签名 | 501180225 | 130544044 | 370636181 | 793 | 一致 |
| 旧版兼容 | 551890588 | 180176346 | 371714242 | 788 | 一致 |

- 标准 ZIP SHA-512：`b4Y1pbrkq9cCaCXGpQg9kdJFwk7KYnbFgV4p7Pq0KE2f76ZfC0wKKaSGsOUX7/QJa4+0ThrXyI4HN1f7HC3dew==`。
- 兼容 ZIP SHA-512：`9xNUZmenLSgSd7JNnZHNkxogvbN69iD71gaFM/izHfiG+eF9TyaWKEv7Dxs3MLX7pKFJ0BBVege/LPnIMdt11w==`。
- 公开 DMG SHA-512：`482tsdLzkDLOEEoaJlox//MKzAK5OGiqGRIcLdUwbyE9Rb9/QS4rVp2Fpe3JkVa/zGQiAo1AhxptdypxLWS8KA==`。

## 版本清理与源码同步

- 公开与差分验证全部通过后，按预演计划只删除 1.1.0 的五个不可变资源，公开路径均返回 404；保留 1.1.1–1.1.5，两个更新源和稳定下载入口保持正常，1.1.4 两份 blockmap 仍可访问。
- 源码同步方式：本地 hyf 快进至 main，再使用 `git push --atomic origin main:hyf main:main` 同时推送既有 Fork 两个分支；最终远端引用核验记录见证据目录的 `github-sync.json`。
- 收尾提交只包含本发布记录和 R2 版本清单，程序构建源码仍为 `83430e1ece68f4de068927e9ce0acd3e3e67df6d`，不推送版本标签。
