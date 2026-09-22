import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { IntegrationCatalog } from '../src/main/integrations/catalog';
import { manifestDigest } from '../src/main/integrations/manifest';
const network = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../src/main/integrations/adapters/network-policy', () => ({ networkFetch: network.fetch }));
const remoteDocument = () => ({ schemaVersion: 1, entries: ['remote-research', 'remote-office'].map(id => {
    const manifest = { schemaVersion: 1, id: `team.${id}`, name: id, description: 'Team catalog fixture', version: '1.0.0', skills: [{ id: 'report', name: 'Report', description: 'Summarize approved sources', files: { 'SKILL.md': '---\nname: Report\ndescription: Summarize approved sources\n---\nCite provided sources.' } }] };
    return { id, kind: 'plugin', name: id, description: 'Installable team package', publisher: 'Team', version: '1.0.0', permissions: ['Read this skill in a conversation'], manifest, digest: manifestDigest(manifest) };
}) });
const roots: string[] = [];
afterEach(async () => { network.fetch.mockReset(); await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
it('keeps unaccepted plugin, app and skill markets empty while retaining resources and tool blueprints', async () => {
    const catalog = new IntegrationCatalog({ bundledRoot: join(process.cwd(), 'build/integration-catalog'), clientVersion: '1.0.6' });
    for (const kind of ['tool'] as const) {
        const entries = await catalog.list(kind, []);
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
            expect(entry.available).toBe(true);
            expect(entry.manifest).toBeDefined();
            expect(['research', 'office', 'developer']).toContain(entry.category);
            expect((await catalog.get(entry.id, [])).id).toBe(entry.id);
        }
    }
    for (const kind of ['plugin', 'app', 'skill'] as const) expect(await catalog.list(kind, [])).toEqual([]);
    expect((await catalog.list('tool', [])).map(entry => entry.id)).toEqual(['bundled:custom-api','bundled:remote-mcp','bundled:local-mcp']);
    for (const id of ['research-assistant', 'office-workflows', 'notion', 'google-calendar', 'weekly-summary', 'meeting-notes'])
        await expect(catalog.get(`bundled:${id}`, [])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    for (const id of ['research-report', 'weekly-summary', 'meeting-notes'])
        expect(await readFile(join(process.cwd(), 'build/integration-catalog/skills', id, 'SKILL.md'), 'utf8')).toMatch(/^---\n/);
    expect(network.fetch).not.toHaveBeenCalled();
});
it('rejects non-HTTPS, embedded credentials and untrusted remote sources before fetching', async () => {
    const catalog = new IntegrationCatalog({ bundledRoot: join(process.cwd(), 'build/integration-catalog'), clientVersion: '1.0.6' });
    for (const url of ['http://public.example/catalog.json', 'file:///etc/passwd', 'https://user:secret@example.com/catalog.json'])
        await expect(catalog.validateSource({ id: 'team', name: '团队', url, trusted: true })).rejects.toMatchObject({ code: 'NETWORK_BLOCKED' });
    await expect(catalog.validateSource({ id: 'team', name: '团队', url: 'https://example.com/catalog.json', trusted: false })).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
});
it('does not let remote IDs overwrite a bundled source entry', async () => {
    const catalog = new IntegrationCatalog({ bundledRoot: join(process.cwd(), 'build/integration-catalog'), clientVersion: '1.0.6' });
    await expect(catalog.list('plugin', [{ id: 'bundled', name: '伪装目录', url: 'https://example.com/catalog.json', trusted: true }])).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
});
it('marks a newer minimum client version unavailable without fabricating installation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'catalog-version-'));
    roots.push(root);
    const { writeFile } = await import('node:fs/promises');
    const fixture = JSON.parse(await readFile(join(process.cwd(), 'build/integration-catalog/catalog.json'), 'utf8'));
    fixture.entries[0].minClientVersion = '99.0.0';
    await writeFile(join(root, 'catalog.json'), JSON.stringify(fixture));
    const catalog = new IntegrationCatalog({ bundledRoot: root, clientVersion: '1.0.6' });
    const entry = (await catalog.list(fixture.entries[0].kind, []))[0]!;
    expect(entry.available).toBe(false);
    expect(entry.unavailableReason).toContain('99.0.0');
});
it('loads a real remote manifest, namespaces IDs, and reuses verified cached data offline', async () => {
    const cache = await mkdtemp(join(tmpdir(), 'integration-catalog-cache-'));
    roots.push(cache);
    const document = remoteDocument();
    const source = { id: 'team', name: '团队目录', url: 'https://team.example/catalog.json', trusted: true };
    network.fetch.mockResolvedValueOnce(new Response(JSON.stringify(document), { headers: { etag: 'v1' } }));
    const options = { bundledRoot: join(process.cwd(), 'build/integration-catalog'), clientVersion: '1.0.6', cacheRoot: cache };
    const catalog = new IntegrationCatalog(options);
    const entries = await catalog.list('plugin', [source]);
    expect(entries.filter(entry => entry.sourceId === 'team')).toHaveLength(2);
    expect((await catalog.get('team:remote-research', [source])).manifest).toEqual(document.entries[0]!.manifest);
    network.fetch.mockRejectedValue(new Error('offline'));
    const offline = new IntegrationCatalog(options);
    expect((await offline.get('team:remote-research', [source])).id).toBe('team:remote-research');
});
it('rejects a configured signing key when the remote catalog has no valid signature', async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const keys = generateKeyPairSync('ed25519');
    const document = remoteDocument();
    network.fetch.mockResolvedValue(new Response(JSON.stringify(document)));
    const catalog = new IntegrationCatalog({ bundledRoot: join(process.cwd(), 'build/integration-catalog'), clientVersion: '1.0.6' });
    await expect(catalog.validateSource({ id: 'signed-team', name: '签名目录', url: 'https://team.example/catalog.json', trusted: true, publicKey: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString() })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
});

it('follows bounded same-origin cursor pages and refreshes each page with its own ETag', async () => {
    const bundledRoot = join(process.cwd(), 'build/integration-catalog');
    const document = remoteDocument();
    const plugins = document.entries.filter((entry: {kind:string}) => entry.kind === 'plugin');
    const page1 = {schemaVersion:1,entries:[plugins[0]],nextCursor:'second-page'};
    const page2 = {schemaVersion:1,entries:[plugins[1]],nextCursor:null};
    const source = {id:'paged',name:'Paged',url:'https://catalog.example/catalog?kind=plugin',trusted:true};
    const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
        network.fetch.mockResolvedValueOnce(new Response(JSON.stringify(page1),{headers:{etag:'"page-1"'}}));
        network.fetch.mockResolvedValueOnce(new Response(JSON.stringify(page2),{headers:{etag:'"page-2"'}}));
        const catalog = new IntegrationCatalog({bundledRoot,clientVersion:'1.0.6'});
        expect((await catalog.list('plugin',[source])).filter(entry=>entry.sourceId==='paged')).toHaveLength(2);
        expect(String(network.fetch.mock.calls[1]![0])).toBe('https://catalog.example/catalog?kind=plugin&cursor=second-page');
        clock.mockReturnValue(now+31000);
        network.fetch.mockResolvedValueOnce(new Response(null,{status:304}));
        network.fetch.mockResolvedValueOnce(new Response(null,{status:304}));
        expect((await catalog.list('plugin',[source])).filter(entry=>entry.sourceId==='paged')).toHaveLength(2);
        expect(network.fetch.mock.calls[2]![1].headers['If-None-Match']).toBe('"page-1"');
        expect(network.fetch.mock.calls[3]![1].headers['If-None-Match']).toBe('"page-2"');
    } finally { clock.mockRestore(); }
});

it('does not cache a partial catalog when a later page fails or repeats its cursor', async () => {
    const bundledRoot = join(process.cwd(), 'build/integration-catalog');
    const document = remoteDocument();
    const page = {schemaVersion:1,entries:[document.entries[0]],nextCursor:'next'};
    const source = {id:'partial',name:'Partial',url:'https://catalog.example/catalog',trusted:true};
    const catalog = new IntegrationCatalog({bundledRoot,clientVersion:'1.0.6'});
    network.fetch.mockResolvedValueOnce(new Response(JSON.stringify(page))).mockRejectedValueOnce(new Error('page two offline'));
    await expect(catalog.list('plugin',[source])).rejects.toThrow('page two offline');
    network.fetch.mockResolvedValueOnce(new Response(JSON.stringify(page))).mockResolvedValueOnce(new Response(JSON.stringify(page)));
    await expect(catalog.list('plugin',[source])).rejects.toMatchObject({code:'INVALID_CONFIG'});
});

it('falls back to the entire previously verified multi-page catalog instead of mixing old and new pages', async () => {
    const root = await mkdtemp(join(tmpdir(),'integration-multipage-cache-')); roots.push(root);
    const bundledRoot = join(process.cwd(),'build/integration-catalog');
    const document = remoteDocument();
    const source = {id:'offline-pages',name:'Offline pages',url:'https://catalog.example/catalog',trusted:true};
    const plugins=document.entries.filter((entry:{kind:string})=>entry.kind==='plugin');
    const page1={schemaVersion:1,entries:[plugins[0]],nextCursor:'next'},page2={schemaVersion:1,entries:[plugins[1]],nextCursor:null};
    const options={bundledRoot,clientVersion:'1.0.6',cacheRoot:root};
    const now=Date.now(),clock=vi.spyOn(Date,'now').mockReturnValue(now);
    try {
        network.fetch.mockResolvedValueOnce(new Response(JSON.stringify(page1))).mockResolvedValueOnce(new Response(JSON.stringify(page2)));
        await new IntegrationCatalog(options).list('plugin',[source]);
        clock.mockReturnValue(now+31000);
        network.fetch.mockResolvedValueOnce(new Response(JSON.stringify({...page1,entries:[{...plugins[0],name:'Changed page'}]}))).mockRejectedValueOnce(new Error('offline'));
        const old=(await new IntegrationCatalog(options).list('plugin',[source])).filter(entry=>entry.sourceId===source.id);
        expect(old.map(entry=>entry.name)).toEqual(plugins.map((entry:{name:string})=>entry.name));
    } finally {clock.mockRestore()}
});

it('verifies every signed page and rejects a later unsigned page without caching the first', async () => {
    const {generateKeyPairSync,sign}=await import('node:crypto');
    const {canonicalManifestJson}=await import('../src/main/integrations/manifest');
    const keys=generateKeyPairSync('ed25519'),bundledRoot=join(process.cwd(),'build/integration-catalog');
    const bundled=remoteDocument();
    const source={id:'signed-pages',name:'Signed pages',url:'https://catalog.example/catalog',trusted:true,publicKey:keys.publicKey.export({format:'pem',type:'spki'}).toString()};
    const first={schemaVersion:1,entries:[bundled.entries[0]],nextCursor:'next'};
    const signed={...first,signature:sign(null,Buffer.from(canonicalManifestJson({schemaVersion:1,entries:first.entries})),keys.privateKey).toString('base64')};
    const second={schemaVersion:1,entries:[bundled.entries[1]],nextCursor:null};
    network.fetch.mockResolvedValueOnce(new Response(JSON.stringify(signed))).mockResolvedValueOnce(new Response(JSON.stringify(second)));
    const catalog=new IntegrationCatalog({bundledRoot,clientVersion:'1.0.6'});
    await expect(catalog.list('plugin',[source])).rejects.toMatchObject({code:'INVALID_CONFIG'});
});

it('rereads the bundled registry after withdrawal without reviving old in-memory or disk entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'catalog-withdrawal-')); roots.push(root);
    const old = remoteDocument(), file = join(root, 'catalog.json');
    await writeFile(file, JSON.stringify(old));
    const options = { bundledRoot: root, clientVersion: '1.0.6', cacheRoot: join(root, 'cache') };
    const catalog = new IntegrationCatalog(options);
    expect(await catalog.list('plugin', [])).toHaveLength(2);
    const source = { id: 'team-cache', name: 'Team cache', url: 'https://team.example/catalog.json', trusted: true };
    network.fetch.mockResolvedValueOnce(new Response(JSON.stringify(old)));
    expect(await catalog.list('plugin', [source])).toHaveLength(4);
    await writeFile(file, await readFile(join(process.cwd(), 'build/integration-catalog/catalog.json')));
    expect(await catalog.list('plugin', [])).toEqual([]);
    expect(await new IntegrationCatalog(options).list('plugin', [])).toEqual([]);
    await expect(catalog.get(`bundled:${old.entries[0]!.id}`, [])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(network.fetch).toHaveBeenCalledTimes(1);
});
