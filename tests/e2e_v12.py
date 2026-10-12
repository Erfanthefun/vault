"""تست end-to-end نسخه‌ی ۱۲: برداشت، واریز، انتقال و تبدیل با هر دارایی در هر حساب؛ قرض و تسویه؛ ویرایش و حذف؛
فهرست تراکنش‌ها، کارت حساب‌ها، لینک‌های ویجت، جست‌وجو، اکسل، چیدمان موبایل"""
import re, sys, openpyxl
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8767/index.html'
passed, failed = [], []
def check(name, cond, info=''):
    (passed if cond else failed).append(name)
    if not cond: print('  FAIL:', name, info)
fa = lambda s: re.sub('[۰-۹]', lambda m: str(ord(m.group()) - 1776), s).replace('٬', '').replace(',', '')
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block', accept_downloads=True)
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    answers = []
    pg.on('dialog', lambda d: d.accept(answers.pop(0) if (d.type == 'prompt' and answers) else '') if d.type == 'prompt' else d.accept())
    S = lambda: pg.evaluate('JSON.parse(JSON.stringify(window.__vault.state))')
    wait = lambda ms=350: pg.wait_for_timeout(ms)
    def closed(): pg.wait_for_function('!document.querySelector(".overlay")'); wait(150)
    def hub(act, extra=''): pg.click('.tabbar .addbtn'); wait(); pg.click(f'.sheet .hubtile[data-act={act}]{extra}'); wait(500)
    def toast(): pg.wait_for_function("document.querySelector('#toast').innerText.trim()"); return pg.inner_text('#toast')
    bal = lambda acc: pg.evaluate(f"Core.accountBalance(window.__vault.state, window.__vault.state.accounts.find(a => a.id === '{acc}')).balance")
    held = lambda loc, a: pg.evaluate(f"(V.replay(window.__vault.state).H['{loc}'] || {{}})['{a}'] || 0")
    cf = lambda: pg.evaluate("Core.cashFlow(window.__vault.state, Core.ym(J.today()), J.today())")
    def why(w): pg.click(f'#twhy [data-w={w}]'); wait(150)
    def kind(k): pg.click(f'#ttype [data-t={k}]'); wait(150)
    def asset(a, sel='#tasset'): pg.click(f'{sel} [data-a={a}]'); wait(150)

    pg.goto(BASE); pg.wait_for_load_state('networkidle'); wait()
    pg.evaluate("""(() => { const s = window.__vault.state, t = J.today();
      s.locations = [{ id: 'WX', name: 'والکس' }, { id: 'NB', name: 'نوبیتکس' }, { id: 'WG', name: 'وال‌گلد' }];
      s.accounts = [{ id: 'BL', kind: 'bank', bank: 'بلو', name: 'بلوبانک', num: '', balance: 1000000000, stamp: J.addDays(t, -2) + ' 10:00', at: 1 },
        { id: 'SM', kind: 'bank', bank: 'سامان', name: 'سامان', num: '', balance: 200000000, stamp: J.addDays(t, -2) + ' 10:00', at: 1 },
        { id: 'CR', kind: 'credit', name: 'اسنپ‌پی اعتباری', limit: 100000000, paid: {}, settles: [] }];
      s.prices = [{ date: J.addDays(t, -1), gold: 100000000, usdt: 1000000, usd: 1000000, btc: 100000, eur: 1100000, silver: 1000000 }];
      s.ops = [{ id: 'o1', created: 1, date: J.addDays(t, -3), type: 'open', loc: 'WX', in: { a: 'usdt', q: 300000000 }, cost: 270000000 },
               { id: 'o2', created: 2, date: J.addDays(t, -3), type: 'open', loc: 'WX', in: { a: 'irr', q: 100000000 }, cost: 100000000 }];
      s.tx = []; s.debts = []; s.incomes = []; s.fixed = [];
      s.loans = [{ id: 'LN', name: 'وام بلو', lender: 'بلوبانک', amount: 50000000, count: 12, first: J.addDays(t, -40), cat: 'قسط وام', paid: {} }];
      window.App.save(); window.App.render(); })()"""); wait()
    CF0 = cf()

    # ۱) ساختار فرم
    hub('add', '[data-type=expense]')
    check('form: 4 kinds (برداشت، واریز، انتقال، تبدیل)', [x.inner_text() for x in pg.query_selector_all('#ttype .chip')] == ['برداشت', 'واریز', 'انتقال', 'تبدیل'])
    check('form: 4 purposes for withdrawal', [x.inner_text() for x in pg.query_selector_all('#twhy .chip')] == ['خرج', 'هدیه دادم', 'قرض دادم', 'پرداخت بدهی'])
    check('form: 8 assets, toman first', len(pg.query_selector_all('#tasset .chip')) == 8 and pg.get_attribute('#tasset .chip >> nth=0', 'aria-pressed') == 'true')
    groups = pg.eval_on_selector('#acc', 'e => [...e.querySelectorAll("optgroup")].map(g => g.label)')
    check('form: accounts grouped: bank, exchanges/places, credit', groups == ['حساب بانکی', 'صرافی، پلتفرم و محل نگهداری', 'اعتبار خرید (تسویه آخر ماه)'], groups)
    pg.select_option('#acc', 'CR'); wait(150)
    check('credit: only toman enabled', all(c.is_disabled() for c in pg.query_selector_all('#tasset .chip')[1:]) and not pg.query_selector('#tasset .chip').is_disabled())
    pg.select_option('#acc', 'WX'); wait(150); asset('usdt')
    check('form: holding hint for Wallex tether', '۳۰۰' in pg.inner_text('#have') and 'والکس' in pg.inner_text('#have'), pg.inner_text('#have'))
    check('form: value field shown for non-toman', pg.is_visible('.sheet [name=value]'))
    pg.fill('.sheet [name=amount]', '10'); wait(200)
    check('form: value auto = 10 × 100,000 toman', fa(pg.input_value('.sheet [name=value]')) == '1000000', pg.input_value('.sheet [name=value]'))
    check('form: price hint', 'هر تتر' in pg.inner_text('#valhint'))
    answers.append('صرافی تست'); pg.select_option('#acc', '__newloc'); wait(300)
    check('form: add exchange inline', any(l['name'] == 'صرافی تست' for l in S()['locations']) and pg.eval_on_selector('#acc', 'e => e.options[e.selectedIndex].text') == 'صرافی تست')
    pg.click('[data-close]'); closed()

    # ۲) خرج با تتر از والکس، وصل به قسط
    hub('add', '[data-type=expense]')
    pg.select_option('#acc', 'WX'); asset('usdt'); pg.fill('.sheet [name=amount]', '50'); wait(150)
    cur = pg.evaluate("(() => { const o = Core.obligationsForMonth(window.__vault.state, Core.ym(J.today())).find(x => x.id === 'LN'); return `loan|LN|${o.key}`; })()"); pg.select_option('#link', cur)
    pg.click('#cats .chip >> nth=0'); pg.click('#savetx'); closed()
    st = S(); op = [o for o in st['ops'] if o['type'] == 'send'][0]; lt = [t for t in st['tx'] if t.get('op') == op['id']][0]
    check('expense in tether: ledger −50, linked expense tx 5M toman', held('WX', 'usdt') == 250000000 and lt['type'] == 'expense' and lt['amount'] == 50000000 and lt['account'] == '', lt)
    check('installment marked paid by it', any(v.get('txId') == lt['id'] for v in st['loans'][0]['paid'].values()))
    check('cash flow: counted once as installment', cf()['loans'] == 50000000 and cf()['daily'] == CF0['daily'], cf())
    check('bank untouched', bal('BL') == 1000000000)

    # ۳) قرض دادن تتر به دوست
    hub('add', '[data-type=expense]'); why('lend')
    check('lend: person field + due', pg.is_visible('#tperson') and pg.is_visible('#tmode'))
    pg.fill('#tperson', 'امیر'); pg.select_option('#acc', 'WX'); asset('usdt'); pg.fill('.sheet [name=amount]', '20'); wait(200)
    check('lend: summary says a receivable is made', 'طلبکار از امیر' in pg.inner_text('#tsum'), pg.inner_text('#tsum'))
    pg.click('#savetx'); closed()
    st = S(); d = [x for x in st['debts'] if x['person'] == 'امیر'][0]
    check('lend: receivable in tether, 20 USDT, linked to the entry', d['dir'] == 'owed' and d['asset'] == 'usdt' and d['amount'] == 20000000 and d.get('src', {}).get('op'), d)
    check('lend: ledger 250 → 230; not in cash flow', held('WX', 'usdt') == 230000000 and cf()['out'] == 50000000)
    check('lend: toast mentions the new receivable', 'امیر' in pg.inner_text('#toast'))

    # ۴) دریافت بخشی از طلب به نوبیتکس با تتر، و بقیه با تومان به بلو
    pg.click('[data-tab=ob]'); wait(); pg.click('[data-act=obt][data-t=debt]'); wait(); pg.click('.card.debt:has-text("امیر")'); wait(400)
    check('debt detail: link to the source entry', pg.query_selector('#dsrc') is not None)
    pg.click('#settle'); wait(700); pg.select_option('#acc', 'NB'); wait(150); pg.fill('.sheet [name=amount]', '8'); pg.click('#savetx'); closed()
    check('collect 8 USDT into Nobitex: left 12', held('NB', 'usdt') == 8000000 and [x for x in S()['debts'] if x['person'] == 'امیر'][0]['amount'] - sum(z['amount'] for z in [x for x in S()['debts'] if x['person'] == 'امیر'][0]['settles']) == 12000000)
    hub('add', '[data-type=income]'); why('collect')
    did = [x for x in S()['debts'] if x['person'] == 'امیر'][0]['id']; pg.select_option('#tdebt', did); wait(200)
    check('collect: picking the receivable fills asset & remaining', pg.get_attribute('#tasset [data-a=usdt]', 'aria-pressed') == 'true' and pg.input_value('.sheet [name=amount]') == '۱۲')
    pg.select_option('#acc', 'BL'); asset('irr'); pg.fill('.sheet [name=amount]', '1200000'); wait(200)
    check('collect with toman: summary converts to tether', '۱۲ تتر' in pg.inner_text('#tsum') and 'مانده بعدش' in pg.inner_text('#tsum'), pg.inner_text('#tsum'))
    pg.click('#savetx'); closed()
    d = [x for x in S()['debts'] if x['person'] == 'امیر'][0]
    check('collect with toman: receivable closed, bank +1.2M toman', d.get('closed') and bal('BL') == 1012000000, (d, bal('BL')))
    check('collects are not income', cf()['in'] == CF0['in'])

    # ۵) درآمد با بیت‌کوین به نوبیتکس، هدیه‌ی طلا به وال‌گلد، هدیه دادن تتر
    hub('add', '[data-type=income]'); pg.select_option('#acc', 'NB'); asset('btc'); pg.fill('.sheet [name=amount]', '0.001'); wait(200)
    check('btc income: value 0.001 × 100k$ × 100k toman = 10M toman', fa(pg.input_value('.sheet [name=value]')) == '10000000', pg.input_value('.sheet [name=value]'))
    pg.click('#cats .chip >> nth=0'); pg.click('#savetx'); closed()
    check('btc income: ledger + cash flow «آمد»', held('NB', 'btc') == 100000 and cf()['in'] == CF0['in'] + 100000000)
    hub('addx', '[data-kind=in][data-why=gift]'); pg.select_option('#acc', 'WG'); asset('gold'); pg.fill('.sheet [name=amount]', '1.5'); pg.click('#savetx'); closed()
    hub('add', '[data-type=expense]'); why('gift')
    pg.select_option('#acc', 'WX'); asset('usdt'); pg.fill('.sheet [name=amount]', '5'); pg.click('#savetx'); closed()
    st = S(); gtx = [t for t in st['tx'] if t.get('why') == 'gift']
    check('gifts: «هدیه» income 15M and «کادو» expense 0.5M', sorted((t['type'], t['cat'], t['amount']) for t in gtx) == [('expense', 'کادو', 5000000), ('income', 'هدیه', 150000000)], gtx)
    check('gift given: no realized P&L from it', pg.evaluate("V.replay(window.__vault.state).realized.r") == pg.evaluate("(() => { const s = JSON.parse(JSON.stringify(window.__vault.state)); s.ops = s.ops.filter(o => !(o.type === 'send' && o.why === 'gift')); return V.replay(s).realized.r; })()"))

    # ۶) انتقال‌ها
    hub('add', '[data-type=transfer]')
    check('move: label «از حساب» and destination select', pg.inner_text('#acclbl') == 'از حساب' and pg.is_visible('#acc2'))
    pg.select_option('#acc', 'WX'); asset('usdt'); pg.fill('.sheet [name=amount]', '30'); pg.select_option('#acc2', 'NB'); wait(150)
    check('move: destination holding hint', 'نوبیتکس' in pg.inner_text('#have2'))
    pg.click('#savetx'); closed()
    check('move tether Wallex → Nobitex', held('WX', 'usdt') == 195000000 and held('NB', 'usdt') == 38000000)
    hub('add', '[data-type=transfer]'); pg.select_option('#acc', 'BL'); pg.fill('.sheet [name=amount]', '3000000'); pg.select_option('#acc2', 'WX'); pg.click('#savetx'); closed()
    check('move toman Blu → Wallex: bank −3M, Wallex rial +3M', bal('BL') == 982000000 and held('WX', 'irr') == 130000000, (bal('BL'), held('WX', 'irr')))
    check('moves: no income/expense', cf()['in'] == CF0['in'] + 100000000 + 150000000)

    # ۷) تبدیل در یک ثبت
    hub('add', '[data-type=conv]')
    check('conv: defaults to an exchange → a bank, tether → toman', pg.input_value('#acc') in ('WX', 'NB', 'WG') and pg.input_value('#acc2') in ('BL', 'SM') and pg.get_attribute('#tasset2 [data-a=irr]', 'aria-pressed') == 'true')
    pg.select_option('#acc', 'WX'); asset('usdt'); pg.fill('.sheet [name=amount]', '100'); pg.select_option('#acc2', 'BL'); wait(150); pg.fill('.sheet [name=amount2]', '10500000'); wait(200)
    check('conv: rate summary 105,000 per tether', '۱۰۵٬۰۰۰' in pg.inner_text('#tsum'), pg.inner_text('#tsum'))
    pg.click('#savetx'); closed()
    check('conv tether → Blu: bank +10.5M, tether −100', bal('BL') == 1087000000 and held('WX', 'usdt') == 95000000)
    check('conv: toast mentions bank update', 'بلوبانک' in pg.inner_text('#toast'))
    hub('add', '[data-type=conv]'); pg.select_option('#acc', 'NB'); asset('usdt'); pg.fill('.sheet [name=amount]', '10'); pg.select_option('#acc2', 'WG'); wait(150); asset('gold', '#tasset2'); pg.fill('.sheet [name=amount2]', '0.01'); pg.click('#savetx'); closed()
    check('conv between two exchanges (tether at Nobitex → gold at WallGold)', held('NB', 'usdt') == 28000000 and held('WG', 'gold') == 1510)
    hub('add', '[data-type=conv]'); pg.select_option('#acc', 'BL'); asset('irr'); pg.fill('.sheet [name=amount]', '10000000'); pg.select_option('#acc2', 'BL'); wait(150); asset('gold', '#tasset2'); pg.fill('.sheet [name=amount2]', '1'); pg.click('#savetx'); closed()
    check('gold kept at the bank', held('BL', 'gold') == 1000 and bal('BL') == 987000000)

    # ۸) فهرست تراکنش‌ها
    pg.click('[data-tab=tx]'); wait()
    lst = pg.inner_text('#txlist')
    check('tx list: shows lend, transfer and conversions', 'قرض دادم به امیر' in lst and 'انتقال تتر' in lst and 'تتر به طلای ۱۸ عیار' in lst, lst[:400])
    check('tx list: quantities with asset units', '−۲۰' in lst and 'تتر' in lst)
    for f, word in (('out', 'قرض دادم'), ('in', 'دریافت طلب'), ('move', 'انتقال تتر'), ('conv', 'فروش تتر')):
        pg.click(f'[data-act=txf][data-f={f}]'); wait(200); check(f'tx filter {f}', word in pg.inner_text('#txlist'), pg.inner_text('#txlist')[:200])
    pg.click('[data-act=txf][data-f=all]'); wait(150)
    pg.fill('#txq', 'امیر'); wait(250); check('search by person', 'قرض دادم به امیر' in pg.inner_text('#txlist'))
    pg.fill('#txq', 'بیت‌کوین'); wait(250); check('search by asset', 'نوبیتکس' in pg.inner_text('#txlist'))
    pg.fill('#txq', ''); wait(250)
    pg.click('[data-tab=home]'); wait()
    check('home: recent includes asset entries', len(pg.query_selector_all('.txlist .txrow')) == 4)
    accs = pg.inner_text('.accs')
    check('home accounts: exchanges with holdings and value', 'والکس' in accs and 'نوبیتکس' in accs and 'تتر' in accs and 'حدود' in accs, accs)
    check('home accounts: gold kept at Blu shown under it', '۱ گرم' in pg.inner_text('.accs li:has-text("بلوبانک")'), pg.inner_text('.accs li:has-text("بلوبانک")'))

    # ۹) ویرایش
    pg.click('[data-tab=tx]'); wait(); pg.click('.txrow:has-text("قرض دادم به امیر")'); wait(500)
    check('edit lend: form restored', pg.get_attribute('#twhy [data-w=lend]', 'aria-pressed') == 'true' and pg.input_value('#tperson') == 'امیر' and pg.input_value('.sheet [name=amount]') == '۲۰')
    pg.click('[data-close]'); closed()
    pg.click('.txrow:has-text("انتقال تتر")'); wait(500); pg.fill('.sheet [name=amount]', '25'); pg.click('#savetx'); closed()
    check('edit move 30 → 25', held('NB', 'usdt') == 23000000 and held('WX', 'usdt') == 100000000, (held('NB', 'usdt'), held('WX', 'usdt')))
    hub('add', '[data-type=expense]'); pg.select_option('#acc', 'SM'); pg.fill('.sheet [name=amount]', '700000'); pg.click('#cats .chip >> nth=0'); pg.click('#savetx'); closed()
    tid = S()['tx'][-1]['id']
    check('plain toman expense from Saman', bal('SM') == 193000000)
    pg.click('[data-tab=tx]'); wait(); pg.click(f'[data-act=edit][data-id="{tid}"]'); wait(500)
    pg.select_option('#acc', 'WX'); wait(150); asset('usdt'); pg.fill('.sheet [name=amount]', '7'); pg.click('#savetx'); closed()
    check('edit: Saman toman → Wallex tether (bank back, ledger −7)', bal('SM') == 200000000 and held('WX', 'usdt') == 93000000 and not any(t['id'] == tid and t.get('account') == 'SM' for t in S()['tx']))

    # ۱۰) حذف
    hub('add', '[data-type=expense]'); why('lend'); pg.fill('#tperson', 'نگار'); pg.select_option('#acc', 'SM'); pg.fill('.sheet [name=amount]', '1000000'); pg.click('#savetx'); closed()
    check('lend toman from Saman: bank −1M', bal('SM') == 190000000 and any(x['person'] == 'نگار' for x in S()['debts']))
    pg.click('[data-tab=tx]'); wait(); pg.click('.txrow:has-text("نگار")'); wait(500); pg.click('#deltx'); closed()
    check('delete lend: receivable removed, money back', not any(x['person'] == 'نگار' for x in S()['debts']) and bal('SM') == 200000000)
    # دریافت تتر، خرجش، بعد حذف دریافت → منفی می‌شه → رد
    hub('add', '[data-type=income]'); why('gift'); pg.select_option('#acc', 'WG'); asset('usdt'); pg.fill('.sheet [name=amount]', '3'); pg.click('#savetx'); closed()
    hub('add', '[data-type=expense]'); pg.select_option('#acc', 'WG'); asset('usdt'); pg.fill('.sheet [name=amount]', '3'); pg.click('#cats .chip >> nth=0'); pg.click('#savetx'); closed()
    pg.click('[data-tab=tx]'); wait(); pg.click('.txrow:has-text("هدیه"):has-text("۳ تتر") >> nth=0'); wait(500)
    if pg.query_selector('#deltx'):
        pg.click('#deltx'); wait(300)
        check('delete that would make a balance negative is refused', 'منفی' in toast() and held('WG', 'usdt') == 0)
        pg.click('[data-close]'); closed()
    else: check('found the gift row to delete', False)

    # ۱۱) دارایی و تنظیمات
    pg.click('[data-tab=inv]'); wait()
    check('assets: Blu appears as a place holding gold', 'بلوبانک' in pg.inner_text('#view'))
    pg.click('[data-act=invt][data-t=ops]'); wait()
    ops_txt = pg.inner_text('#view')
    check('ops list: v12 entries labeled', 'قرض دادم به امیر' in ops_txt and 'هدیه گرفتم' in ops_txt, ops_txt[:300])
    pg.evaluate("window.App.go('set')"); wait(300)
    pg.click('[data-act=delacc][data-id="BL"]'); wait(300)
    check('settings: bank with ledger assets cannot be deleted', any(a['id'] == 'BL' for a in S()['accounts']) and 'دفتر دارایی' in toast())

    # ۱۲) لینک‌های ویجت
    pg.goto(BASE + '#out?as=usdt&ac=%D9%88%D8%A7%D9%84%DA%A9%D8%B3&a=10'); wait(700)
    check('deeplink: #out?as=usdt&ac=والکس&a=10', pg.input_value('#acc') == 'WX' and pg.get_attribute('#tasset [data-a=usdt]', 'aria-pressed') == 'true' and pg.input_value('.sheet [name=amount]') == '۱۰')
    pg.goto(BASE + '#conv'); wait(700); check('deeplink: #conv', 'تبدیل' in pg.inner_text('.sheet-head h2'))
    pg.goto(BASE + '#move'); wait(700); check('deeplink: #move', 'انتقال' in pg.inner_text('.sheet-head h2'))
    pg.click('[data-close]'); closed()

    # ۱۳) اکسل
    pg.click('[data-tab=rep]'); wait()
    with pg.expect_download(timeout=60000) as dl: pg.click('[data-act=excel]')
    dl.value.save_as('/tmp/v12.xlsx'); rows = list(openpyxl.load_workbook('/tmp/v12.xlsx')['تراکنش‌ها'].iter_rows(values_only=True))
    hdr = rows[0]
    check('excel tx sheet: بابت/دارایی/مقدار columns', 'بابت' in hdr and 'دارایی' in hdr and 'مقدار' in hdr, hdr)
    ia, iq = hdr.index('دارایی'), hdr.index('مقدار')
    check('excel: tether expense row (50 USDT, 5M toman)', any(r[ia] == 'تتر' and r[iq] == 50 for r in rows[1:]), [r for r in rows[1:4]])

    # ۱۴) ماندگاری و چیدمان
    snap = S(); pg.reload(); wait(600)
    check('persists after reload', S()['ops'] == snap['ops'] and S()['tx'] == snap['tx'] and S()['debts'] == snap['debts'])
    for w in (320, 390):
        pg.set_viewport_size({'width': w, 'height': 800})
        for k in ('expense', 'income', 'transfer', 'conv'):
            hub('add', f'[data-type={k}]')
            if k == 'expense': why('repay'); why('lend')
            o = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth'); s2 = pg.evaluate("document.querySelector('.sheet').scrollWidth - document.querySelector('.sheet').clientWidth")
            check(f'layout {w}: form {k} no horizontal scroll', o <= 0 and s2 <= 0, (o, s2))
            pg.click('[data-close]'); closed()
        for t in ('tx', 'home'):
            pg.click(f'[data-tab={t}]'); wait(150); o = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth'); check(f'layout {w}: {t}', o <= 0, o)
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.click('[data-tab=tx]'); wait(200); pg.screenshot(path='/tmp/v12_tx.png', full_page=True)
    hub('add', '[data-type=expense]'); why('lend'); pg.fill('#tperson', 'امیر'); pg.select_option('#acc', 'WX'); asset('usdt'); pg.fill('.sheet [name=amount]', '10'); wait(200); pg.screenshot(path='/tmp/v12_form_lend.png'); pg.click('[data-close]'); closed()
    hub('add', '[data-type=conv]'); pg.select_option('#acc', 'WX'); asset('usdt'); pg.fill('.sheet [name=amount]', '50'); pg.fill('.sheet [name=amount2]', '5200000'); wait(200); pg.screenshot(path='/tmp/v12_form_conv.png'); pg.click('[data-close]'); closed()
    pg.click('[data-tab=home]'); wait(200); pg.screenshot(path='/tmp/v12_home.png', full_page=True)
    check('no console errors', not errors, errors)
    b.close()
print(f'\n{len(passed)} passed, {len(failed)} failed')
sys.exit(1 if failed else 0)
