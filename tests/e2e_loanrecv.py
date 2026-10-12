"""تست end-to-end نسخه‌ی ۱۳ (به‌روز برای ۱۴): دریافت وام از فرم «افزودن وام» — مبلغ وام به موجودی حساب اضافه می‌شه، جزو آمد ماه نیست،
در تراکنش‌ها و کارت جریان نقدی دیده می‌شه، با ویرایش به‌روز و با حذف وام پاک می‌شه؛ وام‌های قبلی دست نمی‌خورن"""
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
    def closed(): pg.wait_for_function('!document.querySelector(".overlay")'); wait(150)
    def hub(act): pg.click('.tabbar .addbtn'); wait(); pg.click(f'.sheet .hubtile[data-act={act}]'); wait(500)
    bal = lambda acc: pg.evaluate(f"Core.accountBalance(window.__vault.state, window.__vault.state.accounts.find(a => a.id === '{acc}')).balance")
    cf = lambda: pg.evaluate("Core.cashFlow(window.__vault.state, Core.ym(J.today()), J.today())")

    pg.goto(BASE); pg.wait_for_load_state('networkidle'); wait()
    pg.evaluate("""(() => { const s = window.__vault.state, t = J.today();
      s.settings.unit = 'rial';
      s.accounts = [{ id: 'BL', kind: 'bank', bank: 'بلو', name: 'بلوبانک', num: '', balance: 1000000000, stamp: J.addDays(t, -2) + ' 10:00', at: 1 },
        { id: 'SM', kind: 'bank', bank: 'سامان', name: 'سامان', num: '', balance: 200000000, stamp: J.addDays(t, -2) + ' 10:00', at: 1 }];
      s.tx = []; s.debts = []; s.incomes = []; s.fixed = [];
      s.loans = [{ id: 'OLD', name: 'وام قدیمی', lender: 'بلوبانک', amount: 50000000, count: 12, first: J.addDays(t, -40), cat: 'قسط وام', paid: {} }];
      window.App.save(); window.App.go('home'); })()""")
    wait()
    cf0 = cf(); old0 = S()['loans'][0]

    # وام جدید ۲۰۰ میلیونی، ۱۲ قسط ۲۰ میلیونی، واریز به بلوبانک
    hub('newloan')
    check('receipt option visible for bank loan', pg.is_visible('#lrecv'))
    check('receipt fields hidden until checked', not pg.is_visible('[name=lrecvamt]'))
    pg.fill('#lname', 'وام جدید'); pg.fill('.sheet [name=lamount]', '20000000'); pg.fill('#lcount', '12')
    pg.check('#lrecv'); wait(150)
    check('receipt fields shown after check', pg.is_visible('[name=lrecvamt]'))
    pg.fill('.sheet [name=lrecvamt]', '200000000'); pg.select_option('#lrecvacc', 'BL')
    pg.click('#lsave'); closed()
    st = S(); L = next(l for l in st['loans'] if l['name'] == 'وام جدید')
    rt = [t for t in st['tx'] if t.get('loanRecv') == L['id']]
    check('one receipt tx created', len(rt) == 1, rt)
    check('loan stores receipt', L.get('recv', {}).get('amount') == 200000000 and L['recv']['account'] == 'BL')
    check('balance +200M', bal('BL') == 1200000000, bal('BL'))
    check('other account untouched', bal('SM') == 200000000)
    c1 = cf()
    check('not counted as month income', c1['in'] == cf0['in'], (c1['in'], cf0['in']))
    check('loanIn in cashflow', c1['loanIn'] == 200000000, c1.get('loanIn'))
    check('no debt record created', len(st['debts']) == 0)
    check('old loan untouched', next(l for l in st['loans'] if l['id'] == 'OLD') == old0)
    pg.click('[data-tab=home]'); wait()
    check('home shows loan receipt line', 'دریافت وام' in pg.inner_text('.hero'), pg.inner_text('.hero'))

    # فهرست تراکنش‌ها
    pg.click('[data-tab=tx]'); wait()
    txt = pg.inner_text('main')
    check('tx list shows receipt', 'دریافت وام' in txt and 'وام جدید' in txt)
    # زدن روی ردیف، فرم وام رو باز می‌کنه
    pg.click('.txrow:has-text("دریافت وام")'); wait(500)
    check('row opens deposit form with loan fields', pg.is_visible('#savetx') and pg.input_value('#lnname') == 'وام جدید' and pg.get_attribute('#twhy [data-w=loan]', 'aria-pressed') == 'true')
    pg.fill('.sheet [name=amount]', '180000000'); pg.select_option('#acc', 'SM'); wait(150); pg.click('#savetx'); closed()
    st = S()
    check('edit keeps single tx', len([t for t in st['tx'] if t.get('loanRecv')]) == 1)
    check('edit moves money', bal('BL') == 1000000000 and bal('SM') == 380000000, (bal('BL'), bal('SM')))

    # جزئیات وام: سود
    pg.click('[data-tab=ob]'); wait(); pg.click('.card.loan:has-text("وام جدید")'); wait(500)
    det = pg.inner_text('.sheet')
    check('detail shows interest', 'سود وام' in det and '۶۰٬۰۰۰٬۰۰۰' in det, det)
    # پرداخت قسط هنوز کار می‌کنه و مانده‌ی بدهی = جمع اقساط
    check('debt = sum of installments', '۲۴۰٬۰۰۰٬۰۰۰' in det)
    pg.click('[data-ledit]'); wait(500)
    # برداشتن تیک = حذف واریز
    pg.uncheck('#lrecv'); pg.click('#lsave'); closed()
    check('uncheck removes receipt', not any(t.get('loanRecv') for t in S()['tx']) and bal('SM') == 200000000)
    pg.keyboard.press('Escape'); wait(); pg.evaluate("window.App.closeAll()"); wait()

    # دوباره ثبت، بعد حذف وام
    pg.click('.card.loan:has-text("وام جدید")'); wait(500); pg.click('[data-ledit]'); wait(500)
    pg.check('#lrecv'); pg.fill('.sheet [name=lrecvamt]', '200000000'); pg.select_option('#lrecvacc', 'BL'); pg.click('#lsave'); closed()
    check('re-add receipt', bal('BL') == 1200000000)
    pg.evaluate("window.App.closeAll()"); wait()
    pg.click('.card.loan:has-text("وام جدید")'); wait(500); pg.click('[data-ledit]'); wait(500); pg.click('#ldel'); closed()
    st = S()
    check('delete loan removes receipt', not any(t.get('loanRecv') for t in st['tx']) and bal('BL') == 1000000000)

    # خرید قسطی: گزینه‌ی واریز نشون داده نمی‌شه
    hub('newloan'); pg.click('#ltype [data-t=bnpl]'); wait(150)
    check('bnpl hides receipt', not pg.is_visible('#lrecv'))
    pg.evaluate("window.App.closeAll()"); wait()
    # بدون حساب: خطا
    hub('newloan'); pg.fill('#lname', 'بی‌مبلغ'); pg.fill('.sheet [name=lamount]', '1000000'); pg.fill('#lcount', '3')
    pg.check('#lrecv'); pg.click('#lsave'); wait()
    check('requires received amount', pg.is_visible('#lsave') and not any(l['name'] == 'بی‌مبلغ' for l in S()['loans']))
    pg.evaluate("window.App.closeAll()"); wait()

    # بعد از بارگذاری دوباره داده‌ها می‌مونن
    hub('newloan'); pg.fill('#lname', 'ماندگار'); pg.fill('.sheet [name=lamount]', '1000000'); pg.fill('#lcount', '3')
    pg.check('#lrecv'); pg.fill('.sheet [name=lrecvamt]', '2500000'); pg.select_option('#lrecvacc', 'BL'); pg.click('#lsave'); closed()
    pg.reload(); pg.wait_for_load_state('networkidle'); wait()
    check('persists after reload', bal('BL') == 1002500000 and any(t.get('loanRecv') for t in S()['tx']))
    check('no JS errors', not errors, errors)
    b.close()
print(f'{len(passed)} passed, {len(failed)} failed')
sys.exit(1 if failed else 0)
