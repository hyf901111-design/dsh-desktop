import {patchPreparedAboutUpdates,PREPARED_UPDATE_UI_MARKER} from './prepared-update-ui.mjs'
function exact(source, from, to) {
  if (source.includes(to)) return source
  if (source.split(from).length !== 2) throw Error('Figma updates anchor drifted: ' + from.slice(0, 100))
  return source.replace(from, to)
}

export function patchFigmaUpdateWorkspace(source) {
  source = exact(source, 'return filesDurable;\n\t\t\t};\n\t\t\tconst publish =', 'return filesDurable && artifactsDurable;\n\t\t\t};\n\t\t\tconst publish =')
  return exact(source, 'isCollaborationGesture() {return collaborationGesture;},', `isCollaborationGesture() {return collaborationGesture;},
                async prepareForUpdate() {
                  await clipboardQueue;
                  if (collaborationGesture) throw new Error("请先完成当前拖动或缩放，再重试更新。");
                  finalizeHistoryTransaction();
                  if (!persistSnapshot()) throw new Error("研究画布保存失败，应用尚未退出。");
                },`)
}

export function patchFigmaAboutUpdates(source) {
  if (source.includes(PREPARED_UPDATE_UI_MARKER)) return patchAboutReleaseNotes(patchPreparedAboutUpdates(source))
  source = exact(source, 'const message = verifying ? t("about.verifying")', `const installCopy = { preparing: ["正在准备安装", "准备中…"], saving: ["正在保存研究状态", "保存中…"], restarting: ["正在重启应用", "重启中…"] };
            const installCopyEn = { preparing: ["Preparing installation", "Preparing…"], saving: ["Saving research state", "Saving…"], restarting: ["Restarting the app", "Restarting…"] };
            const stageCopy = (t("about.nav") === "关于" ? installCopy : installCopyEn)[update.installStage];
            const message = stageCopy ? stageCopy[0] : verifying ? t("about.verifying")`)
  source = exact(source, 'const label = verifying ? t("about.verifyingButton")', 'const label = stageCopy ? stageCopy[1] : verifying ? t("about.verifyingButton")')
  const previousUpToDate = '(update.phase === "up-to-date" || update.phase === "updated") ? t("about.upToDate")'
  source = exact(source, source.includes(previousUpToDate) ? previousUpToDate : 'update.phase === "up-to-date" ? t("about.upToDate")', previousUpToDate + '.replace(/^EWork Odyssey\\s*/, "")')
  // Figma 34 keeps the rotating update arrows; 37 uses the verification ring.
  source = exact(source, 'children: [downloading ? null : jsx("span", { className: "sherlock-about-action-icon"', 'children: [!active || downloading ? null : jsx("span", { className: "sherlock-about-action-icon"')
  source = exact(source, '"data-loading": active,', '"data-loading": verifying,')
  return patchAboutReleaseNotes(patchPreparedAboutUpdates(source))
}

function patchAboutReleaseNotes(source) {
  const ready = 'const ready = update.phase === "downloaded";'
  source = exact(source, ready, `${ready}
            const updateNotes = update.availableVersion && ["available", "downloading", "preparing", "downloaded"].includes(update.phase)
              ? window.sherlockAbout?.getUpdateReleaseNotes?.(update.releaseNotes) ?? []
              : [];`)
  const history = 'jsxs("section", { className: "sherlock-about-changelog", children:'
  return exact(source, history, `updateNotes.length ? jsxs("details", {
              key: update.availableVersion, open: true, className: "sherlock-about-release", "data-about-update-notes": true,
              children: [
                jsx("summary", { children: chinese ? \`\${update.availableVersion} 更新内容\` : \`What's new in \${update.availableVersion}\` }),
                jsxs("div", { className: "sherlock-about-release-content", children: updateNotes.map((block, index) =>
                  block.kind === "list"
                    ? jsx("ul", { className: "sherlock-about-release-items", children: block.items.map((item, i) => jsx("li", { children: item }, i)) }, index)
                    : jsx("p", { children: block.text }, index)
                ) })
              ]
            }) : null,
            ${history}`)
}
