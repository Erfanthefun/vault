const assert = require('assert');
require('../core.js'); const C = globalThis.Core;
let n = 0; const t = (name, fn) => { fn(); n++; };

t('jalali vs Intl persian calendar, every day 1390..1420', () => {
  const fmt = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' });
  let d = new Date(2011, 2, 21), bad = 0, count = 0;
  while (d.getFullYear() < 2042) {
    const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
    const want = `${parseInt(p.year)}/${String(p.month).padStart(2, '0')}/${String(p.day).padStart(2, '0')}`;
    if (C.toJ(d) !== want) bad++;
    const g = C.toG(want); if (g.gy !== d.getFullYear() || g.gm !== d.getMonth() + 1 || g.gd !== d.getDate()) bad++;
    d.setDate(d.getDate() + 1); count++;
  }
  assert.strictEqual(bad, 0, `mismatches: ${bad}`); assert(count > 10000);
});
t('month length & leap', () => {
  assert.strictEqual(C.monthLen(1403, 12), 30); assert.strictEqual(C.monthLen(1404, 12), 29);
  assert.strictEqual(C.monthLen(1405, 6), 31); assert.strictEqual(C.monthLen(1405, 7), 30);
});
t('addMonths clamps and keeps wanted day', () => {
  assert.strictEqual(C.addMonths('1405/06/31', 1), '1405/07/30');
  assert.strictEqual(C.addMonths('1405/06/31', 1, 31), '1405/07/30');
  assert.strictEqual(C.addMonths('1405/11/30', 1), '1405/12/29');
  assert.strictEqual(C.addMonths('1405/12/29', 1, 31), '1406/01/31');
  assert.strictEqual(C.addMonths('1405/01/15', -2), '1404/11/15');
  assert.strictEqual(C.addYm('1405/01', -1), '1404/12'); assert.strictEqual(C.addYm('1405/12', 1), '1406/01');
});
t('addDays/diffDays across year', () => {
  assert.strictEqual(C.addDays('1404/12/29', 1), '1405/01/01'); assert.strictEqual(C.diffDays('1404/12/29', '1405/01/02'), 2);
  assert.strictEqual(C.diffDays('1405/07/05', '1405/07/01'), -4);
});
t('digits & formatting', () => {
  assert.strictEqual(C.normDigits('۱۲٬۳۴۵'), '12,345'); assert.strictEqual(C.normDigits('٣٤'), '34');
  assert.strictEqual(C.faNum(1234567), '۱٬۲۳۴٬۵۶۷'); assert.strictEqual(C.faNum(-5), '-۵');
});
t('SMS parser: user samples + edge cases', () => {
  const r1 = C.parseSMS('بلو\nبرداشت پول\nسیدعرفان عزیز، 32,000,000 ریال از حساب شما پرید.\nموجودی: 684,396,389 ریال\n۱۸:۲۴\n۱۴۰۵.۰۷.۰۴', '1405/07/05');
  assert.deepStrictEqual([r1.type, r1.amount, r1.balance, r1.date, r1.time], ['expense', 32000000, 684396389, '1405/07/04', '18:24']);
  const r2 = C.parseSMS('بانک خاورمیانه\nانتقال از اینترنت بانک به کارت 5357\n-13,014,500\n020/000918214\nمانده 551,200\n07/05\n07:31', '1405/07/05');
  assert.deepStrictEqual([r2.type, r2.amount, r2.balance, r2.date, r2.account], ['expense', 13014500, 551200, '1405/07/05', '020/000918214']);
  const r3 = C.parseSMS('بانک خاورمیانه\n020/000918214\n+6,283,300\n12/21\n04:05\nمانده 16,358,130\nواریز پایا', '1405/01/10');
  assert.strictEqual(r3.date, '1404/12/21', 'infers previous year');
  const r4 = C.parseSMS('بانک ملت\nبرداشت: 1,500,000\nمانده: 2,000,000\n1405/07/01', '1405/07/05');
  assert.deepStrictEqual([r4.type, r4.amount, r4.balance, r4.date], ['expense', 1500000, 2000000, '1405/07/01']);
  assert.ok(C.parseSMS('سلام خوبی؟').error); assert.strictEqual(C.parseSMS('   '), null);
});

const st = () => ({ settings: { expectedIncome: 0 }, tx: [], debts: [],
  loans: [{ id: 'L', name: 'وام', amount: 1000, count: 3, first: '1405/06/31', paid: {} }],
  fixed: [{ id: 'F', name: 'قبض', amount: 500, day: 31, start: '1405/07', end: null, paid: {}, variable: true }] });
t('obligations: due dates clamp, keys, variable flag', () => {
  const s = st(); const o = C.obligationsForMonth(s, '1405/07');
  assert.strictEqual(o.length, 2); assert.strictEqual(o[0].due, '1405/07/30'); assert.strictEqual(o[1].due, '1405/07/30');
  assert.strictEqual(o.find(x => x.kind === 'loan').key, '1'); assert.ok(o.find(x => x.kind === 'fixed').variable);
  assert.strictEqual(C.obligationsForMonth(s, '1405/09').filter(x => x.kind === 'loan').length, 0, 'after last installment');
  assert.strictEqual(C.obligationsForMonth(s, '1405/06').filter(x => x.kind === 'fixed').length, 0, 'before start');
});
t('stats use actual paid amounts and update remaining immediately', () => {
  const s = st();
  let m = C.monthStats(s, '1405/07');
  assert.deepStrictEqual([m.obTotal, m.obRemaining, m.obPaid, m.hasIncome], [1500, 1500, 0, false]);
  s.tx.push({ id: 't1', type: 'expense', amount: 320, date: '1405/07/05', link: { kind: 'fixed', id: 'F', key: '1405/07' } });
  s.fixed[0].paid['1405/07'] = { date: '1405/07/05', txId: 't1' };
  m = C.monthStats(s, '1405/07');
  assert.deepStrictEqual([m.obTotal, m.obRemaining, m.obPaid, m.variable, m.varRemaining], [1320, 1000, 320, 0, 0]);
  s.loans[0].paid[1] = { date: '1405/07/01', prior: true };
  m = C.monthStats(s, '1405/07'); assert.deepStrictEqual([m.obRemaining, m.obPaid, m.paidCount], [0, 1320, 2]);
  s.tx.push({ id: 't2', type: 'income', amount: 5000, date: '1405/07/02' }, { id: 't3', type: 'expense', amount: 200, date: '1405/07/03' },
    { id: 't4', type: 'transfer', amount: 999, date: '1405/07/03' });
  m = C.monthStats(s, '1405/07'); assert.deepStrictEqual([m.hasIncome, m.variable, m.free], [true, 200, 5000 - 1320 - 200]);
});
t('openObligations & loanSummary', () => {
  const s = st(); s.loans[0].paid[0] = { date: 'x', prior: true };
  assert.strictEqual(C.openObligations(s, '1405/07', -3, 1).length, 4, 'loan mehr+aban, fixed mehr+aban');
  const ls = C.loanSummary(s.loans[0]);
  assert.deepStrictEqual([ls.paidCount, ls.remainingCount, ls.remainingAmount, ls.last, ls.next.i], [1, 2, 2000, '1405/08/30', 1]);
  s.loans[0].paid[7] = {}; assert.strictEqual(C.loanSummary(s.loans[0]).paidCount, 1, 'ignores keys beyond count');
});

t('KPIs & chart data', () => {
  const s = { settings: { expectedIncome: 0 }, debts: [], fixed: [
      { id: 'V', name: 'قبض', amount: 1000, day: 5, start: '1405/06', end: null, variable: true, paid: { '1405/07': { date: '1405/07/04', txId: 'tv' } } }],
    loans: [
      { id: 'A', name: 'الف', amount: 100, count: 4, first: '1405/05/10', paid: { 0: { date: '1405/05/01', prior: true }, 1: { date: '1405/06/12', txId: 'ta' } } },
      { id: 'B', name: 'ب', amount: 50, count: 2, first: '1405/07/01', paid: { 0: { date: '1405/07/01', txId: 'tb' } } }],
    tx: [
      { id: 'ta', type: 'expense', amount: 100, date: '1405/06/12', cat: 'وام', link: { kind: 'loan', id: 'A', key: '1' } },
      { id: 'tb', type: 'expense', amount: 50, date: '1405/07/01', cat: 'وام', link: { kind: 'loan', id: 'B', key: '0' } },
      { id: 'tv', type: 'expense', amount: 800, date: '1405/07/04', cat: 'تلفن', link: { kind: 'fixed', id: 'V', key: '1405/07' } },
      { id: 'd1', type: 'expense', amount: 300, date: '1405/07/02', cat: 'غذا' },
      { id: 'd2', type: 'expense', amount: 100, date: '1405/06/20', cat: 'غذا' },
      { id: 'i1', type: 'income', amount: 5000, date: '1405/07/01' }] };
  const o = C.monthOutflow(s, '1405/07');
  assert.deepStrictEqual([o.loans, o.bills, o.daily, o.total], [50, 800, 300, 1150]);
  assert.deepStrictEqual(C.categoryTotals(s, '1405/07'), { 'وام': 50, 'تلفن': 800, 'غذا': 300 });
  const cum = C.cumulativeByDay(s, '1405/07'); assert.strictEqual(cum.length, 30); assert.strictEqual(cum[0], 50); assert.strictEqual(cum[3], 1150); assert.strictEqual(cum[29], 1150);
  // بدهی: الف اقساط ۳ و ۴ (مهر، آبان) + ب قسط ۲ (آبان) = ۲۰۰ + ۵۰
  const pr = C.debtProjection(s, '1405/07', 24);
  assert.deepStrictEqual(pr.map(p => p.total), [250, 150, 0]); assert.strictEqual(pr[2].ym, '1405/08');
  assert.strictEqual(C.debtFreeYm(s), '1405/08');
  const fc = C.obligationForecast(s, '1405/07', 3);
  assert.deepStrictEqual(fc.map(f => [f.loans, f.variable]), [[150, 800], [150, 1000], [0, 1000]]);
  assert.deepStrictEqual(C.reliefWithin(s, '1405/07', 3).amount, 150);
  const ot = C.onTimeRate(s, '1405/02', '1405/07'); // الف قسط ۲ سررسید ۶/۱۰ پرداخت ۶/۱۲ دیر؛ ب به‌موقع؛ قبض به‌موقع
  assert.deepStrictEqual([ot.n, ot.ok], [3, 2]);
  const v = C.varianceOfVariable(s, '1405/07'); assert.deepStrictEqual([v.est, v.actual], [1000, 800]);
  const k = C.kpis(s, '1405/07', '1405/07/05');
  assert.strictEqual(k.outflow, 1150); assert.strictEqual(k.outflowPrev, 200); assert.strictEqual(k.days, 5);
  assert.strictEqual(k.dailyAvg, 60); assert.strictEqual(k.dailyProjected, 1800);
  assert.strictEqual(k.loanLoad, 150); assert.strictEqual(k.dti, 150 / 5000); assert.strictEqual(k.savingsRate, (5000 - 1150) / 5000);
  assert.strictEqual(k.monthsToFree, 1); assert.strictEqual(C.kpis(s, '1405/09', '1405/07/05').days, 0, 'future month');
  s.loans = []; assert.strictEqual(C.debtFreeYm(s), null); assert.deepStrictEqual(C.debtProjection(s, '1405/07', 5).map(p => p.total), [0, 0]);
});
t('recurring income: expected vs received, left-to-spend base', () => {
  const s = { settings: { expectedIncome: 0 }, loans: [], fixed: [], debts: [],
    incomes: [{ id: 'I', name: 'حقوق', amount: 300000000, day: 25, start: '1405/07', end: null, paid: {} }],
    tx: [{ id: 'x', type: 'expense', amount: 1000000, date: '1405/07/03' }] };
  let m = C.monthStats(s, '1405/07');
  assert.deepStrictEqual([m.inc.length, m.incPending, m.incReceived, m.base, m.hasIncome], [1, 300000000, 0, 300000000, true]);
  assert.strictEqual(m.inc[0].due, '1405/07/25'); assert.strictEqual(m.free, 300000000 - 1000000);
  s.tx.push({ id: 'r', type: 'income', amount: 280000000, date: '1405/07/25', link: { kind: 'income', id: 'I', key: '1405/07' } });
  s.incomes[0].paid['1405/07'] = { date: '1405/07/25', txId: 'r' };
  m = C.monthStats(s, '1405/07');
  assert.deepStrictEqual([m.incPending, m.incReceived, m.base], [0, 280000000, 280000000], 'actual received replaces expected, no double count');
  assert.strictEqual(C.incomesForMonth(s, '1405/06').length, 0, 'before start');
  assert.strictEqual(C.monthStats(s, '1405/08').incPending, 300000000, 'next month expected again');
});
t('BNPL schedule: first on purchase day, rest on day 1 of following months', () => {
  const L = { id: 'B', name: 'اسنپ پی', amount: 1000, count: 4, first: '1405/07/25', restDay: 1, paid: {} };
  assert.deepStrictEqual([0, 1, 2, 3].map(i => C.loanDue(L, i)), ['1405/07/25', '1405/08/01', '1405/09/01', '1405/10/01']);
  assert.strictEqual(C.loanSummary(L).last, '1405/10/01');
  const L2 = { ...L, first: '1405/11/30', restDay: 31 };
  assert.deepStrictEqual([1, 2].map(i => C.loanDue(L2, i)), ['1405/12/29', '1406/01/31'], 'day clamped to month length');
  const st = { settings: {}, tx: [], fixed: [], debts: [], loans: [L] };
  assert.deepStrictEqual(C.obligationsForMonth(st, '1405/08').map(o => [o.key, o.due]), [['1', '1405/08/01']]);
  assert.strictEqual(C.obligationsForMonth(st, '1405/07')[0].due, '1405/07/25');
  const bank = { ...L, restDay: undefined }; assert.strictEqual(C.loanDue(bank, 1), '1405/08/25', 'bank loans unchanged');
});
t('cashFlow: بر اساس ماه تعهد؛ «قبلی» و تیک بدون تراکنش حساب می‌شن؛ حقوقِ موعدرسیده؛ انتقال نه', () => {
  const tx = (id, type, amount, date, link) => ({ id, type, amount, date, link });
  const st = {
    loans: [{ id: 'L', amount: 300, count: 3, first: '1405/06/03', paid: { 0: { date: '1405/06/03', prior: true }, 1: { date: '1405/07/01', prior: true } } },
      { id: 'M', amount: 200, count: 2, first: '1405/07/01', paid: { 0: { date: '1405/07/05', txId: 't1' } } },
      { id: 'N', amount: 50, count: 1, first: '1405/07/20', paid: {} }],
    fixed: [{ id: 'F', amount: 100, day: 10, start: '1405/01', end: null, variable: true, paid: { '1405/07': { date: '1405/06/30', txId: 't2' } } }],
    incomes: [{ id: 'I', name: 'حقوق', amount: 1500, day: 1, start: '1405/01', end: null, paid: {} },
      { id: 'J', name: 'اجاره', amount: 400, day: 25, start: '1405/01', end: null, paid: {} },
      { id: 'K', name: 'پاداش', amount: 70, day: 2, start: '1405/07', end: '1405/07', paid: { '1405/07': { date: '1405/06/29', txId: 't5' } } }],
    tx: [tx('t1', 'expense', 210, '1405/07/05', { kind: 'loan', id: 'M', key: '0' }), tx('t2', 'expense', 90, '1405/06/30', { kind: 'fixed', id: 'F', key: '1405/07' }),
      tx('t3', 'expense', 40, '1405/07/06'), tx('t4', 'transfer', 999, '1405/07/06'), tx('t5', 'income', 70, '1405/06/29', { kind: 'income', id: 'K' }),
      tx('t6', 'income', 30, '1405/07/03'), tx('t7', 'expense', 11, '1405/07/04', { kind: 'loan', id: 'deleted', key: '0' }), tx('t8', 'expense', 5, '1405/08/01')]
  };
  const f = C.cashFlow(st, '1405/07', '1405/07/07');
  // رفت: L قسط ۲ «قبلی» ۳۰۰ + M با مبلغ واقعی ۲۱۰ + قبض مهر (تراکنشش شهریور) ۹۰ + روزمره ۴۰ + پیوند یتیم ۱۱ ؛ N هنوز پرداخت نشده
  assert.deepStrictEqual([f.loans, f.bills, f.daily, f.out], [510, 90, 51, 651]);
  // آمد: حقوق (روز ۱، تیک نخورده) ۱۵۰۰ + پاداش دریافت‌شده ۷۰ + واریز آزاد ۳۰ ؛ اجاره (روز ۲۵) در راه
  assert.deepStrictEqual([f.in, f.assumed, f.assumedNames, f.pending], [1600, 1500, ['حقوق'], 400]);
  assert.strictEqual(f.net, 949); assert.strictEqual(f.rate, 949 / 1600);
  const sh = C.cashFlow(st, '1405/06', '1405/07/07');
  assert.deepStrictEqual([sh.loans, sh.bills, sh.daily], [300, 0, 0], 'Shahrivar: prior loan; bill tx belongs to Mehr, not double-counted');
  assert.strictEqual(sh.in, 1500 + 400, 'past month: all fixed incomes due → assumed; bonus tx (Shahrivar) not double-counted');
  const empty = C.cashFlow({ loans: [], fixed: [], incomes: [], tx: [] }, '1405/07', '1405/07/07');
  assert.deepStrictEqual([empty.in, empty.out, empty.net, empty.rate], [0, 0, 0, null]);
});
t('accountBalance: لنگر + تراکنش‌های بعدش؛ انتقال از/به؛ انتقال قدیمی؛ اعتبار بی‌اثر؛ پیامک بدون ساعت', () => {
  const T = (id, o) => Object.assign({ id, created: 0, time: '', account: '' }, o);
  const blu = { id: 'b', kind: 'bank', balance: 1000, stamp: '1405/07/05 10:00', at: 500 };
  const st = { debts: [{ id: 'd1', dir: 'owed' }, { id: 'd2', dir: 'owe' }], tx: [
    T('before', { type: 'expense', amount: 50, date: '1405/07/04', account: 'b' }),               // قبل از لنگر: توی موجودی هست
    T('sameEarly', { type: 'expense', amount: 7, date: '1405/07/05', time: '09:00', account: 'b' }), // همون روز، قبل از ساعت لنگر
    T('sameLate', { type: 'expense', amount: 70, date: '1405/07/05', time: '22:30', account: 'b' }), // دیشب ← کم می‌شه
    T('noTimeOld', { type: 'expense', amount: 3, date: '1405/07/05', created: 400, account: 'b' }),  // همون روز بدون ساعت، ثبت قبل از لنگر
    T('noTimeNew', { type: 'expense', amount: 30, date: '1405/07/05', created: 600, account: 'b' }), // … ثبت بعد از لنگر
    T('inc', { type: 'income', amount: 200, date: '1405/07/06', account: 'b' }),
    T('trOut', { type: 'transfer', amount: 100, date: '1405/07/06', account: 'b', to: 's' }),
    T('trIn', { type: 'transfer', amount: 40, date: '1405/07/06', account: '', to: 'b' }),
    T('legacyOut', { type: 'transfer', amount: 20, date: '1405/07/06', account: 'b' }),             // قدیمی: برداشت
    T('legacyOwed', { type: 'transfer', amount: 15, date: '1405/07/06', account: 'b', debt: 'd1' }), // قدیمی: دریافت طلب = واریز
    T('legacyOwe', { type: 'transfer', amount: 5, date: '1405/07/06', account: 'b', debt: 'd2' }),
    T('credit', { type: 'expense', amount: 999, date: '1405/07/06', account: 'c' }),
    T('other', { type: 'expense', amount: 11, date: '1405/07/06', account: 's' })
  ] };
  const r = C.accountBalance(st, blu);
  assert.strictEqual(r.delta, -70 - 30 + 200 - 100 + 40 - 20 + 15 - 5);
  assert.strictEqual(r.balance, 1000 + r.delta); assert.strictEqual(r.n, 8);
  const sam = { id: 's', balance: 0, stamp: '1405/07/01 00:00', at: 1 };
  assert.strictEqual(C.accountBalance(st, sam).balance, 100 - 11, 'مقصد انتقال اضافه می‌شه');
  assert.strictEqual(C.accountBalance(st, { id: 'x', balance: null }), null);
  // لنگر قدیمی (ورود دستی بدون stamp و at): همه‌ی تراکنش‌های حساب
  assert.strictEqual(C.accountBalance(st, { id: 'b', balance: 1000, stamp: '' }).n, 11);
  // ورود دستی تازه (stamp خالی ولی at): فقط تراکنش‌هایی که بعدش ثبت شدن
  assert.strictEqual(C.accountBalance(st, { id: 'b', balance: 1000, stamp: '', at: 500 }).delta, -30);
  // خود تراکنش پیامک (همون ساعت لنگر) دوبار کم نمی‌شه
  assert.strictEqual(C.accountBalance({ debts: [], tx: [T('sms', { type: 'expense', amount: 70, date: '1405/07/05', time: '22:30', account: 'b', created: 900 })] },
    { id: 'b', balance: 930, stamp: '1405/07/05 22:30', at: 901 }).balance, 930);
});
t('kpis: income = cashFlow «آمد» (v10 regression)', () => {
  const base = () => ({ settings: { expectedIncome: 0 }, accounts: [], tx: [], fixed: [], debts: [],
    loans: [{ id: 'L', name: 'وام', amount: 500, count: 10, first: '1405/05/10', paid: {} }],
    incomes: [{ id: 'I', name: 'حقوق', amount: 4000, day: 1, paid: {} }] });
  // الف) حقوق مهر فقط تیک خورده، بدون تراکنش
  let s = base(); s.incomes[0].paid['1405/07'] = { date: '1405/07/01' };
  let k = C.kpis(s, '1405/07', '1405/07/18');
  assert.strictEqual(k.hasIncome, true); assert.strictEqual(k.income, 4000); assert.strictEqual(k.dti, 500 / 4000);
  assert.strictEqual(k.income, C.cashFlow(s, '1405/07', '1405/07/18').in);
  // ب) حقوق آخر شهریور واریز شده و به مهر وصل شده
  s = base(); s.tx.push({ id: 't1', type: 'income', amount: 4000, date: '1405/06/30', link: { kind: 'income', id: 'I', key: '1405/07' } });
  s.incomes[0].paid['1405/07'] = { date: '1405/06/30', txId: 't1' };
  k = C.kpis(s, '1405/07', '1405/07/18'); assert.strictEqual(k.income, 4000);
  // نرخ پس‌انداز = همون درصد کارت خانه
  s.tx.push({ id: 't2', type: 'expense', amount: 1000, date: '1405/07/05' });
  k = C.kpis(s, '1405/07', '1405/07/18'); assert.strictEqual(k.savingsRate, C.cashFlow(s, '1405/07', '1405/07/18').rate);
  // ج) هیچ درآمدی نرسیده → درآمد پیش‌بینی تنظیمات؛ بدون اون → شاخص‌ها پنهان
  s = base(); s.incomes = []; k = C.kpis(s, '1405/07', '1405/07/18'); assert.strictEqual(k.hasIncome, false); assert.strictEqual(k.dti, null);
  s.settings.expectedIncome = 2000; k = C.kpis(s, '1405/07', '1405/07/18'); assert.strictEqual(k.income, 2000);
});
t('income: unlinked deposit = fixed income, counted once (v10 regression)', () => {
  const base = () => ({ settings: { expectedIncome: 0 }, accounts: [], tx: [], loans: [], fixed: [], debts: [],
    incomes: [{ id: 'I', name: 'حقوق', amount: 4000, day: 1, cat: 'حقوق', paid: {} }] });
  const T = '1405/07/18';
  // الف) حقوق با «ثبت واریز» بدون انتخاب درآمد ثابت → یک بار
  let s = base(); s.tx.push({ id: 't', type: 'income', amount: 4000, date: '1405/07/02' });
  assert.strictEqual(C.cashFlow(s, '1405/07', T).in, 4000); assert.strictEqual(C.kpis(s, '1405/07', T).income, 4000);
  let it = C.incomesForMonth(s, '1405/07')[0]; assert.strictEqual(it.paid, true); assert.strictEqual(it.auto.txId, 't');
  assert.strictEqual(C.monthStats(s, '1405/07').incPending, 0);
  // ب) مبلغ کمی فرق داره (۱۰٪) یا هم‌دسته است → جفت؛ مبلغ واقعی حساب می‌شه
  s = base(); s.tx.push({ id: 't', type: 'income', amount: 4400, date: '1405/07/04' }); assert.strictEqual(C.cashFlow(s, '1405/07', T).in, 4400);
  s = base(); s.tx.push({ id: 't', type: 'income', amount: 9000, date: '1405/07/04', cat: 'حقوق' }); assert.strictEqual(C.cashFlow(s, '1405/07', T).in, 9000);
  // ج) واریز آخر ماه قبل → حقوق این ماه؛ در ماه قبل دوباره شمرده نمی‌شه
  s = base(); s.incomes[0].paid['1405/06'] = { date: '1405/06/01' }; s.tx.push({ id: 't', type: 'income', amount: 4000, date: '1405/06/29' });
  assert.strictEqual(C.cashFlow(s, '1405/06', T).in, 4000); assert.strictEqual(C.cashFlow(s, '1405/07', T).in, 4000);
  // د) واریز نامربوط (مبلغ دور، دسته‌ی دیگه) یا دور از روز حقوق → جفت نمی‌شه
  s = base(); s.tx.push({ id: 't', type: 'income', amount: 130, date: '1405/07/03', cat: 'سایر درآمد' }); assert.strictEqual(C.cashFlow(s, '1405/07', T).in, 4130);
  s = base(); s.tx.push({ id: 't', type: 'income', amount: 4000, date: '1405/07/16' }); assert.strictEqual(C.cashFlow(s, '1405/07', T).in, 8000);
  // ه) کاربر جداش کرده (noMatch) یا قبلاً به چیز دیگه وصله → جفت نمی‌شه
  s = base(); s.tx.push({ id: 't', type: 'income', amount: 4000, date: '1405/07/02', noMatch: true }); assert.strictEqual(C.cashFlow(s, '1405/07', T).in, 8000);
  // و) دو واریز، یک حقوق → فقط نزدیک‌ترین
  s = base(); s.tx.push({ id: 'a', type: 'income', amount: 4000, date: '1405/07/06' }, { id: 'b', type: 'income', amount: 4000, date: '1405/07/01' });
  assert.strictEqual(C.incomesForMonth(s, '1405/07')[0].auto.txId, 'b'); assert.strictEqual(C.cashFlow(s, '1405/07', T).in, 8000);
});
console.log(`core: ${n} test groups passed`);
