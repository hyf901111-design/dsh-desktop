export function patchIntegrationSkillComposer(source) {
  const marker = '/* sherlock:integration-skill-composer:v1 */'
  if (source.includes(marker)) return source
  const anchor = 'const composerBlocks = new ComposerBlockRegistry();'
  if (source.split(anchor).length !== 2) throw Error('Integration skill composer anchor missing or ambiguous')
  return source.replace(anchor, `${anchor}
      ${marker}
      ctx.effect(() => {
        if (window.top !== window) return;
        return sherlockBoardsPage.installSkillComposer({sessions,inputHub,composerBlocks,researchSidebar});
      }, "Sherlock integration skill composer");`)
}
