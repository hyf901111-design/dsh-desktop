import { expect, it } from 'vitest'
import { buildSherlockAboutInfo } from '../src/preload/about-info'
it.each(['zh','en'] as const)('includes both 0.9.10 and 0.9.11 in the %s About history', locale => {
 const notes=buildSherlockAboutInfo('0.9.11',locale).releaseNotes
 expect(notes.slice(0,2).map(n=>n.version)).toEqual(['0.9.11','0.9.10'])
 expect(notes[0]!.items.length).toBeGreaterThan(3)
 expect(notes[1]!.items.length).toBeGreaterThan(3)
})
