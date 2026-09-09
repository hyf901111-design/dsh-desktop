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
