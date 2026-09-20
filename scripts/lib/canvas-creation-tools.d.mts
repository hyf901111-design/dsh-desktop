export function patchCanvasCreationTools(source: string): string
export function componentPlacement(rect: {left:number;top:number;width:number;height:number}, viewport:{x:number;y:number;scale:number}): {x:number;y:number;width:number;height:number;sizeMode:string}

export const creationToolsCss: string
export function marqueeScreenStyle(rect: {left:number;top:number;width:number;height:number}, root: HTMLElement | null): {left:number;top:number;width:number;height:number;'--odyssey-marquee-stroke':string}
