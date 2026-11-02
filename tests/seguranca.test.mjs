/**
 * J3: endurecimento de rotas e custo da IA. Chama o código REAL (lib/seguranca, lib/ai/config,
 * lib/ai/fallback, lib/atualizar, lib/frame-ancestors). Sem rede, sem SDK real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bearerValido, criarLimitador, ipDoCliente, validarUploadMeta, validarUploadConteudo,
  truncarTexto, compactarImposto, criarTrava, ultimosChars, MAX_UPLOAD_BYTES, MAX_TEXTO_PDF,
} from '../lib/seguranca.js';
import { getModels, getApiKey, DEFAULT_MODELS } from '../lib/ai/config.js';
import { gerarComFallback } from '../lib/ai/fallback.js';
import { tipoSchema, planoAtualizacao } from '../lib/atualizar.js';
import { montarFrameAncestors } from '../lib/frame-ancestors.mjs';

// ------------------------------------------------------------------ /api/atualizar
test('bearerValido: só aceita o token exato; sem token configurado nega tudo', () => {
  assert.equal(bearerValido('Bearer segredo', 'segredo'), true);
  assert.equal(bearerValido('bearer segredo', 'segredo'), true);
  assert.equal(bearerValido('Bearer errado', 'segredo'), false);
  assert.equal(bearerValido('segredo', 'segredo'), false);
  assert.equal(bearerValido(null, 'segredo'), false);
  assert.equal(bearerValido('Bearer ', 'segredo'), false);
  assert.equal(bearerValido('Bearer x', ''), false);
  assert.equal(bearerValido('Bearer x', undefined), false);
  assert.equal(bearerValido('Bearer ', ''), false);
});

test('tipoSchema: enum fontes|completo|reforma, ausente => completo, inválido => erro', () => {
  assert.equal(tipoSchema.safeParse(undefined).data, 'completo');
  for (const t of ['fontes', 'completo', 'reforma']) assert.equal(tipoSchema.safeParse(t).success, true);
  for (const t of ['xyz', '', 'COMPLETO', 'completo;rm -rf /']) assert.equal(tipoSchema.safeParse(t).success, false);
});

test('planoAtualizacao: reforma NÃO roda baixar_fontes; completo roda fontes + pipeline', () => {
  const nomes = (t) => planoAtualizacao(t).map((p) => p.args[0].replace('scripts/', ''));
  assert.deepEqual(nomes('fontes'), ['baixar_fontes.py']);
  assert.deepEqual(nomes('completo'), ['baixar_fontes.py', 'pipeline.py']);
  assert.deepEqual(nomes('reforma'), ['baixar_reforma.py', 'baixar_is.py', 'pipeline.py']);
  assert.ok(!nomes('reforma').includes('baixar_fontes.py'));
  for (const t of ['fontes', 'completo', 'reforma']) {
    for (const p of planoAtualizacao(t)) { assert.equal(p.cmd, 'python3'); assert.ok(p.timeoutMs > 0); }
  }
});

test('criarTrava: segunda tentativa falha até liberar', () => {
  const trava = criarTrava();
  assert.equal(trava.tentar(), true);
  assert.equal(trava.tentar(), false);
  trava.liberar();
  assert.equal(trava.tentar(), true);
});

test('ultimosChars: devolve só o final e avisa a truncagem', () => {
  assert.equal(ultimosChars('abc', 10), 'abc');
  const r = ultimosChars('x'.repeat(100) + 'FIM', 10);
  assert.ok(r.endsWith('xxxxxxxFIM'));
  assert.ok(r.includes('truncada'));
  assert.ok(r.length < 100);
});

// ------------------------------------------------------------------ rate limit
test('criarLimitador: bloqueia após o limite, informa Retry-After e recarrega com o tempo', () => {
  let t = 0;
  const lim = criarLimitador({ limite: 3, janelaMs: 60_000, agora: () => t });
  assert.equal(lim.check('a').ok, true);
  assert.equal(lim.check('a').ok, true);
  assert.equal(lim.check('a').ok, true);
  const bloqueado = lim.check('a');
  assert.equal(bloqueado.ok, false);
  assert.ok(bloqueado.retryAfter >= 1 && bloqueado.retryAfter <= 60);
  assert.equal(lim.check('b').ok, true, 'outra chave não é afetada');
  t += 21_000; // 20s por token com limite 3/min => 1 token
  assert.equal(lim.check('a').ok, true);
  assert.equal(lim.check('a').ok, false);
});

test('ipDoCliente: x-forwarded-for (1º), x-real-ip, fallback local', () => {
  const h = (o) => ({ get: (k) => o[k] ?? null });
  assert.equal(ipDoCliente(h({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' })), '1.1.1.1');
  assert.equal(ipDoCliente(h({ 'x-real-ip': '3.3.3.3' })), '3.3.3.3');
  assert.equal(ipDoCliente(h({})), 'local');
});

// ------------------------------------------------------------------ upload
test('validarUploadMeta: extensão e tamanho (5 MB => 413)', () => {
  assert.deepEqual(validarUploadMeta('nota.XML', 100), { ok: true, tipo: 'xml' });
  assert.deepEqual(validarUploadMeta('danfe.pdf', MAX_UPLOAD_BYTES), { ok: true, tipo: 'pdf' });
  const grande = validarUploadMeta('nota.xml', MAX_UPLOAD_BYTES + 1);
  assert.equal(grande.ok, false); assert.equal(grande.status, 413);
  const ext = validarUploadMeta('foto.png', 10);
  assert.equal(ext.ok, false); assert.equal(ext.status, 400);
  assert.equal(validarUploadMeta('', 10).ok, false);
});

test('validarUploadConteudo: magic bytes precisam condizer com a extensão', () => {
  const b = (s) => new Uint8Array(Buffer.from(s, 'utf8'));
  assert.equal(validarUploadConteudo('xml', b('<?xml version="1.0"?><nfeProc/>')).ok, true);
  assert.equal(validarUploadConteudo('xml', b('\uFEFF  <nfeProc/>')).ok, true, 'BOM + espaços + sem declaração');
  assert.equal(validarUploadConteudo('xml', b('%PDF-1.4')).ok, false);
  assert.equal(validarUploadConteudo('xml', b('MZ binário')).ok, false);
  assert.equal(validarUploadConteudo('pdf', b('%PDF-1.7\n...')).ok, true);
  assert.equal(validarUploadConteudo('pdf', b('<?xml ?>')).ok, false);
  assert.equal(validarUploadConteudo('pdf', b('texto qualquer')).status, 400);
});

test('truncarTexto: limita e sinaliza; texto curto passa intacto', () => {
  assert.deepEqual(truncarTexto('abc', 10), { texto: 'abc', truncado: false });
  const r = truncarTexto('x'.repeat(MAX_TEXTO_PDF + 5));
  assert.equal(r.texto.length, MAX_TEXTO_PDF);
  assert.equal(r.truncado, true);
});

test('compactarImposto: mantém ICMS/PIS/COFINS/IPI/IS/IBSCBS e remove o resto', () => {
  const imposto = {
    vTotTrib: '12.30',
    ICMS: { ICMS00: { orig: '0', CST: '00', pICMS: '18.00' } },
    PIS: { PISAliq: { CST: '01', pPIS: '1.65' } },
    COFINS: { COFINSAliq: { CST: '01', pCOFINS: '7.60' } },
    IPI: { IPITrib: { CST: '50' } },
    IBSCBS: { CST: '000' },
    II: { vII: '9' },
    ISSQN: { vISSQN: '1' },
  };
  const c = compactarImposto(imposto);
  assert.deepEqual(Object.keys(c).sort(), ['COFINS', 'IBSCBS', 'ICMS', 'IPI', 'PIS']);
  assert.equal(c.ICMS.ICMS00.CST, '00');
  assert.equal(c.PIS.PISAliq.pPIS, '1.65');
  assert.equal(compactarImposto(undefined), undefined);
  assert.equal(compactarImposto('x'), 'x');
});

// ------------------------------------------------------------------ modelo / fallback
test('getModels: lê GEMINI_MODELS (trim, sem duplicados) e cai no padrão', () => {
  assert.deepEqual(getModels(' m1 , m2,m1,, '), ['m1', 'm2']);
  assert.deepEqual(getModels(''), [...DEFAULT_MODELS]);
  assert.deepEqual(getModels(undefined), [...DEFAULT_MODELS]);
  assert.deepEqual(getModels(' , '), [...DEFAULT_MODELS]);
});

test('getApiKey: nula quando ausente ou em branco', () => {
  assert.equal(getApiKey(' abc '), 'abc');
  assert.equal(getApiKey(''), null);
  assert.equal(getApiKey('   '), null);
  assert.equal(getApiKey(undefined), null);
});

const clienteFake = (comportamentos) => {
  const chamadas = [];
  return {
    chamadas,
    models: {
      async generateContent({ model }) {
        chamadas.push(model);
        const c = comportamentos[model];
        if (c instanceof Error) throw c;
        return c;
      },
    },
  };
};

test('gerarComFallback: usa o próximo modelo quando o anterior falha ou vem vazio', async () => {
  const ai = clienteFake({ a: new Error('503'), b: { text: '' }, c: { text: 'ok-c' } });
  assert.equal(await gerarComFallback(ai, ['a', 'b', 'c'], { contents: 'x' }), 'ok-c');
  assert.deepEqual(ai.chamadas, ['a', 'b', 'c']);
});

test('gerarComFallback: para no primeiro que responde; aceita text() como função', async () => {
  const ai = clienteFake({ a: { text: () => 'ok-a' }, b: { text: 'ok-b' } });
  assert.equal(await gerarComFallback(ai, ['a', 'b'], { contents: 'x' }), 'ok-a');
  assert.deepEqual(ai.chamadas, ['a']);
});

test('gerarComFallback: todos falham => lança o ÚLTIMO erro; todos vazios => erro genérico', async () => {
  const ai = clienteFake({ a: new Error('erro-a'), b: new Error('erro-b') });
  await assert.rejects(gerarComFallback(ai, ['a', 'b'], { contents: 'x' }), /erro-b/);
  const vazio = clienteFake({ a: { text: '' } });
  await assert.rejects(gerarComFallback(vazio, ['a'], { contents: 'x' }), /Nenhum modelo respondeu/);
});

// ------------------------------------------------------------------ iframe
test('montarFrameAncestors: padrão só self; aceita origens válidas e descarta lixo', () => {
  assert.equal(montarFrameAncestors(''), "'self'");
  assert.equal(montarFrameAncestors(undefined), "'self'");
  assert.equal(montarFrameAncestors('https://a.com, https://b.com'), "'self' https://a.com https://b.com");
  assert.equal(montarFrameAncestors("https://a.com; script-src * 'unsafe-inline'"), "'self'");
  assert.equal(montarFrameAncestors('*'), "'self'", 'curinga solto é descartado');
  assert.equal(montarFrameAncestors('*.preview.app'), "'self' *.preview.app");
});
