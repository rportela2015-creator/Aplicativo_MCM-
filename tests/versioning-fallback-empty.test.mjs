import assert from 'node:assert/strict';
import { mods } from 'ncm:libs';

const ROOT = process.cwd();
const { readFile } = await import('node:fs/promises');

let fetchHistory = [];

const globalFetch = async (u, options) => {
  fetchHistory.push({ url: u, cache: options?.cache });
  let url = String(u);
  if (url.startsWith('/data/') || url.includes('?v=')) {
    url = url.split('?v=')[0];
  }
  const rel = url.replace(/^\//, '');
  try {
    const txt = await readFile(`${ROOT}/public/${rel}`, 'utf8');
    const json = JSON.parse(txt);
    if (rel === 'data/meta.json') {
      json.versao = ''; // empty string version
    }
    return { ok: true, status: 200, json: async () => json };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
};

globalThis.fetch = globalFetch;

// Test fallback flow for empty version
console.log('Test 3: Fallback versioning flow (empty versao string)');
const ds = await mods.data.loadDataset();
await ds.pronto;

const metaCall = fetchHistory.find(h => h.url === '/data/meta.json');
assert.ok(metaCall, 'Should fetch meta.json');

for (const req of fetchHistory) {
  assert.ok(!req.url.includes('?v='), `URL ${req.url} should NOT contain ?v= (Fallback flow empty versao)`);
}
console.log('✓ Versioning fallback tests passed (empty versao)');
