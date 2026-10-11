// تست منطق ثبت یکپارچه‌ی نسخه‌ی ۱۲ (flow.js): برداشت/واریز/انتقال/تبدیل با هر دارایی در هر حساب، بدهی و طلب، ویرایش و حذف
const assert = require('assert');
require('../core.js'); require('../invest.js'); require('../flow.js');
const { Core: C, V, Flow: F } = globalThis;
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL:', name); throw e; } };
let k = 0; const ctx = { uid: () => 'id' + (++k), now: () => 1700000000000 + k };
const T0 = '1405/07/19', D = d => d || T0;

function base() {
  return {
    settings: { unit: 'toman', barAdj: 0 },
    accounts: [
      { id: 'B1', kind: 'bank', bank: 'بلو', name: 'بلوبانک', num: '', balance: 1000000000, stamp: '1405/07/01 10:00', at: 1 },
      { id: 'B2', kind: 'bank', bank: 'سامان', name: 'سامان', num: '', balance: 200000000, stamp: '1405/07/01 10:00', at: 1 },
      { id: 'C1', kind: 'credit', name: 'اسنپ‌پی اعتباری', limit: 100000000, paid: {}, settles: [] }],
    locations: [{ id: 'L1', name: 'والکس' }, { id: 'L2', name: 'نوبیتکس' }, { id: 'L3', name: 'وال‌گلد' }],
    prices: [{ date: '1405/07/10', gold: 100000000, usdt: 1000000, usd: 1000000, btc: 100000, silver: 1000000, eur: 1100000 }],
    ops: [
      { id: 'o1', created: 1, date: '1405/07/02', type: 'open', loc: 'L1', in: { a: 'usdt', q: 200e6 }, cost: 180000000 },   // ۲۰۰ تتر با بهای ۹۰ هزار تومان
      { id: 'o2', created: 2, date: '1405/07/02', type: 'open', loc: 'L1', in: { a: 'irr', q: 100000000 }, cost: 100000000 }  // ۱۰ م تومان ریال در والکس
    ],
    tx: [], loans: [{ id: 'ln', name: 'وام بلو', lender: 'بلوبانک', amount: 50000000, count: 12, first: '1405/05/15', cat: 'قسط وام', paid: {} }],
    fixed: [], incomes: [], goals: [], lists: {}, categories: { expense: ['غذا', 'کادو'], income: ['حقوق', 'هدیه'] },
    debts: [
      { id: 'dA', dir: 'owe', person: 'علی', asset: 'usdt', amount: 50e6, date: '1405/07/01', due: null, note: '', settles: [] },
      { id: 'dR', dir: 'owed', person: 'رضا', asset: 'irr', amount: 50000000, date: '1405/07/01', due: null, note: '', settles: [] }]
  };
}
const bal = (s, id) => C.accountBalance(s, s.accounts.find(a => a.id === id)).balance;
const H = (s, loc, a) => ((V.replay(s).H[loc] || {})[a]) || 0;
const cf = s => C.cashFlow(s, '1405/07', T0);
const left = (s, id) => F.debtLeft(s.debts.find(d => d.id === id));
const ok = r => { assert(!r.err, 'unexpected error: ' + r.err); return r; };
const E = o => Object.assign({ date: T0 }, o);

t('place kinds: bank, credit, location, none; ledger vs plain', () => {
  const s = base();
  assert.strictEqual(F.place(s, 'B1').kind, 'bank'); assert.strictEqual(F.place(s, 'C1').kind, 'credit');
  assert.strictEqual(F.place(s, 'L1').kind, 'loc'); assert.strictEqual(F.place(s, '').kind, 'none'); assert.strictEqual(F.place(s, 'zz'), null);
  assert(F.plainPath(F.place(s, 'B1'), 'irr') && !F.plainPath(F.place(s, 'B1'), 'gold') && F.inLedger(F.place(s, 'B1'), 'gold'));
  assert(F.plainPath(F.place(s, ''), 'usdt') && F.inLedger(F.place(s, 'L1'), 'irr'));
});

t('out/expense from bank rial = plain tx, balance and cash flow as before', () => {
  const s = base();
  const r = ok(F.save(s, E({ kind: 'out', why: 'expense', acc: 'B1', asset: 'irr', q: 70000000, cat: 'غذا' }), null, ctx));
  const tx = s.tx.find(x => x.id === r.ref.tx);
  assert.deepStrictEqual([tx.type, tx.amount, tx.account, tx.cat, tx.asset, tx.why], ['expense', 70000000, 'B1', 'غذا', undefined, undefined]);
  assert.strictEqual(bal(s, 'B1'), 930000000); assert.strictEqual(cf(s).daily, 70000000);
  const back = F.read(s, r.ref); assert.deepStrictEqual([back.kind, back.why, back.acc, back.asset, back.q, back.cat], ['out', 'expense', 'B1', 'irr', 70000000, 'غذا']);
});

t('out/expense in tether from Wallex: ledger send + expense tx with value; P&L realized at day value', () => {
  const s = base();
  const r = ok(F.save(s, E({ kind: 'out', why: 'expense', acc: 'L1', asset: 'usdt', q: 10e6, cat: 'غذا' }), null, ctx));
  const o = s.ops.find(x => x.id === r.ref.op);
  assert.deepStrictEqual([o.type, o.why, o.loc, o.out.a, o.out.q, o.value, o.via], ['send', 'expense', 'L1', 'usdt', 10e6, 10000000, 'tx']);
  const lt = s.tx.find(x => x.id === o.tx);
  assert.deepStrictEqual([lt.type, lt.amount, lt.account, lt.op, lt.cat], ['expense', 10000000, '', o.id, 'غذا']);
  assert.strictEqual(H(s, 'L1', 'usdt'), 190e6); assert.strictEqual(cf(s).daily, 10000000);
  assert.strictEqual(bal(s, 'B1'), 1000000000, 'bank untouched');
  const R = V.replay(s); assert.strictEqual(Math.round(R.realized.r), 10000000 - 9000000, 'realized = value − basis of 10 USDT');
  // ویرایش از طریق تراکنش وابسته همون فرم رو باز می‌کنه
  const back = F.read(s, { tx: lt.id }); assert.deepStrictEqual([back.kind, back.why, back.acc, back.asset, back.q, back.value, back.cat], ['out', 'expense', 'L1', 'usdt', 10e6, 10000000, 'غذا']);
});

t('gift out: no realized P&L, counted as «کادو» expense; gift in: «هدیه» income with basis = value', () => {
  const s = base();
  const r = ok(F.save(s, E({ kind: 'out', why: 'gift', acc: 'L1', asset: 'usdt', q: 5e6 }), null, ctx));
  const o = s.ops.find(x => x.id === r.ref.op), lt = s.tx.find(x => x.id === o.tx);
  assert.deepStrictEqual([lt.type, lt.cat, lt.amount], ['expense', 'کادو', 5000000]);
  assert.strictEqual(V.replay(s).realized.r, 0);
  const r2 = ok(F.save(s, E({ kind: 'in', why: 'gift', acc: 'L3', asset: 'gold', q: 2000, note: 'از مادربزرگ' }), null, ctx));
  const o2 = s.ops.find(x => x.id === r2.ref.op), lt2 = s.tx.find(x => x.id === o2.tx);
  assert.deepStrictEqual([o2.type, o2.cost, lt2.type, lt2.cat, lt2.amount], ['recv', 200000000, 'income', 'هدیه', 200000000]);
  assert.strictEqual(cf(s).in, 200000000); assert.strictEqual(cf(s).out, 5000000);
});

t('in/income bitcoin to Nobitex: recv + income tx; asset with no price needs a value', () => {
  const s = base();
  const r = ok(F.save(s, E({ kind: 'in', why: 'income', acc: 'L2', asset: 'btc', q: 100000, cat: 'حقوق' }), null, ctx)); // ۰٫۰۰۱ BTC × ۱۰۰ هزار دلار × ۱۰۰ هزار تومان
  const o = s.ops.find(x => x.id === r.ref.op);
  assert.deepStrictEqual([o.type, o.in.a, o.in.q, o.cost], ['recv', 'btc', 100000, 100000000]);
  assert.strictEqual(cf(s).in, 100000000);
  const s2 = base(); s2.prices = [];
  assert(/قیمتی ثبت نشده/.test(F.save(s2, E({ kind: 'in', why: 'income', acc: 'L2', asset: 'btc', q: 100000 }), null, ctx).err));
  ok(F.save(s2, E({ kind: 'in', why: 'income', acc: 'L2', asset: 'btc', q: 100000, value: 95000000 }), null, ctx));
  assert.strictEqual(s2.ops.find(x => x.type === 'recv').cost, 95000000);
});

t('no account + any asset = record only (tx with asset/qty), no ledger effect', () => {
  const s = base();
  const r = ok(F.save(s, E({ kind: 'in', why: 'gift', acc: '', asset: 'gold', q: 1000 }), null, ctx));
  const tx = s.tx.find(x => x.id === r.ref.tx);
  assert.deepStrictEqual([tx.type, tx.asset, tx.qty, tx.amount, tx.account, tx.why, tx.cat], ['income', 'gold', 1000, 100000000, '', 'gift', 'هدیه']);
  assert.strictEqual(V.replay(s).totals.gold, 0);
  const back = F.read(s, r.ref); assert.deepStrictEqual([back.kind, back.why, back.asset, back.q, back.value], ['in', 'gift', 'gold', 1000, 100000000]);
});

t('lend tether from Wallex: send + new receivable in tether; not in cash flow; edit keeps the same debt', () => {
  const s = base();
  const r = ok(F.save(s, E({ kind: 'out', why: 'lend', acc: 'L1', asset: 'usdt', q: 20e6, person: 'مهدی', due: '1405/09/01' }), null, ctx));
  const o = s.ops.find(x => x.id === r.ref.op), d = s.debts.find(x => x.id === o.debt);
  assert.deepStrictEqual([o.type, o.why, d.dir, d.person, d.asset, d.amount, d.due, d.src.op], ['send', 'lend', 'owed', 'مهدی', 'usdt', 20e6, '1405/09/01', o.id]);
  assert(!o.tx, 'no cash-flow tx'); assert.strictEqual(cf(s).out, 0); assert.strictEqual(H(s, 'L1', 'usdt'), 180e6);
  const back = F.read(s, r.ref); assert.deepStrictEqual([back.why, back.person, back.due], ['lend', 'مهدی', '1405/09/01']);
  ok(F.save(s, Object.assign(back, { q: 25e6 }), r.ref, ctx));
  assert.strictEqual(s.debts.filter(x => x.person === 'مهدی').length, 1); assert.strictEqual(s.debts.find(x => x.id === d.id).amount, 25e6);
});

t('collect part of it into Nobitex; then lend entry: asset locked, purpose change keeps settled debt', () => {
  const s = base();
  const r = ok(F.save(s, E({ kind: 'out', why: 'lend', acc: 'L1', asset: 'usdt', q: 20e6, person: 'مهدی' }), null, ctx));
  const did = s.ops.find(x => x.id === r.ref.op).debt;
  const c = ok(F.save(s, E({ kind: 'in', why: 'collect', acc: 'L2', asset: 'usdt', q: 8e6, debt: did }), null, ctx));
  assert.strictEqual(left(s, did), 12e6); assert.strictEqual(H(s, 'L2', 'usdt'), 8e6);
  assert.strictEqual(s.ops.find(x => x.id === c.ref.op).cost, 8000000);
  // تغییر دارایی قرض با تسویه‌ی ثبت‌شده ممنوعه
  assert(/دارایی‌اش رو نمی‌شه عوض کرد/.test(F.save(s, Object.assign(F.read(s, r.ref), { asset: 'irr', q: 1000 }), r.ref, ctx).err));
  // ویرایش تسویه: مقدار تازه جای قبلی رو می‌گیره
  ok(F.save(s, Object.assign(F.read(s, c.ref), { q: 5e6 }), c.ref, ctx)); assert.strictEqual(left(s, did), 15e6);
  // تغییر «قرض دادم» به «خرج»: طلبی که تسویه داره می‌مونه (بی‌مبدأ)
  const rr = ok(F.save(s, Object.assign(F.read(s, r.ref), { why: 'expense', cat: 'غذا' }), r.ref, ctx));
  assert(s.debts.find(x => x.id === did) && !s.debts.find(x => x.id === did).src && rr.info.keptDebt === did);
});

t('repay a tether debt with toman from the bank: converted by the day price', () => {
  const s = base();
  ok(F.save(s, E({ kind: 'out', why: 'repay', acc: 'B1', asset: 'irr', q: 20000000, debt: 'dA' }), null, ctx)); // ۲ م تومان = ۲۰ تتر
  assert.strictEqual(left(s, 'dA'), 30e6); assert.strictEqual(bal(s, 'B1'), 980000000);
  const tx = s.tx[0]; assert.deepStrictEqual([tx.type, tx.why, tx.debt, tx.account, tx.to], ['transfer', 'repay', 'dA', 'B1', '']);
  assert.strictEqual(cf(s).out, 0, 'debt payment is not an expense');
  // پرداخت با تتر از والکس؛ بیشتر از مانده فقط تا مانده کم می‌کنه
  const r = ok(F.save(s, E({ kind: 'out', why: 'repay', acc: 'L1', asset: 'usdt', q: 40e6, debt: 'dA' }), null, ctx));
  assert.strictEqual(left(s, 'dA'), 0); assert(s.debts.find(x => x.id === 'dA').closed); assert(r.info.settle.over);
  assert(/کامل تسویه/.test(F.save(s, E({ kind: 'out', why: 'repay', acc: 'B1', asset: 'irr', q: 1000, debt: 'dA' }), null, ctx).err));
  assert(/طلبه، نه بدهی/.test(F.save(s, E({ kind: 'out', why: 'repay', acc: 'B1', asset: 'irr', q: 1000, debt: 'dR' }), null, ctx).err));
});

t('collect a toman receivable as tether, and legacy settle tx reads as collect/repay', () => {
  const s = base();
  ok(F.save(s, E({ kind: 'in', why: 'collect', acc: 'L1', asset: 'usdt', q: 10e6, debt: 'dR' }), null, ctx));
  assert.strictEqual(left(s, 'dR'), 40000000);
  s.tx.push({ id: 'old', created: 5, type: 'transfer', amount: 10000000, date: T0, time: '', cat: '', account: 'B1', note: 'دریافت طلب از رضا', debt: 'dR' }); // قالب قدیمی بدون to
  s.debts.find(x => x.id === 'dR').settles.push({ amount: 10000000, date: T0, txId: 'old' });
  const back = F.read(s, { tx: 'old' }); assert.deepStrictEqual([back.kind, back.why, back.acc, back.debt], ['in', 'collect', 'B1', 'dR']);
  ok(F.save(s, Object.assign(back, { q: 15000000 }), { tx: 'old' }, ctx));
  assert.strictEqual(left(s, 'dR'), 25000000); assert.strictEqual(s.tx.find(x => x.id === 'old').to, 'B1');
});

t('move: bank → bank, bank → Wallex (rial), Wallex → bank, Wallex → Nobitex (tether)', () => {
  const s = base();
  ok(F.save(s, E({ kind: 'move', acc: 'B1', acc2: 'B2', asset: 'irr', q: 50000000 }), null, ctx));
  assert.strictEqual(bal(s, 'B1'), 950000000); assert.strictEqual(bal(s, 'B2'), 250000000);
  const r = ok(F.save(s, E({ kind: 'move', acc: 'B1', acc2: 'L1', asset: 'irr', q: 30000000 }), null, ctx));
  const o = s.ops.find(x => x.id === r.ref.op);
  assert.deepStrictEqual([o.type, o.loc, o.bank, o.in.q, o.cost], ['deposit', 'L1', 'B1', 30000000, 30000000]);
  assert.strictEqual(bal(s, 'B1'), 920000000); assert.strictEqual(H(s, 'L1', 'irr'), 130000000);
  ok(F.save(s, E({ kind: 'move', acc: 'L1', acc2: 'B2', asset: 'irr', q: 20000000 }), null, ctx));
  assert.strictEqual(bal(s, 'B2'), 270000000); assert.strictEqual(H(s, 'L1', 'irr'), 110000000);
  ok(F.save(s, E({ kind: 'move', acc: 'L1', acc2: 'L2', asset: 'usdt', q: 50e6 }), null, ctx));
  assert.strictEqual(H(s, 'L2', 'usdt'), 50e6); assert.strictEqual(cf(s).in + cf(s).out, 0, 'moves never count as income/expense');
  assert(/یکی‌ان/.test(F.save(s, E({ kind: 'move', acc: 'L1', acc2: 'L1', asset: 'usdt', q: 1 }), null, ctx).err));
  assert(/«واریز»/.test(F.save(s, E({ kind: 'move', acc: '', acc2: 'L1', asset: 'usdt', q: 1 }), null, ctx).err));
});

t('conv in one entry: Wallex tether → Blu toman; Wallex tether → Nobitex bitcoin; Blu toman → WallGold gold', () => {
  const s = base();
  const r = ok(F.save(s, E({ kind: 'conv', acc: 'L1', asset: 'usdt', q: 100e6, acc2: 'B1', asset2: 'irr', q2: 105000000 }), null, ctx));
  const o = s.ops.find(x => x.id === r.ref.op);
  assert.deepStrictEqual([o.type, o.loc, o.bank, o.proceeds, o.out.q], ['sell', 'L1', 'B1', 105000000, 100e6]);
  assert.strictEqual(bal(s, 'B1'), 1105000000); assert.strictEqual(H(s, 'L1', 'usdt'), 100e6);
  assert.strictEqual(Math.round(V.replay(s).realized.r), 105000000 - 90000000);
  const lt = s.tx.find(x => x.id === o.tx); assert.deepStrictEqual([lt.type, lt.to, lt.op], ['transfer', 'B1', o.id]);
  const r2 = ok(F.save(s, E({ kind: 'conv', acc: 'L1', asset: 'usdt', q: 50e6, acc2: 'L2', asset2: 'btc', q2: 50000 }), null, ctx));
  const o2 = s.ops.find(x => x.id === r2.ref.op);
  assert.deepStrictEqual([o2.type, o2.loc, o2.loc2, o2.in.a], ['swap', 'L1', 'L2', 'btc']); assert.strictEqual(H(s, 'L2', 'btc'), 50000);
  const r3 = ok(F.save(s, E({ kind: 'conv', acc: 'B1', asset: 'irr', q: 100000000, acc2: 'L3', asset2: 'gold', q2: 1000 }), null, ctx));
  const o3 = s.ops.find(x => x.id === r3.ref.op);
  assert.deepStrictEqual([o3.type, o3.loc, o3.cost, o3.bank], ['buy', 'L3', 100000000, 'B1']); assert.strictEqual(bal(s, 'B1'), 1005000000);
  // ریالِ والکس به طلای وال‌گلد (بین دو محل)
  const r4 = ok(F.save(s, E({ kind: 'conv', acc: 'L1', asset: 'irr', q: 50000000, acc2: 'L3', asset2: 'gold', q2: 500 }), null, ctx));
  assert.deepStrictEqual(['buy', 'L3'], [s.ops.find(x => x.id === r4.ref.op).type, s.ops.find(x => x.id === r4.ref.op).loc2]);
  assert.strictEqual(H(s, 'L3', 'gold'), 1500); assert.strictEqual(cf(s).in + cf(s).out, 0);
  for (const id of [r.ref, r2.ref, r3.ref, r4.ref]) { const b = F.read(s, id); assert.strictEqual(b.kind, 'conv'); }
  const b = F.read(s, r.ref); assert.deepStrictEqual([b.acc, b.asset, b.q, b.acc2, b.asset2, b.q2], ['L1', 'usdt', 100e6, 'B1', 'irr', 105000000]);
});

t('gold kept at the bank: bank holds non-rial assets in the ledger and shows in byLoc', () => {
  const s = base();
  ok(F.save(s, E({ kind: 'conv', acc: 'B1', asset: 'irr', q: 100000000, acc2: 'B1', asset2: 'gold', q2: 1000 }), null, ctx));
  assert.strictEqual(H(s, 'B1', 'gold'), 1000); assert.strictEqual(bal(s, 'B1'), 900000000);
  const pl = V.portfolio(s).byLoc.find(x => x.loc.id === 'B1'); assert(pl && pl.h.gold === 1000 && pl.loc.bank);
  ok(F.save(s, E({ kind: 'conv', acc: 'B1', asset: 'gold', q: 500, acc2: 'B1', asset2: 'irr', q2: 52000000 }), null, ctx));
  assert.strictEqual(H(s, 'B1', 'gold'), 500); assert.strictEqual(bal(s, 'B1'), 952000000);
});

t('insufficient balance is refused and data stays untouched', () => {
  const s = base(), snap = JSON.stringify(s);
  const r = F.save(s, E({ kind: 'out', why: 'expense', acc: 'L1', asset: 'usdt', q: 300e6, cat: 'غذا' }), null, ctx);
  assert(/کافی نیست/.test(r.err)); assert.strictEqual(JSON.stringify(s), snap);
  assert(/کافی نیست/.test(F.save(s, E({ kind: 'move', acc: 'L1', acc2: 'L2', asset: 'btc', q: 1 }), null, ctx).err));
});

t('edit across representations: bank expense linked to an installment → paid in tether from Wallex', () => {
  const s = base();
  const r = ok(F.save(s, E({ kind: 'out', why: 'expense', acc: 'B1', asset: 'irr', q: 50000000, cat: 'قسط وام', link: { kind: 'loan', id: 'ln', key: '2' } }), null, ctx));
  assert.strictEqual(s.loans[0].paid['2'].txId, r.ref.tx);
  const r2 = ok(F.save(s, Object.assign(F.read(s, r.ref), { acc: 'L1', asset: 'usdt', q: 50e6, value: null }), r.ref, ctx));
  const o = s.ops.find(x => x.id === r2.ref.op), lt = s.tx.find(x => x.id === o.tx);
  assert.strictEqual(s.loans[0].paid['2'].txId, lt.id); assert.deepStrictEqual([lt.link.kind, lt.amount], ['loan', 50000000]);
  assert.strictEqual(bal(s, 'B1'), 1000000000); assert.strictEqual(H(s, 'L1', 'usdt'), 150e6);
  assert.strictEqual(C.cashFlow(s, '1405/07', T0).loans, 50000000, 'installment counted once with its real value');
  // و برگشت به بانک
  const r3 = ok(F.save(s, Object.assign(F.read(s, r2.ref), { acc: 'B1', asset: 'irr', q: 50000000 }), r2.ref, ctx));
  assert(r3.ref.tx && s.loans[0].paid['2'].txId === r3.ref.tx && !s.ops.some(x => x.type === 'send'));
});

t('remove: lend without settles deletes its debt; with settles keeps it; a removal that breaks later ops is refused', () => {
  const s = base();
  const r = ok(F.save(s, E({ kind: 'out', why: 'lend', acc: 'B1', asset: 'irr', q: 10000000, person: 'سارا' }), null, ctx));
  const did = s.tx.find(x => x.id === r.ref.tx).debt;
  assert.strictEqual(bal(s, 'B1'), 990000000);
  ok(F.remove(s, r.ref)); assert(!s.debts.some(x => x.id === did)); assert.strictEqual(bal(s, 'B1'), 1000000000);
  const r2 = ok(F.save(s, E({ kind: 'out', why: 'lend', acc: 'B1', asset: 'irr', q: 10000000, person: 'سارا' }), null, ctx));
  const did2 = s.tx.find(x => x.id === r2.ref.tx).debt;
  const c = ok(F.save(s, E({ kind: 'in', why: 'collect', acc: 'B2', asset: 'irr', q: 4000000, debt: did2 }), null, ctx));
  const rr = ok(F.remove(s, r2.ref)); assert(rr.info.keptDebt === did2 && s.debts.find(x => x.id === did2).settles.length === 1);
  ok(F.remove(s, c.ref)); assert.strictEqual(left(s, did2), 10000000);
  // واریز تتر و بعد خرج همون تتر؛ حذف واریز منفی می‌کنه
  const g = ok(F.save(s, E({ kind: 'in', why: 'gift', acc: 'L2', asset: 'usdt', q: 5e6 }), null, ctx));
  ok(F.save(s, E({ kind: 'out', why: 'expense', acc: 'L2', asset: 'usdt', q: 5e6, cat: 'غذا' }), null, ctx));
  assert(/منفی/.test(F.remove(s, g.ref).err)); assert.strictEqual(H(s, 'L2', 'usdt'), 0);
});

t('credit purchase stays plain; non-toman on credit refused; credit settlement edits keep their link', () => {
  const s = base();
  ok(F.save(s, E({ kind: 'out', why: 'expense', acc: 'C1', asset: 'irr', q: 20000000, cat: 'غذا' }), null, ctx));
  assert.strictEqual(C.creditUsed(s, s.accounts[2]), 20000000);
  assert(/فقط خرج تومانی/.test(F.save(s, E({ kind: 'out', why: 'expense', acc: 'C1', asset: 'usdt', q: 1e6 }), null, ctx).err));
  assert(/فقط خرج تومانی/.test(F.save(s, E({ kind: 'out', why: 'lend', acc: 'C1', asset: 'irr', q: 1000, person: 'x' }), null, ctx).err));
  // تسویه‌ی صورت‌حساب (همون ساختار app.settleCredit)
  const a = s.accounts[2]; s.tx.forEach(x => { if (x.account === 'C1') x.cs = 'sX'; });
  s.tx.push({ id: 'pay', created: 9, type: 'transfer', amount: 20000000, date: T0, time: '', cat: '', account: 'B1', to: '', note: 'تسویه', link: { kind: 'credit', id: 'C1', key: 'sX' }, auto: true });
  a.settles.push({ id: 'sX', ym: '1405/07', date: T0, amount: 20000000, txId: 'pay', bank: 'B1' });
  const back = F.read(s, { tx: 'pay' }); assert(back.lockKind && back.kind === 'move');
  ok(F.save(s, Object.assign(back, { acc: 'B2' }), { tx: 'pay' }, ctx));
  const a2 = () => s.accounts.find(x => x.id === 'C1'); // ذخیره روی کپی انجام می‌شه؛ آرایه‌ها عوض می‌شن
  assert.deepStrictEqual([s.tx.find(x => x.id === 'pay').link.key, a2().settles[0].bank], ['sX', 'B2']); assert.strictEqual(bal(s, 'B2'), 180000000);
  assert(/صورت‌حساب اعتبار/.test(F.save(s, Object.assign(F.read(s, { tx: 'pay' }), { kind: 'out', why: 'expense' }), { tx: 'pay' }, ctx).err));
  ok(F.remove(s, { tx: 'pay' })); assert.strictEqual(a2().settles.length, 0); assert.strictEqual(C.creditUsed(s, a2()), 20000000);
});

t('bar pieces survive, legacy op-linked tx (salary / xbank) is not taken over', () => {
  const s = base();
  const r = ok(F.save(s, E({ kind: 'in', why: 'gift', acc: 'L3', asset: 'bar', q: 10000, pieces: { 10: 1 } }), null, ctx));
  assert.deepStrictEqual(V.replay(s).pieces.L3, { 10: 1 });
  assert.deepStrictEqual(F.read(s, r.ref).pieces, { 10: 1 });
  s.ops.push({ id: 'sal', created: 3, date: T0, type: 'salary', loc: 'L1', in: { a: 'usdt', q: 1e6 }, cost: 1000000, tx: 'st' });
  s.tx.push({ id: 'st', created: 3, type: 'income', amount: 1000000, date: T0, time: '', cat: 'حقوق', account: '', note: '', op: 'sal' });
  assert.strictEqual(F.read(s, { tx: 'st' }), null); assert.strictEqual(F.read(s, { op: 'sal' }), null);
});

t('row kinds for the transactions list', () => {
  const s = base();
  ok(F.save(s, E({ kind: 'out', why: 'lend', acc: 'B1', asset: 'irr', q: 1000, person: 'x' }), null, ctx));
  ok(F.save(s, E({ kind: 'conv', acc: 'L1', asset: 'usdt', q: 1e6, acc2: 'L2', asset2: 'btc', q2: 1000 }), null, ctx));
  ok(F.save(s, E({ kind: 'move', acc: 'L1', acc2: 'L2', asset: 'usdt', q: 1e6 }), null, ctx));
  const kinds = s.tx.map(x => F.rowKind(s, { t: x })).concat(F.feedOps(s).map(o => F.rowKind(s, { o })));
  assert.deepStrictEqual(kinds.sort(), ['conv', 'move', 'out']);
});

console.log(`flow: ${n} test groups passed`);
