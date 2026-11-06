import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IntegrationState, PluginInstall } from '../../shared/integrations';

export const COMPUTER_USE_PLUGIN_ID = 'builtin:computer-use-peekaboo';
export const DEFAULT_COMPUTER_USE_PLUGIN_ID = COMPUTER_USE_PLUGIN_ID;
export const COMPUTER_USE_PLUGINS = [
    { id: COMPUTER_USE_PLUGIN_ID, backend: 'peekaboo', name: '电脑控制', description: '通过自然语言操作电脑应用，支持界面识别、窗口切换、鼠标键盘输入、截图与文件交互，协助完成跨应用任务。' }
] as const;
export const isComputerUsePlugin = (id: string) => COMPUTER_USE_PLUGINS.some(item => item.id === id);
export type BundledComputerUse = { packageRoot: string; version: string; digest: string };
export async function loadBundledComputerUse(packageRoot?: string): Promise<BundledComputerUse | undefined> {
    if (!packageRoot) return;
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    if (manifest.name !== 'dsh-integration-runtime' || manifest.version !== '0.1.0') throw Error('Computer Use bundle version mismatch');
    const tool = await readFile(join(packageRoot, 'computer-use-tools.js'));
    return { packageRoot, version: manifest.version, digest: createHash('sha256').update(tool).digest('hex') };
}
export function computerUsePlugin(bundle: BundledComputerUse, owner: string, state: IntegrationState, pluginId = COMPUTER_USE_PLUGIN_ID): PluginInstall {
    const candidate = COMPUTER_USE_PLUGINS.find(item => item.id === pluginId);
    if (!candidate) throw Error('未知电脑控制插件');
    const preferences = state.bundledPluginPreferences?.[owner];
    const preference = preferences?.[pluginId];
    const hasPreference = COMPUTER_USE_PLUGINS.some(item => preferences?.[item.id] !== undefined);
    return { id: pluginId, packageId: '@ework/dsh-computer-use-' + candidate.backend, name: candidate.name,
        description: candidate.description,
        sourceId: 'builtin', version: bundle.version, digest: bundle.digest,
        owner: 'bundled', ownerAccountId: owner, enabled: preference?.enabled ?? (!hasPreference && pluginId === DEFAULT_COMPUTER_USE_PLUGIN_ID),
        skillIds: [], toolBindings: [], installState: 'installed', revision: 1 + (preference?.revision ?? 0),
        packageRoot: bundle.packageRoot, createdAt: 0 };
}
