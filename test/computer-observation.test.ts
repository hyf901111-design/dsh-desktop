import { expect, it } from 'vitest'
import { compactWindowElements } from '../src/main/computer/observation'

it('omits unopened system menu content while retaining menu-bar choices, popup controls and tokens', () => {
  const data = { returned_element_count: 6, elements: [
    { element_index: 0, role: 'AXWindow', element_token: 's:0' },
    { element_index: 1, parent_index: 0, role: 'AXButton', label: '创建群组', element_token: 's:1' },
    { element_index: 2, role: 'AXMenuBar', element_token: 's:2' },
    { element_index: 3, parent_index: 2, role: 'AXMenuBarItem', label: 'Apple', element_token: 's:3' },
    { element_index: 4, parent_index: 3, role: 'AXMenu', element_token: 's:4' },
    { element_index: 5, parent_index: 0, role: 'AXTextField', label: '搜索', element_token: 's:5' }
  ] }
  expect(compactWindowElements(data)).toEqual({ ...data, returned_element_count: 5, omitted_menu_bar_element_count: 1,
    elements: [data.elements[0], data.elements[1], data.elements[2], data.elements[3], data.elements[5]] })
})
