import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This loader is shared by the desktop's artifact validation import graph.
// Keep agent/tool runtime dependencies out of this module.
const DEV_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../skills');
export function freeDataDirectory(root = process.env.DSH_BUNDLED_SKILL_DIR || DEV_ROOT) {
  const directory = join(root, 'ework-free-data-sources');
  if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()) throw Error('内置免费数据源技能不可用');
  const metadata = JSON.parse(readFileSync(join(directory, '_meta.json'), 'utf8'));
  if (metadata.slug !== 'ework-free-data-sources' || metadata.source !== 'eSkill' || !/^v\d+\.\d+\.\d+$/.test(metadata.version)) throw Error('内置免费数据源技能不可用');
  for (const file of ['references/generation.md','references/sources.json','scripts/query.mjs']) {
    const path = join(directory, file);
    if (lstatSync(path).isSymbolicLink() || !realpathSync(path).startsWith(realpathSync(directory) + '/')) throw Error('内置免费数据源技能不可用');
  }
  return directory;
}
export function freeDataInstruction(root) {
  return `【EWork 内置免费数据源】\n${readFileSync(join(freeDataDirectory(root), 'references/generation.md'), 'utf8')}`;
}
