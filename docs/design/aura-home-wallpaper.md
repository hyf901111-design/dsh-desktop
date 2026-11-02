# 深空讯号：Aura 像素光环

来源：用户指定 https://www.aura.build/share/aura-financial 中公开嵌入的 Unicorn Studio 场景 `FixNvEwvWwbu3QX9qC3F`。本次替换保留原有 `boz` 偏好 ID、名称和主题顺序，已有选择自动显示新效果。

`home-theme-assets/aura-shaders.json` 保留场景导出的 expanding beam、noise displacement、diffuse、四次 Gaussian blur 和 square-glyph dither GLSL。`aura-square-atlas.json` 是同一场景 `squares.png` 红色通道的无损游程编码。运行时没有 CDN、字体、网页、Unicorn SDK 或外部网络请求；透明的占位矩形和点文字复制层不参与背景渲染。

`home-aura-renderer.ts` 将上述效果接入客户端统一的 renderer 接口：时间由主页控制器提供，隐藏、设置覆盖及减少动态效果沿用现有控制器，缩略图固定在同一动画时刻，切换时释放所有 GL 对象与上下文。中间目标为两张循环复用的半分辨率纹理，最终画布上限 240 万像素。

原站两个矩形视口 beam 改为 CSS 像素坐标的圆角矩形有符号距离场，并在 glyph dither 前合成。四角半径读取背景父容器计算样式，跟随主页面板继承的 12px / 16px 半径和尺寸变化；不是仅靠 overflow 裁剪亮直角。最终输出沿用背景容器现有的圆角裁剪。深色保留蓝青色黑底；浅色为同一像素场的浅蓝纸色。

本地验证只运行主题相关检查和类型检查；客户端最终呈现须在集成本地测试版复核，不能把独立网页预览当成客户端验收。
