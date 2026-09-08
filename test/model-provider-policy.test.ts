import { composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { describe, expect, it } from 'vitest'

describe('desktop model provider policy', () => {
  it('disables the bundled DeepSeek model adapter in the effective desktop profile', () => {
    const base = loadOverlayPatches(
      'dsh-desktop-test',
      'node_modules/@deepseek-ai/dsh-base/cordis.patch.yml'
    )
    const desktop = loadOverlayPatches('dsh-desktop-test', 'build/dsh-desktop.patch.yml')
    const effective = composeEntries([base, desktop])

    expect(effective.find((entry) => entry.id === 'llm-deepseek')).toMatchObject({
      id: 'llm-deepseek',
      disabled: true
    })
  })

  it('routes web search through the current session model instead of DeepSeek', () => {
    const base = loadOverlayPatches(
      'dsh-desktop-test',
      'node_modules/@deepseek-ai/dsh-base/cordis.patch.yml'
    )
    const desktop = loadOverlayPatches('dsh-desktop-test', 'build/dsh-desktop.patch.yml')
    const effective = composeEntries([base, desktop])

    expect(effective.find((entry) => entry.id === 'web')).toMatchObject({
      id: 'web',
      config: { searchProvider: 'sherlock-session-model' }
    })
    expect(effective.find((entry) => entry.id === 'web-search-deepseek')).toMatchObject({
      id: 'web-search-deepseek',
      disabled: true
    })
    expect(effective.find((entry) => entry.id === 'web-search-session-model')).toMatchObject({
      id: 'web-search-session-model',
      name: 'dsh-web-search-session-model'
    })
  })

  it('mounts the product-owned fund research runtime without a generic MCP bridge', () => {
    const desktop = loadOverlayPatches('dsh-desktop-test', 'build/dsh-desktop.patch.yml')
    const inserted = desktop.flatMap((entry) => entry.insert ?? [])

    expect(inserted.find((entry) => entry.id === 'sherlock-fund-research-runtime'))
      .toMatchObject({
        id: 'sherlock-fund-research-runtime',
        name: 'dsh-fund-research-runtime'
      })
    expect(JSON.stringify(inserted)).not.toContain('dsh-mcp-client')
  })

  it('disables the previous local financial adapter after applying the home profile', () => {
    const base = loadOverlayPatches('dsh-desktop-test', 'node_modules/@deepseek-ai/dsh-base/cordis.patch.yml')
    const desktop = loadOverlayPatches('dsh-desktop-test', 'build/dsh-desktop.patch.yml')
    // Boot order is bundles, profile, home preferences, then the desktop CLI overlay.
    const home = [{ insert: [{ id: 'sherlock-tonghuashun-mcp', name: 'dsh-mcp-client', disabled: false }] }]
    const effective = composeEntries([base, home, desktop])
    expect(effective.find(entry => entry.id === 'sherlock-tonghuashun-mcp')).toMatchObject({ disabled: true })
    expect(effective.find(entry => entry.id === 'sherlock-fund-research-runtime')).toMatchObject({ name: 'dsh-fund-research-runtime' })
  })
})
