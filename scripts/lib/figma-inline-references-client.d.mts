export interface ReferenceOccurrence { occurrenceId: string | number; offset: number }
export interface ReferenceProjection { canonical: string; marker: string | null; offset: number; text: string }
export interface ReferenceBeforeInput { value: string; start: number; end: number; inputType: string }
export function referenceMarkerForDraft(draft: string): string | null
export function projectReferenceDraft(draft: string, occurrences: readonly ReferenceOccurrence[], selectedId: string | number | null, ready?: boolean): ReferenceProjection
export function unprojectReferenceEdit(next: string, projection: ReferenceProjection, beforeInput?: ReferenceBeforeInput): string
export function patchFigmaInlineReferences(source: string): string
