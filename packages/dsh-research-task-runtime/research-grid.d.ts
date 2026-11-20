export function createResearchGrid(): {
  metrics(width: number): {
    width: number
    step: number
    rowStep: number
    cell: number
    minColumns: number
    minRows: number
    minDraftColumns: number
    minDraftRows: number
    inset: number
    gap: number
    columns: number
  }
}
