"""تست end-to-end نسخه‌ی ۱۰: واریز بی‌پیوندِ حقوق یک بار حساب می‌شه؛ تأیید = پیوند واقعی، رد = جدا"""
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
    pg.on('dialog', lambda d: d.accept() if answers.pop(0) else d.dismiss())
    S = lambda: pg.evaluate('JSON.parse(JSON.stringify(window.__vault.state))')
    wait = lambda ms=350: pg.wait_for_timeout(ms)
    pg.goto(BASE); pg.wait_for_load_state('networkidle'); wait()
    pg.evaluate("""(() => { const s = window.__vault.state, t = J.today(), d = J.jParse(t).d;
      s.incomes.push({ id: 'inc1', name: 'حقوق شرکت', amount: 300000000, day: d, cat: 'حقوق', paid: {} });
      s.tx.push({ id: 'dep1', created: Date.now(), type: 'income', amount: 300000000, date: t, time: '', cat: 'حقوق', account: '', note: 'واریز' });
      window.App.save(); window.App.render(); })()"""); wait()
    hero = fa(pg.inner_text('.fl.in'))
    check('home: unlinked salary deposit counted once in «آمد»', '30000000' in hero and '60000000' not in hero, hero)
    pg.evaluate("document.querySelectorAll('details.fold').forEach(d => d.open = true)"); wait(150)
    row = pg.query_selector('.ob.inc:has-text("حقوق شرکت")')
    check('home: income row marked received, auto-detected note', row is not None and 'paid' in row.get_attribute('class') and 'خودکار' in row.inner_text(), row and row.inner_text())
    pg.evaluate("window.App.go('rep')"); wait()
    check('report: DTI & savings shown', 'نسبت بدهی به درآمد' in pg.inner_text('.kpis') and 'نرخ پس‌انداز' in pg.inner_text('.kpis'))
    pg.evaluate("window.App.go('home')"); wait(); pg.evaluate("document.querySelectorAll('details.fold').forEach(d => d.open = true)"); wait(150)
    # تأیید → پیوند واقعی
    answers.append(True); pg.click('.ob.inc:has-text("حقوق شرکت") .tick'); wait()
    st = S(); t = [x for x in st['tx'] if x['id'] == 'dep1'][0]; inc = [x for x in st['incomes'] if x['id'] == 'inc1'][0]
    check('confirm: deposit linked to income, marked paid with txId', t.get('link', {}).get('id') == 'inc1' and any(v.get('txId') == 'dep1' for v in inc['paid'].values()), (t, inc['paid']))
    check('confirm: still counted once', '60000000' not in fa(pg.inner_text('.fl.in')))
    # برگرداندن پیوند (تراکنش دستی حذف نمی‌شه) و بعد «رد»
    pg.evaluate("""(() => { const s = window.__vault.state, i = s.incomes.find(x => x.id === 'inc1'); for (const k in i.paid) delete i.paid[k];
      delete s.tx.find(x => x.id === 'dep1').link; window.App.save(); window.App.render(); })()"""); wait(); pg.evaluate("document.querySelectorAll('details.fold').forEach(d => d.open = true)"); wait(150)
    answers.append(False); pg.click('.ob.inc:has-text("حقوق شرکت") .tick'); wait()
    st = S(); t = [x for x in st['tx'] if x['id'] == 'dep1'][0]
    check('reject: deposit flagged noMatch, kept as plain income', t.get('noMatch') is True and 'link' not in t)
    check('reject: income back to expected (counted separately)', '60000000' in fa(pg.inner_text('.fl.in')), pg.inner_text('.fl.in'))
    check('no console errors', not errors, errors)
    b.close()
print(f'\n{len(passed)} passed, {len(failed)} failed')
raise SystemExit(1 if failed else 0)
