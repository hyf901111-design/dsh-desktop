import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

type ClientBundle = {
  AbstractApiClient: new () => {
    sessions: {
      models(payload: { sessionId: string }): Promise<{
        result: {
          ok: boolean
          value?: {
            current: null | { provider: string; model: string }
            routable: boolean
            groups: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>
          }
        }
      }>
    }
  }
}

type BundleDescriptor = {
  factory(require: (id: string) => unknown): ClientBundle
}

async function loadClientBundle(): Promise<ClientBundle> {
  const source = await readFile(
    'node_modules/@deepseek-ai/dsh-client-connection/lib/client.js',
    'utf8'
  )
  let descriptor: BundleDescriptor | undefined

  runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load(value: BundleDescriptor) {
          descriptor = value
        }
      }
    },
    AbortController,
    AbortSignal,
    Response,
    TextDecoder,
    URL,
    console,
    crypto,
    queueMicrotask,
    setTimeout,
    clearTimeout
  })

  if (descriptor === undefined) throw new Error('client connection bundle did not register')
  return descriptor.factory((id) => {
    throw new Error(`unexpected external dependency: ${id}`)
  })
}

describe('first-run model picker', () => {
  it('loads the available model groups when the session has no current selection yet', async () => {
    const clientBundle = await loadClientBundle()
    const BaseClient = clientBundle.AbstractApiClient
    class FirstRunClient extends BaseClient {
      async doFetch(_url: URL, init: RequestInit): Promise<Response> {
        const request = JSON.parse(String(init.body)) as { rpcId: string }
        return new Response(
          JSON.stringify({
            type: 'server-response',
            rpcId: request.rpcId,
            result: {
              ok: true,
              value: {
                current: null,
                routable: false,
                groups: [
                  {
                    id: 'kimi-coding',
                    name: 'Kimi Coding',
                    models: [{ id: 'kimi-k3', name: 'Kimi K3' }]
                  }
                ],
                failures: []
              }
            }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
    }

    const response = await new FirstRunClient().sessions.models({ sessionId: 'session-first-run' })

    expect(response.result).toEqual({
      ok: true,
      value: {
        current: null,
        routable: false,
        groups: [
          {
            id: 'kimi-coding',
            name: 'Kimi Coding',
            models: [{ id: 'kimi-k3', name: 'Kimi K3' }]
          }
        ],
        failures: []
      }
    })
  })
})
