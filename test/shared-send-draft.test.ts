import { expect, it } from 'vitest'
import { admitSharedDraft } from '../src/preload/shared-send-draft'
function fixture() {
 return { snapshot: {draft:'hello',draftRev:1,occurrences:[{offset:0,ref:'file'}]},
 commitSend(){this.snapshot={draft:'',draftRev:2,occurrences:[]}},
 restoreDraftState(s:any){this.snapshot={...s,draftRev:3}} }
}
it('clears synchronously and restores the exact references on failure',()=>{
 const shell=fixture(), attempt=admitSharedDraft(shell)
 expect(shell.snapshot.draft).toBe(''); expect(attempt.restore()).toBe(true)
 expect(shell.snapshot.draft).toBe('hello'); expect(shell.snapshot.occurrences).toEqual([{offset:0,ref:'file'}])
})
it('never overwrites a newer draft, even if the user cleared it again',()=>{
 const shell=fixture(), attempt=admitSharedDraft(shell)
 shell.snapshot={draft:'next',draftRev:3,occurrences:[]}
 expect(attempt.restore()).toBe(false); expect(shell.snapshot.draft).toBe('next')
 shell.snapshot={draft:'',draftRev:4,occurrences:[]};expect(attempt.restore()).toBe(false)
})
