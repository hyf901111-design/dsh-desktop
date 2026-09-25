type Element = { element_index?: number; parent_index?: number; role?: string; [key: string]: unknown }

export function compactWindowElements<T extends { elements?: Element[]; returned_element_count?: number }>(data: T): T {
  if (!Array.isArray(data.elements)) return data
  const byIndex = new Map(data.elements.map(e => [e.element_index, e]))
  const belongsToMenuBarContent = (element: Element): boolean => {
    const visited = new Set<number | undefined>()
    let current: Element | undefined = byIndex.get(element.parent_index)
    while (current && !visited.has(current.element_index)) {
      if (current.role === 'AXMenuBarItem' && byIndex.get(current.parent_index)?.role === 'AXMenuBar') return true
      visited.add(current.element_index)
      current = byIndex.get(current.parent_index)
    }
    return false
  }
  const elements = data.elements.filter(e => !belongsToMenuBarContent(e))
  const omitted = data.elements.length - elements.length
  return omitted ? { ...data, elements, returned_element_count: elements.length, omitted_menu_bar_element_count: omitted } as T : data
}
