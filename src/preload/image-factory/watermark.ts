import type { Size } from './raster'

export const aiWatermarkText = '图片使用AI技术辅助生成'
export const aiWatermarkFamily = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
export const aiWatermarkBackground = 'rgba(15, 17, 21, .72)'

export function aiWatermarkLayout({ width, height }: Size, scale = 1) {
  const shortSide = Math.min(width, height)
  const fontSize = Math.min(Math.max(12, shortSide * .025), width / 18, height / 3) * scale
  const inset = Math.min(Math.max(4, shortSide * .016), width / 12, height / 8) * scale
  return { fontSize, inset, height: fontSize * 1.65, padding: fontSize * .52, radius: fontSize * .3 }
}

export function drawAiWatermark(context: CanvasRenderingContext2D, size: Size) {
  const { fontSize, inset, height, padding, radius } = aiWatermarkLayout(size)
  const right = size.width - inset, bottom = size.height - inset
  context.save()
  context.font = '500 ' + fontSize + 'px ' + aiWatermarkFamily
  const width = Math.min(size.width - inset * 2, context.measureText(aiWatermarkText).width + padding * 2)
  context.beginPath()
  context.roundRect(right - width, bottom - height, width, height, radius)
  context.fillStyle = aiWatermarkBackground
  context.fill()
  context.fillStyle = '#fff'
  context.textBaseline = 'middle'
  context.textAlign = 'right'
  context.fillText(aiWatermarkText, right - padding, bottom - height / 2, width - padding * 2)
  context.restore()
}
