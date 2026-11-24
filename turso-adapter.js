function toPlainRow(columns, row) {
  if (!row) return null;
  if (!Array.isArray(columns) || !columns.length) return { ...row };
  const output = {};
  for (let index = 0; index < columns.length; index += 1) {
    output[String(typeof columns[index] === 'string' ? columns[index] : (columns[index]?.name ?? index))] = row[index];
  }
  return output;
}

function toD1Result(result) {
  const columns = result?.columns || [];
  const rows = (result?.rows || []).map(row => toPlainRow(columns, row));
  return {
    results: rows,
    success: true,
    meta: {
      changes: Number(result?.rowsAffected || 0),
      last_row_id: result?.lastInsertRowid == null ? null : String(result.lastInsertRowid)
    }
  };
}

/** Adapter for the subset of Cloudflare D1 methods used by VÉRTICE, backed by Turso HTTP API. */
export function createD1Adapter(client) {
  if (!client || typeof client.execute !== 'function') {
    throw new TypeError('Cliente Turso inválido: método execute ausente.');
  }
  function prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async first(columnName) {
        const result = await client.execute({ sql, args });
        const row = toPlainRow(result?.columns || [], result?.rows?.[0]);
        if (!row) return null;
        return typeof columnName === 'string' ? row[columnName] ?? null : row;
      },
      async all() { return toD1Result(await client.execute({ sql, args })); },
      async run() { return toD1Result(await client.execute({ sql, args })); },
      _getSql() { return sql; },
      _getArgs() { return args; }
    };
    return statement;
  }
  return {
    prepare,
    async batch(statements) {
      if (!Array.isArray(statements)) throw new TypeError('DB.batch espera uma lista de comandos.');
      if (statements.some(item => !/^\s*SELECT\b/i.test(item?._getSql?.() || ''))) {
        throw new Error('O adaptador Turso aceita somente SELECT em DB.batch; use run() para gravações.');
      }
      return Promise.all(statements.map(item => item.all()));
    }
  };
}

function encodeValue(value) {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'boolean') return { type: 'integer', value: value ? '1' : '0' };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Valor numérico não finito não pode ser enviado ao Turso.');
    return Number.isInteger(value)
      ? { type: 'integer', value: String(value) }
      : { type: 'float', value };
  }
  if (value instanceof Uint8Array) {
    let binary = '';
    for (const byte of value) binary += String.fromCharCode(byte);
    return { type: 'blob', base64: btoa(binary).replace(/=+$/g, '') };
  }
  return { type: 'text', value: String(value) };
}

function decodeValue(value) {
  if (!value || value.type === 'null') return null;
  if (value.type === 'integer') {
    const n = Number(value.value);
    return Number.isSafeInteger(n) ? n : String(value.value);
  }
  if (value.type === 'float') return value.value == null ? NaN : Number(value.value);
  if (value.type === 'text') return value.value ?? '';
  if (value.type === 'blob') {
    const binary = atob(value.base64 || '');
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  }
  throw new Error(`Tipo de resultado Turso não reconhecido: ${String(value.type)}`);
}

/** Small fetch-only Turso HTTP client: no npm package installation is required. */
export function createTursoHttpClient({ url, authToken, fetchImpl = globalThis.fetch }) {
  const rawUrl = String(url || '').trim();
  const token = String(authToken || '').trim();
  if (!rawUrl || !token) throw new Error('URL e token Turso são obrigatórios.');
  if (typeof fetchImpl !== 'function') throw new Error('Este ambiente não oferece fetch para acessar o Turso.');
  const parsedUrl = new URL(rawUrl);
  let endpoint;
  if (parsedUrl.protocol === 'libsql:' || parsedUrl.protocol === 'libsqls:') {
    endpoint = new URL(`https://${parsedUrl.host}`);
  } else if (parsedUrl.protocol === 'https:') {
    endpoint = new URL(parsedUrl.toString());
  } else {
    throw new Error('TURSO_DATABASE_URL precisa usar libsql://, libsqls:// ou https://.');
  }
  endpoint.pathname = '/v2/pipeline';
  endpoint.search = '';
  endpoint.hash = '';

  return {
    async execute({ sql, args = [] }) {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({
          baton: null,
          requests: [
            { type: 'execute', stmt: { sql: 'PRAGMA foreign_keys=ON', want_rows: false } },
            { type: 'execute', stmt: { sql: String(sql), args: args.map(encodeValue) } },
            { type: 'close' }
          ]
        })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body?.error?.message || body?.message || `Turso respondeu HTTP ${response.status}.`;
        throw new Error(String(message).slice(0, 240));
      }
      const pragma = body?.results?.[0];
      if (!pragma || pragma.type === 'error') throw new Error(String(pragma?.error?.message || 'Não foi possível habilitar as chaves estrangeiras no Turso.').slice(0, 240));
      const second = body?.results?.[1];
      if (!second) throw new Error('Resposta SQL vazia ou inválida do Turso.');
      if (second.type === 'error') throw new Error(String(second.error?.message || 'Falha SQL no Turso.').slice(0, 240));
      const result = second.response?.result;
      if (!result) throw new Error('Turso não retornou o resultado SQL esperado.');
      return {
        columns: (result.cols || []).map(column => column?.name ?? null),
        rows: (result.rows || []).map(row => row.map(decodeValue)),
        rowsAffected: Number(result.affected_row_count || 0),
        lastInsertRowid: result.last_insert_rowid ?? null
      };
    }
  };
}

