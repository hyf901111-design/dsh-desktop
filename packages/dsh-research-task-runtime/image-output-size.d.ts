export type ImageOutputSize = {width: number; height: number}
export const ratios: Readonly<Record<'1:1' | '4:5' | '16:9', ImageOutputSize>>
export function requestedImageSize(prompt: string, explicitOnly?: boolean): ImageOutputSize | undefined
export function validImageOutputSize(width: number, height: number): boolean
export function providerSize(size: ImageOutputSize): '1536x1024' | '1024x1536' | '1024x1024'
