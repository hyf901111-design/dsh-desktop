import { randomUUID, createHash } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync
} from 'node:fs'
import { join } from 'node:path'
export function digest(v: unknown) {
  return createHash('sha256').update(JSON.stringify(v)).digest('hex')
}
export class ResearchRequestJournal {
  private value: Record<string, any> = {}
  private flights = new Map<string, Promise<any>>()
  readonly path: string
  constructor(root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 })
    this.path = join(root, 'requests.json')
    if (existsSync(this.path))
      this.value = JSON.parse(readFileSync(this.path, 'utf8'))
  }
  private save() {
    const tmp = this.path + '.tmp'
    const data = JSON.stringify(this.value)
    if (Buffer.byteLength(data) > 64 * 1024 * 1024)
      throw Error('STORAGE_UNAVAILABLE')
    writeFileSync(tmp, data, { mode: 0o600 })
    renameSync(tmp, this.path)
  }
  prepare(
    accountId: string,
    boardId: string,
    mutation: string,
    intent: unknown,
    epoch: number
  ) {
    const key = digest([accountId, boardId, mutation])
    const old = this.value[key]
    if (old && old.intentHash !== digest(intent))
      throw Error('REQUEST_ID_REUSED')
    if (!old) {
      this.value[key] = {
        accountId,
        boardId,
        mutation,
        intent,
        intentHash: digest(intent),
        epoch,
        steps: {},
        createdAt: Date.now()
      }
      this.save()
    }
    return key
  }
  get(key: string) {
    return structuredClone(this.value[key])
  }
  list(accountId: string, boardId?: string) {
    return Object.entries(this.value)
      .filter(
        ([, r]) =>
          r.accountId === accountId && (!boardId || r.boardId === boardId)
      )
      .map(([key, r]) => ({ key, ...structuredClone(r) }))
  }
  update(key: string, patch: Record<string, unknown>) {
    Object.assign(this.value[key], patch)
    this.save()
  }
  step(
    key: string,
    stepKey: string,
    action: string,
    body: Record<string, unknown>,
    send: (body: any) => Promise<any>
  ): Promise<any> {
    const leaseToken = body.leaseToken
    body = { ...body }
    delete body.leaseToken
    const flightKey = key + ':' + stepKey
    if (this.flights.has(flightKey)) return this.flights.get(flightKey)!
    const work = (async () => {
      const r = this.value[key]
      if (!r) throw Error('INVALID_REQUEST')
      let step = r.steps[stepKey]
      if (step && (step.action !== action || step.hash !== digest(body)))
        throw Error('REQUEST_ID_REUSED')
      if (step?.reply) return structuredClone(step.reply)
      if (!step) {
        step = {
          action,
          operationId: randomUUID(),
          epoch: r.epoch,
          body: structuredClone(body),
          hash: digest(body)
        }
        r.steps[stepKey] = step
        this.save()
      }
      const reply = await send({
        ...step.body,
        action,
        epoch: step.epoch,
        operationId: step.operationId,
        ...(leaseToken ? { leaseToken } : {})
      })
      if (
        reply.operationId !== step.operationId ||
        reply.action !== action ||
        !Number.isSafeInteger(reply.seq)
      )
        throw Error('INVALID_RESPONSE')
      // Claim secrets are never written into ordinary application state.
      if (action !== 'taskClaim') {
        step.reply = structuredClone(reply)
        this.save()
      }
      return reply
    })()
    this.flights.set(flightKey, work)
    void work.finally(() => this.flights.delete(flightKey)).catch(() => {})
    return work
  }
}
