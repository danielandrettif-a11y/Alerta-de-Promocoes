const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getRecurringPurchaseCategory,
  mixRecurringDeals
} = require('../execution/category_helper.js');

test('classifica consumiveis sem confundir produtos duraveis', () => {
  assert.equal(
    getRecurringPurchaseCategory('Kit Shampoo e Condicionador 400ml'),
    'Higiene e cuidados pessoais'
  );
  assert.equal(
    getRecurringPurchaseCategory('Ração Premium para Gatos 10kg'),
    'Cuidados com pets'
  );
  assert.equal(getRecurringPurchaseCategory('Cafeteira elétrica 20 xícaras'), null);
  assert.equal(getRecurringPurchaseCategory('Smartphone 256GB'), null);
});

test('mistura recorrentes sem dominar a primeira pagina', () => {
  const regular = Array.from({ length: 15 }, (_, id) => ({
    id,
    recurringPurchase: false
  }));
  const recurring = Array.from({ length: 5 }, (_, id) => ({
    id,
    recurringPurchase: true
  }));
  const mixed = mixRecurringDeals(regular, recurring, 20, 5);

  assert.equal(mixed.length, 20);
  assert.deepEqual(
    mixed.slice(0, 8).map(deal => deal.recurringPurchase),
    [false, false, false, true, false, false, false, true]
  );
});
