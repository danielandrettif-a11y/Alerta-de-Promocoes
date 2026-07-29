const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LINK_PATTERN,
  normalizedText,
  isShareLabel,
  isUsableLabelOption
} = require('../extension/content/mercado_livre.js');

test('content script normaliza texto e aceita somente link meli.la esperado', () => {
  assert.equal(normalizedText('  Compartilhar  ').trim(), 'compartilhar');
  assert.equal('https://meli.la/AbC_123-x'.match(LINK_PATTERN)?.[0],
    'https://meli.la/AbC_123-x');
  assert.equal('https://meli.la.example/ABC'.match(LINK_PATTERN), null);
  assert.equal(isShareLabel('Compartilhar'), true);
  assert.equal(isShareLabel('Compartilhar e ganhar'), true);
  assert.equal(isShareLabel('Gerar link'), false);
  assert.equal(isUsableLabelOption('Ofertas do Instagram'), true);
  assert.equal(isUsableLabelOption('Selecione uma etiqueta'), false);
  assert.equal(isUsableLabelOption('Criar etiqueta'), false);
  assert.equal(isUsableLabelOption('Nenhuma etiqueta disponível'), false);
});
