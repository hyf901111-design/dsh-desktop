import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import {layoutWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {researchWorkbenchMatrixNodes} from '../scripts/lib/research-workbench-growth.mjs'
import {
  createDocument,
  encodeDocument,
  decodeDocument,
  projectDocument,
  applyCanvasDiff,
  freezeSnapshot,
  mergeDocumentUpdate
} from '../packages/dsh-research-collaboration/document.js'
const initial = {
  files: [],
  artifacts: [
    {
      id: 'a',
      kind: 'pasted-text',
      title: '金价',
      excerpt: '研究',
      x: 0,
      y: 0
    }
  ]
}
describe('shared research document', () => {
  it('preserves semantic wide layout across a frozen share snapshot and document reload',()=>{
    const artifacts=layoutWorkbench([{type:'html',title:'交接比较',prompt:'演练记录',size:'large',layout:'wide'},{type:'tasks',title:'执行清单',prompt:'演练任务',size:'large'}]).map((p,i)=>({id:'wide-'+i,kind:'generated-container',title:p.title,workbenchId:'w',workbenchIndex:i,x:p.x+p.width/2,y:p.y+p.height/2,width:p.width,height:p.height,...(p.workbenchSpan?{workbenchSpan:true,workbenchLayoutVersion:1}:{})}));
    const original={files:[],artifacts},frozen=freezeSnapshot({canvas:original}).canvas;
    expect(frozen.artifacts[0]).toMatchObject({workbenchSpan:true,workbenchLayoutVersion:1});
    const doc=createDocument(original),restored=decodeDocument(encodeDocument(doc));
    try{const projected=projectDocument(restored);expect(projected).toEqual(original);expect(researchWorkbenchMatrixNodes(projected.artifacts,0,0)).toEqual(researchWorkbenchMatrixNodes(artifacts,0,0))}finally{doc.destroy();restored.destroy()}
  });
  it('merges independent geometry and collaborative text in both delivery orders', () => {
    for (const reverse of [false, true]) {
      const state = encodeDocument(createDocument(initial))
      const a = decodeDocument(state),
        b = decodeDocument(state)
      const next = structuredClone(initial)
      next.artifacts[0].x = 120
      applyCanvasDiff(a, initial, next)
      b.getMap('artifacts').get('a').get('excerpt').insert(0, '共同')
      const updates = [encodeDocument(a), encodeDocument(b)]
      if (reverse) updates.reverse()
      const room = decodeDocument(state)
      updates.forEach((u) => Y.applyUpdate(room, u))
      Y.applyUpdate(a, encodeDocument(room))
      Y.applyUpdate(b, encodeDocument(room))
      expect(projectDocument(a)).toEqual(projectDocument(b))
      expect(projectDocument(a).artifacts[0]).toMatchObject({
        x: 120,
        excerpt: '共同研究'
      })
    }
  })
  it('preserves edits to separate nested table cells and chart series', () => {
    const canvas = {
      files: [],
      artifacts: [
        {
          id: 'table',
          kind: 'generated-container',
          containerSpec: {
            type: 'table',
            rows: [
              ['A', 'B'],
              ['C', 'D']
            ]
          },
          x: 0,
          y: 0
        },
        {
          id: 'chart',
          kind: 'generated-container',
          containerSpec: {
            type: 'chart',
            series: [
              { id: 's1', data: [1, 2] },
              { id: 's2', data: [3, 4] }
            ]
          },
          x: 0,
          y: 0
        }
      ]
    }
    const initialState = encodeDocument(createDocument(canvas)),
      a = decodeDocument(initialState),
      b = decodeDocument(initialState)
    const ca = structuredClone(canvas),
      cb = structuredClone(canvas)
    ca.artifacts[0].containerSpec.rows[0][0] = '甲'
    cb.artifacts[0].containerSpec.rows[1][1] = '乙'
    ca.artifacts[1].containerSpec.series[0].data[0] = 10
    cb.artifacts[1].containerSpec.series[1].data[1] = 40
    const ua = applyCanvasDiff(a, canvas, ca),
      ub = applyCanvasDiff(b, canvas, cb)
    Y.applyUpdate(a, ub)
    Y.applyUpdate(b, ua)
    expect(projectDocument(a)).toEqual(projectDocument(b))
    const projected = projectDocument(a)
    expect(
      projected.artifacts.find((n) => n.id === 'table').containerSpec.rows
    ).toEqual([
      ['甲', 'B'],
      ['C', '乙']
    ])
    expect(
      projected.artifacts
        .find((n) => n.id === 'chart')
        .containerSpec.series.map((s) => s.data)
    ).toEqual([
      [10, 2],
      [3, 40]
    ])
  })
  it('freezes a copy independent of later source changes and strips machine authority', () => {
    const source = {
      canvas: structuredClone(initial),
      history: [{ id: 'm', role: 'user', text: '已保存' }],
      token: 'secret',
      sourceSessionId: 'private'
    }
    source.canvas.artifacts[0].path = '/Users/private'
    source.canvas.artifacts[0].apiKey = 'secret'
    const copy = freezeSnapshot(source)
    source.canvas.artifacts[0].title = '后续'
    source.history[0].text = '后续'
    expect(copy.canvas.artifacts[0].title).toBe('金价')
    expect(copy.history[0].text).toBe('已保存')
    expect(JSON.stringify(copy)).not.toMatch(/secret|Users|sourceSessionId/)
  })
  it('keeps server tombstones dominant over offline edits and attempted resurrection', () => {
    const room = createDocument(initial),
      offline = decodeDocument(encodeDocument(room))
    const next = structuredClone(initial)
    next.artifacts[0].x = 999
    applyCanvasDiff(room, initial, { files: [], artifacts: [] })
    applyCanvasDiff(offline, initial, next)
    mergeDocumentUpdate(room, encodeDocument(offline), new Set(['artifacts:a']))
    expect(projectDocument(room).artifacts).toEqual([])
  })
  it('preserves finished containers and portable source context in frozen copies', () => {
    const node = {
      id: 'html',
      kind: 'generated-container',
      title: '分析',
      excerpt: '',
      x: 0,
      y: 0,
      containerSpec: { type: 'html', title: '分析', html: '<p>已完成</p>' },
      generationStatus: 'completed',
      sourceText: '网页正文',
      generationSources: [
        { id: 's', title: '网页', text: '资料', path: '/Users/private' }
      ],
      generationChildSessionId: 'local-only'
    }
    const copy = freezeSnapshot({ canvas: { files: [], artifacts: [node] } })
      .canvas.artifacts[0]
    expect(copy.containerSpec).toEqual(node.containerSpec)
    expect(copy.sourceText).toBe('网页正文')
    expect(copy.generationStatus).toBe('completed')
    expect(JSON.stringify(copy)).not.toMatch(/Users|local-only/)
  })
  it('marks copied running components interrupted without moving execution authority', () => {
    const copy = freezeSnapshot({
      canvas: {
        files: [],
        artifacts: [
          {
            ...initial.artifacts[0],
            generationStatus: 'running',
            generationTaskId: 'private-task',
            generationChildSessionId: 'private-session'
          }
        ]
      }
    })
    expect(copy.canvas.artifacts[0].generationStatus).toBe('interrupted')
    expect(copy.canvas.artifacts[0].generationError).toBe('复制时未完成')
    expect(JSON.stringify(copy)).not.toMatch(/private-task|private-session/)
  })
  it.each([
    [
      'text formatting',
      (node) =>
        node.get('title').format(0, 1, {
          apiKey: 'synthetic-private-key',
          localPath: '/Users/synthetic/private'
        })
    ],
    [
      'cleared historical formatting',
      (node) => {
        node.doc.gc = false
        node.get('title').format(0, 1, { apiKey: 'synthetic-private-key' })
        node.get('title').format(0, 1, { apiKey: null })
      }
    ],
    [
      'text block attributes',
      (node) =>
        node.get('title').setAttribute('apiKey', 'synthetic-private-key')
    ],
    [
      'text embeds',
      (node) =>
        node.get('title').insertEmbed(0, { apiKey: 'synthetic-private-key' })
    ],
    [
      'unsupported XML types',
      (node) => {
        const xml = new Y.XmlElement('p')
        xml.setAttribute('apiKey', 'synthetic-private-key')
        node.set('data', xml)
      }
    ]
  ])(
    'rejects encoded %s without replacing valid shared identities',
    (_label, attack) => {
      const room = createDocument(initial),
        original = encodeDocument(room),
        node = room.getMap('artifacts').get('a'),
        title = node.get('title')
      const malicious = decodeDocument(original)
      attack(malicious.getMap('artifacts').get('a'))
      expect(() =>
        mergeDocumentUpdate(room, encodeDocument(malicious))
      ).toThrow()
      expect(encodeDocument(room)).toEqual(original)
      expect(room.getMap('artifacts').get('a')).toBe(node)
      expect(node.get('title')).toBe(title)
      const honest = decodeDocument(original)
      honest.getMap('artifacts').get('a').get('title').insert(0, '共同')
      mergeDocumentUpdate(room, encodeDocument(honest))
      expect(title.toString()).toBe('共同金价')
    }
  )
  it('rejects unauthorized shared shapes and oversized documents at merge boundary', () => {
    const room = createDocument(initial),
      evil = decodeDocument(encodeDocument(room))
    evil.getMap('roles').set('me', 'owner')
    expect(() => mergeDocumentUpdate(room, encodeDocument(evil))).toThrow()
    expect(projectDocument(room)).toEqual(initial)
  })
})
