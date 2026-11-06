import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IntegrationState, PluginInstall } from '../../shared/integrations';

export const COMPUTER_USE_PLUGIN_ID = 'builtin:computer-use';
export const DEFAULT_COMPUTER_USE_PLUGIN_ID = 'builtin:computer-use-peekaboo';
export const COMPUTER_USE_PLUGINS = [
    { id: COMPUTER_USE_PLUGIN_ID, backend: 'cua', name: 'Computer Use · Cua', description: '原生控件与截图定位，可切到前台完成输入。Cua Driver 0.38.0。' },
    { id: 'builtin:computer-use-peekaboo', backend: 'peekaboo', name: 'Computer Use · Peekaboo', description: '推荐：macOS 窗口、菜单和文本操作。必要时使用前台焦点。Peekaboo 4.9.8。' },
    { id: 'builtin:computer-use-uitars', backend: 'uitars', name: 'Computer Use · UI-TARS', description: '实验：通过截图操作物理鼠标和键盘，会占用前台。拖拽和多窗口操作仍有限制。NutJS Operator 1.2.3，使用当前会话模型。' }
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
    const candidate = COMPUTER_USE_PLUGINS.find(item => item.id === pluginId)!;
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
