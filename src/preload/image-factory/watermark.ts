import type { Size } from './raster'

export const aiWatermarkText = '图片使用AI技术辅助生成'
export const aiWatermarkFamily = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
export const aiWatermarkColor = 'rgba(255, 255, 255, .6)'

export function aiWatermarkLayout({ width, height }: Size, scale = 1) {
  const shortSide = Math.min(width, height)
  const fontSize = Math.min(Math.max(12, shortSide * .025), width / 18, height / 3) * scale
  const inset = Math.min(Math.max(4, shortSide * .016), width / 12, height / 8) * scale
  return { fontSize, inset, height: fontSize * 1.65 }
}

export function drawAiWatermark(context: CanvasRenderingContext2D, size: Size) {
  const { fontSize, inset, height } = aiWatermarkLayout(size)
  const right = size.width - inset, bottom = size.height - inset
  context.save()
  context.font = '500 ' + fontSize + 'px ' + aiWatermarkFamily
  context.fillStyle = aiWatermarkColor
  context.textBaseline = 'middle'
  context.textAlign = 'right'
  context.fillText(aiWatermarkText, right, bottom - height / 2, size.width - inset * 2)
  context.restore()
}
