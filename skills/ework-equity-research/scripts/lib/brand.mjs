import {readFileSync} from 'node:fs'
// Trusted bundled artwork only. Report metadata cannot select a logo path.
export const officialLogo=readFileSync(new URL('../../assets/ework-odyssey-logo.svg',import.meta.url),'utf8').trim()
