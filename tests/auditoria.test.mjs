
import assert from 'node:assert';
import { getFiscalContext } from '../lib/fiscal-context.ts';

async function runTests() {
  console.log('──────── tests/auditoria.test.mjs ────────');

  // Test Fiscal Context
  const context = await getFiscalContext();
  assert.ok(context.includes('Contexto Fiscal e Reforma Tributária'), 'Context should contain the header');
  assert.ok(context.includes('Diretrizes:'), 'Context should contain guidelines');
  assert.ok(context.includes('Retorne um JSON estrito'), 'Context should ask for JSON');
  console.log('OK  getFiscalContext: reads and compiles context successfully');

  console.log('\nAUDITORIA OK ✓\n');
}

await runTests();
