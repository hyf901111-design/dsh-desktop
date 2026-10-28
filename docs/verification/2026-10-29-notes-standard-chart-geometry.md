# Notes 标准图表几何修复

原生自建 QA 最新一次公开 HTML 的数据、tooltip、明细为 10/20/15，但硬编码 Y 轴为11.3～18.8，点位213.1579/40/150；相同数据差5在图中相距63.1579和110像素。两次公开 turn 都带同一错误，说明不是客户端缩放。只读公开 final，未读取 reasoning/凭据。

新 artifact 接收时，唯一静态数据与既有 fixed-chart 布局对应明确，才调用现有 cartesianChartSvg 的统一 domain/pos 投影刻度及几何属性。原坐标系40～260投影后点为250/50/150，刻度9.5/12.25/15/17.75/20.5。外层、脚本、详情和输入逐字保留，SVG root、group、cursor 身份和原 X 交互约定保留。无整卡 template 标记冒充，无旧卡迁移。

回归包括真实公开输出经 Notes 同 child 修复链；单次收齐 shared/geometry/design；修复不得改变数据或丢弃图形/备注/详情；合法自定义 domain、负/零/常量/多组数据、12分类稀疏标签、动态/多图/变换/不明确来源不猜。小数刻度使用原5位有效数字，避免 Intl 默认3位小数把微小有效值显示为0。

直接后端5文件280项、runtime相关筛选27项（236未选）、typecheck与diff-check通过；未运行全功能测试。独立真实production Notes浏览器3项：1100浅色、480深色数学与cursor/legend/备注/details ACK保存重开；raw旧卡内容/原几何不迁移。公开fixture只含自建QA demo内容，无真实用户资料或provider调用。

证据：/tmp/sherlock-notes-chart-geometry-20261029/。browser基线只读overlay有真实RED；green.log及green/截图、geometry-final.log、runtime-final.log、typecheck-final.log。npm pack --dry-run --ignore-scripts 的清单包含新增generated-chart-geometry.js；正式profile按projectRoot/packages整目录递归复制，本地file依赖及最终app/profile的SHA由集成负责人正式构建时核对。未更版本、依赖安装、共享客户端或用户数据。

此前已签名a1a331的备注中文加20个ASCII、details展开保存并退出重开由集成负责人通过。此轮新几何在最终正式合入、本地构建后使用干净QA相同需求做真实模型验收，本文件不冒称该最终新包验收已完成。
