import { readFile, rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { parse } from 'yaml'
import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'

type SnapshotStore<T> = {
  getSnapshot(): T
  set(value: T): void
  subscribe(listener: () => void): () => void
}

function createSnapshotStore<T>(initial: T): SnapshotStore<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    set(next) {
      value = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

async function loadAgentPresetClient(): Promise<Record<string, unknown>> {
  const source = await readFile(
    'node_modules/@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js',
    'utf8'
  )
  let descriptor:
    | { factory(require: (id: string) => unknown): Record<string, unknown> }
    | undefined
  runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load(value: typeof descriptor) {
          descriptor = value
        }
      }
    }
  })
  if (descriptor === undefined) throw new Error('Agent preset client bundle did not register')
  return descriptor.factory((id) =>
    id === '@deepseek-ai/dsh-client-runtime/client' ? { createSnapshotStore } : {}
  )
}

const roster = {
  presets: [
    {
      id: 'standard',
      trust: 'system',
      name: 'Standard mode',
      description: 'Standard tools',
      isDefault: false
    },
    { id: 'code', trust: 'system', name: 'PTC mode', isDefault: false },
    { id: 'minimal', trust: 'system', name: 'Minimal mode', isDefault: false },
    { id: 'cordis', trust: 'system', name: 'Creator mode', isDefault: false },
    { id: 'liangshen', trust: 'user', name: '梁神模式', isDefault: true }
  ],
  authorable: true,
  hasDocument: true
}

describe('Sherlock standard agent preset policy', () => {
  it('keeps a roster 404 out of the first send and preserves errors for explicit choices', async () => {
    let current = 'first'
    let reset: () => void = () => {}
    let dispose: () => void = () => {}
    const off = vi.fn()
    const win: Record<symbol, (id: string) => Promise<void>> = {}
    const key = Symbol.for('sherlock:pending-preset-flush')
    const scope = {
      sessions: { list: { getSnapshot: () => ({ current }) } },
      effect: (fn: () => () => void) => { dispose = fn() },
      on: (name: string, fn: () => void) => { expect(name).toBe('connection/reset'); reset = fn; return off }
    }
    const completeRoster = { presets: [{ id: 'standard', trust: 'system', isDefault: true }, { id: 'build', trust: 'system', isDefault: false }] }
    const list = vi.fn().mockRejectedValueOnce(Error('transport failure for /api/agentPreset.list: HTTP 404'))
      .mockResolvedValue({ result: { ok: true, value: completeRoster } })
    const select = vi.fn().mockResolvedValueOnce({ result: { ok: false, error: { message: '无法切换模式' } } })
      .mockRejectedValueOnce(Error('连接中断')).mockResolvedValue({ result: { ok: true, value: { agentPreset: 'build' } } })
    const client = await loadAgentPresetClient()
    const Seat = client.AgentPresetSeatController as new (...args: unknown[]) => {
      load(): Promise<void>; select(id: string): Promise<void>; store: SnapshotStore<Record<string, unknown>>
    }
    const seat = new Seat({ agentPresets: { list, select } }, () => ({ id: current, agentPreset: 'standard' }))
    const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js', 'utf8')
    const start = source.indexOf('/* native-pending-preset-flush:v2 */')
    expect(start).toBeGreaterThan(-1)
    runInNewContext(source.slice(start, source.indexOf('const seatInjected', start)), { seat, scope, window: win })
    const flush = win[key]
    if (!flush) throw Error('The preset picker did not register its send bridge')
    await seat.load()
    expect(seat.store.getSnapshot().error).toMatch(/HTTP 404/)
    await flush(current)
    expect(select).not.toHaveBeenCalled()
    reset()
    await vi.waitFor(() => expect(seat.store.getSnapshot().error).toBeNull())
    await seat.select('build')
    await expect(flush(current)).rejects.toThrow('无法切换模式')
    current = 'second'
    await expect(flush('first')).rejects.toThrow('当前会话已变化')
    await flush(current)
    await seat.select('build')
    await expect(flush(current)).rejects.toThrow('连接中断')
    await seat.select('build')
    await flush(current)
    expect(select).toHaveBeenCalledTimes(3)
    dispose()
    expect(off).toHaveBeenCalledOnce()
    expect(win[key]).toBeUndefined()
  })

  it('shows the available Standard preset when moving between current and legacy Build sessions', async () => {
    const client = await loadAgentPresetClient()
    let session: { id: string; agentPreset: string } | undefined = { id: 'canvas', agentPreset: 'build' }
    const Seat = client.AgentPresetSeatController as new (...args: unknown[]) => {
      load(): Promise<void>; apply(): Promise<void>; store: SnapshotStore<Record<string, unknown>>
    }
    const seat = new Seat({ agentPresets: { list: async () => ({ result: { ok: true, value: {
      presets: [{ id: 'standard', trust: 'system', isDefault: true }, { id: 'build', trust: 'system', isDefault: false }]
    } } }) } }, () => session)
    await seat.load()
    expect(seat.store.getSnapshot().current).toBe('standard')
    expect(session.agentPreset).toBe('build')
    session = { id: 'chat', agentPreset: 'standard' }
    await seat.apply()
    expect(seat.store.getSnapshot().current).toBe('standard')
    session = { id: 'canvas', agentPreset: 'build' }
    await seat.apply()
    expect(seat.store.getSnapshot().current).toBe('standard')
    expect(session.agentPreset).toBe('build')
    session = undefined
    await seat.apply()
    expect(seat.store.getSnapshot().current).toBe('standard')
  })

  it('switches an existing conversation and keeps its selected mode', async () => {
    const client = await loadAgentPresetClient()
    const select = vi.fn(async () => ({ result: { ok: true, value: { agentPreset: 'build' } } }))
    const applied = vi.fn()
    const Seat = client.AgentPresetSeatController as new (...args: unknown[]) => {
      select(id: string): Promise<void>
      store: SnapshotStore<Record<string, unknown>>
    }
    const seat = new Seat({ agentPresets: { select } }, () => ({
      id: 'existing-session', blank: false, agentPreset: 'standard'
    }), applied)
    await seat.select('build')
    expect(select).toHaveBeenCalledWith({ sessionId: 'existing-session', agentPreset: 'build' })
    expect(applied).toHaveBeenCalledWith('existing-session', 'build')
    expect(seat.store.getSnapshot()).toMatchObject({ current: 'build', busy: false, error: null })
  })

  it('allows the server to recompose an idle historical session but protects an active turn', async () => {
    const source = await readFile('node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js', 'utf8')
    const start = source.indexOf('async select(request) {', source.indexOf('async list(request) {', source.indexOf('The imported preset failed validation')))
    const end = source.indexOf('async read(request)', start)
    const method = source.slice(start, end).trim().replace(/,$/, '')
    const append = vi.fn()
    const agent = { status: 'idle', ctx: {}, session: { events: [{ type: 'user/message' }], append } }
    const recompose = vi.fn(async () => ({ id: 'build' }))
    const select = runInNewContext(`({ ${method} }).select`, {
      ctx: { get: () => ({ recompose }) }, agentFor: async () => ({ agent }),
      ok: (_r: unknown, value: unknown) => ({ ok: true, value }),
      err: (_r: unknown, error: unknown) => ({ ok: false, error }),
      presetSwitches: new Map(), presetFailure: () => undefined
    })
    const request = { payload: { sessionId: 'existing-session', agentPreset: 'build' } }
    expect(await select(request)).toMatchObject({ ok: true, value: { agentPreset: 'build' } })
    expect(append).toHaveBeenCalledWith('agent-preset/selected', { agentPreset: 'build' })
    agent.status = 'running'
    expect(await select(request)).toMatchObject({ ok: false, error: { code: 'agent-preset-locked' } })
    expect(recompose).toHaveBeenCalledTimes(1)
  })

  it('instructs the agent to provide concise user-facing progress during long work', async () => {
    const source = await readFile(
      'node_modules/@deepseek-ai/dsh/config/sherlock-agent-presets/standard/agent.cordis.yml',
      'utf8'
    )
    const entries = parse(source, {
      customTags: [
        {
          tag: 'tag:yaml.org,2002:js',
          resolve: (value: string) => value
        }
      ]
    }) as Array<{ id?: string; config?: { text?: string } }>
    const persona = entries.find((entry) => entry.id === 'persona')?.config?.text ?? ''

    expect(persona).toContain('concise user-facing progress updates')
    expect(persona).toContain('Do not reveal private reasoning')
    expect(persona).toContain('final answer')
  })

  it('preserves Build mode through the actual package branding step', () => {
    const result = spawnSync(process.execPath, ['scripts/install-brand-assets.mjs'], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
  })

  it('keeps Build mode capabilities identical to Standard and preserves its selected identity', async () => {
    const options = { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (v: string) => v }] }
    const readPreset = async (id: string) => parse(await readFile(`node_modules/@deepseek-ai/dsh/config/sherlock-agent-presets/${id}/agent.cordis.yml`, 'utf8'), options) as any[]
    const standard = await readPreset('standard'), build = await readPreset('build')
    expect(build.filter(p => p.id !== 'persona')).toEqual(standard.filter(p => p.id !== 'persona'))
    const persona = build.find(p => p.id === 'persona').config.text
    expect(persona).toContain('research_workbench_create')
    expect(persona).toContain('without per-panel model calls')
    expect(persona).not.toContain('generationMode:"parallel"')
    expect(persona).toContain('For simple factual questions')
    const { resolveSessionPreset } = await import('@deepseek-ai/dsh-agent-presets')
    expect(resolveSessionPreset({ header: { version: 0, id: SessionId('build-test'), createdAt: 1, agentPreset: 'build' }, events: [] })).toBe('build')
  })

  it('gives the single Standard-mode picker enough room and wraps its description', async () => {
    const source = await readFile(
      'node_modules/@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js',
      'utf8'
    )

    expect(source).toContain('.cubgiG_picker{display:inline-flex;min-width:0;flex:none;-webkit-app-region:no-drag}')
    expect(source).toContain('.cubgiG_item{box-sizing:border-box;flex-direction:column;gap:1px;width:376px')
    expect(source).toContain(
      '.cubgiG_itemDesc{color:var(--dsw-alias-label-tertiary);white-space:normal;overflow-wrap:anywhere;font-size:12px;line-height:17px}'
    )
    expect(source).toContain(
      '[role=menu]:has(.cubgiG_item){width:420px!important;max-width:calc(100vw - 24px)}'
    )
    expect(source).toContain('data-agent-preset-fallback')
    expect(source).toContain('children: t("presetStandardName")')
  })

  it('falls back old session preset selections to standard mode', async () => {
    const { resolveSessionPreset } = await import('@deepseek-ai/dsh-agent-presets')

    expect(
      resolveSessionPreset({
        header: {
          version: 0,
          id: SessionId('session-old-custom-preset'),
          createdAt: 1,
          agentPreset: 'liangshen'
        },
        events: []
      })
    ).toBe('standard')
    expect(
      resolveSessionPreset({
        header: {
          version: 0,
          id: SessionId('session-old-builtin-preset'),
          createdAt: 1,
          agentPreset: 'minimal'
        },
        events: [
          {
            type: 'agent-preset/selected',
            seq: 0,
            time: 2,
            data: { agentPreset: 'cordis' }
          }
        ]
      })
    ).toBe('standard')
  })

  it('composes the shipped standard and build presets and excludes the user preset root', async () => {
    const dshHome = await mkdtemp(path.join(tmpdir(), 'sherlock-preset-policy-'))
    try {
      const result = spawnSync(
        process.execPath,
        ['node_modules/@deepseek-ai/dsh/lib/bin.js', '--profile', 'web', '--dump-config'],
        {
          cwd: process.cwd(),
          env: { ...process.env, DSH_HOME: dshHome },
          encoding: 'utf8'
        }
      )
      expect(result.status, result.stderr).toBe(0)
      const entries = parse(result.stdout, {
        customTags: [
          {
            tag: 'tag:yaml.org,2002:js',
            resolve: (value: string) => value
          }
        ]
      }) as Array<{
        id?: string
        config?: {
          default?: string
          includeUserRoot?: boolean
          roots?: Array<{ path?: string; trust?: string }>
        }
      }>
      const presets = entries.find((entry) => entry.id === 'agent-presets')

      expect(presets?.config).toMatchObject({
        default: 'standard',
        includeUserRoot: false,
        roots: [{ trust: 'system' }]
      })
      const configuredRoots = presets?.config?.roots ?? []
      expect(path.basename(configuredRoots[0]?.path ?? '')).toBe('sherlock-agent-presets')

      const { discoverPresets } = await import('@deepseek-ai/dsh-agent-presets')
      const discovered = await discoverPresets(
        configuredRoots.map((root) => ({
          path: root.path ?? '',
          trust: root.trust === 'system' ? 'system' : 'user'
        }))
      )
      expect(discovered.map((preset) => preset.id)).toEqual(['standard', 'build'])
    } finally {
      await rm(dshHome, { recursive: true, force: true })
    }
  })

  it('normalizes settings, composer, and management stores to standard mode', async () => {
    const client = await loadAgentPresetClient()
    expect(client.AgentPresetSettingsController).toBeTypeOf('function')
    expect(client.AgentPresetSeatController).toBeTypeOf('function')
    expect(client.AgentPresetSectionController).toBeTypeOf('function')

    if (
      typeof client.AgentPresetSettingsController !== 'function' ||
      typeof client.AgentPresetSeatController !== 'function' ||
      typeof client.AgentPresetSectionController !== 'function'
    ) {
      return
    }

    const update = vi.fn(async () => ({ result: { ok: true, value: {} } }))
    const list = vi.fn(async () => ({ result: { ok: true, value: roster } }))
    const api = {
      agentPresets: { list },
      settings: {
        describe: vi.fn(async () => ({ result: { ok: true, value: { writable: true } } })),
        update
      }
    }

    const SettingsController = client.AgentPresetSettingsController as new (
      api: unknown
    ) => { load(): Promise<void>; store: SnapshotStore<Record<string, unknown>> }
    const settings = new SettingsController(api)
    await settings.load()
    expect(settings.store.getSnapshot()).toMatchObject({
      status: 'ready',
      currentValue: 'standard',
      options: [{ id: 'standard', trust: 'system' }]
    })

    const SeatController = client.AgentPresetSeatController as new (
      api: unknown,
      currentSession: () => unknown
    ) => { load(): Promise<void>; store: SnapshotStore<Record<string, unknown>> }
    const seat = new SeatController(api, () => ({
      id: 'blank-session',
      blank: true,
      agentPreset: 'liangshen'
    }))
    await seat.load()
    expect(seat.store.getSnapshot()).toMatchObject({
      current: 'standard',
      options: [{ id: 'standard', trust: 'system' }]
    })

    const SectionController = client.AgentPresetSectionController as new (
      api: unknown
    ) => { load(): Promise<void>; store: SnapshotStore<Record<string, unknown>> }
    const section = new SectionController(api)
    await section.load()
    expect(section.store.getSnapshot()).toMatchObject({
      status: 'ready',
      authorable: false,
      hasDocument: false,
      rows: [{ id: 'standard', trust: 'system', isDefault: true }]
    })
    expect(update).toHaveBeenCalledWith({
      ns: 'agent-presets',
      patch: { default: 'standard' }
    })
  })
})


it('exposes webpage reading in both packaged desktop conversation modes', async () => {
  const install = spawnSync(process.execPath, ['scripts/install-brand-assets.mjs'], {encoding:'utf8'})
  expect(install.status, install.stderr).toBe(0)
  for (const mode of ['standard','build']) {
    const preset = parse(await readFile(`node_modules/@deepseek-ai/dsh/config/sherlock-agent-presets/${mode}/agent.cordis.yml`, 'utf8'))
    expect(preset.find((row: any) => row.id === 'tool-web')?.config?.fetch).toBe(true)
  }
})
