/**
 * Parametrização de ERP: os códigos têm de sair das tabelas oficiais e a conferência
 * de schema não pode deixar passar documento inválido.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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
const reforma = await mods.data.loadReforma();
const erp = await mods.data.loadErpTabela();

const t = (nome, fn) => {
  try { fn(); console.log(`OK  ${nome}`); }
  catch (e) { console.log(`XX  ${nome}\n    ${e.message}`); process.exit(1); }
};

const BASE = {
  cnpj: '11222333000181', ie: '110042490114', municipioIbge: '3550308', ufEmi: 'SP', regime: 'presumido',
  modelo: '55', operacao: 'interna', finalidade: 'comercializacao', ufDest: 'SP', cnpjDest: '', ieDest: '',
  tpAmb: '1', finNFe: '1', indFinal: 1, indPres: '2', modFrete: '9', st: false, beneficiado: false,
  industrial: false, nbs: '', cClassTribForcado: '', cClassTribRegForcado: '', regApIBSCBSSN: '',
  cClassReferenciada: '', tpNFCredito: '', tpNFDebito: '', anoReforma: 2026,
};
const campo = (p, grupo, tag) => p.campos.find((b) => b.grupo.startsWith(grupo) || b.tag === grupo)?.campos.find((c) => c.tag === tag);
const nivel = (p, re) => p.verificacoes.filter((x) => re.test(x.campo)).map((x) => x.nivel);

t('CNPJ: validação de dígitos verificadores (não é só tamanho)', () => {
  assert.equal(mods.xml.cnpjValido('11.222.333/0001-81'), true, 'CNPJ válido rejeitado');
  assert.equal(mods.xml.cnpjValido('00.000.000/0001-91'), true, 'CNPJ canônico da receita rejeitado');
  assert.equal(mods.xml.cnpjValido('11222333000180'), false, 'dígito verificador trocado aceito');
  assert.equal(mods.xml.cnpjValido('11111111111111'), false, 'CNPJ repetido aceito');
  assert.equal(mods.xml.cnpjValido('123'), false, 'tamanho errado aceito');
});

t('IE: valida onde a regra é pública (SP/PR) e se cala nos demais', () => {
  // 110.042.490.114 é o exemplo do manual do SINTEC/SP (12 dígitos: 9º e 12º verificadores)
  assert.equal(mods.xml.ieValida('SP', '110.042.490.114'), true, 'IE SP do manual SINTEC rejeitada');
  assert.equal(mods.xml.ieValida('SP', '110.042.490.115'), false, 'IE SP com dv errado aceita');
  assert.equal(mods.xml.ieValida('SP', '110.042.490.11'), false, 'IE SP com tamanho errado aceita');
  // PR: o peso do 1º dv é lido da direita (o manual do SINTEC soma 138 para uma sequência
  // que dá 156 — geramos o IE pela regra e exigimos que o validador a reconheça, e que
  // recuse o mesmo IE com dígito trocado).
  assert.equal(mods.xml.ieValida('PR', '1234567896'), true, 'IE PR válida rejeitada');
  assert.equal(mods.xml.ieValida('PR', '1234567897'), false, 'IE PR com dv errado aceita');
  assert.equal(mods.xml.ieValida('PR', '123456789'), false, 'IE PR com tamanho errado aceita');
  assert.equal(mods.xml.ieValida('SP', 'ISENTO'), true);
  assert.equal(mods.xml.ieValida('RJ', '12345678'), null, 'deveria devolver null (sem regra)');
});

t('cUF bate com a tabela oficial de UFs baixada da RFB (inclusive RN=24 e PE=26)', () => {
  const oficial = Object.fromEntries(JSON.parse(readFileSync('data/raw/reforma/ufs.json', 'utf8'))
    .map((u) => [u.sigla, String(u.codigo)]));
  for (const [uf, cod] of Object.entries(oficial)) {
    if (uf === 'EX') continue;
    assert.equal(mods.xml.cUF(uf), cod, `cUF(${uf}) diverge da fonte oficial`);
  }
  assert.equal(mods.xml.cUF('SP'), '35');
  assert.equal(mods.xml.cUF('PE'), '26', 'PE não é 24 (24 é RN)');
  assert.equal(mods.xml.cUF('ZZ'), '');
});

t('item de mercadoria: NCM e CEST saem da tabela oficial, CFOP da de CONFAZ', () => {
  const rec = ds.byD8.get('84713012');
  const p = mods.xml.montarXml({ ...BASE }, ds, reforma, rec);
  assert.equal(campo(p, 'produto', 'NCM').valor, '84713012');
  assert.equal(campo(p, 'produto', 'NCM').fonte, 'tabela oficial');
  assert.equal(campo(p, 'produto', 'CEST').valor, '21.028.00', 'CEST não virou CEF');
  assert.match(p.resumo, /CFOP 5\.102/, p.resumo);
  assert.equal(campo(p, 'ide', 'cUF').valor, '35');
  assert.equal(campo(p, 'emit', 'CRT').valor, '3');
});

t('Simples Nacional: CRT 1 + CSOSN no lugar de ICMS/CST', () => {
  const rec = ds.byD8.get('84713012');
  const p = mods.xml.montarXml({ ...BASE, regime: 'simples', ie: '' }, ds, reforma, rec);
  assert.equal(campo(p, 'emit', 'CRT').valor, '1');
  const blocoSn = p.campos.find((b) => b.tag.startsWith('ICMSSN'));
  assert.ok(blocoSn, 'bloco ICMSSN ausente');
  assert.ok(blocoSn.campos.some((c) => c.tag === 'CSOSN' && /^1\d\d$/.test(c.valor)), 'CSOSN ausente no bloco');
  assert.ok(!p.campos.some((b) => b.tag === 'gIPI'), 'regime do Simples não destaca IPI');
  assert.equal(campo(p, 'emit', 'regApIBSCBSSN')?.fonte, 'tabela oficial', 'regApIBSCBSSN deveria vir do emit');
  assert.deepEqual(nivel(p, /regApIBSCBSSN/), ['atencao'], 'falta avisar sobre o regime de apuração');
});

t('ST: bloco de substituição tributária aparece com a base/valor pedidos', () => {
  const rec = ds.byD8.get('84713012');
  const p = mods.xml.montarXml({ ...BASE, st: true }, ds, reforma, rec);
  const g = p.campos.find((b) => /^ICMS(SN)?\d*/.test(b.tag));
  assert.ok(g.campos.some((c) => c.tag === 'vBCST' && c.valor === '' && c.fonte === 'a preencher'));
  assert.ok(g.campos.some((c) => c.tag === 'vICMSST'));
});

t('conferências pegam documento inválido (CNPJ, município, NFC-e, cClassTrib falso)', () => {
  const rec = ds.byD8.get('84713012');
  const ruim = mods.xml.montarXml({ ...BASE, cnpj: '11222333000180', municipioIbge: '10000000',
    modelo: '65', indFinal: 0, indPres: '0', cClassTribForcado: '999999' }, ds, reforma, rec);
  const errados = ruim.verificacoes.filter((x) => x.nivel === 'erro').map((x) => x.campo);
  assert.ok(errados.some((c) => c === 'emit/CNPJ'), 'CNPJ inválido passou');
  assert.ok(errados.some((c) => c === 'emit/cMun'), 'cMun com tamanho errado passou');
  assert.ok(errados.includes('ide/indFinal') && errados.includes('ide/indPres'), 'NFC-e sem exigências de consumidor final');
  assert.ok(ruim.verificacoes.some((x) => /1065|1067/.test(x.texto)), 'cClassTrib fora da tabela não foi barrado');

  const bom = mods.xml.montarXml({ ...BASE, cClassTribForcado: '000001' }, ds, reforma, rec);
  assert.ok(bom.verificacoes.some((x) => x.campo === 'IBSCBS/cClassTrib' && x.nivel === 'ok'));
  assert.ok(!bom.verificacoes.some((x) => x.nivel === 'erro'), bom.verificacoes.filter((x) => x.nivel === 'erro').map((x) => x.texto).join(' | '));
});

t('maqueta: tags bem formadas, com os códigos dentro e as lacunas vazias', () => {
  const rec = ds.byD8.get('84713012');
  const p = mods.xml.montarXml({ ...BASE }, ds, reforma, rec);
  assert.match(p.maqueta, /<NCM>84713012<\/NCM>/);
  assert.match(p.maqueta, /<cClassTrib>000001<\/cClassTrib>/);
  assert.match(p.maqueta, /<CST>000<\/CST>/);
  assert.match(p.maqueta, /<pCBS>0,9<\/pCBS>/, 'CBS de referência de 2026 ausente');
  assert.match(p.maqueta, /<vBC><\/vBC>/, 'campo de valor deveria sair vazio');
  assert.match(p.maqueta, /<emit>/);
  // balanceamento de tags (maqueta é estrutura, não precisa de parser XML)
  const pilha = [];
  for (const tk of p.maqueta.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([A-Za-z0-9_]+)[^>]*?(\/)?>/g)) {
    const [, fecha, nome] = tk;
    if (fecha) { if (pilha.pop() !== nome) throw new Error(`fechamento desencontrado em </${nome}>`); }
    else pilha.push(nome);
  }
  assert.deepEqual(pilha, [], 'tags não fechadas na maqueta');
});

t('exportação e importação trocam o cenário (idEstrangeiro, II, indDir)', () => {
  const rec = ds.byD8.get('84713012');
  const exp = mods.xml.montarXml({ ...BASE, operacao: 'exportacao' }, ds, reforma, rec);
  assert.ok(exp.campos.some((b) => b.grupo.startsWith('dest')));
  assert.match(exp.campos.find((b) => b.tag === 'IBSCBS').campos.map((c) => c.valor).join(' '), /410/, 'exportação deveria apontar CST 410');

  const imp = mods.xml.montarXml({ ...BASE, operacao: 'importacao' }, ds, reforma, rec);
  const g = imp.campos.find((b) => b.tag === 'importaII');
  assert.ok(g, 'sem bloco de importação');
  assert.equal(g.campos.find((c) => c.tag === 'vII').motivo.includes('16'), true, 'II da TEC não veio no motivo');
  assert.ok(g.campos.some((c) => c.tag === 'indDir'));
});

t('IS por NCM: grupo IS sai com a alíquota da tabela oficial (2027)', () => {
  const fum = ds.byD8.get('24022000');
  if (!fum || fum.is !== 1) { console.log('    (base do IS indisponível — pulando)'); return; }
  const p = mods.xml.montarXml({ ...BASE, anoReforma: 2027 }, ds, reforma, fum);
  const g = p.campos.find((b) => b.tag === 'IS');
  assert.ok(g, 'IS não apareceu para NCM da lista');
  assert.equal(g.campos.find((c) => c.tag === 'pIS').valor, '13', 'ad valorem divergente da tabela oficial');
  assert.match(g.campos.find((c) => c.tag === 'pISAliqAdRem').valor, /2,13/);
  assert.match(g.campos.find((c) => c.tag === 'uTrib').valor, /VN/);
});

t('NFS-e: bloco de serviço com NBS e o mesmo dicionário de cClassTrib', () => {
  const p = mods.xml.montarXml({ ...BASE, modelo: 'nfs-e', nbs: '1.0301.31.00' }, ds, reforma, null);
  const g = p.campos.find((b) => b.tag === 'servico');
  assert.ok(g && g.campos.some((c) => c.tag === 'NBS' && c.valor === '1.0301.31.00'));
  assert.ok(g.campos.some((c) => c.tag === 'cServico' && c.fonte === 'a preencher'));
  // o dicionário de cClassTrib é o mesmo: continua no bloco IBSCBS do documento
  assert.ok(p.campos.find((b) => b.tag === 'IBSCBS')?.campos.some((c) => c.tag === 'cClassTrib'));
});

t('tabela de campos do usuário entra publicada e selada', () => {
  assert.ok(erp, 'erp-parametros.json ausente — rode python3 scripts/baixar_erp.py && npm run dados');
  assert.ok(erp.linhas > 300, `linhas: ${erp.linhas}`);
  assert.ok(erp.contagens.oficial > 40, `linhas conferidas: ${erp.contagens.oficial}`);
  assert.equal(erp.contagens.duvidoso, 0, `linhas duvidosas: ${erp.contagens.duvidoso}`);
  const cc = erp.itens.filter((i) => /classtrib/i.test(i.tag));
  assert.ok(cc.length > 20, 'cClassTrib não está na planilha?');
  assert.ok(cc.some((i) => i.selo === 'oficial'), 'nenhum exemplo de cClassTrib bateu com a tabela oficial');
  assert.ok(erp.itens.every((i) => i.tag.length > 0 && i.selo), 'linha sem tag/selo');
});

console.log('\nXML/ERP OK ✓');
