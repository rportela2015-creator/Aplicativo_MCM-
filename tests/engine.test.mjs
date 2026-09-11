/**
 * Testes do motor. Executam o MESMO código do app (lib/*.ts)
 * e o dataset real gerado por scripts/pipeline.py.
 *
 *   npm run typecheck && node scripts/test.mjs
 */
import assert from 'node:assert/strict';

const ROOT = process.cwd();

import { mods } from 'ncm:libs';
const { engine, param } = mods;
const loadDataset = mods.data.loadDataset;

const globalFetch = async (u) => {
  const rel = String(u).replace(/^\//, '');
  const { readFile } = await import('node:fs/promises');
  try { const txt = await readFile(`${ROOT}/public/${rel}`, 'utf8');
        return { ok: true, status: 200, json: async () => JSON.parse(txt) }; }
  catch { return { ok: false, status: 404, json: async () => null }; }
};
globalThis.fetch = globalFetch;
const ds = await loadDataset();
await ds.pronto; // garante campos frios para os testes de tributacao/catalogo

/** posição, no ranking, do primeiro candidato que casa algum prefixo (ou -1) */
function rank(res, prefixes) {
  return res.candidates.findIndex((c) => prefixes.some((pr) => c.rec.d8.startsWith(pr)));
}
function top(res, prefixes) {
  const i = rank(res, prefixes);
  return i >= 0 ? res.candidates[i].rec.ncm : null;
}

const CASES = [
  // sem peso/área de tela a NCM não fecha no 8º dígito — mas a POSIÇÃO tem de sair certa
  { q: 'notebook dell latitude 5540 i7 16gb',            p: ['8471'], why: 'posição 8471 (máquinas automáticas p/ processamento de dados)' },
  { q: 'notebook portátil 1,4 kg tela 15,6 polegadas',    p: ['8471.30'], why: '8471.30 = portátil ≤10 kg c/ teclado e tela' },
  { q: 'smartphone samsung galaxy s24 128gb',             p: ['8517.13'], why: ' Telefones inteligentes (smartphones)' },
  { q: 'camiseta masculina de algodão malha',              p: ['6109.10'], why: '6109.10.00 De algodão (malha)' },
  { q: 'cerveja pilsen lata 350ml',                        p: ['2203.00'], why: 'Cervejas de malte' },
  { q: 'copo plástico descartável para bebida',            p: ['3924', '3923', '3926'], why: 'critério material (plástico) ' },
  { q: 'papel higiênico folha dupla rolo 300m',             p: ['4818.10'], why: '4818.10.00 Papel higiênico' },
  { q: 'cadeira de escritório giratória estofada',         p: ['9401'], why: 'assentos' },
  { q: 'ar-condicionado split hi wall 12000 btus',         p: ['8415.10'], why: '8415.10 split-system' },
  { q: 'suplemento alimentar whey protein em pó',          p: ['2106.90', '0402'], why: 'preparação alimentícia / soro do leite' },
  { q: 'óleo de soja refinado garrafa 900ml',              p: ['1512', '1507', '1515'], why: 'óleos vegetais fixos' },
  { q: 'pneu radial para automóvel de passageiro',         p: ['4011.10'], why: 'pneus novos de borracha, automóveis' },
  { q: 'tênis esportivo de corrida masculino',             p: ['6404.11', '6404'], why: 'calçado com sola de borracha e parte têxtil' },
];

const out = [];
for (const c of CASES) {
  const res = engine.classify(c.q, ds, { top: 12 });
  const got = top(res, c.p.map((x) => x.replace('.', '')));
  out.push({ entrada: c.q, esperado: c.p.join('|'), obtido: got || res.candidates[0]?.rec.ncm,
    ok: !!got, score: +res.candidates[0]?.score.toFixed(3), motivo: c.why,
    rank: rank(res, c.p.map((x) => x.replace('.', ''))) + 1,
    top5: res.candidates.slice(0, 5).map((x) => x.rec.ncm).join(' '),
    diag: res.candidates.slice(0, 3).map((x) => `${x.rec.ncm} cov=${x.coverage.toFixed(2)} [${x.matched.map(m=>m.term+':'+m.where[0]).join(' ')}]`),
    conf: +engine.buildNotes(res.candidates[0], res.query, ds, res.candidates).confidence.toFixed(2) });
}
console.log('\n--- classificação (top-12, aceito = qualquer prefixo esperado) ---');
for (const o of out) {
  console.log(`${o.ok ? 'OK ' : 'XX '}#${String(o.rank).padStart(2)} conf=${String(o.conf).padEnd(4)} ${o.entrada.slice(0, 38).padEnd(40)} esperado ${String(o.esperado).padEnd(16)} top5: ${o.top5}`);
  if (!o.ok) o.diag.forEach((d) => console.log('      ' + d));
}

const fails = out.filter((o) => !o.ok);
assert.equal(fails.length, 0, `${fails.length} caso(s) fora do esperado: ` +
  fails.map((f) => `${f.entrada} → ${f.obtido} (queria ${f.esperado}; ${f.motivo})`).join(' | '));

// ------------------------------------------------------------------ casos específicos
{ // produto ambíguo de propósito: não deve ter confiança alta
  const res = engine.classify('produto variedades linha casa', ds, { top: 5 });
  const n = engine.buildNotes(res.candidates[0], res.query, ds, res.candidates);
  assert.ok(n.band !== 'alta', `descrição vaga não deveria gerar confiança alta (band=${n.band})`);
  assert.ok(n.notes.some((x) => x.id === 'insuficiente'), 'deve sinalizar descrição insuficiente');
  console.log('OK  descrição vaga → banda', n.band, '+ sinal de insuficiência');
}
{ // RGI 3(b)/conjunto deve ser detectado e anotar
  const res = engine.classify('kit presente com caneca de cerâmica e colher de aço inox', ds, { top: 5 });
  const n = engine.buildNotes(res.candidates[0], res.query, ds, res.candidates);
  assert.ok(n.notes.some((x) => x.id === 'RGI 3(b)'), 'kit deve disparar RGI 3(b)');
  assert.ok(res.query.signals.composto, 'sinal composto');
  console.log('OK  kit/composto → RGI 3(b) aplicada; top =', res.candidates[0].rec.ncm);
}
{ // nota legal do Capítulo 90 (luvas de borracha ficam fora do 90)
  const res = engine.classify('luva de borracha nitrílica para proteção hospitalar', ds, { top: 6 });
  const all = res.candidates.map((c) => c.rec.d8.slice(0, 2));
  const n = engine.buildNotes(res.candidates[0], res.query, ds, res.candidates);
  assert.ok(res.query.material === 'borracha', `matéria detectada (got=${res.query.material})`);
  assert.ok(!all.includes('90') || n.notes.some((x) => x.kind === 'Nota Legal'),
    'se o cap.90 aparecer, a nota legal de exclusão precisa estar anotada');
  console.log('OK  luva nitrílica → cap.', all[0], '| notas legais anotadas:', n.notes.filter((x) => x.kind === 'Nota Legal').length);
}
{ // código inválido não pode ser aceito
  const res = engine.classify('8471.30.99', ds, { top: 3 });
  assert.ok(!res.candidates.some((c) => c.rec.d8 === '84713099'), 'NCM inexistente não pode aparecer');
  const ok = engine.classify('8471.30.12', ds, { top: 3 });
  assert.equal(ok.candidates[0].rec.ncm, '8471.30.12');
  console.log('OK  NCM digitado: válido resolvido, inexistente rejeitado');
}
{ // tributação: laptop 8471.30.12 tem IPI 15 e CEST, conforme a fonte
  const rec = ds.byD8.get('84713012');
  assert.ok(rec, 'registro existe');
  assert.equal(rec.ipi, 15);
  assert.ok(rec.cest.length > 0, 'CEST presente');
  const tx = engine.taxes(rec, ds);
  assert.equal(tx.ipi, 15);
  console.log('OK  taxes() 8471.30.12 → IPI', tx.ipi, '| II', tx.ii, '| CEST', tx.cest[0].code);
}
{ // parametrização: Simples + ST deve puxar CSOSN 101 e CFOP 5.102
  const rec = ds.byD8.get('62046200');
  const p = param.parameterize(rec, ds, { operacao: 'interna', regime: 'simples', finalidade: 'comercializacao', st: true });
  assert.match(p.blocks[0].codigo, /CSOSN 101/, `esperava CSOSN 101, veio ${p.blocks[0].codigo}`);
  assert.equal(p.cfops[0].c, '5.102', `CFOP venda interna → ${p.cfops[0].c}`);
  const q = param.parameterize(ds.byD8.get('84713012'), ds, { operacao: 'exportacao', regime: 'real', finalidade: 'comercializacao' });
  assert.match(q.blocks[0].codigo, /000|49/);
  assert.ok(q.blocks.find((b) => b.titulo === 'PIS / COFINS').codigo.includes('02'), 'exportação desonera PIS/COFINS');
  console.log('OK  parametrização →', p.blocks[0].codigo, '/', p.cfops[0].c, 'e exportação →',
    q.blocks.find((b) => b.titulo === 'PIS / COFINS').codigo);
}
{ // checklist do Catálogo de Produtos
  const rec = ds.byD8.get('84713012');
  const list = param.catalogChecklist(rec, ds);
  assert.ok(list.length > 0, 'tem atributos');
  assert.ok(list[0].nome && list[0].nome !== list[0].code, 'nome resolvido a partir do dicionário');
  console.log('OK  catálogo →', list.length, 'atributos;', list.filter((x) => x.obrig).length, 'obrigatórios; ex:', list[0].nome);
}
{ // integridade do dataset
  assert.equal(ds.records.length, 10515, 'N de NCMs de 8 dígitos deve bater com a Tabela NCM vigente');
  assert.ok(ds.records.every((r) => /^\d{4}\.\d{2}\.\d{2}$/.test(r.ncm)), 'formato do código');
  assert.ok(ds.records.every((r) => r.path.length >= 2), 'hierarquia presente');
  assert.ok(ds.meta.validacao, 'metadados de validação gravados');
  console.log('OK  dataset íntegro:', ds.records.length, 'NCM | CEST em',
    ds.records.filter((r) => r.cest.length).length, '| com atributos',
    ds.records.filter((r) => r.attrs.length).length);
}

{ // helpers usados pela UI: hierarquia resolvida e rotulos
  const rec = ds.byD8.get('84713012');
  const path = mods.data.describePath(ds, rec);
  assert.ok(path.length >= 4, `hierarquia com pais (got ${path.length})`);
  assert.ok(path.every((p) => p.desc && p.desc.length > 2), 'todas as descricoes da cadeia resolvidas');
  assert.ok(path[0].desc.toLowerCase().includes('máquinas') || path[1].desc.toLowerCase().includes('máquina'),
    `capitulo/posicao com texto real: ${path[0].desc}`);
  assert.equal(mods.data.labelForLevel(4), 'Posição');
  assert.equal(mods.data.labelForLevel(8), 'Subitem');
  // nenhum registro pode ter path quebrado
  let quebrados = 0;
  for (const r of ds.records) { const pp = mods.data.describePath(ds, r); if (pp.some((x) => !x.desc)) quebrados++; }
  assert.equal(quebrados, 0, 'nenhuma cadeia hierarquica quebrada');
  console.log('OK  UI helpers → cadeia', path.map((p) => p.code).join('>'), '|', path[1].desc.slice(0, 44) + '…', '| rótulos ok, 0 correntes quebradas');
}
{ // atributos: indices interados devem resolver (a UI mostra nome, nao ATT_xxx)
  let comNome = 0, semNome = 0;
  for (const r of ds.records) for (const [i] of r.attrs) (ds.attrs.codigos[i] && ds.attrs.defs[ds.attrs.codigos[i]]) ? comNome++ : semNome++;
  assert.equal(semNome, 0, `${semNome} referencias de atributo sem definicao`);
  console.log('OK  atributos interados:', comNome, 'referências resolvidas, 0 órfãs');
}
{ // CEST: descricao publicada para os codigos citados
  const rec = ds.byD8.get('84713012');
  const t = engine.taxes(rec, ds);
  assert.ok(t.cest[0].code && t.cest[0].d, 'CEST com descricao oficial');
  console.log('OK  CEST detalhado →', t.cest[0].code, '·', t.cest[0].d.slice(0, 50) + '…');
}

console.log('\nTODOS OS TESTES PASSARAM ✓');
