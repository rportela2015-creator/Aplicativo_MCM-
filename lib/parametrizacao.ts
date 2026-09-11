/**
 * Parametrização fiscal do item da NF-e a partir do NCM proposto.
 * Gera sugestões de CST/CSOSN, CEST, CFOP e regimes — todas marcadas como
 * *sugestão a confirmar*, porque dependem de CFOP de origem, UF, regime
 * tributário da empresa e convênios vigentes.
 */
import { Dataset, Record8, Cfop } from './data';

export type Operacao = 'interna' | 'interestadual' | 'importacao' | 'exportacao';
export type Finalidade = 'comercializacao' | 'industrializacao' | 'consumo' | 'ativo';
export type Regime = 'simples' | 'presumido' | 'real';

export type ParamInput = {
  operacao: Operacao; regime: Regime; finalidade: Finalidade;
  ufOrigem?: string; ufDestino?: string;
  st?: boolean;            // produto sujeito a ICMS-ST (empurra o CEST para o campo)
  beneficiado?: boolean;   // isenção/salvo-conduto/convênio
  devolvido?: boolean;     // operação de retorno
  industrial?: boolean;    // estabelecimento industrial/equiparado (IPI)
};

export type ParamBlock = { titulo: string; codigo?: string; detalhe: string; notas: string[]; confirmar: boolean };
export type Param = {
  blocks: ParamBlock[]; cfops: { c: string; d: string; a: string }[];
  stRequerida: boolean; resumo: string;
};

const CFOP_LABEL: Record<Operacao, Record<Finalidade, string[]>> = {
  interna: {
    comercializacao: ['venda a consumidor', 'venda'],
    industrializacao: ['industrializa', 'beneficiamento'],
    consumo: ['aquisi', 'compra'],
    ativo: ['ativo imobilizado'],
  },
  interestadual: {
    comercializacao: ['venda a consumidor', 'venda'],
    industrializacao: ['industrializa', 'beneficiamento'],
    consumo: ['aquisi', 'compra'],
    ativo: ['ativo imobilizado'],
  },
  importacao: { comercializacao: ['importa'], industrializacao: ['importa'], consumo: ['importa'], ativo: ['importa'] },
  exportacao: { comercializacao: ['exporta'], industrializacao: ['exporta'], consumo: ['exporta'], ativo: ['exporta'] },
};

function pickCfop(cfop: Cfop, operacao: Operacao, finalidade: Finalidade, inSumar = false): { c: string; d: string; a: string }[] {
  const grupos = { interna: ['5'], interestadual: ['6'], importacao: ['3'], exportacao: ['7'] }[operacao];
  const prefixes = operacao === 'interna' ? ['5.1', '5.2', '5.3'] :
    operacao === 'interestadual' ? ['6.1', '6.2', '6.3'] :
      operacao === 'importacao' ? ['3.0', '4.0'] : ['7.1', '7.2', '7.3'];
  const wants = CFOP_LABEL[operacao][finalidade];
  const pool = cfop.filter((r) => grupos.includes(r.g) && prefixes.some((p) => r.c.startsWith(p)));
  let sel = pool.filter((r) => wants.some((w) => r.d.toLowerCase().includes(w)));
  if (!sel.length) sel = pool.filter((r) => /comercializa|venda|adquisi|aquisi/i.test(r.d));
  if (!sel.length) sel = pool;
  // venda a consumidor > venda > remessa; nunca "compra" (entrada)
  // 5.102/6.102 = revenda de mercadoria de terceiros; 5.101/6.101 = produção própria
  const revenda = finalidade === 'comercializacao';
  const order = (r: { c: string; d: string }) => {
    const d = r.d.toLowerCase();
    const num = r.c.replace('.', '');
    if (revenda && /10[2]$/.test(num)) return 0;
    if (!revenda && /10[1]$/.test(num)) return 0;
    if (d.includes('venda')) return 1;
    if (d.includes('remessa')) return 2;
    return 3;
  };
  const base = [...sel].sort((x, y) => order(x) - order(y) || x.c.localeCompare(y.c)).slice(0, inSumar ? 8 : 6);
  return base.map((r) => ({ c: r.c, d: r.d, a: r.a }));
}

export function parameterize(rec: Record8, ds: Dataset, p: ParamInput): Param {
  const t = rec.ipi;
  const importado = p.operacao === 'importacao';
  const stByCest = (rec.cest || []).length > 0;
  const st = p.st ?? stByCest;
  const blocks: ParamBlock[] = [];
  const notas: string[] = [];

  // ---------------- ICMS / CSOSN
  if (p.regime === 'simples') {
    const code = st ? (p.operacao === 'interestadual' ? '201' : '101') : importado ? '201' : '102';
    blocks.push({
      titulo: 'ICMS — CSOSN (Simples Nacional)', codigo: `CSOSN ${code}`,
      detalhe: code === '102' ? 'Sem direito a crédito; parcela própria do DAS.'
        : code === '101' ? 'Tributação pelo Simples com ICMS retido por substituição tributária (frente própria + ST).'
          : 'Nacional importado — a parcela de ICMS é devida fora do DAS na entrada (CFOP 3.x) e a saída segue 102/201 conforme destino.',
      notas: ['No Simples, o ICMS-ST é recolhido por ST na forma do regulamento do estado de destino; conferir o MVA/IVA e a base própria.',
        'Se o item estiver no Regime Especial (ex.: energia, combustíveis), o CSOSN muda.'],
      confirmar: true,
    });
  } else {
    const code = p.beneficiado ? (importado ? '201' : '400') : importado ? '101' : '000';
    const nome = code === '000' ? 'Tributada integralmente'
      : code === '400' ? 'Isenta/não tributada (convênio)'
        : code === '201' ? 'Nacional importado — tributado' : 'Tributada com ST na operação anterior';
    blocks.push({
      titulo: 'ICMS — CST (Regime Normal)', codigo: `CST ${code}`,
      detalhe: nome + ` · origem ${importado ? '2 (estrangeira — importar produto estrangeiro)' : p.operacao === 'interestadual' ? '0 (nacional)' : '0 (nacional)'}`,
      notas: [
        `Alíquota interestadual de referência para produto ${importado ? 'importado ou estrangeiro' : 'nacional'}: ${importado ? '4%' : '12%'} (EC 87/2015 e Res. SF 22/2019;${p.ufDestino ? ` destino ${p.ufDestino}` : ''}) — confirmar com o regime do estado de origem.`,
        st ? 'CEST presente na tabela → verificar se o destino adotou a ST para este NCM (Convênio ICMS 142/2018 e protocolos).' : 'Sem CEST associado na tabela → regra geral não há ST; confirmar lista estadual.',
        'FCP: devido na ST interestadual para o estado de destino quando a alíquota própria interestadual for inferior à interna.',
      ],
      confirmar: true,
    });
  }

  // ---------------- IPI
  {
    const code = p.regime === 'simples' ? '999'
      : (t === null || rec.ipi_nt === 1) ? '53'
        : p.operacao === 'exportacao' ? '49'
          : importado ? '000' : '000';
    const aliq = rec.ipi_nt ? 'NT' : t === null ? 'sem registro na TIPI consultada' : `${t}%`;
    blocks.push({
      titulo: 'IPI', codigo: `CST IPI ${code}`,
      detalhe: code === '999' ? 'Simples Nacional — IPI incluído no DAS (NT em regra não gera crédito).'
        : code === '53' ? 'Saída não tributada (NT/não incide)'
          : code === '49' ? 'Saída com imunidade/isenção (exportação direta — art. 53, RIPI/2010)'
            : `Tributada — alíquota de referência ${aliq}`,
      notas: [
        `Alíquota extraída da TIPI vigente para ${rec.ncm}: ${aliq}. Verificar redução/reoneração por Ex-tarifário (NCM-Ex) e políticas excepcionais.`,
        importado ? 'Na importação, o IPI incide sobre valor aduaneiro + II + AFRMM + PIS/COFINS-importação (art. 5º, §2º, Lei 7.940/1989).' : '',
        p.industrial || p.regime !== 'simples' ? 'Se equiparação industrial (art. 5º, §1º, RIPI), há crédito presumido e obrigação de apuração própria.' : '',
      ].filter(Boolean),
      confirmar: true,
    });
  }

  // ---------------- PIS / COFINS
  {
    let code = '01'; let regimeTxt = 'Cumulativo (alíquotas 0,65% / 3,00%)';
    if (p.regime === 'real') { code = '01'; regimeTxt = 'Não cumulativo (1,65% / 7,60%)'; }
    if (p.regime === 'simples') { code = '13'; regimeTxt = 'Recolhimento no PGDAS-D'; }
    if (p.operacao === 'exportacao') { code = '02'; regimeTxt = 'Operação desonerada (art. 149, §2º, I, CF/88 e Lei 10.637/02 art. 5º)'; }
    const cclass = p.regime === 'simples' ? 'CST 13 — operação sem exigência (PGDAS-D)'
      : code === '01' ? (p.regime === 'real' ? 'CST 01 — Operação Tributável (alíquota plena)' : 'CST 01 — Tributável')
        : 'CST 02 — Operação Tributável com Alíquota Zero / desoneração';
    blocks.push({
      titulo: 'PIS / COFINS', codigo: cclass,
      detalhe: `Regime ${p.regime === 'real' ? 'não cumulativo' : 'cumulativo'} — ${regimeTxt}`,
      notas: [
        'Monofasia (Lei Complementar 192/2022 e correlatos) e isenções do Decreto 7.048/2010 e da Lei 14.893/2024 (cesta básica) alteram o CST — checar se o NCM está nas listas.',
        importado ? 'Aplicáveis PIS-Importação e COFINS-Importação (Lei 10.865/2004) com redução possível na revenda interna (art. 8º, §14).' : '',
        'Se a mercadoria for objeto de suspensão/isenção na revenda, o CST muda para 06/07/08 conforme o caso.',
      ].filter(Boolean),
      confirmar: true,
    });
  }

  // ---------------- CEST / ST
  blocks.push({
    titulo: 'CEST / Substituição Tributária',
    codigo: stByCest ? (rec.cest || []).join(' , ') : 'sem CEST na tabela',
    detalhe: stByCest
      ? `Item tem CEST: ${(rec.cestD || rec.cestS) || 'preencher 2004/2005 do cEST e validar MVA'}`
      : 'Nenhum CEST associado a este NCM no mapeamento do Convênio ICMS 142/2018 — em regra não há ICMS-ST, salvo lista estadual específica.',
    notas: [
      rec.cestD ? `Descrição oficial do CEST: ${rec.cestD}` : '',
      stByCest ? 'Preencher cOrgao (SEFAZ de destino), indOp (1 entrada/2 saída) e, quando interestadual, indicar FCP.' : '',
    ].filter(Boolean),
    confirmar: stByCest,
  });

  // ---------------- CFOP
  const cfops = pickCfop(ds.cfop, p.operacao, p.finalidade);
  if (p.devolvido) notas.push('Operação de retorno: usar o CFOP espelho (1.201/2.201/5.201/6.201 ou 3.x conforme o caso) e referenciar a NF de origem (key).');

  blocks.push({
    titulo: 'CFOP sugerido', codigo: cfops[0]?.c,
    detalhe: cfops.map((c) => `${c.c} — ${c.d}`).slice(0, 3).join(' · '),
    notas: [`Âmbito considerado: ${p.operacao === 'interna' ? 'mesmo estado' : p.operacao === 'interestadual' ? 'interestadual' : p.operacao === 'importacao' ? 'aquisição/importação do exterior' : 'exportação'}${p.ufOrigem ? ` · origem ${p.ufOrigem}` : ''}${p.ufDestino ? ` · destino ${p.ufDestino}` : ''}`,
      'Para NF-e de entrada em industrialização, usar o CFOP do grupo 1.1xx/2.1xx com indicativo de movimentação (indFinal=1, indPres=0).'],
    confirmar: false,
  });

  // ---------------- Ex-tarifario / defesa comercial
  {
    const notas2: string[] = [];
    if (rec.extarif) notas2.push('Existem NCM-Ex (exceção tarifária) para a posição: o II pode cair para BIT (0%–2%) para bens de capital/informática — verificar a lista vigente do Gecex antes de declarar o importador.');
    if (rec.excecao) notas2.push(`Exceção nacional registrada: ${rec.excecao}.`);
    if (rec.bitbk) notas2.push(`Marcador ${rec.bitbk}: bem de capital (BK) ou de informática/telecomunicações (BIT) — análise de mérito no Gecex para II reduzido.`);
    if (notas2.length) blocks.push({
      titulo: 'Defesa comercial / Ex-tarifário', codigo: rec.extarif ? 'NCM-Ex ativo' : undefined,
      detalhe: `II declarado ${rec.ii === null ? '—' : rec.ii + '%'} · TEC Mercosul ${rec.tec === null ? '—' : rec.tec + '%'}`,
      notas: notas2, confirmar: true,
    });
  }

  const resumo =
    `NCM ${rec.ncm} · ${rec.lvl === 'subitem' ? 'subitem' : 'item'} da posição ${rec.path[1] || ''} · ` +
    `IPI ${rec.ipi_nt ? 'NT' : (t ?? '—')}% · II ${rec.ii ?? '—'}% · ` +
    `CEST ${stByCest ? (rec.cest || [])[0] : 'não listado'} · regime ${p.regime} · operação ${p.operacao}`;

  return { blocks, cfops, stRequerida: stByCest, resumo };
}

/** Precisa preencher os atributos do Catálogo de Produtos (DUIMP/DU-E/LPCO). */
export function catalogChecklist(rec: Record8, ds: Dataset) {
  const codigos = ds.attrs.codigos;
  return (rec.attrs || []).map(([i, obrig, modalidade]) => {
    const code = codigos[i];
    const def = ds.attrs.defs[code];
    return {
      code, obrig: obrig === 1, modalidade: modalidade === 0 ? 'Importação' : 'Exportação',
      nome: def?.n || code, forma: def?.f || '', orientacao: def?.o || '', orgaos: def?.g || '',
      dominios: def?.d || [],
    };
  }).sort((a, b) => (b.obrig ? 1 : 0) - (a.obrig ? 1 : 0));
}
