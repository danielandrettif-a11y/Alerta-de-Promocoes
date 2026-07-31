const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getRecurringPurchaseCategory
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
