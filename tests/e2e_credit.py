"""تست end-to-end نسخه‌ی ۱۱٫۲: اعتبار خرید (اسنپ‌پی) دقیقاً طبق سناریوی کاربر
۶ م خرید → مانده ۴ م، صورت‌حساب ۶ م؛ ۲ م دیگه → مانده ۲ م، صورت‌حساب ۸ م؛ تسویه از بلوبانک → اعتبار ۱۰ م، ۸ م از بلو کم؛
خرید بعد از تسویه‌ی زودهنگام → صورت‌حساب تازه؛ برگرداندن؛ مهاجرت داده‌ی قدیمی؛ عقب‌افتاده؛ بدون حساب؛ تسویه تا تاریخ."""
import re, json
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8767/index.html'
passed, failed = [], []
def check(name, cond, info=''):
    (passed if cond else failed).append(name)
    if not cond: print('  FAIL:', name, info)
fa = lambda s: re.sub('[۰-۹]', lambda m: str(ord(m.group()) - 1776), s or '').replace('٬', '').replace(',', '')
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    answers = []
    pg.on('dialog', lambda d: d.accept() if (answers.pop(0) if answers else True) else d.dismiss())
    S = lambda: pg.evaluate('JSON.parse(JSON.stringify(window.__vault.state))')
    wait = lambda ms=350: pg.wait_for_timeout(ms)
    def closed(): pg.wait_for_function('!document.querySelector(".overlay")'); wait(150)
    def hub(act, extra=''): pg.click('.tabbar .addbtn'); wait(); pg.click(f'.sheet .hubtile[data-act={act}]{extra}'); wait(500)
    blu = lambda: pg.evaluate("Core.accountBalance(window.__vault.state, window.__vault.state.accounts.find(a => a.id === 'B1')).balance")
    used = lambda: pg.evaluate("Core.creditUsed(window.__vault.state, window.__vault.state.accounts.find(a => a.id === 'C1'))")
    out_m = lambda: pg.evaluate("Core.cashFlow(window.__vault.state, Core.ym(J.today()), J.today()).out")
    def home():
        pg.click('[data-tab=home]'); wait(); pg.evaluate("document.querySelectorAll('details.fold').forEach(d => d.open = true)"); wait(150)
    def rows(): return [fa(r.inner_text()) for r in pg.query_selector_all('.ob:has-text("صورت‌حساب اسنپ‌پی")')]
    def buy(amount, date=None):
        hub('add', '[data-type=expense]'); pg.fill('.sheet [name=amount]', str(amount)); pg.click('#cats .chip >> nth=0'); pg.select_option('#acc', 'C1')
        if date: pg.evaluate("([d]) => { const [y, m, dd] = d.split('/').map(Number), w = document.querySelector('.sheet [data-date=date]'); w.querySelector('[data-p=y]').value = y; w.querySelector('[data-p=m]').value = m; w.querySelector('[data-p=d]').value = dd; }", [date])
        pg.click('#savetx'); closed()
    pg.goto(BASE); pg.wait_for_load_state('networkidle'); wait()
    pg.evaluate("""(() => { const s = window.__vault.state, t = J.today();
      s.tx = []; s.loans = []; s.fixed = []; s.incomes = [];
      s.accounts = [{ id: 'B1', kind: 'bank', bank: 'بلو', name: 'بلوبانک', num: '', balance: 1000000000, stamp: J.addDays(t, -1) + ' 10:00', at: Date.now() - 5000 },
        { id: 'B2', kind: 'bank', bank: 'سامان', name: 'سامان', num: '', balance: null, stamp: '' },
        { id: 'C1', kind: 'credit', name: 'اسنپ‌پی اعتباری', limit: 100000000, paid: {}, settles: [] }];
      window.App.save(); window.App.render(); })()"""); wait()
    out0 = out_m()

    # ۱) ۶ میلیون خرید اعتباری
    buy(6000000)
    home(); r = rows()
    check('6M buy: statement 6M in «پیش رو»', len(r) == 1 and '6000000' in r[0], r)
    check('6M buy: row shows remaining credit 4M', 'مانده‌ی اعتبار 4000000' in (r[0] if r else ''), r)
    check('6M buy: accounts card remaining 4M', '4000000' in fa(pg.inner_text('.accs li.credit')))
    check('6M buy: bank untouched', blu() == 1000000000)
    # ۲) ۲ میلیون دیگه
    buy(2000000)
    home(); r = rows()
    check('+2M: statement 8M, remaining 2M', len(r) == 1 and '8000000' in r[0] and 'مانده‌ی اعتبار 2000000' in r[0], r)
    check('purchases counted once in «رفت»', out_m() == out0 + 80000000, out_m())
    # ۳) تیک → ورقه‌ی تسویه، پیش‌فرض بلوبانک، ۸ م از بلو کم، اعتبار ۱۰ م
    pg.click('.ob:has-text("صورت‌حساب اسنپ‌پی") .tick'); wait(500)
    check('tick opens settle sheet', pg.query_selector('.sheet #dosettle') is not None)
    check('pay account asked, default بلوبانک', pg.eval_on_selector('#cacc', 'e => e.value') == 'B1')
    check('settle summary shows 8M', '8000000' in fa(pg.inner_text('#csum')), pg.inner_text('#csum'))
    pg.click('#dosettle'); closed()
    check('settle: 8M deducted from بلوبانک', blu() == 1000000000 - 80000000, blu())
    check('settle: credit back to full 10M', used() == 0 and '10000000' in fa(pg.inner_text('.accs li.credit')))
    check('settle: not counted as a second expense', out_m() == out0 + 80000000, out_m())
    home(); r = rows()
    check('settled statement moves to «انجام‌شده‌ها»', len(r) == 1 and 'پرداخت شد' in r[0] and 'بلوبانک' in r[0], r)
    st = S(); c = [a for a in st['accounts'] if a['id'] == 'C1'][0]
    check('settle record + all purchases marked', len(c['settles']) == 1 and all(t.get('cs') == c['settles'][0]['id'] for t in st['tx'] if t['type'] == 'expense'))
    check('pay account remembered', st['settings'].get('creditPayAcc') == 'B1')
    # ۴) خرید بعد از تسویه‌ی زودهنگام → صورت‌حساب تازه
    buy(500100)
    home(); r = rows()
    check('after early settle: new open statement 500,100', any('500100' in x and 'پرداخت شد' not in x for x in r), r)
    check('after early settle: remaining 9,499,900', used() == 5001000 and 'مانده‌ی اعتبار 9499900' in ''.join(r), r)
    check('after early settle: old one still settled', any('پرداخت شد' in x for x in r), r)
    # ۵) برگرداندن تسویه → پول به بلو برمی‌گرده، خریدها باز
    answers.append(True); pg.click('.ob.paid:has-text("صورت‌حساب اسنپ‌پی") .tick'); wait(400)
    check('unsettle: بلوبانک restored', blu() == 1000000000, blu())
    check('unsettle: all purchases open again (8,500,100)', used() == 85001000, used())
    check('unsettle: payment tx removed', not any(t.get('link', {}).get('kind') == 'credit' for t in S()['tx']))
    # ۶) تسویه تا تاریخ (دیروز): خرید امروز بیرون می‌مونه
    pg.evaluate("""(() => { const s = window.__vault.state; s.tx.filter(t => t.type === 'expense' && t.amount === 60000000).forEach(t => { t.date = J.addDays(J.today(), -1); });
      if (J.ym(J.addDays(J.today(), -1)) !== J.ym(J.today())) s.tx.filter(t => t.type === 'expense').forEach(t => { t.date = J.today(); }); window.App.save(); window.App.render(); })()""")
    sameMonth = pg.evaluate("J.ym(J.addDays(J.today(), -1)) === J.ym(J.today())")
    if sameMonth:
        home(); pg.click('.ob:not(.paid):has-text("صورت‌حساب اسنپ‌پی") .tick'); wait(500)
        pg.click('.sheet [data-setdate="-1"]'); wait(150)
        check('settle up to yesterday: only 6M', '6000000' in fa(pg.inner_text('#csum')) and 'صورت‌حساب بعدی' in pg.inner_text('#csum'), pg.inner_text('#csum'))
        pg.select_option('#cacc', ''); pg.click('#dosettle'); closed()
        check('settle without account: bank unchanged', blu() == 1000000000, blu())
        check('settle up to date: 2,500,100 still open', used() == 25001000, used())
    else:
        passed.extend(['settle up to yesterday (skipped: month start)'] * 3)
    # ۷) حذف تراکنش پرداخت از «تراکنش‌ها» = برگرداندن تسویه
    pay = [t for t in S()['tx'] if t.get('link', {}).get('kind') == 'credit']
    if pay:
        pg.click('[data-tab=tx]'); wait(); pg.click(f'[data-act=edit][data-id="{pay[0]["id"]}"]'); wait(500)
        answers.append(True); pg.click('#deltx'); closed()
        check('deleting payment tx reopens its purchases', used() == 85001000 and not [a for a in S()['accounts'] if a['id'] == 'C1'][0]['settles'], used())
    # ۸) عقب‌افتاده: خرید ماه قبل که تسویه نشده در «پیش رو» میاد
    pg.evaluate("""(() => { const s = window.__vault.state, p = J.addYm(J.ym(J.today()), -1) + '/15';
      s.tx.push({ id: 'old1', created: Date.now(), type: 'expense', amount: 3000000, date: p, time: '', cat: 'سایر', account: 'C1', note: '' }); window.App.save(); window.App.render(); })()""")
    home(); r = rows()
    check('overdue last-month statement listed', any('300000' in x for x in r) and len([x for x in r if 'پرداخت شد' not in x]) == 2, r)
    # ۹) ویرایش خرید تسویه‌شده و بردنش به بلو → از تسویه بیرون
    tid = pg.evaluate("""(() => { const s = window.__vault.state, a = s.accounts.find(x => x.id === 'C1'), t = s.tx.find(x => x.type === 'expense' && x.account === 'C1' && x.amount === 20000000);
      t.cs = 'sX'; a.settles.push({ id: 'sX', ym: Core.ym(t.date), date: t.date, amount: t.amount, txId: '', bank: '' }); window.App.save(); window.App.render(); return t.id; })()""")
    pg.click('[data-tab=tx]'); wait(); pg.click(f'[data-act=edit][data-id="{tid}"]'); wait(500)
    pg.select_option('#acc', 'B1'); pg.click('#savetx'); closed()
    t = [x for x in S()['tx'] if x['id'] == tid][0]
    check('settled purchase moved to bank: settle mark cleared', 'cs' not in t and t['account'] == 'B1', t)
    # ۱۰) مهاجرت داده‌ی نسخه‌های قبل (تیک ماهانه) با reload
    cur = pg.evaluate('J.ym(J.today())')
    old = S()
    old['tx'] = [
        {'id': 'm1', 'created': 1000, 'type': 'expense', 'amount': 92600000, 'date': cur + '/03', 'time': '', 'cat': 'خرید', 'account': 'C1', 'note': ''},
        {'id': 'pay', 'created': 2000, 'type': 'transfer', 'amount': 92600000, 'date': cur + '/05', 'time': '', 'cat': '', 'account': '', 'note': 'تسویه', 'link': {'kind': 'credit', 'id': 'C1', 'key': cur}, 'auto': True},
        {'id': 'm2', 'created': 3000, 'type': 'expense', 'amount': 5001000, 'date': cur + '/05', 'time': '', 'cat': 'کافه', 'account': 'C1', 'note': 'صبحانه'}]
    for a in old['accounts']:
        if a['id'] == 'C1': a['paid'] = {cur: {'date': cur + '/05', 'txId': 'pay'}}; a.pop('settles', None)
    pg.evaluate("s => localStorage.setItem('vault-v1', JSON.stringify(s))", old); pg.reload(); pg.wait_for_load_state('networkidle'); wait(500)
    st = S(); c = [a for a in st['accounts'] if a['id'] == 'C1'][0]
    check('migration: old tick → settle record', len(c['settles']) == 1 and not c['paid'], c)
    check('migration: purchase before tick closed, purchase after tick (old bug) open', [t.get('cs') for t in st['tx'] if t['id'] == 'm1'][0] and not [t.get('cs') for t in st['tx'] if t['id'] == 'm2'][0])
    check('migration: remaining credit = 10M − 500,100', used() == 5001000, used())
    home(); r = rows()
    check('migration: open 500,100 statement + settled one shown', any('500100' in x and 'پرداخت شد' not in x for x in r) and any('9260000' in x and 'پرداخت شد' in x for x in r), r)
    check('no console errors', not errors, errors)
    b.close()
print([x for x in passed if 'skipped' in x or 'not in current' in x]); print(f'\n{len(passed)} passed, {len(failed)} failed')
raise SystemExit(1 if failed else 0)
