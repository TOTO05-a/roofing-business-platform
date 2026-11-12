import baseConfig from '@roofing/config/eslint';

export default [
  ...baseConfig,
  { ignores: ['**/dist/**', '**/.astro/**', '**/coverage/**', '**/node_modules/**', '.claude/**'] },
];
