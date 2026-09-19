import { afterEach, describe, expect, it, vi } from 'vitest';

import { API_URL, ApiError, apiFetch } from './api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('usa VITE_API_URL (ou o padrão) como base', () => {
    expect(API_URL).toMatch(/^https?:\/\//);
  });

  it('devolve o JSON tipado quando a resposta é 2xx', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { items: [], total: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ items: unknown[]; total: number }>('/clients');

    expect(result).toEqual({ items: [], total: 0 });
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/clients`, expect.any(Object));
  });

  it('transforma o erro da API em ApiError com code, status e requestId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(404, {
          error: { code: 'NOT_FOUND', message: 'Cliente não encontrado.', requestId: 'req-1' },
        }),
      ),
    );

    const promise = apiFetch('/clients/nao-existe');

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Cliente não encontrado.',
      requestId: 'req-1',
    });
  });

  it('não quebra quando o erro vem sem JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Bad Gateway', { status: 502 })),
    );

    await expect(apiFetch('/health')).rejects.toMatchObject({ status: 502, code: 'HTTP_ERROR' });
  });

  it('envia o corpo como JSON e o token no Authorization', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(201, { id: '1' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/clients', { method: 'POST', json: { name: 'Alfa' }, token: 'abc' });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBe(JSON.stringify({ name: 'Alfa' }));
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer abc');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
  });
});
