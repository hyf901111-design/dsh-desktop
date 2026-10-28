# Notes 原生行情选择与 Research 外观一致性

本轮接在 `251993fb7a755ed424a118766519e4340487107d` 之后；最终增量交接仍从父已注册的 `31635642e5ddbb395d1ce4aea5ad7da5eab32a3c` 起算。未构建共享应用、未操作真实用户卡片或替换 SDK。

## 原因与行为

父代理真实 QA 的“插入一个行情面板组件”被模型转写为 `financial-widget.indices`，且没有 symbols。该配置合法（用户可以手动清空指数选择），但渲染器把空数组和空报价作为已有内容，导致空壳及错误的成功状态。

现在只有完整匹配创建原生“行情面板”库项的原始人类需求才直接采用 `financialWidgetDefaults('quote')`。宿主传递的 `sourceInstruction` 覆盖模型附带值，编辑已有组件以及附加证券、指数、演示、来源或额外功能需求保持原生成通道。原生选择器不预填证券、不调用行情接口、不制造行情；回执及来源明确说明选择证券后才载入。

合法的空指数配置显示配置入口，不请求数据。已选择指数但返回空报价时显示缺失与重试，清除本次获取时间，沿用原 merge 保留上次有效报价、来源和时间，不产生成功涨跌提示。既有用户组件的类型、证券、布局和数据没有迁移或改写。

## 外观与真实渲染验证

Notes NativeComponentBlock 使用 Research 已有 header、标题、控件与 Close mask 图标：表头34px、标题12px/700、16px图标、20×24px按钮，外框边界与圆角相同。移除 Native 右下独立样式入口，保留 stored presentation、尺寸、拖动/键盘调整、对齐和数据。quote/announcements 标题保留组件名称并使用同一证券选择器；窄列搜索和按钮沿用 Research 的容器约束。

浏览器 fixture 从实际 installed asset 完整执行生产 unwind，再用当前 data/financial/grid/Notes serializer 重放，使用生产 preload resolver 和真实 NativeComponentBlock；不把生产 renderer 换成 stub。500px浅色、320px深色对照 header/frame/Close；真实点击周期、指标、搜索与选股后检查保存 payload。长指数卡保留内部滚动和可见 footer。外部行情请求只使用明确的合成 fixture 数据，未宣称取到真实行情。

新 UI6与内容4、旧 layout5及 interaction/presentation/native 等合计29项已通过，原有保存重开、对齐和尺寸断言保留。截图、几何 JSON 与初始 RED 见 `/tmp/notes-native-chrome-3QKp5I/`；内容 RED/GREEN 见 `/tmp/sherlock-notes-quote-selector-20261028/`。两个 writer 交叉只读复核均无阻塞。

## 统一聚焦结果

- Notes 直接范围 **31文件485/485**，含行内 Space、取消/锚点、组件执行、HTML ACK、持久化、恢复记录以及本轮 Native UI/行情测试。命令使用 `--maxWorkers=2 --reporter=dot`，未修改 timeout 或断言；日志 `/tmp/sherlock-notes-quote-final-20261028/notes-focused-bounded.log`。
- `npx vitest run test/financial-widget-contract.test.js test/notes-client-capability-service.test.ts --reporter=dot`：**2文件38/38**，日志同目录 `notes-route-contract.log`。
- `npm run typecheck`、`git diff --check` 通过。
- 冻结 integration `81be54ed0445bd13968030b041603552519790c6` 的真实 APFS 依赖图，原 Voice 五文件 **100/100**，current/8d17 完整 VM 重入均通过。仅只读映射候选源，原测试及判定不变，SDK 未写；日志 `integration-voice-gate-serial.log`，映射清单 `projection-files.json`。父仍需正式 refresh/preflight/merge 后再验收。

原 Voice 命令保持：

```sh
npm test -- test/research-voice.test.ts test/composer-voice.test.js test/composer-voice-patch.test.js test/composer-voice-browser.test.js test/composer-submit-policy.test.js
```

## 追加：三模式组件样式规则

共享规则进入实际 conversation 父 system prompt、组件 child 的 full/panel/selection skill 三种入口及金融生成指导；内部 skill 升至 v1.39.4。项目权威说明为 `docs/research-component-design-contract.md` 的“当前模式与宿主外观”。历史 Figma48/旧客户端64记录保留并明确不能覆盖当前宿主。

规则区分对话消息卡与 Research/Notes 宿主，固定外框、34px标题、控件、主题和真实状态职责；模型保留业务分节、筛选、布局和数据，不重复外层卡壳或自造无能力按钮。Notes 继承 Research，来源时点、获取时间与保存时间分开。原始资料、schema、校验器和长度限额未变。

TDD先9项真实入口 RED，后增加类型专属 profile 回归。直接范围7文件335/335；原 runtime 样式选择检查5/5（256项未选，不称全文件通过）；typecheck/diffcheck通过。日志 `/tmp/sherlock-component-style-rules-20261028/`。新增规则曾触发资料预算门禁，现只压缩共同规范并在已有明确类型的 panel 去掉其它类型目录与无关金融布局；full/selection/无类型保留原目录。共同头511字符/1130bytes，table panel4892<5000、24来源47694<48000且全部24记录保留。两独立只读复核均未发现阻塞。

首次把两组重型检查同时运行时，Notes 出现5秒超时后 fixture 异步清理连锁失败，Voice 也有一个5秒超时。失败日志 `notes-focused.log`、`integration-voice-gate.log` 保留，未列为通过。相同冻结源码分开运行、Notes 限制两个 worker 后上述结果全绿。feature 与 integration 两份 SDK 的 SHA256 前后相同，证明见 `before.json` / `after.json`；integration 源码保持干净。
