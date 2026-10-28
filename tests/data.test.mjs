import assert from 'node:assert/strict';
import { mods } from 'ncm:libs';

const { fmtCode } = mods.data;

const t = (nome, fn) => {
  try {
    fn();
    console.log(`OK  ${nome}`);
  } catch (e) {
    console.log(`XX  ${nome}\n    ${e.message}`);
    process.exit(1);
  }
};

t('fmtCode converte código de 8 dígitos para formato NCM', () => {
  assert.equal(fmtCode('84713012'), '8471.30.12');
  assert.equal(fmtCode('01012100'), '0101.21.00');
});

t('fmtCode converte código de 6 dígitos para formato subposição', () => {
  assert.equal(fmtCode('847130'), '8471.30');
  assert.equal(fmtCode('010121'), '0101.21');
});

t('fmtCode retorna original para códigos de outros tamanhos', () => {
  assert.equal(fmtCode('8471'), '8471');
  assert.equal(fmtCode('84'), '84');
  assert.equal(fmtCode('847130123'), '847130123');
  assert.equal(fmtCode(''), '');
});

t('fmtCode ignora valores já formatados e lida com edge cases de formatação', () => {
  assert.equal(fmtCode('8471.30.12'), '8471.30.12');
  assert.equal(fmtCode('8471.30'), '8471.30');
});
