import type { TextLayer } from '../../shared/image-factory-canvas'

export function templateTextLayer(
  id: string, text: string, canvasWidth: number, x: number, y: number, width: number,
  em: number, color: string, weight = 400, align: TextLayer['align'] = 'left',
): TextLayer {
  const longest = Math.max(1, ...text.split('\n').map(line => Array.from(line).reduce(
    (length, character) => length + (/[^\x00-\x7f]/u.test(character) ? 1 : /[A-Z]/u.test(character) ? .7 : .56), 0)))
  const fontSize = Math.max(8, Math.min(600, Math.floor(canvasWidth * Math.min(em, width * .96 / longest))))
  return { kind: 'text', id, text, color, x, y, width, fontSize, weight, align, family: 'Source Han Sans CN' }
}
