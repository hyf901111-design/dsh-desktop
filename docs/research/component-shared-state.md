# 生成组件共享状态（0.9.13）

## 范围

HTML 组件使用 `window.sherlockShared.register` 声明 JSON 业务状态、操作处理器和渲染函数。个人画板通过原画布存储保存状态；协作画板通过受权限控制的 WebSocket 房间保存状态。生成提示词统一要求所有有业务交互的 HTML 使用此接口，不能再把点击回放描述为实时同步。

覆盖：表单字段、筛选/排序/分页、选择、折叠、位置/拖拽、计数/投票、棋盘、游戏和连续模拟等能表达为 JSON 的状态。焦点、光标、滚动、密码、文件输入及尚未提交的私人输入保持本地。第三方网站、旧脚本闭包、原生组件自带控件不会自动接入；旧 HTML 必须重新生成或改造。改造保留界面，把业务状态移到此接口，不做针对某个游戏的注入。

## API

```js
const shared = window.sherlockShared.register({
  initialState: { count: 0 },
  reduce(state, action, { userId }) {
    return action.type === 'increment' ? { ...state, count: state.count + 1 } : state
  },
  render(state, { connected, readOnly }) {
    document.querySelector('output').textContent = String(state.count)
    document.querySelector('button').disabled = !connected || readOnly
  },
  // 可选：仅执行端调用，不要使用各端独立 setInterval 推进业务数据。
  // tick(state, {dtMs, now}) { return nextState },
  // tickMs: 140,
  // onStatus(status) {}
})
document.querySelector('button').onclick = () => shared.dispatch({ type: 'increment' })
```

`dispatch` 返回是否已进入本地发送队列，不是服务器完成确认；`getState()` 返回已确认的快照。`subscribe` 订阅快照；`dispose` 释放当前实例。`reduce`、`tick` 必须同步返回完整 JSON；`render` 不改变业务状态，不发送新操作。随机值在 `reduce/tick` 中产生并存入状态，不在渲染端各算一份。操作携带经服务器认证的 `userId`，由组件据此区分参与者。

## 一致性与边界

- 服务端为每个组件选出一个执行端；租约 token 和严格 revision 排除旧执行端写入。退出、断线后其他可编辑端接管（通常 5 秒，下限受客户端心跳调度影响，租约 15 秒）。没有执行端则保留最后状态并暂停推进。
- 操作按服务端接收顺序入队，持久化后确认。客户端用单调序号重传；已接收序号防止重连重复执行。执行端提交状态同时确认输入队列前缀，接管者只处理未确认操作。
- 晚加入和重连直接恢复当前快照；不把每个模拟帧写入画板历史或点击日志。组件自身可在业务状态中实现撤销；画板布局撤销不回退实时组件状态。
- 数据按画板 sharing epoch、组件 ID 和 HTML 版本隔离；重新生成组件（HTML 改变）重新初始化。共享实时状态目前不随个人副本/历史画板快照导出迁移。
- 只读成员仅订阅。服务端每次接收和广播重新校验权限，删除、取消共享及旧版本消息不能修改状态。脚本不能选择别的组件 ID，宿主以当前 iframe 所属节点绑定通道。
- 状态 64 KiB，单操作 4 KiB，深度 32；组件建议操作节流每秒 20 次。定时推进间隔最小 100ms，不定位为高帧率竞技游戏服务。每组件最多 64 活跃实例、256 个近期参与实例序号游标（离线且无待处理操作的游标在一小时后回收）；同画板最多 64 活跃组件房间。达到限额会报错暂停，不声称同步成功。
- 旧组件保留原事件日志兼容能力，但无法自动同步任意脚本闭包、网络响应、计时器或随机状态。静态原生格式及外部网站不因此变成实时共享应用。

## 聚焦验证

`npx vitest run test/component-shared-state.test.js test/component-interaction-state.test.js test/collaboration-client.test.ts test/research-boards-service.test.ts`

`node scripts/test-component-shared-browser.mjs`：本地真实 D1/DO/WebSocket + 独立 Chromium 账号上下文 + 生产 HTML 双重沙盒，验证同时编辑、计数、坐标、随机定时模拟、只读限制、晚加入、执行端退出、重连。合成数据与截图位于 `output/playwright/component-shared`，不读取或修改用户画板。

## 生成交付验收

个人和协作组件使用同一验收入口。新生成的原始 HTML 若含脚本或内联事件，必须包含可解析的共享注册配置（initialState/reduce/render）和 dispatch 或 tick；注释、字符串、空注册不算接入。独立 setInterval 会被拒绝。静态 HTML 和宿主原生格式不受此约束。

验收失败会在同一任务内自动修复一次，保留用户原来的界面和交互要求；修复仍失败则报错，不降级为静态说明或把旧 HTML 标为成功。历史组件中的“平台没有同步通道”等文案不再作为生成依据。

这是生成代码的结构校验，不能证明任意 JavaScript 的业务逻辑正确，仍需双端运行验证；也不会自动改写已保存的旧组件。已有组件需要重新生成或改造后才会走新验收。聚焦回归：`test/shared-component-validation.test.js` 及 `test/research-task-runtime.test.js` 中 `shared-state generation gate` 用例。
