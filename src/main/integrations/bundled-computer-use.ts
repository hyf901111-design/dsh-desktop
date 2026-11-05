import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IntegrationState, PluginInstall } from '../../shared/integrations';

export const COMPUTER_USE_PLUGIN_ID = 'builtin:computer-use';
export type BundledComputerUse = { packageRoot: string; version: string };
export async function loadBundledComputerUse(packageRoot?: string): Promise<BundledComputerUse | undefined> {
    if (!packageRoot) return;
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    if (manifest.name !== '@ework/dsh-computer-use' || manifest.version !== '0.1.0') throw Error('Computer Use bundle version mismatch');
    await readFile(join(packageRoot, 'lib/index.js'));
    return { packageRoot, version: manifest.version };
}
export function computerUsePlugin(bundle: BundledComputerUse, owner: string, state: IntegrationState): PluginInstall {
    const preference = state.bundledPluginPreferences?.[owner]?.[COMPUTER_USE_PLUGIN_ID];
    return { id: COMPUTER_USE_PLUGIN_ID, packageId: '@ework/dsh-computer-use', name: 'Computer Use',
        description: '在后台查看和操作应用窗口，保留你的鼠标位置；遇到不支持的操作会停止并说明原因。',
        sourceId: 'builtin', version: bundle.version, digest: '066d1c5e003a5e4776d322aff58cce74ffff0c4a2cda4de7eb6d7033adc73c9b',
        owner: 'bundled', ownerAccountId: owner, enabled: preference?.enabled ?? true,
        skillIds: [], toolBindings: [], installState: 'installed', revision: 1 + (preference?.revision ?? 0),
        packageRoot: bundle.packageRoot, createdAt: 0 };
}
