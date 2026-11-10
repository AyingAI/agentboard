import { getJsonCandidates } from '../agent/response';

/** Background analysis has a narrower execution profile than explicit user tasks. */
export function discoveryCliArgs(id: string): string[] | null {
  if (id === 'pi') return ['--print', '--mode', 'json', '--no-tools', '--no-mcp', '--no-extensions', '--no-skills', '--no-context-files', '--no-session'];
  if (id === 'claude') return ['-p', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands'];
  if (id === 'codex') return ['--ask-for-approval', 'never', '--disable', 'shell_tool', '--disable', 'apps', '--disable', 'multi_agent', '-c', 'web_search="disabled"', 'exec', '--sandbox', 'read-only', '--ephemeral', '--json', '--color', 'never', '-'];
  return null;
}

export function findDiscoveryJson(text: string): string | null {
  for (const candidate of getJsonCandidates(text)) {
    try { const value = JSON.parse(candidate); if (value?.type === 'discovery' && typeof value.understanding === 'string' && Array.isArray(value.discoveries)) return candidate; }
    catch { /* Wait for a complete JSON object. */ }
  }
  return null;
}
