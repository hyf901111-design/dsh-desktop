/** Temporary product setting: hide preset switching and start in Standard. */
export function patchStandardModeClient(source) {
  const start = source.indexOf('async function normalizeStandardPresetRoster('), end = source.indexOf('\n\t\t/**', start)
  if (start < 0 || end < 0) throw Error('标准模式无法定位预设默认值。')
  return source.slice(0, start) + `async function normalizeStandardPresetRoster(api, roster) {
    /* ework:standard-mode-only:v1 */
    const standard=roster.presets.find(p=>p.id==='standard');
    const error=standard&&!standard.isDefault?await writeDefaultPreset(api,'standard'):undefined;
    return {roster:{...roster,presets:standard?[{...standard,isDefault:true}]:[],authorable:false,hasDocument:false},error:error??null};
  }` + source.slice(end)
}
export function patchStandardModeRuntime(source) {
  const marker = '/* ework:standard-default:v1 */'
  if (source.includes(marker)) return source
  const before = 'get defaultId() {\n\t\treturn this.settings?.get().default ?? this.config.default;\n\t}'
  if (source.split(before).length !== 2) throw Error('标准模式无法定位运行时默认值。')
  return source.replace(before, `get defaultId() { ${marker} return 'standard'; }`)
}
