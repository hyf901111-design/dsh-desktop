import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { join } from 'node:path'

const allowed = {
  peekaboo: new Set(['permissions', 'app', 'window', 'dock', 'paste', 'see', 'image', 'click', 'type', 'press', 'scroll', 'drag', 'set_value', 'select_text', 'action', 'menu', 'dialog'])
}
const peekActions = { app: ['list', 'launch', 'switch', 'focus', 'unhide'], window: ['list', 'focus', 'restore'], dock: ['list', 'launch'] }
export const guidance = {
  peekaboo: 'Peekaboo 4.9.8。先定位准确应用和主窗口，再 see；忽略 30px 菜单栏辅助窗口。进程 focus 成功不代表主窗口已显示：窗口不可见或 AX 为空时，优先 dock(action=launch,app=真实应用名,foreground=true) 唤起主窗口，再观察；同一种 AX 拒绝不要换参数重复尝试。image 和 see 已直接返回图片，无需再 read_image。上传截图优先 image(path=...), 再 paste(imagePath=返回路径)，原生粘贴会恢复剪贴板，不写 AppleScript。后台 AX 明确拒绝且未投递时，已授权前台的任务可切换 foreground=true；不要继续换参数重复失败的后台输入。优先当前元素 ID；坐标点击使用最新 snapshot/coordinate_reference 和 image_pixels。结果 dispatched_unverified 表示已投递但未确认，查看附带新截图，不重发。仅在明确授权且画面确认目标位于前台时使用工具支持的 foreground=true；点击或输入不能猜测被遮挡的窗口位置。任务要求发送时，确认消息已发出即可完成；只有用户要求时才等待并读取对方完整回复。'
}

/** Pinned drivers only. No model-provided executable, environment or shell command. */
export async function createBackend(id, { nativeDirectory, signal } = {}) {
  if (id !== 'peekaboo') throw Error('未知电脑控制方案')
  const transport = new StdioClientTransport({
    command: join(nativeDirectory, 'peekaboo'),
    args: ['mcp', 'serve', '--allow-foreground', '--no-remote'],
    stderr: 'pipe'
  })
  // Native logs may contain application contents; do not forward them to model or product logs.
  transport.stderr?.on('data', () => {})
  const client = new Client({ name: 'ework-computer-use', version: '0.1.0' })
  let connected = false
  client.onclose = () => { connected = false }
  try {
    await client.connect(transport, { signal, timeout: 30000 })
    connected = true
    const catalog = await client.listTools({}, { signal, timeout: 30000 })
    const tools = catalog.tools.filter(tool => allowed[id].has(tool.name)).map(original => {
      let tool=original
      if(tool.inputSchema.properties?.coordinate_space)tool={...tool,inputSchema:{...tool.inputSchema,properties:{...tool.inputSchema.properties,coordinate_space:{type:'string',enum:['image_pixels','normalized'],description:'Use image_pixels for the returned screenshot. Never use screenshot coordinates as desktop/global coordinates. A fresh snapshot/coordinate_reference is required.'}}}}
      if (!peekActions[tool.name]) return tool
      return { ...tool, description: `${tool.name}: ${peekActions[tool.name].join(', ')}. Use an exact observed application/window. Dock launch requires foreground=true.`,
        inputSchema: { ...tool.inputSchema, properties: { ...tool.inputSchema.properties,
          action: { ...tool.inputSchema.properties.action, enum: peekActions[tool.name] } } } }
    })
    if (!tools.length) throw Error('桌面驱动没有提供受支持的工具')
    const captures=new Map()
    const remember=result=>{const reference=result._meta?.coordinate_context?.reference_id,receipt=result._meta?.target_receipt;if(reference&&receipt){captures.set(reference,receipt);if(captures.size>32)captures.delete(captures.keys().next().value)}}
    return {
      tools, guidance: guidance[id],
      get connected() { return connected },
      async call(name, args, signal) {
        if (!connected) throw Error('桌面驱动已断开。请先 tools 重新连接并观察，不要直接重复上次输入。')
        if (!tools.some(tool => tool.name === name)) throw Error('当前插件没有提供此工具')
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('工具参数必须为对象')
        // Discovery/open/focus are desktop operations; arbitrary app arguments and script routes are not exposed.
        if (peekActions[name] && !peekActions[name].includes(args.action)) throw Error(`当前 ${name} 仅支持 ${peekActions[name].join(', ')}`)
        if(args.coords&&(!['image_pixels','normalized'].includes(args.coordinate_space)||!captures.has(args.coordinate_reference||args.snapshot)))throw Error('请先 see 获取准确窗口，再使用返回截图的 image_pixels 坐标和 snapshot/coordinate_reference；不能把窗口截图坐标当作桌面坐标。')
        let input = args
        if (name === 'image') input = { ...args, format: 'data',
          ...(args.path ? { path: args.path.endsWith('.png') ? args.path : args.path + '.png' } : {}) }
        const result = await client.callTool({ name, arguments: input }, undefined, { signal, timeout: 60000 })
        remember(result)
        if (name === 'image' && input.path && !result.isError) result.content.push({ type: 'text', text: `截图文件：${input.path}。图片已随本次结果返回，无需再次读取。` })
        const receipt = result._meta?.target_receipt||captures.get(args.coordinate_reference||args.snapshot)
        // Observe once locally, preserving the driver's unverified/error receipt. Never replay input.
        if (result._meta?.mutation_dispatched && receipt?.pid && receipt?.window_id && !result.content.some(item => item.type === 'image')) {
          signal?.throwIfAborted()
          try {
            const observation = await client.callTool({ name: 'see', arguments: { app_target: `PID:${receipt.pid}`, window_id: receipt.window_id, max_elements:100 } }, undefined, { signal, timeout: 10000 })
            remember(observation)
            result.content.push({ type: 'text', text: '以下为操作后的新观察（保留上方未确认回执，不表示业务成功）。如需下一步，请使用本次观察的新 snapshot。' },...observation.content)
            result._meta={...result._meta,post_observation:observation._meta}
          } catch { signal?.throwIfAborted(); result.content.push({ type: 'text', text: '操作后观察失败，请重新观察；不得重发未知结果的输入。' }) }
        }
        return result
      },
      async close() {
        connected = false
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
