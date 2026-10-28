import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const rulesPath = path.resolve('rules', 'rules.json');
const ncmPath = path.resolve('public', 'data', 'ncm.json');
const floorsPath = path.resolve('rules', 'floors.json');

async function runTests() {
  console.log('──────── tests/rules-integrity.test.mjs ────────');

  const raw = fs.readFileSync(rulesPath, 'utf-8');
  const parsed = JSON.parse(raw);

  const floorsRaw = fs.readFileSync(floorsPath, 'utf-8');
  const floors = JSON.parse(floorsRaw);

  for (const key of Object.keys(floors)) {
      const len = Array.isArray(parsed[key]) ? parsed[key].length : (parsed[key] ? Object.keys(parsed[key]).length : 0);
      assert.ok(len >= floors[key], `Should have at least ${floors[key]} items in ${key}`);
      console.log(`OK  ${key} count`);
  }

  // 5. All ncms in existing rules must be in public/data/ncm.json
  const ncmRaw = fs.readFileSync(ncmPath, 'utf-8');
  const ncmData = JSON.parse(ncmRaw);

  const validNcms = new Set();
  if (Array.isArray(ncmData)) {
    for (const item of ncmData) {
      if (item.d8) validNcms.add(item.d8);
    }
  } else {
    for (const key of Object.keys(ncmData)) {
      validNcms.add(key);
    }
  }

  const checkNcms = (rulesArray) => {
    if (!rulesArray) return;
    for (const rule of rulesArray) {
      if (rule.ncms && Array.isArray(rule.ncms)) {
        for (const ncm of rule.ncms) {
          const cleanNcm = ncm.replace(/\./g, '');
          assert.ok(validNcms.has(cleanNcm), `NCM ${cleanNcm} not found in public/data/ncm.json`);
        }
      }
    }
  };
  checkNcms(parsed.armadilhas);
  checkNcms(parsed.notas_legais);
  console.log('OK  NCMs validity in rules');

  // 6. All rules must have unique ids
  const ids = new Set();
  const checkUnique = (rulesArray) => {
    if (!rulesArray) return;
    for (const rule of rulesArray) {
      if (rule.id) {
        assert.ok(!ids.has(rule.id), `Duplicate rule id: ${rule.id}`);
        ids.add(rule.id);
      }
    }
  };
  checkUnique(parsed.armadilhas);
  checkUnique(parsed.notas_legais);
  checkUnique(parsed.rgi);
  console.log('OK  unique ids in rules');

  // 7. Should run sync twice via --dry-run and confirm zero differences on second run
  const run1 = spawnSync(process.execPath, ['scripts/sync_notebook_rules.mjs', '--dry-run'], { encoding: 'utf-8' });
  assert.equal(run1.status, 0, 'First dry-run failed');

  const run2 = spawnSync(process.execPath, ['scripts/sync_notebook_rules.mjs', '--dry-run'], { encoding: 'utf-8' });
  assert.equal(run2.status, 0, 'Second dry-run failed');
  assert.ok(run2.stdout.includes('0 seriam adicionadas'), 'Second run output did not confirm zero differences');
  console.log('OK  sync script dry-runs');

  // 8. Should abort with exit 1 without saving when a reduced copy of rules.json is parsed
  fs.copyFileSync('rules/rules.json', 'rules/rules.json.bak');
  try {
    for (const key of Object.keys(floors)) {
        const reducedRules = JSON.parse(JSON.stringify(parsed));
        if (Array.isArray(reducedRules[key])) {
            reducedRules[key] = reducedRules[key].slice(0, -1);
        } else {
            const firstKey = Object.keys(reducedRules[key])[0];
            delete reducedRules[key][firstKey];
        }
        fs.writeFileSync('rules/rules.json', JSON.stringify(reducedRules, null, 2), 'utf-8');

        const run = spawnSync(process.execPath, ['scripts/sync_notebook_rules.mjs'], { encoding: 'utf-8' });
        assert.equal(run.status, 1, `Sync script did not exit with code 1 on reduced rules for key ${key}`);
        assert.ok(run.stderr.includes('Abortando: número de itens'), `Sync script did not output abort message on reduced rules for key ${key}`);
    }

    // (b) apagar 20 materiais dá falha
    const reducedRulesMat = JSON.parse(JSON.stringify(parsed));
    if (Array.isArray(reducedRulesMat.materiais)) {
        reducedRulesMat.materiais = reducedRulesMat.materiais.slice(0, -20);
    } else {
        const matKeys = Object.keys(reducedRulesMat.materiais);
        for (let i = 0; i < 20 && i < matKeys.length; i++) {
            delete reducedRulesMat.materiais[matKeys[i]];
        }
    }

    fs.writeFileSync('rules/rules.json', JSON.stringify(reducedRulesMat, null, 2), 'utf-8');
    const runMat = spawnSync(process.execPath, ['scripts/sync_notebook_rules.mjs'], { encoding: 'utf-8' });
    assert.equal(runMat.status, 1, `Sync script did not exit with code 1 on removing 20 materiais`);
    assert.ok(runMat.stderr.includes('Abortando: número de itens'), `Sync script did not output abort message on removing 20 materiais`);

    console.log('OK  sync script abortion on reduced rules');
  } finally {
    fs.copyFileSync('rules/rules.json.bak', 'rules/rules.json');
    fs.unlinkSync('rules/rules.json.bak');
  }

  console.log('\nRULES OK ✓\n');
}

runTests().catch((err) => {
  console.error('\n✗ TESTS FAILED:\n', err);
  process.exit(1);
});
