# 纯合成 V5 完整合同示例

本目录是可重复运行的合同教育与功能验收输入，所有公司、证券、财务、季度实绩、行情、行业描述及估值参数均为虚构。`synthetic: true` 与证券代码 `SYNTHETIC` 必须保留。它不是任何真实公司的研报，不能改成贵州茅台或其他真实公司名称后作为真实研究。通过表示结构、本地证据绑定及受控计算可以复算，不代表外部来源真实、经济判断正确或专业证券研究签发。

`packet.json` 使用 `schemaVersion: 2`、`report.profile: "full"`，包含十个有证据的章节、支持事实—推论—假设—反证—跟踪的论点链、六年三情景经营驱动预测、实际天数折现与余期现金拆分、独立金融净资产股权桥、敏感性及受控现价反解。`v5-source.txt` 与 `market.txt` 是实际校验的原始合成文本，每个引用有定位，来源记录含 SHA-256。目录仅保留输入和说明，不存运行输出。

财务锚明确为 2025 全年收入 1000 元、2026 中期收入 500 元；2025 每季及 2026 前两季收入均为 250 元，归母净利润均为 40 元，年度与中期归母净利润分别为 160 元与 80 元。最近四季为 2025Q3—2026Q2；同季比较使用 2024Q3/Q4 收入各 200 元、归母净利润各 32 元，2025Q1/Q2 沿用上述对应季度实绩。小额金额是便于复算的教育向量，正文使用受控 token 的 `raw` 格式，不能把演示规模当作真实业务。

市场输入覆盖 2025-10-22—2026-10-22 全部合成周内日期，包含 262 个共同日期。日历只排除周末，未模拟交易所节假日，明确不是实际交易日历。股票与基准均由确定过程构造，未复权价格回报不含现金股息，不是策略回报。估值桥 `priceRef` 与市场末日 `stockRef` 都指向 `stock262`，使用同一证券、日期及 362 元/股的合成完整收盘事实；原工业快照中的同日价格亦同步为该值。

工业现金流是显式非金融经营剥离代理，不认证为纯 EBIT；金融净资产不进入工业收入或工业现金流，只经独立持股比例及 PB 进入股权价值桥。母公司现金是可识别子集，工业有息债务单列。所有增长、利润率、再投资、折现及现金转移参数均写明合成研究理由，不能借用为任何真实公司的默认参数。

## 在 EWork 中运行

先加载“研报写作”技能，以加载回执中的实际资源目录作为 `SKILL_ROOT`，不要假定技能位于当前工作目录。技能资源只读：先把本目录的 `packet.json`、`v5-source.txt`、`market.txt` 复制到当前会话工作区，例如 `research/driver-v5/`，再依次调用可见的专用 `research_report` 工具：

```json
{"command":"doctor"}
{"command":"validate","input":"research/driver-v5/packet.json"}
{"command":"run","input":"research/driver-v5/packet.json","out":"driver-v5-review-本次唯一名称"}
```

默认运行必须生成同名正式 HTML/PDF，从工具 `artifacts` 或 `run.json.artifacts` 读取实际文件名；不要猜测 `report.html`。只有真实回执 `delivery.completed` 同时含 `html` 和 `pdf` 才能宣称双格式交付。PDF 需客户端内置打印服务与真实目录分页；不能用下面的开发 HTML 检查替代客户端双格式验收。示例本身是纯合成合同完整输入，不能称作真实公司的研究完整成品。

## 开发检查

下面仅演示资源脚本如何使用实际 `SKILL_ROOT`；变量由开发者按当前加载回执与会话工作区填写，不含凭据。输出目录须是尚不存在的会话工作区目录，不写入技能资源。CLI 的 HTML 单格式仅用于开发检查：

```sh
SKILL_ROOT="<加载技能返回的实际绝对资源目录>"
RESEARCH_WORKSPACE="<当前会话工作区绝对路径>"
node "$SKILL_ROOT/scripts/research.mjs" validate --input "$RESEARCH_WORKSPACE/research/driver-v5/packet.json"
node "$SKILL_ROOT/scripts/research.mjs" run --input "$RESEARCH_WORKSPACE/research/driver-v5/packet.json" --out "$RESEARCH_WORKSPACE/driver-v5-development-html-唯一名称" --format html
```

专属应用测试读取这套静态输入，实际执行 `validatePacket → calculatePacket → validateReport/renderReport` 及隔离 CLI HTML，核对完整性、反解实际执行、市场同源现价和季度财务勾稽，并在结束时清理临时输出：

```sh
npx vitest run test/equity-research-v5-example.test.js
```
