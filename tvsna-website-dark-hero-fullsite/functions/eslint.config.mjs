
// eslint.config.mjs — ESLint 9, JS + TS, ESM
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  // Ignore outputs and deps
  { ignores: ['node_modules/**', 'lib/**', 'dist/**'] },

  // Base JS recommended rules
  eslint.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Apply settings/rules to JS and TS
  {
    files: ['**/*.{js,ts,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',      // change to 'commonjs' if you use require/module.exports
      parser: tseslint.parser,   // TS-aware parsing (safe even if some files are JS)
      globals: globals.node,
    },
    rules: {
           // Prefer TS-aware unused-vars check when TS is present
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  }]
