// تست منطق نسخه‌ی ۱۵٫۳: سررسید قسط اول خرید قسطی (آنلاین = لحظه‌ی خرید، حضوری = روز آخر ماه خرید)
const assert = require('assert');
require('../core.js');
const C = globalThis.Core;
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL:', name); throw e; } };
t('online: first installment = purchase date', () => {
  assert.strictEqual(C.bnplFirstDue('1405/08/10', 'online'), '1405/08/10');
});
t('store: last day of purchase month (31 / 30 / 29 / leap 30)', () => {
  assert.strictEqual(C.bnplFirstDue('1405/06/10', 'store'), '1405/06/31'); // شهریور ۳۱ روزه
  assert.strictEqual(C.bnplFirstDue('1405/07/10', 'store'), '1405/07/30'); // مهر ۳۰ روزه
  assert.strictEqual(C.bnplFirstDue('1405/08/10', 'store'), '1405/08/30'); // آبان ۳۰ روزه
  assert.strictEqual(C.bnplFirstDue('1405/12/03', 'store'), '1405/12/29'); // اسفند عادی
  assert.strictEqual(C.bnplFirstDue('1403/12/03', 'store'), '1403/12/30'); // اسفند کبیسه
});
t('store: bought on the last day → due the same day', () => {
  assert.strictEqual(C.bnplFirstDue('1405/08/30', 'store'), '1405/08/30');
  assert.strictEqual(C.bnplFirstDue('1405/06/31', 'store'), '1405/06/31');
});
t('unknown type or bad date → no assumption (null)', () => {
  assert.strictEqual(C.bnplFirstDue('1405/08/10', ''), null);
  assert.strictEqual(C.bnplFirstDue('1405/08/10', undefined), null);
  assert.strictEqual(C.bnplFirstDue('', 'store'), null);
});
t('schedule: store purchase, rest day 31 → last day of each later month', () => {
  const L = { first: C.bnplFirstDue('1405/11/12', 'store'), count: 4, restDay: 31, paid: {} };
  assert.deepStrictEqual([0, 1, 2, 3].map(i => C.loanDue(L, i)), ['1405/11/30', '1405/12/29', '1406/01/31', '1406/02/31']);
});
t('schedule: online purchase keeps first installment on purchase day, months unchanged', () => {
  const L = { first: C.bnplFirstDue('1405/07/25', 'online'), count: 4, restDay: 31, paid: {} };
  assert.deepStrictEqual([0, 1, 2, 3].map(i => C.loanDue(L, i)), ['1405/07/25', '1405/08/30', '1405/09/30', '1405/10/30']);
});
t('obligations: store purchase shows installment 1 in purchase month, not paid', () => {
  const S = { loans: [{ id: 'X', name: 'اسنپ‌پی', amount: 1000, count: 4, first: '1405/08/30', buy: '1405/08/10', mode: 'store', restDay: 31, paid: {} }], fixed: [], incomes: [], tx: [], accounts: [], debts: [] };
  const ob = C.obligationsForMonth(S, '1405/08').filter(o => o.kind === 'loan');
  assert.deepStrictEqual(ob.map(o => [o.key, o.due, o.paid]), [['0', '1405/08/30', false]]);
  assert.deepStrictEqual(C.obligationsForMonth(S, '1405/09').filter(o => o.kind === 'loan').map(o => [o.key, o.due]), [['1', '1405/09/30']]);
});
t('legacy loan (no buy/mode): due dates exactly as before', () => {
  const L = { first: '1405/07/25', count: 3, restDay: 1, paid: {} };
  assert.deepStrictEqual([0, 1, 2].map(i => C.loanDue(L, i)), ['1405/07/25', '1405/08/01', '1405/09/01']);
});
console.log(`v15.3 core: ${n} test groups passed`);
