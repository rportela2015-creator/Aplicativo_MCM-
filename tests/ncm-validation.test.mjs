import * as assert from 'node:assert/strict';
import { validarNcmIA } from '../lib/ai/validar.ts';

const fakeMap = new Map([
    ['84713012', { ncm: '84713012', desc: 'Máquinas automáticas', descricao: 'Máquinas automáticas' }],
    ['94013100', { ncm: '94013100', desc: 'Assentos', descricao: 'Assentos' }]
]);

const t = (name, testFn) => {
    try {
        testFn();
        console.log('OK ', name);
    } catch (e) {
        console.error('FAIL', name, e.message);
        process.exit(1);
    }
};

t('Should validate valid 8 digit NCM', () => {
    const result = validarNcmIA({ ncm: '84713012', confianca: 'ALTA' }, fakeMap);
    assert.equal(result.valido, true);
    assert.equal(result.ncm, '84713012');
    assert.equal(result.descricaoNcm, 'Máquinas automáticas');
});

t('Should validate valid NCM with dots', () => {
    const result = validarNcmIA({ ncm: '8471.30.12', confianca: 'MEDIA' }, fakeMap);
    assert.equal(result.valido, true);
    assert.equal(result.ncm, '84713012');
});

t('Should reject nonexistent NCM', () => {
    const result = validarNcmIA({ ncm: '99999999', confianca: 'ALTA' }, fakeMap);
    assert.equal(result.valido, false);
    assert.equal(result.confianca, 'BAIXA');
});

t('Should reject 7 digit NCM', () => {
    const result = validarNcmIA({ ncm: '8471301', confianca: 'ALTA' }, fakeMap);
    assert.equal(result.valido, false);
    assert.equal(result.confianca, 'BAIXA');
});
