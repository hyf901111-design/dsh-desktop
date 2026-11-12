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

/** Recover the layout of a damaged shared copy from its linked local source. */
export function restoreLocalSourceBoardLayout(canvas: Canvas, source: Canvas): void {
  const sharedNav = canvas.artifacts.find(node => boardTabsSpec(node.containerSpec))
  const localNav = source.artifacts.find(node => boardTabsSpec(node.containerSpec))
  const sharedTabs = boardTabsSpec(sharedNav?.containerSpec)
  const localTabs = boardTabsSpec(localNav?.containerSpec)
  if (!sharedNav || !localNav || !sharedTabs || !localTabs ||
      sharedTabs.tabs.some(tab => tab.nodeIds.length) ||
      sharedTabs.tabs.length !== localTabs.tabs.length ||
      sharedTabs.tabs.some((tab, index) => tab.name !== localTabs.tabs[index]?.name)) return

  const positionKey = (node: Canvas['artifacts'][number]) =>
    typeof node.workbenchId === 'string' && node.workbenchId &&
    typeof node.workbenchIndex === 'number' && Number.isSafeInteger(node.workbenchIndex) && node.workbenchIndex >= 0
      ? JSON.stringify([node.workbenchId, node.workbenchIndex]) : undefined
  const sharedCards = new Map<string, Canvas['artifacts'][number] | null>()
  for (const node of canvas.artifacts) {
    const key = positionKey(node)
    if (key) sharedCards.set(key, sharedCards.has(key) ? null : node)
  }
  const localCards = new Map(source.artifacts.map(node => [node.id, node]))
  const matches = new Map<string, Canvas['artifacts'][number]>()
  const ids = new Set<string>()
  for (const id of localTabs.tabs.flatMap(tab => tab.nodeIds)) {
    const local = localCards.get(id)
    const key = local && positionKey(local)
    const shared = key && sharedCards.get(key)
    if (!shared || ids.has(shared.id)) return
    ids.add(shared.id)
    matches.set(id, shared)
  }
  if (!matches.size) return

  sharedNav.containerSpec = {
    ...sharedTabs,
    tabs: sharedTabs.tabs.map((tab, index) => ({
      ...tab, nodeIds: localTabs.tabs[index]!.nodeIds.map(id => matches.get(id)!.id)
    }))
  }
  const recoverPosition = (node: Canvas['artifacts'][number], local: Canvas['artifacts'][number]) => {
    for (const field of ['x', 'y', 'width', 'height'] as const)
      if (!Number.isFinite(node[field]) && Number.isFinite(local[field])) node[field] = local[field]
  }
  recoverPosition(sharedNav, localNav)
  for (const [id, node] of matches) recoverPosition(node, localCards.get(id)!)
}
