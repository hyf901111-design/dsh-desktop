import type { Canvas } from './research-boards'

type Node = Canvas['artifacts'][number]
const layoutKeys = ['x', 'y', 'width', 'height', 'zIndex', 'stackOrder', 'order',
  'rotation', 'scale', 'sizeMode', 'preserveGenerationSize', 'workbenchColumns',
  'workbenchSpan', 'workbenchLayoutVersion', 'containerSizePreset'] as const
const tabLayoutKeys = ['orientation', 'verticalWidth'] as const
const collections = ['files', 'artifacts'] as const

function tabsOf(node: Node | undefined): Record<string, unknown> | undefined {
  const spec = node?.containerSpec
  return spec && typeof spec === 'object' && 'type' in spec && spec.type === 'board-tabs'
    ? spec as Record<string, unknown> : undefined
}

export function sharedCanvasContent(canvas: Canvas): Canvas {
  const content: Canvas = { files: [], artifacts: [] }
  for (const collection of collections) {
    content[collection] = canvas[collection].map(node => {
      const copy = { ...node }
      for (const key of layoutKeys) delete copy[key]
      const tabs = tabsOf(node)
      if (tabs) {
        const spec = { ...tabs }
        for (const key of tabLayoutKeys) delete spec[key]
        copy.containerSpec = spec
      }
      return copy
    })
  }
  return content
}

// Keep existing wire geometry available to older clients. New components get
// a neutral frame because those clients still require finite pixel bounds.
export function withSharedCanvasCompatibilityLayout(canvas: Canvas, base: Canvas): Canvas {
  const result = sharedCanvasContent(canvas)
  for (const collection of collections) {
    const prior = new Map(base[collection].map(node => [node.id, node]))
    result[collection] = result[collection].map(node => {
      const old = prior.get(node.id)
      const layout: Node = old ?? { id: node.id, x: 500, y: 130, width: 976, height: 236 }
      for (const key of layoutKeys) if (layout[key] !== undefined) node[key] = layout[key]
      const tabs = tabsOf(node), oldTabs = tabsOf(old)
      if (tabs && oldTabs) {
        for (const key of tabLayoutKeys) if (oldTabs[key] !== undefined) tabs[key] = oldTabs[key]
      }
      return node
    })
  }
  return result
}
