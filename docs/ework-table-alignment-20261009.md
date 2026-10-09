# 表头与数据列对齐修复

公共工作台列处理器现在为同列的表头和数据使用同一对齐方式：文本、代码和日期靠左，价格、涨跌幅、数量等数值靠右，显式布尔列居中。优先读取列类型和数值标记，未声明类型的列结合名称与有效数据判断；缺失值不改变列类型。

表头沿用对应数据单元格的左右留白，排序按钮继承列对齐并取消额外横向留白。单行默认显示、手动缩窄换行、拖动和键盘调整列宽、排序与刷新后的列宽恢复均保留。适用于现有原生表格及沙盒 HTML 表格，不改动源数据。

2026-10-09 聚焦验证：`test/workbench-table-columns.test.js` 和 `test/research-grid-client.test.js` 中直接相关的 5 项测试通过。`node scripts/verify-workbench-table-align.mjs` 在实际客户端渲染器上验证浅/深色、320/656 宽度共 4 个场景的文字边缘对齐，并验证序列化沙盒安装器；结果位于 `output/workbench-table-align/result.json`。

额外读取历史检查时，`research-component-upgrade-final.test.ts` 在导入阶段被既有 Figma 菜单补丁锚点阻断；研究画布旧工具栏尺寸断言仍要求 36px，而当前整理按钮为 34px。这两项没有作为本次表格验证的通过证据，也没有为本次修复修改工具栏或 Figma 菜单。
