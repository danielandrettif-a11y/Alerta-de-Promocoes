const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
  assert.equal(isUsableLabelOption('...'), false);
});

test('clique nativo usa debugger somente para eventos de entrada', () => {
  const root = path.join(__dirname, '..', 'extension');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
  );
  const background = fs.readFileSync(
    path.join(root, 'background.js'),
    'utf8'
  );
  assert.equal(manifest.permissions.includes('debugger'), true);
  assert.match(background, /Input\.dispatchMouseEvent/);
  assert.match(background, /chrome\.debugger\.detach/);
  assert.doesNotMatch(background, /Network\.|Storage\.|Cookies\./);
});
