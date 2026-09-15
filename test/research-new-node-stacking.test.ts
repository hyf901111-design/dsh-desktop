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

  it.each([53, 1000000])('persists pasted files above all existing layers at %i', async (order) => {
    const bundle = await loadClientBundle('dsh-client-ui-conversation', {}, { researchClipboard: { admit: async ({ nodeId }: any) => grant(nodeId) } } as any)
    const storage = memoryStorage({})
    const workspace = bundle.createResearchWorkspaceSession(storage, 'target')
    workspace.setArtifacts([{ ...textNode('existing'), stackOrder: order }])
    await workspace.insertClipboardNodes({ kind: 'files', files: [file, file] }, { x: 10, y: 20 })
    const state = workspace.getSnapshot()
    expect(state.files[0].stackOrder).toBeGreaterThan(state.artifacts[0].stackOrder)
    expect(state.files[1].stackOrder).toBeGreaterThan(state.files[0].stackOrder)
    const restored = bundle.createResearchWorkspaceSession(storage, 'target').getSnapshot()
    expect(restored.files.map((n: any) => n.stackOrder)).toEqual(state.files.map((n: any) => n.stackOrder))
    workspace.undo(); workspace.redo()
    expect(workspace.getSnapshot().files.map((n: any) => n.stackOrder)).toEqual(state.files.map((n: any) => n.stackOrder))
  })


const textNode = (id: string) => ({id,kind:'pasted-text',messageId:'old-message',title:'文字',excerpt:'内容',x:10,y:20,width:600,height:360,sizeMode:'manual'})
const file = {assetId:'a'.repeat(48),name:'report.pdf',mimeType:'application/pdf',size:22,previewable:true}
const grant = (nodeId: string) => ({nodeId,sessionId:'target',authorizationId:`auth-${nodeId}`,capabilityToken:'runtime-only',url:'sherlock-research-file://preview',name:'report.pdf',contentType:'application/pdf',path:'/managed/report.pdf'})

it('keeps pasted shared files above existing cards through the collaboration document roundtrip', async () => {
  const bundle = await loadClientBundle('dsh-client-ui-conversation', {}, {
    researchBoards: { isSharedSession: () => true },
    researchClipboard: { admit: async ({ nodeId }: any) => grant(nodeId) }
  } as any)
  const workspace = bundle.createResearchWorkspaceSession(memoryStorage({}), 'target')
  const before = { files: [], artifacts: [{ ...textNode('existing'), stackOrder: 53 }] }
  workspace.applyRemoteCanvas(before)
  workspace.setCollaborationAccess(true)
  await workspace.insertClipboardNodes({ kind: 'files', files: [file] }, { x: 10, y: 20 })
  const state = workspace.getSnapshot()
  expect(state.files[0].stackOrder).toBeGreaterThan(53)
  const { createDocument, applyCanvasDiff, encodeDocument, decodeDocument, projectDocument } = await import('../packages/dsh-research-collaboration/document.js')
  const doc = createDocument(before)
  const portable = state.files.map(({ id, name, x, y, stackOrder }: any) => ({ id, name, x, y, stackOrder, assetId: file.assetId }))
  applyCanvasDiff(doc, before, { files: portable, artifacts: state.artifacts })
  const remote = bundle.createResearchWorkspaceSession(memoryStorage({}), 'target')
  const received = projectDocument(decodeDocument(encodeDocument(doc)))
  remote.applyRemoteCanvas({ ...received, files: received.files.map((n: any) => ({ ...n, path: '/remote/report.pdf', source: 'computer' })) })
  expect(remote.getSnapshot().files[0].stackOrder).toBe(state.files[0].stackOrder)
})
