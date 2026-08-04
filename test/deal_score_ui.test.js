const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('painel mostra nota explicavel e ordena pelos sinais comerciais', () => {
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
  for (const platform of ['ml', 'amazon', 'shopee']) {
    assert.match(html, new RegExp(`id="sel-sort-${platform}"`));
  }
  assert.match(app, /function renderPromotionScore/);
  assert.match(app, /commission_amount/);
  assert.match(app, /promotionScore\?\.components\?\.demand/);
  assert.match(css, /\.promotion-score\s*\{/);
  assert.match(app, /Potencial da oferta/);
  assert.match(app, /Avaliação Shopee/);
  assert.match(app, /Array\.from\(\{ length: 5 \}/);
  assert.match(app, /escapeQueueHtml\(scoreExplanation\)/);
  assert.match(css, /\.promotion-star\.is-half/);
  assert.match(html, /id="btn-coupon-tab-shopee"/);
});

test('interface nao oferece Story com preco estimado de cupom', () => {
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  assert.doesNotMatch(app, /btn-coupon-story-action/);
  assert.doesNotMatch(app, /item\.couponCandidates\?\.\[0\]/);
  assert.doesNotMatch(app, /percentMatch\s*\?[^:]+:\s*15/);
});

test('shell publica a mesma versao de cache dos arquivos atuais', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
  const version = worker.match(/promo-automator-v(\d+)/)?.[1];
  assert.ok(version);
  assert.match(html, new RegExp(`style\\.css\\?v=${version}`));
  assert.match(html, new RegExp(`app\\.js\\?v=${version}`));
});
