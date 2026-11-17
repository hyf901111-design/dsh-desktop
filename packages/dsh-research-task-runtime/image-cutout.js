import sharp from 'sharp'
import { ImageGenerationError } from './image-generation-provider.js'

export const cutoutMaskPrompt =
  '为参考图制作精准的前景分割遮罩。保持参考图的完整取景、画幅比例、位置和像素对齐。' +
  '只返回灰度遮罩图：需要保留的主要主体（包括多个明确主体）为纯白，背景、四周黑色留边、地面投影均为纯黑。' +
  '发丝、毛发和半透明边缘用灰阶表达。请勿移动、缩放、重绘主体或添加其他图案。'

const maxPixels = 16_000_000
const invalidMask = () => new ImageGenerationError('图像模型没有返回可用的前景遮罩，请重试。')

export async function prepareImageCutout(source, size) {
  const original = sharp(source, { limitInputPixels: maxPixels }).autoOrient().toColourspace('srgb').ensureAlpha()
  const { data, info } = await original.raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const [frameWidth, frameHeight] = size.split('x').map(Number)
  const scale = Math.min(frameWidth * .84 / width, frameHeight * .84 / height)
  const contentWidth = Math.max(1, Math.round(width * scale))
  const contentHeight = Math.max(1, Math.round(height * scale))
  const left = Math.floor((frameWidth - contentWidth) / 2)
  const top = Math.floor((frameHeight - contentHeight) / 2)
  const raw = { width, height, channels: 4 }
  // Keep the subject away from the provider's image edges. Only the source rectangle is read back.
  const reference = await sharp(data, { raw }).resize(contentWidth, contentHeight, { fit: 'fill' }).flatten({ background: 'black' })
    .extend({ left, top, right: frameWidth - left - contentWidth, bottom: frameHeight - top - contentHeight, background: 'black' })
    .png().toBuffer()

  async function applyMask(mask) {
    const image = sharp(mask, { limitInputPixels: maxPixels })
    const metadata = await image.metadata()
    if (!metadata.width || !metadata.height ||
        Math.abs(metadata.width * frameHeight / (metadata.height * frameWidth) - 1) > .035) throw invalidMask()
    const { data: fitted } = await image
      .extract({
        left: Math.round(left * metadata.width / frameWidth),
        top: Math.round(top * metadata.height / frameHeight),
        width: Math.max(1, Math.round(contentWidth * metadata.width / frameWidth)),
        height: Math.max(1, Math.round(contentHeight * metadata.height / frameHeight))
      })
      .resize(width, height, { fit: 'fill' }).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
    let removed = 0, retained = 0, colored = 0
    for (let pixel = 0; pixel < width * height; pixel++) {
      const maskIndex = pixel * 3, alphaIndex = pixel * 4 + 3
      const r = fitted[maskIndex], g = fitted[maskIndex + 1], b = fitted[maskIndex + 2]
      if (Math.max(r, g, b) - Math.min(r, g, b) > 30) colored++
      const level = (r * .2126 + g * .7152 + b * .0722 - 32) / 198
      const originalAlpha = data[alphaIndex]
      const alpha = Math.round(originalAlpha * Math.max(0, Math.min(1, level)))
      data[alphaIndex] = alpha
      if (alpha === 0) removed++
      if (alpha >= 128) retained++
    }
    if (!removed || !retained || colored > width * height * .03) throw invalidMask()
    return sharp(data, { raw }).png().toBuffer()
  }

  return { reference: { data: reference, mediaType: 'image/png' }, applyMask }
}
