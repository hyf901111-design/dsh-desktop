/** Figma 665:828: presentation only; retain Host commands and risk confirmation. */
export function patchFigmaPermissionMenu(source, settings = false) {
  if (settings) source = patchSlashPermissionLabels(source)
  const marker = '/* odyssey:permission-menu-description:20260912 */'
  if (source.includes(marker)) return source
  const functionName = settings ? 'PermissionRow' : 'PermissionSelect'
  const anchor = `function ${functionName}(`
  if (source.split(anchor).length !== 2) throw Error('Permission menu function drifted')
  source = source.replace(anchor, `${marker}
    function odysseyPermissionMenuLabel(id, label, chinese, fallback) {
      const descriptions = {
        'read-only': chinese ? '允许读取和分析；修改文件前需要授权。' : 'Allow reading and analysis; request approval before editing files.',
        'workspace-write': chinese ? '允许修改当前工作区中的文件。' : 'Allow editing files in the current workspace.',
        'danger-full-access': chinese ? '允许访问工作区之外的文件并执行命令。' : 'Allow access outside the workspace and command execution.'
      };
      const description = descriptions[id] ?? fallback;
      return (0, react_jsx_runtime.jsxs)('span', {className:'odyssey-permission-item',children:[
        (0, react_jsx_runtime.jsx)('span', {className:'odyssey-permission-name',children:label}),
        description && (0, react_jsx_runtime.jsx)('span', {className:'odyssey-permission-description',children:description})
      ]});
    }
    ${anchor}`)
  const before = settings
    ? 'label: settingsPermissionPresetLabel(option, t)'
    : 'label: permissionOptionLabel(option, t),\n\t\t\t\t\t...icon === void 0 ? {} : { icon }'
  const after = settings
    ? `label: odysseyPermissionMenuLabel(option.id, settingsPermissionPresetLabel(option,t), t('mode.readOnly') === '只读', option.description)`
    : `label: odysseyPermissionMenuLabel(option.value, permissionOptionLabel(option,t), t('access.mode.readOnly') === '只读', option.description)`
  if (source.split(before).length !== 2) throw Error('Permission menu label drifted')
  return source.replace(before, after)
}

function patchSlashPermissionLabels(source) {
  const marker = '/* odyssey:slash-permission-labels:v1 */'
  if (source.includes(marker)) return source

  for (const [before, after] of [
    ['function optionsOf(value, t) {', marker + '\n    function optionsOf(value, t, permissionText) {'],
    ['label: displayPermissionPreset(option.value, option.name),',
      'label: settingsPermissionPresetLabel({ id: option.value, label: displayPermissionPreset(option.value, option.name) }, permissionText),'],
    ['return Promise.resolve(optionsOf(value, t));',
      'return Promise.resolve(optionsOf(value, t, ctx.locale.bind("settings.permission")));']
  ]) {
    if (source.split(before).length !== 2) throw Error('Slash permission label drifted: ' + before)
    source = source.replace(before, after)
  }
  return source
}
