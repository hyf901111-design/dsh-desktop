import { validateComponentMessage } from '../../packages/dsh-research-collaboration/component-state.js'

// One fenced executor per component. Inputs are durable until included in an
// accepted snapshot; takeover replays only unacknowledged inputs. No board undo
// entries, document rewrites, or interaction-log growth for simulation ticks.
export class ComponentRooms {
  constructor(storage, now = Date.now) { this.storage = storage; this.now = now; this.rooms = new Map() }
  async receive(m, actor) {
    validateComponentMessage(m)
    const key = `component:${actor.epoch}:${m.nodeId}`
    let r = this.rooms.get(key)
    if (!r || r.version !== m.version) {
      if (!r && this.rooms.size >= 64) {
        for (const [id, room] of this.rooms) if (![...room.peers.values()].some(p => this.now()-p.seenAt<=15000 && p.alive())) this.rooms.delete(id)
        if (this.rooms.size >= 64) throw Error('COMPONENT_ROOM_LIMIT')
      }
      const saved = await this.storage.get(key)
      r = { version: m.version, peers: new Map(), token: '', host: null,
        record: saved?.version === m.version ? saved : { version: m.version, state: null, revision: 0, pending: [], accepted: {} } }
      this.rooms.set(key, r)
    }
    const now = this.now()
    for (const [id, p] of r.peers) if (now - p.seenAt > 15000 || !p.alive()) r.peers.delete(id)
    const old = r.peers.get(m.peerId)
    if (old && (old.connection !== actor.connection || old.userId !== actor.userId)) throw Error('COMPONENT_PEER_CONFLICT')
    if (m.op === 'join' && !old && r.peers.size >= 64) throw Error('COMPONENT_PARTICIPANT_LIMIT')
    if (m.op === 'join') r.peers.set(m.peerId, { ...actor, seenAt: now, windowAt: old?.windowAt ?? now, count: old?.count ?? 0 })
    else if (!old) throw Error('COMPONENT_JOIN_REQUIRED')
    else if (m.op === 'leave') r.peers.delete(m.peerId)
    else {
      old.seenAt = now
      if (!actor.canWrite) throw Error('ACCESS_DENIED')
      if (now - old.windowAt >= 1000) { old.windowAt = now; old.count = 0 }
      if (++old.count > 40) throw Error('COMPONENT_RATE_LIMIT')
    }
    // A role downgrade is effective even if this peer has not rejoined yet.
    if (r.peers.has(m.peerId)) r.peers.get(m.peerId).canWrite = actor.canWrite
    const previousHost = r.host
    if (!r.host || !r.peers.get(r.host)?.canWrite) r.host = [...r.peers].find(([, p]) => p.canWrite)?.[0] ?? null
    if (previousHost !== r.host) r.token = crypto.randomUUID()
    let changed = previousHost !== r.host
    if (m.op === 'input') {
      for (const [id, cursor] of Object.entries(r.record.accepted)) {
        if (now-cursor.at>3600000 && !r.peers.has(id) && !r.record.pending.some(input=>input.peerId===id)) delete r.record.accepted[id]
      }
      const accepted = r.record.accepted[m.peerId]?.sequence || 0
      if (m.sequence > accepted) {
        if (m.sequence !== accepted + 1) throw Error('COMPONENT_INPUT_SEQUENCE')
        if (!accepted && Object.keys(r.record.accepted).length >= 256) throw Error('COMPONENT_PARTICIPANT_LIMIT')
        if (r.record.pending.length >= 128) throw Error('COMPONENT_INPUT_QUEUE_FULL')
        const input = { id: m.inputId, peerId: m.peerId, payload: m.payload, userId: actor.userId }
        if (new TextEncoder().encode(JSON.stringify([...r.record.pending, input])).length > 40000) throw Error('COMPONENT_INPUT_QUEUE_FULL')
        const next = { ...r.record, pending: [...r.record.pending, input], accepted: { ...r.record.accepted, [m.peerId]: {sequence:m.sequence,at:now} } }
        await this.storage.put(key, next)
        r.record = next
      }
      await actor.send({ type: 'component', nodeId: m.nodeId, version: m.version, peerId: m.peerId, kind: 'receipt', accepted: r.record.accepted[m.peerId]?.sequence || 0 })
    } else if (m.op === 'commit') {
      if (r.host !== m.peerId || m.token !== r.token || m.revision !== r.record.revision + 1) { await this.status(r, m); return }
      // Acknowledge only the prefix actually delivered, so an executor cannot
      // accidentally skip somebody else's queued action.
      if (m.ack.some((id, i) => r.record.pending[i]?.id !== id)) throw Error('INVALID_COMPONENT_ACK')
      const next = { ...r.record, state: m.state, revision: m.revision,
        pending: r.record.pending.slice(m.ack.length) }
      await this.storage.put(key, next)
      r.record = next
      changed = true
    }
    if (changed) await Promise.all([...r.peers.keys()].map(peerId => this.status(r, { ...m, peerId })))
    else if (m.op === 'join') await this.status(r, m)
    const host = r.peers.get(r.host)
    if (host && r.record.pending.length) await host.send({ type: 'component', nodeId: m.nodeId, version: m.version, peerId: r.host, kind: 'inputs', token: r.token, inputs: r.record.pending })
  }
  status(r, m) {
    return r.peers.get(m.peerId)?.send({ type: 'component', nodeId: m.nodeId, version: m.version, peerId: m.peerId, kind: 'snapshot',
      token: r.token, isHost: r.host === m.peerId, readOnly: !r.peers.get(m.peerId).canWrite,
      state: r.record.state, revision: r.record.revision, accepted: r.record.accepted[m.peerId]?.sequence || 0 })
  }
}
