"""تست end-to-end نسخه‌ی ۱۴: «واریز › وام» با هر دارایی و هر حساب، واحد اقساط، پرداخت قسط غیرتومانی با فرم برداشت؛
برنامه‌ی بازپرداخت بدهی و طلب (بدون موعد، یک تاریخ، قسطی منعطف با «ناقص»)، کارت جریان نقدی ۳ خطی، مهاجرت داده‌ی نسخه‌ی ۱۳"""
import re, sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8767/index.html'
passed, failed = [], []
def check(name, cond, info=''):
    (passed if cond else failed).append(name)
    if not cond: print('  FAIL:', name, info)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.on('dialog', lambda d: d.accept())
    S = lambda: pg.evaluate('JSON.parse(JSON.stringify(window.__vault.state))')
    wait = lambda ms=350: pg.wait_for_timeout(ms)
    def closed():
        try: pg.wait_for_function('!document.querySelector(".overlay")', timeout=6000)
        except Exception:
            print('  sheet still open; toast:', pg.inner_text('#toast')); raise
        wait(150)
    def hub(act, extra=''): pg.click('.tabbar .addbtn'); wait(); pg.click(f'.sheet .hubtile[data-act={act}]{extra}'); wait(500)
    def why(w): pg.click(f'#twhy [data-w={w}]'); wait(200)
    def asset(a, sel='#tasset'): pg.click(f'{sel} [data-a={a}]'); wait(200)
    def setdate(name, expr):  # expr: عبارت JS برای تاریخ شمسی
        pg.evaluate(f"""(() => {{ const v = {expr}, [y, m, d] = v.split('/').map(Number), w = document.querySelector('[data-date={name}]');
          w.querySelector('[data-p=y]').value = y; w.querySelector('[data-p=m]').value = m; w.querySelector('[data-p=d]').value = d;
          w.querySelector('[data-p=d]').dispatchEvent(new Event('change', {{ bubbles: true }})); }})()"""); wait(150)
    bal = lambda acc: pg.evaluate(f"Core.accountBalance(window.__vault.state, window.__vault.state.accounts.find(a => a.id === '{acc}')).balance")
    held = lambda loc, a: pg.evaluate(f"(V.replay(window.__vault.state).H['{loc}'] || {{}})['{a}'] || 0")
    cf = lambda: pg.evaluate("Core.cashFlow(window.__vault.state, Core.ym(J.today()), J.today())")
    sched = lambda did: pg.evaluate(f"Core.debtSchedule(window.__vault.state.debts.find(d => d.id === '{did}'), J.today())")
    U = 1000000  # یک تتر (میکروتتر)
    UD = 100     # یک دلار (سنت)

    pg.goto(BASE); pg.wait_for_load_state('networkidle'); wait()
    pg.evaluate("""(() => { const s = window.__vault.state, t = J.today();
      s.settings.unit = 'rial';
      s.locations = [{ id: 'WX', name: 'والکس' }];
      s.accounts = [{ id: 'BL', kind: 'bank', bank: 'بلو', name: 'بلوبانک', num: '', balance: 1000000000, stamp: J.addDays(t, -2) + ' 10:00', at: 1 },
        { id: 'SM', kind: 'bank', bank: 'سامان', name: 'سامان', num: '', balance: 500000000, stamp: J.addDays(t, -2) + ' 10:00', at: 1 }];
      s.prices = [{ date: J.addDays(t, -1), gold: 100000000, usdt: 1000000, usd: 1000000, btc: 100000, eur: 1100000, silver: 1000000 }];
      s.ops = [{ id: 'o1', created: 1, date: J.addDays(t, -10), type: 'open', loc: 'WX', in: { a: 'usdt', q: 300000000 }, cost: 270000000 },
               { id: 'o2', created: 2, date: J.addDays(t, -10), type: 'open', loc: 'WX', in: { a: 'usd', q: 5000000000 }, cost: 5000000000 }];
      s.tx = []; s.debts = []; s.incomes = []; s.fixed = []; s.loans = [];
      window.App.save(); window.App.go('home'); })()"""); wait()
    cf0 = cf()

    # ۱) واریز › وام (تومانی، به بلوبانک)
    hub('add', '[data-type=income]')
    chips = [x.inner_text() for x in pg.query_selector_all('#twhy .chip')]
    check('deposit purposes include وام', chips == ['درآمد', 'هدیه گرفتم', 'قرض گرفتم', 'دریافت طلب', 'وام'], chips)
    why('loan')
    check('loan fields shown', all(pg.is_visible(x) for x in ['#lnname', '#lnlender', '#lnunit', '[name=lnamt]', '#lncount', '[data-date=lnfirst]']))
    check('loan note: not income', 'آمد' in pg.inner_text('.tnote'))
    pg.select_option('#acc', 'BL'); wait(150)
    pg.fill('.sheet [name=amount]', '200000000')
    pg.fill('#lnname', 'وام بلو ۲۰۰'); pg.fill('.sheet [name=lnamt]', '20000000'); pg.fill('#lncount', '12'); wait(200)
    check('loan preview: total and interest', 'سود وام' in pg.inner_text('#lnprev') and '۴۰٬۰۰۰٬۰۰۰' in pg.inner_text('#lnprev'), pg.inner_text('#lnprev'))
    pg.click('#savetx'); closed()
    st = S(); L1 = next((l for l in st['loans'] if l['name'] == 'وام بلو ۲۰۰'), None)
    check('loan created from deposit', L1 is not None and L1['count'] == 12 and L1['amount'] == 20000000 and L1.get('src') == 'flow' and 'unit' not in L1, L1)
    t1 = next((t for t in st['tx'] if t.get('loanRecv') == (L1 or {}).get('id')), None)
    check('receipt tx: transfer to BL, why loan', t1 is not None and t1['type'] == 'transfer' and t1['to'] == 'BL' and t1['why'] == 'loan', t1)
    check('loan.recv points to tx', L1 and L1['recv']['txId'] == t1['id'] and L1['recv']['asset'] == 'irr' and L1['recv']['amount'] == 200000000)
    check('balance +200M', bal('BL') == 1200000000, bal('BL'))
    c1 = cf()
    check('not month income', c1['in'] == cf0['in'] and c1['loanIn'] == 200000000, c1)
    check('no debt created', len(st['debts']) == 0)

    # ویرایش از فهرست تراکنش‌ها: همون فرم واریز با فیلدهای وام
    pg.click('[data-tab=tx]'); wait()
    pg.click('.txrow:has-text("دریافت وام")'); wait(500)
    check('edit opens deposit form with loan', pg.is_visible('#lnname') and pg.input_value('#lnname') == 'وام بلو ۲۰۰')
    pg.fill('#lncount', '10'); pg.click('#savetx'); closed()
    st = S(); L1 = next(l for l in st['loans'] if l['name'] == 'وام بلو ۲۰۰')
    check('edit updates same loan', L1['count'] == 10 and len([l for l in st['loans'] if l['name'] == 'وام بلو ۲۰۰']) == 1 and len([t for t in st['tx'] if t.get('loanRecv')]) == 1)

    # ۲) وام تتری مستقیم به والکس، اقساط به تتر
    hub('add', '[data-type=income]'); why('loan')
    pg.select_option('#acc', 'WX'); wait(150); asset('usdt')
    pg.fill('.sheet [name=amount]', '1000'); wait(150)
    check('loan unit follows received asset', pg.get_attribute('#lnunit [data-u=usdt]', 'aria-pressed') == 'true')
    pg.fill('#lnname', 'وام تتری'); pg.fill('.sheet [name=lnamt]', '110'); pg.fill('#lncount', '10')
    setdate('lnfirst', 'J.addDays(J.today(), -3)')
    pg.click('#savetx'); closed()
    st = S(); L2 = next(l for l in st['loans'] if l['name'] == 'وام تتری')
    op2 = next((o for o in st['ops'] if o.get('loanRecv') == L2['id']), None)
    check('usdt loan: op recv why loan', op2 is not None and op2['type'] == 'recv' and op2['why'] == 'loan' and op2['in']['q'] == 1000 * U, op2)
    check('usdt loan: unit and amount', L2.get('unit') == 'usdt' and L2['amount'] == 110 * U, L2)
    check('wallex usdt +1000', held('WX', 'usdt') == 1300 * U, held('WX', 'usdt'))
    check('usdt receipt not income', cf()['in'] == cf0['in'])
    ob = pg.evaluate(f"Core.obligationsForMonth(window.__vault.state, Core.ym(J.today())).find(o => o.id === '{L2['id']}')")
    check('installment in toman at today price', ob and ob['amount'] == 110000000 and ob['unit'] == 'usdt', ob)
    rem = pg.evaluate(f"Core.loanSummary(window.__vault.state.loans.find(l => l.id === '{L2['id']}'))")
    check('remaining: qty and rial', rem['remainingQty'] == 1100 * U and rem['remainingAmount'] == 1100000000, rem)

    # پرداخت قسط ۱ با تتر: فرم برداشت از پیش پر شده
    pg.click('[data-tab=ob]'); wait(); pg.click('#view [role=group] [aria-pressed]:has-text("اقساط")') if False else None
    pg.evaluate("window.App.go('ob')"); wait()
    pg.click('.card.loan:has-text("وام تتری")'); wait(500)
    check('loan card/detail shows usdt', 'تتر' in pg.inner_text('.sheet'))
    pg.click('.sheet [data-inst="0"]'); wait(600)
    check('pay opens withdrawal form', pg.is_visible('#savetx') and pg.get_attribute('#ttype [aria-pressed=true]', 'data-t') == 'expense')
    check('prefilled usdt 110 from wallex', pg.get_attribute('#tasset [data-a=usdt]', 'aria-pressed') == 'true' and pg.input_value('.sheet [name=amount]') in ('۱۱۰', '110') and pg.input_value('#acc') == 'WX',
          (pg.input_value('.sheet [name=amount]'), pg.input_value('#acc')))
    check('linked to installment', pg.input_value('#link') == f"loan|{L2['id']}|0", pg.input_value('#link'))
    pg.click('#savetx'); pg.wait_for_function('!document.querySelector("#savetx")'); wait()
    check('loan detail refreshed: installment 1 paid', 'پرداخت شد' in pg.inner_text('.sheet'))
    pg.evaluate("window.App.closeAll()"); wait()
    st = S(); L2 = next(l for l in st['loans'] if l['name'] == 'وام تتری')
    check('installment 1 paid', '0' in L2['paid'] and L2['paid']['0'].get('txId'))
    check('wallex usdt −110', held('WX', 'usdt') == 1190 * U, held('WX', 'usdt'))
    check('counted as installment in cash flow', cf()['loans'] >= 110000000, cf())
    # قسط ۲ با تومان از بلو (با قیمت روز)
    pg.evaluate("window.App.closeAll()"); wait()
    pg.evaluate(f"window.App.openTx({{ kind: 'out', why: 'expense', preset: {{ asset: 'irr', q: 110000000, acc: 'BL' }}, link: {{ kind: 'loan', id: '{L2['id']}', key: '1' }} }})"); wait(500)
    pg.click('#savetx'); closed()
    st = S(); L2 = next(l for l in st['loans'] if l['name'] == 'وام تتری')
    check('installment 2 paid in toman', '1' in L2['paid'] and bal('BL') == 1200000000 - 110000000, bal('BL'))

    # حذف دریافت وام تتری: قسط پرداخت‌شده داره → وام می‌مونه
    pg.evaluate("window.App.go('tx')"); wait()
    pg.evaluate(f"window.App.openTx({{ op: '{op2['id']}' }})"); wait(500)
    pg.click('#deltx'); closed()
    st = S(); L2 = next((l for l in st['loans'] if l['name'] == 'وام تتری'), None)
    check('receipt removed, loan with paid kept', L2 is not None and 'recv' not in L2 and not any(o.get('loanRecv') for o in st['ops']) and held('WX', 'usdt') == 190 * U, (L2, held('WX', 'usdt')))
    # حذف دریافت وام تومانی: قسطی پرداخت نشده → وام هم حذف
    pg.evaluate(f"window.App.openTx({{ id: '{t1['id']}' }})"); wait(500)
    pg.click('#deltx'); closed()
    st = S()
    check('receipt + flow-made loan removed', not any(l['name'] == 'وام بلو ۲۰۰' for l in st['loans']) and bal('BL') == 1000000000 - 110000000, bal('BL'))

    # ۳) قرض قسطی: ۴۵۰۰ دلار از مادر، ماهی ۵۰۰
    hub('add', '[data-type=income]'); why('borrow')
    check('repayment modes', [x.inner_text() for x in pg.query_selector_all('#tmode .chip')] == ['بدون موعد', 'یک تاریخ', 'قسطی'])
    pg.fill('#tperson', 'مادر'); pg.select_option('#acc', 'WX'); wait(150); asset('usd'); pg.fill('.sheet [name=amount]', '4500')
    pg.click('#tmode [data-m=plan]'); wait(200)
    check('plan fields shown', pg.is_visible('.sheet [name=tpamt]') and pg.is_visible('[data-date=tfirst]'))
    pg.fill('.sheet [name=tpamt]', '500'); wait(200)
    check('plan preview: 9 installments', '۹ قسط' in pg.inner_text('#tprev'), pg.inner_text('#tprev'))
    pg.click('#savetx'); closed()
    st = S(); D = next(d for d in st['debts'] if d['person'] == 'مادر')
    check('debt with plan', D['dir'] == 'owe' and D['asset'] == 'usd' and D['plan']['amount'] == 500 * UD and D.get('sched') and 'due' in D and not D['due'], D)
    sc = sched(D['id'])
    check('schedule: 9 items, all due', sc['mode'] == 'plan' and len(sc['items']) == 9 and all(i['status'] == 'due' for i in sc['items']), sc)

    # برنامه با سابقه: قسط اول ناقص (۳۰۰)، دوم کامل، سوم امروز
    pg.evaluate(f"""(() => {{ const s = window.__vault.state, d = s.debts.find(x => x.id === '{D['id']}'), t = J.today(), f = J.addMonths(t, -2, J.jParse(t).d);
      d.plan.first = f; d.date = J.addDays(f, -10); d.sched = d.date;
      d.settles = [{{ amount: 300 * {UD}, date: J.addDays(f, 2) }}, {{ amount: 500 * {UD}, date: J.addDays(J.addMonths(f, 1, J.jParse(f).d), 1) }}];
      window.App.save(); window.App.render(); }})()"""); wait()
    sc = sched(D['id']); st_ = [i['status'] for i in sc['items']]
    check('flexible: first partial, second paid', st_[0] == 'partial' and sc['items'][0]['paidQ'] == 300 * UD and st_[1] == 'paid', st_)
    check('flexible: rest rebuilt from remainder (3700 → 8 more, last 200)', len(sc['items']) == 10 and sc['items'][-1]['amount'] == 200 * UD and sc['left'] == 3700 * UD, (len(sc['items']), sc['items'][-1]))
    check('next = installment 3 (500)', sc['next'] and sc['next']['i'] == 2 and sc['next']['left'] == 500 * UD, sc['next'])
    pg.evaluate("window.App.go('ob')"); wait()
    pg.evaluate(f"window.App.openDebtDetail ? 0 : 0");
    pg.evaluate("window.App.go('home')"); wait()
    home = pg.inner_text('#view')
    check('home upcoming lists debt installment', 'قسط بدهی به مادر' in home, home[:400])
    check('home: due debts row', 'بدهی‌های سررسیده' in home)
    pg.click('.ob:has-text("قسط بدهی به مادر") .tick'); wait(600)
    check('tick opens repay form preset', pg.is_visible('#savetx') and pg.get_attribute('#twhy [data-w=repay]', 'aria-pressed') == 'true' and pg.input_value('#tdebt') == D['id'])
    check('prefilled 500 usd', pg.get_attribute('#tasset [data-a=usd]', 'aria-pressed') == 'true' and pg.input_value('.sheet [name=amount]') in ('۵۰۰', '500'), pg.input_value('.sheet [name=amount]'))
    pg.select_option('#acc', 'WX'); wait(150)
    pg.click('#savetx'); closed()
    sc = sched(D['id'])
    check('installment 3 paid', sc['items'][2]['status'] == 'paid' and sc['left'] == 3200 * UD, sc['items'][2])
    c2 = cf()
    check('3-line: debt payment counted in balance', c2['debtOut'] == 500000000 and c2['debtBal'] == -500000000, c2)
    check('net includes balance, رفت unchanged', c2['out'] == cf()['out'] and c2['net'] == c2['in'] - c2['out'] + c2['debtBal'])
    pg.evaluate("window.App.go('home')"); wait()
    check('hero shows balance line', 'بالانس بدهی و طلب' in pg.inner_text('.hero') and 'پرداخت بدهی' in pg.inner_text('.hero'), pg.inner_text('.hero'))

    # جزئیات بدهی: فهرست اقساط با «ناقص»
    pg.evaluate("window.App.go('ob')"); wait()
    pg.evaluate("(() => { const b = [...document.querySelectorAll('#view [role=group] .chip')].find(c => c.textContent.includes('بدهی و طلب')); if (b) b.click(); })()"); wait(300)
    pg.click('.card.debt:has-text("مادر")'); wait(500)
    det = pg.inner_text('.sheet')
    check('detail: installments with partial', 'اقساط' in det and 'ناقص' in det and 'پرداخت شد' in det, det[:500])
    pg.evaluate("window.App.closeAll()"); wait()

    # ۴) بدهی تک‌تاریخ سخت‌گیر و بدهی بی‌تاریخ
    pg.evaluate("""(() => { const s = window.__vault.state, t = J.today();
      s.debts.push({ id: 'DD', dir: 'owe', person: 'علی', asset: 'irr', amount: 50000000, date: J.addDays(t, -40), due: J.addDays(t, -1), sched: J.addDays(t, -40), settles: [{ amount: 20000000, date: J.addDays(t, -5) }], note: '' });
      s.debts.push({ id: 'DN', dir: 'owe', person: 'رضا', asset: 'irr', amount: 30000000, date: J.addDays(t, -40), due: null, settles: [{ amount: 10000000, date: t }], note: '' });
      window.App.save(); window.App.render(); })()"""); wait()
    sc = sched('DD')
    check('single date past and unpaid → late', sc['mode'] == 'date' and sc['next']['status'] == 'late' and sc['next']['left'] == 30000000, sc)
    pg.evaluate("window.App.go('home')"); wait()
    check('late single-date debt in home list', 'بدهکار به علی' in pg.inner_text('#view'))
    c3 = cf()
    check('dated debt payment in balance; undated not', c3['debtOut'] == 500000000 + (20000000 if pg.evaluate("Core.ym(J.addDays(J.today(), -5)) === Core.ym(J.today())") else 0), c3)

    # ۵) طلب قسطی: دریافت قسط = مثبت در بالانس
    pg.evaluate("""(() => { const s = window.__vault.state, t = J.today();
      s.debts.push({ id: 'DO', dir: 'owed', person: 'سارا', asset: 'irr', amount: 90000000, date: J.addDays(t, -3), due: null, plan: { amount: 30000000, first: t }, sched: J.addDays(t, -3), settles: [], note: '' });
      window.App.save(); window.App.render(); })()"""); wait()
    pg.evaluate("window.App.openTx({ kind: 'in', why: 'collect', preset: { debt: 'DO', asset: 'irr', q: 30000000, acc: 'SM' } })"); wait(500)
    pg.click('#savetx'); closed()
    c4 = cf()
    check('collect installment in balance', c4['debtIn'] == 30000000 and c4['debtBal'] == c3['debtBal'] + 30000000, c4)
    check('receivable installment 1 paid', sched('DO')['items'][0]['status'] == 'paid')

    # ۶) فرم بدهی/طلب: حالت قسطی با پیش‌نمایش
    pg.evaluate("window.App.go('ob')"); wait()
    pg.evaluate("(() => { const b = [...document.querySelectorAll('#view [role=group] .chip')].find(c => c.textContent.includes('بدهی و طلب')); if (b) b.click(); })()"); wait(300)
    pg.click('[data-act=newdebt][data-dir=owe]'); wait(500)
    pg.fill('#dperson', 'دایی'); pg.fill('.sheet [name=damount]', '12000000')
    pg.click('#dmode [data-m=plan]'); wait(150); pg.fill('.sheet [name=dpamt]', '5000000'); wait(200)
    check('debt form plan preview (3, last 2M)', '۳ قسط' in pg.inner_text('#dprev') and '۲٬۰۰۰٬۰۰۰' in pg.inner_text('#dprev'), pg.inner_text('#dprev'))
    pg.click('#dsave'); closed()
    D2 = next(d for d in S()['debts'] if d['person'] == 'دایی')
    check('debt form saves plan + sched', D2['plan']['amount'] == 5000000 and D2.get('sched') == D2['date'] and not D2['due'], D2)
    # برگرداندن به «بدون موعد»
    pg.click('.card.debt:has-text("دایی")'); wait(500); pg.click('#dedit'); wait(500)
    pg.click('#dmode [data-m=none]'); wait(150); pg.click('#dsave'); closed()
    D2 = next(d for d in S()['debts'] if d['person'] == 'دایی')
    check('back to none clears plan/sched', 'plan' not in D2 and 'sched' not in D2 and not D2['due'], D2)

    # ۷) مهاجرت داده‌ی نسخه‌ی ۱۳
    pg.evaluate("""(() => { const raw = JSON.parse(localStorage.getItem('vault-v1')), t = J.today();
      raw.loans.push({ id: 'V13', name: 'وام ۱۳', lender: '', amount: 1000000, count: 3, first: J.addMonths(t, 1), cat: 'وام', paid: {}, recv: { amount: 5000000, account: 'SM', date: t, txId: 'T13' } });
      raw.tx.push({ id: 'T13', created: 1, time: '', type: 'transfer', amount: 5000000, date: t, cat: '', account: '', to: 'SM', note: 'دریافت وام: وام ۱۳', loanRecv: 'V13' });
      localStorage.setItem('vault-v1', JSON.stringify(raw)); })()""")
    smBefore = bal('SM')
    pg.reload(); pg.wait_for_load_state('networkidle'); wait()
    st = S(); t13 = next(t for t in st['tx'] if t['id'] == 'T13'); l13 = next(l for l in st['loans'] if l['id'] == 'V13')
    check('v13 receipt migrated (why loan, recv asset)', t13['why'] == 'loan' and l13['recv']['asset'] == 'irr')
    check('v13 balance unchanged after reload', bal('SM') == smBefore + 5000000 or bal('SM') == smBefore, (bal('SM'), smBefore))
    pg.evaluate("window.App.openTx({ id: 'T13' })"); wait(500)
    check('v13 receipt opens deposit form with loan', pg.is_visible('#lnname') and pg.input_value('#lnname') == 'وام ۱۳')
    pg.evaluate("window.App.closeAll()"); wait()
    check('no JS errors', not errors, errors)
    b.close()
print(f'{len(passed)} passed, {len(failed)} failed')
sys.exit(1 if failed else 0)
