#!/usr/bin/env node
/**
 * Caça a classe de bug que o typecheck NÃO pega: hook do React chamado depois de um
 * `return` antecipado do corpo, ou encravado dentro de um bloco condicional. O React exige
 * o mesmo número e a mesma ordem de hooks em todo render — quebrar isso é tela branca no
 * navegador ("Rendered more hooks than during the previous render").
 *
 * Uso: node scripts/hookcheck.mjs [pasta]     saída 0 = limpo · 1 = violações · 2 = nada varrido
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const RAIZ = process.argv[2] || 'components';
const NOMES = /(?:export\s+)?(?:default\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(|(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>\s*\{/g;
const HOOK = /^use[A-Z][A-Za-z0-9_]*\s*\(/;

/** zera comentários e strings (que não podem contar como chave) preservando as posições */
function limpar(src) {
  const out = src.split('');
  const branco = (i) => { out[i] = src[i] === '\n' ? '\n' : ' '; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') { branco(i); i++; } continue; }
    if (c === '/' && d === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { branco(i); i++; }
      branco(i); branco(i + 1); i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; branco(i); i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') { branco(i); i++; } branco(i); i++; }
      branco(i); continue;
    }
  }
  return out.join('');
}

/** do '(' do cabeçalho de `function Nome(...)` até o '{' que abre o corpo */
function abrirCorpo(src, desde) {
  let pta = 0;
  for (let k = desde; k < src.length; k++) {
    if (src[k] === '(') pta++;
    else if (src[k] === ')') pta = Math.max(0, pta - 1);
    else if (src[k] === '{' && pta === 0) return k;
  }
  return src.length;
}
function fecharEm(src, abre) {
  let prof = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}' && --prof === 0) return i;
  }
  return src.length;
}

const arquivos = (await readdir(RAIZ).catch(() => [])).filter((f) => /\.tsx?$/.test(f)).sort();
if (!arquivos.length) { console.log(`hookcheck: nada em ${RAIZ}`); process.exit(2); }

let violacoes = 0;
for (const nome of arquivos) {
  const bruto = await readFile(join(RAIZ, nome), 'utf8');
  const src = limpar(bruto);
  const linha = (i) => bruto.slice(0, i).split('\n').length;
  NOMES.lastIndex = 0;
  let m;
  while ((m = NOMES.exec(src))) {
    const componente = m[1] || m[2];
    const abre = m[0].trimEnd().endsWith('{') ? m.index + m[0].lastIndexOf('{')
      : abrirCorpo(src, m.index + m[0].length);
    const fim = fecharEm(src, abre);
    let prof = 0, primeiroReturn = -1;
    const eventos = [];
    for (let i = abre + 1; i < fim; i++) {
      const ch = src[i];
      if (ch === '{') { prof++; continue; }
      if (ch === '}') { prof--; continue; }
      if (prof === 0 && src.startsWith('return', i) && !/[\w$.]/.test(src[i - 1] || ' ') && primeiroReturn < 0) {
        primeiroReturn = i; continue;
      }
      if (prof > 0) continue;
      const pedaco = src.slice(i, i + 34);
      if (!HOOK.test(pedaco)) continue;
      const hook = pedaco.match(/^use[A-Z][A-Za-z0-9_]*/)[0];
      eventos.push({ i, hook });
      i += hook.length;
    }
    // 1) hook depois de um return no topo do corpo
    if (primeiroReturn >= 0) {
      for (const e of eventos) {
        if (e.i < primeiroReturn) continue;
        if (src.slice(primeiroReturn, e.i).includes('function ')) continue;   // callback: outro escopo
        console.log(`XX ${nome}:${linha(e.i)} — ${e.hook}() em ${componente}() vem depois de um return antecipado do corpo`);
        violacoes++;
      }
    }
    // 2) hook encravado em bloco condicional/laço (if/for/try/map…) do corpo
    prof = 0;
    for (let i = abre + 1; i < fim; i++) {
      const ch = src[i];
      if (ch === '{') { prof++; continue; }
      if (ch === '}') { prof--; continue; }
      if (prof <= 0) continue;
      const pedaco = src.slice(i, i + 34);
      if (!HOOK.test(pedaco)) continue;
      const abreAntes = src.lastIndexOf('{', i - 1);
      const cab = src.slice(Math.max(0, abreAntes - 30), abreAntes);
      if (/\b(?:if|for|while|switch|try|catch|map|forEach|filter)\s*\(/.test(cab)) {
        const hook = pedaco.match(/^use[A-Z][A-Za-z0-9_]*/)[0];
        console.log(`XX ${nome}:${linha(i)} — ${hook}() em ${componente}() está dentro de um bloco condicional`);
        violacoes++;
      }
      i += hook_len(pedaco);
    }
  }
}
function hook_len(s) { return (s.match(/^use[A-Z][A-Za-z0-9_]*/) || [''])[0].length; }

console.log(violacoes === 0
  ? `hookcheck OK ✓ (${arquivos.length} arquivos, ordem de hooks fixa em todo render)`
  : `hookcheck: ${violacoes} violação(ões) de ordem de hook`);
process.exit(violacoes ? 1 : 0);
