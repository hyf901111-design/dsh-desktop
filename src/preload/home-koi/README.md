# 锦鲤水面 / Koi Pond

移植自独立原型 `/Users/heyafeng/Documents/ChatGPT/koi-water-background`，提交
`8c97117`。`renderer.js`、`simulation.js`、`spine.js` 原样保留；`shaders.js`
按客户端浅色模式调整水底和波峰为青白色，调色在绘制鱼身之前完成，深色水面沿用原值。
水底与透明鱼素材由内置 ImageGen 生成，来源说明见原型 `assets-provenance.md`；
参考视频不进入客户端。客户端适配层仅负责图片加载、明暗参数、尺寸及资源释放；
动画、隐藏页面暂停和减少动态效果均由现有首页控制器统一调度。

鱼身固定 365 CSS 像素，改变窗口尺寸只改变水池和位置。明暗参数沿用原型批准值：
Light darkness=0 / brightness=1 / speed=1；Dark darkness=.78 / brightness=.9 / speed=.55。

主题卡片最初使用 Figma 原图，文件 `Jkyr5rMvgM8GNH6E68xnqd`，组件集
`2666:365341`；Light Current `2666:365318`，Dark Current `2666:365332`。
浅色卡片随青白水面同步更新，由同一 WebGL 渲染器以 1150×720、seed=21、
5 秒时刻导出；深色卡片继续使用 Figma 原图。
卡片图片已存入 `../home-theme-assets/`，运行时完全离线，无外部素材请求。

SHA-256：

- water-plate.png: c4d4ecf4814cc58d34a3ff4245fe35f17b59b82fa11a13048f5e9a51507d7b8a
- koi-sprite.png: f09f60860b35b385d29cd6224521e1f30763164c37464ad8f821a7861b3ebd9f
- koi-pond-light.png: e0bd8ef02cc3eba0d1eb48aafc14145a09458bb6f7768800511f8ee962db4e98
- koi-pond-dark.png: ace6def24270e1346488d1889b54829fd6ee734bf9f37ce985c0d143c36ef059
