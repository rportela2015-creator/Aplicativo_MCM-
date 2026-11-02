/**
 * Utilitários de segurança das rotas (funções puras / injetáveis, sem Next, sem rede).
 */
import { createHash, timingSafeEqual } from 'node:crypto';

// ------------------------------------------------------------------ autenticação
/** Compara "Authorization: Bearer <token>" com o token esperado em tempo constante. */
export function bearerValido(authorization: string | null | undefined, token: string | null | undefined): boolean {
  if (!token) return false;
  const m = /^Bearer\s+(.+)$/i.exec((authorization ?? '').trim());
  if (!m) return false;
  const a = createHash('sha256').update(m[1]).digest();
  const b = createHash('sha256').update(token).digest();
  return timingSafeEqual(a, b);
}

// ------------------------------------------------------------------ rate limit
export type ResultadoLimite = { ok: true } | { ok: false; retryAfter: number };

/**
 * Token bucket em memória, por chave (IP). Em multi-instância/serverless cada instância tem
 * o seu contador: para limite global use um store externo (Redis/Upstash).
 */
export function criarLimitador(opts: { limite?: number; janelaMs?: number; agora?: () => number } = {}) {
  const limite = opts.limite ?? 20;
  const janelaMs = opts.janelaMs ?? 60_000;
  const agora = opts.agora ?? Date.now;
  const taxaPorMs = limite / janelaMs;
  const baldes = new Map<string, { tokens: number; ultimo: number }>();

  return {
    check(chave: string): ResultadoLimite {
      const t = agora();
      const b = baldes.get(chave) ?? { tokens: limite, ultimo: t };
      b.tokens = Math.min(limite, b.tokens + (t - b.ultimo) * taxaPorMs);
      b.ultimo = t;
      let r: ResultadoLimite;
      if (b.tokens >= 1) {
        b.tokens -= 1;
        r = { ok: true };
      } else {
        r = { ok: false, retryAfter: Math.max(1, Math.ceil((1 - b.tokens) / taxaPorMs / 1000)) };
      }
      baldes.set(chave, b);
      if (baldes.size > 5000) { // poda: descarta baldes já cheios (equivalentes a "novo")
        for (const [k, v] of baldes) if (v.tokens >= limite) baldes.delete(k);
      }
      return r;
    },
  };
}

export function ipDoCliente(headers: { get(nome: string): string | null }): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim() || 'desconhecido';
  return headers.get('x-real-ip')?.trim() || 'local';
}

// ------------------------------------------------------------------ upload
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_TEXTO_PDF = 60_000;

export type ResultadoUpload =
  | { ok: true; tipo: 'xml' | 'pdf' }
  | { ok: false; status: 400 | 413; error: string };

/** Valida nome (extensão) e tamanho ANTES de ler o conteúdo. */
export function validarUploadMeta(nome: string, tamanho: number): ResultadoUpload {
  const n = (nome ?? '').toLowerCase();
  const tipo = n.endsWith('.xml') ? 'xml' : n.endsWith('.pdf') ? 'pdf' : null;
  if (!tipo) return { ok: false, status: 400, error: 'Formato de arquivo não suportado. Apenas XML ou PDF.' };
  if (tamanho > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: `Arquivo excede o limite de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  }
  return { ok: true, tipo };
}

/** Confere os primeiros bytes ("magic bytes"): o conteúdo precisa condizer com a extensão. */
export function validarUploadConteudo(tipo: 'xml' | 'pdf', head: Uint8Array): ResultadoUpload {
  const inicio = Buffer.from(head.subarray(0, 1024));
  if (tipo === 'pdf') {
    if (!inicio.toString('latin1').includes('%PDF')) {
      return { ok: false, status: 400, error: 'O arquivo não é um PDF válido.' };
    }
    return { ok: true, tipo };
  }
  // XML: ignora BOM UTF-8 e espaços; NF-e pode ou não ter a declaração <?xml
  const txt = inicio.toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (!txt.startsWith('<')) return { ok: false, status: 400, error: 'O arquivo não é um XML válido.' };
  return { ok: true, tipo };
}

export function truncarTexto(texto: string, max: number = MAX_TEXTO_PDF): { texto: string; truncado: boolean } {
  if (texto.length <= max) return { texto, truncado: false };
  return { texto: texto.slice(0, max), truncado: true };
}

/**
 * Reduz o bloco `imposto` de um item de NF-e aos grupos que a análise usa
 * (ICMS, IPI, PIS, COFINS, IS, IBSCBS, ICMSUFDest). Remove vTotTrib, II, ISSQN e demais.
 */
const GRUPOS_IMPOSTO = ['ICMS', 'IPI', 'PIS', 'COFINS', 'IS', 'IBSCBS', 'ICMSUFDest'];
export function compactarImposto(imposto: unknown): unknown {
  if (!imposto || typeof imposto !== 'object') return imposto;
  const out: Record<string, unknown> = {};
  for (const g of GRUPOS_IMPOSTO) {
    const v = (imposto as Record<string, unknown>)[g];
    if (v !== undefined && v !== null) out[g] = v;
  }
  return out;
}

// ------------------------------------------------------------------ concorrência / saída
/** Trava de execução única em memória (uma atualização por vez). */
export function criarTrava() {
  let ocupada = false;
  return {
    tentar(): boolean {
      if (ocupada) return false;
      ocupada = true;
      return true;
    },
    liberar(): void { ocupada = false; },
    get ocupada() { return ocupada; },
  };
}

export function ultimosChars(s: string, max = 20_000): string {
  return s.length <= max ? s : `[…saída truncada; últimos ${max} caracteres…]\n${s.slice(-max)}`;
}
