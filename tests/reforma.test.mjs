/**
 * Reforma Tributária do Consumo: as tabelas exibidas têm de ser exatamente as oficiais
 * (dados abertos da Calculadora/RFB) e o motor de sugestão não pode inventar código.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mods } from 'ncm:libs';

globalThis.fetch = async (u) => {
  const rel = String(u).replace(/^\//, '');
  try {
    const t = await readFile(`${process.cwd()}/public/${rel}`, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(t) };
  } catch { return { ok: false, status: 404, json: async () => null }; }
};

const ds = await mods.data.loadDataset();
await ds.pronto;
const rf = await mods.data.loadReforma();

const t = (nome, fn) => { try { fn(); console.log(`OK  ${nome}`); } catch (e) { console.log(`XX  ${nome}\n    ${e.message}`); process.exit(1); } };

t('tabela oficial carregada: 18 CSTs e 164 cClassTrib, todos com o prefixo do próprio CST', () => {
  assert.ok(rf, 'reforma.json não foi publicado — rode npm run build:reforma && npm run build:dados');
  assert.equal(rf.cst.length, 18, `esperava 18 CSTs, vieram ${rf.cst.length}`);
  assert.equal(rf.classificacoes.length, 164, `esperava 164 cClassTrib, vieram ${rf.classificacoes.length}`);
  const ruins = rf.classificacoes.filter((c) => !c.c.startsWith(c.cst));
  assert.equal(ruins.length, 0, `cClassTrib fora do CST: ${ruins.slice(0, 3).map((x) => `${x.c}/${x.cst}`)}`);
  assert.equal(new Set(rf.classificacoes.map((c) => c.c)).size, 164, 'cClassTrib duplicado');
});

t('cada cClassTrib tem fundamentação da LC 214/2025 com a norma citada', () => {
  const com = rf.classificacoes.filter((c) => (rf.fundamentacoes[c.c]?.t || '').length > 20);
  assert.ok(com.length >= 160, `só ${com.length}/164 têm texto de base legal`);
  assert.match(rf.fundamentacoes['000001'].ref, /IBS|CBS/, 'sem o trecho da lei');
  assert.equal(rf.fundamentacoes['000001'].lbl, 'Regra Geral', 'etiqueta da base legal');
  const link = rf.fundamentacoes['000001'].ref || '';
  assert.ok(/LC 214|Lei Complementar/i.test(link + rf.fundamentacoes['000001'].tc),
    'sem referência normativo-visível');
});

t('alíquotas de referência da transição (fonte oficial, não chutadas)', () => {
  assert.equal(rf.aliquotas['2026'].uniao, 0.9, 'CBS 2026 deve ser 0,9% (fase de teste)');
  assert.deepEqual(rf.aliquotas['2026'].uf, [0.1], 'IBS-UF 2026 deve ser 0,1% em todas as UFs');
  assert.equal(rf.aliquotas['2027'].uniao, 8.4, 'CBS 2027 deve ser 8,4%');
  assert.equal(rf.aliquotas['2027'].uf[0], 0.05, 'IBS-UF 2027 deve ser 0,05%');
  assert.equal(rf.aliquotas['2027'].uf_por.PR, 0.05, 'PR 2027');
  assert.ok(rf.transicao.cbs_destino.length >= 6, 'falta a tabela de destinação da CBS');
  assert.equal(rf.transicao.cbs_destino[0].valor, 0, 'em 2026 a arrecadação da CBS ainda é 100% da União');
});

const PARAM = { operacao: 'interna', regime: 'presumido', finalidade: 'comercializacao' };

t('NCM tributada integralmente → candidata 000001 com o nome oficial', () => {
  const rec = ds.byD8.get('84713012');
  const s = mods.reforma.sugerirReforma(rf, rec, PARAM, 2026, 'notebook 1,4 kg tela 14 pol');
  const alvo = s.cbsibs.find((x) => x.codigo === '000001');
  assert.ok(alvo, `topo: ${s.cbsibs.slice(0, 3).map((x) => x.codigo)}`);
  assert.equal(alvo.cst, '000');
  assert.match(alvo.cstNome, /Tributa/i);
  assert.match(alvo.descricao, /integralmente/i);
});

t('sem evidência de cenário, a sugestão é só a regra geral 000001 (nada de código de nicho)', () => {
  const rec = ds.byD8.get('22030000');
  const prm = mods.param.parameterize(rec, ds, { operacao: 'interna', regime: 'presumido', finalidade: 'comercializacao' });
  const cst = (/CST (\d\d)/.exec(prm.blocks.find((b) => /PIS/.test(b.titulo))?.codigo || '') || [])[1];
  const s = mods.reforma.sugerirReforma(rf, rec, { operacao: 'interna', regime: 'presumido', finalidade: 'comercializacao' },
                                        2026, 'cerveja pilsen lata 350ml', { cst });
  assert.deepEqual(s.cbsibs.map((x) => x.codigo), ['000001'], `candidatas: ${s.cbsibs.map((x) => x.codigo)}`);
  assert.equal(s.fundamentos[0].lbl, 'Regra Geral', 'fundamentação tem de trazer a etiqueta oficial');
  assert.equal(s.is.tributa, true, 'cerveja tem IS na tabela oficial de 2027');
});

t('exportação → candidata de imunidade/não incidência da tabela (410)', () => {
  const rec = ds.byD8.get('84713012');
  const s = mods.reforma.sugerirReforma(rf, rec, { ...PARAM, operacao: 'exportacao' }, 2026, 'notebook para exportação');
  assert.ok(s.cbsibs.some((x) => /exporta/i.test(x.descricao)), 'nenhuma candidata de exportação');
  assert.ok(s.falta.some((f) => /exporta/i.test(f)), 'falta o alerta de confirmação (câmbio/desembaraço)');
});

t('combustível → grupo monofásico 620 da tabela oficial', () => {
  const rec = ds.byD8.get('27101211') || ds.records.find((r) => r.d8.startsWith('2710'));
  const s = mods.reforma.sugerirReforma(rf, rec, PARAM, 2026, 'óleo diesel combustível S10');
  assert.ok(s.cbsibs.some((x) => x.cst === '620'), `sem 620: ${s.cbsibs.map((x) => x.cst)}`);
});

t('alimentos: avisa que a cesta básica é lista legal, não código autônomo', () => {
  const rec = ds.byD8.get('19053100');
  const s = mods.reforma.sugerirReforma(rf, rec, PARAM, 2026, 'biscoito doce recheado');
  assert.ok(s.falta.some((f) => /cesta b[a]sica|lista legal|art\. 125/i.test(f)), 'sem o alerta da lista de redução');
});

t('motor jamais propõe código que não esteja na tabela oficial', () => {
  const vistos = new Set();
  for (const rec of ds.records.slice(0, 400)) {
    const s = mods.reforma.sugerirReforma(rf, rec, PARAM, 2026, rec.desc);
    for (const c of s.cbsibs) vistos.add(c.codigo);
  }
  const validos = new Set(rf.classificacoes.map((c) => c.c));
  const fora = [...vistos].filter((c) => !validos.has(c));
  assert.equal(fora.length, 0, `códigos fora da tabela: ${fora.slice(0, 5)}`);
  assert.ok(vistos.size > 0, 'nenhuma sugestão gerada em 400 NCMs');
});

t('busca da aba de referência filtra por código, CST e palavra', () => {
  assert.ok(mods.reforma.buscarClassificacoes(rf, '410001').every((c) => c.c === '410001'), 'busca por código');
  assert.ok(mods.reforma.buscarClassificacoes(rf, '', '200').every((c) => c.cst === '200'), 'filtro por CST');
  const red = mods.reforma.buscarClassificacoes(rf, '', '', true);
  assert.ok(red.length > 0 && red.every((c) => c.red), 'filtro de redução de alíquota');
});

t('sem a tabela, o app avisa em vez de sugerir (anti-invenção)', () => {
  const s = mods.reforma.sugerirReforma(null, ds.byD8.get('84713012'), PARAM, 2026, 'notebook');
  assert.equal(s.temTabela, false);
  assert.equal(s.cbsibs.length, 0);
  assert.match(s.falta[0], /build:reforma/);
});

t('IS por NCM vem da tabela oficial quando coletado (2027)', () => {
  const fum = ds.byD8.get('24022000');
  if (fum?.is === null || fum?.is === undefined) { console.log('    (base do IS ainda parcial — nada afirmado)'); return; }
  assert.equal(fum.is, 1, 'cigarro deveria vir marcado na tabela oficial do IS');
  assert.ok(typeof fum.adv === 'number', 'falta a alíquota ad valorem');
  const note = ds.byD8.get('84713012');
  assert.equal(note.is, 0, 'notebook não é item da lista do IS');
});

t('fiação da UI: a candidata usa o CST de PIS/COFINS calculado pela parametrização', () => {
  const rec = ds.byD8.get('84713012');
  const prm = mods.param.parameterize(rec, ds, { operacao: 'interna', regime: 'presumido', finalidade: 'comercializacao' });
  const blocoPis = prm.blocks.find((b) => /PIS/.test(b.titulo));
  const cstPis = (/CST (\d\d)/.exec(blocoPis?.codigo || '') || [])[1];
  assert.equal(cstPis, '01', `CST de PIS esperado 01, veio ${cstPis}`);
  const s = mods.reforma.sugerirReforma(rf, rec, { operacao: 'interna', regime: 'presumido', finalidade: 'comercializacao' },
                                        2026, 'notebook', { cst: cstPis });
  assert.ok(s.cbsibs.length > 0 && s.cbsibs.every((x) => /^\d{6}$/.test(x.codigo)), 'candidatas malformed');
  // exportação: mesma fiação, agora com CST 02
  const prmE = mods.param.parameterize(rec, ds, { operacao: 'exportacao', regime: 'presumido', finalidade: 'comercializacao' });
  const cstE = (/CST (\d\d)/.exec(prmE.blocks.find((b) => /PIS/.test(b.titulo))?.codigo || '') || [])[1];
  assert.equal(cstE, '02');
  const sE = mods.reforma.sugerirReforma(rf, rec, { operacao: 'exportacao', regime: 'presumido', finalidade: 'comercializacao' },
                                         2026, 'notebook', { cst: cstE });
  assert.ok(sE.falta.length > 0, 'cenário de exportação tem de trazer as checagens');
});

console.log('\nREFORMA OK ✓');
