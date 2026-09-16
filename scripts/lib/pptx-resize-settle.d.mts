export interface PptxResizeViewer {
  sherlockResizeTimer?: ReturnType<typeof setTimeout>
  presentation?: unknown
  queueRender(): unknown
}
export function cancelPptxResize(viewer: PptxResizeViewer): void
export function schedulePptxResize(viewer: PptxResizeViewer): void
export function stripPptxResizePatch(source: string): string
export function patchPptxResize(source: string): string
