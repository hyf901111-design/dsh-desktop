# EWork Odyssey 1.5.5

平台：macOS Apple Silicon。保留标准与旧版迁移通道的签名，跳过 Apple 公证。

## 更新内容

- 登录后可按品牌选择内置对话模型；支持图片输入的模型标记「视觉」。模型菜单底部可添加自定义模型。
- 对话支持直接生成图片，也可上传参考图继续修改；缩小生成中的占位卡，改进图片生成和任务中断时的提示。
- 探索页新增「管理用量」，显示订阅等级、5 小时与每周剩余额度及恢复时间。悬停探索按钮可预览 5 小时余量，额度不足时会在输入框上方提示。
- 登录用户可使用内置联网搜索；未登录或额度不足时，回到原有搜索方式。
- 改进金融工作台生成，支持多种图表、完整的对账明细及来源追溯；修正金额单位、收益率中位数和番茄钟倒计时。
- 改进研究看板的自动整理、宽表阅读、组件连线和协作页签恢复，修复协作更新冲突后的重试。
- 新对话首页新增浏览器、插件、定时任务、研究看板和笔记快捷入口；简化注册密码要求。

## Release notes

- Signed-in users can choose built-in chat models by brand. Models that accept images carry a Vision badge. Add a custom model from the bottom of the model picker.
- Generate images in chat or upload a reference image to guide edits. The generation placeholder is smaller, and messages about interrupted tasks are easier to understand.
- Manage Usage in Explore shows your subscription, remaining five-hour and weekly allowances, and reset times. Hover over Explore to preview the five-hour balance; low allowance is explained above the composer.
- Built-in web search is available when signed in. The previous search method is used when signed out or when the built-in allowance is unavailable.
- Financial workbenches support multiple chart types, complete reconciliation details and traceable sources. Fix currency units, median returns and the Pomodoro countdown.
- Improve research-board auto-layout, wide tables, component connections and shared tab recovery. Retry synchronization after a collaboration conflict.
- Open Browser, Plugins, Scheduled Tasks, Research Boards or Notes from the new chat home screen. Registration has a simpler password requirement.

## 发布范围

以线上 1.5.1 为基线，包含已验收的客户端变更。独立管理后台分支 `codex/feat/accounts-admin-20261110`（`7a3cbddfca0c9b798d56906deeab9a6bb3584bd4`）新增了管理端排序和额度分配界面及相关服务变更，保留原分支，未纳入本次客户端发布。

