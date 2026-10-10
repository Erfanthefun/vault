// اجرا: npm i -D eslint@9 globals@15 && npx eslint -c tests/eslint.config.js core.js invest.js invest-ui.js app.js tools/fetch-prices.js
const globals = require('globals');
module.exports = [{ files: ['**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'script',
  globals: { ...globals.browser, Core: 'readonly', J: 'readonly', V: 'readonly', App: 'readonly', XLSX: 'readonly', module: 'readonly', require: 'readonly', globalThis: 'readonly' } },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }], 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'no-redeclare': 'error', 'use-isnan': 'error', 'no-fallthrough': 'error' } },
  { files: ['tools/**/*.js'], languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, J: 'readonly', V: 'readonly' } } }];
