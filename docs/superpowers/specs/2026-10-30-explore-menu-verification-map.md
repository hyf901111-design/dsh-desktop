# 探索入口的旧验收覆盖映射

本轮没有删除、跳过或放宽 `test/home-operations-browser.test.js` 中的断言。该文件 79 个声明（参数展开后 156 项）已完整通过，原模块仍保留为兼容与复用资产/Carousel/Gallery 的回归基准；生产入口只挂载 Explore，不再挂载首页 wheel/down 运营区。下表逐声明列出语义归属。

新宿主 18 项验证由 `test/explore-menu-browser.test.ts` 覆盖，包含真实账户控制器、真实主题 owner、真实快速动作/导航适配器及原始 Figma 资源；I/O 仅限搜索/native bridge fixture。`test/home-guide-entry-handoff-browser.test.js` 另外保留原 7 项并增加 4 项真实 SessionRuntime、NotesApp、NotesStore 入口/接管/保存验证；不把桥接 stub 误称为 Native 客户端验收。

| 原声明行 | 原验收语义 | 本轮处理与新入口对应 |
| --- | --- | --- |
| 145 | adds the homepage operations area while preserving the native composer node and draft | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 155 | shows one complete region at each endpoint without an operations preview or composer ghost | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 174 | switches regions with the bottom button, including its Enter and Space activation | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 203 | switches regions with outer wheel gestures while leaving arrow keys and region clicks alone | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 228 | lets the return button immediately reverse an unfinished transition | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 241 | lets a deliberate opposite wheel gesture reverse spring motion while same-direction inertia stays on one region | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 265 | accelerates and decelerates the actual composer and cards throughout button travel | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 281 | preserves editing, textarea scrolling, and menu keyboard/wheel behavior | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |
| 316 | only mounts the main conversation homepage and removes decoration while settings or another route is active | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 337 | does not add homepage controls to %j | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 345 | cleans up detached controls, styles, native markers and observers when disposed | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |
| 376 | updates all four illustrations when appearance changes without replacing the composer | 完整保留；复用原始资产，新 Explore 验证全部暗浅 normal/hover 资源解码及相邻卡片不变。 |
| 391 | pages through five use cases and keeps quick-card clicks local to the homepage preview | 完整保留；复用 Carousel/CaseTransition，新 Explore 验证连点最终选择、五类移交、时钟与 hover 暂停。 |
| 421 | fills the active case track and automatically loops the five examples on the browser clock | 完整保留；复用 Carousel/CaseTransition，新 Explore 验证连点最终选择、五类移交、时钟与 hover 暂停。 |
| 442 | crossfades different old and new cases together without an empty or dim interval | 完整保留；复用 Carousel/CaseTransition，新 Explore 验证连点最终选择、五类移交、时钟与 hover 暂停。 |
| 503 | keeps only the latest rapid case request and removes unfinished fades on disposal | 完整保留；复用 Carousel/CaseTransition，新 Explore 验证连点最终选择、五类移交、时钟与 hover 暂停。 |
| 546 | pauses case timing for hover, keyboard focus, hidden pages, and route cleanup, and resets manual selections | 完整保留；复用 Carousel/CaseTransition，新 Explore 验证连点最终选择、五类移交、时钟与 hover 暂停。 |
| 593 | keeps automatic case timing disabled for reduced motion while manual paging still works | 完整保留；复用 Carousel/CaseTransition，新 Explore 验证连点最终选择、五类移交、时钟与 hover 暂停。 |
| 609 | decodes every original light/dark normal/color illustration as a nonempty browser image | 完整保留；复用原始资产，新 Explore 验证全部暗浅 normal/hover 资源解码及相邻卡片不变。 |
| 631 | renders the exported trend arrow and distinct final Figma light fields for all three cases | 完整保留；复用原始资产，新 Explore 验证全部暗浅 normal/hover 资源解码及相邻卡片不变。 |
| 666 | colors only the hovered illustration without changing its neighbors | 完整保留；复用原始资产，新 Explore 验证全部暗浅 normal/hover 资源解码及相邻卡片不变。 |
| 691 | crossfades identical illustration controls without a dim middle frame or jumps on rapid reversal | 完整保留；复用原始资产，新 Explore 验证全部暗浅 normal/hover 资源解码及相邻卡片不变。 |
| 753 | keeps a stationary pointer at the static anchor corner colored while the card tilts away from it | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 773 | preserves the unfinished illustration mix when scrolling moves its anchor away from a stationary pointer | 完整保留；复用原始资产，新 Explore 验证全部暗浅 normal/hover 资源解码及相邻卡片不变。 |
| 803 | adds one reversible presentation-blue glass tint to all four quick cards without pointer glow, shadows, or lift (dark=%s) | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 857 | keeps all five card surfaces distinct and description text readable over black, white, and busy backgrounds | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 916 | keeps idle card text planar and unfiltered while drawing no card borders | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 952 | shows an outside focus ring for keyboard navigation and leaves pointer-hover cards unframed | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 978 | makes quick-card perspective clear while keeping the case card restrained and a stationary pointer stable (dark=%s) | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 1037 | separates neutral dark glass faces from black, blue-black, and busy backgrounds | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 1061 | renders clearly moving distinct ambient gradients inside every quick card without obscuring white-backdrop labels or leaking past the corners | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 1163 | actually blurs a high-frequency checkerboard behind the translucent glass | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 1186 | makes ambient glow visibly evolve while keeping every case description readable at motion peaks | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 1233 | gives the active timer fill clear raster contrast without changing its six-second timing | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |
| 1253 | keeps all five cards and ambient fields static for reduced motion | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 1273 | keeps every moving glow image edge outside the rounded card at several animation phases | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 1325 | centers the actual card grid in a tall homepage pane | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 1338 | keeps the toggle at one low fixed position throughout state changes and hover | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 1360 | retains the left-case and right-four-card composition with readable text and expansive artwork in the actual compact app window %j | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |
| 1419 | keeps complete English case text and every card inside a fluid center pane %j | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |
| 1462 | fits all five cards without scrolling in a 600px Retina center pane %j | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |
| 1506 | fits compact case text and all five cards without scrolling in a reduced-height center pane %j | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |
| 1553 | adapts the operation collection to panel and short-pane resizing without carrying clipped content back into the full layout | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |
| 1594 | keeps every small-pane card visible without inner scrolling while the bottom button returns to input | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 1641 | keeps the native wallpaper owner independent from operation snapping and cleanup | 完整保留；原 Gallery/主题 owner 继续复用，新 Explore 验证壁纸保存、重挂恢复、键盘和外观切换。 |
| 1656 | keeps the return arrow and complete wallpaper gallery independently clickable in a short window %j | 完整保留；原 Gallery/主题 owner 继续复用，新 Explore 验证壁纸保存、重挂恢复、键盘和外观切换。 |
| 1677 | keeps %s operations visible and every quick card reachable inside the center pane | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |
| 1759 | keeps the tilted glass surface free of a second fixed rectangular shadow plane | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 1811 | connects every quick-start card to its action once while a previous click is still pending | 完整保留；动作 owner 不变，新 Explore 验证单次移交、取消、真实 session 接入/保留；退役 intro 外观不作为新产品契约。 |
| 1842 | waits for the native composer to settle before %s preparation and keeps a failed action visible | 完整保留；动作 owner 不变，新 Explore 验证单次移交、取消、真实 session 接入/保留；退役 intro 外观不作为新产品契约。 |
| 1871 | aborts a pending quick-start action when the homepage is left or disposed | 完整保留；动作 owner 不变，新 Explore 验证单次移交、取消、真实 session 接入/保留；退役 intro 外观不作为新产品契约。 |
| 1899 | starts only the visible large-card example by click or keyboard, never by its tracks | 完整保留；动作 owner 不变，新 Explore 验证单次移交、取消、真实 session 接入/保留；退役 intro 外观不作为新产品契约。 |
| 1919 | streams the $kind demo notice in the original description before handing off its unchanged entry | 完整保留；动作 owner 不变，新 Explore 验证单次移交、取消、真实 session 接入/保留；退役 intro 外观不作为新产品契约。 |
| 1935 | aligns an 18px loading ring with the title, indents text and waits three seconds (dark=$dark, reduced=$reduced, en=$en, $width×$height) | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |
| 1960 | cancels the pending card intro on %s before any actor starts | 完整保留；动作 owner 不变，新 Explore 验证单次移交、取消、真实 session 接入/保留；退役 intro 外观不作为新产品契约。 |
| 1976 | shows a static complete demo notice with reduced motion and keeps the four small-card actions immediate | 完整保留；动作 owner 不变，新 Explore 验证单次移交、取消、真实 session 接入/保留；退役 intro 外观不作为新产品契约。 |
| 1986 | keeps the actual Play click origin while its hover tilt settles during the streamed intro | 完整保留；动作 owner 不变，新 Explore 验证单次移交、取消、真实 session 接入/保留；退役 intro 外观不作为新产品契约。 |
| 2003 | opens all fifteen native wallpaper previews only in the visible gallery and matches the standard Figma grid | 完整保留；原 Gallery/主题 owner 继续复用，新 Explore 验证壁纸保存、重挂恢复、键盘和外观切换。 |
| 2034 | keeps the gallery tab, native wallpaper and Quick Start instances through appearance and locale changes | 完整保留；原 Gallery/主题 owner 继续复用，新 Explore 验证壁纸保存、重挂恢复、键盘和外观切换。 |
| 2063 | navigates wallpaper tabs and the five-column gallery by keyboard and keeps a failed appearance request recoverable | 完整保留；原 Gallery/主题 owner 继续复用，新 Explore 验证壁纸保存、重挂恢复、键盘和外观切换。 |
| 2086 | keeps all wallpaper previews and full names readable and clickable without inner scrolling %j | 完整保留；原 Gallery/主题 owner 继续复用，新 Explore 验证壁纸保存、重挂恢复、键盘和外观切换。 |
| 2114 | returns from a complete narrow wallpaper gallery with the native outer wheel gesture while preserving stacked Quick Start gestures | 完整保留；原 Gallery/主题 owner 继续复用，新 Explore 验证壁纸保存、重挂恢复、键盘和外观切换。 |
| 2128 | keeps the inactive dark tab readable over the unchanged native gray wallpaper %j | 完整保留；原 Gallery/主题 owner 继续复用，新 Explore 验证壁纸保存、重挂恢复、键盘和外观切换。 |
| 2165 | holds a single unscaled tab/header anchor across both views without clipping Quick Start %j | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 2183 | adds a bounded wallpaper hover within a static button and leaves its label steady %j | 完整保留；原 Gallery/主题 owner 继续复用，新 Explore 验证壁纸保存、重挂恢复、键盘和外观切换。 |
| 2203 | uses a translucent broad Light selected stroke and preserves the dark selected stroke (dark=%s) | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |
| 2215 | reverses tab slides from the visible mixture while the header, instances and native wallpaper remain stable | 完整保留；原 Gallery/主题 owner 继续复用，新 Explore 验证壁纸保存、重挂恢复、键盘和外观切换。 |
| 2255 | retains carousel elapsed reading time while tab slides and the wallpaper view are paused | 完整保留；原 Gallery/主题 owner 继续复用，新 Explore 验证壁纸保存、重挂恢复、键盘和外观切换。 |
| 2270 | settles tab motion immediately for reduced motion and releases pending animation/subscription work on hide and disposal | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |
| 2289 | reuses the hidden gallery measurement across tab frames and mode changes without requesting hidden thumbnails | 完整保留；原 Gallery/主题 owner 继续复用，新 Explore 验证壁纸保存、重挂恢复、键盘和外观切换。 |
| 2320 | keeps the painted tab mixture continuous when returning to input during a slide and reopening the collection | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 2341 | uses a broad neutral-gray Light outline on the actual native wallpaper and selected preview %j | 完整保留；原 Gallery/主题 owner 继续复用，新 Explore 验证壁纸保存、重挂恢复、键盘和外观切换。 |
| 2393 | offers the fourth report example with exact copy, five keyboard tracks and a distinct large-card entry | 完整保留；动作 owner 不变，新 Explore 验证单次移交、取消、真实 session 接入/保留；退役 intro 外观不作为新产品契约。 |
| 2412 | keeps the picture-free fourth report card readable in its unchanged shell %j | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |
| 2433 | retargets smoothly through the fourth report pane while preserving five-track clock and reduced motion semantics | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 2449 | pulses only the homepage down-button background once per real hero/session entry and keeps its geometry fixed | 完整保留；动作 owner 不变，新 Explore 验证单次移交、取消、真实 session 接入/保留；退役 intro 外观不作为新产品契约。 |
| 2474 | keeps the homepage button hint static for reduced motion and clears an active hint when the preference or document visibility changes | 完整保留旧模块回归；该 wheel/down/旧卡片布局已被新 Figma 浮层替代，新产品以 Explore 的开合、响应式、焦点、无旧入口验证为准。 |
| 2488 | decodes the fourth report Figma assets locally at their native slots without adding an illustration | 完整保留；复用原始资产，新 Explore 验证全部暗浅 normal/hover 资源解码及相邻卡片不变。 |
| 2499 | opens the fifth workbench example with exact copy and keeps its compact card readable %j | 完整保留原断言；新 Explore 另有对应原输入草稿、生命周期、主题/用例与响应式宿主检查。 |

## 聚焦执行记录

- 原首页兼容 Browser：156/156，原 79 个声明及其参数化断言全部保留。
- Explore 宿主 Browser：18/18（含新公开入口、非 hover 流动、原始资源、真实主题 owner、搜索/取消/owner 变化、快速动作、carousel 时钟和英文窄屏）。
- 搜索传输、用例入口及导航：5 + 14 + 26 项。
- 原 Gallery/appearance/主题偏好与快速动作、sidebar 搜索：58 项。
- 真正的 Native bundle SessionRuntime、NotesApp、NotesStore 入口：11 项；原账户 rail：4 项。
- TypeScript noEmit 与 git diff --check。未执行全功能单元测试，没有构建或替换共享客户端。

截图与执行日志在独立证据目录 `/tmp/sherlock-explore-menu-20261030/`；浏览器级检查不替代 Root 的打包客户端验收。
