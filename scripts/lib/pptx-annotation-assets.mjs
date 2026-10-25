import {readFileSync} from 'node:fs'
const names=['mark16-normal','mark16-selected','rect14-selected','point14-normal','pin18-normal','pin18-selected','pin20-selected','pin28-normal','pin28-selected','close16']
// Build-time only: serialize the complete original SVG files, never redraw paths.
export const pptxAnnotationAssets=Object.fromEntries(names.map(name=>[name,'data:image/svg+xml;base64,'+readFileSync(new URL('../../src/preload/pptx-annotation-icons/'+name+'.svg',import.meta.url)).toString('base64')]))
export const pptxAnnotationStyle=readFileSync(new URL('../../src/preload/pptx-annotations.css',import.meta.url),'utf8')
