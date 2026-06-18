import { describe, expect, it, vi } from 'vitest';
import { consumeAgentStream, parseAgentStreamLine } from '../stream';

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }));
}

describe('agent stream', () => {
  it('parses progress and result events', () => {
    expect(parseAgentStreamLine(JSON.stringify({
      type: 'progress',
      event: { type: 'tool', message: '搜索网页' },
    }))).toEqual({
      type: 'progress',
      event: { type: 'tool', message: '搜索网页' },
    });
    expect(parseAgentStreamLine('not-json')).toBeNull();
  });

  it('consumes NDJSON across arbitrary chunk boundaries', async () => {
    const onProgress = vi.fn();
    const response = streamResponse([
      '{"type":"progress","event":{"type":"connected","message":"已连接"}}\n{"type":"pro',
      'gress","event":{"type":"output","message":"正在生成","outputChars":12}}\n',
      '{"type":"result","text":"{\\"type\\":\\"dsl_patch\\"}"}\n',
    ]);

    await expect(consumeAgentStream(response, onProgress)).resolves.toBe('{"type":"dsl_patch"}');
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({
      type: 'output',
      message: '正在生成',
      outputChars: 12,
    });
  });

  it('surfaces streamed bridge errors', async () => {
    const response = streamResponse([
      '{"type":"error","message":"CLI failed"}\n',
    ]);

    await expect(consumeAgentStream(response)).rejects.toMatchObject({
      code: 'API_ERROR',
      message: 'CLI failed',
    });
  });

  it('rejects a stream without a final result', async () => {
    const response = streamResponse([
      '{"type":"progress","event":{"type":"heartbeat","message":"still running"}}\n',
    ]);

    await expect(consumeAgentStream(response)).rejects.toMatchObject({
      code: 'STREAM_ERROR',
    });
  });

  it('hides browser-internal stream errors', async () => {
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.error(new Error('BodyStreamBuffer was aborted'));
      },
    }));

    await expect(consumeAgentStream(response)).rejects.toMatchObject({
      code: 'STREAM_ERROR',
      message: '与本地 Agent 的实时连接中断。',
    });
  });
});
