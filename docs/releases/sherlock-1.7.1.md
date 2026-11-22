# EWork Odyssey 1.7.1

适用于 Apple Silicon Mac。

## 中文

- 新建对话或从浏览器等页面切回「对话」时，所属工作区会显示并选中「新对话」。折叠长列表时，当前会话仍然可见。改进了历史会话较多时的目录加载和搜索。
- 登录、退出或切换账号后，笔记、表格和演示按所属身份显示。演示改名后会同步到侧栏和搜索，旧演示也可以直接按已保存的文稿名查找。
- 在图像编辑器中使用模板后，可以切走再回到同一画布继续编辑，已有图层会保留。用「方形图片」描述需求时，生成图片和编辑画布都会使用 1:1 比例。
- 研究看板能根据给定数据直接创建图表。查询基金全称时会区分全称和简称，并提供资料来源。个人研究看板的终端也可正常打开。
- 看板日历的「快速添加」支持按回车或点击加号保存。知识库「所有文件」会列出计入总数的看板、文档和上传文件。
- 模型选择器在未登录时提供内置模型登录入口。浏览器打开受限地址时会显示具体原因，定时任务的会话记录会显示用户设置的任务和执行结果。

## English

- Creating a chat or switching back to Chat from the browser or another workspace app selects New chat in its workspace. The selected chat stays visible in long, collapsed lists. Large chat histories now load and search more reliably.
- Notes, spreadsheets and presentations follow the active account or guest profile. Renaming a presentation updates its sidebar and search entries. Older presentations can be found by their saved document names before reopening them.
- After using an image template, you can switch away and return to the same canvas with its layers intact. Asking for a square image now uses a 1:1 aspect ratio for both the generated image and the editing canvas.
- Research boards can create charts directly from supplied data. Fund lookups distinguish full names from short names and include the source. The terminal now opens in personal research boards.
- Press Enter or click the plus button to save a quick calendar entry on a board. All files in the knowledge library now lists the boards, documents and uploads included in its count.
- The model picker provides a sign-in option for built-in models. The browser explains why a restricted address cannot open. Scheduled chat histories show the task you set and its result.

## 发布范围

本版包含 EWork Odyssey macOS Apple Silicon 客户端及旧签名兼容更新。

## 发布验证

- 构建提交 `ace3a87cbccf53ed9aa23ad9ccd972b42d9cbbae`。130 项发布聚焦检查、类型检查和生产构建通过。集成批次的 12 组声明检查通过。签名版在隔离配置中打开主界面，旧配置迁移与 DSH Desktop 共存检查通过。
- App 和 DMG 使用 Developer ID 签名，旧客户端兼容桥保留原更新证书。已核验 DMG 内应用、两个签名要求和旧桥运行时依赖。按本次发布要求跳过 Apple 公证。
- 两个公开更新源均提供 1.7.1 和中英文更新日志。已核验固定版本资源和稳定下载地址的缓存、文件名、单段 Range 与 blockmap，并核对上传文件完整性。
- 使用本地验证过的 1.7.0 ZIP 与公开版本资源，分别重建两个 1.7.1 ZIP。两份文件的 SHA-512 均与签名发布包一致。未执行全量升级。

| 通道 | 完整包（字节） | 传输（字节） | 复用（字节） | Range 请求 |
| --- | ---: | ---: | ---: | ---: |
| 标准 | 965,767,803 | 91,999,502 | 873,768,301 | 167 |
| 旧签名兼容 | 1,043,693,249 | 137,666,046 | 906,027,203 | 297 |

- Homebrew Cask 已同步到 1.7.1，Tap 提交 `be7361919c18f2555a1ae589b8e71f7809600542`。公开 Cask 的 DMG SHA-256 为 `9bc72072a22d85d2d002b05f9f786fdc0c11d34ba8fdcea6b94ddc41739c6287`。
- 滚动清理移除了 1.6.5 的五个版本资源。1.7.0 的两条差分基线均可访问。

[下载 EWork Odyssey 1.7.1（macOS Apple Silicon）](https://updates.evanarts.com/releases/v1.7.1/sherlock-mac-arm64.dmg)
