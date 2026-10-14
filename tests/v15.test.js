// تست منطق نسخه‌ی ۱۵: بخش‌های بدهی و طلب، روش برگشت «معادل ریالی»، تسویه‌ی ماه‌به‌ماه، دلار↔تتر یک‌به‌یک، قرض تکرارشونده
const assert = require('assert');
require('../core.js'); require('../invest.js'); require('../flow.js');
const { Core: C, Flow: F } = globalThis;
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL:', name); throw e; } };
let k = 0; const ctx = { uid: () => 'id' + (++k), now: () => 1700000000000 + k };
const M = i => `1405/${String(i).padStart(2, '0')}/10`;
// حسین: ۱۲ ماه، هر ماه ۳۰ دلار (۳۰۰۰ سنت)؛ معادل ماه i = (۸۷ + i) میلیون ریال
const hossein = () => ({ id: 'H', dir: 'owe', person: 'حسین', asset: 'usd', ret: 'rial', date: M(1), settles: [],
  parts: Array.from({ length: 12 }, (_, i) => ({ id: 'p' + (i + 1), date: M(i + 1), q: 3000, r: (87 + i) * 1e6 })) });
const sumR = (a, b) => { let s = 0; for (let i = a; i <= b; i++) s += (87 + i - 1) * 1e6; return s; };

t('replay: totals = 360$ and sum of monthly equivalents', () => {
  const d = hossein(), R = C.debtRecalc(d);
  assert.strictEqual(d.amount, 36000); assert.strictEqual(R.leftQ, 36000);
  assert.strictEqual(R.totalR, sumR(1, 12)); assert.strictEqual(R.leftR, sumR(1, 12));
});
t('pay 200$: months 1–6 full + 20$ of month 7; rial side reduced the same way', () => {
  const d = hossein(); d.settles.push({ amount: 20000, date: M(12) }); const R = C.debtRecalc(d);
  assert.strictEqual(R.leftQ, 16000);
  assert.deepStrictEqual(R.parts.slice(0, 7).map(p => p.status), ['paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'partial']);
  assert.strictEqual(R.leftR, Math.round(sumR(8, 12) + (87 + 6) * 1e6 / 3));
});
t('pay toman from rial side: oldest months first, partial month proportional', () => {
  const d = hossein(); d.settles.push({ amount: 0, r: sumR(1, 4) + 45e6, date: M(12) }); const R = C.debtRecalc(d);
  // ۴ ماه کامل + نصف ماه پنجم (۹۱ م) → ۱۵ دلار از ماه پنجم
  assert.strictEqual(d.settles[0].amount, 4 * 3000 + Math.round(3000 * 45 / 91));
  assert.strictEqual(R.leftR, sumR(1, 12) - sumR(1, 4) - 45e6);
  assert.strictEqual(R.parts[4].status, 'partial');
});
t('pay whole rial side → closed exactly (no rounding residue)', () => {
  const d = hossein(); d.settles.push({ amount: 0, r: 1e6 * 7, date: M(2) }, { amount: 0, r: sumR(1, 12) - 7e6, date: M(12) }); const R = C.debtRecalc(d);
  assert.strictEqual(R.leftQ, 0); assert.strictEqual(R.leftR, 0); assert.strictEqual(F.debtLeft(d), 0);
});
t('mixed: dollars then toman, both oldest-first', () => {
  const d = hossein(); d.settles.push({ amount: 3000, date: M(3) }, { amount: 0, r: (87 + 1) * 1e6, date: M(4) }); const R = C.debtRecalc(d);
  assert.strictEqual(d.settles[1].amount, 3000); assert.strictEqual(R.leftQ, 30000); assert.strictEqual(R.leftR, sumR(3, 12));
});
t('value of a quantity uses the remaining ratio', () => {
  const d = hossein(); C.debtRecalc(d);
  assert.strictEqual(C.debtRialOf(d, 36000), sumR(1, 12));
});
t('legacy debt without parts: unchanged behavior', () => {
  const d = { id: 'L', dir: 'owe', person: 'علی', asset: 'usd', amount: 5000, date: M(1), settles: [{ amount: 1000, date: M(2) }] };
  const R = C.debtRecalc(d);
  assert.strictEqual(d.amount, 5000); assert.strictEqual(d.settles[0].amount, 1000); assert.strictEqual(R.leftQ, 4000); assert.strictEqual(R.leftR, null);
});
t('unit-return debt ignores r on settles', () => {
  const d = Object.assign(hossein(), { ret: 'unit' }); d.settles.push({ amount: 3000, r: 999, date: M(2) }); const R = C.debtRecalc(d);
  assert.strictEqual(d.settles[0].amount, 3000); assert.strictEqual(R.leftR, null);
});
t('recurring: due occurrences up to a date, skip and confirmed excluded, count/until limits', () => {
  const d = { id: 'R', parts: [{ id: 'a', date: '1405/07/05', q: 3000, r: 1, rec: '1405/07/05' }], rec: { q: 3000, first: '1405/07/05', day: 5, n: 4, skip: ['1405/08/05'] } };
  assert.deepStrictEqual(C.debtRecDue(d, '1405/09/30').map(x => x.due), ['1405/09/05']);
  assert.deepStrictEqual(C.debtRecDue(d, null).map(x => x.due), ['1405/09/05', '1405/10/05']);
  d.rec = { q: 3000, first: '1405/07/05', day: 5, until: '1405/08/20', skip: [] };
  assert.deepStrictEqual(C.debtRecDue(d, null).map(x => x.due), ['1405/08/05']);
  d.rec = { q: 3000, first: '1405/06/31', day: 31, skip: [] };
  assert.strictEqual(C.debtRecDue(d, '1405/07/30').map(x => x.due).join(), '1405/06/31,1405/07/30');
  assert.strictEqual(C.debtRecNext({ rec: { q: 1, first: '1405/07/05', n: 1, skip: ['1405/07/05'] } }), null);
});
console.log(`v15 core: ${n} test groups passed`);

// ---------- با فرم یکپارچه (Flow) ----------
const T0 = '1405/07/19';
function base() {
  return { settings: { unit: 'toman', barAdj: 0 }, accounts: [{ id: 'B1', kind: 'bank', bank: 'بلو', name: 'بلوبانک', num: '', balance: 1000000000, stamp: '1405/07/01 10:00', at: 1 }],
    locations: [{ id: 'L1', name: 'والکس' }], prices: [{ date: '1405/07/10', usd: 1000000, usdt: 1000000, gold: 100000000, silver: 1000000, eur: 1100000, btc: 100000 }],
    ops: [{ id: 'o1', created: 1, date: '1405/07/02', type: 'open', loc: 'L1', in: { a: 'usdt', q: 500e6 }, cost: 450000000 }],
    tx: [], debts: [], loans: [], fixed: [], incomes: [] };
}
const borrow = (S, o) => F.save(S, Object.assign({ kind: 'in', why: 'borrow', acc: '', asset: 'usd', q: 3000, person: 'حسین', date: T0 }, o), null, ctx);
const repay = (S, o) => F.save(S, Object.assign({ kind: 'out', why: 'repay', acc: '', date: T0 }, o), null, ctx);
t('flow: rial-return borrow needs the rial equivalent', () => {
  const S = base(), r = borrow(S, { ret: 'rial', date: '1405/03/10' });
  assert.ok(r.err && r.err.includes('معادل ریالی'), r.err);
  const r2 = borrow(S, { ret: 'rial', value: 87000000, date: '1405/03/10' }); assert.ok(!r2.err, r2.err);
  const d = S.debts[0]; assert.strictEqual(d.ret, 'rial'); assert.strictEqual(d.parts.length, 1); assert.strictEqual(d.parts[0].r, 87000000); assert.deepStrictEqual(d.parts[0].src, r2.ref);
});
t('flow: join adds a part to the open debt; mismatch rejected', () => {
  const S = base(); borrow(S, { ret: 'rial', value: 87000000, date: '1405/03/10' });
  const id = S.debts[0].id;
  const r = borrow(S, { ret: 'rial', value: 91000000, date: '1405/04/10', joinDebt: id }); assert.ok(!r.err, r.err);
  assert.strictEqual(S.debts.length, 1); assert.strictEqual(S.debts[0].amount, 6000); assert.strictEqual(S.debts[0].parts.length, 2);
  const bad = borrow(S, { ret: 'unit', date: '1405/05/10', joinDebt: id }); assert.ok(bad.err);
  const rec = borrow(S, { ret: 'rial', value: 95000000, date: '1405/05/10', joinDebt: id, recKey: '1405/05/10' }); assert.ok(!rec.err);
  assert.strictEqual(S.debts[0].parts[2].rec, '1405/05/10');
  assert.ok(borrow(S, { ret: 'rial', value: 1, date: '1405/05/11', joinDebt: id, recKey: '1405/05/10' }).err, 'same occurrence twice');
});
t('flow: repay rial-return debt with toman → rial side, oldest first', () => {
  const S = base(); borrow(S, { ret: 'rial', value: 87000000, date: '1405/03/10' }); const id = S.debts[0].id;
  borrow(S, { ret: 'rial', value: 91000000, date: '1405/04/10', joinDebt: id });
  const r = repay(S, { acc: 'B1', asset: 'irr', q: 100000000, debt: id }); assert.ok(!r.err, r.err);
  const d = S.debts[0], R = C.debtReplay(d);
  assert.strictEqual(d.settles[0].r, 100000000); assert.strictEqual(R.leftR, 78000000);
  assert.strictEqual(d.settles[0].amount, 3000 + Math.round(3000 * 13 / 91)); assert.strictEqual(r.info.settle.leftR, 78000000);
  // بیشتر از مانده‌ی ریالی: فقط تا مانده
  const r2 = repay(S, { acc: 'B1', asset: 'irr', q: 90000000, debt: id }); assert.ok(r2.info.settle.over); assert.strictEqual(F.debtLeft(S.debts[0]), 0);
  assert.ok(S.debts[0].closed);
});
t('flow: repay usd debt with tether 1:1 (both return types)', () => {
  for (const ret of ['rial', 'unit']) {
    const S = base(); borrow(S, { ret, value: 87000000, date: '1405/03/10' }); const id = S.debts[0].id;
    const r = repay(S, { acc: 'L1', asset: 'usdt', q: 20e6, debt: id }); assert.ok(!r.err, r.err);
    assert.strictEqual(S.debts[0].settles[0].amount, 2000); assert.strictEqual(S.debts[0].settles[0].r, undefined);
  }
});
t('flow: repay rial-return debt with gold → value goes to rial side; unit-return converts by price', () => {
  const S = base(); S.ops.push({ id: 'og', created: 2, date: '1405/07/02', type: 'open', loc: 'L1', in: { a: 'gold', q: 5000 }, cost: 500000000 });
  borrow(S, { ret: 'rial', value: 87000000, date: '1405/03/10' }); const id = S.debts[0].id;
  const r = repay(S, { acc: 'L1', asset: 'gold', q: 300, value: 30000000, debt: id }); assert.ok(!r.err, r.err);
  assert.strictEqual(S.debts[0].settles[0].r, 30000000);
  const S2 = base(); borrow(S2, { ret: 'unit', date: '1405/03/10' }); const id2 = S2.debts[0].id;
  const r2 = repay(S2, { acc: '', asset: 'irr', q: 10000000, debt: id2 }); assert.ok(!r2.err, r2.err);
  assert.strictEqual(S2.debts[0].settles[0].amount, 1000); // ۱ میلیون تومان = ۱۰ دلار با قیمت ۱۰۰ هزار تومان
});
t('flow: edit one part keeps the others; delete a part keeps the debt; last part + no settles removes it', () => {
  const S = base(); const r1 = borrow(S, { ret: 'rial', value: 87000000, date: '1405/03/10' }); const id = S.debts[0].id;
  const r2 = borrow(S, { ret: 'rial', value: 91000000, date: '1405/04/10', joinDebt: id });
  const E = F.read(S, r2.ref); assert.strictEqual(E.inDebt, id); assert.strictEqual(E.value, 91000000); assert.strictEqual(E.ret, 'rial');
  const re = F.save(S, Object.assign(E, { q: 4000, value: 120000000 }), r2.ref, ctx); assert.ok(!re.err, re.err);
  assert.strictEqual(S.debts[0].amount, 7000); assert.strictEqual(S.debts[0].parts.find(p => p.src && p.src.tx === r2.ref.tx).r, 120000000);
  const bad = F.save(S, Object.assign(F.read(S, r2.ref), { person: 'علی' }), r2.ref, ctx); assert.ok(bad.err);
  assert.ok(F.remove(S, r2.ref).ok); assert.strictEqual(S.debts[0].parts.length, 1); assert.strictEqual(S.debts[0].amount, 3000);
  assert.ok(F.remove(S, r1.ref).ok); assert.strictEqual(S.debts.length, 0);
});
t('flow: deleting a rial-side payment restores the rial side', () => {
  const S = base(); borrow(S, { ret: 'rial', value: 87000000, date: '1405/03/10' }); const id = S.debts[0].id;
  const r = repay(S, { acc: 'B1', asset: 'irr', q: 87000000, debt: id }); assert.ok(S.debts[0].closed);
  assert.ok(F.remove(S, r.ref).ok); assert.ok(!S.debts[0].closed); assert.strictEqual(C.debtReplay(S.debts[0]).leftR, 87000000);
});
t('flow: rial auto only for today or a day with a recorded price', () => {
  const S = base();
  assert.strictEqual(F.rialAuto(S, 'usd', 3000, '1405/07/10'), 30000000);
  assert.strictEqual(F.rialAuto(S, 'usd', 3000, '1405/03/10'), null);
  assert.strictEqual(F.rialAuto(S, 'usd', 3000, globalThis.J.today()), 30000000);
});
t('flow: legacy debt made by «قرض گرفتم» (d.src, no parts) still edits and deletes through its transaction', () => {
  const S = base(); const r = borrow(S, { ret: 'unit', date: '1405/06/10' });
  const d = S.debts[0]; delete d.parts; d.src = r.ref; d.amount = 3000; // شکل نسخه‌ی ۱۴
  repay(S, { acc: '', asset: 'usd', q: 1000, debt: d.id });
  F.ensureParts(S.debts[0]); C.debtRecalc(S.debts[0]);
  assert.deepStrictEqual(S.debts[0].parts[0].src, r.ref);
  const E = F.read(S, r.ref); assert.strictEqual(E.person, 'حسین');
  assert.ok(!F.save(S, Object.assign(E, { q: 5000 }), r.ref, ctx).err);
  assert.strictEqual(S.debts[0].amount, 5000); assert.strictEqual(F.debtLeft(S.debts[0]), 4000);
  const rm = F.remove(S, r.ref); assert.ok(rm.ok); assert.strictEqual(rm.info.keptDebt, S.debts[0].id); // تسویه داره → می‌مونه
});
console.log(`v15 flow: ${n} test groups passed (total)`);
