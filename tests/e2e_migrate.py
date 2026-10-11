"""مهاجرت ۱۱٫۲ → ۱۲: داده‌ای شبیه داده‌ی واقعی کاربر در نسخه‌ی ۱۱٫۲ ساخته می‌شه (همه‌ی بخش‌ها)، بعد همون داده در ۱۲ باز می‌شه.
همه‌ی عددها (موجودی بانک‌ها، دارایی‌ها و سود، جریان نقدی، KPI، بدهی و طلب، اعتبار خرید) باید عیناً یکی باشن و چیزی حذف نشه.
نیاز: نسخه‌ی ۱۱٫۲ روی پورت ۸۷۶۸ (OLD) و ۱۲ روی ۸۷۶۷."""
import json, os, sys
from playwright.sync_api import sync_playwright
OLD = os.environ.get('OLD_BASE', 'http://localhost:8768/index.html'); NEW = 'http://localhost:8767/index.html'
passed, failed = [], []
def check(name, cond, info=''):
    (passed if cond else failed).append(name)
    if not cond: print('  FAIL:', name, str(info)[:600])

SEED = """(() => { const s = window.__vault.state, t = J.today(), d = n => J.addDays(t, n), m = Core.ym(t), pm = Core.addYm(m, -1);
  s.locations = [{ id: 'WX', name: 'والکس' }, { id: 'NB', name: 'نوبیتکس' }, { id: 'WG', name: 'وال‌گلد' }, { id: 'HM', name: 'خانه' }];
  const blu = s.accounts.find(a => a.name === 'بلوبانک'), sam = s.accounts.find(a => a.name === 'سامان'), snap = s.accounts.find(a => a.name === 'اسنپ‌پی اعتباری');
  blu.balance = 850000000; blu.stamp = d(-20) + ' 09:00'; blu.at = Date.now() - 1e8; sam.balance = 120000000; sam.stamp = ''; delete sam.at;
  s.prices = [{ date: d(-30), gold: 95000000, usdt: 950000, usd: 960000, eur: 1050000, btc: 90000, silver: 900000 },
              { date: d(-10), gold: 99000000, usdt: 1000000, usd: 1010000, eur: 1100000, btc: 95000, silver: 950000, auto: true, time: '10:07', post: 12 },
              { date: d(-1), gold: 102000000, usdt: 1040000, usd: 1050000, eur: 1150000, btc: 98000, silver: 990000 }];
  s.ops = [
    { id: 'p1', created: 1, date: d(-30), type: 'open', loc: 'WX', in: { a: 'usdt', q: 500e6 }, cost: 475000000 },
    { id: 'p2', created: 2, date: d(-30), type: 'open', loc: 'WG', in: { a: 'gold', q: 12000 }, cost: 1140000000 },
    { id: 'p3', created: 3, date: d(-30), type: 'open', loc: 'HM', in: { a: 'bar', q: 10000, pieces: { 5: 2 } }, cost: 900000000 },
    { id: 'p4', created: 4, date: d(-25), type: 'buy', loc: 'NB', in: { a: 'btc', q: 200000 }, cost: 171000000, bank: blu.id, tx: 'x4' },
    { id: 'p5', created: 5, date: d(-15), type: 'sell', loc: 'WX', out: { a: 'usdt', q: 100e6 }, proceeds: 99000000, bank: blu.id, tx: 'x5' },
    { id: 'p6', created: 6, date: d(-14), type: 'swap', loc: 'WX', out: { a: 'usdt', q: 50e6 }, in: { a: 'btc', q: 50000 } },
    { id: 'p7', created: 7, date: d(-12), type: 'transfer', loc: 'WX', loc2: 'NB', out: { a: 'usdt', q: 40e6 }, in: { a: 'usdt', q: 39e6 } },
    { id: 'p8', created: 8, date: d(-9), type: 'deposit', loc: 'WX', in: { a: 'irr', q: 30000000 }, cost: 30000000, bank: sam.id, tx: 'x8' },
    { id: 'p9', created: 9, date: d(-8), type: 'buy', loc: 'WX', out: { a: 'irr', q: 20000000 }, in: { a: 'usdt', q: 20e6 } },
    { id: 'pa', created: 10, date: d(-7), type: 'gift_in', loc: 'HM', in: { a: 'silver', q: 50000 }, cost: 47500000 },
    { id: 'pb', created: 11, date: d(-6), type: 'gift_out', loc: 'WG', out: { a: 'gold', q: 1000 } },
    { id: 'pc', created: 12, date: d(-5), type: 'salary', loc: 'WX', in: { a: 'usdt', q: 150e6 }, cost: 1500000000, note: 'حقوق', income: { id: 'IN', key: m }, tx: 'xc' },
    { id: 'pd', created: 13, date: d(-4), type: 'gift_out', loc: 'WG', out: { a: 'gold', q: 500 }, debt: 'DG', note: 'پرداخت بدهی' },
    { id: 'pe', created: 14, date: d(-3), type: 'withdraw', loc: 'WX', out: { a: 'irr', q: 5000000 }, bank: blu.id, tx: 'xe' }];
  s.incomes = [{ id: 'IN', name: 'حقوق', amount: 1500000000, day: J.jParse(d(-5)).d, start: pm, end: null, variable: false, cat: 'حقوق', account: '', asset: 'usdt', loc: 'WX', paid: { [m]: { date: d(-5), txId: 'xc' } } }];
  s.loans = [{ id: 'L1', name: 'وام بلو', lender: 'بلوبانک', amount: 60000000, count: 24, first: Core.addMonths(d(-3), -5), cat: 'قسط وام', paid: { 0: { date: d(-150), prior: true }, 1: { date: d(-120), prior: true }, 2: { date: d(-90) }, 3: { date: d(-60) } } },
             { id: 'L2', name: 'اسنپ‌پی، دیجی‌کالا', lender: 'اسنپ‌پی', store: 'دیجی‌کالا', amount: 25000000, count: 4, first: d(-20), restDay: 1, cat: 'قسط', paid: { 0: { date: d(-20), txId: 'l20' } } }];
  s.fixed = [{ id: 'F1', name: 'ایرانسل', amount: 10000000, day: 5, start: pm, end: null, variable: true, cat: 'قبوض', paid: {} }];
  s.debts = [{ id: 'DA', dir: 'owe', person: 'علی', asset: 'irr', amount: 50000000, date: d(-40), due: d(20), note: '', settles: [{ amount: 10000000, date: d(-2), txId: 'xs' }] },
             { id: 'DR', dir: 'owed', person: 'رضا', asset: 'usd', amount: 20000, date: d(-40), due: null, note: '', settles: [] },
             { id: 'DG', dir: 'owe', person: 'مادر', asset: 'gold', amount: 2000, date: d(-40), due: null, note: '', settles: [{ amount: 500, date: d(-4), opId: 'pd' }] }];
  s.tx = [
    { id: 'x4', created: 104, type: 'transfer', amount: 171000000, date: d(-25), time: '', cat: '', account: blu.id, to: '', note: 'خرید بیت‌کوین، به نوبیتکس', op: 'p4' },
    { id: 'x5', created: 105, type: 'transfer', amount: 99000000, date: d(-15), time: '11:20', cat: '', account: '', to: blu.id, note: 'فروش تتر، از والکس', op: 'p5', sms: true },
    { id: 'x8', created: 108, type: 'transfer', amount: 30000000, date: d(-9), time: '', cat: '', account: sam.id, to: '', note: 'واریز ریال، به والکس', op: 'p8' },
    { id: 'xc', created: 112, type: 'income', amount: 1500000000, date: d(-5), time: '', cat: 'حقوق', account: '', note: 'حقوق، ۱۵۰ تتر به والکس', op: 'pc', link: { kind: 'income', id: 'IN', key: m }, auto: true },
    { id: 'xe', created: 114, type: 'transfer', amount: 5000000, date: d(-3), time: '', cat: '', account: '', to: blu.id, note: 'برداشت ریال، از والکس', op: 'pe' },
    { id: 'xs', created: 115, type: 'transfer', amount: 10000000, date: d(-2), time: '', cat: '', account: blu.id, to: '', note: 'پرداخت بدهی به علی', debt: 'DA' },
    { id: 'l20', created: 116, type: 'expense', amount: 25000000, date: d(-20), time: '', cat: 'قسط', account: blu.id, note: 'اسنپ‌پی', link: { kind: 'loan', id: 'L2', key: '0' }, auto: true },
    { id: 'e1', created: 117, type: 'expense', amount: 4200000, date: d(-1), time: '13:10', cat: 'غذا', account: blu.id, note: 'ناهار' },
    { id: 'e2', created: 118, type: 'expense', amount: 30000000, date: d(-2), time: '', cat: 'سوپرمارکت', account: snap.id, note: 'خرید' },
    { id: 'e3', created: 119, type: 'expense', amount: 60000000, date: Core.addMonths(t, -1), time: '', cat: 'کفش و لباس', account: snap.id, note: 'کفش', cs: 'L1x' },
    { id: 'e4', created: 120, type: 'income', amount: 80000000, date: d(-11), time: '', cat: 'پروژه', account: sam.id, note: 'پروژه' },
    { id: 'e5', created: 121, type: 'transfer', amount: 20000000, date: d(-6), time: '', cat: '', account: blu.id, to: sam.id, note: 'بلو به سامان' },
    { id: 'e6', created: 122, type: 'transfer', amount: 7000000, date: d(-6), time: '', cat: '', account: sam.id, note: 'انتقال قدیمی بی‌مقصد' },
    { id: 'e7', created: 123, type: 'expense', amount: 60000000, date: Core.addMonths(d(-3), -1), time: '', cat: 'قسط وام', account: blu.id, note: '', link: { kind: 'loan', id: 'L1', key: '4' }, auto: true },
    { id: 'pay', created: 124, type: 'transfer', amount: 60000000, date: d(-8), time: '', cat: '', account: blu.id, to: '', note: 'تسویه‌ی اسنپ‌پی', link: { kind: 'credit', id: snap.id, key: 'L1x' }, auto: true }];
  s.loans[0].paid[4] = { date: Core.addMonths(d(-3), -1), txId: 'e7' };
  snap.settles = [{ id: 'L1x', ym: Core.ym(Core.addMonths(t, -1)), date: d(-8), amount: 60000000, txId: 'pay', bank: blu.id }];
  s.goals = [{ id: 'G1', name: 'طلا', kind: 'gold', lens: 'toman', target: 50 }];
  window.App.save(); })()"""

METRICS = """(() => { const s = window.__vault.state, t = J.today(), m = Core.ym(t), pm = Core.addYm(m, -1), R = V.replay(s), pf = V.portfolio(s);
  const r = x => x === null || x === undefined ? null : Math.round(x * 1000) / 1000;
  return {
    banks: s.accounts.filter(a => a.kind !== 'credit').map(a => [a.name, (Core.accountBalance(s, a) || {}).balance ?? null]),
    bankTotal: App.bankTotal(), creditUsed: App.creditUsedTotal(), debts: App.debtTotals(), loanLeft: App.loanRemaining(),
    holdings: R.H, totals: R.totals, pieces: R.pieces, errors: R.errors.length, realized: [r(R.realized.r), r(R.realized.u)],
    pf: [r(pf.total), r(pf.pnlR), r(pf.pnlU)], byLoc: pf.byLoc.filter(x => V.ORDER.some(a => x.h[a])).map(x => [x.loc.name, r(x.value)]),
    cf: [Core.cashFlow(s, m, t), Core.cashFlow(s, pm, t)].map(c => [c.in, c.out, c.loans, c.bills, c.daily, c.net]),
    kpi: [Core.kpis(s, m, t), Core.kpis(s, pm, t)].map(k => [k.outflow, k.income, r(k.dti), r(k.savingsRate), k.loanLoad, r(k.progress)]),
    stats: Core.monthStats(s, m).obRemaining, whatIf: (w => w ? [r(w.invested), r(w.actual)] : null)(V.whatIf(s)),
    goal: r(V.goalProgress(s, s.goals[0]).cur), counts: ['tx', 'ops', 'debts', 'loans', 'fixed', 'incomes', 'accounts', 'locations', 'prices', 'goals'].map(k => s[k].length),
    settles: s.debts.map(d => d.settles.length), paid: s.loans.map(l => Object.keys(l.paid).length) }; })()"""

with sync_playwright() as p:
    b = p.chromium.launch(); errors = []
    def page(url):
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block'); pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        pg.on('dialog', lambda d: d.accept())
        pg.goto(url); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(400); return pg
    old = page(OLD)
    check('old app is 11.2', old.evaluate("fetch('app.js').then(r => r.text()).then(t => t.includes(\"VERSION = '۱۱٫۲'\"))"))
    old.evaluate(SEED); old.reload(); old.wait_for_timeout(500)
    A = old.evaluate(METRICS); raw = old.evaluate("localStorage.getItem('vault-v1')")
    check('old: seeded data valid (no ledger errors, nothing dropped)', A['errors'] == 0 and A['counts'][0] == 15 and A['counts'][1] == 14, A['counts'])
    new = page(NEW)
    new.evaluate("raw => { localStorage.setItem('vault-v1', raw); }", raw); new.reload(); new.wait_for_timeout(600)
    B = new.evaluate(METRICS)
    for k in A:
        check(f'same after upgrade: {k}', A[k] == B[k], (A[k], B[k]))
    st = new.evaluate('JSON.parse(JSON.stringify(window.__vault.state))')
    check('v12 adds «هدیه» income category, keeps all old ones', 'هدیه' in st['categories']['income'] and all(c in st['categories']['income'] for c in json.loads(raw)['categories']['income']))
    old_tx = {t['id']: t for t in json.loads(raw)['tx']}
    check('every old transaction kept unchanged', all(old_tx[t['id']] == t for t in st['tx']) and len(st['tx']) == len(old_tx))
    # همه‌ی صفحه‌ها بدون خطا با داده‌ی قدیمی
    for tab in ('home', 'tx', 'ob', 'inv'):
        new.click(f'[data-tab={tab}]'); new.wait_for_timeout(250)
    new.evaluate("window.App.go('rep')"); new.wait_for_timeout(300); new.evaluate("window.App.go('set')"); new.wait_for_timeout(300)
    new.click('[data-tab=tx]'); new.wait_for_timeout(300)
    lst = new.inner_text('#txlist')
    check('tx list shows legacy asset ops too (swap, transfer, gift)', 'تتر به بیت‌کوین' in lst and 'انتقال تتر' in lst and 'هدیه گرفتم' in lst, lst[:300])
    # ویرایش تراکنش‌های قدیمی از فرم یکپارچه: تسویه‌ی قدیمی، انتقال بی‌مقصد، تسویه‌ی اعتبار؛ بدون تغییر عددی
    for tid in ('xs', 'e6', 'pay', 'e1', 'l20'):
        new.evaluate(f"window.App.openTx({{ id: '{tid}' }})"); new.wait_for_timeout(500); new.click('#savetx'); new.wait_for_timeout(500)
        if new.query_selector('.overlay'): new.evaluate("window.App.closeAll()"); new.wait_for_timeout(400)
    C = new.evaluate(METRICS)
    for k in ('banks', 'creditUsed', 'debts', 'cf', 'kpi', 'paid', 'settles'):
        check(f'resave of legacy entries changes nothing: {k}', B[k] == C[k], (B[k], C[k]))
    # تراکنش‌هایی که با فرم‌های دفتر دارایی ساخته شدن همون فرم‌ها رو باز می‌کنن
    new.evaluate("window.App.openTx({ id: 'x5' })"); new.wait_for_timeout(500)
    check('legacy xbank tx still opens the asset form', new.query_selector('.sheet [name=amt]') is not None and new.query_selector('#ttype') is None)
    new.evaluate("window.App.closeAll()"); new.wait_for_timeout(400)
    new.evaluate("window.App.openTx({ id: 'xc' })"); new.wait_for_timeout(500)
    check('salary tx still opens the salary form', new.query_selector('.sheet [name=sq]') is not None)
    new.evaluate("window.App.closeAll()"); new.wait_for_timeout(400)
    # بکاپ ۱۱٫۲ بازگردانی در ۱۲
    open('/tmp/v11-backup.json', 'w').write(raw)
    new.evaluate("window.App.go('set')"); new.wait_for_timeout(300)
    new.set_input_files('#restore', '/tmp/v11-backup.json'); new.wait_for_timeout(900)
    D = new.evaluate(METRICS)
    check('restoring a v11.2 backup gives the same numbers', all(A[k] == D[k] for k in A), [k for k in A if A[k] != D[k]])
    check('no console/page errors', not errors, errors)
    b.close()
print(f'\n{len(passed)} passed, {len(failed)} failed')
sys.exit(1 if failed else 0)
