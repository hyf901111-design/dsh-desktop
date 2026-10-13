export function sidebarUsageSnapshot(): string
export function sidebarUsageTimes(): Record<string,number>
export function recordSidebarSessionUse(id:string|undefined):void
export function subscribeSidebarUsage(listener:()=>void):()=>void
export function patchSidebarSessionExperience(source:string):string
