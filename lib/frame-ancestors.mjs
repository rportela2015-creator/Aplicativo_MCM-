/**
 * Valor do `Content-Security-Policy: frame-ancestors ...` das páginas.
 * Padrão: só o próprio site ('self'). Origens extras (ex.: preview em iframe) via
 * FRAME_ANCESTORS="https://a.exemplo.com https://b.exemplo.com" (separadas por espaço ou vírgula).
 * Substitui o antigo `X-Frame-Options: ALLOWALL`, que não é um valor válido (= sem proteção).
 */
export function montarFrameAncestors(env = process.env.FRAME_ANCESTORS) {
  const extras = (env || '')
    .split(/[\s,]+/)
    .filter((o) => /^(https?:\/\/[^\s;'"]+|\*\.[^\s;'"]+)$/.test(o));
  return ["'self'", ...extras].join(' ');
}
