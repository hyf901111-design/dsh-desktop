import { BooleanNumber, RANGE_TYPE, type Worksheet } from '@univerjs/core'
import type { IRender } from '@univerjs/engine-render'
import { getCoordByOffset, getTransformCoord, SheetSkeletonManagerService } from '@univerjs/sheets-ui'
import type { SheetsSelectionsService } from '@univerjs/sheets'

const handlePrefix = '__SpreadsheetHeaderResizeControllerShape'
type Axis = 'row' | 'column'

export function bindHeaderResize(render: IRender, selections: SheetsSelectionsService, win: Window) {
  const { scene } = render
  let drag: { restore(): boolean; apply(): void; move(): void } | undefined
  let frame = 0
  const subscriptions = new Map<Axis, { unsubscribe(): void }>()

  const finish = () => {
    win.cancelAnimationFrame(frame)
    frame = 0
    drag?.restore()
    drag = undefined
  }

  const bind = () => {
    for (const axis of ['row', 'column'] as const) {
      if (subscriptions.has(axis)) continue
      const handle = scene.getObject(handlePrefix + (axis === 'row' ? 'Row__' : 'Column__'))
      if (!handle) continue
      subscriptions.set(axis, handle.onPointerDown$.subscribeEvent({
        priority: 10,
        next: ([event]) => {
          const helper = scene.getObject(handlePrefix + 'Helper__')
          const skeletons = render.with(SheetSkeletonManagerService)
          const skeleton = skeletons?.getCurrentSkeleton()
          if (event.button !== 0 || !helper || !skeleton) return
          finish()
          const worksheet = skeleton.worksheet
          const row = axis === 'row'
          const cell = getCoordByOffset(event.offsetX, event.offsetY, scene, skeleton)
          const coordinate = getTransformCoord(event.offsetX, event.offsetY, scene, skeleton)
          const index = row
            ? cell.row - Number(coordinate.y - cell.startY < cell.endY - coordinate.y)
            : cell.column - Number(coordinate.x - cell.startX < cell.endX - coordinate.x)
          if (index < 0) return
          const indices = resizeIndices(worksheet, selections, axis, index)
          const config = worksheet.getConfig()
          const originalRows = indices.map(i => config.rowData[i])
          const originalColumns = indices.map(i => config.columnData[i])
          const origin = row ? helper.top : helper.left
          const size = row ? worksheet.getRowHeight(index) : worksheet.getColumnWidth(index)
          let current = size
          let previewed = false
          const repaint = () => {
            skeletons.makeDirty({ sheetId: worksheet.getSheetId() })
            skeletons.setCurrent({ sheetId: worksheet.getSheetId() })
            for (const component of render.components.values()) component.makeDirty(true)
            scene.makeDirty(true)
          }
          const preview = {
            restore() {
              if (!previewed) return false
              indices.forEach((i, position) => {
                if (row) {
                  const original = originalRows[position]
                  if (original) config.rowData[i] = original
                  else delete config.rowData[i]
                } else {
                  const original = originalColumns[position]
                  if (original) config.columnData[i] = original
                  else delete config.columnData[i]
                }
              })
              previewed = false
              repaint()
              return true
            },
            apply() {
              previewed = true
              indices.forEach((i, position) => {
                if (row) config.rowData[i] = { ...originalRows[position], h: current, ia: BooleanNumber.FALSE }
                else config.columnData[i] = { ...originalColumns[position], w: current }
              })
              repaint()
            },
            move() {
              const next = Math.max(0, size + (row ? helper.top : helper.left) - origin)
              if (next === current) return
              current = next
              helper.hide()
              preview.apply()
            },
          }
          drag = preview
        },
      }))
    }
  }

  const renderSubscription = scene.beforeRender$.subscribe(bind)
  const moveSubscription = scene.onPointerMove$.subscribeEvent({
    priority: 20,
    next: () => {
      if (!drag || frame) return
      frame = win.requestAnimationFrame(() => {
        frame = 0
        drag?.move()
      })
    },
  })
  // Restore dimensions before Univer's pointer-up handler records the final
  // mutation, so a drag contributes exactly one entry to the undo stack.
  win.addEventListener('pointerup', finish, true)
  win.addEventListener('pointercancel', finish, true)
  win.addEventListener('blur', finish)
  return {
    snapshot<T>(save: () => T): T {
      if (!drag) return save()
      const preview = drag
      const restored = preview.restore()
      try { return save() } finally { if (restored) preview.apply() }
    },
    dispose() {
      finish()
      win.removeEventListener('pointerup', finish, true)
      win.removeEventListener('pointercancel', finish, true)
      win.removeEventListener('blur', finish)
      renderSubscription.unsubscribe()
      moveSubscription.unsubscribe()
      for (const subscription of subscriptions.values()) subscription.unsubscribe()
    },
  }
}

function resizeIndices(worksheet: Worksheet, selections: SheetsSelectionsService, axis: Axis, index: number) {
  const row = axis === 'row'
  const ranges = selections.getCurrentSelections().map(({ range }) => range)
  const type = row ? RANGE_TYPE.ROW : RANGE_TYPE.COLUMN
  const spans = ranges.filter(range => range.rangeType === type)
    .map((range): [number, number] => row ? [range.startRow, range.endRow] : [range.startColumn, range.endColumn])
  const all = ranges.length === 1 && ranges[0]?.rangeType === RANGE_TYPE.ALL
  const result = new Set<number>()
  const visible = (i: number) => row ? worksheet.getRowVisible(i) : worksheet.getColVisible(i)
  if (all) {
    const count = row ? worksheet.getRowCount() : worksheet.getColumnCount()
    for (let i = 0; i < count; i++) if (visible(i)) result.add(i)
  } else if (spans.some(([start, end]) => start <= index && index <= end)) {
    for (const [start, end] of spans) for (let i = start; i <= end; i++) if (visible(i)) result.add(i)
  } else {
    result.add(index)
  }
  return Array.from(result)
}
