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
  if (rel === 'data/meta.json' && options?.cache === 'no-cache') {
    // simulate failure
    return { ok: false, status: 500 };
  }
  try {
    const txt = await readFile(`${ROOT}/public/${rel}`, 'utf8');
    const json = JSON.parse(txt);
    return { ok: true, status: 200, json: async () => json };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
};

globalThis.fetch = globalFetch;

// Test fallback flow
console.log('Test 2: Fallback versioning flow (meta.json 404)');
const ds = await mods.data.loadDataset();
await ds.pronto;

const metaCalls = fetchHistory.filter(h => h.url === '/data/meta.json');
assert.equal(metaCalls.length, 2, 'Should fetch meta.json twice (first failed, second fallback)');
assert.equal(metaCalls[0].cache, 'no-cache', 'First meta.json should have no-cache');
assert.equal(metaCalls[1].cache, 'force-cache', 'Second meta.json should have force-cache');

let ncmCall = fetchHistory.find(h => h.url.includes('/data/ncm.json'));
assert.ok(ncmCall, 'Should fetch ncm.json');
assert.equal(ncmCall.cache, 'force-cache', 'ncm.json should have force-cache');
assert.ok(!ncmCall.url.includes('?v='), 'ncm.json URL should NOT have version query param');

for (const req of fetchHistory) {
  assert.ok(!req.url.includes('?v='), `URL ${req.url} should NOT contain ?v= (Fallback flow)`);
}

// Test missing versao field flow (Need to restart module scope for cache, so we will use a small hack by just overwriting the mock for another test call sequence, or creating a separate file)
console.log('✓ Versioning fallback tests passed (404)');
