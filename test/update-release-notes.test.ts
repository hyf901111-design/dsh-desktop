import { expect, it } from 'vitest'
import { buildSherlockAboutInfo } from '../src/preload/about-info'
it.each(['zh','en'] as const)('includes both 0.9.10 and 0.9.11 in the %s About history', locale => {
 const notes=buildSherlockAboutInfo('0.9.11',locale).releaseNotes
 expect(notes.slice(0,2).map(n=>n.version)).toEqual(['0.9.11','0.9.10'])
 expect(notes[0]!.items.length).toBeGreaterThan(3)
 expect(notes[1]!.items.length).toBeGreaterThan(3)
})


it.each(['zh', 'en'] as const)('shows 1.4.0 before retained 1.3.5 history in %s', locale => {
 const current = buildSherlockAboutInfo('1.4.0', locale)
 const previous = buildSherlockAboutInfo('1.3.5', locale)
 expect(current.version).toBe('1.4.0')
 expect(current.releaseNotes.slice(0, 2).map(note => note.version)).toEqual(['1.4.0', '1.3.5'])
 expect(current.releaseNotes[0]!.date).toBe('2026-10-27')
 expect(current.releaseNotes[0]!.items).toHaveLength(17)
 expect(new Set(current.releaseNotes[0]!.items).size).toBe(17)
 expect(current.releaseNotes.slice(1)).toEqual(previous.releaseNotes)
 expect(previous.releaseNotes.some(note => note.version === '1.4.0')).toBe(false)
})

it.each(['zh', 'en'] as const)('shows 1.4.1 before the complete retained 1.4.0 history in %s', locale => {
 const current = buildSherlockAboutInfo('1.4.1', locale)
 const previous = buildSherlockAboutInfo('1.4.0', locale)
 expect(current.version).toBe('1.4.1')
 expect(current.releaseNotes.slice(0, 2).map(note => note.version)).toEqual(['1.4.1', '1.4.0'])
 expect(current.releaseNotes[0]!.date).toBe('2026-10-27')
 expect(current.releaseNotes[0]!.items).toHaveLength(10)
 expect(new Set(current.releaseNotes[0]!.items).size).toBe(10)
 expect(current.releaseNotes.slice(1)).toEqual(previous.releaseNotes)
 expect(previous.releaseNotes.some(note => note.version === '1.4.1')).toBe(false)
})
