/**
 * Roda a suíte sobre o TypeScript REAL do app (lib/*.ts), transpilado na hora pelo
 * esbuild e embutido no bundle. Nenhum mock da lógica: são os mesmos módulos que o
 * navegador carrega. Para o teste de lote, o parseCsv é extraído do próprio
 * componente (fonte única), não reimplementado.
 */
import { build, transform } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';

const LIBS = ['data', 'engine', 'parametrizacao', 'reforma', 'xml'];

/** extrai parseCsv de components/Lote.tsx para '.parse-csv.ts' */
async function ensureParse() {
  const src = await readFile('components/Lote.tsx', 'utf8');
  const a = src.indexOf('function parseCsv');
  const b = src.indexOf('const esc =');
  if (a < 0 || b < 0) throw new Error('não localizei parseCsv em components/Lote.tsx');
  const code = '/** gerado por scripts/test.mjs — espelho direto do componente */\n'
    + 'export ' + src.slice(a, b).replace('async function', 'function');
  await writeFile('.parse-csv.ts', code, 'utf8');
}

const inlineTs = {
  name: 'inline-ts',
  setup(b) {
    // caminhos vista de lib/ viram basename ('lib/x.ts'); '.parse-csv.ts' fica na raiz
    b.onResolve({ filter: /\.ts$/ }, (a2) => {
      const base = a2.path.split('/').pop();
      const path = base.startsWith('.') ? base : `lib/${base}`;
      return { path, namespace: 'ts' };
    });
    b.onLoad({ filter: /.*/, namespace: 'ts' }, async (a) => {
      const file = a.path;
      const src = await readFile(file, 'utf8');
      const out = await transform(src, { loader: 'ts', format: 'esm', target: 'node20' });
      const code = out.code.replace(/from "(\.\.?\/[^"]+)"/g,
        (_m, p) => `from "${p.replace(/^(\.\.\/)+/, '').replace(/\.ts$/, '')}.ts"`);
      return { contents: code, loader: 'js', resolveDir: 'lib' };
    });
  },
};

const shim = {
  name: 'shim',
  setup(b) {
    b.onResolve({ filter: /^ncm:libs$/ }, () => ({ path: 'ncm:libs', namespace: 'shim' }));
    b.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({
      contents: LIBS.map((m, i) => `import * as ns${i} from "lib/${m}.ts";`).join('\n')
        + `\nexport const mods = { data: ns0, engine: ns1, param: ns2, reforma: ns3, xml: ns4 };`,
      loader: 'js',
    }));
  },
};

await ensureParse();
let fail = 0;

// 1) ordem de hooks nos componentes (typecheck não pega; quebrar isso é tela branca)
{
  console.log('\n──────── scripts/hookcheck.mjs ────────');
  const r = spawnSync(process.execPath, ['scripts/hookcheck.mjs', 'components'], { stdio: 'inherit' });
  if (r.status !== 0) fail++;
}
// 2) fumaça de UI em DOM real (jsdom) — monta, digita, troca select, desmonta
{
  console.log('\n──────── scripts/ui-smoke.mjs ────────');
  const r = spawnSync(process.execPath, ['scripts/ui-smoke.mjs'], { stdio: 'inherit' });
  if (r.status !== 0) fail++;
}
for (const entry of ['tests/engine.test.mjs', 'tests/lote.test.mjs', 'tests/probe.test.mjs', 'tests/reforma.test.mjs', 'tests/xml.test.mjs']) {
  const out = '.bundle-' + entry.split('/').pop() + '.mjs';
  try {
    await build({
      entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', target: 'node20',
      outfile: out, plugins: [inlineTs, shim], logLevel: 'warning', external: ['react', 'react-dom'],
    });
  } catch { console.error(`✗ build de teste falhou em ${entry}`); fail++; continue; }
  console.log(`\n──────── ${entry} ────────`);
  const r = spawnSync(process.execPath, [out], { stdio: 'inherit' });
  fail += r.status ?? 1;
  await rm(out, { force: true });
}
await rm('.parse-csv.ts', { force: true });
if (fail) { console.error(`\n✗ ${fail} suíte(s) falharam`); process.exit(1); }
console.log('\nSUÍTES COMPLETAS ✓');
