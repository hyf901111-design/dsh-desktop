import { randomUUID } from 'node:crypto'
import { NutJSOperator } from '@ui-tars/operator-nut-js'
import { useContext } from '@ui-tars/sdk/core'
import { Jimp } from 'jimp'
import { Button, Key, keyboard, mouse } from '@computer-use/nut-js'
import { guidance } from './index.js'

const tool = (name, description, properties, required = []) => ({ name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false } })
export async function createUITarsBackend() {
  // The pinned SDK shares one context in this dedicated worker. Never log typed user content.
  Object.assign(useContext(), { logger: { info() {}, log() {}, warn() {}, error() {} } })
  const operator = new NutJSOperator()
  let observation
  let heldKeys = [], heldButton, closed = false
  const keyNames = new Set([...Object.keys(Key).map(key => key.toLowerCase()), 'cmd', 'command', 'ctrl', 'meta', 'shift', 'alt', 'win', 'return', ',', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'])
  const aliases = { cmd: Key.LeftCmd, command: Key.LeftCmd, ctrl: Key.LeftCmd, meta: Key.LeftCmd, win: Key.LeftCmd, shift: Key.LeftShift, alt: Key.LeftAlt, return: Key.Enter, ',': Key.Comma, arrowup: Key.Up, arrowdown: Key.Down, arrowleft: Key.Left, arrowright: Key.Right }
  const keyValues = Object.fromEntries(Object.entries(Key).map(([name, value]) => [name.toLowerCase(), value]))
  async function releaseInput() {
    const keys = heldKeys, button = heldButton
    heldKeys = []; heldButton = undefined
    if (keys.length) await keyboard.releaseKey(...keys).catch(() => {})
    if (button !== undefined) await mouse.releaseButton(button).catch(() => {})
  }
  const tools = [tool('screenshot', '观察当前主屏幕，返回图片、坐标尺寸和 revision。', {}),
    tool('action', '在前台执行一次键鼠操作，并返回新截图。坐标使用上一张返回图片的像素。', {
      revision: { type: 'string' }, action: { type: 'string', enum: ['click', 'left_double', 'right_single', 'drag', 'type', 'hotkey', 'scroll'] },
      x: { type: 'number' }, y: { type: 'number' }, to_x: { type: 'number' }, to_y: { type: 'number' },
      text: { type: 'string' }, keys: { type: 'string' }, direction: { type: 'string', enum: ['up', 'down'] }
    }, ['revision', 'action'])]
  async function capture() {
    const shot = await operator.screenshot()
    const image = await Jimp.read(Buffer.from(shot.base64, 'base64'))
    const originalWidth = image.bitmap.width, originalHeight = image.bitmap.height
    if (originalWidth > 1600) image.resize({ w: 1600 })
    observation = { revision: randomUUID(), width: image.bitmap.width, height: image.bitmap.height, originalWidth, originalHeight, scaleFactor: shot.scaleFactor, at: Date.now() }
    const data = (await image.getBuffer('image/jpeg', { quality: 80 })).toString('base64')
    return { content: [{ type: 'text', text: JSON.stringify(observation) }, { type: 'image', mimeType: 'image/jpeg', data }] }
  }
  return { tools, guidance: guidance.uitars,
    async call(name, args, signal) {
      signal?.throwIfAborted()
      if (closed) throw Error('桌面操作已停止')
      if (name === 'screenshot') return capture()
      if (name !== 'action' || !tools[1].inputSchema.properties.action.enum.includes(args.action)) throw Error('不支持的 UI-TARS 操作')
      if (!observation || args.revision !== observation.revision || Date.now() - observation.at > 60000) throw Error('请重新截图，旧截图已过期')
      const previous = observation
      const point = (x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= previous.width || y >= previous.height) throw Error('坐标超出当前截图')
        return `[${x / previous.width},${y / previous.height},${x / previous.width},${y / previous.height}]`
      }
      const input = {}
      if (['click', 'left_double', 'right_single', 'drag', 'scroll'].includes(args.action)) input.start_box = point(args.x, args.y)
      if (args.action === 'drag') input.end_box = point(args.to_x, args.to_y)
      if (args.action === 'type') {
        if (typeof args.text !== 'string' || args.text.length > 20000 || args.text.includes('\0')) throw Error('输入文本无效')
        input.content = args.text
      }
      if (args.action === 'hotkey') {
        if (typeof args.keys !== 'string' || !/^[a-zA-Z0-9+ _,-]{1,100}$/.test(args.keys)) throw Error('快捷键无效')
        const names = args.keys.toLowerCase().split(/[\s+]+/).filter(Boolean)
        if (!names.length || names.some(name => !keyNames.has(name))) throw Error('不支持的快捷键名称，请使用工具列出的键名')
        heldKeys = names.map(name => aliases[name] ?? keyValues[name])
        input.key = args.keys
      }
      if (args.action === 'scroll') {
        if (!['up', 'down'].includes(args.direction)) throw Error('滚动方向无效')
        input.direction = args.direction
      }
      observation = undefined // An unknown action outcome must never be replayed with the old receipt.
      if (['click', 'left_double', 'drag'].includes(args.action)) heldButton = Button.LEFT
      if (args.action === 'right_single') heldButton = Button.RIGHT
      try {
        await operator.execute({ prediction: '', parsedPrediction: { action_type: args.action, action_inputs: input }, screenWidth: previous.originalWidth, screenHeight: previous.originalHeight, scaleFactor: previous.scaleFactor, factors: [1, 1] })
      } finally { await releaseInput() }
      signal?.throwIfAborted()
      if (closed) throw Error('桌面操作已停止')
      await new Promise(resolve => setTimeout(resolve, 250))
      const result = await capture()
      result.content.unshift({ type: 'text', text: '已投递输入；请核对截图，不能仅凭投递认定任务完成。' })
      return result
    }, async close() { closed = true; observation = undefined; await releaseInput() }
  }
}
