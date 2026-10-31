import { execFile } from 'node:child_process';
import { access, readdir, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import type { LocalCliInfo, LocalCliInstallation } from '../types/dsl';
import type { CliSpec } from './cliCatalog';

const execute = promisify(execFile);
export interface ResolvedCliInfo extends LocalCliInfo { runtimePath?: string }

export function parseCliVersion(value = '') {
  const match = value.match(/(?:^|[^\d])v?(\d+)\.(\d+)\.(\d+)(?:-([\da-zA-Z.-]+))?/);
  return match ? { numbers: match.slice(1, 4).map(Number), prerelease: match[4]?.split('.') ?? [] } : null;
}

export function compareCliVersions(a = '', b = ''): number {
  const left = parseCliVersion(a), right = parseCliVersion(b);
  if (!left || !right) return Number(Boolean(left)) - Number(Boolean(right));
  for (let index = 0; index < 3; index++) {
    if (left.numbers[index] !== right.numbers[index]) return left.numbers[index] - right.numbers[index];
  }
  if (!left.prerelease.length || !right.prerelease.length) return Number(!left.prerelease.length) - Number(!right.prerelease.length);
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index++) {
    const l = left.prerelease[index], r = right.prerelease[index];
    if (l === r) continue;
    if (l === undefined || r === undefined) return l === undefined ? -1 : 1;
    const ln = /^\d+$/.test(l), rn = /^\d+$/.test(r);
    if (ln && rn) return Number(l) - Number(r);
    if (ln !== rn) return ln ? -1 : 1;
    return l.localeCompare(r);
  }
  return 0;
}

export function newestInstallation(installations: LocalCliInstallation[]) {
  // Stable sort preserves terminal/PATH preference when versions match.
  return [...installations].sort((a, b) => compareCliVersions(b.version, a.version))[0];
}

function uniquePaths(values: string[]) { return [...new Set(values.filter(Boolean))]; }

async function terminalPath(shell: string) {
  try {
    const { stdout } = await execute(shell, ['-lic', 'printf "__AGENTBOARD_PATH__%s__END__" "$PATH"'], {
      timeout: 6000, maxBuffer: 128 * 1024,
    });
    return stdout.match(/__AGENTBOARD_PATH__([\s\S]*?)__END__/)?.[1] ?? '';
  } catch { return ''; }
}

export async function discoveryDirectories(env: NodeJS.ProcessEnv = process.env, userHome = homedir()) {
  const loginPath = await terminalPath(env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh'));
  const dirs = uniquePaths([
    ...loginPath.split(delimiter), ...(env.PATH || '').split(delimiter),
    join(userHome, '.local/bin'), join(userHome, '.npm-global/bin'), join(userHome, '.bun/bin'),
    join(userHome, '.pi/agent/bin'), join(userHome, '.opencode/bin'), join(userHome, '.volta/bin'),
    join(userHome, '.asdf/shims'), join(userHome, '.local/share/mise/shims'),
    join(userHome, 'Library/pnpm'), join(userHome, '.local/share/pnpm'), env.PNPM_HOME || '',
    env.NPM_CONFIG_PREFIX ? join(env.NPM_CONFIG_PREFIX, 'bin') : '', '/opt/homebrew/bin', '/usr/local/bin',
  ]);
  for (const root of [join(userHome, '.local/share/fnm/node-versions'), join(userHome, '.nvm/versions/node')]) {
    try {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (entry.isDirectory()) dirs.push(join(root, entry.name, root.includes('/fnm/') ? 'installation/bin' : 'bin'));
      }
    } catch { /* This version manager is not installed. */ }
  }
  return uniquePaths(dirs);
}

export async function findInstallations(commands: string[], dirs: string[], versionArgs: string[], probe = probeVersion): Promise<LocalCliInstallation[]> {
  const candidates: LocalCliInstallation[] = [];
  const seen = new Set<string>();
  // Resolve files first; only execute the documented version flag for trusted CLI names.
  for (const dir of dirs) for (const command of commands) {
    const path = join(dir, command);
    try {
      await access(path, constants.X_OK);
      const resolved = await realpath(path);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      candidates.push({ path, realPath: resolved });
    } catch { /* Not an executable installation. */ }
  }
  return Promise.all(candidates.map(async candidate => ({
    ...candidate, version: await probe(candidate.path, versionArgs, uniquePaths([dirname(candidate.path), ...dirs]).join(delimiter)),
  })));
}

async function probeVersion(path: string, args: string[], runtimePath: string): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await execute(path, args, {
      timeout: 4500, maxBuffer: 64 * 1024, env: { ...process.env, PATH: runtimePath },
    });
    const lines = `${stdout}\n${stderr}`.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/);
    return lines.find(line => parseCliVersion(line))?.trim().slice(0, 160);
  } catch { return undefined; }
}

export async function discoverClis(specs: CliSpec[], directories?: string[]): Promise<ResolvedCliInfo[]> {
  const dirs = directories ?? await discoveryDirectories();
  return Promise.all(specs.map(async spec => {
    const installations = await findInstallations(spec.commands, dirs, spec.versionArgs);
    const selected = newestInstallation(installations);
    return selected ? {
      id: spec.id, name: spec.name, available: true, ...selected, installations,
      runtimePath: uniquePaths([dirname(selected.path), ...dirs]).join(delimiter),
    } : { id: spec.id, name: spec.name, available: false, installations: [] };
  }));
}

export function createCliRegistry(load: () => Promise<ResolvedCliInfo[]>, ttlMs = 30000) {
  let cached: ResolvedCliInfo[] | undefined;
  let checkedAt = 0;
  let inFlight: Promise<ResolvedCliInfo[]> | undefined;
  return {
    async get(force = false) {
      if (inFlight) return inFlight;
      if (!force && cached && Date.now() - checkedAt < ttlMs) return cached;
      inFlight = load().then(value => { cached = value; checkedAt = Date.now(); return value; }).finally(() => { inFlight = undefined; });
      return inFlight;
    },
  };
}

export type CliRegistry = ReturnType<typeof createCliRegistry>;
export function publicCliInfo(cli: ResolvedCliInfo): LocalCliInfo {
  const { runtimePath: _, ...info } = cli;
  return info;
}
