"""بررسی سلامت CSS: خط‌های یتیم و تعادل آکولادها (پس‌رفت ادغام نسخه‌ی ۲)"""
import sys
html = open(sys.argv[1] if len(sys.argv) > 1 else 'index.html', encoding='utf-8').read()
css = html[html.index('<style>') + 7:html.index('</style>')]
depth, bad = 0, []
for n, line in enumerate(css.split('\n'), 1):
    t = line.strip()
    if depth == 0 and t and not t.startswith('/*') and '{' not in t and not t.startswith('}') and not t.startswith('@'): bad.append(n)
    depth += line.count('{') - line.count('}')
    if depth < 0: bad.append(n); depth = 0
import re
# کلمه‌های حالت‌نما (روی عناصر مختلف به‌عنوان modifier میان) نباید بدون محدوده پس‌زمینه/رنگ بدن
# باگ نسخه‌ی ۴: قانون «.inc» نمودار، ردیف‌های درآمد «پیش رو» رو سرمه‌ای کرد
STATE = ['inc', 'out', 'in', 'on', 'ok', 'bad', 'warn', 'good', 'late', 'paid', 'sel', 'empty', 'income', 'expense', 'credit', 'done', 'open']
risky = []
for m in re.finditer(r'(?:^|\n|\})\s*([^{}@/]+)\{([^}]*)\}', css):
    sel, body = m.group(1), m.group(2)
    if 'background' not in body: continue
    for part in sel.split(','):
        p = part.strip()
        if re.fullmatch(r'\.(%s)' % '|'.join(STATE), p): risky.append(p)
if bad or depth or risky: print('CSS BROKEN at lines', bad, 'depth', depth, 'unscoped state-class rules:', risky); sys.exit(1)
print('css: ok')
