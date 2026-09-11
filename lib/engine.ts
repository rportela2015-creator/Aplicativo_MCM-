/**
 * Motor de classificação fiscal por NCM.
 *
 * Estratégia: retrieval lexical (BM25) sobre a Tabela NCM oficial + aplicação das
 * Regras Gerais de Interpretação (RGI 1-6) e das Notas Legais como *camadas de
 * restrição e desempate*, nunca como substituto do texto legal. O objetivo do motor
 * não é "adivinhar o código": é ranquear candidatos defensáveis e dizer com clareza
 * quando a informação fornecida NÃO basta para fechar o código.
 */
import { Dataset, Record8, normalizeNcm } from './data';

// ------------------------------------------------------------------ normalização
const HTML = /<[^>]*>/g;
const ACCENTS = /[\u0300-\u036f]/g;
const INVALID = /[^a-z0-9<>+%.\s-]/g;

export function normalize(s: string): string {
  if (!s) return '';
  return s
    .replace(HTML, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(ACCENTS, '')
    .replace(/[“”‘’]/g, ' ')
    .replace(/superior a/g, '>')
    .replace(/inferior a/g, '<')
    .replace(INVALID, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'um',
  'uma', 'uns', 'umas', 'para', 'com', 'por', 'que', 'seu', 'sua', 'aos', 'ao', 'as', 'os',
  'the', 'of', 'and', 'e', 'a', 'o']);

/**
 * Redução morfológica mínima, espelha exatamente scripts/pipeline.py:stem().
 * Sem isso "pneu" não casa com "pneus" — e é aí que o retrieval lexical quebra.
 */
export function stem(w: string): string {
  if (w.length > 4 && w.endsWith('s')) {
    const base = w.slice(0, -1);
    if (['ae', 'io', 'ue', 'oe'].includes(base.slice(-2)) || base.length > 3) w = base;
  }
  if (w.length > 5 && w.endsWith('es')) {
    const base = w.slice(0, -2);
    // -eis/-ais (portateis, finais) -> raiz -eio/-aio, casa com portatil/parcial
    if (base.endsWith('i') || ['reis', 'teis', 'vais', 'rais'].includes(w.slice(-4))) w = base + 'io';
    else w = base;
  }
  return w;
}

export function tokenize(s: string): string[] {
  return Array.from(new Set(
    normalize(s).split(/[\s-]+/).map(stem).filter((w) => w.length > 2 && !STOP.has(w)),
  ));
}

export type SignalKey = 'composto' | 'incompleto' | 'parte' | 'medidas' | 'material' | 'uso' | 'marca';
export type ParsedQuery = {
  raw: string; norm: string;
  terms: string[];
  /** termo -> peso (1 = veio do texto do usuário; <1 = expansão por sinônimo) */
  weights: Map<string, number>;
  /** termos que não existem no vocabulário da Tabela NCM */
  unmatched: string[];
  material?: string; uso?: string; medidas: string[]; words?: string[];
  exactNcm?: string;
  signals: Record<SignalKey, boolean>;
  marca?: string;
};

const MARCAS = ['dell', 'lenovo', 'hp', 'asus', 'acer', 'samsung', 'lg', 'xiaomi', 'philco',
  'multilaser', 'positivo', 'consul', 'brastemp', 'eletrolux', 'tramontina', 'arno', 'walita',
  'midea', 'toshiba', 'philips', 'kadix', 'narumi', 'oystra', 'frigelar', 'gelatherm'];

export function parseQuery(text: string, ds: Dataset): ParsedQuery {
  const raw = text || '';
  const norm = normalize(raw);
  const tokens = tokenize(raw);
  const vocab = new Set(ds.search.vocab);
  const weights = new Map<string, number>();

  for (const t of tokens) if (!weights.has(t)) weights.set(t, 1);

  // CASAMENTO POR PALAVRA (nao substring): 'la' nao pode casar com 'latitude',
  // e 'uva' nao pode casar com 'grau'. Multi-token casa como sequencia de palavras.
  const words = norm.split(/\s+/).filter(Boolean);
  const wordSet = new Set(words);
  // Flexoes de genero/numero relevantes: 'plastica'~'plastico', 'metalica'~'metal'.
  // So geramos candidados e o aceite exige que existam no vocabulario da tabela,
  // para 'linha' nao virar 'linho' (materia distinta!) por construcao.

  const materiasStem = new Map<string, string>();
  for (const k of Object.keys(ds.rules.materiais)) materiasStem.set(stem(normalize(k)), k);
  const variants = (w: string) => {
    // Apenas plural -> singular. Trocar vogal de genero inventaria materia falsa
    // ("linha" -> "linho" sao fibras distintas). Formas adjetivais legitimas
    // ("plastica") vivem no dicionario rules.materiais, que e auditavel.
    const base = stem(w);
    return base === w ? [base] : [w, base];
  };
  const hit = (phrase: string) => {
    const ws = normalize(phrase).split(/\s+/).filter(Boolean);
    if (ws.length <= 1) {
      const cands = variants(ws[0]);
      return cands.some((c) => wordSet.has(c) || wordSet.has(stem(c)));
    }
    const s = ' ' + words.map(stem).join(' ') + ' ';
    const target = ws.map(stem).join(' ');
    if (s.includes(' ' + target + ' ')) return true;
    // qualquer combinacao de flexoes das palavras (uso domestico ~ uso domestica)
    const perWord = ws.map((w, i) => (i === ws.length - 1 ? variants(w) : [stem(w)]));
    for (let a = 0; a < perWord[0].length; a++) {
      const seq = [perWord[0][a], ...perWord.slice(1).map((g) => g[0])].join(' ');
      if (s.includes(' ' + seq + ' ')) return true;
    }
    return false;
  };
  const wordMaterias = new Set<string>();
  for (const w of words) { const k = materiasStem.get(stem(w)); if (k) wordMaterias.add(k); }
  let material: string | undefined;
  for (const k of Object.keys(ds.rules.materiais)) {
    if (wordMaterias.has(k) || hit(k)) { material = k; break; }
  }
  let uso: string | undefined;
  for (const k of Object.keys(ds.rules.usos)) if (hit(k)) { uso = k; break; }
  const unmatched = tokens.filter((t) => !vocab.has(t));
  // expansao do dicionario de apelidos -> nomes tecnicos da tabela
  for (const [alias, targets] of Object.entries(ds.rules.sinonimos)) {
    if (!hit(alias)) continue;
    for (const s of targets) {
      for (const x of tokenize(s)) if (vocab.has(x) && !weights.has(x)) weights.set(x, 0.72);
    }
  }

  const MEDIDA = /(\d+(?:[.,]\d+)?)\s?(kg|g|w|v|ah|mah|a|l|ml|cm|mm|m|pol|polegadas?|gb|tb|mb|btu|rpm|hz|bar)\b/g;
  const medidas = Array.from(norm.matchAll(MEDIDA)).map((m) => m[0].trim());
  const foundMarca = MARCAS.find((m) => norm.split(/[\s,;()]+/).includes(m));

  const sig = (k: SignalKey) => (ds.rules.indicadores[k] || [])
    .some((w) => norm.includes(normalize(w)));

  const signals: Record<SignalKey, boolean> = {
    composto: sig('composto'),
    incompleto: sig('incompleto'),
    parte: sig('parte'),
    medidas: medidas.length > 0,
    material: !!material,
    uso: !!uso,
    marca: !!foundMarca,
  };
  const digits = normalizeNcm(raw);
  const exactNcm = digits.length === 8 ? digits : undefined;

  return { raw, norm, terms: tokens, weights, unmatched, material, uso, medidas,
    exactNcm, signals, marca: foundMarca, words };
}

// ------------------------------------------------------------------ pontuação
export type MatchedTerm = { term: string; w: number; where: 'propria' | 'pai' };
export type Candidate = {
  rec: Record8; score: number; coverage: number; matched: MatchedTerm[];
  phrase: boolean; penalizedGeneric: boolean;
};

type Prepared = { own: Set<string>[]; anc: Set<string>[] };
const prepared = new WeakMap<Dataset, Prepared>();

function prepare(ds: Dataset): Prepared {
  let p = prepared.get(ds);
  if (!p) {
    const own: Set<string>[] = [];
    const anc: Set<string>[] = [];
    for (const r of ds.records) {
      own.push(new Set(tokenize(r.desc)));
      const a = new Set<string>();
      for (const c of r.path) {
        const d = ds.hier[c];
        if (!d) continue;
        for (const w of tokenize(d)) a.add(w);
      }
      for (const w of own[own.length - 1]) a.delete(w);
      anc.push(a);
    }
    p = { own, anc };
    prepared.set(ds, p);
  }
  return p;
}

export function classify(text: string, ds: Dataset, opts: { top?: number } = {}): {
  query: ParsedQuery; candidates: Candidate[]; totalWeight: number; corpus: number;
} {
  const q = parseQuery(text, ds);
  const top = opts.top ?? 12;
  const { n } = ds.search;
  const vidx = vocabIndex(ds);
  const pre = prepare(ds);

  // ---- pesos idf por termo (só o que existe no vocabulário da Tabela NCM)
  const idf = new Map<string, number>();
  let queryWeight = 0;      // peso de TODOS os termos relevantes, casados ou não
  for (const term of q.weights.keys()) {
    const gi = vidx.get(term);
    const w = gi === undefined ? fallbackIdf(ds, term) : idfOf(ds, gi);
    idf.set(term, w);
    queryWeight += (q.weights.get(term) || 0) * w;
  }

  // ---- acumulo de pesos por documento
  const matchW = new Float64Array(n);   // soma w*idf dos termos casados
  const ownW = new Float64Array(n);     // idem, restrito à descrição própria
  const ancW = new Float64Array(n);     // idem, vindo dos ancestrais
  const tf = new Uint16Array(n);        // nº de termos casados na descrição própria
  const has = new Uint8Array(n);
  const matchedByDoc = new Map<number, MatchedTerm[]>();

  idf.forEach((idfV, term) => {
    const gi = vidx.get(term);
    if (gi === undefined) return;
    const w = q.weights.get(term) || 0;
    const postings = ds.search.inv[gi];
    const own = pre.own, anc = pre.anc;
    for (let k = 0; k < postings.length; k++) {
      const i = postings[k];
      has[i] = 1;
      const g = w * idfV;
      matchW[i] += g;
      if (own[i].has(term)) { ownW[i] += g; tf[i]++; }
      else ancW[i] += g;
      let arr = matchedByDoc.get(i);
      if (!arr) { arr = []; matchedByDoc.set(i, arr); }
      if (arr.length < 10) arr.push({ term, w, where: own[i].has(term) ? 'propria' : 'pai' });
    }
  });

  // ---- sinônimos de domínio valendo como "evidência forte" (taxonomia da tabela)
  const aliasBoost = computeAliasBoost(q, ds, pre);

  const phrase = phraseHits(q, ds);
  const idfSum = Array.from(q.weights.keys(), (k) => idf.get(k) || 0).reduce((x, y) => x + y, 0) || 1;

  if (q.exactNcm) {
    const rec = ds.byD8.get(q.exactNcm);
    if (rec) { const i = ds.records.indexOf(rec); has[i] = 1; matchW[i] += 1e3; }
  }

  const out: Candidate[] = [];
  const chaptersFromMaterial = q.material ? (ds.rules.materiais[q.material] || []) : [];
  const mods = armadilhaMods(q, ds);
  const permite = armadilhaCandidates(q, ds);
  for (let i = 0; i < n; i++) {
    if (!has[i]) continue;
    const rec = ds.records[i];
    const cov = queryWeight > 0 ? matchW[i] / queryWeight : 0;
    const tfq = idfSum > 0 ? Math.max(0, Math.min(1, ownIdf(i, idf, q, pre) / idfSum)) : 0;
    // evidencia: a descricao propria vale ~3x a do pai (o pai so contextualiza)
    const evidence = ownW[i] + 0.3 * ancW[i];
    const evidenceNorm = Math.sqrt(Math.max(0, evidence) / (idfSum || 1));
    let s = 58 * cov + 118 * evidenceNorm * (0.55 + 0.45 * tfq);
    let penMul = 1;
    if (phrase.has(i)) s += 16;
    if (tf[i] >= 2) s += 5 * Math.min(3, tf[i] - 1);

    // materia declarada e o capitulos dela (RGI 1 + notas de secao)
    if (chaptersFromMaterial.length) {
      s += chaptersFromMaterial.some((c) => rec.d8.startsWith(c)) ? 20 : -13;
    }
    // armadilhas: reforco suave, nunca imposicao
    for (const [mul, chaps, pen] of armadilhaMods(q, ds)) {
      s *= mul;
      if (chaps.length && !chaps.some((c) => rec.d8.startsWith(c))) s -= 9;
      if (pen.some((c) => rec.d8.startsWith(c)) && !armadilhaCandidates(q, ds).has(rec.d8)) s -= 11;
    }
    s *= penMul;
    s *= rec.gen ? 0.93 : 1;
    s *= aliasBoost.get(i) || 1;
    s -= (1 - Math.min(1, cov)) * 42;          // termos o rfaos = descricao com jargao/marca
    out.push({
      rec, score: s, coverage: cov,
      matched: (matchedByDoc.get(i) || []).sort((x, y) => y.w - x.w).slice(0, 6),
      phrase: phrase.has(i), penalizedGeneric: rec.gen === 1,
    });
  }
  out.sort((a, b) => b.score - a.score || a.rec.d8.localeCompare(b.rec.d8));
  return { query: q, candidates: out.slice(0, top), totalWeight: queryWeight, corpus: n };
}

/**
 * Termos de catálogo comercial que NUNCA definem classificação. Se a descrição só tem
 * isso, não há o que classificar — o agente precisa pedir dado, não sugerir código.
 */
function jargao(q: ParsedQuery, ds: Dataset, anchorTerms: string[] = []) {
  const list = ds.rules.jargao_sem_valor_fiscal || [];
  const comuns = new Set((ds.rules.palavras_comuns_na_tabela || []).map((w) => stem(normalize(w))));
  // (b) os únicos termos que ancoraram o match são palavras corriqueiras da tabela
  //     ("casa", "ferro", "linha") -> nada classifica;
  if (cand_anchor_is_generic(anchorTerms, comuns)) return true;
  // (a) a descrição só tem jargão de catálogo (linha/sortido/variedades/produto)
  if (!list.length) return false;
  const ws = new Set((q.words || []).map(stem));
  const hits = list.filter((k) => {
    const parts = normalize(k).split(/\s+/).filter(Boolean).map(stem);
    return parts.length === 1 ? ws.has(parts[0]) : false;
  });
  return hits.length > 0 && q.terms.length <= hits.length + 2;
}

function cand_anchor_is_generic(anchors: string[], comuns: Set<string>) {
  if (!comuns.size || !anchors.length) return false;
  return anchors.every((w) => comuns.has(w) || w.length <= 4);
}

function armadilhaCandidates(q: ParsedQuery, ds: Dataset): Set<string> {
  const s = new Set<string>();
  for (const a of armadilhasAplicaveis(q, ds)) for (const c of a.candidatos || []) s.add(normalizeNcm(c));
  return s;
}
function armadilhaMods(q: ParsedQuery, ds: Dataset): [number, string[], string[]][] {
  return armadilhasAplicaveis(q, ds).map((a) => [
    a.capitulos?.length ? 1.02 : 1, a.capitulos || [], a.penalizar_prefijos || [],
  ]);
}

/** soma de idf dos termos da query que aparecem na descrição própria do documento */
function ownIdf(i: number, idf: Map<string, number>, q: ParsedQuery, pre: Prepared) {
  let s = 0;
  idf.forEach((v, term) => { if (pre.own[i].has(term)) s += (q.weights.get(term) || 0) * v; });
  return s;
}

/** idf de termo fora do vocabulário: vale pouco, mas não zero (ajuda a punir órfãos) */
function fallbackIdf(ds: Dataset, term: string) {
  const dfApprox = term.length <= 3 ? 0.25 * ds.search.n : 0.0005 * ds.search.n;
  return Math.log(1 + (ds.search.n - dfApprox + 0.5) / (dfApprox + 0.5));
}
function idfOf(ds: Dataset, gi: number) {
  const { n, df } = ds.search;
  return Math.log(1 + (n - df[gi] + 0.5) / (df[gi] + 0.5));
}

/**
 * Evidência de domínio: quando a descrição usa um apelido comercial (ex.: "notebook",
 * "air fryer", "tênis"), o produto tem nome técnico na tabela ("máquina automática para
 * processamento de dados", "aparelho para preparação de café"). Esse mapa dá o empurrão
 * exatamente onde o léxico puro falharia — e é auditável, porque vem de um dicionário.
 */
function computeAliasBoost(q: ParsedQuery, ds: Dataset, pre: Prepared): Map<number, number> {
  const boost = new Map<number, number>();
  const keys = Object.keys(ds.rules.sinonimos).filter((k) => {
    const ws = normalize(k).split(/\s+/).filter(Boolean);
    if (ws.length <= 1) return (q.words || []).map(stem).includes(stem(ws[0]));
    return (' ' + (q.words || []).map(stem).join(' ') + ' ').includes(' ' + ws.map(stem).join(' ') + ' ');
  });
  if (!keys.length) return boost;
  const expand = new Set<string>();
  for (const k of keys) for (const s of ds.rules.sinonimos[k]) for (const w of tokenize(s)) expand.add(w);
  if (!expand.size) return boost;
  for (let i = 0; i < ds.records.length; i++) {
    let hits = 0;
    for (const w of expand) if (pre.own[i].has(w) || pre.anc[i].has(w)) hits++;
    if (!hits) continue;
    const b = 1 + 0.16 * Math.min(3, hits);
    boost.set(i, (boost.get(i) || 1) * b);
  }
  return boost;
}

const vocabCache = new WeakMap<Dataset, Map<string, number>>();
function vocabIndex(ds: Dataset) {
  let m = vocabCache.get(ds);
  if (!m) { m = new Map(); ds.search.vocab.forEach((w, i) => m!.set(w, i)); vocabCache.set(ds, m); }
  return m;
}

/** grupos de palavras do usuário que aparecem íntegros na descrição legal */
function phraseHits(q: ParsedQuery, ds: Dataset): Set<number> {
  const hit = new Set<number>();
  const groups = q.norm
    .split(/[,;()]| e | with | c\/ /)
    .map((g) => g.trim())
    .filter((g) => {
      const w = tokenize(g);
      if (w.length >= 2) return true;
      // termo único só vale se for discriminante (idf alto = raro na tabela)
      return w.length === 1 && (q.weights.get(w[0]) ?? 0) > 0 && g.length >= 7;
    });
  if (!groups.length) return hit;
  for (let i = 0; i < ds.records.length; i++) {
    const d = normalize(ds.records[i].desc);
    if (d.length < 10) continue;
    for (const g of groups) {
      if (d.includes(g) || (g.includes(d) && d.length > 14)) { hit.add(i); break; }
    }
  }
  return hit;
}

// ------------------------------------------------------------------ regras aplicáveis
export type RuleNote = {
  kind: 'RGI' | 'Nota Legal' | 'Armadilha' | 'Sinal';
  id: string; titulo: string; texto: string; fonte?: string;
  ncms?: string[]; severidade?: 'info' | 'atencao' | 'critico';
};

export function armadilhasAplicaveis(q: ParsedQuery, ds: Dataset): Dataset['rules']['armadilhas'] {
  const qTerms = new Set((q.words || []).map(stem));
  const qSeq = Array.from(qTerms);
  const hitW = (phrase: string) => {
    const ws = normalize(phrase).split(/\s+/).filter(Boolean).map(stem);
    if (ws.length <= 1) return qTerms.has(ws[0]);
    return (' ' + qSeq.join(' ') + ' ').includes(' ' + ws.join(' ') + ' ');
  };
  return ds.rules.armadilhas.filter((a) => {
    if (!a.quando.filter(hitW).length) return false;
    if (a.materiais?.length && !a.materiais.some(hitW)) return false;
    // guarda 1: a descrição traz um termo que afasta a armadilha (ex.: móvel/assento tem
    //        posição própria, então o critério material do Cap. 39 não deve puxá-lo)
    if (a.exceto_quando?.filter(hitW).length) return false;
    // guarda 2: o próprio item se anuncia como peça/unidade isolada -> a posição de
    //        'Partes' está certa, não há o que penalizar
    if (a.nao_quando?.filter(hitW).length) return false;
    return true;
  });
}

export function buildNotes(cand: Candidate | undefined, q: ParsedQuery, ds: Dataset,
  all: Candidate[]): { notes: RuleNote[]; confidence: number; band: 'alta' | 'media' | 'baixa' } {
  if (!cand) {
    return {
      confidence: 0, band: 'baixa',
      notes: [{
        kind: 'Sinal', id: 'sem-candidato', titulo: 'Nenhum código da Tabela NCM descreve a mercadoria',
        texto: 'As palavras da descrição não aparecem em nenhuma posição/item/subitem vigente. Isso normalmente significa: (i) termo comercial ou marca, (ii) matéria/FUNÇÃO não declarada, ou (iii) produto que a nomenclatura descreve com outra palavra. Reescreva a descrição em termos de matéria e finalidade.',
        severidade: 'critico',
      }],
    };
  }
  const rec = cand.rec;
  const notes: RuleNote[] = [];

  const rgi1 = ds.rules.rgi.find((r) => r.id === 'RGI 1')!;
  notes.push({
    kind: 'RGI', id: rgi1.id, titulo: `RGI 1 — ${rgi1.titulo}`,
    texto: `Sempre a primeira regra. O texto da posição ${rec.path[1] || ''} e as Notas de Seção/Capítulo foram confrontadas com a descrição. ${rgi1.texto}`,
    severidade: 'info',
  });

  if (rec.path.length >= 3) {
    const rgi6 = ds.rules.rgi.find((r) => r.id === 'RGI 6')!;
    notes.push({
      kind: 'RGI', id: 'RGI 6', titulo: `RGI 6 — ${rgi6.titulo}`,
      texto: `Escolhida a posição, o ${rec.lvl} foi comparado apenas com códigos do mesmo nível sob ${rec.path[2] || ''}: ${rgi6.texto}`,
      severidade: 'info',
    });
  }

  if (rec.gen) {
    notes.push({
      kind: 'Sinal', id: 'residual', titulo: 'Código residual ("Outros")',
      texto: 'A descrição legal deste item é genérica. Por RGI 3(a) o código nominal prevalece: confirme que nenhum item específico da mesma subposição descreve melhor o produto.',
      severidade: 'atencao',
    });
  }

  if (q.signals.composto) {
    const r3b = ds.rules.rgi.find((r) => r.id === 'RGI 3(b)')!;
    notes.push({ kind: 'RGI', id: 'RGI 3(b)', titulo: `RGI 3(b) — ${r3b.titulo}`,
      texto: r3b.texto, fonte: 'Artigo misto/kit detectado na descrição', severidade: 'atencao' });
    const r3c = ds.rules.rgi.find((r) => r.id === 'RGI 3(c)')!;
    notes.push({ kind: 'RGI', id: 'RGI 3(c)', titulo: `RGI 3(c) — ${r3c.titulo}`,
      texto: `Se a característica essencial não for identificável, desempata-se pelo maior código numérico entre os elegíveis (no ranking: ${all.slice(0, 2).map((c) => c.rec.ncm).join(' × ')}).`,
      severidade: 'info' });
  }
  if (q.signals.incompleto) {
    const r2a = ds.rules.rgi.find((r) => r.id === 'RGI 2(a)')!;
    notes.push({ kind: 'RGI', id: 'RGI 2(a)', titulo: `RGI 2(a) — ${r2a.titulo}`,
      texto: 'Incompleto, inacabado ou desmontado com a característica essencial do acabado: classifica-se como se completo fosse.',
      fonte: r2a.texto, severidade: 'info' });
  }
  if (q.signals.parte) {
    const n = ds.rules.notas_legais.find((x) => x.alcance.includes('Seção XVI'));
    if (n) notes.push({ kind: 'Nota Legal', id: 'XVI-nota-2-e-3', titulo: n.alcance, texto: n.texto,
      fonte: 'Peça/acessório na descrição — teste as três perguntas: tem posição própria? é de uso geral? é exclusiva da máquina?',
      severidade: 'critico', ncms: n.ncms });
  }
  if (q.material) {
    notes.push({ kind: 'Sinal', id: 'material', titulo: `Matéria declarada: ${q.material}`,
      texto: 'Critério material aplicado como desempate. Se existir posição nominal específica para o artefato (ex.: vassouras em 96.03), ela prevalece sobre o capítulo da matéria.',
      severidade: 'atencao' });
  }

  const chapter = rec.d8.slice(0, 2);
  for (const nl of ds.rules.notas_legais) {
    const tocaCap = nl.alcance.toLowerCase().includes(`capítulo ${chapter}`);
    const tocaNcm = nl.ncms.some((c) => normalizeNcm(c) === rec.d8);
    if (tocaCap || tocaNcm) {
      notes.push({ kind: 'Nota Legal', id: nl.alcance, titulo: `Limite/exclusão — ${nl.alcance}`,
        texto: nl.texto, ncms: nl.ncms, severidade: 'critico',
        fonte: 'Pode deslocar a mercadoria para outro capítulo — verificar antes de firmar o código' });
    }
  }

  for (const a of armadilhasAplicaveis(q, ds)) {
    notes.push({ kind: 'Armadilha', id: a.id, titulo: a.titulo, texto: a.explicacao,
      ncms: a.candidatos || [], fonte: a.fonte, severidade: 'atencao' });
    const falta =
      (a.acao === 'exigir_material' && !q.material) ||
      (a.acao === 'exigir_processo_e_composicao' && !/algodao|poliester|elastano|l[a]|seda|viscose|nylon|pv c|pu /i.test(q.norm)) ||
      (/medidas|potencia|peso/.test(a.acao) && !q.signals.medidas) ||
      (a.acao === 'analisar_finalidade_e_potencia' && !q.signals.medidas);
    if (falta) {
      notes.push({
        kind: 'Sinal', id: `dado-ausente-${a.id}`,
        titulo: `Dado técnico ausente — ${a.titulo}`,
        texto: `A nomenclatura desdobra o código por esse atributo. Sem ele, a escolha entre os itens ${(a.candidatos || []).slice(0, 4).join(', ')} é indistinguível: o 6º-8º dígito não pode ser firmado.`,
        severidade: 'critico',
      });
    }
  }

  if (q.unmatched.length) {
    notes.push({ kind: 'Sinal', id: 'unmatched', titulo: 'Termos sem correspondência na Tabela NCM',
      texto: `Nenhuma entrada oficial contém: ${q.unmatched.slice(0, 8).join(', ')}. Costuma indicar marca/modelo, jargão comercial ou produto descrito pela nomenclatura com outra palavra.`,
      severidade: 'atencao' });
  }
  const anchors = cand.matched.filter((m) => m.where === 'propria').map((m) => m.term);
  const noEvidence = cand.matched.length > 0 && cand.matched.every((m) => m.where === 'pai');
  const longest = Math.max(0, ...cand.matched.map((m) => m.term.length));
  const generico = longest < 5 && !cand.phrase && cand.coverage < 0.62;
  if ((noEvidence || generico || q.terms.length <= 3 || jargao(q, ds, anchors))
      && !q.signals.material && !q.signals.uso) {
    notes.push({ kind: 'Sinal', id: 'insuficiente', titulo: 'Descrição insuficiente para fechar o código',
      texto: 'Sem matéria, uso/aplicação ou composição declarados, o item/subitem (6º-8º dígitos) vira suposição. Peça a ficha técnica antes de parametrizar.',
      severidade: 'critico' });
  }
  if (q.signals.marca) {
    notes.push({ kind: 'Sinal', id: 'marca', titulo: 'Marca/modelo não definem classificação',
      texto: `A descrição contém marca/modelo (${q.marca}). A NCM é objetiva: classifica-se a mercadoria, não o catálogo do fabricante.`,
      severidade: 'info' });
  }

  const s0 = all[0]?.score ?? 0;
  const s1 = all[1]?.score ?? s0;
  const margin = s0 > 0 ? Math.max(0, Math.min(1, (s0 - s1) / s0)) : 0;
  const abs = s0 > 0 ? Math.max(0, Math.min(1, cand.score / (s0 * 1.0001))) : 0;
  const cov = Math.max(0, Math.min(1, cand.coverage));
  const penalty = (rec.gen ? 0.09 : 0)
    + (q.unmatched.length ? Math.min(0.16, q.unmatched.length * 0.04) : 0)
    + (q.terms.length <= 2 ? 0.18 : 0);
  const tokensRicos = q.terms.filter((w) => w.length >= 5).length;
  const semSubstantivo = (tokensRicos === 0 || jargao(q, ds)) ? 0.14 : 0;
  const confidence = Math.max(0, Math.min(0.96,
    0.30 * abs + 0.24 * margin + 0.26 * cov + 0.14 + (cand.phrase ? 0.12 : 0) - penalty - semSubstantivo));
  const band: 'alta' | 'media' | 'baixa' = confidence >= 0.78 ? 'alta' : confidence >= 0.55 ? 'media' : 'baixa';
  return { notes, confidence, band };
}

// ------------------------------------------------------------------ tributação
export function taxes(rec: Record8, ds: Dataset) {
  const cest = (rec.cest || []).map((c) => ({ code: c, ...(ds.cest[c] || { d: '', s: '' }) }));
  return {
    ipi: rec.ipi, ipiNt: rec.ipi_nt === 1,
    ii: rec.ii, tec: rec.tec, bitbk: rec.bitbk, excecao: rec.excecao, extarif: rec.extarif === 1,
    cest, st: cest.length > 0,
    ato: rec.ato, ini: rec.ini, fim: rec.fim,
  };
}
