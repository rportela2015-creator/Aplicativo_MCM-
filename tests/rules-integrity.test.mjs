import fs from 'fs';
import path from 'path';
import { expect } from 'chai';

const rulesPath = path.resolve('rules', 'rules.json');
const ncmPath = path.resolve('public', 'data', 'ncm.json');
const raw = fs.readFileSync(rulesPath, 'utf-8');
const parsed = JSON.parse(raw);

describe('Rules Integrity Tests', () => {
    it('Should have at least 17 armadilhas', () => {
        expect(parsed.armadilhas.length).to.be.at.least(17);
    });

    it('Should have at least 359 sinonimos', () => {
        expect(Object.keys(parsed.sinonimos).length).to.be.at.least(359);
    });

    it('Should have at least 13 notas_legais', () => {
        expect(parsed.notas_legais.length).to.be.at.least(13);
    });

    it('Should have at least 8 rgi', () => {
        expect(parsed.rgi.length).to.be.at.least(8);
    });

    it('All ncms in existing rules must be in public/data/ncm.json', () => {
        const ncmRaw = fs.readFileSync(ncmPath, 'utf-8');
        const ncmData = JSON.parse(ncmRaw);
        const validNcms = new Set(Object.keys(ncmData));

        const checkNcms = (rulesArray) => {
            if (!rulesArray) return;
            for (const rule of rulesArray) {
                if (rule.ncms && Array.isArray(rule.ncms)) {
                    for (const ncm of rule.ncms) {
                        // O json de ncms contém pontos ou nao dependendo de como esta formatado,
                        // mas regras.json geralmente é sem ponto
                        const cleanNcm = ncm.replace(/\./g, '');
                        expect(validNcms.has(cleanNcm)).to.be.true;
                    }
                }
            }
        };
        checkNcms(parsed.armadilhas);
        checkNcms(parsed.notas_legais);
    });

    it('All rules must have unique ids', () => {
         const ids = new Set();
         const checkUnique = (rulesArray) => {
             if (!rulesArray) return;
             for (const rule of rulesArray) {
                 if (rule.id) {
                     expect(ids.has(rule.id)).to.be.false;
                     ids.add(rule.id);
                 }
             }
         }
         checkUnique(parsed.armadilhas);
         checkUnique(parsed.notas_legais);
         checkUnique(parsed.rgi);
    });
    it('Should run sync twice via --dry-run and confirm zero differences on second run', () => {
        const { spawnSync } = require('child_process');

        // First run
        const run1 = spawnSync(process.execPath, ['scripts/sync_notebook_rules.mjs', '--dry-run'], { encoding: 'utf-8' });
        expect(run1.status).to.equal(0);

        // Second run
        const run2 = spawnSync(process.execPath, ['scripts/sync_notebook_rules.mjs', '--dry-run'], { encoding: 'utf-8' });
        expect(run2.status).to.equal(0);

        expect(run2.stdout).to.include('0 seriam adicionadas');
    });

    it('Should abort with exit 1 without saving when a reduced copy of rules.json is parsed', () => {
        const { spawnSync } = require('child_process');
        const fs = require('fs');

        // Backup original
        fs.copyFileSync('rules/rules.json', 'rules/rules.json.bak');

        try {
            // Write a reduced rules.json
            const reducedRules = { ...parsed };
            reducedRules.armadilhas = reducedRules.armadilhas.slice(0, 5); // reduce
            fs.writeFileSync('rules/rules.json', JSON.stringify(reducedRules, null, 2), 'utf-8');

            const run = spawnSync(process.execPath, ['scripts/sync_notebook_rules.mjs'], { encoding: 'utf-8' });
            expect(run.status).to.equal(1);
            expect(run.stderr).to.include('Abortando: número de itens');
        } finally {
            // Restore original
            fs.copyFileSync('rules/rules.json.bak', 'rules/rules.json');
            fs.unlinkSync('rules/rules.json.bak');
        }
    });
});
