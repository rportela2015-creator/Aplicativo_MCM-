/**
 * Camada da Reforma Tributária do Consumo (LC 214/2025 → CBS, IBS, IS).
 *
 * Toda informação aqui sai das tabelas OFICIAIS carregadas de `public/data/reforma.json`
 * (dados abertos da Calculadora de Tributos do Consumo, RFB). O papel deste módulo é
 * *sugerir candidatas* a partir do cenário informado (regime, operação, finalidade) e
 * dizer o que falta para fechar — nunca afirmar o código do contribuinte:
 * o cClassTrib depende do que de fato acontece na operação, não só do NCM.
 */
import type { ClassTrib, Fundamento, Reforma } from './data';
import type { ParamInput } from './parametrizacao';

export type ReformaSugestao = {
  /** true quando a tabela oficial está carregada */
  temTabela: boolean;
  /** candidatas a CST-IBS/CBS + cClassTrib, com o texto oficial de cada uma */
  cbsibs: { cst: string; cstNome: string; codigo: string; descricao: string; tratamento: string; reducao: boolean; dfe: string[] }[];
  /** Imposto Seletivo: o que a tabela oficial diz deste NCM */
  is: { tributa: boolean; adv?: number | null; are?: number | null; un?: string | null; data: string; parcial?: boolean };
  /** alíquotas de referência do ano (fonte oficial), para o usuário ver a ordem de grandeza */
  aliquotas?: { ano: string; cbs?: number; ufFaixa?: string };
  /** o que falta para fechar o código — cada item é uma pergunta concreta */
  falta: string[];
  /** fundamentação legal das candidatas (texto da LC 214/2025) */
  fundamentos: { codigo: string; texto: string; curto: string; lbl?: string; referencia: string }[];
};

/**
 * Pega as entradas oficiais mais aderentes primeiro: quando `prioriza` é dado, uma entrada cujo
 * texto o contém vale mais que uma que só casa com o filtro largo (evita que o 1º item seja o
 * primeiro do arquivo oficial, que não tem relação com o cenário).
 */
const pega = (lista: ClassTrib[] | undefined, filtro: (c: ClassTrib) => boolean, limite = 3, prioriza?: RegExp) => {
  const hits = (lista || []).filter(filtro);
  if (prioriza) {
    const fortes = hits.filter((c) => prioriza.test(c.d));
    if (fortes.length) return fortes.slice(0, limite);
  }
  return hits.slice(0, limite);
};

const pct = (n: number) => String(n).replace('.', ',');

export function sugerirReforma(reforma: Reforma | null, rec: { is?: 0 | 1 | null; cest?: string[]; adv?: number | null; are?: number | null; un?: string | null },
                               p: ParamInput, ano = 2026, texto = '',
                               pis?: { cst?: string }): ReformaSugestao {
  const out: ReformaSugestao = {
    temTabela: !!reforma?.disponivel, cbsibs: [], fundamentos: [],
    is: { tributa: rec.is === 1, adv: null, are: null, un: null, data: reforma?.is_data || '2027-01-01' },
    falta: [],
  };
  if (!reforma?.disponivel) {
    out.falta.push('Tabela cClassTrib não carregada — rode `npm run build:reforma` para baixar as tabelas oficiais.');
    return out;
  }
  const al = reforma.aliquotas?.[String(ano)];
  if (al) {
    const v = (al.uf || []).filter((x) => typeof x === 'number').sort((x, y) => x - y);
    out.aliquotas = { ano: String(ano), cbs: al.uniao ?? undefined,
                      ufFaixa: v.length ? (v[0] === v[v.length - 1] ? `${pct(v[0])}` : `${pct(v[0])} a ${pct(v[v.length - 1])}`) : undefined };
  }
  if (rec.is != null) {
    out.is = { tributa: rec.is === 1, adv: rec.adv, are: rec.are, un: rec.un,
               data: reforma.is_data || '2027-01-01', parcial: reforma.is_parcial };
  } else {
    out.falta.push('Este NCM ainda não foi consultado na tabela oficial do IS ' +
      `(base parcial: ${reforma.is_consultados ?? 0}/${reforma.is_total ?? 0}) — confirme na Calculadora da RFB.`);
  }

  const cbsibs = reforma.classificacoes;
  const add = (it: ClassTrib, motivo: string) => {
    if (!out.cbsibs.some((x) => x.codigo === it.c)) {
      out.cbsibs.push({ cst: it.cst, cstNome: it.cn, codigo: it.c, descricao: it.d,
                        tratamento: it.tt || '', reducao: !!it.red, dfe: it.df || [] });
      void motivo;
    }
  };

  // 1) Simples Nacional: fora do DAS, IBS/CBS só são exigidos nas hipóteses da LC 214/2025
  if (p.regime === 'simples') {
    out.falta.push('Regime Simples Nacional: a apuração do IBS/CBS continua pelo DAS — e os códigos da tabela que ' +
      'falam de Simples (ex.: 811003 “Desenquadramento do Simples Nacional”) servem justamente para quem saiu do regime. ' +
      'Confira se há substituição/transferência de crédito (LC 214/2025, arts. 257 e seguintes) antes de escolher o código.');
  }

  // 2) Exportação: não incidência / imunidade
  if (p.operacao === 'exportacao') {
    for (const c of pega(cbsibs, (x) => /exporta/i.test(x.d), 3, /exporta[çc][õo]es de bens|imune/i)) add(c, 'export');
    out.falta.push('Exportação: a saída para o exterior é imune/não tributada, mas o crédito (art. 48) depende de a operação ser efetivamente exportadora — confirme o câmbio e o desembaraço.');
  }

  // 3) Importação: precisa do grupo do importador e do DIR
  if (p.operacao === 'importacao') {
    for (const c of pega(cbsibs, (x) => /importa/i.test(x.d), 3, /importa[çc][ãa]o de bens|sem incid/i)) add(c, 'import');
    out.falta.push('Importação: informe se o adquirente é contribuinte do IBS/CBS (tag indDir/importador não contribuinte muda a exigência) e se há benefício fiscal (ex-tarifário/ZZ).');
  }

  // 4) CST do PIS/COFINS como indício (não como prova): alíquota zero/desoneração costuma ter
  //    correspondente em 410 (imunidade/não incidência) ou em grupo de alíquota zero
  if (pis?.cst === '02') {
    for (const c of pega(cbsibs, (x) => x.cst === '410' && /imposto seletivo|livre|nao incid|imune|nao trib/i.test(x.d))) add(c, '410');
    for (const c of pega(cbsibs, (x) => x.tt === 'Alíquota zero' && /bem|mercadoria|fornecimento/i.test(x.d))) add(c, 'zero');
    out.falta.push('CST 02 de PIS/COFINS (alíquota zero/desoneração) é INDÍCIO, não prova: a tabela do IBS/CBS tem ' +
      'código próprio para cada hipótese legal (art. 8º e 9º da LC 214/2025 e listas de redução). Escolha pelo dispositivo, não pelo CST antigo.');
  }
  if (pis?.cst === '13') {
    for (const c of pega(cbsibs, (x) => x.cst === '811' && /simples nacional/i.test(x.d))) add(c, '811');
  }

  // 5) Monofásico (combustíveis e correlatos): só com evidência na descrição
  // 5) Monofásico: só com evidência textual de combustível/arrecadação-retida na descrição
  if (/combust[íi]vel|gasolina|etanol|diesel|[gk][tp][gl]|querosene|gnv|l[tm]brificant/i.test(texto || '')) {
    for (const c of pega(cbsibs, (x) => x.cst === '620')) add(c, 'mono');
  }

  // 6) Sem evidência nenhuma, a leitura padrão é a regra geral de tributação integral.
  //    Só a entrada genérica: 000 tem códigos de nicho (local da operação, regimes incentivados)
  //    que NÃO são "o padrão" e não devem aparecer como sugestão.
  if (!out.cbsibs.length) {
    const porCodigo = cbsibs.find((x) => x.cst === '000' && /tributadas integralmente/i.test(x.d));
    const porBase = porCodigo ? undefined : Object.keys(reforma.fundamentacoes || {})
      .find((cod) => /^regra geral$/i.test(reforma.fundamentacoes![cod].lbl || '') && cod.startsWith('000'));
    const alvo = porCodigo ? porCodigo.c : porBase;
    const c = alvo ? cbsibs.find((x) => x.c === alvo) : undefined;
    if (c) add(c, 'padrao');
    else out.falta.push('A tabela oficial não traz uma entrada de “regra geral” para 000 — escolha o código pela hipótese legal, não por padrão.');
  }

  // 7) Fundamentação das candidatas
  for (const s of out.cbsibs) {
    const f: Fundamento | undefined = reforma.fundamentacoes?.[s.codigo];
    if (f) out.fundamentos.push({ codigo: s.codigo, texto: f.t, curto: f.tc, lbl: f.lbl, referencia: f.ref });
  }

  const cap = (rec as { d8?: string; path?: string[] }).d8?.slice(0, 2)
    || ((rec as { path?: string[] }).path || [''])[0].slice(0, 2);
  if (/alimento|arroz|feijao|carne|frango|pao|biscoito|bolacha|leite/i.test(texto || '')
      || ['16', '17', '18', '19', '20', '21'].includes(cap)) {
    out.falta.push('Cesta básica/alimentos: a redução de alíquota vem de LISTA por NCM anexa à LC 214/2025 (art. 125 e ' +
      'seguintes) e não de um código autônomo na tabela cClassTrib — os grupos 200/010 existem para “alíquota reduzida”, ' +
      'mas o enquadramento depende do NCM estar na lista legal vigente. Confira a lista antes de usar 200xxx.');
  }
  if (!out.cbsibs.some((x) => x.cst !== '000')) {
    out.falta.push('O cClassTrib não decorre do NCM: ele codifica a *situação da operação* (onerosidade, destino, ' +
      'benefício, suspensao/estorno). Confira a lista oficial e, na dúvida, a Calculadora de Tributos do Consumo da RFB.');
  }
  if (out.is.tributa) {
    out.falta.push('NCM com Imposto Seletivo na tabela oficial (a partir de ' + out.is.data + '): ' +
      (out.is.adv != null ? `ad valorem ${String(out.is.adv).replace('.', ',')}%` : 'sem ad valorem informado') +
      (out.is.are != null ? ` e ad rem ${String(out.is.are).replace('.', ',')} por ${out.is.un || 'unidade'}` : '') +
      ' — o IS incide sobre a operação, não sobre o produto em abstrato; confirme fato gerador e reduções legais.');
  }
  return out;
}

/** Tabela de alíquotas de referência por ano, do mesmo arquivo oficial. */
export function aliquotasReforma(reforma: Reforma | null): { ano: string; cbs?: number; uf?: number[] }[] {
  if (!reforma?.aliquotas) return [];
  return Object.entries(reforma.aliquotas)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ano, v]) => ({ ano, cbs: v.uniao ?? undefined, uf: v.uf || [] }));
}

/** Busca na tabela oficial: por código, CST ou palavra (para a aba de referência). */
export function buscarClassificacoes(reforma: Reforma, texto: string, cst = '', soReducao = false): ClassTrib[] {
  const t = (texto || '').trim().toLowerCase();
  const rx = /^\d{3,6}$/.test(t) ? t : '';
  return reforma.classificacoes.filter((c) => {
    if (cst && c.cst !== cst) return false;
    if (soReducao && !c.red) return false;
    if (!rx) return true;
    if (rx.length <= 6 && c.c.startsWith(rx)) return true;
    if (c.cst.startsWith(rx)) return true;
    return c.d.toLowerCase().includes(t) || (c.tt || '').toLowerCase().includes(t) || c.cn.toLowerCase().includes(t);
  });
}
