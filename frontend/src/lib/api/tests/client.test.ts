import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL, ApiError, apiRequest, buildUrl } from '../client';

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('apiRequest', () => {
  it('unwraps the success envelope and sends the acting organization', async () => {
    const fetchMock = respond(200, { success: true, data: [1, 2], meta: { total: 2 } });
    vi.stubGlobal('fetch', fetchMock);
    const result = await apiRequest<number[]>('/api/listings', {
      method: 'POST',
      body: { a: 1 },
      organizationId: 'org-1',
    });
    expect(result).toEqual({ data: [1, 2], meta: { total: 2 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/listings`);
    expect(init.headers['X-Organization-Id']).toBe('org-1');
    expect(init.body).toBe('{"a":1}');
  });

  it('throws ApiError with the backend code, status and request id', async () => {
    vi.stubGlobal(
      'fetch',
      respond(409, { success: false, error: { code: 'DUPLICATE_EXCHANGE', message: 'Already exists' } }, { 'x-request-id': 'rid-1' })
    );
    const error = await apiRequest('/api/exchanges', { method: 'POST', body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'DUPLICATE_EXCHANGE', status: 409, message: 'Already exists', requestId: 'rid-1' });
  });

  it('treats success:false with HTTP 200 as an error (AI fallback)', async () => {
    vi.stubGlobal('fetch', respond(200, { success: false, error: { code: 'AI_UNAVAILABLE', message: 'Not configured' } }));
    await expect(apiRequest('/api/ai/extract-material')).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('maps network failures to NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiRequest('/api/listings')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });
});

describe('buildUrl', () => {
  it('drops empty filters and the ALL sentinel, encodes the rest', () => {
    const url = new URL(buildUrl('/api/listings', { organization_id: 'ALL', search: 'a b', status: undefined, x: '' }));
    expect(url.searchParams.get('search')).toBe('a b');
    expect(Array.from(url.searchParams.keys())).toEqual(["search"]);
  });
});
