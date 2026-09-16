export interface PptxResizeViewer {
  sherlockResizeTimer?: ReturnType<typeof setTimeout>
  presentation?: unknown
  activeRenderMode?: string
  container: HTMLElement
  getDisplayMetrics(): { scale: number; displayWidth: number; displayHeight: number }
  queueRender(): unknown
}
export function cancelPptxResize(viewer: PptxResizeViewer): void
export function schedulePptxResize(viewer: PptxResizeViewer): void
export function stripPptxResizePatch(source: string): string
export function patchPptxResize(source: string): string
