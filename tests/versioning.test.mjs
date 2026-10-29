import assert from 'node:assert/strict';
import { mods } from 'ncm:libs';

const ROOT = process.cwd();
const { readFile } = await import('node:fs/promises');

let fetchHistory = [];
let mockVersion = 'abc123';

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
    if (rel === 'data/meta.json' && mockVersion !== null) {
      json.versao = mockVersion;
    }
    return { ok: true, status: 200, json: async () => json };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
};

globalThis.fetch = globalFetch;

// Test 1: Normal versioning flow
console.log('Test 1: Normal versioning flow');
const ds = await mods.data.loadDataset();
await ds.pronto;

const metaCall = fetchHistory.find(h => h.url === '/data/meta.json');
assert.ok(metaCall, 'Should fetch meta.json');
assert.equal(metaCall.cache, 'no-cache', 'meta.json should have no-cache');

const ncmCall = fetchHistory.find(h => h.url.includes('/data/ncm.json'));
assert.ok(ncmCall, 'Should fetch ncm.json');
assert.equal(ncmCall.cache, 'force-cache', 'ncm.json should have force-cache');
assert.ok(ncmCall.url.includes(`?v=${mockVersion}`), 'ncm.json URL should have version query param');

const frioCall = fetchHistory.find(h => h.url.includes('/data/ncm-frio.json'));
assert.ok(frioCall, 'Should fetch ncm-frio.json');
assert.ok(frioCall.url.includes(`?v=${mockVersion}`), 'ncm-frio.json URL should have version query param');

await mods.data.loadReforma();
const refCall = fetchHistory.find(h => h.url.includes('/data/reforma.json'));
if(refCall) assert.ok(refCall.url.includes(`?v=${mockVersion}`), 'reforma.json URL should have version query param');

await mods.data.loadErpTabela();
const erpCall = fetchHistory.find(h => h.url.includes('/data/erp-parametros.json'));
if(erpCall) assert.ok(erpCall.url.includes(`?v=${mockVersion}`), 'erp-parametros.json URL should have version query param');

// Assert ALL /data/* except /data/meta.json end with ?v=abc123
for (const req of fetchHistory) {
  if (req.url.startsWith('/data/') && req.url !== '/data/meta.json') {
     assert.ok(req.url.endsWith(`?v=${mockVersion}`), `URL ${req.url} does not end with ?v=${mockVersion}`);
  }
}

console.log('✓ Versioning tests passed');
