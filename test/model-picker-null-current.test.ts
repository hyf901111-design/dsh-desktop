import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { patchHostModelCatalog, patchModelCatalogSchema } from '../scripts/lib/figma-model-menu.mjs'

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

  runInNewContext(patchModelCatalogSchema(source), {
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
    const host = patchModelCatalogSchema(patchHostModelCatalog(
      await readFile('node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js', 'utf8')
    ))
    const schemaStart = host.indexOf('const modelCatalogModelSchema =')
    const schemaEnd = host.indexOf('/** One successfully loaded provider group', schemaStart)
    const modelSchema = runInNewContext(host.slice(schemaStart, schemaEnd) + '\nmodelCatalogModelSchema', {
      z$1: z,
      modelReasoningSchema: z.unknown()
    })
    const start = host.indexOf('async function buildModelCatalog(')
    const end = host.indexOf('/** Wrap an error result', start)
    const buildCatalog = runInNewContext(host.slice(start, end) + '\nbuildModelCatalog')
    const catalog = await buildCatalog({
      llm: {
        listProviders: () => [{ id: 'custom', name: 'Configured models' }],
        listModels: async () => [{ id: 'photo', name: 'Photo model' }, { id: 'text', name: 'Text model' }],
        resolveModelInfo: async (_provider: string, model: string) => ({
          inputModalities: model === 'photo' ? ['text', 'image'] : ['text']
        })
      }
    })
    catalog.groups[0].models = catalog.groups[0].models.map((model: unknown) => modelSchema.parse(model))
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
                ...catalog
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
            id: 'custom',
            name: 'Configured models',
            models: [
              { id: 'photo', name: 'Photo model', supportsImageInput: true },
              { id: 'text', name: 'Text model' }
            ]
          }
        ],
        failures: []
      }
    })
  })
})
