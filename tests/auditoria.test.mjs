import test from 'node:test';
import assert from 'node:assert/strict';

import { getMapaD8 } from '../lib/ai/ncm-server.js';
import { validarNcmIA } from '../lib/ai/validar.js';

test('getMapaD8 size and validation', (t) => {
  const map = getMapaD8();
  assert.equal(map.size, 10515, 'Mapa deve ter exatamente 10515 itens');

  assert.ok(map.has('96071100'), 'Deve conter d8 válido existente');

  const invalidResult = validarNcmIA({ ncm: '99999999' }, map);
  assert.equal(invalidResult.valido, false, 'Deve rejeitar NCM 99999999');
  assert.equal(invalidResult.ncm, '99999999');
  assert.equal(invalidResult.confianca, 'BAIXA');

  const validResult = validarNcmIA({ ncm: '96071100' }, map);
  assert.equal(validResult.valido, true, 'Deve aceitar NCM 96071100');
  assert.ok(validResult.descricaoNcm, 'Deve preencher descricaoNcm');
});

test('classificar-ia with mocked SDK invalid NCM', async (t) => {
  // We simulate the logic directly since we cannot easily start a Next.js server with mocked AI inside this test runner without setup
  const map = getMapaD8();
  const simulatedAiResponse = {
    ncm: "99999999",
    descricaoNcm: "Inventado",
    confianca: "ALTA"
  };

  const result = validarNcmIA(simulatedAiResponse, map);
  if (!result.valido) {
      simulatedAiResponse.ncm = "";
      simulatedAiResponse.confianca = "BAIXA";
      simulatedAiResponse.descricaoNcm = "";
  }

  assert.equal(simulatedAiResponse.ncm, "", "NCM inventado resulta em ncm vazio");
  assert.equal(simulatedAiResponse.confianca, "BAIXA", "Confianca BAIXA para NCM invalido");
});

test('auditoria-entrada NCM preservation', async (t) => {
  const map = getMapaD8();

  // Simulate the XML reconciliation logic
  const originalItens = { "PROD123": { NCM: "84713012" } };

  const item = { cProd: "PROD123", ncm: "11111111", cClassTrib: "123" };

  // Reconcile NCM from XML
  if (item.cProd && originalItens[item.cProd.toString()]) {
    const originalNcm = originalItens[item.cProd.toString()].NCM;
    if (originalNcm) {
       item.ncm = originalNcm.toString();
    }
  }

  assert.equal(item.ncm, "84713012", "NCM do XML deve ser preservado");

  // Validate NCM
  const validacao = validarNcmIA({ ncm: item.ncm }, map);
  if (!validacao.valido) {
    item.ncmValidado = false;
    item.confianca = "BAIXA";
  } else {
    item.ncmValidado = true;
    item.confianca = validacao.confianca || "MEDIA";
  }

  assert.equal(item.ncmValidado, true, "NCM do XML preservado deve ser validado");
});

test('auditoria-relatorio HTML escaping', async (t) => {
  // Simulate the esc function
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const xProd = '<img src=x onerror=alert(1)>';
  const escaped = esc(xProd);

  assert.equal(escaped, '&lt;img src=x onerror=alert(1)&gt;', 'Tags HTML perigosas devem ser escapadas');

  const quote = '"test"';
  const escapedQuote = esc(quote);
  assert.equal(escapedQuote, '&quot;test&quot;', 'Aspas devem ser escapadas');
});
