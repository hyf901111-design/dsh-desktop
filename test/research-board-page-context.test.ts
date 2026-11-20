import { expect, it } from 'vitest'
import { sharedPageContext } from '../src/preload/research-board-page-context'

it('freezes the visible shared page at send time and keeps explicit file references', () => {
  const navigation = { id: 'nav', containerSpec: { type: 'board-tabs' } }
  const market = { id: 'market' }
  const products = { id: 'products' }
  const other = { id: 'other-page' }
  const file = { id: 'evidence' }
  let visible = { files: [file], artifacts: [market, products] }
  const workspace = {
    getSnapshot: () => ({ files: [file], artifacts: [navigation, market, products, other] }),
    getVisibleBoardSnapshot: () => visible
  }
  const saved = sharedPageContext(workspace, { scope: 'board', references: [] })
  visible = { files: [], artifacts: [other] }
  expect(saved).toEqual({ scope: 'references', references: [
    { collection: 'files', nodeId: 'evidence' },
    { collection: 'artifacts', nodeId: 'market' },
    { collection: 'artifacts', nodeId: 'products' }
  ] })
  expect(sharedPageContext(workspace, saved)).toBe(saved)
  visible = { files: [], artifacts: [] }
  expect(sharedPageContext(workspace, { scope: 'board', references: [] })).toEqual({
    scope: 'references', references: [{ collection: 'artifacts', nodeId: 'nav' }]
  })
})
