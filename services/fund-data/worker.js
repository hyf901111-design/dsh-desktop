import { DurableObject } from 'cloudflare:workers'
import { FundCoordinator } from './coordinator.js'
import { handleRequest } from './http.js'

export class FundResearchCoordinator extends DurableObject {
  constructor(state, env) {
    super(state, env)
    this.service = new FundCoordinator(state, env)
  }
  fetch(request) { return this.service.fetch(request) }
}

export default { fetch: handleRequest }
