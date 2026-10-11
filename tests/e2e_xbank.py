"""تست end-to-end نسخه‌ی ۱۱: حقوق تتری به صرافی + صرافی ↔ بانک + پیامک همون واریز دوباره ثبت نمی‌شه"""
import re
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8767/index.html'
passed, failed = [], []
def check(name, cond, info=''):
    (passed if cond else failed).append(name)
    if not cond: print('  FAIL:', name, info)
fa = lambda s: re.sub('[۰-۹]', lambda m: str(ord(m.group()) - 1776), s).replace('٬', '').replace(',', '')
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
    bal = lambda: pg.evaluate("Core.accountBalance(window.__vault.state, window.__vault.state.accounts.find(a => a.id === 'B1')).balance")
    usdt = lambda: pg.evaluate("V.replay(window.__vault.state).H.L1.usdt || 0")
    cf_in = lambda: pg.evaluate("Core.cashFlow(window.__vault.state, Core.ym(J.today()), J.today()).in")
    pg.goto(BASE); pg.wait_for_load_state('networkidle'); wait()
    pg.evaluate("""(() => { const s = window.__vault.state, t = J.today();
      s.locations = [{ id: 'L1', name: 'والکس' }]; s.ops = []; s.tx = []; s.incomes = [];
      s.prices = [{ date: t, usdt: 10500000, usd: 10400000, gold: 100000000 }];
      s.accounts = s.accounts.filter(a => a.kind === 'credit').concat([{ id: 'B1', kind: 'bank', bank: 'بلو', name: 'بلوبانک', num: '', balance: 500000000, stamp: J.addDays(t, -1) + ' 10:00', at: Date.now() - 5000 }]);
      window.App.save(); window.App.render(); })()"""); wait()

    # ۱) درآمد ثابت با «دارایی، تتر به والکس»
    hub('newincome')
    pg.fill('#iname', 'حقوق'); pg.fill('.sheet [name=iamount]', '150000000')
    d = pg.evaluate('J.jParse(J.today()).d'); pg.fill('#iday', str(d))
    check('income form: asset section hidden by default', pg.is_hidden('#iassetwrap'))
    pg.click('#iform input[value=asset]'); wait(150)
    check('income form: asset section shown, bank account hidden', pg.is_visible('#iassetwrap') and pg.is_hidden('#iaccwrap'))
    check('income form: defaults usdt & والکس', pg.eval_on_selector('#iasset', 'e => e.value') == 'usdt' and pg.eval_on_selector('#iloc', 'e => e.value') == 'L1')
    pg.click('#isave'); closed()
    inc = S()['incomes'][0]
    check('income saved with asset/loc, no bank account', inc.get('asset') == 'usdt' and inc.get('loc') == 'L1' and inc.get('account') == '' and inc['amount'] == 1500000000, inc)
    check('income card shows «به‌صورت تتر»', 'به‌صورت تتر' in pg.inner_text('.cards'))

    # ۲) ثبت دریافت از خانه: مقدار تتر رو می‌پرسه (پیش‌فرض با قیمت امروز)
    pg.click('[data-tab=home]'); wait(); pg.evaluate("document.querySelectorAll('details.fold').forEach(d => d.open = true)"); wait(150)
    pg.click('.ob.inc:has-text("حقوق") .tick'); wait(500)
    check('tick opens salary sheet', pg.query_selector('.sheet [name=sq]') is not None)
    guess = fa(pg.eval_on_selector('.sheet [name=sq]', 'e => e.value')).replace('٫', '.')
    check('qty guessed from today price (≈142.85)', guess.startswith('142.85'), guess)
    pg.fill('.sheet [name=sq]', '143'); wait(100)
    check('rate summary shown', 'نرخ هر' in pg.inner_text('#ssum'))
    pg.click('#ssave'); closed()
    st = S(); op = [o for o in st['ops'] if o['type'] == 'salary']; tx = [t for t in st['tx'] if t.get('op')]
    check('salary op: 143 USDT into والکس, cost = 150M toman', len(op) == 1 and op[0]['in'] == {'a': 'usdt', 'q': 143000000} and op[0]['cost'] == 1500000000 and op[0]['loc'] == 'L1', op)
    check('salary tx: income, no bank account, linked to income', len(tx) == 1 and tx[0]['type'] == 'income' and tx[0]['account'] == '' and tx[0]['link']['id'] == inc['id'] and tx[0]['amount'] == 1500000000, tx)
    check('income marked received', any(v.get('txId') == tx[0]['id'] for v in st['incomes'][0]['paid'].values()))
    check('«آمد» includes salary value once', cf_in() == 1500000000, cf_in())
    check('bank balance untouched', bal() == 500000000, bal())
    check('USDT in والکس = 143', usdt() == 143000000)

    # ۳) صرافی ↔ بانک: فروش ۱۰۰ تتر و واریز به بلو
    hub('xbank'); pg.click('.sheet [data-xb="0"]'); wait(500)
    check('xbank sell: usdt + to-bank + بلوبانک preselected', pg.eval_on_selector('[name=asset]', 'e => e.value') == 'usdt' and pg.is_checked('[name=dst][value=ext]') and pg.eval_on_selector('[name=bank]', 'e => e.value') == 'B1')
    pg.fill('.sheet [name=q1]', '100'); pg.fill('.sheet [name=amt]', '105000000'); wait(100)
    pg.click('#save'); closed()
    st = S(); sell = [o for o in st['ops'] if o['type'] == 'sell'][0]; btx = [t for t in st['tx'] if t.get('op') == sell['id']]
    check('sell op linked to bank tx', sell.get('bank') == 'B1' and len(btx) == 1 and sell.get('tx') == btx[0]['id'], (sell, btx))
    check('bank tx = transfer into بلو', btx and btx[0]['type'] == 'transfer' and btx[0]['to'] == 'B1' and btx[0]['account'] == '' and btx[0]['amount'] == 1050000000, btx)
    check('bank balance up by 105M toman', bal() == 1550000000, bal())
    check('USDT left = 43', usdt() == 43000000, usdt())
    check('cash flow «آمد» unchanged (not income)', cf_in() == 1500000000, cf_in())
    check('lastBank remembered', st['settings'].get('lastBank') == 'B1')

    # ۴) پیامک همون واریز: تراکنش تکراری ساخته نمی‌شه، فقط لنگر موجودی
    n_tx = len(st['tx'])
    pg.click('[data-tab=home]'); pg.click('[data-act=paste]'); wait()
    dd = pg.evaluate('J.today()').replace('/', '.')
    pg.evaluate('t => { document.querySelector("#smstext").value = t }', f'بلو\nواریز پول\nعزیز، 1,050,000,000 ریال به حساب شما نشست.\nموجودی: 1,560,000,000 ریال\n۱۴:۱۰\n{dd}')
    answers.append(True); pg.click('#parse'); wait(500)
    st = S(); btx2 = [t for t in st['tx'] if t.get('op') == sell['id']][0]
    check('sms: no new tx', len(st['tx']) == n_tx, len(st['tx']))
    check('sms: linked tx marked sms with time', btx2.get('sms') is True and btx2.get('time') == '14:10', btx2)
    check('sms: anchor = sms balance', bal() == 1560000000 and [a for a in st['accounts'] if a['id'] == 'B1'][0]['balance'] == 1560000000, bal())
    check('no sheet left open', not pg.query_selector('.overlay'))

    # ۵) برگرداندن دریافت حقوق وقتی بخشی از تترش فروخته شده: جلوش گرفته می‌شه
    pg.evaluate("document.querySelectorAll('details.fold').forEach(d => d.open = true)"); wait(150)
    pg.click('.ob.inc:has-text("حقوق") .tick'); wait(400)
    check('unreceive blocked while USDT already sold', len([o for o in S()['ops'] if o['type'] == 'salary']) == 1)

    # ۶) تراکنش بانکیِ ساخته‌شده از عملیات → فرم همون عملیات باز می‌شه؛ حذف عملیات = حذف تراکنش
    pg.click('[data-tab=tx]'); wait(); pg.click(f'[data-act=edit][data-id="{btx2["id"]}"]'); wait(500)
    check('editing linked tx opens op form', pg.query_selector('.sheet #save') is not None and pg.query_selector('.sheet [name=bank]') is not None)
    answers.append(True); pg.click('#del'); closed()
    st = S()
    check('deleting op removes its bank tx', not any(t.get('op') == sell['id'] for t in st['tx']) and not any(o['type'] == 'sell' for o in st['ops']))

    # ۷) برداشت ریال به بانک: واریز به بلو، و بدون حساب = فقط دفتر سرمایه
    pg.evaluate("""(() => { const s = window.__vault.state; s.ops.push({ id: 'dep0', created: Date.now(), date: J.today(), type: 'deposit', loc: 'L1', in: { a: 'irr', q: 300000000 }, cost: 300000000, note: '' });
      window.App.save(); window.App.render(); })()"""); wait()
    b0 = bal()
    hub('xbank'); pg.click('.sheet [data-xb="1"]'); wait(500)
    pg.fill('.sheet [name=amt]', '20000000'); pg.click('#save'); closed()
    check('withdraw to bank: balance +20M toman', bal() == b0 + 200000000, (b0, bal()))
    hub('xbank'); pg.click('.sheet [data-xb="1"]'); wait(500)
    pg.select_option('.sheet [name=bank]', ''); pg.fill('.sheet [name=amt]', '1000000'); pg.click('#save'); closed()
    check('withdraw without bank: balance unchanged', bal() == b0 + 200000000, bal())

    # ۸) برگرداندن دریافت حقوق (بعد از حذف فروش): عملیات و تراکنش هر دو حذف
    pg.click('[data-tab=home]'); wait(); pg.evaluate("document.querySelectorAll('details.fold').forEach(d => d.open = true)"); wait(150)
    answers.append(True); pg.click('.ob.inc:has-text("حقوق") .tick'); wait(400)
    st = S()
    check('unreceive: salary op + tx removed, income pending', not any(o['type'] == 'salary' for o in st['ops']) and not any(t.get('type') == 'income' and t.get('op') for t in st['tx']) and not st['incomes'][0]['paid'], st['incomes'][0]['paid'])
    check('unreceive: «آمد» back to assumed salary', cf_in() == 1500000000)
    check('no console errors', not errors, errors)
    b.close()
print(f'\n{len(passed)} passed, {len(failed)} failed')
raise SystemExit(1 if failed else 0)
