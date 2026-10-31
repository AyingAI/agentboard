import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compareCliVersions, createCliRegistry, findInstallations, newestInstallation, publicCliInfo } from '../cliDiscovery';

const temporary: string[] = [];
afterEach(async () => { vi.useRealTimers(); await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe('local CLI version selection', () => {
  it('chooses a newer installation even when an older one appears first on PATH', () => {
    const selected = newestInstallation([
      { path: '/old/pi', realPath: '/old/pi', version: '0.87.1' },
      { path: '/npm-global/pi', realPath: '/package/pi', version: '1.4.0' },
    ]);
    expect(selected?.path).toBe('/npm-global/pi');
  });
  it('compares numeric versions, stable releases and prerelease identifiers', () => {
    expect(compareCliVersions('1.10.0', '1.9.99')).toBeGreaterThan(0);
    expect(compareCliVersions('codex-cli 0.166.0', 'codex-cli 0.166.0-alpha.5.1')).toBeGreaterThan(0);
    expect(compareCliVersions('v2.0.0-beta.10', 'v2.0.0-beta.2')).toBeGreaterThan(0);
    expect(compareCliVersions('2.0.0-beta', '2.0.0-beta.1')).toBeLessThan(0);
    expect(compareCliVersions('2.1.286 (Claude Code)', undefined)).toBeGreaterThan(0);
  });
  it('preserves PATH preference when versions match or are unavailable', () => {
    const a = { path: '/terminal/pi', realPath: '/terminal/pi' };
    const b = { path: '/other/pi', realPath: '/other/pi' };
    expect(newestInstallation([a, b])).toBe(a);
    expect(newestInstallation([{ ...a, version: '1.4.0' }, { ...b, version: '1.4.0' }])?.path).toBe(a.path);
  });
  it('deduplicates symlinks and probes exact executable paths containing spaces', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agentboard cli discovery ')); temporary.push(root);
    const old = join(root, 'older'), current = join(root, 'new installation'), alias = join(root, 'alias');
    for (const dir of [old, current, alias]) await mkdir(dir);
    for (const [dir, version] of [[old, '0.87.1'], [current, '1.4.0']]) {
      const path = join(dir, 'pi');
      await writeFile(path, `#!/bin/sh\nprintf '${version}\\n'\n`); await chmod(path, 0o755);
    }
    await symlink(join(current, 'pi'), join(alias, 'pi'));
    const installations = await findInstallations(['pi'], [old, current, alias], ['--version']);
    expect(installations).toHaveLength(2);
    expect(newestInstallation(installations)).toMatchObject({ path: join(current, 'pi'), version: '1.4.0' });
  });
  it('does not expose the process environment in discovery responses', () => {
    const info = publicCliInfo({ id: 'pi', name: 'Pi', available: true, path: '/bin/pi', runtimePath: '/private/tool/path' });
    expect(info.path).toBe('/bin/pi');
    expect(info).not.toHaveProperty('runtimePath');
  });
});

describe('CLI discovery refresh', () => {
  it('caches briefly and refreshes immediately on request', async () => {
    const load = vi.fn().mockResolvedValueOnce([{ id: 'pi', name: 'Pi', available: true, version: '0.87.1' }])
      .mockResolvedValueOnce([{ id: 'pi', name: 'Pi', available: true, version: '1.4.0' }]);
    const registry = createCliRegistry(load);
    expect((await registry.get())[0].version).toBe('0.87.1');
    expect((await registry.get())[0].version).toBe('0.87.1');
    expect(load).toHaveBeenCalledTimes(1);
    expect((await registry.get(true))[0].version).toBe('1.4.0');
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('shares in-flight probes and recovers after errors', async () => {
    let resolve!: (value: []) => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise<[]>(done => { resolve = done; })).mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue([]);
    const registry = createCliRegistry(load, 0);
    const first = registry.get(), second = registry.get();
    expect(load).toHaveBeenCalledTimes(1);
    resolve([]); await Promise.all([first, second]);
    await expect(registry.get(true)).rejects.toThrow('unavailable');
    await expect(registry.get(true)).resolves.toEqual([]);
  });
});
