import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/auditoria-relatorio/route.js';

test('auditoria-relatorio HTML escaping through route', async (t) => {
  const req = new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify({
      format: 'html',
      parecerTecnicoXml: '<img src=x onerror=alert(1)>',
      itens: []
    })
  });
  const res = await POST(req);
  const text = await res.text();
  assert.ok(!text.includes('<img src=x onerror=alert(1)>'), 'HTML não escapado no parecerTecnicoXml');
});
