import type { SharedRequestContext } from './research-boards-ui'

type CanvasNode = { id: string; containerSpec?: { type?: string } }
type CanvasSnapshot = { files: CanvasNode[]; artifacts: CanvasNode[] }

export function sharedPageContext(
  workspace: { getSnapshot(): unknown; getVisibleBoardSnapshot?(): unknown },
  requested: SharedRequestContext
): SharedRequestContext {
  if (requested.scope === 'references' || !workspace.getVisibleBoardSnapshot) return requested
  const canvas = workspace.getSnapshot() as CanvasSnapshot
  const navigation = canvas.artifacts.find(node => node.containerSpec?.type === 'board-tabs')
  if (!navigation) return requested
  const visible = workspace.getVisibleBoardSnapshot() as CanvasSnapshot
  const references = (['files', 'artifacts'] as const).flatMap(collection =>
    visible[collection].filter(node => node.id !== navigation.id).map(node => ({ collection, nodeId: node.id }))
  )
  // Represent an empty page with its navigation node so the existing reference
  // protocol never expands an empty selection to the full board.
  return { scope: 'references', references: references.length ? references : [{ collection: 'artifacts', nodeId: navigation.id }] }
}
