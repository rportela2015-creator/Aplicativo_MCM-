import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

async function runTests() {
    console.log('──────── tests/pipeline.test.mjs ────────');
    const metaPath = path.join(process.cwd(), 'public', 'data', 'meta.json');
    const content = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(content);

    assert.ok(meta.versao, 'versao must be present in meta.json');
    assert.equal(typeof meta.versao, 'string', 'versao must be a string');
    assert.equal(meta.versao.length, 12, 'versao must be 12 chars long');

    assert.ok(meta.gerado_em, 'gerado_em must be present in meta.json');

    const ncmPath = path.join(process.cwd(), 'public', 'data', 'ncm.json');
    const regrasPath = path.join(process.cwd(), 'public', 'data', 'regras.json');

    const ncmBytes = await fs.readFile(ncmPath);
    const regrasBytes = await fs.readFile(regrasPath);

    const hasher = crypto.createHash('sha1');
    hasher.update(ncmBytes);
    hasher.update(regrasBytes);
    const expectedHash = hasher.digest('hex').slice(0, 12);

    assert.equal(meta.versao, expectedHash, 'meta.versao does not match the actual hash of ncm.json + regras.json');
    console.log('OK  Pipeline: (e) meta.json tem versao e gerado_em após o pipeline');
}

await runTests();
