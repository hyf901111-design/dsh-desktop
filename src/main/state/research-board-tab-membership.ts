import { boardTabsSpec } from '../../../packages/dsh-research-task-runtime/board-tabs-contract.js'
import type { Canvas } from '../../shared/research-boards'

export function remapBoardTabs(value: unknown, remap: (id: string) => string) {
  const spec = boardTabsSpec(value)
  return spec && {
    ...spec,
    tabs: spec.tabs.map(tab => ({
      ...tab,
      id: remap(tab.id),
      nodeIds: tab.nodeIds.map(remap)
    }))
  }
}

/** Repair a detached canvas before display or copying, without writing to the room on read. */
export function restoreLegacyBoardTabMembership(canvas: Canvas): void {
  const aliases = new Map<string, string | null>()
  const live = new Set([...canvas.files, ...canvas.artifacts].map(node => node.id))
  for (const node of canvas.artifacts) {
    // Personal workbench plans allocate cards as <workbenchId>-<workbenchIndex>.
    // Old shares retained these tab references but gave the cards fresh IDs.
    if (typeof node.workbenchId !== 'string' || !node.workbenchId ||
        typeof node.workbenchIndex !== 'number' ||
        !Number.isSafeInteger(node.workbenchIndex) || node.workbenchIndex < 0) continue
    const id = node.workbenchId + '-' + node.workbenchIndex
    aliases.set(id, aliases.has(id) ? null : node.id)
  }
  for (const node of canvas.artifacts) {
    const spec = boardTabsSpec(node.containerSpec)
    if (!spec) continue
    const assigned = new Set(spec.tabs.flatMap(tab => tab.nodeIds))
    let changed = false
    const tabs = spec.tabs.map(tab => ({
      ...tab,
      nodeIds: tab.nodeIds.map(id => {
        const match = aliases.get(id)
        if (live.has(id) || !match || match === node.id || assigned.has(match)) return id
        assigned.add(match)
        changed = true
        return match
      })
    }))
    if (changed) node.containerSpec = { ...spec, tabs }
  }
}
