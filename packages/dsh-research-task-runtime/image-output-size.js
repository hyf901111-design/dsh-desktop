export const ratios = {
  '1:1': { width: 1024, height: 1024 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1600, height: 900 },
}

export function validImageOutputSize(width, height) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
    width <= 4096 && height <= 4096 && width * height <= 8_000_000
}

const commonRatios = new Set(['1:1', '4:5', '5:4', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '21:9', '9:21'])

/** Read canvas dimensions from the user's description before choosing a provider size. */
export function requestedImageSize(prompt, explicitOnly = false) {
  const dimensions = [...prompt.matchAll(/(?<![\d.])(\d{2,4})\s*(?:px|像素)?\s*[×xX*]\s*(\d{2,4})(?![\d.])/g)]
    .reverse().find(match => validImageOutputSize(Number(match[1]), Number(match[2])))
  if (dimensions) return { width: Number(dimensions[1]), height: Number(dimensions[2]) }

  const ratio = [...prompt.matchAll(/(?<![\d.])([1-9]\d?)\s*([:：∶比])\s*([1-9]\d?)(?![\d.])/g)]
    .reverse().find(match => {
      const from = match.index ?? 0
      const before = prompt.slice(Math.max(0, from - 25), from)
      const after = prompt.slice(from + match[0].length, from + match[0].length + 16)
      if (/(?:比例|宽高比|长宽比|aspect\s+ratio|ratio|宽[:：]?高)\s*(?:为|是|设为|用|of|is|[:：=])?\s*$/i.test(before) ||
          /^\s*(?:的?(?:比例|横版|竖版|横屏|竖屏)|aspect|ratio)/i.test(after)) return true
      if (/(?:[上下]午|早上|晚上|at)\s*$/i.test(before) || /^\s*(?:开场|开始|结束|点|[ap]\.?m\.?\b)/i.test(after)) return false
      if (/^\s*的?(?:海报|图片|封面|画布|壁纸|canvas|image|poster|cover)/i.test(after) || prompt.trim() === match[0]) return true
      return match[2] === '比' || commonRatios.has(match[1] + ':' + match[3])
    })
  if (ratio) {
    const width = Number(ratio[1]), height = Number(ratio[3])
    const shape = width / height
    const preset = Object.values(ratios).find(size => size.width / size.height === shape)
    const scale = Math.floor(1600 / Math.max(width, height))
    return preset ?? { width: width * scale, height: height * scale }
  }

  if (explicitOnly) return undefined
  if (/横[版屏向]|\b(?:in landscape|landscape (?:format|orientation))\b/i.test(prompt)) return ratios['16:9']
  if (/竖[版屏向]|\b(?:in portrait|portrait (?:format|orientation))\b/i.test(prompt)) return ratios['4:5']
  if (/正方形|\bsquare (?:format|canvas|image|poster)\b/i.test(prompt)) return ratios['1:1']
  return undefined
}

export function providerSize({ width, height }) {
  const ratio = width / height
  return ratio >= 1.12 ? '1536x1024' : ratio <= .9 ? '1024x1536' : '1024x1024'
}
