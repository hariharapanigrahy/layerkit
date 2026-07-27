import { describe, expect, it } from 'vitest';
import { sendWithRetry, type FetchLike } from '../http-client.js';
import { DEFAULT_DELIVERY_POLICY } from '../types.js';

describe('sendWithRetry', () => {
  it('fails closed on unexpected redirect responses', async () => {
    const calls: RequestInit[] = [];
    const fetchImpl: FetchLike = async (_input, init) => {
      calls.push(init ?? {});
      return new Response('redirect', {
        status: 302,
        headers: { location: 'https://example.test/login' },
      });
    };

    const result = await sendWithRetry(
      {
        url: 'https://api.example.test/events',
        method: 'POST',
        body: { event_name: 'Purchase' },
      },
      {
        policy: DEFAULT_DELIVERY_POLICY,
        fetchImpl,
        sleep: async () => {
          throw new Error('3xx responses should not retry by default');
        },
      },
    );

    expect(result).toMatchObject({
      ok: false,
      httpStatus: 302,
      errorClass: 'unknown',
      attempts: 1,
      networkCalls: 1,
      bodyText: 'redirect',
      reasonCode: 'http_302',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.redirect).toBe('manual');
  });

  it('still treats 2xx responses as successful delivery', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response('created', {
        status: 201,
        headers: { 'content-type': 'text/plain' },
      });

    const result = await sendWithRetry(
      {
        url: 'https://api.example.test/events',
        method: 'POST',
        body: { event_name: 'Purchase' },
      },
      {
        policy: DEFAULT_DELIVERY_POLICY,
        fetchImpl,
        sleep: async () => {},
      },
    );

    expect(result).toMatchObject({
      ok: true,
      httpStatus: 201,
      attempts: 1,
      networkCalls: 1,
      bodyText: 'created',
      reasonCode: 'live_http_success',
    });
  });
});
