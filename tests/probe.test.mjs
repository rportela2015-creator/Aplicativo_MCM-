import assert from 'node:assert/strict';
import { mods } from 'ncm:libs';
globalThis.fetch = async (u) => { const rel=String(u).replace(/^\//,'');
  const { readFile } = await import('node:fs/promises');
  try{const t=await readFile(process.cwd()+'/public/'+rel,'utf8');return {ok:true,status:200,json:async()=>JSON.parse(t)}}catch{return{ok:false,status:404,json:async()=>null}}};
const ds = await mods.data.loadDataset(); await ds.pronto;
for (const q of ['ar-condicionado split hi wall 12000 btus','unidade evaporadora split 12000 btus','kit brinde variedade linha casa','pneu radial para automóvel de passageiro']) {
  const r = mods.engine.classify(q, ds, {top:4});
  const traps = mods.engine.armadilhasAplicaveis(r.query, ds).map(a=>a.id);
  console.log('\n##',q,'| armadilhas:',traps.join(','));
  for (const c of r.candidates) console.log('  ',c.rec.ncm,c.score.toFixed(1),'cov',c.coverage.toFixed(2),'gen',c.rec.gen,
     '|',c.rec.desc.slice(0,58).replace(/\n/g,' '));
}
// asserts: os guardas das armadilhas não podem inverter estes dois comportamentos
const split = mods.engine.classify('ar-condicionado split hi wall 12000 btus', ds, { top: 5 });
assert.ok(split.candidates.some((c) => c.rec.ncm.startsWith('8415.10')),
  'split: a posição 8415.10 (aparelho completo) deve continuar entre as opções');
assert.ok(mods.engine.armadilhasAplicaveis(split.query, ds).some((x) => x.id === 'split_e_unidade_isolada'),
  'split: deve existir nota alertando sobre unidade isolada x aparelho completo');
const evap = mods.engine.classify('unidade evaporadora split 12000 btus', ds, { top: 3 });
assert.ok(evap.candidates[0]?.rec.ncm.startsWith('8415.90'),
  'unidade isolada declarada: a posição de Partes (8415.90) deve vencer');
const kit = mods.engine.classify('kit brinde variedade linha casa', ds, { top: 5 });
const kitN = mods.engine.buildNotes(kit.candidates[0], kit.query, ds, kit.candidates);
assert.notEqual(kitN.band, 'alta', 'kit vago jamais pode sair em banda alta');
assert.ok(kitN.notes.some((x) => /kit|composto|embalagem/i.test(x.texto + x.titulo)),
  'kit vago deve carregar a armadilha de kit/embalagem');
console.log('\nPROBE OK ✓ (split, unidade isolada, kit vago)');
