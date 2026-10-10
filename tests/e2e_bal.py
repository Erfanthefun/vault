"""تست end-to-end موجودی زنده‌ی حساب‌ها: لنگر (پیامک/دستی) ± تراکنش‌های بعدش، انتقال از/به، تسویه‌ی بدهی"""
import sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8767/index.html'
passed, failed = [], []
def check(name, cond, info=''):
    (passed if cond else failed).append(name)
    if not cond: print('  FAIL:', name, info)
FA = str.maketrans('۰۱۲۳۴۵۶۷۸۹', '0123456789')
fa = lambda s: s.translate(FA)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    S = lambda: pg.evaluate('JSON.parse(JSON.stringify(window.__vault.state))')
    wait = lambda ms=350: pg.wait_for_timeout(ms)
    def closed(): pg.wait_for_function('!document.querySelector(".overlay")'); wait(150)
    def hub(act, extra=''): pg.click('.tabbar .addbtn'); wait(); pg.click(f'.sheet .hubtile[data-act={act}]{extra}'); wait(500)
    acc = lambda name: next(a for a in S()['accounts'] if a['name'] == name)
    bal = lambda name: pg.evaluate('n => App.curBal(window.__vault.state.accounts.find(a => a.name === n))', name)

    pg.goto(BASE); wait(500)
    blu, sam = acc('بلوبانک')['id'], acc('سامان')['id']

    # ۱) موجودی دستی → لنگر با زمان
    pg.click('[data-act=goset]'); wait()
    pg.fill(f'[data-accbal="{blu}"]', '50000000'); pg.fill(f'[data-accbal="{sam}"]', '10000000')
    pg.click('[data-act=saveacc] >> nth=0'); wait(300)
    a = acc('بلوبانک')
    check('manual: anchor stored with stamp & time', a['balance'] == 500000000 and a['stamp'].startswith(pg.evaluate('J.today()')) and a['at'] > 0, a)
    pg.click('[data-act=saveacc] >> nth=0'); wait(200)
    check('manual: saving unchanged value keeps the anchor', acc('بلوبانک')['at'] == a['at'])

    # ۲) خرج ۷ میلیونی از بلوبانک → کم می‌شه (مورد گزارش کاربر)
    hub('add', '[data-type=expense]'); pg.fill('.sheet [name=amount]', '7000000'); pg.select_option('#acc', blu)
    pg.click('#cats .chip >> nth=0'); pg.click('#savetx'); closed()
    check('expense reduces bank balance', bal('بلوبانک') == 430000000, bal('بلوبانک'))
    pg.click('[data-tab=home]'); wait()
    card = pg.inner_text('.accs')
    check('home: accounts card shows live balance + breakdown', '۴۳٬۰۰۰٬۰۰۰' in card and '۱ تراکنش بعدش' in card, card)
    check('home: bank total = live balances', pg.evaluate('App.bankTotal()') == 430000000 + 100000000)

    # ۳) واریز → اضافه
    hub('add', '[data-type=income]'); pg.fill('.sheet [name=amount]', '2000000'); pg.select_option('#acc', blu)
    pg.click('#cats .chip >> nth=0'); pg.click('#savetx'); closed()
    check('income increases bank balance', bal('بلوبانک') == 450000000)

    # ۴) خرید با اعتبار آخر ماه روی بانک اثری نداره
    cid = next(a['id'] for a in S()['accounts'] if a['kind'] == 'credit')
    hub('add', '[data-type=expense]'); pg.fill('.sheet [name=amount]', '1000000'); pg.select_option('#acc', cid)
    pg.click('#cats .chip >> nth=0'); pg.click('#savetx'); closed()
    check('credit purchase does not touch bank', bal('بلوبانک') == 450000000)

    # ۵) انتقال از بلو به سامان
    hub('add', '[data-type=expense]'); pg.click('#ttype [data-t=transfer]'); wait(150)
    check('transfer: from/to selects visible', pg.is_visible('#acc2') and pg.inner_text('#acclbl') == 'از حساب')
    pg.fill('.sheet [name=amount]', '5000000'); pg.select_option('#acc', blu); pg.select_option('#acc2', blu); pg.click('#savetx'); wait(300)
    check('transfer: same from/to rejected', pg.query_selector('.overlay') is not None and 'یکی' in pg.inner_text('#toast'))
    pg.select_option('#acc2', sam); pg.click('#savetx'); closed()
    t = [x for x in S()['tx'] if x['type'] == 'transfer'][-1]
    check('transfer stored with from/to', t['account'] == blu and t['to'] == sam, t)
    check('transfer: from −, to +', bal('بلوبانک') == 400000000 and bal('سامان') == 150000000, (bal('بلوبانک'), bal('سامان')))
    pg.click('[data-tab=tx]'); wait()
    check('tx list shows «از … به …»', 'از بلوبانک به سامان' in pg.inner_text('#view'))
    pg.fill('#txq', 'سامان'); wait(300)
    check('search finds transfer by destination', 'از بلوبانک به سامان' in pg.inner_text('#txlist'))
    pg.fill('#txq', ''); wait(200)

    # ۶) انتقال به بیرون (مثلاً خرید طلا) فقط از مبدأ کم می‌شه
    hub('add', '[data-type=expense]'); pg.click('#ttype [data-t=transfer]'); wait(150)
    pg.fill('.sheet [name=amount]', '3000000'); pg.select_option('#acc', sam); pg.click('#savetx'); closed()
    check('transfer to outside: only source decreases', bal('سامان') == 120000000 and bal('بلوبانک') == 400000000)

    # ۷) ویرایش و حذف تراکنش موجودی رو درست برمی‌گردونه
    tx7 = next(x for x in S()['tx'] if x['amount'] == 70000000)
    pg.evaluate("id => App.openTxForm ? App.openTxForm({id}) : null", tx7['id'])
    if not pg.query_selector('.overlay'):
        pg.click('[data-tab=tx]'); wait(); pg.click(f'[data-act=edit][data-id="{tx7["id"]}"]')
    wait(500); pg.fill('.sheet [name=amount]', '8000000'); pg.click('#savetx'); closed()
    check('edit amount updates balance', bal('بلوبانک') == 390000000, bal('بلوبانک'))
    pg.click('[data-tab=tx]'); wait(); pg.click(f'[data-act=edit][data-id="{tx7["id"]}"]'); wait(500); pg.click('#deltx'); closed()
    check('delete restores balance', bal('بلوبانک') == 470000000, bal('بلوبانک'))

    # ۸) پیامک با موجودی = لنگر تازه؛ خودش دوبار کم نمی‌شه؛ تراکنش‌های قبلی هم نه
    pg.click('[data-tab=home]'); pg.click('[data-act=paste]'); wait()
    d = pg.evaluate('J.today()').replace('/', '.')
    pg.evaluate('t => { document.querySelector("#smstext").value = t }', f'بلو\nبرداشت پول\nعزیز، 1,000,000 ریال از حساب شما پرید.\nموجودی: 466,000,000 ریال\n۲۳:۵۸\n{d}')
    pg.click('#parse'); wait(500); pg.click('#cats .chip >> nth=0'); pg.click('#savetx'); closed()
    check('sms: new anchor = sms balance, sms tx not subtracted again', bal('بلوبانک') == 466000000 and acc('بلوبانک')['balance'] == 466000000, bal('بلوبانک'))
    # پیامک واریز که «انتقال» ثبت بشه (مثلاً پول فروش طلا) → لنگر همون حساب
    pg.click('[data-tab=home]'); pg.click('[data-act=paste]'); wait()
    pg.evaluate('t => { document.querySelector("#smstext").value = t }', f'بلو\nواریز پول\nعزیز، 4,000,000 ریال به حساب شما نشست.\nموجودی: 470,000,000 ریال\n۲۳:۵۹\n{d}')
    pg.click('#parse'); wait(500); pg.click('#ttype [data-t=transfer]'); wait(150)
    check('sms income → transfer: account moves to «to»', pg.eval_on_selector('#acc2', 'e => e.value') == blu and pg.eval_on_selector('#acc', 'e => e.value') == '')
    pg.click('#savetx'); closed()
    check('incoming transfer from sms: anchor updated, no double count', bal('بلوبانک') == 470000000, bal('بلوبانک'))

    # ۹) تسویه‌ی طلب تومانی «به حساب» → واریز؛ بدهی «از حساب» → برداشت
    def debt(direction, person, amt):
        pg.click('[data-tab=ob]'); wait(100); pg.click('[data-act=obt][data-t=debt]'); wait(200)
        pg.click(f'[data-act=newdebt][data-dir={direction}] >> nth=-1'); wait(400)
        pg.fill('#dperson', person); pg.fill('.sheet [name=damount]', amt); pg.click('#dsave'); closed()
        pg.click(f'.card.debt:has-text("{person}")'); wait(400); pg.select_option('#sacc', sam); pg.click('#settle'); closed()
    s0 = bal('سامان')
    debt('owed', 'مریم', '1000000'); check('receivable settled into account → +', bal('سامان') == s0 + 10000000, bal('سامان'))
    debt('owe', 'نیما', '400000'); check('debt paid from account → −', bal('سامان') == s0 + 10000000 - 4000000, bal('سامان'))
    pg.click('[data-tab=tx]'); wait()
    check('tx list: debt settle directions', 'به سامان' in pg.inner_text('#view') and 'از سامان' in pg.inner_text('#view'))

    # ۱۰) داده‌ی قدیمی: لنگر بدون زمان + انتقال بدون to
    pg.evaluate("""(() => { const s = window.__vault.state, a = s.accounts.find(x => x.name === 'کارآفرین');
      a.balance = 1000000; a.stamp = ''; delete a.at;
      s.debts.push({ id: 'od', dir: 'owed', person: 'قدیمی', asset: 'irr', amount: 50000, date: J.today(), due: null, note: '', settles: [] });
      s.tx.push({ id: 'o1', created: 1, type: 'expense', amount: 100000, date: '1405/07/01', time: '', cat: 'سایر', account: a.id, note: '' });
      s.tx.push({ id: 'o2', created: 2, type: 'transfer', amount: 20000, date: '1405/07/02', time: '', cat: '', account: a.id, note: '' });
      s.tx.push({ id: 'o3', created: 3, type: 'transfer', amount: 50000, date: '1405/07/02', time: '', cat: '', account: a.id, note: '', debt: 'od' });
      App.save(); App.render(); })()""")
    check('legacy: manual anchor w/o time counts all its tx; old transfer = out, old receivable = in', bal('کارآفرین') == 1000000 - 100000 - 20000 + 50000, bal('کارآفرین'))
    pg.reload(); wait(500)
    check('persists after reload', bal('کارآفرین') == 930000 and bal('بلوبانک') == 470000000)

    # ۱۱) ارزش خالص از موجودی زنده
    nw = pg.evaluate('App.bankTotal()')
    check('bank total in net worth uses live balances', nw == sum(max(0, pg.evaluate('a => App.curBal(a)', a) or 0) for a in S()['accounts'] if a['kind'] != 'credit'))
    # ۱۲) تنظیمات: ورودی موجودی = موجودی فعلی
    pg.click('[data-act=goset]'); wait()
    check('settings input shows live balance', fa(pg.input_value(f'[data-accbal="{blu}"]')).replace('٬', '') == '47000000')
    for w in (320,):
        pg.set_viewport_size({'width': w, 'height': 800}); pg.click('[data-tab=home]'); wait(200)
        o = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth'); check(f'home {w}: no horizontal scroll', o <= 0, o)

    check('no page errors', not errors, errors)
    b.close()

print(f'\n{len(passed)} passed, {len(failed)} failed')
sys.exit(1 if failed else 0)
