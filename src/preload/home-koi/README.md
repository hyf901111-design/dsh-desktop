# 锦鲤水面 / Koi Pond

移植自独立原型 `/Users/heyafeng/Documents/ChatGPT/koi-water-background`，提交
`8c97117`。`renderer.js` 保留原渲染管线；客户端调整 `simulation.js`、`spine.js` 的游动及尺寸，
`shaders.js` 将浅色水底、波峰和波纹阴影改为无青色色相的中性珍珠白，调色在绘制鱼身之前完成，
深色水面沿用原值。
水底与透明鱼素材由内置 ImageGen 生成，来源说明见原型 `assets-provenance.md`；
参考视频不进入客户端。客户端适配层仅负责图片加载、明暗参数、尺寸及资源释放；
动画、隐藏页面暂停和减少动态效果均由现有首页控制器统一调度。

鱼身基准长度 310 CSS 像素（原 365，缩小约 15%），改变窗口尺寸只改变水池和位置。
两条鱼采用错开的宽活动范围，提前针对对方鱼身避让；转向、推进和滑行平滑衔接，
急转和接近另一条鱼时柔和减速，不使用位置跳变强行分离。
鱼身骨架跟随鱼头实际经过的路径，不再强行绕鱼头转动躯干；
尾部逐渐增强的行波保留摆尾，减少转向时的横向漂移。明暗参数沿用原型批准值：
Light darkness=0 / brightness=1 / speed=1；Dark darkness=.78 / brightness=.9 / speed=.55。

主题卡片最初使用 Figma 原图，文件 `Jkyr5rMvgM8GNH6E68xnqd`，组件集
`2666:365341`；Light Current `2666:365318`，Dark Current `2666:365332`。
浅色和深色卡片随水面及鱼身尺寸同步更新，由同一 WebGL 渲染器以 1150×720、
seed=21、5 秒时刻按各自游速导出。
卡片图片已存入 `../home-theme-assets/`，运行时完全离线，无外部素材请求。

SHA-256：

- water-plate.png: c4d4ecf4814cc58d34a3ff4245fe35f17b59b82fa11a13048f5e9a51507d7b8a
- koi-sprite.png: f09f60860b35b385d29cd6224521e1f30763164c37464ad8f821a7861b3ebd9f
- koi-pond-light.png: 14d116b8c248f316bd121eb9e169ab5084d9133b741fbe79dc0c5bed4b1c66cc
- koi-pond-dark.png: 39470ea62f3af2e399e1f758c847f16b2b3a3ab3869cbf9e9bc737c0ac0b0c35
