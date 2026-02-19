const importPlugin = require('eslint-plugin-import');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        Chart: 'readonly',
        Tesseract: 'readonly',
        supabase: 'readonly',
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-constant-binary-expression': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'import/no-duplicates': 'error',
    },
  },
];
