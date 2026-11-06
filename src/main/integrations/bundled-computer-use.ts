import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IntegrationState, PluginInstall } from '../../shared/integrations';

export const COMPUTER_USE_PLUGIN_ID = 'builtin:computer-use';
export type BundledComputerUse = { packageRoot: string; version: string; digest: string };
export async function loadBundledComputerUse(packageRoot?: string): Promise<BundledComputerUse | undefined> {
    if (!packageRoot) return;
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    if (manifest.name !== 'dsh-integration-runtime' || manifest.version !== '0.1.0') throw Error('Computer Use bundle version mismatch');
    const tool = await readFile(join(packageRoot, 'computer-use-tools.js'));
    return { packageRoot, version: manifest.version, digest: createHash('sha256').update(tool).digest('hex') };
}
export function computerUsePlugin(bundle: BundledComputerUse, owner: string, state: IntegrationState): PluginInstall {
    const preference = state.bundledPluginPreferences?.[owner]?.[COMPUTER_USE_PLUGIN_ID];
    return { id: COMPUTER_USE_PLUGIN_ID, packageId: '@ework/dsh-computer-use', name: 'Computer Use',
        description: '在后台打开、查看和操作应用窗口，使用独立指针，不移动你的鼠标。',
        sourceId: 'builtin', version: bundle.version, digest: bundle.digest,
        owner: 'bundled', ownerAccountId: owner, enabled: preference?.enabled ?? true,
        skillIds: [], toolBindings: [], installState: 'installed', revision: 1 + (preference?.revision ?? 0),
        packageRoot: bundle.packageRoot, createdAt: 0 };
}
