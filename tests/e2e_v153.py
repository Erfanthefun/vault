"""تست end-to-end نسخه‌ی ۱۵٫۳: خرید قسطی آنلاین/حضوری — تاریخ خرید از تاریخ قسط اول جداست"""
import sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8767/index.html'
passed, failed = [], []
def check(name, cond, info=''):
    (passed if cond else failed).append(name)
    if not cond: print('  FAIL:', name, info)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block', accept_downloads=True)
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    S = lambda: pg.evaluate('JSON.parse(JSON.stringify(window.__vault.state))')
    wait = lambda ms=300: pg.wait_for_timeout(ms)
    def closed(): pg.wait_for_function('!document.querySelector(".overlay")'); wait(150)
    def toast(): pg.wait_for_function("document.querySelector('#toast') && document.querySelector('#toast').innerText.trim()"); t = pg.inner_text('#toast'); pg.evaluate("document.querySelector('#toast').innerText = ''"); return t
    def hub(act): pg.click('.tabbar .addbtn'); wait(); pg.click(f'.sheet .hubtile[data-act={act}]'); wait(450)
    def setdate(name, v):  # مثل کاربر: هر سه بخش تاریخ رو انتخاب می‌کنه
        y, m, d = v.split('/')
        for part, val in (('y', str(int(y))), ('m', str(int(m))), ('d', str(int(d)))): pg.select_option(f'.overlay:last-child [data-date={name}] [data-p={part}]', val)
        wait(120)
    def getdate(name): return pg.evaluate(f"""(() => {{ const w = document.querySelector('.overlay:last-child [data-date={name}]'); const g = k => +w.querySelector('[data-p=' + k + ']').value;
        return Core.jStr(g('y'), g('m'), Math.min(g('d'), Core.monthLen(g('y'), g('m')))); }})()""")
    loan = lambda name: next(l for l in S()['loans'] if l['name'] == name)
    dues = lambda lid, n: pg.evaluate(f"[...Array({n}).keys()].map(i => Core.loanDue(window.__vault.state.loans.find(l => l.id === '{lid}'), i))")
    pressed = lambda sel: pg.get_attribute(sel, 'aria-pressed') == 'true'

    pg.goto(BASE); wait(500)
    TODAY = pg.evaluate('J.today()')
    check('fixed test date is 22 Mehr 1405', TODAY == '1405/07/22', TODAY)
    out0 = pg.evaluate("Core.cashFlow(window.__vault.state, Core.ym(J.today()), J.today()).out")

    # ۱) فرم خالی: هیچ پیش‌فرضی برای قسط اول نیست
    hub('newloan'); pg.click('#ltype [data-t=bnpl]'); wait(120)
    check('new bnpl: type chips visible, none selected', pg.is_visible('#lmode') and not pressed('#lmode [data-m=online]') and not pressed('#lmode [data-m=store]'))
    check('new bnpl: purchase date field shown, first-installment date hidden', pg.is_visible('[data-date=lbuy]') and pg.is_hidden('#firstwrap'))
    check('new bnpl: nothing counted as paid, no auto expense', pg.input_value('#lpaid') == '' and pg.is_hidden('#firsttxwrap'))
    check('new bnpl: rest-day default = 31 (last day)', pg.input_value('#lrest') == '۳۱')
    pg.fill('#lname', 'گوشی حضوری'); pg.fill('.overlay:last-child [name=lamount]', '3000000'); pg.fill('#lcount', '4')
    pg.click('#lsave'); wait(150)
    check('new bnpl without type: save refused', 'آنلاین یا حضوری' in toast() and not any(l['name'] == 'گوشی حضوری' for l in S()['loans']))

    # ۲) حضوری: خرید ۱۰ مهر → قسط اول ۳۰ مهر (آخر ماه)، اقساط بعدی آخر ماه‌های بعد
    setdate('lbuy', '1405/07/10'); pg.click('#lmode [data-m=store]'); wait(150)
    check('store: first-installment field appears with last day of purchase month', pg.is_visible('#firstwrap') and getdate('lfirst') == '1405/07/30', getdate('lfirst'))
    check('store: explanation shown', 'آخرِ همون ماه' in pg.inner_text('#lmodenote'))
    check('store: preview = 30 Mehr, 30 Aban, 30 Azar, 30 Dey', '۳۰ مهر، ۳۰ آبان، ۳۰ آذر، ۳۰ دی' in pg.inner_text('#lprev'), pg.inner_text('#lprev'))
    check('store: nothing paid by default, expense box unchecked', pg.input_value('#lpaid') == '' and pg.is_visible('#firsttxwrap') and not pg.is_checked('#firsttx'))
    check('store: expense label has no «روز خرید»', 'روز خرید' not in pg.inner_text('#firsttxlbl'))
    # تغییر تاریخ خرید به ماه بعد → قسط اول هم جابه‌جا
    setdate('lbuy', '1405/08/05'); check('store: changing purchase date re-computes first due', getdate('lfirst') == '1405/08/30', getdate('lfirst'))
    setdate('lbuy', '1405/07/10')
    # آنلاین ↔ حضوری
    pg.click('#lmode [data-m=online]'); wait(120)
    check('switch to online: first due = purchase date, 1 paid; old purchase → expense box unchecked', getdate('lfirst') == '1405/07/10' and pg.input_value('#lpaid') == '۱' and not pg.is_checked('#firsttx'), (getdate('lfirst'), pg.input_value('#lpaid')))
    setdate('lbuy', '1405/07/20'); check('online, recent purchase → expense box checked, first follows', pg.is_checked('#firsttx') and getdate('lfirst') == '1405/07/20')
    pg.click('#firsttx'); wait(80); check('expense box can be unchecked by the user (one tap)', not pg.is_checked('#firsttx'))
    pg.click('#firsttx'); wait(80); setdate('lbuy', '1405/07/10')
    pg.click('#lmode [data-m=store]'); wait(120)
    check('switch back to store: first due = end of month, paid reset to 0', getdate('lfirst') == '1405/07/30' and pg.input_value('#lpaid') == '')
    if pg.is_checked('#firsttx'): pg.click('#firsttx'); wait(80)
    pg.click('#lsave'); closed()
    L = loan('گوشی حضوری')
    check('store saved: buy, mode, first, rest day', (L.get('buy'), L.get('mode'), L['first'], L['restDay']) == ('1405/07/10', 'store', '1405/07/30', 31), L)
    check('store saved: no installment paid', L['paid'] == {})
    check('store saved: schedule', dues(L['id'], 4) == ['1405/07/30', '1405/08/30', '1405/09/30', '1405/10/30'], dues(L['id'], 4))
    check('store saved: no expense transaction on purchase day', not [t for t in S()['tx'] if (t.get('link') or {}).get('id') == L['id']])
    check('store saved: cash flow «رفت» unchanged', pg.evaluate("Core.cashFlow(window.__vault.state, Core.ym(J.today()), J.today()).out") == out0)
    mehr = pg.evaluate(f"Core.obligationsForMonth(window.__vault.state, '1405/07').filter(o => o.id === '{L['id']}').map(o => [o.key, o.due, o.paid])")
    check('store: Mehr obligation = installment 1 due 30 Mehr, unpaid', mehr == [['0', '1405/07/30', False]], mehr)
    check('store: loan card tag says حضوری, rest «آخر هر ماه»', 'خرید قسطی، حضوری' in pg.inner_text('#view') and 'اقساط آخر هر ماه' in pg.inner_text('#view'))
    pg.click('[data-tab=ob]'); wait(200)
    check('store: obligations page lists the installment', 'گوشی حضوری' in pg.inner_text('#view'))

    # ۳) آنلاین: قسط اول همون لحظه‌ی خرید، پرداخت‌شده و برداشتش ثبت
    hub('newloan'); pg.click('#ltype [data-t=bnpl]'); pg.fill('#lname', 'هدفون آنلاین'); pg.fill('.overlay:last-child [name=lamount]', '1000000'); pg.fill('#lcount', '4')
    setdate('lbuy', '1405/07/20'); pg.click('#lmode [data-m=online]'); wait(120)
    check('online: preview starts on purchase day', pg.inner_text('#lprev').startswith('تاریخ اقساط: ۲۰ مهر، ۳۰ مهر') is False and '۲۰ مهر، ۳۰ آبان' in pg.inner_text('#lprev'), pg.inner_text('#lprev'))
    pg.click('#lsave'); closed()
    L = loan('هدفون آنلاین'); tx = [t for t in S()['tx'] if (t.get('link') or {}).get('id') == L['id']]
    check('online saved: first = buy, mode online, buy stored', (L['first'], L.get('mode'), L.get('buy')) == ('1405/07/20', 'online', '1405/07/20'), L)
    check('online saved: installment 1 paid with expense on purchase day', len(tx) == 1 and tx[0]['date'] == '1405/07/20' and tx[0]['amount'] == 10000000 and L['paid']['0']['txId'] == tx[0]['id'], tx)
    check('online saved: schedule', dues(L['id'], 4) == ['1405/07/20', '1405/08/30', '1405/09/30', '1405/10/30'])

    # ۴) حضوری روز آخر ماه → همون روز؛ اسفند ۲۹ روزه
    check('store on last day of month → due same day', pg.evaluate("Core.bnplFirstDue('1405/07/30', 'store')") == '1405/07/30')
    hub('newloan'); pg.click('#ltype [data-t=bnpl]'); setdate('lbuy', '1405/12/05'); pg.click('#lmode [data-m=store]'); wait(120)
    check('store in Esfand (non-leap) → 29 Esfand', getdate('lfirst') == '1405/12/29', getdate('lfirst'))

    # ۵) تاریخ قسط اول دستی: دیگه خودکار عوض نمی‌شه
    setdate('lfirst', '1406/01/15'); setdate('lbuy', '1405/12/10'); pg.click('#lmode [data-m=online]'); wait(120)
    check('manual first date is kept when purchase date/type change', getdate('lfirst') == '1406/01/15', getdate('lfirst'))
    setdate('lfirst', '1405/12/01'); pg.fill('#lname', 'تست تاریخ'); pg.fill('.overlay:last-child [name=lamount]', '1000000'); pg.fill('#lcount', '2')
    pg.click('#lsave'); wait(150)
    check('first installment before purchase date: refused', 'قبل از تاریخ خرید' in toast() and not any(l['name'] == 'تست تاریخ' for l in S()['loans']))
    pg.click('.overlay:last-child [data-close]'); closed()

    # ۶) خرید پرداخت‌نشده‌ی حضوری که کاربر قسط اولش رو هم پرداخت‌شده زده: برداشت با تاریخ سررسید (یا امروز اگه سررسید آینده‌ست)
    hub('newloan'); pg.click('#ltype [data-t=bnpl]'); pg.fill('#lname', 'یخچال'); pg.fill('.overlay:last-child [name=lamount]', '2000000'); pg.fill('#lcount', '4')
    setdate('lbuy', '1405/07/18'); pg.click('#lmode [data-m=store]'); wait(100)
    pg.fill('#lpaid', '1'); pg.check('#firsttx'); wait(80); pg.click('#lsave'); closed()
    L = loan('یخچال'); tx = [t for t in S()['tx'] if (t.get('link') or {}).get('id') == L['id']]
    check('store paid early: expense dated today (due in future), linked', len(tx) == 1 and tx[0]['date'] == TODAY and L['paid']['0']['txId'] == tx[0]['id'], tx)

    # ۷) خرید قبلی (بدون نوع و تاریخ خرید): هیچ‌چیز عوض نمی‌شه مگه کاربر بخواد
    pg.evaluate("""(() => { const s = window.__vault.state; s.loans.push({ id: 'OLD', name: 'اسنپ‌پی قدیمی', lender: 'اسنپ‌پی', store: 'دیجی‌کالا', amount: 25000000, count: 4,
      first: '1405/06/25', restDay: 1, cat: 'قسط', paid: { 0: { date: '1405/06/25', prior: true } } }); window.App.save(); window.App.render(); })()"""); wait(200)
    before = loan('اسنپ‌پی قدیمی')
    pg.click('[data-tab=ob]'); wait(150); pg.click('[data-act=obt][data-t=loan]'); wait(200)
    pg.click('.card.loan:has-text("اسنپ‌پی قدیمی")'); wait(); pg.click('[data-ledit]'); wait()
    check('legacy edit: no type selected, explanation shown', not pressed('#lmode [data-m=online]') and not pressed('#lmode [data-m=store]') and 'ثبت نشده' in pg.inner_text('#lmodenote'))
    check('legacy edit: first date & purchase date = stored first, both visible', getdate('lfirst') == '1405/06/25' and getdate('lbuy') == '1405/06/25' and pg.is_visible('#firstwrap'))
    check('legacy edit: rest day kept (1)', pg.input_value('#lrest') == '۱')
    pg.click('#lsave'); wait(400)
    check('legacy saved without changes: record identical (no buy/mode added)', loan('اسنپ‌پی قدیمی') == before, (loan('اسنپ‌پی قدیمی'), before))
    pg.evaluate("document.querySelectorAll('.overlay').length && window.App.closeAll()"); wait(300)
    # کاربر نوع رو «حضوری» تعیین می‌کنه
    pg.click('[data-tab=ob]'); wait(150); pg.click('[data-act=obt][data-t=loan]'); wait(200)
    pg.click('.card.loan:has-text("اسنپ‌پی قدیمی")'); wait(); pg.click('[data-ledit]'); wait()
    pg.click('#lmode [data-m=store]'); wait(120)
    check('legacy → store: first due recomputed to end of Shahrivar (31)', getdate('lfirst') == '1405/06/31', getdate('lfirst'))
    pg.click('#lsave'); wait(400)
    L = loan('اسنپ‌پی قدیمی')
    check('legacy → store saved: buy/mode/first; paid installment kept', (L.get('buy'), L.get('mode'), L['first']) == ('1405/06/25', 'store', '1405/06/31') and '0' in L['paid'] and L['restDay'] == 1, L)
    pg.evaluate("window.App.closeAll()"); wait(300)

    # ۸) وام بانکی: بی‌تأثیر
    hub('newloan'); pg.fill('#lname', 'وام مسکن تست')
    check('bank loan: no purchase-type section', pg.is_hidden('#modewrap') and pg.is_visible('#firstwrap'))
    pg.fill('.overlay:last-child [name=lamount]', '5000000'); pg.fill('#lcount', '12'); setdate('lfirst', '1405/08/15'); pg.click('#lsave'); closed()
    L = loan('وام مسکن تست')
    check('bank loan saved: no buy/mode/restDay, same day every month', 'buy' not in L and 'mode' not in L and 'restDay' not in L and dues(L['id'], 3) == ['1405/08/15', '1405/09/15', '1405/10/15'])
    # تبدیل خرید قسطی به وام بانکی → فیلدهای خرید پاک می‌شن
    pg.click('[data-tab=ob]'); wait(150); pg.click('[data-act=obt][data-t=loan]'); wait(200)
    pg.click('.card.loan:has-text("هدفون آنلاین")'); wait(); pg.click('[data-ledit]'); wait(); pg.click('#ltype [data-t=bank]'); wait(100); pg.click('#lsave'); wait(400)
    L = loan('هدفون آنلاین')
    check('bnpl → bank: buy/mode/restDay removed', 'buy' not in L and 'mode' not in L and 'restDay' not in L, L)
    pg.evaluate("window.App.closeAll()"); wait(300)

    # ۹) تنظیمات و خروجی
    pg.click('[data-tab=home]'); pg.click('[data-act=goset]'); wait()
    check('settings: BNPL default shows 31 and explains online/store', pg.input_value('#bnplday') == '۳۱' and 'خرید حضوری روز آخرِ ماه خرید' in pg.inner_text('#view'))
    pg.click('[data-tab=home]'); pg.click('[data-tab=rep]'); wait()
    with pg.expect_download(timeout=60000) as dl: pg.click('[data-act=excel]')
    import openpyxl; dl.value.save_as('/tmp/claude-0/v153.xlsx'); wb = openpyxl.load_workbook('/tmp/claude-0/v153.xlsx'); ws = wb['وام‌ها']; rows = [[c.value for c in r] for r in ws.iter_rows()]
    hdr = rows[0]; byname = {r[0]: r for r in rows[1:]}
    yk = byname.get('یخچال')
    check('excel: loans sheet has purchase-date column', 'تاریخ خرید' in hdr and hdr.index('تاریخ خرید') == hdr.index('اولین قسط') - 1, hdr)
    check('excel: store purchase row = type, buy date, first due', yk and yk[1] == 'خرید قسطی حضوری (آخر ماه)' and yk[hdr.index('تاریخ خرید')] == '1405/07/18' and yk[hdr.index('اولین قسط')] == '1405/07/30', yk)
    old = byname.get('اسنپ‌پی قدیمی'); bank = byname.get('وام مسکن تست')
    check('excel: bank loan has no purchase date', bank and bank[hdr.index('تاریخ خرید')] in ('', None), bank)
    check('no page errors', not errors, errors)
    b.close()

print(f'{len(passed)} passed, {len(failed)} failed')
sys.exit(1 if failed else 0)
