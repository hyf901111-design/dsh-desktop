import { Session } from '@deepseek-ai/dsh-session'
import { expect, it } from 'vitest'
import { SharedExecutionRuntime } from '../packages/dsh-research-task-runtime/board-runtime.js'
it('fixed task identity starts once and refuses a changed payload or restart replay', async () => {
  let calls = 0
  let release
  const saved = {}
  const storage = {
    async load() {
      return structuredClone(saved)
    },
    async save(v) {
      Object.assign(saved, structuredClone(v))
    }
  }
  const runtime = new SharedExecutionRuntime({
    storage,
    execute: async () => {
      calls++
      return await new Promise((r) => {
        release = r
      })
    }
  })
  await runtime.restore()
  await runtime.start({
    taskId: 't',
    sessionId: 's',
    kind: 'qa',
    prompt: 'question'
  })
  await runtime.start({
    taskId: 't',
    sessionId: 's',
    kind: 'qa',
    prompt: 'question'
  })
  expect(calls).toBe(1)
  await expect(
    runtime.start({
      taskId: 't',
      sessionId: 's',
      kind: 'qa',
      prompt: 'changed'
    })
  ).rejects.toThrow()
  release('answer')
  await new Promise((r) => setTimeout(r, 5))
  expect(runtime.inspect('t').text).toBe('answer')
  const restored = new SharedExecutionRuntime({
    storage,
    execute: async () => {
      calls++
      return 'bad'
    }
  })
  await restored.restore()
  await restored.start({
    taskId: 't',
    sessionId: 's',
    kind: 'qa',
    prompt: 'question'
  })
  expect(calls).toBe(1)
})
it('authenticated fixed routes export saved history and reject nonfresh or concurrently changed transcripts', async () => {
  const { registerBoardRuntime } = await import(
    '../packages/dsh-research-task-runtime/board-runtime.js'
  )
  const { createServer } = await import('node:http')
  const routes = new Map(),
    session = Session.create('s')
  const runtime = new SharedExecutionRuntime({
    storage: { load: async () => ({}), save: async () => {} },
    execute: async () => {
      throw Error('MODEL_MUST_NOT_RUN')
    }
  })
  await runtime.restore()
  const dispose = registerBoardRuntime(
    {
      webServer: {
        register: ({ path, handler }) => {
          routes.set(path, handler)
          return () => routes.delete(path)
        }
      },
      sessions: { get: () => session, flush: async () => true }
    },
    runtime,
    { token: 'private-token' }
  )
  const server = createServer((req, res) => routes.get(req.url)(req, res))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const origin = 'http://127.0.0.1:' + server.address().port
  const call = (action, body, headers = {}) =>
    fetch(origin + '/sherlock/research-boards/' + action, {
      method: 'POST',
      headers: {
        authorization: 'Bearer private-token',
        origin,
        'content-type': 'application/json',
        ...headers
      },
      body: JSON.stringify(body)
    })
  try {
    expect(
      (
        await call(
          'history',
          { sessionId: 's' },
          { authorization: 'Bearer cloud-token' }
        )
      ).status
    ).toBe(403)
    expect(
      (
        await call(
          'history',
          { sessionId: 's' },
          { origin: 'https://hostile.test' }
        )
      ).status
    ).toBe(403)
    expect(
      (
        await call(
          'history',
          { sessionId: 's' },
          { 'x-forwarded-host': 'spoof' }
        )
      ).status
    ).toBe(403)
    expect(
      (
        await call('fresh', {
          sessionId: 's',
          copyId: 'copy',
          createdAfter: session.header.createdAt - 1
        })
      ).status
    ).toBe(200)
    expect(
      (await call('fresh-check', { sessionId: 's', copyId: 'copy' })).status
    ).toBe(200)
    expect(() =>
      session.append('agent/inbox/spliced', { items: [] })
    ).toThrow('COPY_FINALIZING')
    expect(
      (await call('fresh-release', { sessionId: 's', copyId: 'copy' })).status
    ).toBe(200)
    session.append(
      'user/message',
      {
        id: 'human',
        source: { kind: 'user' },
        content: [{ type: 'text', text: 'saved question' }]
      },
      { surfaceOp: 'append' }
    )
    expect(
      (await call('fresh-check', { sessionId: 's', copyId: 'copy' })).status
    ).toBe(400)
    expect(
      (
        await call('fresh', {
          sessionId: 's',
          copyId: 'other',
          createdAfter: 0
        })
      ).status
    ).toBe(400)
    const result = await (await call('history', { sessionId: 's' })).json()
    expect(result.history[0].text).toBe('saved question')
  } finally {
    await dispose()
    await new Promise((r) => server.close(r))
  }
})
it('legacy shared session authority rejects before model work, including historical shared IDs', async () => {
  const { assertPrivateResearchSession } = await import(
    '../packages/dsh-research-task-runtime/board-runtime.js'
  )
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ shared: true }))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  try {
    await expect(
      assertPrivateResearchSession('old-shared', {
        SHERLOCK_RESEARCH_CONTEXT_URL:
          'http://127.0.0.1:' + server.address().port,
        SHERLOCK_RESEARCH_CONTEXT_TOKEN: 'main'
      })
    ).rejects.toThrow('SHARED_EXECUTION_REQUIRES_LEASE')
  } finally {
    await new Promise((r) => server.close(r))
  }
})
