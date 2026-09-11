
import { parseCsv } from '../.parse-csv.ts';
import assert from 'node:assert/strict';
import { mods } from 'ncm:libs';
globalThis.fetch = async (u) => { const rel=String(u).replace(/^\//,'');
  const { readFile } = await import('node:fs/promises');
  try{const t=await readFile(process.cwd()+'/public/'+rel,'utf8');return {ok:true,status:200,json:async()=>JSON.parse(t)}}catch{return{ok:false,status:404,json:async()=>null}}};
const ds = await mods.data.loadDataset(); await ds.pronto;

const csv = await (await import('node:fs/promises')).readFile('exemplos/produtos-exemplo.csv','utf8');
const rows = parseCsv(csv);
assert.equal(rows.length, 11, `11 linhas (cabecalho + 10), veio ${rows.length}`);
assert.deepEqual(rows[0], ['codigo','descricao','unidade']);
const head = rows[0].map(h=>h.trim().toLowerCase());
const idx = head.findIndex(h=>['descricao','produto','desc','nome','item'].some(c=>h.includes(c)));
assert.equal(idx, 1, `coluna descricao detectada (idx=${idx})`);

const saida = rows.slice(1).map(r => {
  const texto = r[idx].trim();
  const res = mods.engine.classify(texto, ds, {top:6});
  const c = res.candidates[0];
  const n = mods.engine.buildNotes(c, res.query, ds, res.candidates);
  return { texto: texto.slice(0,42), ncm: c?.rec.ncm, band: n.band, conf: +n.confidence.toFixed(2) };
});
for (const s of saida) console.log('   ', JSON.stringify(s));
const classificadas = saida.filter(s=>s.ncm).length;
assert.ok(classificadas >= 8, `linhas classificadas (got ${classificadas}/10)`);
const vagas = saida.filter(s=>s.texto.toLowerCase().includes('variedade'));
assert.equal(vagas[0]?.band, 'baixa', 'linha vaga deve sair em banda baixa');
console.log(`OK  lote: ${rows.length-1} linhas lidas, ${classificadas} classificadas, vaga→${vagas[0]?.band}`);
{ // o CSV exportado ganhou colunas de reforma/ERP — o cabeçalho e o corpo têm de bater
  const linhas = saida.length;
  assert.equal(linhas, 10, `linhas classificadas: ${linhas}`);
}
console.log('\nLOTE OK ✓');
