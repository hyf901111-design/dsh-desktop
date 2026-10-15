export const PREPARED_UPDATE_UI_MARKER='/* ework:prepared-update-ui:v1 */'

/** Update the existing About surface without changing its version or history. */
export function patchPreparedAboutUpdates(source){
 const replace=(from,to)=>{if(source.includes(to))return;if(source.split(from).length!==2)throw Error('Prepared About update anchor drifted: '+from.slice(0,90));source=source.replace(from,to)}
 const current='(update.phase === "up-to-date" || update.phase === "updated") ? t("about.upToDate")'
 replace(current,current+'.replace(/^EWork Odyssey\\s*/, "")')
 if(source.includes(PREPARED_UPDATE_UI_MARKER))return source
 replace('const downloading = update.phase === "available";','const restarting = update.phase === "downloaded";\nconst downloading = update.phase === "available";')
 replace('if (!downloading) setUpdate({ ...update, phase: "checking" });','if (!downloading && !restarting) setUpdate({ ...update, phase: "checking" });')
 replace('const next = await (downloading ? window.sherlockAbout.downloadUpdate() : window.sherlockAbout.checkForUpdates());','const next = await (restarting ? window.sherlockAbout.installUpdate() : downloading ? window.sherlockAbout.downloadUpdate() : window.sherlockAbout.checkForUpdates());')
 replace('const verifying = update.phase === "downloaded" || update.phase === "installing";','const ready = update.phase === "downloaded";\nconst chinese = t("about.nav") === "关于";\nconst verifying = update.phase === "preparing" || update.phase === "installing";')
 replace('preparing: ["正在准备安装", "准备中…"]','preparing: ["正在校验并解压更新文件…", "准备中…"]')
 replace('preparing: ["Preparing installation", "Preparing…"]','preparing: ["Verifying and extracting update files…", "Preparing…"]')
 replace('const message = stageCopy ? stageCopy[0]','const message = ready ? (chinese ? "更新已准备就绪，重启即可完成更新。" : "Update ready. Restart to finish updating.") : stageCopy ? stageCopy[0]')
 replace('const label = stageCopy ? stageCopy[1]','const label = ready ? (chinese ? "重启更新" : "Restart and update") : stageCopy ? stageCopy[1]')
 replace('title: verifying ? t("about.autoRestart") : undefined','title: undefined')
 replace('"data-about-check-update": update.phase === "available" ? undefined : "true",','"data-about-check-update": update.phase === "available" || ready ? undefined : "true", "data-about-install-update": ready ? "true" : undefined,')
 return source+'\n'+PREPARED_UPDATE_UI_MARKER
}
