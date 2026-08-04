const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('todos os fluxos usam o template compartilhado de Stories', () => {
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const generator = fs.readFileSync(
    path.join(root, 'execution', 'generate_stories.js'),
    'utf8'
  );
  const template = fs.readFileSync(
    path.join(root, 'execution', 'story_template.html'),
    'utf8'
  );

  assert.doesNotMatch(app, /drawStoryOnCanvas/);
  assert.equal(
    server.match(/(?<!function )generateStory\(/g)?.length,
    3
  );
  assert.match(server, /generateStoryBuffer\(current\)/);
  assert.match(server, /function prepareStoryGeneration/);
  assert.match(template, /class="watermark-layer"/);
  assert.equal(
    template.match(/fill="url\(#brand-watermarks\)"/g)?.length,
    1
  );
  assert.doesNotMatch(template, /brand-(?:watermarks-between|ads)/);
  assert.match(template, /<text class="wm-name" x="30" y="82">/);
  assert.match(template, /<text class="wm-ad" x="292" y="253">AD<\/text>/);
  assert.equal(template.match(/<line x1=/g)?.length, 2);
  assert.match(template, /Oferta \{\{MARKETPLACE_NAME\}\}/);
  assert.match(template, /\{\{MARKETPLACE_CTA\}\}/);
  assert.match(template, /Com cupom:/);
  assert.match(template, /\{\{COUPON_PRICE\}\}/);
  assert.match(
    server,
    /const confirmedCoupon = isVerifiedCoupon\(deal\.coupon\) \? deal\.coupon : null/
  );
  assert.doesNotMatch(generator, /deal\.couponCandidates\?\.\[0\]/);
  assert.doesNotMatch(generator, /percent \? Number\(percentMatch\[1\]\) : 15/);
});
