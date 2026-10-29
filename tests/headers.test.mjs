import assert from 'node:assert/strict';
import nextConfig from '../next.config.mjs';
import { test } from 'node:test';

test('headers()', async (t) => {
  const headers = await nextConfig.headers();

  await t.test('existe regra com has.query.v e immutable', () => {
    const immutableRule = headers.find(h =>
      h.has?.some(has => has.type === 'query' && has.key === 'v') &&
      h.headers.some(h => h.key === 'Cache-Control' && h.value.includes('immutable'))
    );
    assert.ok(immutableRule, 'Regra immutable com has.query.v não encontrada');
  });

  await t.test('nenhuma regra sem has aplica immutable', () => {
    const noHasImmutable = headers.find(h =>
      !h.has && h.headers.some(header => header.key === 'Cache-Control' && header.value.includes('immutable'))
    );
    assert.ok(!noHasImmutable, 'Encontrada regra sem `has` que aplica immutable');
  });

  await t.test('meta.json => no-cache', () => {
    const metaRule = headers.find(h => h.source === '/data/meta.json');
    assert.ok(metaRule, 'Regra de meta.json não encontrada');
    const cacheHeader = metaRule.headers.find(h => h.key === 'Cache-Control');
    assert.ok(cacheHeader && cacheHeader.value === 'no-cache', 'Cache-Control de meta.json deve ser no-cache');
  });
});
