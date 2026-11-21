import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {z} from 'zod'
import {describe, expect, it} from 'vitest'

const require = createRequire(import.meta.url)
const {currentTurnMode, patchTurnModeConversation, stripTurnModeConversation, patchTurnModeTransport} = require('../scripts/lib/turn-client-mode.mjs')
const key = Symbol.for('sherlock:turn-client-mode')
const bundle = file => readFileSync('node_modules/@deepseek-ai/' + file, 'utf8')
const original = bundle('dsh-client-ui-conversation/lib/client.js')
const ui = patchTurnModeConversation(original)
const runtime = patchTurnModeTransport(bundle('dsh-client-runtime/lib/client.js'), 'runtime')
const host = patchTurnModeTransport(bundle('dsh-host-apiproxy/lib/index.js'), 'host')

function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a)
  if (a < 0 || b < 0) throw Error('Could not locate native entry ' + start)
  return source.slice(a, b)
}

function method(source, start, end, name, scope = {}) {
  return runInNewContext('({' + between(source,start,end) + '})', scope)[name]
}

function workspace() {
  const state = { current: 'a', surface: undefined, views: {a: 'chat', b: 'spreadsheet'}, visible: undefined }
  const resolve = (id, pending) => currentTurnMode(id,{
    current: () => state.current,
    surface: () => state.surface,
    visibleView: () => state.visible,
    viewFor: id => state.views[id],
    isBoardOnly: id => id === 'board',
  },pending)
  return {state, resolve}
}

describe('workspace mode at admission', () => {
  it('follows the visible surface, board, reopened view, and first-send handoff', () => {
    const {state, resolve} = workspace()
    expect(resolve('a')).toBe('conversation')
    for (const mode of ['research','spreadsheet','presentation','notes']) {
      state.visible = mode
      expect(resolve('a')).toBe(mode)
    }
    for (const [entry, mode] of [['image-factory','image'],['knowledge','knowledge'],['browser','browser']]) {
      state.surface = entry
      expect(resolve('a')).toBe(mode)
      expect(resolve('b')).toBe('spreadsheet')
      expect(resolve('board')).toBe('research')
    }
    expect(resolve(undefined, 'presentation')).toBe('presentation')
    expect(resolve(undefined, 'image-factory')).toBe('image')
    state.surface = undefined
    state.current = 'b'
    state.visible = 'chat'
    expect(resolve('b')).toBe('conversation')
    state.visible = undefined
    expect(resolve('b')).toBe('spreadsheet')
  })

  it('sends through SDK and validated host admission with independent click-time modes across awaits', async () => {
    const {state, resolve} = workspace()
    const schemaText = between(host, 'const sessionPromptRequestSchema = ', ';').replace('const sessionPromptRequestSchema = ', '')
    const schema = runInNewContext(schemaText, {'z$1':z,sessionIdSchema:z.string(),promptContentPartSchema:z.object({type:z.literal('text'),text:z.string()})})
    const received = []
    const admit = method(host,'async prompt(request) {','\n\t\t\tasync attachment(request)', 'prompt', {
      canonicalClientTimeZone: zone => zone,
      turnAgentFor: async (_request,id) => ({agent: {
        steer: message => received.push({id,placement:'steer',...message}),
        followup: message => received.push({id,placement:'queue',...message}),
      }}),
      createUserMessage: value => value, durablePromptContent: async (_ctx,content) => content,
      ctx:{}, ok: (_request,value) => ({result:{ok:true,value}}),
    })
    let serial = 0
    const api = {sessions:{prompt: payload => admit({payload:schema.parse(payload),rpcId:'r'+ ++serial})}}
    const sdk = method(runtime,'async prompt(content, mode, clientMode','\n\t\t\t/**','prompt',{
      globalThis:{[key]:resolve},resolvedClientTimeZone:()=>'Asia/Shanghai',
    })
    const send = method(ui,'async sendSession(session, text, imageIds, mode, clientMode','\n\t\t\t/**','sendSession',{
      globalThis:{[key]:resolve},eworkImageFactory:undefined,
    })
    const session = id => ({sessionId:id,api,notifier:{markDirty(){}},prompt:sdk})
    const gates = []
    const controller = {draftImages:() => [],serializeImages:() => new Promise(done => gates.push(()=>done([]))),releaseDraftImages(){}}
    const a = session('a'), b = session('b')
    state.surface = 'image-factory'
    const first = send.call(controller,a,'先生成图片',[],'queue')
    state.current = 'b'
    state.surface = undefined
    state.visible = 'spreadsheet'
    const second = send.call(controller,b,'读取筛选范围',[],'steer')
    state.visible = 'research'
    const third = send.call(controller,b,'研究这个组合',[],'queue')
    gates[2](); await third
    gates[1](); await second
    gates[0](); await first
    expect(received.map(m=>[m.id,m.placement,m.content[0].text,m.source.clientMode])).toEqual([
      ['b','queue','研究这个组合','research'],['b','steer','读取筛选范围','spreadsheet'],['a','queue','先生成图片','image'],
    ])
    expect(received[0].source).toMatchObject({kind:'user',rpcId:'r1',clientTimeZone:'Asia/Shanghai'})
    state.visible = 'chat'
    await b.prompt([{type:'text',text:'回到普通模式'}],'queue')
    const old = {sessionId:'old',mode:'queue',content:[{type:'text',text:'clientMode=research'}]}
    expect(schema.safeParse({...old,clientMode:'admin'}).success).toBe(false)
    await api.sessions.prompt(old)
    expect(received.at(-2).source.clientMode).toBe('conversation')
    expect(received.at(-1).source).not.toHaveProperty('clientMode')
  })

  it('freezes a composer click before command adjudication and reference serialization', async () => {
    const {state, resolve} = workspace()
    const scope = {globalThis:{[key]:resolve},document:{body:{dataset:{}}},window:{},AbortController}
    const submit = method(ui,'submit(mode = "queue", clientMode)','\n\t\t\t/**','submit',scope)
    const serialize = method(ui,'sinkSerialized(draft, mode) {','\n\t\t\t/**','sinkSerialized',scope)
    let release
    const admitted = new Promise(done=>{
      const shell = {
        snapshot:{draft:'A■B',draftRev:1,phase:'plain',occurrences:[]},imageIds:[],
        deps:{conversationComponentSessionId:'a',defaultSink:(text,images,placement,admission)=>done({text,placement,mode:admission.clientMode}),
          inputTriggers:()=>({track(){},serializeReference:()=>new Promise(resolve=>{release=resolve})})},
        run(){},core:{dispatch(){},state:{occurrences:[{source:'external',offset:1,ref:'one'}]}},
      }
      state.visible='presentation'
      submit.call(shell,'steer')
      shell.snapshot.phase='adjudicating'
      state.visible='chat'
      submit.call(shell,'queue')
      serialize.call(shell,'A■B','steer')
      state.current='b'
      release('附件')
    })
    expect(await admitted).toEqual({text:'A附件B',placement:'steer',mode:'presentation'})
  })

  it('reapplies and removes the exact production renderer and transport patches', () => {
    expect(patchTurnModeConversation(ui)===ui).toBe(true)
    expect(stripTurnModeConversation(ui)===stripTurnModeConversation(original)).toBe(true)
    expect(patchTurnModeTransport(host,'host')===host).toBe(true)
    expect(patchTurnModeTransport(runtime,'runtime')===runtime).toBe(true)
  })
})
