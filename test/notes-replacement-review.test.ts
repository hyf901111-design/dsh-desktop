import{expect,it}from'vitest'
import{replacementChange}from'../src/preload/notes/replacement-review'
import{reuseSpellingAnchors}from'../src/preload/notes/challenge-anchors'
import type{ChallengeIssue}from'../src/shared/notes-challenge'
it('paints the actual changed envelope without splitting surrogate pairs, including deletion anchors',()=>{
 expect(replacementChange('这项结论的成度较高。','这项结论的程度较高。')).toEqual({from:5,to:6})
 expect(replacementChange('a🐱b','a🐶b')).toEqual({from:1,to:3})
 expect(replacementChange('a🐱b','a🐱')).toEqual({from:1,to:3})
 expect(replacementChange('多一个字','一个字')).toEqual({from:0,to:1})
})
it('reuses a prior spelling span when an upgraded review splits its same typos, preserving independent findings',()=>{
 const make=(quote:string,category:ChallengeIssue['category']='typo',blockId='p'):ChallengeIssue=>({blockId,quote,category,message:quote+'应改正',evidence:[]})
 const input=[make('以经'),make('提胶'),make('另一个错词'),make('以经','logic'),make('以经','typo','q')]
 const result=reuseSpellingAnchors(input,[{blockId:'p',quote:'材料以经提胶',category:'typo'}])
 expect(result.map(i=>i.quote)).toEqual(['材料以经提胶','另一个错词','以经','以经']);expect(result[0]!.message).toContain('以经');expect(result[0]!.message).toContain('提胶');expect(input[0]!.quote).toBe('以经')
})
