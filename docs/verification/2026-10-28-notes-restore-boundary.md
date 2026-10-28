# 工作台恢复记录边界与 Notes 渲染记录重入

基线 `31635642e5ddbb395d1ce4aea5ad7da5eab32a3c`。父批次在 clean integration `81be54ed0445bd13968030b041603552519790c6` 合入候选时，原 Voice current/8d17 的完整生产重入检查因 grid restore JSON.parse 被阻断。本轮未构建共享客户端、未写 SDK 资产或更改门禁判定。

## 定位与修复

实际 JSON 本身合法。grid writer 已把字符串内 `*/` 转义为 `*\/`，但 reader 把全文件最后一个 ` */` 当自己的结束位置，吞入随后独立的 `SHERLOCK_PPTX_ANNOTATION_MESSAGE_RESTORE` 等注释。feature 资产在相对位置787040、integration资产在792488出现相同越界。现在 grid restore 与 Notes destination 的同格式 reader 只取本记录之后的首个实际终止符，后续内容逐字保留；缺边界、坏 JSON、原精确 anchor 校验与逆序恢复不放宽。

完整生产入口继续重放时又发现 Notes316 的独立问题：专属 HTML context 修改了 ResearchHtmlArtifact，却没有同步 grid 对该函数的完整 before/after 恢复记录。现在同一确定性 renderer 变换同步两侧，先验证唯一 AST 函数、唯一合法全函数记录，actual 必须精确匹配原 after 或确定性 patched after。未知改动拒绝；既有全局 Notes marker 不跳过旧记录升级。未增加尾部协议，补丁保持幂等。

## RED → GREEN 与聚焦

- `workbench-restore-metadata.test.js`：真实相同边界错误和多个尾注释、代码、writer转义、reverse、残缺/坏JSON、Notes旧migration等先7条失败；修复后12条通过。raw installed仍保留未unwind外层patch时，其严格 anchor 拒绝保持；完整恢复以生产入口为准。
- `notes-html-restore-record.test.js`：从实际 SDK 提取渲染函数，记录同步、已标记旧记录升级与未知改动拒绝先3条失败，修复后3条通过。
- 原 Voice current/8d17 完整VM两次入口均通过：passes2、syntax/protected regions/guards均true、dependencyWrites0。未修改原断言；全文字节一致性输出仍按原用例记录，不新增或删除判定。

```sh
npx vitest run test/workbench-restore-metadata.test.js test/notes-html-restore-record.test.js test/notes-html-interaction-bridge.test.js test/notes-html-interaction-browser.test.ts test/notes-reply-actions.test.js --reporter=dot
npm run typecheck
git diff --check
```

feature直接范围 **5文件34/34**，含真实 Notes HTML双层iframe4；typecheck/diffcheck通过。日志 `/tmp/sherlock-restore-boundary-20261028/focused-final.log`、`typecheck.log`。独立只读复核确认边界、尾部 bytes、未知变更拒绝、Notes before/after同步及坏记录形状拒绝。

另在冻结 integration 的真实 APFS依赖图运行原命令：

```sh
npm test -- test/research-voice.test.ts test/composer-voice.test.js test/composer-voice-patch.test.js test/composer-voice-browser.test.js test/composer-submit-policy.test.js
```

**5文件100/100**，32.94s。只读 source projection 仅把候选四个script模块映射到feature源，测试文件/判定不变；生产VM的所有写入仍落在原内存overlay。日志 `/tmp/sherlock-restore-boundary-20261028/integration-voice-gate.log`，投影代码 `source-projection.mjs`、独立两版本VM记录 `voice-current.log` / `voice-8d17.log`。这是候选图验证；父仍须按官方流程在实际合入源码上执行已声明门禁。

feature与integration两份SDK资产SHA256前后均不变，证明 `/tmp/sherlock-restore-boundary-20261028/sdk-unchanged.json`；integration HEAD及源码保持clean81be54。未重装、清理或篡改SDK，未操作真实用户笔记。部分旧fixture直接restore raw installed而未走生产outer strip，其严格锚点错误未被放松或冒充通过。
