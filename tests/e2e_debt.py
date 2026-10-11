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

    # ۳) تسویه‌ی جزئی به دارایی — نسخه‌ی ۱۲: «ثبت دریافت» فرم یکپارچه‌ی واریز (دریافت طلب) رو باز می‌کنه
    def settle_form(person): open_debt(person); pg.click('#settle'); wait(700)
    settle_form('علی')
    check('settle form: «دریافت طلب» with this receivable, gold, remaining 5 g', pg.get_attribute('#twhy [data-w=collect]', 'aria-pressed') == 'true' and pg.input_value('#tdebt') != ''
          and pg.get_attribute('#tasset [data-a=gold]', 'aria-pressed') == 'true' and pg.input_value('.sheet [name=amount]') == '۵')
    check('settle form: account defaults to where that asset is kept', pg.input_value('#acc') == 'home1', pg.input_value('#acc'))
    pg.fill('.sheet [name=amount]', '2'); wait(150)
    check('settle form: summary shows what is deducted and what remains', '۲ گرم' in pg.inner_text('#tsum') and '۳ گرم' in pg.inner_text('#tsum'), pg.inner_text('#tsum'))
    pg.click('#savetx'); closed()
    st = S(); d = next(x for x in st['debts'] if x['person'] == 'علی'); op = next((o for o in st['ops'] if o.get('debt') == d['id']), None)
    check('settle to asset: recv op (collect) linked to debt, cost = value that day', op and op['type'] == 'recv' and op['why'] == 'collect' and op['in'] == {'a': 'gold', 'q': 2000} and op['cost'] == 2 * 244012000 and op['loc'] == 'home1', op)
    check('settle: record keeps opId, remaining 3g', d['settles'][0]['opId'] == op['id'] and d['settles'][0]['amount'] == 2000 and d['amount'] - 2000 == 3000)
    hold = pg.evaluate("V.replay(window.__vault.state).H.home1.gold")
    check('asset ledger: خانه now 12 g gold', hold == 12000, hold)
    check('remembers account choice', st['settings'].get('debtAcc') == {'other': 'home1'}, st['settings'].get('debtAcc'))
    check('settlement is not income', pg.evaluate("Core.cashFlow(window.__vault.state, Core.ym(J.today()), J.today()).in") == 0)
    pg.click('[data-tab=inv]'); wait(100); pg.click('[data-act=invt][data-t=ops]'); wait(250)
    check('ops list: labeled «دریافت طلب»', 'دریافت طلب' in pg.inner_text('#view'))
    pg.click(f'[data-act=editop][data-id="{op["id"]}"]'); wait(500)
    check('linked op opens in the same form for editing', pg.get_attribute('#twhy [data-w=collect]', 'aria-pressed') == 'true' and 'ویرایش' in pg.inner_text('.sheet-head h2'))
    pg.click('[data-close]'); closed()

    # ۴) بقیه «بدون حساب» = فقط ثبت (به هیچ حسابی اضافه نمی‌شه)
    settle_form('علی'); pg.select_option('#acc', ''); wait(150)
    check('«no account» explains record-only', 'فقط ثبت' in pg.inner_text('#have'))
    pg.click('#savetx'); closed()
    st = S(); d = next(x for x in st['debts'] if x['person'] == 'علی')
    t2 = next(t for t in st['tx'] if t['id'] == d['settles'][1].get('txId'))
    check('fully settled, no new op (record-only tx with asset)', d.get('closed') and len([o for o in st['ops'] if o.get('debt') == d['id']]) == 1 and 'opId' not in d['settles'][1]
          and t2['asset'] == 'gold' and t2['qty'] == 3000 and t2['account'] == '' and t2['why'] == 'collect', (d, t2))
    check('record-only: ledger unchanged (12 g)', pg.evaluate("V.replay(window.__vault.state).H.home1.gold") == 12000)
    # برگرداندن تسویه‌ی اول → عملیات دارایی هم حذف
    debts(); pg.click('.fold summary'); wait(150); pg.click('.card.debt:has-text("علی")'); wait(400)
    pg.click('[data-undo="0"]'); wait(700)
    st = S(); d = next(x for x in st['debts'] if x['person'] == 'علی')
    check('undo settle removes its asset op and reopens', not any(o.get('debt') for o in st['ops']) and not d.get('closed') and len(d['settles']) == 1, d)
    pg.keyboard.press('Escape'); wait(300)
    if pg.query_selector('.overlay'): pg.click('[data-close]'); closed()

    # ۵) بدهی دلاری: دارایی کافی نیست → خطا؛ «بدون حساب» کار می‌کنه
    new_debt('owe', 'رضا', 'usd', '100')
    d = next(x for x in S()['debts'] if x['person'] == 'رضا')
    check('usd debt stored in cents', d['asset'] == 'usd' and d['amount'] == 10000)
    check('totals: debt valued', pg.evaluate('App.debtTotals().owe') == 100 * 2448000)
    settle_form('رضا')
    check('pay form: «پرداخت بدهی», dollars', pg.get_attribute('#twhy [data-w=repay]', 'aria-pressed') == 'true' and pg.get_attribute('#tasset [data-a=usd]', 'aria-pressed') == 'true')
    pg.select_option('#acc', 'home1'); wait(150)
    check('live check: not enough USD in خانه', 'کافی نیست' in pg.inner_text('#terr'))
    pg.click('#savetx'); wait(300)
    check('pay from location without USD → clear error, nothing saved', 'کافی نیست' in toast() and not next(x for x in S()['debts'] if x['person'] == 'رضا')['settles'])
    pg.select_option('#acc', ''); wait(150); pg.fill('.sheet [name=amount]', '40'); pg.click('#savetx'); closed()
    d = next(x for x in S()['debts'] if x['person'] == 'رضا')
    check('partial usd payment recorded (40$ of 100$)', d['settles'][0]['amount'] == 4000 and not d.get('closed'))
    card = pg.inner_text('.card.debt:has-text("رضا")')
    check('list: remaining 60 dollars and progress text', '۶۰' in card and 'تسویه شده' in card, card)
    # پرداخت از دارایی با موجودی کافی (طلا)
    new_debt('owe', 'مریم', 'gold', '1.5')
    settle_form('مریم'); pg.select_option('#acc', 'home1'); wait(150); pg.click('#savetx'); closed()
    hold = pg.evaluate("V.replay(window.__vault.state).H.home1.gold")
    st = S(); op = next(o for o in st['ops'] if o.get('debt'))
    check('pay gold debt from asset: send (repay), ledger 10 → 8.5 g', op['type'] == 'send' and op['why'] == 'repay' and op['out'] == {'a': 'gold', 'q': 1500} and hold == 8500, (op, hold))
    # پرداخت بدهی دلاری با تومان از بانک: با قیمت روز به دلار تبدیل می‌شه
    pg.evaluate("(() => { const s = window.__vault.state; if (!s.accounts.some(a => a.id === 'BK')) s.accounts.push({ id: 'BK', kind: 'bank', bank: 'بلو', name: 'بلوبانک تست', num: '', balance: 500000000, stamp: '', at: 1 }); App.save(); })()")
    settle_form('رضا'); pg.select_option('#acc', 'BK'); wait(150); pg.click('#tasset [data-a=irr]'); wait(150); pg.fill('.sheet [name=amount]', '2448000'); wait(200)
    check('cross-asset: summary converts toman to dollars', '۱۰' in pg.inner_text('#tsum') and 'دلار' in pg.inner_text('#tsum'), pg.inner_text('#tsum'))
    pg.click('#savetx'); closed()
    d = next(x for x in S()['debts'] if x['person'] == 'رضا')
    check('cross-asset: 2,448,000 toman settles 10 dollars', d['settles'][-1]['amount'] == 1000 and d['amount'] - sum(x['amount'] for x in d['settles']) == 5000, d['settles'])
    check('cross-asset: bank balance −2,448,000 toman', pg.evaluate("Core.accountBalance(window.__vault.state, window.__vault.state.accounts.find(a => a.id === 'BK')).balance") == 500000000 - 24480000)

    # ۶) بدون قیمت
    new_debt('owed', 'سارا', 'btc', '0.01')
    d = next(x for x in S()['debts'] if x['person'] == 'سارا')
    check('btc stored in satoshi', d['amount'] == 1000000)
    card = pg.inner_text('.card.debt:has-text("سارا")')
    check('no price: shown as «بدون قیمت», excluded from totals with note', 'بدون قیمت' in card and 'قیمت نداره' in pg.inner_text('#view') and pg.evaluate('App.debtTotals().unpriced') == 1, card)
    settle_form('سارا'); pg.select_option('#acc', 'home1'); wait(150)
    check('no price: value hint asks for a manual value', 'قیمتی' in pg.inner_text('#valhint'))
    pg.click('#savetx'); wait(300)
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
    settle_form('حسن'); pg.select_option('#acc', ''); pg.click('#savetx'); closed()
    check('toman settle creates transfer tx', any(t.get('debt') == d['id'] and t['type'] == 'transfer' for t in S()['tx']))

    # ۸) اکسل
    pg.click('[data-tab=home]'); pg.click('[data-tab=rep]'); wait()
    with pg.expect_download(timeout=60000) as dl: pg.click('[data-act=excel]')
    dl.value.save_as('/tmp/vd.xlsx'); rows = list(openpyxl.load_workbook('/tmp/vd.xlsx')['بدهی و طلب'].iter_rows(values_only=True))
    r = {x[1]: x for x in rows[1:]}
    check('excel: unit column and human quantities', rows[0][2] == 'واحد' and r['رضا'][2] == 'دلار' and r['رضا'][3] == 100 and r['رضا'][4] == 50 and r['رضا'][5] == 50 and r['رضا'][6] == 50 * 2448000, r.get('رضا'))
    check('excel: gold 5 g, btc 0.01', r['علی'][3] == 5 and r['سارا'][3] == 0.01 and r['سارا'][6] in ('', None), (r.get('علی'), r.get('سارا')))

    # ۹) بکاپ قدیمی بدون واحد
    pg.evaluate("localStorage.setItem('vault-v1', JSON.stringify({v:2, settings:{unit:'toman'}, debts:[{id:'x',dir:'owe',person:'قدیمی',amount:5000000,date:'1405/01/01'},{id:'y',dir:'owed',person:'خراب',amount:10,date:'1405/01/01',asset:'<b>'}]}))")
    pg.reload(); wait(500)
    st = S()
    check('old backup: debts default to toman; unknown unit → toman', [x['asset'] for x in st['debts']] == ['irr', 'irr'] and all(isinstance(x['settles'], list) for x in st['debts']))
    check('no page errors', not errors, errors)
    b.close()
print(f'\n{len(passed)} passed, {len(failed)} failed'); sys.exit(1 if failed else 0)
