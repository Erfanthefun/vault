"""تست end-to-end بدهی و طلب به هر واحد دارایی (طلا، دلار، بیت‌کوین، …) و تسویه به/از دفتر سرمایه"""
import sys, openpyxl
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
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, accept_downloads=True)
    pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    S = lambda: pg.evaluate('JSON.parse(JSON.stringify(window.__vault.state))')
    wait = lambda ms=350: pg.wait_for_timeout(ms)
    def closed(): pg.wait_for_function('!document.querySelector(".overlay")'); wait(150)
    def debts(): pg.click('[data-tab=ob]'); wait(100); pg.click('[data-act=obt][data-t=debt]'); wait(200)
    def toast(): pg.wait_for_function("document.querySelector('#toast') && document.querySelector('#toast').innerText.trim()"); return pg.inner_text('#toast')
    def new_debt(direction, person, asset, qty):
        debts(); pg.click(f'[data-act=newdebt][data-dir={direction}] >> nth=-1'); wait(400)
        pg.fill('#dperson', person); pg.click(f'#dasset [data-a={asset}]')
        if asset == 'irr': pg.fill('.sheet [name=damount]', qty)
        else: pg.fill('#dqty', qty)
        pg.click('#dsave'); closed()
    def open_debt(person): debts(); pg.click(f'.card.debt:has-text("{person}")'); wait(400)

    pg.goto(BASE); wait(500)
    # قیمت و یک محل با ۱۰ گرم طلا
    pg.evaluate("""(()=>{const s=window.__vault.state; s.prices.push({date:J.today(),gold:244012000,silver:5140100,usd:2448000,eur:2783800,usdt:2480500});
      s.locations.push({id:'home1',name:'خانه'}); s.ops.push({id:'op0',created:1,date:J.addDays(J.today(),-3),type:'open',loc:'home1',in:{a:'gold',q:10000},cost:2400000000});
      window.App.save(); window.App.render();})()""")

    # ۱) فرم: ۸ واحد
    debts(); pg.click('[data-act=newdebt][data-dir=owed] >> nth=-1'); wait(400)
    chips = pg.query_selector_all('#dasset [data-a]')
    check('form: 8 units (toman + 7 assets)', [c.get_attribute('data-a') for c in chips] == ['irr', 'gold', 'bar', 'silver', 'usd', 'eur', 'usdt', 'btc'])
    check('form: toman by default shows amount field', pg.is_visible('.sheet [name=damount]') and not pg.is_visible('#dqty'))
    pg.click('#dasset [data-a=gold]')
    check('form: gold switches to quantity in grams', pg.is_visible('#dqty') and 'گرم' in pg.inner_text('#dqlbl') and not pg.is_visible('.sheet [name=damount]'))
    for w in (320,):
        pg.set_viewport_size({'width': w, 'height': 800}); wait(150)
        o = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth'); check(f'form {w}: no horizontal scroll (chips wrap)', o <= 0, o)
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.fill('#dperson', 'علی'); pg.fill('#dqty', '۵'); pg.click('#dsave'); closed()
    d = next(x for x in S()['debts'] if x['person'] == 'علی')
    check('save: gold receivable stored in milligrams', d['asset'] == 'gold' and d['amount'] == 5000 and d['dir'] == 'owed', d)

    # ۲) نمایش و جمع‌ها با ارزش امروز
    card = pg.inner_text('.card.debt:has-text("علی")')
    check('list: shows grams and ≈ toman value', '۵ گرم' in card and '≈' in card and '۱۲۲٬۰۰۶٬۰۰۰' in card, card)
    check('list: note about valuation by today price', 'قیمت امروز' in pg.inner_text('#view'))
    check('totals: receivable valued at today price (rial)', pg.evaluate('App.debtTotals().owed') == 5 * 244012000)
    pg.click('[data-tab=home]'); wait(200)
    check('home: debt/receivable box uses value', '۱۲۲٬۰۰۶٬۰۰۰' in pg.inner_text('#view'))

    # ۳) تسویه‌ی جزئی به دارایی
    open_debt('علی')
    check('detail: quantity field prefilled with remaining', pg.input_value('#sqty') == '5' and pg.is_visible('#smode'))
    check('detail: «to my assets» default when a location exists', 'on' in pg.get_attribute('#smode [data-m=asset]', 'class') and pg.is_visible('#sloc'))
    pg.fill('#sqty', '2'); pg.select_option('#sloc', 'home1'); pg.click('#settle'); closed()
    st = S(); d = next(x for x in st['debts'] if x['person'] == 'علی'); op = next((o for o in st['ops'] if o.get('debt') == d['id']), None)
    check('settle to asset: gift_in op linked to debt, cost = value that day', op and op['type'] == 'gift_in' and op['in'] == {'a': 'gold', 'q': 2000} and op['cost'] == 2 * 244012000 and op['loc'] == 'home1', op)
    check('settle: record keeps opId, remaining 3g', d['settles'][0]['opId'] == op['id'] and d['settles'][0]['amount'] == 2000 and d['amount'] - 2000 == 3000)
    hold = pg.evaluate("V.replay(window.__vault.state).H.home1.gold")
    check('asset ledger: خانه now 12 g gold', hold == 12000, hold)
    check('remembers choice', st['settings']['debtSettle'] == {'mode': 'asset', 'loc': 'home1'}, st['settings'].get('debtSettle'))
    pg.click('[data-tab=inv]'); wait(100); pg.click('[data-act=invt][data-t=ops]'); wait(250)
    check('ops list: labeled «دریافت طلب»', 'دریافت طلب' in pg.inner_text('#view'))
    pg.click(f'[data-act=editop][data-id="{op["id"]}"]'); wait(300)
    check('linked op cannot be edited from ops list', not pg.query_selector('.overlay') and 'بدهی و طلب' in toast())

    # ۴) بقیه با «فقط ثبت»
    open_debt('علی'); pg.click('#smode [data-m=none]'); wait(100)
    check('«only record» hides location', not pg.is_visible('#sloc'))
    pg.click('#settle'); closed()
    st = S(); d = next(x for x in st['debts'] if x['person'] == 'علی')
    check('fully settled, no new op', d.get('closed') and len([o for o in st['ops'] if o.get('debt') == d['id']]) == 1 and 'opId' not in d['settles'][1])
    # برگرداندن تسویه‌ی اول → عملیات دارایی هم حذف
    debts(); pg.click('.fold summary'); wait(150); pg.click('.card.debt:has-text("علی")'); wait(400)
    pg.click('[data-undo="0"]'); wait(700)
    st = S(); d = next(x for x in st['debts'] if x['person'] == 'علی')
    check('undo settle removes its asset op and reopens', not any(o.get('debt') for o in st['ops']) and not d.get('closed') and len(d['settles']) == 1, d)
    pg.keyboard.press('Escape'); wait(300)
    if pg.query_selector('.overlay'): pg.click('[data-close]'); closed()

    # ۵) بدهی دلاری: دارایی کافی نیست → خطا؛ «فقط ثبت» کار می‌کنه
    new_debt('owe', 'رضا', 'usd', '100')
    d = next(x for x in S()['debts'] if x['person'] == 'رضا')
    check('usd debt stored in cents', d['asset'] == 'usd' and d['amount'] == 10000)
    check('totals: debt valued', pg.evaluate('App.debtTotals().owe') == 100 * 2448000)
    open_debt('رضا'); pg.click('#smode [data-m=asset]'); pg.select_option('#sloc', 'home1'); pg.click('#settle'); wait(300)
    check('pay from location without USD → clear error, nothing saved', 'نداری' in toast() and not S()['debts'][-1]['settles'])
    pg.click('#smode [data-m=none]'); pg.fill('#sqty', '40'); pg.click('#settle'); closed()
    d = next(x for x in S()['debts'] if x['person'] == 'رضا')
    check('partial usd payment recorded (40$ of 100$)', d['settles'][0]['amount'] == 4000 and not d.get('closed'))
    card = pg.inner_text('.card.debt:has-text("رضا")')
    check('list: remaining 60 dollars and progress text', '۶۰' in card and 'تسویه شده' in card, card)
    # پرداخت از دارایی با موجودی کافی (طلا)
    new_debt('owe', 'مریم', 'gold', '1.5')
    open_debt('مریم'); pg.click('#smode [data-m=asset]'); pg.select_option('#sloc', 'home1'); pg.click('#settle'); closed()
    hold = pg.evaluate("V.replay(window.__vault.state).H.home1.gold")
    st = S(); op = next(o for o in st['ops'] if o.get('debt'))
    check('pay gold debt from asset: gift_out, ledger 10 → 8.5 g', op['type'] == 'gift_out' and op['out'] == {'a': 'gold', 'q': 1500} and hold == 8500, (op, hold))

    # ۶) بدون قیمت
    new_debt('owed', 'سارا', 'btc', '0.01')
    d = next(x for x in S()['debts'] if x['person'] == 'سارا')
    check('btc stored in satoshi', d['amount'] == 1000000)
    card = pg.inner_text('.card.debt:has-text("سارا")')
    check('no price: shown as «بدون قیمت», excluded from totals with note', 'بدون قیمت' in card and 'قیمت نداره' in pg.inner_text('#view') and pg.evaluate('App.debtTotals().unpriced') == 1, card)
    open_debt('سارا'); pg.click('#smode [data-m=asset]'); pg.select_option('#sloc', 'home1'); pg.click('#settle'); wait(300)
    check('receive btc into asset without price → asks for price', 'قیمت' in toast() and not next(x for x in S()['debts'] if x['person'] == 'سارا')['settles'])
    pg.click('[data-close]'); closed()

    # ۷) عوض کردن واحد وقتی تسویه داره → ممنوع
    open_debt('رضا'); pg.click('#dedit'); wait(500)
    pg.click('#dasset [data-a=irr]'); pg.fill('.sheet [name=damount]', '1000'); pg.click('#dsave'); wait(300)
    check('unit change blocked when settles exist', 'واحدش' in toast() and next(x for x in S()['debts'] if x['person'] == 'رضا')['asset'] == 'usd')
    pg.click('[data-close] >> nth=-1'); wait(300)
    if pg.query_selector('.overlay'): pg.click('[data-close]'); closed()
    # بدهی تومانی قدیمی مثل قبل
    new_debt('owe', 'حسن', 'irr', '2000000')
    d = next(x for x in S()['debts'] if x['person'] == 'حسن')
    check('toman debt unchanged (rial, transfer tx on settle)', d['asset'] == 'irr' and d['amount'] == 20000000)
    open_debt('حسن'); pg.click('#settle'); closed()
    check('toman settle creates transfer tx', any(t.get('debt') == d['id'] and t['type'] == 'transfer' for t in S()['tx']))

    # ۸) اکسل
    pg.click('[data-tab=home]'); pg.click('[data-tab=rep]'); wait()
    with pg.expect_download(timeout=60000) as dl: pg.click('[data-act=excel]')
    dl.value.save_as('/tmp/vd.xlsx'); rows = list(openpyxl.load_workbook('/tmp/vd.xlsx')['بدهی و طلب'].iter_rows(values_only=True))
    r = {x[1]: x for x in rows[1:]}
    check('excel: unit column and human quantities', rows[0][2] == 'واحد' and r['رضا'][2] == 'دلار' and r['رضا'][3] == 100 and r['رضا'][4] == 40 and r['رضا'][5] == 60 and r['رضا'][6] == 60 * 2448000, r.get('رضا'))
    check('excel: gold 5 g, btc 0.01', r['علی'][3] == 5 and r['سارا'][3] == 0.01 and r['سارا'][6] in ('', None), (r.get('علی'), r.get('سارا')))

    # ۹) بکاپ قدیمی بدون واحد
    pg.evaluate("localStorage.setItem('vault-v1', JSON.stringify({v:2, settings:{unit:'toman'}, debts:[{id:'x',dir:'owe',person:'قدیمی',amount:5000000,date:'1405/01/01'},{id:'y',dir:'owed',person:'خراب',amount:10,date:'1405/01/01',asset:'<b>'}]}))")
    pg.reload(); wait(500)
    st = S()
    check('old backup: debts default to toman; unknown unit → toman', [x['asset'] for x in st['debts']] == ['irr', 'irr'] and all(isinstance(x['settles'], list) for x in st['debts']))
    check('no page errors', not errors, errors)
    b.close()
print(f'\n{len(passed)} passed, {len(failed)} failed'); sys.exit(1 if failed else 0)
