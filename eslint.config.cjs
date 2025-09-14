// Minimal flat config for monorepo
module.exports = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    plugins: {},
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'off'
    }
  }
];

