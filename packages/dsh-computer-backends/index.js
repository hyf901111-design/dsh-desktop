import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const allowed = {
  cua: new Set(['list_apps', 'list_windows', 'get_window_state', 'get_desktop_state', 'click', 'type_text', 'press_key', 'hotkey', 'scroll', 'drag', 'launch_app', 'focus_window', 'set_value']),
  peekaboo: new Set(['permissions', 'app', 'window', 'see', 'image', 'click', 'type', 'press', 'scroll', 'drag', 'set_value', 'select_text', 'action', 'menu', 'dialog'])
}
export const guidance = {
  cua: 'Cua Driver 0.38.0。先 list_apps/list_windows 获取准确窗口，再 get_window_state；使用返回的目标、捕获 ID 和元素标识，避免猜坐标。需要前台操作时明确使用 delivery_mode=foreground，后台失败不盲目重发。不要自己创建 session，宿主已绑定。每次输入后重新观察目标确认实际结果。',
  peekaboo: 'Peekaboo 4.9.8。先 app(action=list)、window(action=list,app=...)，再 see 获取准确窗口快照；优先元素 ID。坐标和输入必须带最新 snapshot/coordinate_reference，坐标用 image_pixels。需要前台操作时使用工具支持的 foreground=true；失败或结果未知时先 see，不能重复输入。每次输入后重新观察确认。',
  uitars: 'UI-TARS NutJS Operator 1.2.3（仅执行层），使用物理鼠标和前台焦点。先 screenshot，用返回图片的像素坐标调用 action。截图必须在每次动作前获取，revision 必须匹配，不能猜坐标。快捷键用 cmd/shift/return 等。操作后自动返回新截图，必须目视核对结果。'
}

/** Pinned drivers only. No model-provided executable, environment or shell command. */
export async function createBackend(id, { nativeDirectory, signal } = {}) {
  if (id === 'uitars') {
    const { createUITarsBackend } = await import('./uitars.js')
    return createUITarsBackend()
  }
  if (!allowed[id]) throw Error('未知 Computer Use 方案')
  const transport = new StdioClientTransport({
    command: join(nativeDirectory, id === 'cua' ? 'cua-driver-candidate' : 'peekaboo'),
    args: id === 'cua' ? ['mcp', '--direct', '--embedded', '--host-bundle-id', 'com.evanarts.sherlock'] : ['mcp', 'serve', '--allow-foreground', '--no-remote'],
    env: { CUA_DRIVER_RS_TELEMETRY_ENABLED: 'false' }, stderr: 'pipe'
  })
  // Native logs may contain application contents; do not forward them to model or product logs.
  transport.stderr?.on('data', () => {})
  const client = new Client({ name: 'ework-computer-use', version: '0.1.0' })
  let connected = false
  client.onclose = () => { connected = false }
  const session = `ework-${randomUUID()}`
  try {
    await client.connect(transport, { signal, timeout: 30000 })
    connected = true
    const catalog = await client.listTools({}, { signal, timeout: 30000 })
    const tools = catalog.tools.filter(tool => allowed[id].has(tool.name))
    if (!tools.length) throw Error('桌面驱动没有提供受支持的工具')
    if (id === 'cua') {
      const result = await client.callTool({ name: 'start_session', arguments: { session } }, undefined, { signal, timeout: 30000 })
      if (result.isError) throw Error('Cua 会话启动失败：' + result.content.filter(x => x.type === 'text').map(x => x.text).join('\n'))
    }
    return {
      tools, guidance: guidance[id],
      get connected() { return connected },
      async call(name, args, signal) {
        if (!connected) throw Error('桌面驱动已断开。请先 tools 重新连接并观察，不要直接重复上次输入。')
        if (!tools.some(tool => tool.name === name)) throw Error('当前插件没有提供此工具')
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('工具参数必须为对象')
        // Discovery/open/focus are desktop operations; arbitrary app arguments and script routes are not exposed.
        if (id === 'peekaboo' && name === 'app' && !['list', 'launch', 'switch', 'focus'].includes(args.action)) throw Error('仅支持列出、启动或聚焦应用')
        if (id === 'peekaboo' && name === 'window' && !['list', 'focus'].includes(args.action)) throw Error('仅支持列出或聚焦窗口')
        return client.callTool({ name, arguments: id === 'cua' ? { ...args, session } : args }, undefined, { signal, timeout: 60000 })
      },
      async close() {
        connected = false
        if (id === 'cua') await client.callTool({ name: 'end_session', arguments: { session } }, undefined, { timeout: 2000 }).catch(() => {})
        await client.close()
      }
    }
  } catch (error) { await client.close().catch(() => {}); throw error }
}

export function resultForHost(result) {
  return {
    data: { isError: !!result.isError, content: (result.content ?? []).filter(item => item.type !== 'image'),
      ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}), ...(result._meta ? { metadata: result._meta } : {}) },
    screenshots: (result.content ?? []).filter(item => item.type === 'image').map(image => ({ mimeType: image.mimeType, dataBase64: image.data }))
  }
}
