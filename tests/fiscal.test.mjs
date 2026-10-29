import assert from 'node:assert/strict';
import { getFiscalContext } from '../lib/fiscal-context.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const originalCwd = process.cwd();
const originalRegrasPath = path.join(originalCwd, 'public', 'data', 'regras.json');

async function setupTmp() {
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'fiscal-test-'));
    const dataDir = path.join(tmpdir, 'public', 'data');
    await fs.mkdir(dataDir, { recursive: true });

    const content = await fs.readFile(originalRegrasPath, 'utf8');
    const newRegrasPath = path.join(dataDir, 'regras.json');
    await fs.writeFile(newRegrasPath, content);

    process.chdir(tmpdir);
    return { tmpdir, newRegrasPath, content };
}

async function cleanupTmp(tmpdir) {
    process.chdir(originalCwd);
    await fs.rm(tmpdir, { recursive: true, force: true });
}

async function runTests() {
    console.log('──────── tests/fiscal.test.mjs ────────');

    // FiscalContext: (a) 2 chamadas seguidas leem o disco 1x
    {
        const { tmpdir, newRegrasPath } = await setupTmp();

        const orig = fs.readFile;
        let n = 0;
        fs.readFile = (...a) => {
            if (a[0] === newRegrasPath) n++;
            return orig(...a);
        };

        try {
            await getFiscalContext();
            await getFiscalContext();
            assert.equal(n, 1);

            const stat = await fs.stat(newRegrasPath);
            const newTime = new Date(stat.mtimeMs + 5000);
            await fs.utimes(newRegrasPath, newTime, newTime);
            await fs.writeFile(newRegrasPath, '{ "modified": true }');

            await getFiscalContext();
            assert.equal(n, 2);
            console.log('OK  FiscalContext: (a) 2 chamadas seguidas leem o disco 1x');
        } finally {
            fs.readFile = orig;
            await cleanupTmp(tmpdir);
        }
    }

    // FiscalContext: (b) mudar o mtime recarrega
    {
        const { tmpdir, newRegrasPath } = await setupTmp();
        try {
            await getFiscalContext();

            const stat = await fs.stat(newRegrasPath);
            const newTime = new Date(stat.mtimeMs + 5000);
            await fs.utimes(newRegrasPath, newTime, newTime);
            await fs.writeFile(newRegrasPath, JSON.stringify({
                notas_legais: [
                    { titulo: "Test", texto: "Modificado" }
                ]
            }));

            const res = await getFiscalContext();
            assert.ok(res.includes('Modificado'));
            console.log('OK  FiscalContext: (b) mudar o mtime recarrega');
        } finally {
            await cleanupTmp(tmpdir);
        }
    }

    // FiscalContext: (c) arquivo ausente/inválido devolve o fallback e NÃO é cacheado
    {
        const { tmpdir, newRegrasPath, content } = await setupTmp();

        const orig = fs.readFile;
        let n = 0;
        fs.readFile = (...a) => {
            if (a[0] === newRegrasPath) n++;
            return orig(...a);
        };

        try {
            await fs.writeFile(newRegrasPath, '{ invalid json }');
            const stat = await fs.stat(newRegrasPath);
            const newTime = new Date(stat.mtimeMs + 5000);
            await fs.utimes(newRegrasPath, newTime, newTime);

            n = 0; // reset
            const resFail1 = await getFiscalContext();
            const resFail2 = await getFiscalContext();

            assert.ok(resFail1.includes('Ocorreu um erro ao carregar as regras locais'));
            assert.ok(resFail2.includes('Ocorreu um erro ao carregar as regras locais'));
            assert.equal(n, 2);

            await fs.writeFile(newRegrasPath, content);
            const newTime2 = new Date(newTime.getTime() + 5000);
            await fs.utimes(newRegrasPath, newTime2, newTime2);

            const resRecover = await getFiscalContext();
            assert.ok(!resRecover.includes('Ocorreu um erro ao carregar as regras locais'));
            console.log('OK  FiscalContext: (c) arquivo ausente/inválido devolve o fallback e NÃO é cacheado');
        } finally {
            fs.readFile = orig;
            await cleanupTmp(tmpdir);
        }
    }

    // FiscalContext: (d) regra sem ncms não derruba
    {
        const { tmpdir, newRegrasPath } = await setupTmp();
        try {
            await fs.writeFile(newRegrasPath, JSON.stringify({
                notas_legais: [
                    { titulo: "Test", texto: "Sem ncms" }
                ]
            }));
            const stat = await fs.stat(newRegrasPath);
            const newTime = new Date(stat.mtimeMs + 5000);
            await fs.utimes(newRegrasPath, newTime, newTime);

            const res = await getFiscalContext();
            assert.ok(res.includes('Sem ncms'));
            assert.ok(res.includes('NCMs afetados: )') || res.includes('NCMs afetados: \\n') || res.includes('NCMs afetados: '));
            console.log('OK  FiscalContext: (d) regra sem ncms não derruba');
        } finally {
            await cleanupTmp(tmpdir);
        }
    }
}

await runTests();
