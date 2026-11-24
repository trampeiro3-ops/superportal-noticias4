import { createD1Adapter, createTursoHttpClient } from './turso-adapter.js';

/** Creates the VÉRTICE runtime environment for Cloudflare Pages Advanced Mode. */
export function createCloudflareEnvironment(sourceEnv = {}) {
  const env = sourceEnv || {};
  const databaseUrl = String(env.TURSO_DATABASE_URL || '').trim();
  const authToken = String(env.TURSO_AUTH_TOKEN || '').trim();

  if (!databaseUrl || !authToken) {
    throw new Error('Configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN nos segredos do Cloudflare Pages.');
  }
  if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    throw new Error('Binding ASSETS não disponível. Confira se o projeto usa Cloudflare Pages Advanced Mode.');
  }

  const client = createTursoHttpClient({ url: databaseUrl, authToken });
  return {
    ...env,
    ENVIRONMENT: env.ENVIRONMENT || 'production',
    GEMINI_MODEL: env.GEMINI_MODEL || 'gemini-3.8-flash',
    DB: createD1Adapter(client),
    ASSETS: env.ASSETS
  };
}
