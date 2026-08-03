const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  LINK_PATTERN,
  normalizedText,
  isShareLabel,
  isUsableLabelOption,
  parsePriceText
} = require('../extension/content/mercado_livre.js');
const shopee = require('../extension/content/shopee.js');

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
  assert.equal(parsePriceText('R$ 5.299,78'), 5299.78);
  assert.equal(parsePriceText('5299.78'), 5299.78);
  assert.equal(parsePriceText('R$ 5.299'), 5299);
  assert.equal(parsePriceText('Preço indisponível'), null);
});

test('fluxo preserva Mercado Livre e isola a automação da Shopee', () => {
  const root = path.join(__dirname, '..', 'extension');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
  );
  const background = fs.readFileSync(
    path.join(root, 'background.js'),
    'utf8'
  );
  const mercadoLivre = fs.readFileSync(
    path.join(root, 'content', 'mercado_livre.js'),
    'utf8'
  );
  const popup = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
  const popupPage = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  assert.equal(manifest.permissions.includes('debugger'), true);
  assert.match(background, /Input\.dispatchMouseEvent/);
  assert.match(background, /chrome\.tabs\.update\(tab\.id, \{ active: true \}\)/);
  assert.match(background, /chrome\.debugger\.detach/);
  assert.match(background, /focused: false,\s+state: 'normal'/);
  assert.match(background, /intervalMs: 1000/);
  assert.match(background, /setTimeout\(resolve, 200\)/);
  assert.match(background, /chrome\.windows\.getLastFocused/);
  assert.match(background, /getOrCreateWorkerTab\(\s*platform,\s*job\.productLink/);
  assert.match(background, /for \(const previousTab of previousTabs\)/);
  assert.match(background, /previousTab\.id === tab\.id/);
  assert.ok(
    background.indexOf('const tab = initialTab || await chrome.tabs.create') <
      background.indexOf('for (const previousTab of previousTabs)'),
    'a próxima aba deve abrir antes de a anterior ser fechada'
  );
  assert.match(background, /navigationReachedTarget/);
  assert.match(background, /async function processMercadoLivreJob/);
  assert.match(background, /async function processShopeeJob/);
  assert.match(background, /createdWindow \|\| platform === 'shopee'/);
  assert.match(background, /for \(let attempt = 0; attempt < 3/);
  assert.match(background, /await closeWorkerWindow\(workerWindowId\)/);
  assert.match(background, /setWindowBounds\(mainWindow\.id,[\s\S]*focused: true/);
  assert.match(mercadoLivre, /if \(!candidates\.length\) return/);
  assert.match(background, /chrome\.windows\.remove\(targetId\)/);
  const closeWorkerWindow = background.slice(
    background.indexOf('async function closeWorkerWindow'),
    background.indexOf('function samePageUrl')
  );
  assert.doesNotMatch(closeWorkerWindow, /chrome\.tabs\.remove/);
  assert.match(background, /state: 'normal',\s+focused: true/);
  assert.doesNotMatch(background, /Network\.|Storage\.|Cookies\./);
  assert.match(background, /title: job\.title, platform: job\.platform/);
  assert.match(popupPage, /id="marketplace-label">Marketplace/);
  assert.match(popup, /state\.currentItem\?\.platform === 'shopee'/);
  assert.match(popup, /state\.lastError \|\| ''/);
});

test('content script aceita somente link curto oficial da Shopee', () => {
  assert.equal(
    'https://s.shopee.com.br/AUso2xdRXP'.match(shopee.LINK_PATTERN)?.[0],
    'https://s.shopee.com.br/AUso2xdRXP'
  );
  assert.equal(
    'https://s.shopee.com.br.example.com/AUso'.match(shopee.LINK_PATTERN),
    null
  );
  assert.equal(shopee.findProductInput({
    querySelectorAll: () => [{
      tagName: 'INPUT',
      placeholder: 'Período dos dados',
      getClientRects: () => [{}],
      getAttribute: () => '',
      closest: () => null
    }]
  }), undefined);
  const productTextarea = {
    tagName: 'TEXTAREA',
    placeholder: '',
    getClientRects: () => [{}],
    getAttribute: () => '',
    closest: () => null
  };
  assert.equal(shopee.findProductInput({
    querySelectorAll: () => [productTextarea]
  }), productTextarea);
  const hiddenCustomLink = {
    href: 'https://affiliate.shopee.com.br/offer/custom_link',
    textContent: '',
    getClientRects: () => [],
    getAttribute: () => '',
    click() { this.clicked = true; }
  };
  assert.equal(shopee.findCustomLinkControl({
    querySelectorAll: () => [hiddenCustomLink]
  }), hiddenCustomLink);
  const offerSubmenu = {
    textContent: 'Oferta',
    querySelector: () => ({ textContent: 'Oferta' }),
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({
      left: 10,
      top: 20,
      width: 20,
      height: 20
    }),
    click() { this.clicked = true; }
  };
  const collapsedMenu = {
    querySelectorAll: selector => selector.includes('submenu-title')
      ? [offerSubmenu]
      : []
  };
  assert.equal(shopee.findOfferControl(collapsedMenu), offerSubmenu);
  const offerActivation = shopee.activateControl('offer', collapsedMenu);
  assert.equal(offerActivation.success, true);
  assert.deepEqual(offerActivation.control.clickPoint, { x: 20, y: 30 });
  assert.equal(offerActivation.activatedProgrammatically, false);
  assert.equal(offerSubmenu.clicked, undefined);
  const root = path.join(__dirname, '..', 'extension');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
  );
  const background = fs.readFileSync(
    path.join(root, 'background.js'),
    'utf8'
  );
  const shopeeContent = fs.readFileSync(
    path.join(root, 'content', 'shopee.js'),
    'utf8'
  );
  assert.equal(
    manifest.host_permissions.includes('https://affiliate.shopee.com.br/*'),
    true
  );
  assert.match(background, /GENERATE_SHOPEE_AFFILIATE_LINK/);
  assert.match(background, /GET_SHOPEE_PAGE_STATE/);
  assert.match(background, /SHOPEE_BLOCKING_CODES/);
  assert.match(background, /async function ensureShopeeConverter/);
  assert.match(background, /CANCEL_SHOPEE_ACTION/);
  assert.match(shopeeContent, /currentLink && currentLink !== previousLink/);
  assert.match(shopeeContent, /state: 'DASHBOARD'/);
  assert.deepEqual(shopee.findPageIssue({
    body: {
      innerText: 'Complete suas Informações de Pagamento e Fiscais'
    }
  }, 'https://affiliate.shopee.com.br/offer/custom_link'), {
    code: 'SHOPEE_ACCOUNT_ACTION_REQUIRED',
    message: 'Complete as Informações de Pagamento e Fiscais na Shopee ' +
      'e clique em Continuar processamento.'
  });
  assert.equal(shopee.findPageIssue({
    body: { innerText: 'Página Inicial / Painel de controle' }
  }, 'https://affiliate.shopee.com.br/dashboard'), null);
  assert.equal(hiddenCustomLink.clicked, undefined);
  const hiddenActivation = shopee.activateControl('custom_link', {
    querySelectorAll: selector => selector.includes('a, button')
      ? [hiddenCustomLink]
      : [],
    readyState: 'complete',
    body: { innerText: '' }
  });
  assert.equal(hiddenActivation.success, true);
  assert.equal(hiddenActivation.activatedProgrammatically, true);
  assert.equal(hiddenCustomLink.clicked, true);
});

test('Shopee distingue painel, gerador pronto e ação de conta', () => {
  const field = {
    tagName: 'TEXTAREA',
    placeholder: 'Insira o link do produto',
    getClientRects: () => [{}],
    getAttribute: () => '',
    closest: () => null
  };
  const button = {
    tagName: 'BUTTON',
    textContent: 'Obter Link',
    disabled: true,
    getClientRects: () => [{}],
    getAttribute: () => ''
  };
  function root({ text = '', fields = [], buttons = [] } = {}) {
    return {
      readyState: 'complete',
      body: { innerText: text },
      querySelectorAll(selector) {
        if (selector === 'input, textarea') return fields;
        if (selector === 'button') return buttons;
        return [];
      }
    };
  }
  assert.equal(shopee.getShopeePageState(
    root({ text: 'Página Inicial / Painel de controle' }),
    'https://affiliate.shopee.com.br/dashboard'
  ).state, 'DASHBOARD');
  assert.equal(shopee.getShopeePageState(
    root({ fields: [field], buttons: [button] }),
    'https://affiliate.shopee.com.br/offer/custom_link'
  ).state, 'READY');
  assert.equal(shopee.findGenerateButton(
    root({ buttons: [button] }),
    { enabledOnly: true }
  ), undefined);
  const accountState = shopee.getShopeePageState(
    root({ text: 'Complete suas Informações de Pagamento e Fiscais' }),
    'https://affiliate.shopee.com.br/dashboard'
  );
  assert.equal(accountState.state, 'ACTION_REQUIRED');
  assert.equal(accountState.code, 'SHOPEE_ACCOUNT_ACTION_REQUIRED');
});

test('detecta somente cupom candidato com preço menor no produto', () => {
  const mercadoLivre = require('../extension/content/mercado_livre.js');
  const priceElement = {
    querySelector: () => null,
    getAttribute: name => name === 'content' ? '199.99' : null,
    textContent: 'R$ 199,99'
  };
  const root = {
    body: {
      innerText: 'Use o cupom MODA10 e pague R$ 179,99 com Cupom',
      textContent: 'Use o cupom MODA10 e pague R$ 179,99 com Cupom'
    },
    querySelector: selector =>
      selector === '[itemprop="price"]' ? priceElement : null,
    querySelectorAll: () => []
  };
  assert.deepEqual(
    mercadoLivre.findProductCoupon([{ code: 'MODA10' }], root),
    {
      code: 'MODA10',
      priceWithoutCoupon: 199.99,
      priceWithCoupon: 179.99
    }
  );
  assert.equal(
    mercadoLivre.findProductCoupon([{ code: 'OUTRO10' }], root),
    null
  );
});
