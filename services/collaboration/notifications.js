import { liveUser, notificationsPage, flushOutbox } from './repository.js'
import { json, errorResponse, fail } from './validation.js'
export class ResearchNotifications {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
  }
  async fetch(request) {
    try {
      if (new URL(request.url).pathname === '/connect') {
        const { user } = JSON.parse(
          request.headers.get('x-collaboration-context')
        )
        await liveUser(this.env, user)
        const pair = new WebSocketPair()
        this.ctx.acceptWebSocket(pair[1])
        pair[1].serializeAttachment({ user })
        pair[1].send(
          JSON.stringify({
            type: 'welcome',
            scope: 'notifications',
            ...(await notificationsPage(this.env, user.id))
          })
        )
        await this.ctx.storage.setAlarm(Date.now() + 10000)
        this.ctx.waitUntil(flushOutbox(this.env).catch(() => {}))
        return new Response(null, { status: 101, webSocket: pair[0] })
      }
      const { userId, notification } = await request.json()
      for (const socket of this.ctx.getWebSockets()) {
        const { user } = socket.deserializeAttachment()
        try {
          await liveUser(this.env, user)
          if (user.id === userId)
            socket.send(JSON.stringify({ type: 'notification', notification }))
        } catch {
          try {
            socket.close(4003, 'LOGIN_REQUIRED')
          } catch {}
        }
      }
      return json({ ok: true })
    } catch (e) {
      return errorResponse(e)
    }
  }
  async webSocketMessage(socket, data) {
    try {
      await liveUser(this.env, socket.deserializeAttachment().user)
      if (typeof data !== 'string' || data.length > 1024)
        fail('INVALID_MESSAGE')
      const message = JSON.parse(data)
      if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }))
      else fail('UNKNOWN_MESSAGE')
    } catch (e) {
      socket.send(
        JSON.stringify({ type: 'error', ...(await errorResponse(e).json()) })
      )
      if (e.status === 401) socket.close(4003, 'LOGIN_REQUIRED')
    }
  }
  webSocketClose() {}
  webSocketError() {}
  async alarm() {
    for (const socket of this.ctx.getWebSockets())
      try {
        await liveUser(this.env, socket.deserializeAttachment().user)
      } catch {
        try {
          socket.close(4003, 'LOGIN_REQUIRED')
        } catch {}
      }
    if (this.ctx.getWebSockets().length)
      await this.ctx.storage.setAlarm(Date.now() + 10000)
  }
}
