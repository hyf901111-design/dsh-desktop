import { reconcilePointColors } from './powerpoint-point-colors'
import { exportMasterArtwork } from './powerpoint-masters'
import { exportOfficeFormatting } from './office-import'

export async function finalizePptx(bytes, slides, viewportSize) {
  const masters = await exportMasterArtwork(bytes, slides)
  const colors = await reconcilePointColors(masters, slides, true)
  return exportOfficeFormatting(colors, slides, viewportSize)
}
