import worker from '../cloud-functions/lib/worker.js';
import { createCloudflareEnvironment } from '../cloud-functions/lib/cloudflare-adapter.js';

const encoder = new TextEncoder();

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left ?? ''));
  const b = encoder.encode(String(right ?? ''));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

async function runProtectedCron(request, sourceEnv) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido. Use POST.' }, 405);
  }
  const expected = String(sourceEnv.CRON_SECRET || '');
  if (expected.length < 32) {
    return jsonResponse({ error: 'CRON_SECRET não configurado ou muito curto.' }, 503);
  }

  const body = await request.json().catch(() => null);
  if (!body || !constantTimeEqual(body.secret, expected)) {
    return jsonResponse({ error: 'Acesso não autorizado.' }, 401);
  }

  try {
    const env = createCloudflareEnvironment(sourceEnv);
    const pending = [];
    await worker.scheduled({ scheduledTime: Date.now(), cron: 'manual-api' }, env, {
      waitUntil(promise) { pending.push(Promise.resolve(promise)); }
    });
    await Promise.all(pending);
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('[VÉRTICE Cloudflare Cron]', error?.message || 'Falha na automação.');
    return jsonResponse({ error: 'Não foi possível executar a rotina automática.' }, 503);
  }
}

export default {
  async fetch(request, sourceEnv) {
    const url = new URL(request.url);
    if (url.pathname === '/api/cron') {
      return runProtectedCron(request, sourceEnv || {});
    }

    try {
      const env = createCloudflareEnvironment(sourceEnv || {});
      return await worker.fetch(request, env);
    } catch (error) {
      console.error('[VÉRTICE Cloudflare]', error?.message || 'Falha ao iniciar o backend.');
      return jsonResponse({
        error: 'Backend do VÉRTICE indisponível ou ainda não configurado.',
        help: 'Confira TURSO_DATABASE_URL, TURSO_AUTH_TOKEN e o binding ASSETS nas configurações do Cloudflare Pages.'
      }, 503);
    }
  }
};
