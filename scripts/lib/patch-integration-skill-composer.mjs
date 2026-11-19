export function patchIntegrationSkillComposer(source) {
  source=source.replace('/* ework:skill-command-registration:v1 */','/* ework:skill-command-registration:v2 */')
    .replace('ctx.inject(["commandUi"], scope => scope.effect(() => {','ctx.inject(["commandUi","inputTriggers"], scope => scope.effect(() => {')
    .replace('installSkillCommand({command:scope.get("commandUi"),sessions})','installSkillCommand({command:scope.get("commandUi"),inputTriggers:scope.get("inputTriggers"),sessions})')
  // Skill selection must not suppress the automatic board context.
  source=source.replace('(shellSnapshot?.occurrences?.length ?? 0) === 0 && shellSnapshot?.researchContextOptOut', '(shellSnapshot?.occurrences?.filter(o=>o.source!=="ework-managed-skill").length ?? 0) === 0 && shellSnapshot?.researchContextOptOut')
  const sharedMarker='/* ework:shared-skill-reference:v1 */'
  if(!source.includes(sharedMarker)&&source.includes('sharedSubmit: (mode) => {')){
    const start=source.indexOf('sharedSubmit: (mode) => {'),end=source.indexOf('sharedDraft:',start)
    let part=source.slice(start,end)
    const anchor='const refs = []; let text = "", cursor = 0;'
    if(!part.includes(anchor))throw Error('Shared skill reference anchor drifted')
    part=part.replace(anchor,`${sharedMarker}\nconst submitDraft = (draftState) => {\n${anchor}`)
      .replaceAll('shell.snapshot.occurrences','draftState.occurrences').replaceAll('shell.snapshot.draft','draftState.draft')
    const finish='return true;\n                    },'
    if(!part.includes(finish))throw Error('Shared skill submission anchor drifted')
    part=part.replace(finish,`return true;\n};
const before=shell.snapshot;
if(before.occurrences.some(o=>o.source==="ework-managed-skill")){
 const controller=new AbortController();
 void sherlockBoardsPage.serializeSharedSkillDraft(before,(source,ref)=>this.controller(actx).serializeReference(source,ref,controller.signal)).then(draftState=>{
  if(shell.disposed||shell.snapshot.draftRev!==before.draftRev||sessions.list.getSnapshot().current!==id){shell.notify("error","草稿或对话已变化，原输入已保留，请重新发送。");return;}
  submitDraft(draftState);
 },error=>{controller.abort();shell.notify("error",error.message||"技能暂不可用，原输入已保留。");});
}else submitDraft(before);
return true;\n                    },`)
    source=source.slice(0,start)+part+source.slice(end)
  }
  const commandMarker = '/* ework:skill-command-registration:v2 */'
  if (!source.includes(commandMarker)) {
    const anchor='const composerBlocks = new ComposerBlockRegistry();'
    if(source.split(anchor).length!==2)throw Error('Skill command registration anchor missing or ambiguous')
    source=source.replace(anchor,`${anchor}\n${commandMarker}\nctx.inject(["commandUi","inputTriggers"], scope => scope.effect(() => {
      if(window.top !== window)return;
      return sherlockBoardsPage.installSkillCommand({command:scope.get("commandUi"),inputTriggers:scope.get("inputTriggers"),sessions});
    }, "EWork slash skill picker"));`)
  }
  source = source.replace('installHomeOperationsNavigation({sessions,workspaces,inputHub,composerBlocks})', 'installHomeOperationsNavigation({sessions,workspaces,inputHub,composerBlocks,chatStore})')
  const navigationMarker = '/* sherlock:home-operations-navigation:v1 */'
  if (!source.includes(navigationMarker)) {
    const anchor = 'const composerBlocks = new ComposerBlockRegistry();'
    if (source.split(anchor).length !== 2) throw Error('Home operations navigation anchor missing or ambiguous')
    source = source.replace(anchor, `${anchor}
      ${navigationMarker}
      if (typeof workspaces !== "undefined") ctx.effect(() => {
        if (window.top !== window) return;
        return sherlockBoardsPage.installHomeOperationsNavigation({sessions,workspaces,inputHub,composerBlocks,chatStore,
          preferredWorkspace:()=>window[Symbol.for('sherlock:pending-conversation')]?.getManualWorkspace(),
          standaloneDirectory:()=>window.dshDesktop.standaloneConversationDirectory()});
      }, "Sherlock home operations navigation");`)
  }
  const marker = '/* sherlock:integration-skill-composer:v2 */'
  const legacy = `/* sherlock:integration-skill-composer:v1 */
      ctx.effect(() => {
        if (window.top !== window) return;
        return sherlockBoardsPage.installSkillComposer({sessions,inputHub,composerBlocks,researchSidebar});
      }, "Sherlock integration skill composer");`
  const current = `${marker}
      ctx.effect(() => {
        if (window.top !== window) return;
        return sherlockBoardsPage.installSkillComposer({sessions,inputHub,composerBlocks,researchSidebar,
          activeInput:(sessionId,ordinary)=>document.body.dataset.workspaceSurface==='notes'?eworkActiveInput(sessionId,ordinary):ordinary});
      }, "Sherlock integration skill composer");`
  const installed = source.match(/\/\* sherlock:integration-skill-composer:v[^*]*\*\//g) ?? []
  if (installed.length) {
    if (installed.length !== 1 || source.split('"Sherlock integration skill composer"').length !== 2) throw Error('Integration skill composer duplicate or unknown installation')
    const expected = installed[0] === marker ? current : installed[0] === '/* sherlock:integration-skill-composer:v1 */' ? legacy : null
    if (!expected || source.split(expected).length !== 2) throw Error('Integration skill composer installed source drifted')
    return expected === current ? source : source.replace(expected, current)
  }
  if (source.includes('Sherlock integration skill composer')) throw Error('Integration skill composer unmarked installation')
  const anchor = 'const composerBlocks = new ComposerBlockRegistry();'
  if (source.split(anchor).length !== 2) throw Error('Integration skill composer anchor missing or ambiguous')
  return source.replace(anchor, `${anchor}\n      ${current}`)
}
