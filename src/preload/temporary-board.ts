type Store<T> = { getSnapshot(): T; subscribe(fn: () => void): () => void }
type Conversation = { blank?: boolean; running?: boolean; pending?: unknown[] }
type Canvas = { files?: unknown[]; artifacts?: unknown[] }

/** Only newly created boards are eligible; content permanently commits a draft. */
export class TemporaryBoards {
  private drafts = new Map<string, () => void>()
  constructor(private selection: Store<{ current?: string }>, private discard: (id: string) => Promise<void>, private error: (error: unknown) => void) {}
  keep(id: string): boolean {
    const off = this.drafts.get(id)
    if (!off) return false
    this.drafts.delete(id); off(); return true
  }
  track(id: string, session: Store<Conversation>, canvas: Store<Canvas>) {
    let visited = this.selection.getSnapshot().current === id
    const check = () => {
      const s = session.getSnapshot(), c = canvas.getSnapshot()
      if (s.blank === false || s.running || s.pending?.length || c.files?.length || c.artifacts?.length) { this.keep(id); return }
      const current = this.selection.getSnapshot().current
      if (current === id) visited = true
      else if (visited && s.blank === true) {
        this.keep(id)
        void this.discard(id).catch(this.error)
      }
    }
    const off = [session.subscribe(check), canvas.subscribe(check), this.selection.subscribe(check)]
    this.drafts.set(id, () => off.forEach(fn => fn()))
    check()
  }
  dispose() { for (const id of this.drafts.keys()) this.keep(id) }
}
