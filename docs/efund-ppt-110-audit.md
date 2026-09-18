# PPT skill 1.1.0 回归调查（2026-09-18）

使用用户提供的 17 页 EWork 轻应用部门宣讲 PPTX/PDF 与原生成脚本、qa-review、deviation-log 调查。未修改用户原件。

- 标题：生成脚本 rewrite_simple 只保留首个 run，没有显式 solidFill；旧 delivery 校验仅比对几何/内边距，且用布局占位符替代无几何的原对象，未检查 slide 中实际颜色。PDF 第 3/4 页可见深色顶栏文字。
- 阴影：第 4 页形状 107–110 保留 effectRef idx=2；shadow.inherit=False 仅写局部空 effectLst。旧结构校验仅查当前对象中的显式 shadow，不查主题效果引用。PDF 可见色块投影。
- 目录：保留 firstRow=1、bandRow=1、schemeClr 填充及未关闭边线；不同渲染器存在解释差异。旧门禁检查行中心、文字高亮和有无下边线，未检线宽/虚线/填充/主题条纹。具体 PowerPoint 与 PDF 外观差异仍须双端看图，XML 检查不能替代视觉判断。
- 交付：qa-review 明确写视觉复核未执行，最终回复却称全部门禁通过；偏差说明不能代替验收。

新门禁对旧成品报错：15 页 title-color-not-explicit，8 页 render-theme-effect-reference，5 页目录填充/主题条纹/边线未显式关闭。各计数按页聚合，不是对象总数。

验证：5 个聚焦测试文件、6 项测试通过；包含真实模板变异（黑标题、阴影主题引用、目录线宽）及视觉报告过期/缺失。quick_validate 通过。新增 check_efund_visual_review.py 仅检查报告证据完整性、页码及文件哈希，不能证明人工或模型真的完成观察。

## PowerPoint 实机补充

原文件打开出现“内容有问题”，修复后提示已删除部分内容；目录首行实际不可见，其他行变黑。XML 发现目录 rPr 顺序为 latin/ea/cs/solidFill，违反 fill 必须在字体前的顺序；新增已知 XML 序列错误门禁。该错误是目录跨软件差异的重要原因，主题样式是另一个风险。未保存修复窗口、未覆盖原件。
