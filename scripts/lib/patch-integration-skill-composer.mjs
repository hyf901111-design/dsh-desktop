export function patchIntegrationSkillComposer(source) {
  const commandMarker = '/* ework:skill-command-registration:v1 */'
  if (!source.includes(commandMarker)) {
    const anchor='const composerBlocks = new ComposerBlockRegistry();'
    if(source.split(anchor).length!==2)throw Error('Skill command registration anchor missing or ambiguous')
    source=source.replace(anchor,`${anchor}\n${commandMarker}\nctx.inject(["commandUi"], scope => scope.effect(() => {
      if(window.top !== window)return;
      return sherlockBoardsPage.installSkillCommand({command:scope.get("commandUi"),sessions});
    }, "EWork slash skill picker"));`)
  }
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
