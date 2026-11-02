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

  await t.test('sem X-Frame-Options ALLOWALL em nenhuma regra', () => {
    for (const r of headers) {
      for (const h of r.headers) {
        assert.ok(!(h.key.toLowerCase() === 'x-frame-options' && /allowall/i.test(h.value)),
          `ALLOWALL encontrado em ${r.source}`);
      }
    }
  });

  await t.test("páginas têm CSP frame-ancestors 'self' e /api e /data ficam de fora", () => {
    const regra = headers.find(r => r.headers.some(h => h.key === 'Content-Security-Policy' && h.value.startsWith("frame-ancestors 'self'")));
    assert.ok(regra, 'Regra de frame-ancestors não encontrada');
    assert.ok(regra.source.includes('api/') && regra.source.includes('data/'),
      'frame-ancestors não pode sobrescrever o CSP próprio das rotas /api nem aplicar a /data');
    for (const r of headers.filter(r => r !== regra)) {
      assert.ok(!r.headers.some(h => h.key === 'Content-Security-Policy'), `CSP inesperado em ${r.source}`);
    }
  });
});
