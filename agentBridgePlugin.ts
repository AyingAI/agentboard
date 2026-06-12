import type { Plugin } from 'vite';
import { execSync, exec } from 'child_process';
import type { IncomingMessage, ServerResponse } from 'http';

interface CliInfo {
  id: string;
  name: string;
  available: boolean;
  version?: string;
}

const KNOWN_CLIS: { id: string; name: string; check: string }[] = [
  { id: 'claude', name: 'Claude Code', check: 'which claude' },
  { id: 'opencode', name: 'OpenCode', check: 'which opencode' },
];

function detectCLIs(): CliInfo[] {
  return KNOWN_CLIS.map((cli) => {
    try {
      const path = execSync(cli.check, { stdio: 'pipe', encoding: 'utf-8' }).trim();
      let version = '';
      try {
        version = execSync(`${cli.id} --version`, { stdio: 'pipe', encoding: 'utf-8' }).trim();
      } catch {
        // version check is best-effort
      }
      return { id: cli.id, name: cli.name, available: true, version: version || path };
    } catch {
      return { id: cli.id, name: cli.name, available: false };
    }
  });
}

/** Run a CLI via stdin, return stdout */
function runCLI(cliId: string, systemPrompt: string, userMessage: string): Promise<string> {
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userMessage}`;

  return new Promise((resolve, reject) => {
    const child = exec(
      `${cliId} -p`,
      {
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf-8',
      },
      (error, stdout, stderr) => {
        if (error && !stdout) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve(stdout.trim());
      },
    );

    if (child.stdin) {
      child.stdin.write(fullPrompt);
      child.stdin.end();
    }
  });
}

/** Parse JSON body from IncomingMessage */
function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

type MiddlewareFn = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

/** Create a single middleware that handles both /api/clis and /api/agent/run */
function createApiHandler(clis: CliInfo[]): MiddlewareFn {
  return (req, res, next) => {
    const url = req.url || '';

    // GET /api/clis
    if (url === '/api/clis' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(clis));
      return;
    }

    // POST /api/agent/run
    if (url === '/api/agent/run' && req.method === 'POST') {
      handleRun(req, res, clis);
      return;
    }

    next();
  };
}

async function handleRun(req: IncomingMessage, res: ServerResponse, clis: CliInfo[]) {
  try {
    const body = await parseBody(req);
    const { cliId, systemPrompt, userMessage } = JSON.parse(body);

    if (!cliId || !systemPrompt || !userMessage) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing required fields: cliId, systemPrompt, userMessage' }));
      return;
    }

    const cli = clis.find((c) => c.id === cliId);
    if (!cli || !cli.available) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `CLI "${cliId}" is not available` }));
      return;
    }

    console.log(`[agent-bridge] Running ${cliId} (${userMessage.slice(0, 40)}...)`);
    const text = await runCLI(cliId, systemPrompt, userMessage);
    console.log(`[agent-bridge] ${cliId} → ${text.length} chars`);

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ text }));
  } catch (err) {
    console.error('[agent-bridge] Error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
}

export function agentBridgePlugin(): Plugin {
  return {
    name: 'agent-bridge',
    configureServer(server) {
      const clis = detectCLIs();
      console.log(
        '[agent-bridge] Detected CLIs:',
        clis.filter((c) => c.available).map((c) => c.name).join(', ') || 'none',
      );

      const handler = createApiHandler(clis);

      // Add to middleware stack — goes to the end
      server.middlewares.use(handler);

      // Post-setup: move our handler to the FRONT of the stack
      // so it runs before Vite's SPA HTML fallback
      return () => {
        const stack = (server.middlewares as unknown as { stack: Array<{ route: string; handle: MiddlewareFn }> }).stack;
        const idx = stack.findIndex((layer) => layer.handle === handler);
        if (idx > 0) {
          const [layer] = stack.splice(idx, 1);
          stack.unshift(layer);
          console.log('[agent-bridge] API handler moved to front of middleware stack');
        }
      };
    },
  };
}
