# PPT 标注修改设计

## 目的与依据

在现有 PPT 右侧预览中标出位置，用户可以就地写意见，也可以继续在普通对话输入框中写；真正提交给当前模型修改真实 PPT，交付独立的新文件。依据用户指定的《设计 Figma 对话生成 PPT 预览》及 Figma Jkyr5rMvgM8GNH6E68xnqd：3008:446597 主图、3008:446792 工具栏、3017:370025 原生输入框、3017:370069 备注、3008:445056 边界设计（均已获取高保真上下文与截图）。最后的人类修订优先于设计历史：中性编号定位图钉、标签宽度随文字收缩、沿用客户端普通输入框控件。

用户授权直接开发并自行判断实施细节，不再另行要求方案确认。继续使用现有 React/TypeScript/Electron、原生连续 PPT viewer、SessionInputShell 与 managed skill；不用截图作为运行时 UI，不新增依赖或独立输入框，不修改壁纸内容。

## 方案选择

采用现有原生预览叠加标注层、普通输入引用与真实技能/工作区工具生成版本副本。现有 PPT 直接编辑只负责手动编辑，不作为标注文件版本库；教程的预制 AI 回复只服务教程，不处理真实标注任务。新建专用模型路由会绕过当前选择的模型与技能授权，故不采用。

## 用户路径与外观

1. 右侧文件顶栏在下载、文件夹、编辑同排增加“标注”图标。开启后其下一排只有“框选 / 点选”和数量。默认仍为快速预览；标注启动时才读取只读 scene，不申请编辑 token、不自动保存 PPT。标注和直接编辑互斥，退出有改动的编辑模式走现有安全保存流程，失败保持编辑。
2. 在实际幻灯片内容内点选对象/空白点，或框选区域。位置以物理页序、slide part、归一化点框、可选稳定 node IDs 保存。不能保存 client 坐标或用 slideN 文件名充当页序；滚动、缩放、窄栏、虚拟页卸载/重挂后位置不漂移。
3. 每个标记有跨页稳定编号，删除不重排，新建继续递增。深灰图钉、浅灰细线、浅色数字；选中只用淡蓝轮廓。复用 Figma 提供的静态图标并本地保存，编号动态叠加；原生已有完全相同图标可直接复用。slide 28px、气泡20px、输入标签18px，保持各自原始 SVG 尺寸。
4. 标记创建立即插入原生中央输入框引用，不必先填备注。简洁浮层仅编号/页与位置、关闭按钮、备注文本域。输入即同步；关闭、Esc、点空白只收起，点编号或中央标签重新打开并定位。
5. 中央引用沿用24px高、左右6px、间距5px的普通标签，数字 pin 替代普通 icon；真实文字测宽，不用空格撑宽。标签可选中并用键盘删除，点击定位不损害原键盘/IME/撤销功能。
6. 备注是显式跟踪的普通文本范围，不以换行或“最后标签到末尾”猜测。插入标注不覆盖已有整体提示词、其他附件/技能/备注。右侧修改只替换该标注拥有的范围；中央在关联范围内编辑同步到同一备注。在边界外继续输入保持为整体提示；中央 Enter 可正常换行，离开关联范围后不吞并整体要求。
7. 移除标签取消本轮引用，在同一原生撤销事务中移除该 tag 和仅由它拥有的备注范围，保留右侧 pin 和持久备注，浮层可重新加入；独立整体要求和周围普通文字完整保留，避免孤立意见仍被无定位发送。右侧删除标注才删除 pin、持久备注和其关联内容；提供撤销恢复原编号/内容。关闭标注模式不清空草稿/标记。
8. 点击原生发送冻结同一批草稿、引用与备注快照。按正常技能机制加入内置 PPT 制作助手，当前模型读取真实输入副本及定位 manifest，输出独立新 PPT。原文件和已发送快照保留，新文件经真实有效性/差异检查后可在真实交付卡与右侧打开。不得用旧坐标自动贴到新版本；无法匹配的标记与意见保留为“需重新定位”，重新定位确认前不加入发送。
9. 失败重试绑定原发送快照，不覆盖用户后写的新草稿，不因一句“完成”登记成功。关闭或换会话/文件后拒绝晚到 UI 回调，不抢回焦点、不移动系统鼠标。

## 数据与接口

独立按当前 owner + 实际会话 + canonical documentId 保存标注/版本。PPT 文件内容、文件授权与备注分开。locator 固定为 `{version:1,sessionId,documentId,fileVersion,markId}`，来源名 `pptx-annotation`。mark 含 `id,ordinal,slideIndex,slidePart,kind,region,nodeIds,comment,revision`；点框均为0..1，point 无宽高，rect 宽高正且不越界。当前源文案由 Main 从重新读取的 scene 补全，不相信 DOM 旧 quote。

可信主窗口 IPC `pptx:annotation:*`，bridge `window.sherlockPptAnnotations`：

- `open({sessionId,source})` → `{documentId,version,name,slideSize,slides,state}`。source 判别联合：workspace `{kind:'workspace',relativePath}`；Research `{kind:'research',authorizationId,nodeId}`；NoteFile `{kind:'note-file',authorizationId,nodeId}`。Main 以真实会话解析 root 并 realpath containment；durable绑定随状态保存，每次操作重新验证，不以 renderer cwd、客户端note-files别名或临时 preview URL 持久授权。绑定丢失要求重新打开，owner改变原批失效。
- `mutate({sessionId,documentId,version,expectedStateRevision,operations})` → 新 state。put/remove/reanchor 的 CAS、稳定编号和撤销；标注不写 PPT。
- `prepare({sendingSessionId,sendId,expectedDraftRev,references,retryOfPreparedId?})` → `{preparedId,manifestRelativePath,documents:[{documentId,fileVersion,inputRelativePath,outputRelativePath,markIds}],serializedReferences}`。整批验证会话、授权、mark revision、文件 SHA，创建不可变真实输入和 manifest；输出唯一且不覆盖原件。同sendId与相同fingerprint返回同一快照，不重新读取后来备注；同sendId不同fingerprint冲突。真正AI重试用新的sendId+retryOfPreparedId，复用原源/意见快照而分配新attempt输出，保留已交付结果和用户后写草稿。
- `complete({sendingSessionId,preparedId,submissionId})` → `{documents:[{status,versionRecord?,newFileRelativePath?,error?}],status:'success'|'partial'|'failed'}`。preparedId由实际原生提交成功回执绑定submissionId；只由对应assistant turn的真实文件交付路径触发检查，不由任意回复触发。检查分配的输出确实存在、PPT ZIP/scene有效、原文件hash没改、slide/chart/media/theme等实际内容part有修改（仅ZIP metadata/docProps变化不算），登记通过的版本；不接收模型自报任意路径。原件并发变化保留候选但source-changed，不自动采用。交付组件对该prepared输出在核验前显示正在核验，失败显示候选/失败而非全成功；普通不属于标注任务的交付卡不受影响。
- `lookupOutput({sendingSessionId,path})` 只读查询真实 prepared 输出的待核验、失败或版本记录；普通交付文件返回空值。交付卡必须在打开前复核首次接受的实际 SHA，不能将后来替换的文件重新认作原成功结果。
- `cancel({sessionId,sendId})` 取消准备/迟到结果，不改用户草稿。

真实提交关联增加 `bindSubmission({sendingSessionId,preparedId,submissionId:rpcId})`：协调器只用既有connection.api.subscribeEnvelopes，按实际session+该prepared独有manifest/序列化引用匹配真实session.prompt请求，等待同rpcId的accepted回执，不能猜下一条assistant。Main从真实Host durable inbox/source.rpcId或user/message.source.rpcId复核后持久绑定；queued未消费保持pending，可按rpcId只读恢复，不重复发送。记录userMessageId/userSeq/所属turn与step；真实 session.history 是 envelope 内 event，turn/step 为数字。complete仅接受对应公开assistant交付且在后续独立human输入之前的窗口，不信renderer自报turn或path；首次通过后的文件 SHA 固定，重开与重试不能洗掉替换事实。当前在笔记或研究视图时，协调器通过既有导航动作回到同一会话的普通对话输入，不新建会话、不替换笔记或该会话较新草稿；标注任务仍只经 ordinary PPT 发送路径。

source 与 prepare 还需支持多份真实 PPT，按文件分别提供输入与输出映射，不能把不同文件的标注混到一个输出。共享 DTO 放 `src/shared/pptx-annotations.ts`，显式结果/错误类型。source 的 resolver 复用现有可信授权；NoteFiles 必须用实际会话 reference，不把 note-files: hash 当中央会话。缺少/过期版本提供 stale/reanchor-required，原稿保留。

中央 coordinator 绑定实际 active shell，使用原有 insertReference/insertText/updateReferenceOccurrence/draftRev CAS 和 subscribe。记录 canonical UTF16半开owned范围与指纹，不用投影glyph下标。插入tag/备注时创建独立受控区间与分隔换行，已有整体文字留在区间外；当前选区在该范围内时，起点/终点插入采用向内亲和，备注可含换行。越过受控分隔后的输入为整体文本；跨多个范围且无法无损映射的编辑解除相关自动回写，保留用户文字/右侧持久备注，不猜测语义、不吞入整体要求。切会话/关闭页面和重开恢复自己的关联前比对当前原生草稿，不能整体覆盖用户的新内容。发送专属分支将实际sending shell id传给prepare，一批只准备一次，await后重核同一shell/snapshot。PPT原文为待分析资料；用户备注为明确修改指令；通过真实managed skill provider读取efund-ppt-maker，不用首页replace预填逻辑。

viewer经main-world coordinator获取实际active输入身份：`open(source,{signal,viewerKey})`返回handle（getSnapshot/subscribe/add/select/updateComment/remove/readd/undo/dispose）。snapshot含文件scene/basis/marks/selectedId/revealSeq/revision/stale/busy/error；同一mark重复select也增加revealSeq。viewer等对应generation的页mounted后定位并打开bubble，dispose只解绑不删状态。DOM引用只保留viewer本地，不放入跨world DTO。

## 验收

直接浏览器与服务测试覆盖：点框/跨页/滚动缩放/重挂、两侧备注同步且整体要求保留、选中键删/撤销/IME、换会话/文件/晚回调、真实sending身份和CAS、无编辑token的默认preview、授权撤销/路径变化/文件版本冲突、幂等快照/独立新草稿、真实可打开的新文件和原件hash保留。只做直接相关检查，不跑全功能测试。

最终必须从干净本地main经Plan A集成，用正式身份 build_and_run.sh --verify（跳过公证/上传/版本递增/push）。实际客户端验收：两个跨页标记、两侧备注、关闭重开、标签删/恢复、原生发送给真实模型、最终交付卡打开新PPT、原件保留、新版本不沿用旧定位；客户端保持打开。PPT演示也需实际验证完整开场与虚拟鼠标最终点击交付卡。

## 实施边界补充（2026-10-25）

- 同一原生根生命周期内的失败重试复用冻结的全部输入/意见，分配新输出；跨客户端重启保留标记、版本和真实交付状态，但不承诺一次点击恢复未持久化的全部原生输入材料。恢复仍使用原生编辑/发送机制。
- 手势在滚动、缩放、resize、失焦、pointercancel、丢失捕获和 owner 改变时取消，仅操作本地 DOM，不接管系统指针。默认预览不增加标注 hash/scene 或编辑请求；显式标注后才懒加载，并校验实际已显示的 viewer 字节。
- 冷恢复时，即使原生输入没有旧标签、没有当前选中项，仍显示失效标记列表，可明确选中并重新定位。旧坐标不画到新版本。重新定位保留较新已写备注及原生撤销记录。
- 原生 Research/NoteFile 透传真实 session、nodeId 与 Main authorizationId，不能用 Office 或 note-file 预览别名充当所有者。
