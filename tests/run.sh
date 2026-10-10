#!/bin/bash
# همه‌ی تست‌ها: هسته‌ها و دستیار قیمت (node) + end-to-end بخش مالی، سرمایه، رابط و قیمت خودکار (Playwright)
cd "$(dirname "$0")/.."
node tests/core.test.js || exit 1
node tests/invest.test.js || exit 1
node tests/feed.test.js || exit 1
python3 tests/css_check.py index.html || exit 1
python3 -m http.server 8767 >/dev/null 2>&1 & SRV=$!
sleep 1
python3 tests/e2e_fi.py; A=$?
python3 tests/e2e_inv.py; B=$?
python3 tests/e2e_ux.py; U=$?
python3 tests/e2e_auto.py; P=$?
python3 tests/e2e_debt.py; D=$?
python3 tests/e2e_bal.py; L=$?
python3 tests/e2e_inc.py; I=$?
python3 tests/audit.py; X=$?
kill $SRV; exit $(( A || B || U || P || D || L || I || X ))
