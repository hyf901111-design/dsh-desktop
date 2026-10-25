# 本会话优化需求对账与验收边界（2026-10-26）

源码映射74/74；不代表74项已通过原生验收。最后12包和四场完整回放待验。74项等待最终包冻结不等于要求重测74项；已接受且未改的行为保留原证据，仅做下列聚焦变更验收。**系统鼠标冻结：UNRESOLVED_NOT_REPRODUCED，未确认根因，未修复。**

源码依据为本地 main 7b5f5a22 与本轮分 scope 提交；本记录在最终本地客户端构建前冻结，最后包的原生回放证据另存构建验收目录。

证据按源码、真实类headless、Root真实正式11操作、最后12包待验分开。

| # | ID | 需求 | 源码 | 本轮真实原生/成品范围 | 最后包 |
|---|---|---|---|---|---|
| 1 | guide-four-kinds | 四类真实用例入口；真正的原生组件/会话，不复制临时产品 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 2 | guide-natural-timing | 真实顺序、虚拟操作、克制AI等待和阅读停留，不瞬间完成 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 3 | guide-dom-pointer | 只绘DOM虚拟指针，严格JSON token跨世界ACK，所有权/可见性/取消清理 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 4 | guide-no-controls | 移除右上播放控制器和多余正文/输入说明，保留真实错误 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 5 | guide-mode-notice | 笔记/PPT/研报会话顶栏下演示不耗token提示，5秒后消失 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 6 | guide-early-native-pane | 看板/笔记进场收左栏并早开真实右屏，单一canvas/editor，无结尾突现 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 7 | guide-persistence | 示例保存真实workspace，换页回访保留；重播新副本不覆写原稿 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 8 | guide-draft-cas | 技能/附件/图片/同文新revision/最后hold和发送ACK边界保用户较新草稿 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 9 | board-live-provider | 真实financialWidget bridge，无固定价格/资讯/history、无离线假数据fallback | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 10 | board-six-layout | 指数全宽；自选+行情；新闻+公告；日历本机真实空态/日程，窄窗可读 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 11 | board-five-selected | 仅苹果/长江电力/工业富联/五粮液/徐工机械五项，最终选择五粮液 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 12 | board-three-visible-links | 自选→行情→新闻/公告三条真实端口连接，虚拟拖动中可见跟随线 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 13 | board-smart-container | 搭建后日历右侧真实智能容器→输入→queued等待→五行研究观察表 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 14 | board-arrange-save | 成对连线取景后恢复可读语义布局并真实保存，CAS用户布局不被覆盖 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 15 | board-revisit-library | 结束/回访普通组件库恢复完整catalog，真实数据持续由正常bridge接管 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 16 | notes-seventeen | 完整17段自然顺序，严格检查/读标记/优化/替换，不叠长空等 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 17 | notes-consensus-source | 标记券商预测年度/十亿元单位问题，查看三条来源后改17.0亿元且排2027E | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 18 | notes-native-tasks | 真实右屏输入当前全文任务→建议→采纳，保存原生两任务与摘要 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 19 | notes-selection-rewrite | 虚拟鼠标真实选段→当前选区标签→AI改写→应用，原选择/任务可回访 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 20 | notes-smooth-top | 结尾同一editor平滑回顶，不重载/闪烁/替换笔记 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 21 | notes-handoff | 结束后普通Notes接管同一稿/线程和任务，不短暂空白或重置 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 22 | notes-new-chat | 演示完成后Chat→新对话真正新session，不复用旧空白状态 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 23 | ppt-real-origin | 真实EWork Kimi K3从专业研报生成20页PPT，观点/图表/目录充实，保护5f0/af3原字节 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 24 | ppt-open-order | 大卡上滑到原生输入区→真实PPT技能→附件→简短prompt | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 25 | ppt-slow-external-drag | 外部PDF缩略条跟随双token虚拟拖入，真实insertFilePaths后慢输入140ms/2字，标点240ms | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 26 | ppt-detailed-reply | AI思考/规划/制作/检查和完整公开回复更真实详细，保资料历史预测/来源 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 27 | ppt-tail-preview-idle | 真实保存后最终Markdown+两尾卡，自动精确点PPT卡右侧预览，最终Send/idle | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 28 | ppt-native-compat | future skill修轴UInt32/Office31bit和LINE标签兼容，逐页原生验收；页码1-based与Markdown交付规范 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 29 | report-card-four | 第4研究报告大卡无配图，继承黑透明/淡渐变，四轨轮播，原4小卡仍原动作 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 30 | report-native-route | 上滑→真实builtin研报skill（无附件）→单空格wire brief→plan/layout/deliver→只打开PDF | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 31 | report-real-artifact | 真实K3 session253生成双格式，内容有来源/观点/图表/财务/DCF，既有报告回访恢复 | 已映射 | C actual63p artifact review and Root formal11 delivery-card PDF preview; not the four-case preset replay or future professional signoff. | 12待验 |
| 32 | report-renderer-quality | Rxx单行/论点不跨页/封面目录自然分页/NO_BRACKET真实端点解释 | 已映射 | C actual63p artifact review and Root formal11 delivery-card PDF preview; not the four-case preset replay or future professional signoff. | 12待验 |
| 33 | report-publish-complete | 按原名原字节发布HTML/PDF+固定4JSON，SHA/原run一致、排他六文件回滚，不覆用户文件 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 34 | home-region-motion | 输入区/运营区互斥不透出，按钮和滚轮分区自然加减速，不上下叠显 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 35 | home-responsive-images | 窄窗卡片无内滚动/裁断；配图保合理尺寸，内文边距可读，不整组缩字 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 36 | home-material | 卡片黑相透明、不同壁纸可辨、无描边/鼠标光斑/透视露边、清晰文字 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 37 | home-quick-motion | 4小卡微透视更明显±9°/720px与72ms阻尼、各不同动态渐变，配图不再生长 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 38 | home-carousel | 四页真实轮播、4进度轨道6s计时、400ms互补交叉，hover/隐藏/离场暂停保时钟 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 39 | home-quick-actions | 4小卡仍board/note原生导航；PPT/report上滑预填真实skill替换旧提示词，不自动发 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 40 | home-button-position | 上下切区按钮位置/尺寸固定无上下动画/描边，正常高保已接受104px，短高适配 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 41 | home-button-attention | 真正进入首页/新会话背景3轮4s脉冲后静态；button几何不动，重渲不重启，cleanup/reduced | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 42 | theme-native-fifteen | 15款现有原生壁纸key/renderer/assets不替换，CN/EN命名和实际缩略预览 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 43 | theme-global-mode | 32px太阳/月亮触发真正native全局明暗，唯一背景owner/持久恢复而非body伪切 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 44 | theme-fixed-header-slide | Quick/Wallpapers同固定顶栏anchor，透明tabs；左右14px小位移交叉，反复点击可逆/无旧pane点击 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 45 | theme-hover | 主题预览轻抬2px/内部图1.03，文字/button anchor不动，圆角裁切无光斑，reduced静态 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 46 | theme-grey-selection | 最新Light浅灰半透明3px轮廓，无勾/内缘/模糊发光；Dark原1.5保持 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 47 | theme-responsive-lazy | 图库按宽高响应列数，固定比例预览与12/18标签可读无局部滚动，隐藏不拉缩略/不反复测量 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 48 | demo-title-suffix | 四类新会话全角（演示案例）；旧registered同账号同cwd默认标题安全幂等迁移，保用户改名 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 49 | bloomberg-contrast | 彭博模式图例保系列色/隐藏态，三种mindmap文字边线可辨，普通主题不动 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 50 | notes-copilot-commentator | AI随航/AI Copilot；真实系统评论员AI评论员/AI Commentator，正文/自定义名/旧回执不改 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 51 | home-two-cards-copy | 两大卡中英同步：研究看板/快速创建行情看板；笔记随航/体验有AI护航的文档 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 52 | subagent-avatar | 最新Figma子agent随机头像及对应loading状态样式 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 53 | input-skills-multi | 连续添加多个真实技能，保留原有引用/附件和当前草稿 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 54 | input-chip-hug | 技能/文件标签内容自适应宽度、对称padding和正常字号 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 55 | input-keyboard | 鼠标选中引用、左右键进入退出、Backspace/Delete精确原子删；正文键盘不劫持 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 56 | input-slash-flicker | 技能斜杠菜单提交时不闪空列/改变行布局 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 57 | sent-inline-tags | 已发送消息技能/文件标签同排自然换行、原始引用header压紧，真实正文段落和copy原文保留 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 58 | conversation-inline-stream | 真实saved+ready回执到达时组件在公开引入后即时出现，后文继续其下，不累积尾部、不泄露reasoning | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 59 | conversation-component-actions | 真实组件持久化/引用chip/复制/粘贴研究笔记/库保存，header无close，正文复制不劫持 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 60 | note-ppt-stored-chrome | 存量noteDisplay:inline PPT无需迁移即完整WorkbenchChrome顶栏/单一文件信息底栏，适用引用/更多，隐藏无意义画布操作 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 61 | ppt-preview-explicit-edit | 默认快速只读预览不open编辑token；更多菜单与底栏共用编辑/关闭状态，dirty安全保存，只读无编辑入口 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 62 | ppt-mode-feedback | 切换模式约2秒状态提醒；纯交互toast不进入笔记导出 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 63 | annotation-entry | 下载/编辑/文件夹同排标注入口，下方点/框工具栏；与编辑安全互斥，默认/标注零editToken | 已映射 | Actual native annotation entry used; remaining final toolbar/edit-mode visual variants await final12. | 12待验 |
| 64 | annotation-geometry-gesture | 真实连续windowed slide坐标归一化、跨页缩放/懒页重挂；scroll/resize/up rect变化取消；所有capture释放 | 已映射 | Actual markers on two target pages; arbitrary zoom/remount/resize/capture-cancel edge cases remain fixture-only. | 12待验 |
| 65 | annotation-figma-pin-bubble | 原始10SVG/normal-selected pin编号，简洁备注气泡关闭可重开，HUG左右6px间距5px数字tag | 已映射 | Actual pin/comment UI and composer references used; exact HUG/spacing/light-dark raster remains fixture evidence. | 12待验 |
| 66 | annotation-comments-owned-text | 中央ordinary composer整体要求保留，左右备注双向同步/IME/多行；只管UTF16 owned spans，外部正文和其他refs保留 | 已映射 | Root actually verified two-way comments; IME, foreign text and pending owner races remain fixture-only. | 12待验 |
| 67 | annotation-tag-delete-undo | 删tag仅取消本轮引用及owned备注，persistent mark保留；原生undo/redo、readd，不发送孤立备注 | 已映射 | Root actually verified atomic delete+undo. Redo/readd/nonannotation keyboard remain separately pending. | 12待验 |
| 68 | annotation-managed-auth | Workspace/Research/Note-file来源信封与真实authorization，fake previewSession只作reader用途，当前实际ordinary sender由coordinator取并Main重验 | 已映射 | Actual workspace-source ordinary sender path passed; Research/NoteFiles/other-owner permutations remain direct-fixture evidence. | 12待验 |
| 69 | annotation-version-authority | 实际viewer bytes懒SHA对Main版本，来源/账号/会话变化拒迟到；Main持久编号/权限/CAS/源PPT不写 | 已映射 | Actual source unchanged5f SHA and distinct output682f verified; arbitrary owner/stale source permutations remain fixtures. | 12待验 |
| 70 | annotation-real-send | 正常原生提交实际rpcId/turn绑定prepare，已有真正PPT技能+immutable输入snapshot/manifest+独立输出，不新AI capability/不复用教程回复 | 已映射 | Actual formal11 ordinary submit and K3high generated modified PPT for two requested pages; no demo provider used. | 12待验 |
| 71 | annotation-delivery-gate | 真实修改后new file经精确submission/allocated path/SHA/changed parts验收；pending/failed/partial不冒ready；真实原卡打开输出 | 已映射 | Actual distinct output card→native right preview→PowerPoint20slides without repair. Pending/failure/partial permutations not all exercised natively. | 12待验 |
| 72 | annotation-stale-cold | 新版本旧pin不画、旧tag stale；无tag无selected冷恢复可从count列表选择旧备注再显式reanchor，ordinal不重排 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 73 | annotation-reanchor-new-comment | reanchor仅更换locator/label并重key现有owned备注，保较新意见及原生undo/redo，不覆盖overall文本 | 已映射 | 本轮未新操作；保留旧包/夹具证据，不提升验收等级 | 12待验 |
| 74 | annotation-install | 真正preload/Main IPC+frontend严格安装、反向strip/多遍升级、恢复已有普通报告会话catalog | 已映射 | Real formal11 installed annotation path passed; later messagePresentation changes not in that package. | 12待验 |

## 已补足旧矩阵的缺口

- 子代理头像：257a6f41已实现，30原角色/稳定身份/运行环；34direct+tsc0，仍待正式包可见验收。
- 研报：真实EWork K3/high新run05，63页/118导航已审；6产物字节同时等于原run、C审计、metadata。第7metadata只三项接受字段有意变化，Root已真点PDF交付卡预览；教程回放/回访另验。
- PPT标注：正式11真实K3high任务完成2页内容修改，源5f不改、新文件682f、交付卡/右预览/PowerPoint20页无repair已记录；双向备注及原子delete/undo实际UI通过。不能推为所有stale/owner/cancel/reanchor边界原生都通过。

## 研报来源边界

三个公告目录URL完全来自原packet/evidence，metadata未截断。asOf来自原publishedAt。未联网验证目录可达或外部真伪；professionalSignOff=false / externalAuthenticity=unverified保留。

## 剩余验收

这些是待完成的精确场景，不是建议重跑全功能：
- final12-four-cases：Latest four scripts end-to-end with normal idle/tail preview; Board link-follow frame+saved layout; Notes17 consensus/evidence/top/handoff and Chat→NewChat/revisit; PPT external PDF/slow140ms+file skill CAS; report noattachment/skill/publish6 outputs/PDF only.
- final12-avatar：Actual existing catalog/detail same child identity, running/inactive, deep/light/reduce;34headless tests do not replace this.
- final12-input-message：Ordinary multi-skill/header HUG/delete keyboard, current PPT sent inline annotation/real skill presentation and stale notice cleanup after explicit success.
- final12-resize-themes：Actual reachable content400/550/780 and native min800x640; existing Quick/Wallpapers anchoring/transition/grey outline/mode persistence, no inner clipped card scrollbar.
- annotation-stale-reanchor：One actual new-version stale/count/explicit reanchor with latest comment/undo and cold reopen if not already recorded by Root; source tests alone do not prove it.
- mouse-unresolved：Keep separate unresolved issue; final-package smoke without recurrence is not a fix.

## 证据

- `report-assets-audit.json`：六字节+第7metadata及目录URL来源。
- `native-evidence-scope.json`：真正正式11验收的范围/路径/hash。
- 逐项旧状态与证据完整保留在JSON的task23Baseline/historicalNativeEvidence，避免用新状态抹掉历史边界。
