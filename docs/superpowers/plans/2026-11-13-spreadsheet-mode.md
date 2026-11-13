# 客户端表格模式 Implementation Plan

> Implementation proceeds in the isolated feature worktree with focused red/green tests.

**Goal:** 在原生会话顶栏用「表格」替换轨迹，复用右侧对话，可靠地编辑可见会话工作簿。

**Architecture:** Univer 负责工作表、网格、选区及计算；本地 ExcelJS 转换 XLSX/CSV。主进程按账号与会话保存工作簿，现有客户端能力目录经可见编辑器校验和版本比较提交语义操作，不传任意代码或文件路径。

**Tech Stack:** Electron, TypeScript, Univer, ExcelJS, Vitest.

**Spec:** Figma 第 77 页，入口 4612:365406、主界面 4611:368666、导出 4613:367254、选型 4614:365838。

- [x] 工作簿契约：A1 范围、值/公式/格式、创建或重命名工作表、批次原子校验、版本冲突、撤销；用实际版本与多工作表测试验证。
- [x] 文件：原生选择器，XLSX 多表/公式/常用格式往返，CSV 当前表仅值；测试公式字符串、文本安全与权限。
- [x] 宿主：原生表格页签和原生右栏；移除轨迹入口并迁移旧视图偏好。焦点视图使用原生收起，不加入底部对话入口。
- [x] 编辑：欢迎页、公式栏、工具条、网格、工作表、状态条及与按钮对齐的导出菜单；使用引擎验证手动编辑、选择、保存和缩放。
- [x] AI：通过 client_capabilities/client_action 暴露 inspect/apply/undo，绑定可见账号、会话、工作簿与发送时选区，保存后返回可验证回执；测试错会话、重复请求、旧版本、停止和选区冲突。
- [x] 聚焦检查、中文提交与集成交接；不替换共享客户端。


## 验收与范围

- Figma：[表格模式](https://www.figma.com/design/Jkyr5rMvgM8GNH6E68xnqd/EWork-Odyssey?node-id=4612-365406)。客户端复用同一会话顶栏、右侧页签、模型选择、附件与输入框；只在表格模式禁用底部对话。按账号、会话本地存储，旧轨迹页签偏好迁移为表格，原轨迹事件继续供已有详情使用。
- [Univer](https://docs.univer.ai/guides/sheets/features/core/sheets-api) 负责编辑、选区、计算和撤销；[ExcelJS](https://github.com/exceljs/exceljs) 处理本地 XLSX。CSV 导出的是当前工作表的值。XLSX 保留多表、常用格式和本地公式；不承诺宏、透视表、外部引用和所有 Excel 专有格式的无损往返。
- 本机运行 `node scripts/verify-spreadsheet-live.mjs`，需要安装 Electron。它用隔离窗口、真实网格和本地文件，覆盖键盘编辑、粘贴、公式重算、格式、撤销/重做、筛选、冻结、工作表、缩放、查找、文件往返、暗/亮色及重开。文件选择器返回由用例提供的临时路径；没有读取个人文件。
- 完整 EWork 客户端使用隔离配置和本机测试模型，从原生右侧发送指令，实测 `client_capabilities → spreadsheet.inspect → spreadsheet.apply`，B2 写入 123 后从工作簿菜单撤销。线上模型回答质量、Windows 视觉和共享发布包仍待各自验收。
