import { handleRequest, cleanup } from './http.js'
export { ResearchBoardRoom } from './room.js'
export { ResearchNotifications } from './notifications.js'
export default {
  fetch: handleRequest,
  scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanup(env))
  }
}
