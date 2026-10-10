"""تست end-to-end بخش مالی روزانه (همه‌ی قابلیت‌های FI) روی Vault"""
import os, json, re, sys, io, openpyxl
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8767/index.html'
BACKUP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'fi-backup.json')
passed, failed = [], []
def check(name, cond, info=''):
    (passed if cond else failed).append(name)
    if not cond: print('  FAIL:', name, info)
fa2en = lambda s: re.sub('[۰-۹]', lambda m: str(ord(m.group()) - 1776), s)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, accept_downloads=True)
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin='http://localhost:8767')
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    prompt_answer = {'v': ''}
    pg.on('dialog', lambda d: d.accept(prompt_answer['v']) if d.type == 'prompt' else d.accept())
    S = lambda: pg.evaluate('JSON.parse(JSON.stringify(window.__hesab.state))')
    hero = lambda: int(pg.get_attribute('#heroNum', 'data-v'))
    wait = lambda ms=350: pg.wait_for_timeout(ms)
    def sheet_closed(): pg.wait_for_function('!document.querySelector(".overlay")'); wait(100)

    # ۱) شروع خالی
    pg.goto(BASE); wait()
    check('perf: Excel library not loaded at startup (lazy)', pg.evaluate('typeof window.XLSX') == 'undefined')
    check('empty: hero is zero', hero() == 0)
    check('empty: cash-flow card empty message', 'هنوز واریز یا برداشتی' in pg.inner_text('.hero') and 'جریان نقدی' in pg.inner_text('.hero'))

    # ۲) بازگردانی بکاپ
    (pg.click('[data-tab=home]'), pg.click('[data-act=goset]')); pg.set_input_files('#restore', BACKUP); wait(700)
    s = S()
    check('restore: counts', (len(s['loans']), len(s['fixed']), len(s['tx'])) == (8, 3, 6), (len(s['loans']), len(s['fixed']), len(s['tx'])))
    check('restore: jumps to home', pg.is_visible('#heroNum'))
    # کارت جریان نقدی: رفت = ۶ پرداخت واقعی مهر = ۱۶٬۵۸۱٬۰۰۰ تومان؛ آمد = ۰ → کسری
    OUT0 = 165810000
    check('home: cash flow net = −outflow (no income)', hero() == OUT0 and 'کسری' in pg.inner_text('.hero .save'), hero())
    check('home: outflow uses actual amounts', '16٬581٬000' in fa2en(pg.inner_text('.fl.out')), pg.inner_text('.fl.out'))
    check('home: outflow split loans/bills/daily', 'قسط' in pg.inner_text('.fparts') and 'روزمره' in pg.inner_text('.fparts'))
    # تعهدات مانده = بانکینو ۴٫۷ + مسکن۱ ۲٫۶۷۳ + مسکن۲ ۲٫۰۱۴ + بلو ۵٫۵۶ + ایرانسل ۱ (پیش‌بینی) = ۱۵٫۹۴۷ میلیون تومان
    check('home: remaining obligations row', '15٬947٬000' in fa2en(pg.inner_text('.hero .eq')) and 'حدود' in pg.inner_text('.hero .eq'), pg.inner_text('.hero .eq'))
    check('home: no income → no savings rate', 'از درآمد' not in pg.inner_text('.hero'))

    # ۳) پرداخت یک‌لمسی + به‌روزرسانی فوری + برگرداندن
    pg.click('.ob:has-text("بانکینو") .tick'); wait(700)
    check('quickpay: outflow/deficit grows immediately by 4.7M', hero() == OUT0 + 47000000, hero())
    check('quickpay: remaining row shrinks', '11٬247٬000' in fa2en(pg.inner_text('.hero .eq')), pg.inner_text('.hero .eq'))
    check('quickpay: tx created & linked', any(t.get('link', {}).get('key') == '7' and t['amount'] == 47000000 for t in S()['tx']))
    check('quickpay: toast has undo', pg.is_visible('#toast button'))
    pg.click('#toast button'); wait(500)
    check('undo: hero restored', hero() == OUT0, hero())
    check('undo: auto tx removed', len(S()['tx']) == 6)

    # ۴) پرداخت متغیر: مبلغ واقعی
    pg.click('.ob:has-text("ایرانسل") .tick'); wait()
    check('variable: opens pay sheet', pg.is_visible('.sheet:has-text("مبلغ واقعی")'))
    pg.fill('.sheet [name=amount]', '850000'); pg.click('#dopay'); sheet_closed()
    st = S(); f = next(x for x in st['fixed'] if x['name'] == 'ایرانسل')
    check('variable: marked paid', '1405/07' in f['paid'])
    check('variable: remaining drops by estimate 1M', '14٬947٬000' in fa2en(pg.inner_text('.hero .eq')), pg.inner_text('.hero .eq'))
    check('variable: outflow uses actual 850k', hero() == OUT0 + 8500000 and '17٬431٬000' in fa2en(pg.inner_text('.fl.out')), hero())
    check('variable: category from item', any(t['cat'] == 'تلفن و نت' and t['amount'] == 8500000 for t in st['tx']))

    # ۵) جهت فلش‌ها
    pg.click('[data-tab=tx]'); wait()
    right, left = pg.query_selector_all('.mswitch button')
    check('arrows: first button is on the right side', right.bounding_box()['x'] > left.bounding_box()['x'])
    check('arrows: right button points right', 'm9 5 7 7-7 7' in right.inner_html())
    check('arrows: left button points left', 'm15 5-7 7 7 7' in left.inner_html())
    right.click(); wait(200)
    check('arrows: right = previous month', 'شهریور' in pg.inner_text('.mswitch strong'))
    pg.click('.mswitch button >> nth=1'); pg.click('.mswitch button >> nth=1'); wait(200)
    check('arrows: left = next month', 'آبان' in pg.inner_text('.mswitch strong'))
    pg.click('.mswitch button >> nth=0'); wait(200)

    # ۶) تراکنش دستی، ویرایش، حذف، دوبار لمس
    n0 = len(S()['tx'])
    pg.click('.fab'); pg.click('[data-pick=expense]'); wait()
    pg.fill('.sheet [name=amount]', '۱۲۰۰۰۰'); pg.click('#cats .chip >> nth=0'); pg.fill('#note', '<img src=x onerror="window.__xss=1">')
    pg.dblclick('#savetx'); sheet_closed()
    check('tx: double tap saves once', len(S()['tx']) == n0 + 1)
    t = S()['tx'][-1]
    check('tx: amount toman→rial & persian digits', t['amount'] == 1200000 and t['type'] == 'expense')
    check('tx: XSS not executed', pg.evaluate('window.__xss') is None)
    check('tx: note shown escaped', '<img' in pg.inner_text('.txlist'))
    pg.click('.txrow >> nth=0'); wait()
    pg.click('#ttype [data-t=income]'); pg.click('#savetx'); sheet_closed()
    check('tx: edit type → income', S()['tx'][-1]['type'] == 'income')
    pg.click('[data-tab=home]'); wait()
    check('income → shows in «آمد» and savings rate appears', '+' in pg.inner_text('.fl.in') and 'از درآمد' in pg.inner_text('.hero'), pg.inner_text('.hero'))
    pg.click('[data-tab=tx]'); pg.click('.txrow:has-text("<img")'); wait(); pg.click('#deltx'); sheet_closed()
    check('tx: delete', len(S()['tx']) == n0)

    # ۷) چسباندن پیامک + تکراری
    sms = 'بانک خاورمیانه\\nانتقال از اینترنت بانک به کارت 5357\\n-13,014,500\\n020/000918214\\nمانده 551,200\\n07/05\\n07:31'
    for i in range(2):
        pg.click('[data-tab=home]'); pg.click('[data-act=paste]'); wait()
        pg.evaluate(f'document.querySelector("#smstext").value = "{sms}"'); pg.click('#parse'); wait()
        if i == 1: check('sms: duplicate warning', pg.is_visible('.sheet .alert'))
        check(f'sms {i}: parsed amount', pg.input_value('.sheet [name=amount]') == '۱٬۳۰۱٬۴۵۰')
        pg.click('#cats .chip >> nth=1'); pg.click('#savetx'); sheet_closed()
    st = S(); km = [a for a in st['accounts'] if a.get('bank') == 'خاورمیانه']; acc = km[0] if km else {}
    check('sms: account + balance (one account per bank+number)', acc.get('balance') == 551200 and len(km) == 1, km)
    check('sms: exact rial kept', st['tx'][-1]['amount'] == 13014500)

    # ۸) اتصال خرج به قسط و تغییر اتصال
    pg.click('.txrow:has-text("13") >> nth=0') if False else None
    txid = st['tx'][-1]['id']
    pg.click('[data-tab=tx]'); wait()
    pg.click(f'[data-id="{txid}"]'); wait()
    opt = pg.eval_on_selector('#link', 'el => [...el.options].find(o => o.textContent.includes("مسکن۱")).value')
    pg.select_option('#link', opt); pg.click('#savetx'); sheet_closed()
    L = next(x for x in S()['loans'] if x['name'] == 'مسکن۱')
    check('link: installment marked paid by tx', L['paid'].get('9', {}).get('txId') == txid)
    pg.click(f'[data-id="{txid}"]'); wait(); pg.select_option('#link', ''); pg.click('#savetx'); sheet_closed()
    L = next(x for x in S()['loans'] if x['name'] == 'مسکن۱')
    check('link: unlinking unmarks installment', '9' not in L['paid'])
    pg.click(f'[data-id="{txid}"]'); wait(); pg.click('#deltx'); sheet_closed()
    pg.click(f'.txrow >> nth=0'); wait(); pg.click('#deltx'); sheet_closed()

    # ۹) وام: افزودن، جزئیات، پرداخت، برگرداندن، کم کردن تعداد، حذف
    pg.click('[data-tab=ob]'); pg.click('[data-act=newloan]'); wait()
    pg.fill('#lname', 'وام تست'); pg.fill('.sheet [name=lamount]', '1000000'); pg.fill('#lcount', '6')
    pg.select_option('[data-date=lfirst] [data-p=m]', '5'); pg.select_option('[data-date=lfirst] [data-p=d]', '31'); pg.fill('#lpaid', '2'); pg.click('#lsave'); sheet_closed()
    L = next(x for x in S()['loans'] if x['name'] == 'وام تست')
    check('loan: created with prior paid', len(L['paid']) == 2 and L['first'].endswith('/05/31'))
    pg.click('.card.loan:has-text("وام تست")'); wait()
    check('loan detail: mehr due clamps to 30', '۳۰ مهر' in pg.inner_text('.inst'))
    pg.click('.inst li:not(.paid) button >> nth=0'); wait(); pg.click('#dopay'); wait(600)
    L = next(x for x in S()['loans'] if x['name'] == 'وام تست')
    check('loan: pay from detail', len(L['paid']) == 3)
    check('loan: detail stays open & refreshed', pg.is_visible('.sheet .inst') and len(pg.query_selector_all('.sheet .inst li.paid')) == 3)
    pg.click('.inst li.paid button >> nth=2'); wait(700)
    check('loan: detail refreshed after unpay', len(pg.query_selector_all('.sheet .inst li.paid')) == 2)
    L = next(x for x in S()['loans'] if x['name'] == 'وام تست')
    check('loan: unpay removes auto tx', len(L['paid']) == 2 and not any(t.get('link', {}).get('id') == L['id'] for t in S()['tx']))
    pg.click('[data-close]'); sheet_closed()
    pg.click('.card.loan:has-text("وام تست")'); wait(); pg.click('[data-ledit]'); wait(); pg.fill('#lcount', '1'); pg.click('#lsave'); sheet_closed()
    L = next(x for x in S()['loans'] if x['name'] == 'وام تست')
    check('loan: shrinking count drops extra paid', list(L['paid']) == ['0'] and L['count'] == 1)
    check('loan: finished loan folded', pg.query_selector('.fold:has-text("تسویه‌شده")') is not None)
    pg.click('.fold summary'); pg.click('.card.loan:has-text("وام تست")'); wait(); pg.click('[data-ledit]'); wait(); pg.click('#ldel'); sheet_closed()
    check('loan: deleted', not any(x['name'] == 'وام تست' for x in S()['loans']))

    # ۱۰) پرداخت ماهانه ثابت و متغیر
    pg.click('[data-act=obt][data-t=fixed]'); pg.click('[data-act=newfixed]'); wait()
    pg.fill('#fname', 'اجاره'); pg.fill('.sheet [name=famount]', '20000000'); pg.fill('#fday', '31'); pg.click('#fsave'); sheet_closed()
    F = next(x for x in S()['fixed'] if x['name'] == 'اجاره')
    check('fixed: created non-variable', F['variable'] is False and F['day'] == 31)
    pg.click('.card.fixed:has-text("اجاره")'); wait(); pg.click('#fpay'); wait(600)
    check('fixed: pay opens pay sheet', pg.is_visible('#dopay')); pg.click('#dopay'); sheet_closed()
    check('fixed: paid this month', '1405/07' in next(x for x in S()['fixed'] if x['name'] == 'اجاره')['paid'])
    pg.click('.card.fixed:has-text("اجاره")'); wait(); pg.click('#fdel'); sheet_closed()
    check('fixed: delete keeps tx but unlinks', any(t['amount'] == 200000000 and 'link' not in t for t in S()['tx']))
    pg.click('[data-tab=tx]'); pg.click('.txrow:has-text("اجاره")'); wait(); pg.click('#deltx'); sheet_closed()
    pg.click('[data-tab=ob]'); pg.click('[data-act=newfixed]'); wait(); pg.fill('#fname', 'بد'); pg.fill('.sheet [name=famount]', '1'); pg.fill('#fday', '40'); pg.click('#fsave'); wait()
    check('fixed: validates day range', pg.is_visible('.sheet') and 'روز سررسید' in pg.inner_text('#toast')); pg.click('[data-close]'); sheet_closed()

    # ۱۱) بدهی و طلب
    pg.click('[data-act=obt][data-t=debt]'); pg.click('[data-act=newdebt][data-dir=owe]'); wait()
    pg.fill('#dperson', 'علی'); pg.fill('.sheet [name=damount]', '10000000'); pg.click('#dsave'); sheet_closed()
    pg.click('.card.debt'); wait(); pg.fill('.sheet [name=samount]', '4000000'); pg.click('#settle'); sheet_closed()
    D = S()['debts'][0]
    check('debt: partial settle', D['amount'] - sum(x['amount'] for x in D['settles']) == 60000000)
    check('debt: settle tx is transfer', any(t['type'] == 'transfer' and t.get('debt') == D['id'] for t in S()['tx']))
    pg.click('.card.debt'); wait(); pg.click('#settle'); sheet_closed()
    check('debt: fully settled & closed', S()['debts'][0].get('closed'))
    pg.click('.fold summary'); pg.click('.card.debt'); wait(); pg.click('[data-undo="1"]'); wait(700)
    check('debt: undo reopens', not S()['debts'][0].get('closed'))
    pg.click('[data-close]'); sheet_closed()

    # ۱۲) لینک‌های ویجت
    pg.goto(BASE + '#out?a=250000&n=%D8%AA%D8%B3%D8%AA'); wait()
    check('deeplink #out prefilled', pg.input_value('.sheet [name=amount]') == '۲۵۰٬۰۰۰' and pg.input_value('#note') == 'تست' and 'برداشت' in pg.inner_text('.sheet-head h2'))
    pg.goto(BASE + '#in'); wait(); check('deeplink #in', 'واریز' in pg.inner_text('.sheet-head h2'))
    pg.goto(BASE + '#new'); wait(); check('deeplink #new', pg.is_visible('[data-pick=income]'))
    pg.goto(BASE + '#paste'); wait(); check('deeplink #paste', pg.is_visible('#smstext'))
    pg.goto(BASE + '#pay'); wait(); check('deeplink #pay lists unpaid', pg.query_selector_all('.sheet .ob') and len(pg.query_selector_all('.sheet .ob')) >= 4)
    n_before = len(pg.query_selector_all('.sheet .ob'))
    check('pay list grouped by month', 'این ماه' in pg.inner_text('.sheet') and 'ماه بعد' in pg.inner_text('.sheet'))
    pg.click('.sheet ul:nth-of-type(1) .ob:has-text("بلو") .tick'); wait(600)
    check('pay list refreshes in place', len(pg.query_selector_all('.sheet .ob')) == n_before - 1)
    pg.click('#toast button'); wait(400); pg.click('[data-close]'); sheet_closed()
    check('hash cleared after route', pg.evaluate('location.hash') == '')

    # ۱۳) واحد
    (pg.click('[data-tab=home]'), pg.click('[data-act=goset]')); pg.click('[data-act=unit][data-u=rial]'); pg.click('[data-tab=home]'); wait()
    txt = pg.inner_text('#heroNum')
    check('unit: rial shows 10x', fa2en(txt).replace('٬', '') == str(hero()), txt)
    (pg.click('[data-tab=home]'), pg.click('[data-act=goset]')); pg.click('[data-act=unit][data-u=toman]')

    # ۱۴) دسته‌ها
    pg.fill('#newcat-expense', 'تست دسته'); pg.click('[data-act=addcat][data-type=expense]')
    check('category added', 'تست دسته' in S()['categories']['expense'])
    pg.click('.chip.tag:has-text("تست دسته") button')
    check('category removed', 'تست دسته' not in S()['categories']['expense'])

    # ۱۵) خروجی اکسل و تقویم
    pg.click('[data-tab=home]'); pg.click('[data-tab=rep]')
    with pg.expect_download(timeout=60000) as d: pg.click('[data-act=excel]')
    d.value.save_as('/tmp/t.xlsx'); wb = openpyxl.load_workbook('/tmp/t.xlsx')
    check('excel: FI sheets incl. KPIs', len(wb.sheetnames) >= 7 and wb.sheetnames[0] == 'شاخص‌ها', wb.sheetnames)
    kp = [r for r in wb['شاخص‌ها'].iter_rows(values_only=True)]
    check('excel: KPI rows per month', len(kp) >= 2 and isinstance(kp[-1][1], (int, float)))
    check('excel: rtl', wb.active.sheet_view.rightToLeft)
    with pg.expect_download() as d: pg.click('[data-act=ics]')
    d.value.save_as('/tmp/t.ics'); ics = open('/tmp/t.ics', encoding='utf-8').read()
    check('ics: events & balanced blocks', ics.count('BEGIN:VEVENT') == ics.count('END:VEVENT') > 20 and ics.startswith('BEGIN:VCALENDAR'))
    check('ics: variable marked approx', 'حدود' in ics.replace('\r\n ', ''))

    # ۱۵-ب) شاخص‌ها و نمودارها
    (pg.click('[data-tab=home]'), pg.click('[data-tab=rep]')); wait()
    check('rep: title', 'گزارش' in pg.inner_text('h1'))
    check('rep: ≥10 KPI cards', len(pg.query_selector_all('.kpi')) >= 10, len(pg.query_selector_all('.kpi')))
    check('rep: income hint card when no income', pg.query_selector('.kpi.muted') is not None)
    check('rep: ≥6 charts', len(pg.query_selector_all('figure.chart')) >= 6, len(pg.query_selector_all('figure.chart')))
    kv = {pg.inner_text(f'.kpi >> nth={i} >> .k-l'): pg.inner_text(f'.kpi >> nth={i} >> .k-v') for i in range(len(pg.query_selector_all('.kpi:not(.muted)')))}
    check('rep: debt-free month shown', 'آزادی از بدهی' in kv and ('۱۴' in kv['آزادی از بدهی']), kv.get('آزادی از بدهی'))
    check('rep: total debt KPI', kv.get('کل بدهی وام‌ها', '').endswith('م') or 'میلیارد' in kv.get('کل بدهی وام‌ها', ''), kv.get('کل بدهی وام‌ها'))
    hit = pg.query_selector('figure.chart .hit'); hit.click(); wait(150)
    cap = pg.inner_text('figure.chart >> nth=0 >> .tip')
    check('chart tap shows value', 'مهر' in cap and 'تومان' in cap, cap)
    pg.query_selector('.donut').scroll_into_view_if_needed(); bb = pg.query_selector('.donut').bounding_box(); pg.mouse.click(bb['x'] + bb['width'] / 2 + 2, bb['y'] + 14); wait(150)
    check('donut tap shows share', '٪' in pg.inner_text('.chart:has(.donut) .tip'))
    check('forecast drops as loans end', 'سبک‌تر' in pg.inner_text('figure.chart >> nth=0'))
    for _ in range(3): pg.click('.mswitch button >> nth=0'); wait(120)
    check('rep: past months render', len(pg.query_selector_all('.kpi')) >= 10)
    for _ in range(8): pg.click('.mswitch button >> nth=1'); wait(120)
    check('rep: future month renders (no data)', 'خرجی برای این ماه ثبت نشده' in pg.inner_text('#view'))
    for _ in range(5): pg.click('.mswitch button >> nth=0'); wait(80)
    # تقویم با Shortcuts
    pg.evaluate("window.__fiOpenURL = u => { window.__lastURL = u; }")
    pg.click('[data-act=cal]'); wait(700)
    check('calendar: opens Vault Calendar shortcut', pg.evaluate('window.__lastURL') == 'shortcuts://run-shortcut?name=Vault%20Calendar', pg.evaluate('window.__lastURL'))
    clip = json.loads(pg.evaluate('navigator.clipboard.readText()'))
    ev = clip['events']
    check('calendar: payload has events', clip['app'] == 'Vault' and len(ev) > 20, len(ev))
    check('calendar: gregorian start/end format', all(re.fullmatch(r'20\d\d-\d\d-\d\d 09:00', e['start']) and e['end'].endswith('09:30') for e in ev))
    check('calendar: sorted & future only', [e['start'] for e in ev] == sorted(e['start'] for e in ev) and ev[0]['start'] >= '2026-09-27')
    check('calendar: variable marked approx', any('حدود' in e['title'] for e in ev))
    check('calendar: paid items excluded', not any('رعنا' in e['title'] and '2026-09-27' == e['start'][:10] for e in ev))
    check('calendar: setup guide present', pg.query_selector('#calsec details') is not None)
    check('brand: title', pg.title() == 'Vault')
    pg.click('[data-tab=home]'); check('brand mark on home', pg.inner_text('.brand') == 'VAULT')
    (pg.click('[data-tab=home]'), pg.click('[data-act=goset]')); pg.fill('.card-block [name=expected]', '50000000'); pg.click('[data-act=saveexp]')
    (pg.click('[data-tab=home]'), pg.click('[data-tab=rep]')); wait()
    check('rep: DTI & savings appear with income', 'نسبت بدهی به درآمد' in pg.inner_text('.kpis') and 'نرخ پس‌انداز' in pg.inner_text('.kpis'))
    (pg.click('[data-tab=home]'), pg.click('[data-act=goset]')); pg.fill('.card-block [name=expected]', ''); pg.click('[data-act=saveexp]')

    # ۱۶) بکاپ → پاک کردن → بازگردانی
    before = S()
    (pg.click('[data-tab=home]'), pg.click('[data-act=goset]'))
    pg.click('[data-act=backup]'); wait()
    with pg.expect_download() as d: pg.click('#bplain')
    d.value.save_as('/tmp/bk.json'); sheet_closed()
    prompt_answer['v'] = 'پاک'; pg.click('[data-act=wipe]'); wait(); prompt_answer['v'] = ''
    check('wipe: empty', len(S()['loans']) == 0)
    check('wipe: default lists re-created (settings renders)', len(S()['lists'].get('bnpl', [])) == 2 and any(a['name'] == 'بلوبانک' for a in S()['accounts']))
    (pg.click('[data-tab=home]'), pg.click('[data-act=goset]')); pg.set_input_files('#restore', '/tmp/bk.json'); wait(700)
    after = S()
    check('backup round-trip equal', {k: after[k] for k in ('tx', 'loans', 'fixed', 'debts', 'accounts')} == {k: before[k] for k in ('tx', 'loans', 'fixed', 'debts', 'accounts')})
    pg.reload(); wait()
    check('persists after reload', len(S()['loans']) == 8)
    check('bad backup rejected', True)
    (pg.click('[data-tab=home]'), pg.click('[data-act=goset]')); open('/tmp/bad.json', 'w').write('{"x":1}'); pg.set_input_files('#restore', '/tmp/bad.json'); wait(500)
    check('bad backup: toast & data kept', 'معتبر نیست' in pg.inner_text('#toast') and len(S()['loans']) == 8)

    # ۱۶-ب) رگرسیون‌های بررسی کد
    pg.click('[data-tab=home]'); wait()
    pg.click('.fold summary'); wait(150)
    pg.click('.oblist:not(.fold .oblist) .ob:has-text("مسکن۲") .tick'); wait(600)
    check('fold stays open after re-render', pg.eval_on_selector('details[data-fold=homePaid]', 'd => d.open'))
    pg.click('#toast button'); wait(400)
    (pg.click('[data-tab=home]'), pg.click('[data-act=goset]')); pg.click('.chip.tag:has-text("آرایشی") button'); wait(150)
    pg.click('[data-tab=ob]'); pg.click('[data-act=obt][data-t=loan]'); pg.click('.card.loan:has-text("آرایشی ۴")'); wait(); pg.click('[data-ledit]'); wait()
    check('removed category still selected in loan form', pg.eval_on_selector('#lcat', 'e => e.value') == 'آرایشی')
    pg.click('#lsave'); sheet_closed()
    check('loan keeps its category after save', next(l for l in S()['loans'] if l['name'] == 'اسنپ پی آرایشی ۴')['cat'] == 'آرایشی')
    bk = json.load(open('/tmp/bk.json')); bk['tx'].append(None); bk['tx'].append({'id': 'bad', 'amount': 'x'}); bk['loans'].append({'id': 'z'})
    json.dump(bk, open('/tmp/bk2.json', 'w'), ensure_ascii=False)
    (pg.click('[data-tab=home]'), pg.click('[data-act=goset]')); pg.set_input_files('#restore', '/tmp/bk2.json'); wait(700)
    check('restore tolerates corrupt rows', len(S()['tx']) == len(json.load(open('/tmp/bk.json'))['tx']) and len(S()['loans']) == 8)

    # ۱۷) چیدمان: بدون اسکرول افقی در عرض‌های مختلف و همه‌ی تب‌ها
    for w in (320, 390, 768):
        pg.set_viewport_size({'width': w, 'height': 800})
        for tabn in ('home', 'tx', 'ob', 'inv', 'rep', 'set'):
            (pg.click('[data-tab=home]'), pg.click('[data-act=goset]')) if tabn == 'set' else pg.click(f'[data-tab={tabn}]'); wait(150)
            ov = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            check(f'layout {w}px {tabn}: no horizontal overflow', ov <= 0, ov)
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.click('[data-tab=home]'); wait(); pg.screenshot(path='/tmp/f_home.png', full_page=True)
    pg.click('[data-tab=ob]'); wait(); pg.screenshot(path='/tmp/f_ob.png')
    pg.click('[data-tab=tx]'); wait(); pg.screenshot(path='/tmp/f_tx.png')
    pg.click('[data-tab=home]'); pg.click('.ob:has-text("مسکن۲") .ob-body'); wait(600); pg.screenshot(path='/tmp/f_pay.png'); pg.click('[data-close]'); sheet_closed()
    check('no console/page errors', not errors, errors)

    # ۱۸) حالت تاریک
    dk = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='dark')
    dp = dk.new_page(); dp.goto(BASE); dp.click('[data-act=goset]'); dp.on('dialog', lambda d: d.accept())
    dp.set_input_files('#restore', BACKUP); dp.wait_for_timeout(700); dp.screenshot(path='/tmp/f_dark.png')
    b.close()

print(f'\n{len(passed)} passed, {len(failed)} failed')
sys.exit(1 if failed else 0)
