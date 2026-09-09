import { expect, it } from 'vitest'
import {
  exportHumanHistory,
  normalizeRequestContext
} from '../packages/dsh-research-collaboration/context.js'
it('exports complete original human append surface while stripping internal references', () => {
  const events: any[] = Array.from({ length: 60 }, (_, seq) => ({
    seq,
    time: seq,
    type: 'user/message',
    surfaceOp: 'append',
    data: {
      id: `m${seq}`,
      source: { kind: 'user' },
      content: [{ type: 'text', text: `q${seq}` }]
    }
  }))
  events.push(
    {
      seq: 60,
      type: 'user/message',
      surfaceOp: 'replace',
      data: {
        source: { kind: 'user' },
        content: [{ type: 'text', text: 'compacted' }]
      }
    },
    {
      seq: 61,
      type: 'assistant/message',
      surfaceOp: 'append',
      data: {
        message: {
          id: 'answer',
          content: [
            { type: 'reasoning', text: 'secret' },
            { type: 'text', text: 'answer' }
          ]
        }
      }
    }
  )
  const result = exportHumanHistory(events)
  expect(result).toHaveLength(61)
  expect(result[0]!.text).toBe('q0')
  expect(JSON.stringify(result)).not.toContain('secret')
  expect(result.at(-1)?.text).toBe('answer')
  const refs = exportHumanHistory([
    {
      seq: 0,
      type: 'user/message',
      surfaceOp: 'append',
      data: {
        source: { kind: 'user' },
        content: [
          {
            type: 'text',
            text: '␞SHERLOCK_RESEARCH_FILES_V1 {"files":[{"id":"f","name":"材料","path":"/Users/private/file.txt"}]}␟总结'
          }
        ]
      }
    }
  ])
  expect(refs[0]!.text).toBe('总结')
  expect(refs[0]!.references[0]!.nodeId).toBe('f')
  expect(JSON.stringify(refs)).not.toContain('/Users/')
  expect(() =>
    exportHumanHistory([
      {
        type: 'user/message',
        surfaceOp: 'append',
        data: {
          source: { kind: 'user' },
          content: [
            { type: 'text', text: '␞SHERLOCK_RESEARCH_FILES_V1 broken' }
          ]
        }
      }
    ])
  ).toThrow()
})
it('rejects truncating limits and preserves explicit reference scope', () => {
  expect(() =>
    exportHumanHistory(
      Array.from({ length: 101 }, (_, seq) => ({
        seq,
        type: 'user/message',
        surfaceOp: 'append',
        data: {
          source: { kind: 'user' },
          content: [{ type: 'text', text: 'x' }]
        }
      }))
    )
  ).toThrow('HISTORY_TOO_LARGE')
  expect(
    normalizeRequestContext({
      scope: 'references',
      references: [{ collection: 'files', nodeId: 'f' }]
    }).references[0]!.nodeId
  ).toBe('f')
  expect(() =>
    normalizeRequestContext({ scope: 'references', references: [] })
  ).toThrow()
})
it('retains imported baseline exactly once when a personal copy is shared again', async () => {
  const { mergeHumanHistory } = await import(
    '../packages/dsh-research-collaboration/context.js'
  )
  expect(
    mergeHumanHistory(
      [{ id: 'old', role: 'user', text: 'baseline' }],
      [{ id: 'new', role: 'user', text: 'new' }]
    ).map((m) => m.text)
  ).toEqual(['baseline', 'new'])
  expect(
    mergeHumanHistory(
      [{ id: 'old', role: 'user', text: 'baseline' }],
      [{ id: 'old', role: 'user', text: 'baseline' }]
    )
  ).toHaveLength(1)
})
it('reviewed capture reopens identical frozen manifest after source and history change', async () => {
  const { ResearchBoardSnapshots } = await import(
    '../src/main/state/research-board-snapshot'
  )
  const { mkdtemp, writeFile, rm, realpath } = await import(
    'node:fs/promises'
  )
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'board-snapshot-'))
  )
  const source = join(root, 'source.txt')
  await writeFile(source, 'first')
  let text = 'first message'
  const options: any = {
    root,
    readCanvas: () => ({
      files: [
        {
          id: 'f',
          name: 'source.txt',
          source: 'computer',
          x: 1,
          y: 2,
          authorizationId: 'grant'
        }
      ],
      artifacts: []
    }),
    history: async () => ({
      history: [{ id: 'm', role: 'user', text }],
      revision: text
    }),
    resolveSource: async () => ({ path: source, name: 'source.txt' }),
    runtime: async () => ({}),
    authorize: () => {},
    download: async () => {
      throw Error()
    }
  }
  try {
    let store = new ResearchBoardSnapshots(options)
    const preview = await store.preview({
      sessionId: 's',
      accountId: 'a',
      signal: new AbortController().signal
    })
    text = 'changed'
    await rm(source)
    store = new ResearchBoardSnapshots(options)
    const capture = await store.capture({
      sessionId: 's',
      accountId: 'a',
      operationId: 'op',
      captureId: preview.captureId,
      signal: new AbortController().signal
    })
    expect(capture.snapshot.history[0]!.text).toBe('first message')
    expect(capture.assets).toHaveLength(1)
    await capture.dispose?.()
    expect(
      (
        await store.capture({
          sessionId: 's',
          accountId: 'a',
          operationId: 'op',
          signal: new AbortController().signal
        })
      ).sourceRevision
    ).toBe(capture.sourceRevision)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
it('resumes its exact partial personal install but refuses unrelated destination edits', async () => {
  const { ResearchBoardSnapshots } = await import(
    '../src/main/state/research-board-snapshot'
  )
  const { mkdtemp, rm, realpath } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const root = await realpath(await mkdtemp(join(tmpdir(), 'board-copy-')))
  let canvas: any = { files: [], artifacts: [] }
  let fail = true
  let authorized = true
  const options: any = {
    root,
    readCanvas: () => structuredClone(canvas),
    writeCanvas: (_id: any, value: any) => {
      canvas.files = value.files
      if (fail) {
        fail = false
        throw Error('DISK_INTERRUPTED')
      }
      canvas.artifacts = value.artifacts
    },
    history: async () => ({
      history: [{ id: 'later', role: 'user', text: 'later' }],
      revision: 'r'
    }),
    resolveSource: async () => null,
    runtime: async () => ({ revision: 'empty' }),
    authorize: () => {
      if (!authorized) throw Error('REVOKED')
    },
    download: async () => {
      throw Error()
    }
  }
  const snapshot: any = {
    board: { sharingEpoch: 1, title: 'shared' },
    snapshot: {
      canvas: {
        files: [],
        artifacts: [{ id: 'n', kind: 'note', excerpt: 'note', x: 0, y: 0 }]
      },
      history: [{ id: 'm', role: 'user', text: 'baseline' }]
    },
    messages: []
  }
  const signal = new AbortController().signal
  try {
    let store = new ResearchBoardSnapshots(options)
    const copy = await store.prepareCopy({
      accountId: 'a',
      boardId: 'b',
      snapshot,
      signal
    })
    await expect(
      store.finalizeCopy({
        accountId: 'a',
        copyId: copy.copyId,
        localSessionId: 's',
        signal
      })
    ).rejects.toThrow('DISK_INTERRUPTED')
    store = new ResearchBoardSnapshots(options)
    expect(store.canResumeCopy('a', copy.copyId, 's')).toBe(true)
    await store.finalizeCopy({
      accountId: 'a',
      copyId: copy.copyId,
      localSessionId: 's',
      signal
    })
    authorized = false
    expect(store.completedCopy('a', copy.copyId, 's')).toEqual({
      localSessionId: 's'
    })
    expect(store.importFor('s').history[0].text).toBe('baseline')
    expect(canvas.artifacts).toHaveLength(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('refuses an attachment-bearing saved human record instead of silently exporting only its text', () => {
  expect(() =>
    exportHumanHistory([
      {
        type: 'user/message',
        surfaceOp: 'append',
        data: {
          source: { kind: 'user' },
          content: [
            { type: 'text', text: '请分析图片' },
            { type: 'image', url: 'private-attachment' }
          ]
        }
      }
    ])
  ).toThrow('HISTORY_UNSUPPORTED_ATTACHMENT')
})

it('rejects local machine paths at both human text and structured reference snapshot boundaries, preserving web URLs', async () => {
  const { portableReferences } = await import(
    '../packages/dsh-research-collaboration/context.js'
  )
  const { freezeSnapshot } = await import(
    '../packages/dsh-research-collaboration/document.js'
  )
  const exported = (text: string) =>
    exportHumanHistory([
      {
        type: 'assistant/message',
        surfaceOp: 'append',
        data: { message: { id: 'answer', content: [{ type: 'text', text }] } }
      }
    ])
  for (const path of [
    '/private/tmp/research/report.md',
    '/var/folders/aa/private/cache.txt',
    '/private/var/folders/aa/cache.md',
    '/tmp/evidence.txt',
    '/Volumes/Research/a.txt',
    '/Users/research/a.md',
    '/home/user/a.txt',
    '~/Documents/report.md',
    'C:\\Users\\research\\report.md',
    'C:/Temp/report.md',
    '\\\\server\\share\\report.txt',
    'file:///tmp/report.txt'
  ]) {
    expect(() => exported('报告保存在 ' + path)).toThrow(
      'PRIVATE_PATH_IN_HISTORY'
    )
    expect(() =>
      portableReferences([
        { collection: 'artifacts', nodeId: 'n', text: path }
      ])
    ).toThrow()
    expect(() =>
      freezeSnapshot({
        canvas: { files: [], artifacts: [] },
        history: [{ id: 'h', role: 'assistant', text: path }]
      })
    ).toThrow('PRIVATE_PATH_IN_HISTORY')
  }
  const text =
    '参见 https://example.org/private/tmp/report.md 与 https://example.org/var/folders/data，收入/成本 为 2/3。'
  expect(exported(text)[0]!.text).toBe(text)
  expect(
    portableReferences([{ collection: 'artifacts', nodeId: 'n', text }])[0]!
      .text
  ).toBe(text)
})

it('identifies unsupported saved attachments safely instead of leaking their machine path', () => {
  const event = {
    seq: 7,
    type: 'user/message',
    surfaceOp: 'append',
    data: {
      id: 'human-7',
      source: { kind: 'user' },
      content: [
        { type: 'text', text: '分析这份报告' },
        { type: 'image', name: '/private/tmp/research/报告.png' }
      ]
    }
  }
  try {
    exportHumanHistory([event])
    throw Error('expected rejection')
  } catch (error: any) {
    expect(error.message).toContain('HISTORY_UNSUPPORTED_ATTACHMENT')
    expect(error.message).toContain('human-7')
    expect(error.message).toContain('image')
    expect(error.message).toContain('报告.png')
    expect(error.message).not.toContain('/private/')
  }
})

it.each([true, false])(
  'preserves canonical and history-only asset filenames through real personal copy and production text loading (asset headers: %s)',
  async (assetHeaders) => {
    const { ResearchBoardSnapshots } = await import(
      '../src/main/state/research-board-snapshot'
    )
    const runtimeModule = '../packages/dsh-research-task-runtime/index.js',
      contextModule =
        '../packages/dsh-research-task-runtime/context-runtime.js'
    const { loadResearchFileText } = await import(runtimeModule)
    const { createFrozenResearchFileLoader } = await import(contextModule)
    const { mkdtemp, realpath, rm, stat } = await import('node:fs/promises')
    const { join, basename } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'copy-filenames-'))
    )
    let canvas: any = { files: [], artifacts: [] }
    const downloads: string[] = []
    const store = new ResearchBoardSnapshots({
      root,
      readCanvas: () => canvas,
      writeCanvas: (_id, value) => {
        canvas = value
      },
      history: async () => ({ history: [], revision: 'empty' }),
      runtime: async () => ({ revision: 'empty' }),
      resolveSource: async () => null,
      authorize: () => {},
      download: async (_a, _b, id) => {
        downloads.push(id)
        return new Response(
          id === 'current' ? 'current evidence' : 'historical evidence',
          {
            headers: {
              'content-type': 'text/plain',
              ...(assetHeaders
                ? {
                    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(id === 'current' ? 'evidence.txt' : '历史证据.csv')}`
                  }
                : {})
            }
          }
        )
      }
    })
    const snapshot: any = {
      board: { sharingEpoch: 1, title: 'shared' },
      messages: [],
      snapshot: {
        canvas: {
          files: [
            {
              id: 'file',
              name: 'evidence.txt',
              assetId: 'current',
              x: 0,
              y: 0
            }
          ],
          artifacts: [
            {
              id: 'component',
              kind: 'generated-container',
              generationSources: [
                {
                  id: 'file',
                  type: 'file',
                  title: '展示标签',
                  assetId: 'current'
                }
              ]
            }
          ]
        },
        history: [
          {
            id: 'h',
            role: 'user',
            text: '先前参考资料',
            references: [
              {
                collection: 'files',
                nodeId: 'old-file',
                assetId: 'historical',
                name: assetHeaders ? '旧资料展示标签' : '历史证据.csv'
              }
            ]
          }
        ]
      }
    }
    const signal = new AbortController().signal
    try {
      const copy = await store.prepareCopy({
        accountId: 'a',
        boardId: 'b',
        snapshot,
        signal
      })
      await store.finalizeCopy({
        accountId: 'a',
        copyId: copy.copyId,
        localSessionId: 'personal',
        signal
      })
      expect(downloads.sort()).toEqual(['current', 'historical'])
      const file = canvas.files[0],
        source = canvas.artifacts[0].generationSources[0],
        ref = store.importFor('personal').history[0].references[0],
        historical = await store.ownedSource('personal', ref.nodeId)
      expect(basename(file.path)).toBe('evidence.txt')
      expect(source.path).toBe(file.path)
      expect(basename(historical!.path)).toBe('历史证据.csv')
      const load = createFrozenResearchFileLoader(loadResearchFileText, {
        cooperativeCancellation: true
      })
      for (const [path, text] of [
        [file.path, 'current evidence'],
        [historical!.path, 'historical evidence']
      ]) {
        const revision = await stat(path)
        expect(
          (
            await load(
              {
                path,
                revision: { size: revision.size, mtimeMs: revision.mtimeMs }
              },
              signal
            )
          ).text
        ).toBe(text)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
)
