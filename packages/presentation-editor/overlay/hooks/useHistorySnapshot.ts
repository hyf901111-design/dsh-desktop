import { useSnapshotStore } from '@/store'

export default function useHistorySnapshot() {
  const history = useSnapshotStore()
  return {
    addHistorySnapshot: () => history.addSnapshot(),
    undo: () => history.unDo(),
    redo: () => history.reDo()
  }
}
