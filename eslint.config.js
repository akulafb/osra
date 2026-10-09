import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh.plugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Program:has(ImportDeclaration[source.value='@react-three/drei'] > ImportSpecifier[imported.name='Line'][local.name='Line']) JSXOpeningElement[name.name='Line'] > JSXAttribute[name.name='visible']",
          message:
            "Don't pass `visible` to drei's <Line>: it lands on the material too. Unmount the line, set opacity or material visibility through a ref, or toggle a wrapping <group visible>.",
        },
        {
          selector:
            "ImportDeclaration[source.value='@react-three/drei'] > ImportSpecifier[imported.name='Line'][local.name!='Line']",
          message:
            "Import drei's Line under its own name, with no `as`, so the rule against its `visible` prop can see it.",
        },
      ],
    },
  },
);
