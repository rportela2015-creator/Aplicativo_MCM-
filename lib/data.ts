/**
 * Camada de dados: carrega o dataset estático (gerado por scripts/pipeline.py) uma só vez.
 *
 * Split quente/frio: `ncm.json` + `search.json` + `hierarquia.json` + `regras.json` bastam
 * para classificar e para o texto legal; os detalhes fiscais (IPI/CEST/atributos/ato) chegam
 * em `ncm-frio.json` e são mesclados nos mesmos objetos assim que disponíveis. Assim o
 * primeiro resultado aparece sem esperar ~5 MB.
 */

export type Record8 = {
  ncm: string;          // "8471.30.12"
  d8: string;           // "84713012"
  desc: string;
  path: string[];       // ["84","8471","847130","84713012"] códigos-avo
  lvl: string;
  gen: 0 | 1;           // descrição genérica ("Outros")
  ipi: number | null;
  ipi_nt: 0 | 1;
  ii: number | null;
  // --- campos frios (chegam em ncm-frio.json)
  tec?: number | null;
  bitbk?: string | null;
  excecao?: string | null;
  extarif?: 0 | 1;
  cest?: string[];
  cestD?: string;
  cestS?: string;
  attrs?: [number, 0 | 1, 0 | 1][];
  ato?: string;
  ini?: string;
  fim?: string;
  // --- Imposto Seletivo (reforma tributária; vigente a partir de 2027)
  /** 1 = a tabela oficial da RFB aponta IS para este NCM; 0 = não aponta; null = ainda não consultado */
  is?: 0 | 1 | null;
  /** alíquota ad valorem do IS (%) e ad rem (valor por unidade) */
  adv?: number | null;
  are?: number | null;
  un?: string | null;
};

/** Tabelas oficiais do IBS/CBS/IS (dados abertos da Calculadora de Tributos do Consumo — RFB) */
export type CstItem = { id?: number; codigo: string; descricao: string };
export type ClassTrib = {
  c: string; cst: string; cn: string; d: string; ta?: string; tt?: string;
  red?: boolean; rb?: boolean; des?: boolean; cpF?: boolean; cpA?: boolean;
  crA?: boolean; crI?: boolean; nom?: string; df?: string[]; up?: string;
};
export type Fundamento = { t: string; lbl?: string; tc: string; ref: string; tri?: string };
export type Reforma = {
  disponivel: boolean; fonte?: string; coletado_em?: string | null; falhas?: Record<string, string>;
  cst: CstItem[]; classificacoes: ClassTrib[];
  is_cst?: CstItem[]; is_classificacoes?: ClassTrib[];
  fundamentacoes?: Record<string, Fundamento>;
  aliquotas?: Record<string, { uniao?: number | null; uf?: number[]; uf_por?: Record<string, number> }>;
  transicao?: { cbs_destino?: { valor: number; inicioVigencia: string; fimVigencia?: string | null }[];
                ibs_destino?: { valor: number; inicioVigencia: string; fimVigencia?: string | null }[] };
  is_por_ncm?: boolean; is_itens?: Record<string, { is: boolean; adv?: number | null; are?: number | null; un?: string | null }>;
  is_data?: string; is_parcial?: boolean; is_consultados?: number; is_total?: number;
  /** sigla da UF → código IBGE (tabela oficial; EX = 99) */
  uf_codigos?: Record<string, string>;
};

export type Armadilha = {
  id: string; titulo: string; quando: string[]; materiais?: string[]; capitulos?: string[];
  acao: string; explicacao: string; candidatos?: string[]; penalizar_prefijos?: string[]; fonte: string;
  /** a armadilha NÃO se aplica se a descrição tiver um destes termos (critério material cede) */
  exceto_quando?: string[];
  /** desliga a armadilha quando a descrição traz um destes termos (ex.: é peça isolada) */
  nao_quando?: string[];
};
export type NotaLegal = { alcance: string; texto: string; ncms: string[] };
export type Rgi = { id: string; titulo: string; texto: string; quando: string; efeito: string };

export type Rules = {
  rgi: Rgi[]; notas_legais: NotaLegal[]; armadilhas: Armadilha[];
  sinonimos: Record<string, string[]>; materiais: Record<string, string[]>;
  usos: Record<string, string[]>; genericas: string[];
  indicadores: Record<string, string[]>; resumo_rotina: string[]; sinais_de_inseguranca: string[];
  /** termos de catálogo que nunca definem classificação */
  jargao_sem_valor_fiscal?: string[];
  /** palavras corriqueiras da própria tabela (não servem de âncora de match) */
  palavras_comuns_na_tabela?: string[];
};

export type SearchIndex = { n: number; vocab: string[]; df: number[]; inv: number[][] };
export type CestDef = Record<string, { d: string; s: string }>;
export type Cfop = { c: string; d: string; g: string; a: string }[];
export type Atributos = {
  codigos: string[];
  defs: Record<string, { n: string; f: string; o: string; g: string; d: [string, string][] }>;
};
/** tabela de campos/tag de XML (NF-e/NFS-e) fornecida pelo usuário, confrontada com as tabelas oficiais */
export type ErpItem = { tag: string; campo: string; desc: string; tipo: string; tam: string; ex: string;
  fonte: string; selo: 'oficial' | 'derivada' | 'inferido' | 'duvidoso'; nota: string; inferido?: boolean; cods: string[] };
export type ErpTabela = { arquivo: string; sha256: string; cabecalho: string[]; linhas: number;
  contagens: Record<string, number>; itens: ErpItem[]; aviso: string };

export type Meta = {
  gerado_em: string; ncm_vigente: string; ncm_ato: string;
  /** definido quando alguma fonte falhou e o dataset usou cache local (a UI exibe o alerta) */
  aviso_fontes?: string | null;
  fontes: Record<string, { nome: string; url?: string; api?: string; status: string; linhas?: number }>;
  contagens: Record<string, number>; validacao: Record<string, unknown>;
};

export type Dataset = {
  records: Record8[];
  byD8: Map<string, Record8>;
  byNcm: Map<string, Record8>;
  hier: Record<string, string>;
  search: SearchIndex;
  rules: Rules;
  cest: CestDef;
  cfop: Cfop;
  attrs: Atributos;
  meta: Meta;
  /** resolve quando os campos frios (CEST/atributos/ato/II-TEC) foram mesclados */
  pronto: Promise<Dataset>;
};

const get = async (f: string) => {
  const r = await fetch(`/data/${f}`, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`falha ao carregar /data/${f} (HTTP ${r.status})`);
  return r.json();
};

let cache: Promise<Dataset> | null = null;
let refCache: Promise<Reforma | null> | null = null;
let erpCache: Promise<ErpTabela | null> | null = null;

/** tabela da reforma (opcional): null = dataset gerado sem ela — a UI avisa */
export function loadReforma(): Promise<Reforma | null> {
  if (!refCache) {
    refCache = (async () => {
      try {
        const r = await fetch('/data/reforma.json', { cache: 'force-cache' });
        if (!r.ok) return null;
        const j = await r.json();
        return j && j.disponivel ? (j as Reforma) : null;
      } catch { return null; }
    })();
  }
  return refCache;
}

export function loadErpTabela(): Promise<ErpTabela | null> {
  if (!erpCache) {
    erpCache = (async () => {
      try { const r = await fetch('/data/erp-parametros.json', { cache: 'force-cache' });
        return r.ok ? ((await r.json()) as ErpTabela) : null; } catch { return null; }
    })();
  }
  return erpCache;
}

export function loadDataset(): Promise<Dataset> {
  if (!cache) {
    cache = (async () => {
      const [records, hier, search, rules, meta] = await Promise.all([
        get('ncm.json'), get('hierarquia.json'), get('search.json'), get('regras.json'), get('meta.json'),
      ]);
      const byD8 = new Map<string, Record8>();
      for (const r of records) { byD8.set(r.d8, r); if (!byD8.has(r.ncm)) byD8.set(r.ncm, r); }
      const ds: Dataset = {
        records, byD8, byNcm: byD8, hier, search, rules, meta,
        cest: {}, cfop: [], attrs: { codigos: [], defs: {} },
        pronto: Promise.resolve<Dataset>(null as unknown as Dataset),
      };
      // carga fria em paralelo — nunca bloqueia a primeira classificação
      ds.pronto = (async (): Promise<Dataset> => {
        const [frio, cest, cfop, attrs] = await Promise.all([
          get('ncm-frio.json'), get('cest.json'), get('cfop.json'), get('atributos.json'),
        ]);
        for (const r of records) Object.assign(r, frio[r.d8] || { cest: [], attrs: [] });
        ds.cest = cest; ds.cfop = cfop; ds.attrs = attrs;
        return ds;
      })().catch(() => ds);   // campos frios indisponiveis: nada quebra, painel mostra '—'
      return ds;
    })().catch((e) => { cache = null; throw e; });
  }
  return cache;
}

/** "8471.30.12" | "84713012" -> "84713012" */
export const normalizeNcm = (s: string) => (s || '').replace(/\D/g, '');

export function describePath(ds: Dataset, rec: Record8) {
  return rec.path.map((c) => ({ code: c, desc: ds.hier[c] ?? (c.length === 8 ? rec.desc : '') }));
}

export function labelForLevel(len: number) {
  return len === 2 ? 'Capítulo' : len === 4 ? 'Posição' : len === 6 ? 'Subposição'
    : len === 7 ? 'Item' : 'Subitem';
}

export function fmtCode(c: string) {
  if (c.length === 8) return `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6)}`;
  if (c.length === 6) return `${c.slice(0, 4)}.${c.slice(4)}`;
  return c;
}
