import type { GalleryExample } from './gallery-examples'
import type { Raster, Region, Size } from './raster'

export const templatePhoto = (example: GalleryExample) => example.enterprise ? example.enterprise.photo : example.id

export function templatePhotoFrame(example: GalleryExample, size: Size): Region {
  const rect = (x: number, y: number, width: number, height: number) =>
    ({ x: x * size.width, y: y * size.height, width: width * size.width, height: height * size.height })
  switch (example.enterprise?.layout) {
    case 'invitation': return rect(0, 0, 1, .405)
    case 'profile': return rect(0, 0, 1, .654)
    case 'screen': return rect(.539, 0, .461, 1)
    case 'split': return rect(.525, 0, .475, 1)
    case 'cover': return rect(0, .407, 1, .513)
    case 'story':
    case 'timeline': return rect(0, .192, 1, .178)
    case 'features': return rect(0, .29, 1, .245)
    case 'countdown': return rect(.62, 0, .38, 1)
    case 'audio': return rect(.5, 0, .5, 1)
    case 'metric': return rect(.56, 0, .44, .59)
    default: return rect(0, 0, 1, 1)
  }
}

export function drawTemplatePhoto(context: CanvasRenderingContext2D, image: Raster, frame: Region) {
  const scale = Math.max(frame.width / image.width, frame.height / image.height)
  const width = image.width * scale
  const height = image.height * scale
  context.save()
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, context.canvas.width, context.canvas.height)
  context.beginPath()
  context.rect(frame.x, frame.y, frame.width, frame.height)
  context.clip()
  context.drawImage(image.image, frame.x + (frame.width - width) / 2, frame.y + (frame.height - height) / 2, width, height)
  context.restore()
}
