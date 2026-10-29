import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

async function runTests() {
    console.log('──────── tests/pipeline.test.mjs ────────');

    // We might need to run the pipeline first to ensure it's generated?
    // Actually the prompt says "meta.versao presente após o pipeline."
    // And in the esbuild bundle the tests run in isolated context. We should just read it!

    const metaPath = path.join(process.cwd(), 'public', 'data', 'meta.json');
    const content = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(content);

    assert.ok(meta.versao, 'versao must be present in meta.json');
    assert.equal(typeof meta.versao, 'string', 'versao must be a string');
    assert.equal(meta.versao.length, 12, 'versao must be 12 chars long');

    assert.ok(meta.gerado_em, 'gerado_em must be present in meta.json');
    console.log('OK  Pipeline: (e) meta.json tem versao e gerado_em após o pipeline');
}

await runTests();
