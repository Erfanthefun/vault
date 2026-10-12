// نسخه‌ی ۱۴: برنامه‌ی بازپرداخت بدهی و طلب، بالانس ماه، واحد اقساط وام
const assert = require('assert');
require('../core.js'); const C = globalThis.Core;
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL:', name); throw e; } };
const D = (o) => Object.assign({ id: 'd', dir: 'owe', person: 'x', asset: 'irr', amount: 4500, date: '1405/01/01', due: null, settles: [] }, o);
const plan = { amount: 500, first: '1405/02/01' };

t('none and date modes', () => {
  assert.strictEqual(C.debtSchedule(D({}), '1405/03/01').mode, 'none');
  const sc = C.debtSchedule(D({ due: '1405/02/10', settles: [{ amount: 1000, date: '1405/02/05' }] }), '1405/02/11');
  assert.strictEqual(sc.mode, 'date'); assert.strictEqual(sc.next.status, 'late'); assert.strictEqual(sc.next.left, 3500);
  assert.strictEqual(C.debtSchedule(D({ due: '1405/02/10' }), '1405/02/10').next.status, 'due');
  assert.strictEqual(C.debtSchedule(D({ due: '1405/02/10', settles: [{ amount: 4500, date: '1405/02/12' }] }), '1405/02/20').next, null);
});
t('plan without payments: 9 × 500', () => {
  const sc = C.debtSchedule(D({ plan }), '1405/01/15');
  assert.strictEqual(sc.items.length, 9); assert(sc.items.every(i => i.amount === 500 && i.status === 'due'));
  assert.strictEqual(sc.items[8].due, '1405/10/01');
});
t('plan: uneven last installment', () => {
  const sc = C.debtSchedule(D({ amount: 1200, plan }), '1405/01/15');
  assert.deepStrictEqual(sc.items.map(i => i.amount), [500, 500, 200]);
});
t('partial closes after grace; rest rebuilt from remainder', () => {
  const d = D({ plan, settles: [{ amount: 300, date: '1405/02/03' }] });
  const open = C.debtSchedule(d, '1405/02/10'); // هنوز در پنجره
  assert.strictEqual(open.items[0].status, 'late'); assert.strictEqual(open.items[0].left, 200); assert.strictEqual(open.next.i, 0);
  const sc = C.debtSchedule(d, '1405/02/20'); // پنجره بسته شد
  assert.strictEqual(sc.items[0].status, 'partial'); assert.strictEqual(sc.items[0].paidQ, 300);
  assert.strictEqual(sc.items.length, 1 + Math.ceil(4200 / 500)); assert.strictEqual(sc.items[sc.items.length - 1].amount, 200);
  assert.strictEqual(sc.next.i, 1);
});
t('missed installment (nothing paid) does not become debt-late; next moves on', () => {
  const sc = C.debtSchedule(D({ plan }), '1405/02/25');
  assert.strictEqual(sc.items[0].status, 'missed'); assert.strictEqual(sc.next.i, 1); assert.strictEqual(sc.items.length, 10);
});
t('late payment within grace counts for that installment', () => {
  const sc = C.debtSchedule(D({ plan, settles: [{ amount: 500, date: '1405/02/12' }] }), '1405/02/20');
  assert.strictEqual(sc.items[0].status, 'paid');
});
t('overpay shortens the tail, does not prefill next', () => {
  const sc = C.debtSchedule(D({ plan, settles: [{ amount: 800, date: '1405/02/01' }] }), '1405/02/20');
  assert.strictEqual(sc.items[0].status, 'paid'); assert.strictEqual(sc.items[1].paidQ, 0);
  assert.strictEqual(sc.items.length, 1 + Math.ceil(3700 / 500));
});
t('early second payment in same window spills to next installment', () => {
  const sc = C.debtSchedule(D({ plan, settles: [{ amount: 500, date: '1405/02/01' }, { amount: 500, date: '1405/02/05' }] }), '1405/02/06');
  assert.strictEqual(sc.items[0].status, 'paid'); assert.strictEqual(sc.items[1].status, 'paid'); assert.strictEqual(sc.next.i, 2);
});
t('fully paid: no next', () => {
  const sc = C.debtSchedule(D({ amount: 1000, plan, settles: [{ amount: 1000, date: '1405/02/01' }] }), '1405/02/02');
  assert.strictEqual(sc.next, null); assert.strictEqual(sc.left, 0);
});
t('debtFlow: only scheduled debts, from sched date, by direction', () => {
  const st = { tx: [{ id: 'a', amount: 700 }], ops: [], loans: [], debts: [
    D({ id: '1', plan, sched: '1405/02/01', settles: [{ amount: 500, date: '1405/02/05', txId: 'a' }, { amount: 100, date: '1405/01/20' }] }),
    D({ id: '2', settles: [{ amount: 900, date: '1405/02/06' }] }),
    D({ id: '3', dir: 'owed', due: '1405/03/01', sched: '1405/01/01', settles: [{ amount: 250, date: '1405/02/07' }] })] };
  const f = C.debtFlow(st, '1405/02', '1405/02/30');
  assert.strictEqual(f.out, 700); assert.strictEqual(f.in, 250); assert.strictEqual(f.bal, -450);
  assert.strictEqual(C.debtFlow(st, '1405/01', '1405/02/30').out, 0); // قبل از sched
});
t('loan unit: converted with rate; irr untouched', () => {
  C.setRate(a => a === 'usdt' ? 1.5 : null);
  assert.strictEqual(C.loanAmt({ amount: 1000 }), 1000);
  assert.strictEqual(C.loanAmt({ amount: 1000, unit: 'usdt' }), 1500);
  assert.strictEqual(C.loanAmt({ amount: 1000, unit: 'gold' }), 0);
  const s = C.loanSummary({ amount: 100, unit: 'usdt', count: 4, first: '1405/01/01', paid: { 0: { date: '1405/01/01' } } });
  assert.strictEqual(s.remainingQty, 300); assert.strictEqual(s.remainingAmount, 450);
  C.setRate(null);
});
console.log(`v14: ${n} test groups passed`);
