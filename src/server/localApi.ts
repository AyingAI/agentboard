import type { IncomingMessage, ServerResponse } from 'node:http';

export class LocalRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function isLocalRequest(req: IncomingMessage): boolean {
  const { host, origin, 'sec-fetch-site': fetchSite } = req.headers;
  const address = req.socket.remoteAddress;
  if (!address || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false;
  if (!host || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)) return false;
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  return !origin || origin === `http://${host}` || origin === `https://${host}`;
}

export function sendLocalJson(res: ServerResponse, status: number, value: unknown) {
  if (res.destroyed || res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}

export async function readLocalJson(req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
    throw new LocalRequestError(415, 'Content-Type must be application/json');
  }
  if (Number(req.headers['content-length']) > maxBytes) throw new LocalRequestError(413, 'Request too large');

  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) {
      req.resume();
      throw new LocalRequestError(413, 'Request too large');
    }
    chunks.push(buffer);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* Invalid JSON is a client error. */ }
  throw new LocalRequestError(400, 'Expected a JSON object');
}
