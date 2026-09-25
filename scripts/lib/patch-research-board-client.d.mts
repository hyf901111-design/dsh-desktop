export function patchResearchBoardConversation(source: string): Promise<string>
export function patchResearchBoardSidebar(source: string): string
export function patchResearchBoardSidebarTypes(source: string): string
export function installResearchBoardClientPatches(cwd?: string): Promise<void>

export function patchResearchBoardWorkspace(source: string): string
export function generationProgressOverlayPatch(source: string): string
export function canvasWheelPassThroughPatch(source: string): string
export function researchPreviewCanConsumeWheel(target: Element | null, boundary: Element, deltaX: number, deltaY: number): boolean
