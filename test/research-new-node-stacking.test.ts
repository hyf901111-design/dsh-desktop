import { patchFigmaFinalCanvas } from '../scripts/lib/figma-canvas-client.mjs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'


type ClientBundle = Record<string, any>
type BundleDescriptor = {
  factory(require: (id: string) => unknown): ClientBundle
}

const requireModule = createRequire(import.meta.url)

function fakeModule(): unknown {
  let fake: unknown
  const target = function () {}
  fake = new Proxy(target, {
    get: () => fake,
    apply: () => fake,
    construct: () => ({})
  })
  return fake
}

async function loadClientBundle(
  packageName: string,
  modules: Record<string, unknown> = {},
  dshDesktop?: {
    researchContext?: { capture(request: { sessionId: string }): Promise<{ captureId: string; totalSources: number }> }
    researchFilesAvailable?(paths: string[]): Promise<boolean[]>
    researchCanvasStorage?: {
      getItem(key: string): string | null
      setItem(key: string, value: string): boolean
    }
  },
  fetch?: typeof globalThis.fetch
): Promise<ClientBundle> {
  const original = await readFile(
    `node_modules/@deepseek-ai/${packageName}/lib/client.js`,
    'utf8'
  )
  const source = patchFigmaFinalCanvas(original)
  expect(patchFigmaFinalCanvas(source)).toBe(source)
  const react = requireModule('react')
  const jsxRuntime = requireModule('react/jsx-runtime')
  let descriptor: BundleDescriptor | undefined

  runInNewContext(source, {
    AbortController: globalThis.AbortController,
    Date: globalThis.Date,
    TextEncoder: globalThis.TextEncoder,
    setTimeout,
    clearTimeout,
    window: {
      dshDesktop,
      fetch,
      __ModuleLoader__: {
        load(value: BundleDescriptor) {
          descriptor = value
        }
      }
    },
    btoa: globalThis.btoa,
    document: undefined,
    URL: globalThis.URL
  })
  if (descriptor === undefined) throw new Error(`${packageName} did not register`)

  return descriptor.factory((id) => {
    if (modules[id] !== undefined) return modules[id]
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return jsxRuntime
    return fakeModule()
  })
}

const loadConversationClient = () =>
  loadClientBundle('dsh-client-ui-conversation')

function memoryStorage(values: Record<string, string>) {
  const data = new Map(Object.entries(values))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) }
  }
}


it.each([7, 1000000])('puts newly added files and conversation results above existing nodes at order %s, retaining undo/redo', async order => {
 const client = await loadConversationClient()
 const workspace = new client.ResearchWorkspaceRegistry(memoryStorage({})).for('stacking')
 workspace.setFiles([{id:'old',name:'old.mp4',path:'/tmp/old.mp4',source:'computer',x:0,y:0,stackOrder:order}])
 workspace.addAssistantResult({messageId:'reply',text:'A useful result',at:{x:0,y:0}})
 let state=workspace.getSnapshot()
 expect(state.artifacts[0].stackOrder).toBeGreaterThan(state.files[0].stackOrder)
 workspace.setFiles([...state.files,{id:'new',name:'new.mp4',path:'/tmp/new.mp4',source:'computer',x:0,y:0}])
 state=workspace.getSnapshot()
 expect(state.files[1].stackOrder).toBeGreaterThan(state.artifacts[0].stackOrder)
 const orders=state.files.map((n: {stackOrder:number})=>n.stackOrder)
 workspace.undo();workspace.redo()
 expect(workspace.getSnapshot().files.map((n: {stackOrder:number})=>n.stackOrder)).toEqual(orders)
})
