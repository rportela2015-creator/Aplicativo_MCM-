#!/usr/bin/env node
/**
 * Fumaça de UI: empacota scripts/ui-entry.tsx (esbuild, mesmo pipeline do `npm test`) e roda
 * os componentes num DOM real (jsdom) com os dados de public/data. Pega o que typecheck e
 * teste de lib não pegam: ordem de hooks entre renders, estado que some, JSX que quebra,
 * texto que a UI promete e não mostra.
 *
 * Requer jsdom: npm i -D jsdom
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';

if (!existsSync('node_modules/jsdom')) {
  console.error('XX jsdom ausente — rode `npm i -D jsdom` para a fumaça de UI');
  process.exit(1);
}
if (!existsSync('public/data/ncm.json')) {
  console.error('XX public/data/ncm.json ausente — rode `npm run build:dados` antes da fumaça de UI');
  process.exit(1);
}

const SAIDA = '.ui-bundle.mjs';
try {
  await build({
    absWorkingDir: process.cwd(),
    entryPoints: ['scripts/ui-entry.tsx'],
    bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: SAIDA,
    loader: { '.css': 'empty' },
    tsconfig: './tsconfig.json', alias: { '@': '.' },
    external: ['react', 'react-dom', 'react-dom/client', 'jsdom', 'node:fs/promises', 'node:fs'],
    logLevel: 'warning', define: { 'process.env.NODE_ENV': '"development"' },
  });
} catch (e) {
  console.error('XX falha ao empacotar a fumaça de UI:', String(e && e.message || e));
  process.exit(1);
}
const r = spawnSync(process.execPath, [SAIDA], { stdio: 'inherit', cwd: process.cwd() });
await rm(SAIDA, { force: true });
process.exit(r.status ?? 1);
