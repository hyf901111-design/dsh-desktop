import { Window } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import { mountResearchBoardNotifications } from '../src/preload/research-board-notifications-ui'
import { boardErrorMessage, showBoardError } from '../src/preload/research-board-dialogs'
import type {
  ResearchBoardsBridge,
  ResearchBoardsState
} from '../src/shared/research-boards'
it('explains access changes in the dialog body without a blank body or raw internal code', () => {
  const w = new Window({ url: 'http://localhost/' })
  const d = showBoardError(w.document as unknown as Document, new Error('BOARD_ACCESS_CHANGED'))
  expect(d.body.textContent).toContain('画板的协作状态已更新')
  expect(d.dialog.textContent).not.toContain('BOARD_ACCESS_CHANGED')
  expect(d.status.textContent).toBe('')
  expect(boardErrorMessage(Object.assign(Error('raw'), { code: 'READ_ONLY' }))).toContain('查看权限')
  expect(boardErrorMessage(Error('NEW_INTERNAL_FAILURE'))).toBe('操作暂时未完成，请稍后重试。')
  expect(boardErrorMessage(Error('请选择需要引用的资料。'))).toBe('请选择需要引用的资料。')
  d.close()
  w.happyDOM.abort()
})
it('mounts a separate bell and keeps pending invitation after read, then accepts exact version', async () => {
  const w = new Window({ url: 'http://localhost/' })
  const state: ResearchBoardsState = {
    version: 1,
    eventSeq: 1,
    account: {
      status: 'ready',
      generation: 1,
      user: { userId: 'u', publicId: '0000000001', username: '甲' }
    },
    favorites: [],
    boards: [],
    current: null,
    recoveries: [],
    notifications: {
      cursor: 1,
      unreadCount: 1,
      pendingCount: 1,
      notifications: [
        {
          notificationId: 'n',
          eventVersion: 2,
          type: 'invitation',
          boardId: 'b',
          boardTitle: '研究',
          createdAt: 1,
          readAt: null,
          invitation: { invitationId: 'i', version: 3, status: 'pending' }
        }
      ]
    }
  }
  const invoke = vi.fn(async (action: string) => ({
    ok: true as const,
    value:
      action === 'invitation.respond'
        ? { invitation: { status: 'accepted' } }
        : state.notifications
  }))
  const bridge: ResearchBoardsBridge = {
    isSharedSession: () => false,
    getSnapshot: async () => state,
    subscribe: () => () => {},
    invoke
  }
  const host = w.document.createElement('div')
  host.dataset.researchBoardBellHost = ''
  w.document.body.append(host)
  const dispose = mountResearchBoardNotifications(
    w.document as unknown as Document,
    bridge
  )
  await new Promise((r) => setTimeout(r, 5))
  const bell = host.querySelector('button[aria-label="消息中心"]')!
  expect(bell).not.toBeNull()
  ;(bell as any).click()
  await new Promise((r) => setTimeout(r, 5))
  expect(w.document.body.textContent).toContain('接受')
  const accept = [...w.document.querySelectorAll('button')].find(
    (b) => b.textContent === '接受'
  )!
  accept.click()
  await new Promise((r) => setTimeout(r, 5))
  expect(invoke).toHaveBeenCalledWith('invitation.respond', {
    invitationId: 'i',
    version: 3,
    decision: 'accept'
  })
  dispose()
  w.happyDOM.abort()
})
it('shows retry instead of login when collaboration bootstrap is unavailable', async () => {
  const w = new Window({ url: 'http://localhost/' })
  const host = w.document.createElement('div')
  host.dataset.researchBoardBellHost = ''
  w.document.body.append(host)
  const bridge: ResearchBoardsBridge = {
    isSharedSession: () => false,
    subscribe: () => () => {},
    invoke: async () => ({ ok: true, value: null }),
    getSnapshot: async () => ({
      version: 1,
      eventSeq: 1,
      account: { status: 'unavailable', generation: 1, user: null },
      favorites: [],
      boards: [],
      current: null,
      recoveries: [],
      notifications: {
        cursor: 0,
        unreadCount: 0,
        pendingCount: 0,
        notifications: []
      }
    })
  }
  const dispose = mountResearchBoardNotifications(
    w.document as unknown as Document,
    bridge
  )
  await new Promise((r) => setTimeout(r, 5))
  ;(host.querySelector('button') as any).click()
  expect(w.document.body.textContent).toContain('协作服务暂不可用')
  expect(w.document.body.textContent).not.toContain('登录')
  dispose()
  w.happyDOM.abort()
})

it('labels invitation results for inviter and recipient without reversing the actor', async () => {
  const w = new Window({ url: 'http://localhost/' }),
    host = w.document.createElement('div')
  host.dataset.researchBoardBellHost = ''
  w.document.body.append(host)
  let emit: (event: any) => void = () => {}
  const state: any = {
    version: 1,
    eventSeq: 1,
    account: { status: 'ready', generation: 1, user: { userId: 'owner' } },
    favorites: [],
    boards: [],
    current: null,
    recoveries: [],
    notifications: {
      cursor: 1,
      unreadCount: 1,
      pendingCount: 0,
      notifications: [
        {
          notificationId: 'n',
          eventVersion: 2,
          type: 'invitationResult',
          boardId: 'b',
          boardTitle: '研究',
          actor: { userId: 'peer', username: '周同事' },
          createdAt: 1,
          readAt: 1,
          invitation: { invitationId: 'i', version: 2, status: 'accepted' }
        }
      ]
    }
  }
  const bridge: any = {
    isSharedSession: () => false,
    subscribe: (fn: any) => {
      emit = fn
      return () => {}
    },
    getSnapshot: async () => state,
    invoke: async () => ({ ok: true, value: null })
  }
  const dispose = mountResearchBoardNotifications(w.document as any, bridge)
  await new Promise((r) => setTimeout(r, 5))
  ;(host.querySelector('button') as any).click()
  expect(w.document.body.textContent).toContain('周同事接受了你的邀请')
  expect(w.document.body.textContent).not.toContain('周同事 邀请你加入')
  emit({
    type: 'state',
    state: {
      ...state,
      eventSeq: 2,
      account: { ...state.account, user: { userId: 'peer' } }
    }
  })
  ;(host.querySelector('button') as any).click()
  expect(w.document.body.textContent).toContain('你已加入这份协作看板')
  dispose()
  w.happyDOM.abort()
})
it('aggregates startup history once and limits new bubbles to3 with hover-paused10second expiry', async () => {
  vi.useFakeTimers()
  const w = new Window({ url: 'http://localhost/' }),
    host = w.document.createElement('div')
  host.dataset.researchBoardBellHost = ''
  w.document.body.append(host)
  let emit: (event: any) => void = () => {}
  const note = (i: number) => ({
    notificationId: 'n' + i,
    eventVersion: 1,
    type: 'invitation',
    boardId: 'b',
    boardTitle: '研究' + i,
    createdAt: 1,
    readAt: null,
    invitation: { invitationId: 'i' + i, version: 1, status: 'pending' }
  })
  let state: any = {
    version: 1,
    eventSeq: 1,
    account: { status: 'ready', generation: 1, user: { userId: 'u' } },
    favorites: [],
    boards: [],
    current: null,
    recoveries: [],
    notifications: {
      cursor: 1,
      unreadCount: 2,
      pendingCount: 2,
      notifications: [note(0), note(1)]
    }
  }
  const bridge: any = {
    isSharedSession: () => false,
    subscribe: (fn: any) => {
      emit = fn
      return () => {}
    },
    getSnapshot: async () => state,
    invoke: async () => ({ ok: true, value: null })
  }
  let dispose = mountResearchBoardNotifications(w.document as any, bridge)
  try {
    await vi.advanceTimersByTimeAsync(1)
    expect(w.document.querySelector('.srb-bubble')?.textContent).toContain(
      '还有 2 条协作邀请'
    )
    dispose()
    dispose = mountResearchBoardNotifications(w.document as any, bridge)
    await vi.advanceTimersByTimeAsync(1)
    expect(w.document.querySelector('.srb-bubble')).toBeNull()
    state = {
      ...state,
      eventSeq: 2,
      notifications: {
        ...state.notifications,
        notifications: [
          ...state.notifications.notifications,
          ...[2, 3, 4, 5, 6].map(note)
        ]
      }
    }
    emit({ type: 'state', state })
    await vi.advanceTimersByTimeAsync(1)
    const bubble = w.document.querySelector('.srb-bubble')!
    expect(bubble.textContent).toContain('研究2')
    bubble.dispatchEvent(new w.Event('pointerenter'))
    await vi.advanceTimersByTimeAsync(12000)
    expect(w.document.querySelector('.srb-bubble')).toBe(bubble)
    bubble.dispatchEvent(new w.Event('pointerleave'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(w.document.querySelector('.srb-bubble')?.textContent).toContain(
      '研究3'
    )
    await vi.advanceTimersByTimeAsync(10000)
    expect(w.document.querySelector('.srb-bubble')?.textContent).toContain(
      '研究4'
    )
    await vi.advanceTimersByTimeAsync(10000)
    expect(w.document.querySelector('.srb-bubble')?.textContent).toContain(
      '还有 2 条协作邀请'
    )
  } finally {
    dispose()
    w.happyDOM.abort()
    vi.useRealTimers()
  }
})

it('updates the active bubble to latest permission and cancelled status without stale actions', async () => {
  const w = new Window({ url: 'http://localhost/' }),
    host = w.document.createElement('div')
  host.dataset.researchBoardBellHost = ''
  w.document.body.append(host)
  let emit: (e: any) => void = () => {}
  const invoke = vi.fn(async () => ({ ok: true, value: null }))
  const state: any = {
    version: 1,
    eventSeq: 1,
    account: { status: 'ready', generation: 1, user: { userId: 'u' } },
    favorites: [],
    boards: [],
    current: null,
    recoveries: [],
    notifications: {
      cursor: 0,
      unreadCount: 0,
      pendingCount: 0,
      notifications: []
    }
  }
  const bridge: any = {
    isSharedSession: () => false,
    getSnapshot: async () => state,
    subscribe: (fn: any) => {
      emit = fn
      return () => {}
    },
    invoke
  }
  const dispose = mountResearchBoardNotifications(w.document as any, bridge)
  await new Promise((r) => setTimeout(r, 5))
  const n = {
    notificationId: 'n',
    eventVersion: 1,
    type: 'invitation',
    boardId: 'b',
    boardTitle: '研究',
    createdAt: 1,
    readAt: null,
    invitation: {
      invitationId: 'i',
      version: 1,
      role: 'editor',
      status: 'pending'
    }
  }
  const update = (note: any, seq: number) =>
    emit({
      type: 'state',
      state: {
        ...state,
        eventSeq: seq,
        notifications: {
          ...state.notifications,
          notifications: [note],
          pendingCount: 1
        }
      }
    })
  try {
    update(n, 2)
    const bubble = w.document.querySelector('.srb-bubble')!
    ;(
      Array.from(bubble.querySelectorAll('button')).find(
        (b) => b.textContent === '接受'
      ) as any
    ).focus()
    update(
      {
        ...n,
        eventVersion: 2,
        invitation: { ...n.invitation, role: 'viewer', version: 2 }
      },
      3
    )
    expect(bubble.textContent).toContain('仅查看')
    expect(w.document.activeElement?.textContent).toBe('接受')
    update(
      {
        ...n,
        eventVersion: 3,
        invitation: { ...n.invitation, status: 'cancelled', version: 2 }
      },
      4
    )
    expect(bubble.textContent).toContain('已撤销')
    expect(bubble.textContent).not.toContain('拒绝接受')
    expect(w.document.activeElement?.getAttribute('aria-label')).toBe(
      '关闭提醒'
    )
  } finally {
    dispose()
    w.happyDOM.abort()
  }
})

it.each([false, true])(
  'marks 101 unread rows in bounded batches with visible failure=%s and keeps pending independent',
  async (fail) => {
    const w = new Window({ url: 'http://localhost/' })
    const state: any = {
      version: 1,
      eventSeq: 1,
      account: { status: 'ready', generation: 1, user: { userId: 'u' } },
      favorites: [],
      boards: [],
      current: null,
      recoveries: [],
      notifications: {
        cursor: 101,
        unreadCount: 101,
        pendingCount: 101,
        notifications: Array.from({ length: 101 }, (_, i) => ({
          notificationId: 'n' + i,
          eventVersion: 1,
          type: 'invitation',
          boardId: 'b',
          boardTitle: '研究',
          createdAt: 1,
          readAt: null,
          invitation: { invitationId: 'i' + i, version: 1, status: 'pending' }
        }))
      }
    }
    const batches: string[][] = []
    const bridge: any = {
      isSharedSession: () => false,
      getSnapshot: async () => state,
      subscribe: () => () => {},
      invoke: async (action: string, input: any) => {
        if (action === 'notifications.read') {
          batches.push(input.notificationIds)
          if (input.notificationIds.length > 100 || fail)
            return {
              ok: false,
              error: { code: 'NETWORK_ERROR', message: '标记失败，请重试' }
            }
          for (const n of state.notifications.notifications)
            if (input.notificationIds.includes(n.notificationId)) n.readAt = 2
          state.notifications.unreadCount =
            state.notifications.notifications.filter(
              (n: any) => n.readAt === null
            ).length
        }
        return { ok: true, value: state.notifications }
      }
    }
    const host = w.document.createElement('div')
    host.dataset.researchBoardBellHost = ''
    w.document.body.append(host)
    const dispose = mountResearchBoardNotifications(w.document as any, bridge)
    try {
      await new Promise((r) => setTimeout(r, 5))
      host.querySelector('button')!.click()
      await new Promise((r) => setTimeout(r, 10))
      expect(batches.every((ids) => ids.length <= 100)).toBe(true)
      if (fail)
        expect(
          w.document.querySelector('.srb-notifications')!.textContent
        ).toContain('标记失败')
      else {
        expect(batches.map((ids) => ids.length)).toEqual([100, 1])
        expect(state.notifications.unreadCount).toBe(0)
      }
      expect(state.notifications.pendingCount).toBe(101)
      expect(
        state.notifications.notifications.every(
          (n: any) => n.invitation.status === 'pending'
        )
      ).toBe(true)
    } finally {
      dispose()
      w.happyDOM.abort()
    }
  }
)

// Figma 325:700: failure keeps the original invitation actions available for retry.
it.each(['accept', 'decline'] as const)('restores the compact %s action after a failed invitation response', async decision => {
  const w = new Window({ url: 'http://localhost/' })
  const host = w.document.createElement('div')
  host.dataset.researchBoardBellHost = ''
  w.document.body.append(host)
  let emit: (event: any) => void = () => {}
  const state: ResearchBoardsState = { version: 1, eventSeq: 1,
    account: { status: 'ready', generation: 1, user: { userId: 'u', publicId: '0000000001', username: '甲' } },
    favorites: [], boards: [], current: null, recoveries: [],
    notifications: { cursor: 1, unreadCount: 0, pendingCount: 0, notifications: [] } }
  let rejectResponse!: (error: Error) => void
  const invoke = vi.fn((action: string) => action === 'invitation.respond'
    ? new Promise<any>((_resolve, reject) => { rejectResponse = reject })
    : Promise.resolve({ ok: true, value: state.notifications }))
  const dispose = mountResearchBoardNotifications(w.document as unknown as Document, {
    isSharedSession: () => false, getSnapshot: async () => state,
    subscribe: fn => { emit = fn; return () => {} }, invoke
  })
  try {
    await new Promise(r => setTimeout(r, 5))
    emit({ type: 'state', state: { ...state, eventSeq: 2, notifications: {
      cursor: 2, unreadCount: 1, pendingCount: 1, notifications: [{
        notificationId: 'retry-note', eventVersion: 1, type: 'invitation', boardId: 'board',
        boardTitle: '真实研究', createdAt: 1, readAt: null,
        invitation: { invitationId: 'invite', version: 3, status: 'pending' }
      }] } } })
    await new Promise(r => setTimeout(r, 5))
    const bubble = w.document.querySelector('.srb-bubble')!
    const label = decision === 'accept' ? '接受' : '拒绝'
    const action = [...bubble.querySelectorAll('button')].find(b => b.textContent === label)!
    action.click()
    expect(action.textContent).toBe(decision === 'accept' ? '加入中…' : '处理中…')
    expect(action.disabled).toBe(true)
    rejectResponse(Error('网络暂时不可用'))
    await new Promise(r => setTimeout(r, 5))
    expect(action.textContent).toBe(label)
    expect(action.disabled).toBe(false)
    expect(bubble.querySelector('[role=status]')?.textContent).toBe('网络暂时不可用')
    action.click()
    expect(invoke.mock.calls.filter(([action]) => action === 'invitation.respond')).toHaveLength(2)
    expect(invoke).toHaveBeenLastCalledWith('invitation.respond', { invitationId: 'invite', version: 3, decision })
    rejectResponse(Error('仍然离线'))
    await new Promise(r => setTimeout(r, 5))
    expect(bubble.querySelectorAll('[role=status]')).toHaveLength(1)
    expect(bubble.querySelector('[role=status]')?.textContent).toBe('仍然离线')
  } finally { dispose(); w.happyDOM.abort() }
})
